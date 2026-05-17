// ═══════════════════════════════════════════════════════════════════
// Cron Runner — logic gửi email tự động
//
// Dùng được bởi:
//   1. Vercel Cron (api/cron/daily.js) — chạy 8h sáng VN mỗi ngày
//   2. POST /api/candidates — gửi luôn email D-X đã tới hạn cho ứng viên mới
//   3. GET /api/dashboard/stats — lazy trigger nếu > 1h chưa chạy
// ═══════════════════════════════════════════════════════════════════
const store = require('./store');
const timeline = require('./timeline');
const { sendEmail } = require('./email');
const { todayStr } = require('./helpers');
const kv = require('./kv');

const K_LAST_CRON = 'data:last_cron_run';

async function getLastCronRun() {
  return (await kv.get(K_LAST_CRON)) || null;
}

async function setLastCronRun(info) {
  await kv.set(K_LAST_CRON, { ...info, at: new Date().toISOString() });
}

async function getDeptEmails() {
  const s = await store.getSettings();
  return {
    dept_hcns_email: s.dept_hcns_email,
    dept_it_mynth_email: s.dept_it_mynth_email,
    dept_it_hungnx_email: s.dept_it_hungnx_email,
    dept_cb_phuongth_email: s.dept_cb_phuongth_email
  };
}

// Gửi 1 email — common logic
async function sendOne(candidate, email) {
  if (!email.receiver) {
    const err = email.email_type === 'department' ? 'Bộ phận chưa cấu hình email' : 'Ứng viên thiếu email';
    await store.setStateItem(candidate.id, 'email', email.template_key, { status: 'failed', error: err });
    return { ok: false, error: err };
  }
  try {
    await sendEmail({
      to: email.receiver,
      cc: email.email_type === 'candidate' ? (candidate.manager_email || undefined) : undefined,
      subject: email.subject,
      body: email.body
    });
    await store.setStateItem(candidate.id, 'email', email.template_key, {
      sent: true,
      sent_date: new Date().toISOString(),
      status: 'sent',
      error: null
    });
    // Auto-sync dept_orders.email_sent
    const orderKeyMap = { E2: 'O1', E3: 'O2', E4: 'O3', E5: 'O4' };
    const ok = orderKeyMap[email.template_key];
    if (ok) {
      const cur = (await store.getStateItem(candidate.id, 'order', ok)) || {};
      await store.setStateItem(candidate.id, 'order', ok, {
        ...cur,
        email_sent: true,
        email_sent_date: new Date().toISOString()
      });
    }
    return { ok: true };
  } catch (err) {
    await store.setStateItem(candidate.id, 'email', email.template_key, {
      status: 'failed', error: err.message
    });
    return { ok: false, error: err.message };
  }
}

// Run cron cho 1 candidate cụ thể (dùng khi vừa tạo ứng viên)
// onlyDue=true: chỉ gửi email scheduled_date <= today
async function runForCandidate(candidate, { onlyDue = true } = {}) {
  if (candidate.status !== 'active') return { ok: true, sent: 0, results: [] };
  const today = todayStr();
  const dept = await getDeptEmails();
  const templates = await store.getEffectiveTemplates();
  const state = await store.getState(candidate.id);
  const emails = timeline.generateEmails(candidate, dept, templates);
  const results = [];
  let sent = 0;
  for (const e of emails) {
    const s = state[`email:${e.template_key}`];
    if (s?.sent) continue;
    if (onlyDue && e.scheduled_date && e.scheduled_date > today) continue;
    const r = await sendOne(candidate, e);
    results.push({ key: e.template_key, ...r });
    if (r.ok) sent++;
  }
  return { ok: true, sent, results };
}

// Run cron cho TẤT CẢ candidates — quét email scheduled_date = today
async function runForAll({ source = 'manual' } = {}) {
  const today = todayStr();
  const dept = await getDeptEmails();
  const templates = await store.getEffectiveTemplates();
  const cands = await store.listCandidates();
  let due = 0, sent = 0, failed = 0;
  const results = [];
  for (const c of cands) {
    if (c.status !== 'active') continue;
    const state = await store.getState(c.id);
    const emails = timeline.generateEmails(c, dept, templates);
    for (const e of emails) {
      const s = state[`email:${e.template_key}`];
      if (e.scheduled_date !== today || s?.sent) continue;
      due++;
      const r = await sendOne(c, e);
      if (r.ok) sent++; else failed++;
      results.push({ candidate: c.full_name, key: e.template_key, ...r });
    }
  }
  await setLastCronRun({ source, today, due, sent, failed });
  return { ok: true, today, due, sent, failed, results };
}

// Lazy trigger: chạy nếu lần cuối > maxAgeMs
async function triggerIfStale({ maxAgeMs = 3600 * 1000, source = 'lazy' } = {}) {
  const last = await getLastCronRun();
  const today = todayStr();
  // Nếu đã chạy hôm nay rồi và chưa stale → skip
  if (last && last.today === today && last.at) {
    const age = Date.now() - new Date(last.at).getTime();
    if (age < maxAgeMs) return { ok: true, skipped: true, lastRun: last };
  }
  return await runForAll({ source });
}

module.exports = {
  runForCandidate,
  runForAll,
  triggerIfStale,
  getLastCronRun,
  sendOne
};
