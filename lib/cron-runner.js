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
const K_LAST_REMINDER = 'data:last_reminder_run';

async function getLastCronRun() {
  return (await kv.get(K_LAST_CRON)) || null;
}

async function setLastCronRun(info) {
  await kv.set(K_LAST_CRON, { ...info, at: new Date().toISOString() });
}

async function getLastReminderRun() {
  return (await kv.get(K_LAST_REMINDER)) || null;
}

async function setLastReminderRun(info) {
  await kv.set(K_LAST_REMINDER, { ...info, at: new Date().toISOString() });
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
    // Auto-sync dept_orders.email_sent (M2→O1, M3→O2, M9→O4, M10→O3)
    const orderKeyMap = { M2: ['O1'], M3: ['O2'], M9: ['O4'], M10: ['O3'] };
    const orderKeys = orderKeyMap[email.template_key];
    if (orderKeys) {
      const now = new Date().toISOString();
      for (const ok of orderKeys) {
        const cur = (await store.getStateItem(candidate.id, 'order', ok)) || {};
        await store.setStateItem(candidate.id, 'order', ok, {
          ...cur,
          email_sent: true,
          email_sent_date: cur.email_sent_date || now
        });
      }
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
  const approved = !!(state['approval:gate'] && state['approval:gate'].approved);
  const results = [];
  let sent = 0;
  for (const e of emails) {
    const s = state[`email:${e.template_key}`];
    if (s?.sent) continue;
    if (e.priority > 1 && !approved) continue; // chờ DUYỆT mới gửi email order
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
    const approved = !!(state['approval:gate'] && state['approval:gate'].approved);
    for (const e of emails) {
      const s = state[`email:${e.template_key}`];
      if (e.scheduled_date !== today || s?.sent) continue;
      if (e.priority > 1 && !approved) continue; // chờ DUYỆT mới gửi email order
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

// ═══════════════════════════════════════════════════════════════════
// NHẮC DEADLINE — gửi 1 email tổng hợp các email tới hạn HÔM NAY
// Chạy 8h sáng VN (1 tiếng trước giờ tự gửi 9h sáng).
// Chia 3 nhóm: cần DUYỆT / thiếu người nhận / sẽ tự động gửi.
// ═══════════════════════════════════════════════════════════════════
const APP_URL = 'https://apero-onboarding.vercel.app';

// Định dạng ngày ISO "2026-06-18" → { dd:'18', mon:'TH6', full:'Thứ Năm, 18/06/2026' }
function fmtDateParts(iso) {
  const MON = ['TH1','TH2','TH3','TH4','TH5','TH6','TH7','TH8','TH9','TH10','TH11','TH12'];
  const DOW = ['Chủ Nhật','Thứ Hai','Thứ Ba','Thứ Tư','Thứ Năm','Thứ Sáu','Thứ Bảy'];
  const d = new Date(iso + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return { dd, mon: MON[d.getMonth()], full: `${DOW[d.getDay()]}, ${dd}/${mm}/${d.getFullYear()}` };
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildReminderEmail({ today, willSend, needApproval, missing }) {
  const total = willSend.length + needApproval.length + missing.length;
  const dt = fmtDateParts(today);

  // ── Plain-text fallback ──
  const lines = [`Chào bạn,`, '', `Hôm nay (${dt.full}) có ${total} email onboarding tới hạn. Hệ thống sẽ tự động gửi sau khoảng 1 tiếng nữa (9h sáng).`, ''];
  if (needApproval.length) {
    lines.push(`[CẦN DUYỆT] (${needApproval.length}) — sẽ KHÔNG tự gửi cho tới khi bạn bấm DUYỆT:`);
    needApproval.forEach(r => lines.push(`   - ${r.candidate} — ${r.subject} (tới: ${r.receiver_label || r.receiver || '—'})`));
    lines.push('');
  }
  if (missing.length) {
    lines.push(`[THIẾU EMAIL NGƯỜI NHẬN] (${missing.length}):`);
    missing.forEach(r => lines.push(`   - ${r.candidate} — ${r.subject} (${r.receiver_label || 'chưa có người nhận'})`));
    lines.push('');
  }
  if (willSend.length) {
    lines.push(`[SẼ TỰ ĐỘNG GỬI] (${willSend.length}):`);
    willSend.forEach(r => lines.push(`   - ${r.candidate} — ${r.subject} → ${r.receiver}`));
    lines.push('');
  }
  lines.push(`Mở tool để kiểm tra / duyệt: ${APP_URL}`);

  // ── HTML dạng thẻ (kiểu Luma) ──
  const section = (color, bg, icon, title, rows, renderRight) => `
    <tr><td style="padding:18px 24px 6px">
      <div style="font-size:13px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.4px">${icon} ${esc(title)} (${rows.length})</div>
    </td></tr>
    ${rows.map(r => `
    <tr><td style="padding:6px 24px">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${bg};border-radius:10px">
        <tr>
          <td style="padding:12px 16px">
            <div style="font-size:15px;font-weight:600;color:#111827">${esc(r.candidate)}</div>
            <div style="font-size:13px;color:#4b5563;margin-top:2px">${esc(r.subject)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px">${renderRight(r)}</div>
          </td>
        </tr>
      </table>
    </td></tr>`).join('')}`;

  const sections = [];
  if (needApproval.length) sections.push(section('#b45309', '#fffbeb', '⚠️', 'Cần bạn duyệt', needApproval,
    r => `Bị khóa tới khi DUYỆT · tới: <b>${esc(r.receiver_label || r.receiver || '—')}</b>`));
  if (missing.length) sections.push(section('#b91c1c', '#fef2f2', '❗', 'Thiếu email người nhận', missing,
    r => `Cần bổ sung email · ${esc(r.receiver_label || 'chưa có người nhận')}`));
  if (willSend.length) sections.push(section('#15803d', '#f0fdf4', '✅', 'Sẽ tự động gửi', willSend,
    r => `→ ${esc(r.receiver)}`));

  const orange = '#f5a623';
  const html = `
  <div style="background:#f3f4f6;padding:24px 0;font-family:Arial,'Helvetica Neue',sans-serif">
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb">
      <tr><td style="padding:28px 24px 8px;text-align:center">
        <div style="font-size:34px;line-height:1">⏰</div>
        <div style="font-size:22px;font-weight:800;color:#111827;margin-top:8px">${total} email tới hạn hôm nay</div>
        <div style="font-size:15px;color:#9ca3af;margin-top:2px">Hệ thống sẽ tự động gửi trong <b style="color:#6b7280">1 tiếng nữa</b></div>
      </td></tr>
      <tr><td style="padding:14px 24px 4px">
        <table cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;text-align:center;width:54px;padding:6px 0">
              <div style="font-size:11px;font-weight:700;color:${orange}">${dt.mon}</div>
              <div style="font-size:22px;font-weight:800;color:#111827;line-height:1">${dt.dd}</div>
            </td>
            <td style="padding-left:14px;font-size:14px;color:#374151;font-weight:600">${esc(dt.full)}</td>
          </tr>
        </table>
      </td></tr>
      ${sections.join('')}
      <tr><td style="padding:20px 24px 28px;text-align:center">
        <a href="${APP_URL}" style="display:inline-block;background:${orange};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:999px">Mở tool kiểm tra / duyệt →</a>
      </td></tr>
    </table>
  </div>`;

  const flag = needApproval.length ? `${needApproval.length} CẦN DUYỆT • ` : '';
  const subject = `⏰ [APERO Onboarding] ${flag}${total} email tới hạn hôm nay`;
  return { subject, body: lines.join('\n'), html };
}

// Gom email tới hạn hôm nay của tất cả ứng viên active, gửi 1 email nhắc.
async function sendDueReminders({ source = 'cron' } = {}) {
  const settings = await store.getSettings();
  if (settings.reminder_enabled === false) {
    return { ok: true, skipped: true, reason: 'Đã tắt nhắc nhở trong Cài Đặt' };
  }
  const to = settings.reminder_email;
  if (!to) {
    return { ok: true, skipped: true, reason: 'Chưa cấu hình email nhận nhắc nhở trong Cài Đặt' };
  }

  const today = todayStr();
  const dept = await getDeptEmails();
  const templates = await store.getEffectiveTemplates();
  const cands = await store.listCandidates();

  const willSend = [];      // sẽ tự động gửi
  const needApproval = [];  // chưa duyệt → bị khóa
  const missing = [];       // thiếu email người nhận

  for (const c of cands) {
    if (c.status !== 'active') continue;
    const state = await store.getState(c.id);
    const approved = !!(state['approval:gate'] && state['approval:gate'].approved);
    const emails = timeline.generateEmails(c, dept, templates);
    for (const e of emails) {
      const s = state[`email:${e.template_key}`];
      if (e.scheduled_date !== today || s?.sent) continue;
      const row = {
        candidate: c.full_name,
        key: e.template_key,
        subject: e.subject,
        receiver: e.receiver,
        receiver_label: e.receiver_label
      };
      if (e.priority > 1 && !approved) needApproval.push(row);
      else if (!e.receiver) missing.push(row);
      else willSend.push(row);
    }
  }

  const totalDue = willSend.length + needApproval.length + missing.length;
  if (totalDue === 0) {
    await setLastReminderRun({ source, today, totalDue: 0, sent: false });
    return { ok: true, today, totalDue: 0, sent: false, reason: 'Hôm nay không có email tới hạn' };
  }

  const { subject, body, html } = buildReminderEmail({ today, willSend, needApproval, missing });
  try {
    await sendEmail({ to, subject, body, html });
    await setLastReminderRun({ source, today, totalDue, needApproval: needApproval.length, sent: true });
    return { ok: true, today, totalDue, needApproval: needApproval.length, sent: true, to };
  } catch (err) {
    await setLastReminderRun({ source, today, totalDue, sent: false, error: err.message });
    return { ok: false, error: err.message };
  }
}

module.exports = {
  runForCandidate,
  runForAll,
  triggerIfStale,
  getLastCronRun,
  sendOne,
  sendDueReminders,
  getLastReminderRun
};
