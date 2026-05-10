// ═══════════════════════════════════════════════════════════════════
// Express App — shared cho local dev (server-v2.js) lẫn Vercel (api/[...].js)
// Không gọi app.listen() ở đây.
// ═══════════════════════════════════════════════════════════════════
const express = require('express');
const path = require('path');
const store = require('./store');
const tmpl = require('./templates');
const timeline = require('./timeline');
const { addDays, todayStr, renderTemplate, buildVars } = require('./helpers');
const { sendEmail } = require('./email');

const FORM_LINK = tmpl.FORM_LINK;

const app = express();
app.use(express.json({ limit: '2mb' }));

// No-cache cho HTML/JS/CSS
app.use((req, res, next) => {
  if (/\.(html|js|css)$|^\/$/.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// Static files (cho local dev — Vercel sẽ serve thẳng từ public/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ─── Helpers ───
async function deptEmailsFromSettings() {
  const s = await store.getSettings();
  return {
    dept_hcns_email: s.dept_hcns_email,
    dept_it_mynth_email: s.dept_it_mynth_email,
    dept_it_hungnx_email: s.dept_it_hungnx_email,
    dept_cb_phuongth_email: s.dept_cb_phuongth_email
  };
}

// Merge state vào generated email object
async function emailWithState(email, state) {
  const k = `email:${email.template_key}`;
  const s = state[k] || {};
  return {
    ...email,
    id: `${email.candidate_id}-${email.template_key}`,
    sent: s.sent ? 1 : 0,
    sent_date: s.sent_date || null,
    status: s.status || 'pending',
    error: s.error || null
  };
}

async function orderWithState(order, state) {
  const k = `order:${order.order_key}`;
  const s = state[k] || {};
  return {
    ...order,
    id: `${order.candidate_id}-${order.order_key}`,
    email_sent: s.email_sent ? 1 : 0,
    email_sent_date: s.email_sent_date || null,
    processed: s.processed ? 1 : 0,
    processed_date: s.processed_date || null,
    note: s.note || ''
  };
}

async function checklistWithState(item, state) {
  const k = `checklist:${item.item_index}`;
  const s = state[k] || {};
  return {
    ...item,
    id: `${item.candidate_id}-c${item.item_index}`,
    is_done: s.is_done ? 1 : 0,
    done_at: s.done_at || null,
    note: s.note || ''
  };
}

async function followupWithState(q, state) {
  const k = `followup:${q.question_index}`;
  const s = state[k] || {};
  return {
    ...q,
    id: `${q.candidate_id}-f${q.question_index}`,
    response: s.response || '',
    asked: s.asked ? 1 : 0,
    asked_date: s.asked_date || null
  };
}

// Parse composite id "1-E1" → { candidateId, key }
function parseCompositeId(id, prefix = '') {
  const s = String(id);
  const dashIdx = s.indexOf('-');
  if (dashIdx < 0) return null;
  const candidateId = parseInt(s.slice(0, dashIdx), 10);
  let key = s.slice(dashIdx + 1);
  if (prefix && key.startsWith(prefix)) key = key.slice(prefix.length);
  return { candidateId, key };
}

// ═══════════════════════════════════════════════════════════════════
// CANDIDATES
// ═══════════════════════════════════════════════════════════════════
app.get('/api/candidates', async (req, res) => {
  try {
    const list = await store.listCandidates();
    // Tính tiến độ
    const enriched = await Promise.all(list.map(async c => {
      const state = await store.getState(c.id);
      const emails = timeline.generateEmails(c, {});
      const checklist = timeline.generateChecklist(c);
      let sent = 0, done = 0;
      for (const e of emails) if (state[`email:${e.template_key}`]?.sent) sent++;
      for (const it of checklist) if (state[`checklist:${it.item_index}`]?.is_done) done++;
      return {
        ...c,
        total_emails: emails.length,
        sent_emails: sent,
        total_tasks: checklist.length,
        done_tasks: done
      };
    }));
    enriched.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/candidates/:id', async (req, res) => {
  try {
    const c = await store.getCandidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/candidates', async (req, res) => {
  try {
    const b = req.body;
    if (!b.full_name || !b.personal_email || !b.start_date) {
      return res.status(400).json({ error: 'Thiếu họ tên / email / ngày đi làm' });
    }
    const c = await store.addCandidate(b);
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/candidates/:id', async (req, res) => {
  try {
    const c = await store.updateCandidate(req.params.id, req.body);
    if (!c) return res.status(404).json({ error: 'Not found' });
    res.json(c);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/candidates/:id', async (req, res) => {
  try {
    const ok = await store.deleteCandidate(req.params.id);
    res.json({ ok });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// EMAILS / ORDERS / CHECKLIST / FOLLOWUP — generated on the fly
// ═══════════════════════════════════════════════════════════════════
app.get('/api/candidates/:id/emails', async (req, res) => {
  try {
    const c = await store.getCandidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const dept = await deptEmailsFromSettings();
    const state = await store.getState(c.id);
    const emails = timeline.generateEmails(c, dept);
    const out = await Promise.all(emails.map(e => emailWithState(e, state)));
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/candidates/:id/orders', async (req, res) => {
  try {
    const c = await store.getCandidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const state = await store.getState(c.id);
    const orders = timeline.generateOrders(c);
    const out = await Promise.all(orders.map(o => orderWithState(o, state)));
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/candidates/:id/checklist', async (req, res) => {
  try {
    const c = await store.getCandidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const state = await store.getState(c.id);
    const list = timeline.generateChecklist(c);
    const out = await Promise.all(list.map(it => checklistWithState(it, state)));
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/candidates/:id/followups', async (req, res) => {
  try {
    const c = await store.getCandidate(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    const state = await store.getState(c.id);
    const list = timeline.generateFollowups(c);
    const out = await Promise.all(list.map(q => followupWithState(q, state)));
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// EMAILS — all (across candidates)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/emails', async (req, res) => {
  try {
    const cands = await store.listCandidates();
    const dept = await deptEmailsFromSettings();
    const all = [];
    for (const c of cands) {
      const state = await store.getState(c.id);
      const emails = timeline.generateEmails(c, dept);
      for (const e of emails) {
        const m = await emailWithState(e, state);
        m.full_name = c.full_name;
        m.personal_email = c.personal_email;
        all.push(m);
      }
    }
    let filtered = all;
    if (req.query.status) filtered = filtered.filter(e => e.status === req.query.status);
    if (req.query.email_type) filtered = filtered.filter(e => e.email_type === req.query.email_type);
    if (req.query.milestone) filtered = filtered.filter(e => e.milestone === req.query.milestone);
    filtered.sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || ''));
    res.json(filtered);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lấy 1 email theo composite id "1-E1"
async function findEmail(id) {
  const parsed = parseCompositeId(id);
  if (!parsed) return null;
  const c = await store.getCandidate(parsed.candidateId);
  if (!c) return null;
  const dept = await deptEmailsFromSettings();
  const emails = timeline.generateEmails(c, dept);
  const e = emails.find(x => x.template_key === parsed.key);
  if (!e) return null;
  const state = await store.getState(c.id);
  return { email: await emailWithState(e, state), candidate: c };
}

app.get('/api/emails/:id', async (req, res) => {
  try {
    const found = await findEmail(req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    res.json(found.email);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/emails/:id/preview', async (req, res) => {
  try {
    const found = await findEmail(req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    const e = found.email;
    res.json({ subject: e.subject, body: e.body, receiver: e.receiver, receiver_label: e.receiver_label });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/emails/:id', async (req, res) => {
  try {
    const found = await findEmail(req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    const { sent } = req.body;
    if (sent !== undefined) {
      await store.setStateItem(found.candidate.id, 'email', found.email.template_key, {
        sent: !!sent,
        sent_date: sent ? new Date().toISOString() : null,
        status: sent ? 'sent' : 'pending'
      });
    }
    const updated = await findEmail(req.params.id);
    res.json(updated.email);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/emails/:id/send', async (req, res) => {
  try {
    const found = await findEmail(req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    const { email: e, candidate: c } = found;

    if (!e.receiver) {
      const err = e.email_type === 'department'
        ? 'Bộ phận chưa cấu hình email — vào Cài Đặt'
        : 'Ứng viên thiếu email';
      await store.setStateItem(c.id, 'email', e.template_key, { status: 'failed', error: err });
      return res.status(400).json({ error: err });
    }

    try {
      await sendEmail({
        to: e.receiver,
        cc: e.email_type === 'candidate' ? (c.manager_email || undefined) : undefined,
        subject: e.subject,
        body: e.body
      });
      await store.setStateItem(c.id, 'email', e.template_key, {
        sent: true,
        sent_date: new Date().toISOString(),
        status: 'sent',
        error: null
      });
      const orderKeyMap = { E2: 'O1', E3: 'O2', E4: 'O3', E5: 'O4' };
      const ok = orderKeyMap[e.template_key];
      if (ok) {
        const cur = (await store.getStateItem(c.id, 'order', ok)) || {};
        await store.setStateItem(c.id, 'order', ok, {
          ...cur,
          email_sent: true,
          email_sent_date: new Date().toISOString()
        });
      }
      res.json({ ok: true });
    } catch (sendErr) {
      await store.setStateItem(c.id, 'email', e.template_key, {
        status: 'failed', error: sendErr.message
      });
      res.status(500).json({ error: sendErr.message });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// ORDERS — all
// ═══════════════════════════════════════════════════════════════════
app.get('/api/orders', async (req, res) => {
  try {
    const cands = await store.listCandidates();
    const all = [];
    for (const c of cands) {
      const state = await store.getState(c.id);
      const orders = timeline.generateOrders(c);
      for (const o of orders) {
        const m = await orderWithState(o, state);
        m.full_name = c.full_name;
        m.start_date = c.start_date;
        all.push(m);
      }
    }
    let filtered = all;
    if (req.query.receiver) filtered = filtered.filter(o => o.receiver.includes(req.query.receiver));
    if (req.query.status === 'pending') filtered = filtered.filter(o => !o.processed);
    if (req.query.status === 'processed') filtered = filtered.filter(o => o.processed);
    filtered.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));
    res.json(filtered);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const parsed = parseCompositeId(req.params.id);
    if (!parsed) return res.status(404).json({ error: 'Not found' });
    const cur = (await store.getStateItem(parsed.candidateId, 'order', parsed.key)) || {};
    const { email_sent, processed, note } = req.body;
    const next = { ...cur };
    if (email_sent !== undefined) {
      next.email_sent = !!email_sent;
      if (email_sent && !cur.email_sent_date) next.email_sent_date = new Date().toISOString();
    }
    if (processed !== undefined) {
      next.processed = !!processed;
      if (processed && !cur.processed_date) next.processed_date = new Date().toISOString();
    }
    if (note !== undefined) next.note = note;
    await store.setStateItem(parsed.candidateId, 'order', parsed.key, next);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// CHECKLIST
// ═══════════════════════════════════════════════════════════════════
app.put('/api/checklist/:id', async (req, res) => {
  try {
    const parsed = parseCompositeId(req.params.id, 'c');
    if (!parsed) return res.status(404).json({ error: 'Not found' });
    const cur = (await store.getStateItem(parsed.candidateId, 'checklist', parsed.key)) || {};
    const { is_done, note } = req.body;
    const next = { ...cur };
    if (is_done !== undefined) {
      next.is_done = !!is_done;
      next.done_at = is_done ? new Date().toISOString() : null;
    }
    if (note !== undefined) next.note = note;
    await store.setStateItem(parsed.candidateId, 'checklist', parsed.key, next);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// FOLLOWUP
// ═══════════════════════════════════════════════════════════════════
app.put('/api/followups/:id', async (req, res) => {
  try {
    const parsed = parseCompositeId(req.params.id, 'f');
    if (!parsed) return res.status(404).json({ error: 'Not found' });
    const cur = (await store.getStateItem(parsed.candidateId, 'followup', parsed.key)) || {};
    const { response, asked } = req.body;
    const next = { ...cur };
    if (response !== undefined) next.response = response;
    if (asked !== undefined) {
      next.asked = !!asked;
      if (asked && !cur.asked_date) next.asked_date = new Date().toISOString();
    }
    await store.setStateItem(parsed.candidateId, 'followup', parsed.key, next);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// EMAIL TEMPLATES (read-only — code-based, không sửa qua web)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/email-templates', (req, res) => {
  const list = tmpl.EMAIL_TEMPLATES.map(t => ({
    template_key: t.key,
    milestone: t.milestone,
    email_type: t.email_type,
    day_offset: t.day_offset,
    receiver_field: t.receiver_field || null,
    receiver_setting: t.receiver_setting || null,
    receiver_label: t.receiver_label,
    subject: t.subject,
    body: t.body
  }));
  res.json(list);
});

app.get('/api/email-templates/:key', (req, res) => {
  const t = tmpl.EMAIL_TEMPLATES.find(x => x.key === req.params.key);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json({
    template_key: t.key,
    milestone: t.milestone,
    email_type: t.email_type,
    day_offset: t.day_offset,
    receiver_field: t.receiver_field || null,
    receiver_setting: t.receiver_setting || null,
    receiver_label: t.receiver_label,
    subject: t.subject,
    body: t.body
  });
});

app.post('/api/email-templates/:key/preview', async (req, res) => {
  const t = tmpl.EMAIL_TEMPLATES.find(x => x.key === req.params.key);
  if (!t) return res.status(404).json({ error: 'Not found' });
  const { candidate_id, subject, body } = req.body;
  let c;
  if (candidate_id) c = await store.getCandidate(candidate_id);
  if (!c) c = {
    full_name: 'Nguyễn Thu Hiền', job_title: 'UI/UX Designer',
    department: 'Apero Headquarters', manager_name: 'Trần Quốc Hùng',
    level: 'OX2', personal_email: 'thuhien@example.com',
    phone: '0901234567', start_date: '2026-05-15'
  };
  const vars = buildVars(c);
  res.json({
    subject: renderTemplate(subject || t.subject, vars),
    body: renderTemplate(body || t.body, vars)
  });
});

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const today = todayStr();
    const cands = await store.listCandidates();
    const dept = await deptEmailsFromSettings();

    let totalCandidates = 0;
    let todayEmails = 0;
    let pendingOrders = 0;
    let overdueChecks = 0;
    const upcoming = [];
    const todayEmailQueue = [];
    const overdueOrders = [];

    for (const c of cands) {
      if (c.status === 'active') totalCandidates++;
      const state = await store.getState(c.id);

      // emails
      const emails = timeline.generateEmails(c, dept);
      for (const e of emails) {
        const sentState = state[`email:${e.template_key}`];
        if (e.scheduled_date === today && !sentState?.sent) {
          todayEmails++;
          todayEmailQueue.push({
            ...e,
            id: `${c.id}-${e.template_key}`,
            full_name: c.full_name
          });
        }
      }

      // orders
      const orders = timeline.generateOrders(c);
      for (const o of orders) {
        const oState = state[`order:${o.order_key}`];
        if (!oState?.processed) {
          pendingOrders++;
          overdueOrders.push({
            ...o,
            id: `${c.id}-${o.order_key}`,
            full_name: c.full_name,
            email_sent: oState?.email_sent ? 1 : 0,
            processed: oState?.processed ? 1 : 0
          });
        }
      }

      // checklist overdue
      const checklist = timeline.generateChecklist(c);
      for (const it of checklist) {
        const s = state[`checklist:${it.item_index}`];
        if (it.deadline && it.deadline < today && !s?.is_done) overdueChecks++;
      }

      // upcoming 7 days
      if (c.start_date && c.start_date >= today) {
        const diff = Math.floor((new Date(c.start_date) - new Date(today)) / 86400000);
        if (diff <= 7) {
          let done = 0;
          for (const it of checklist) if (state[`checklist:${it.item_index}`]?.is_done) done++;
          upcoming.push({
            ...c,
            total_tasks: checklist.length,
            done_tasks: done
          });
        }
      }
    }

    upcoming.sort((a, b) => a.start_date.localeCompare(b.start_date));
    overdueOrders.sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''));

    res.json({
      totalCandidates,
      todayEmails,
      pendingOrders,
      overdueChecks,
      upcoming,
      todayEmailQueue,
      overdueOrders: overdueOrders.slice(0, 20)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/settings', async (req, res) => {
  try {
    const s = await store.getSettings();
    if (s.smtp_pass) s.smtp_pass = '••••••••';
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    await store.updateSettings(req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/test-email', async (req, res) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Thiếu email nhận' });
    const settings = await store.getSettings();
    await sendEmail({
      to,
      subject: '[APERO] Test Email',
      body: `Email test từ APERO Onboarding. Nhận được = SMTP OK ✅\n\n${settings.email_signature || ''}`
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// DOCS
// ═══════════════════════════════════════════════════════════════════
app.get('/api/docs', (req, res) => {
  res.json({
    forms: [
      { label: '📄 Form thông tin nhân sự', purpose: 'Thu thập dữ liệu thông tin nhân sự', url: FORM_LINK }
    ],
    drive: [
      { label: '💌 Mẫu email chào mừng', purpose: 'Gửi ứng viên trước Onboard', url: 'https://docs.google.com/document/d/1Kb860GUeyTud0KLxtt3jqrplUpqvGjF6ExS0lCo4W4w/edit' },
      { label: '🖥 Slide hướng dẫn Onboard', purpose: 'Trình chiếu ngày đầu nhận việc (D0)', url: 'https://drive.google.com/file/d/1mUg1eATUZPelVQW6TH0s5tfzU1W2dAbm/view?usp=sharing' },
      { label: '🧠 Sổ tay nhân viên', purpose: 'Giới thiệu văn hóa công ty', url: 'https://drive.google.com/file/d/1rcOrKJ2_TOeoLFkyMhf0w8eje5DYNg1L/view?usp=sharing' },
      { label: '🧰 Mẫu order thiết bị & tài khoản', purpose: 'Quản lý thiết bị & account', url: 'https://docs.google.com/document/d/1JYSvzQTQd9s1E7jm4G0V45wjWd6yn9JXyD3B_7uBT4M/edit' }
    ],
    discord: [
      { label: '💬 Discord — Aperan News', purpose: 'Group thông báo nội bộ chung', url: 'https://discord.gg/FmpUD9VS' },
      { label: '📚 Discord — Đào tạo nội bộ', purpose: 'Group đào tạo chung', url: 'https://discord.gg/naHxqTE5' },
      { label: '👨‍💻 Discord — Apero Software', purpose: 'Group Đội Dev', url: 'https://discord.gg/XTu739pe' }
    ],
    people: [
      { role: 'HR', name: 'Bộ phận HR', responsibility: 'Đầu mối điều phối toàn bộ quy trình onboard' },
      { role: 'MyNTH (IT)', name: 'Đội IT', responsibility: 'Cấp tài khoản email công ty' },
      { role: 'HùngNX (IT)', name: 'Đội IT', responsibility: 'Cấp tài khoản Confluence' },
      { role: 'PhươngHT (C&B)', name: 'C&B', responsibility: 'Cấp tài khoản MISA + Username + Bốc dữ liệu Form' },
      { role: 'HuyềnLK', name: 'Văn phòng', responsibility: 'Hỗ trợ book phòng họp BOD (cho cấp C-Level)' },
      { role: 'HCNS / Backoffice', name: 'Hành chính', responsibility: 'Order thiết bị, vé xe, thẻ NV, setup chỗ ngồi' },
      { role: 'Quản lý trực tiếp', name: 'Theo bộ phận', responsibility: 'Bàn giao công việc, đào tạo, đánh giá thử việc' }
    ]
  });
});

// ═══════════════════════════════════════════════════════════════════
// HEALTH + SPA fallback
// ═══════════════════════════════════════════════════════════════════
app.get('/healthz', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    storage: require('./kv').mode()
  });
});

// SPA fallback (chỉ áp dụng local — Vercel xử lý qua vercel.json)
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
