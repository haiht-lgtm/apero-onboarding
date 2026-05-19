// ═══════════════════════════════════════════════════════════════════
// Express App — shared cho local dev (server.js) lẫn Vercel (api/[...].js)
// Không gọi app.listen() ở đây.
// ═══════════════════════════════════════════════════════════════════
const express = require('express');
const path = require('path');
const store = require('./store');
const tmpl = require('./templates');
const timeline = require('./timeline');
const auth = require('./auth');
const cronRunner = require('./cron-runner');
const { addDays, todayStr, renderTemplate, buildVars } = require('./helpers');
const { sendEmail } = require('./email');

const FORM_LINK = tmpl.FORM_LINK;

const app = express();
app.use(express.json({ limit: '2mb' }));

// No-cache cho HTML/JS/CSS VÀ tất cả /api/* (tránh browser cache làm data cũ vẫn hiện)
app.use((req, res, next) => {
  if (/\.(html|js|css)$|^\/$/.test(req.path) || req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ═══════════════════════════════════════════════════════════════════
// AUTH — public endpoints (1 password chung)
// ═══════════════════════════════════════════════════════════════════
app.get('/api/auth/config', (req, res) => {
  res.json({ enabled: auth.hasAuthConfig() });
});

app.get('/api/auth/me', (req, res) => {
  if (!auth.isAuthenticated(req)) return res.status(401).json({ user: null });
  res.json({ user: { name: 'HR', email: '' } }); // không có user info, chỉ session
});

app.post('/api/auth/login', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Thiếu password' });
  if (!auth.checkPassword(password)) {
    return res.status(401).json({ error: 'Sai password' });
  }
  const token = auth.createSessionToken();
  auth.setSessionCookie(res, token);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// Static files (cho local dev — Vercel serve thẳng từ public/)
app.use(express.static(path.join(__dirname, '..', 'public')));

// ═══════════════════════════════════════════════════════════════════
// Auth middleware cho tất cả /api/* còn lại
// ═══════════════════════════════════════════════════════════════════
app.use('/api', (req, res, next) => {
  // Các path public đã match ở trên, đây là protected
  if (auth.isAuthenticated(req)) return next();
  return res.status(401).json({ error: 'Unauthorized', login: '/login' });
});

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

// Check auto_done condition dựa trên state hiện tại
function checkAutoDone(item, state) {
  const cond = item.auto_done_when;
  if (!cond) return false;
  if (cond.type === 'email_sent') {
    return !!state[`email:${cond.key}`]?.sent;
  }
  if (cond.type === 'order_email') {
    return !!state[`order:${cond.key}`]?.email_sent;
  }
  if (cond.type === 'order_processed') {
    return !!state[`order:${cond.key}`]?.processed;
  }
  if (cond.type === 'all_orders_processed') {
    return (cond.keys || []).every(k => !!state[`order:${k}`]?.processed);
  }
  return false;
}

async function checklistWithState(item, state) {
  const k = `checklist:${item.item_index}`;
  const s = state[k] || {};
  const manualDone = !!s.is_done;
  const autoDone = checkAutoDone(item, state);
  const isDone = manualDone || autoDone;
  return {
    ...item,
    id: `${item.candidate_id}-c${item.item_index}`,
    is_done: isDone ? 1 : 0,
    is_skipped: s.is_skipped ? 1 : 0,
    is_auto_done: (!manualDone && autoDone) ? 1 : 0, // chỉ auto, chưa manual tick
    has_auto_rule: item.auto_done_when ? 1 : 0,
    done_at: s.done_at || null,
    skipped_at: s.skipped_at || null,
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
    const effectiveTemplates = await store.getEffectiveTemplates();
    const enriched = await Promise.all(list.map(async c => {
      const state = await store.getState(c.id);
      const emails = timeline.generateEmails(c, {}, effectiveTemplates);
      const checklist = timeline.generateChecklist(c);
      let sent = 0, done = 0, totalActiveTasks = 0;
      for (const e of emails) if (state[`email:${e.template_key}`]?.sent) sent++;
      for (const it of checklist) {
        const s = state[`checklist:${it.item_index}`];
        if (s?.is_skipped) continue;
        totalActiveTasks++;
        if (s?.is_done || checkAutoDone(it, state)) done++;
      }
      return {
        ...c,
        total_emails: emails.length,
        sent_emails: sent,
        total_tasks: totalActiveTasks,
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
    // Auto-trigger: gửi luôn email nào đã đến hạn cho ứng viên mới này
    // (chạy background, không block response)
    cronRunner.runForCandidate(c, { onlyDue: true }).catch(err => {
      console.error('[auto-send for new candidate]', err.message);
    });
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
    const effectiveTemplates = await store.getEffectiveTemplates();
    const emails = timeline.generateEmails(c, dept, effectiveTemplates);
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
    const effectiveTemplates = await store.getEffectiveTemplates();
    const all = [];
    for (const c of cands) {
      const state = await store.getState(c.id);
      const emails = timeline.generateEmails(c, dept, effectiveTemplates);
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
  const effectiveTemplates = await store.getEffectiveTemplates();
  const emails = timeline.generateEmails(c, dept, effectiveTemplates);
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

// Email ↔ Order mapping for cascade sync
const EMAIL_TO_ORDER_KEY = { E2: 'O1', E3: 'O2', E4: 'O3', E5: 'O4' };
const ORDER_TO_EMAIL_KEY = { O1: 'E2', O2: 'E3', O3: 'E4', O4: 'E5' };

app.put('/api/emails/:id', async (req, res) => {
  try {
    const found = await findEmail(req.params.id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    const { sent } = req.body;
    if (sent !== undefined) {
      const now = new Date().toISOString();
      await store.setStateItem(found.candidate.id, 'email', found.email.template_key, {
        sent: !!sent,
        sent_date: sent ? now : null,
        status: sent ? 'sent' : 'pending'
      });
      // Cascade: nếu là email E2-E5 → sync order O1-O4 email_sent
      const orderKey = EMAIL_TO_ORDER_KEY[found.email.template_key];
      if (orderKey) {
        const cur = (await store.getStateItem(found.candidate.id, 'order', orderKey)) || {};
        await store.setStateItem(found.candidate.id, 'order', orderKey, {
          ...cur,
          email_sent: !!sent,
          email_sent_date: sent ? (cur.email_sent_date || now) : null
        });
      }
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
    const now = new Date().toISOString();
    const next = { ...cur };
    if (email_sent !== undefined) {
      next.email_sent = !!email_sent;
      if (email_sent && !cur.email_sent_date) next.email_sent_date = now;
    }
    if (processed !== undefined) {
      next.processed = !!processed;
      if (processed && !cur.processed_date) next.processed_date = now;
    }
    if (note !== undefined) next.note = note;
    await store.setStateItem(parsed.candidateId, 'order', parsed.key, next);
    // Cascade: nếu order email_sent thay đổi → sync email tương ứng
    if (email_sent !== undefined) {
      const emailKey = ORDER_TO_EMAIL_KEY[parsed.key];
      if (emailKey) {
        const ec = (await store.getStateItem(parsed.candidateId, 'email', emailKey)) || {};
        await store.setStateItem(parsed.candidateId, 'email', emailKey, {
          ...ec,
          sent: !!email_sent,
          sent_date: email_sent ? (ec.sent_date || now) : null,
          status: email_sent ? 'sent' : 'pending'
        });
      }
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk update orders — body: { items: [{ id, email_sent?, processed?, note? }, ...] }
app.post('/api/orders/bulk', async (req, res) => {
  try {
    const { items = [] } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be non-empty array' });
    }
    let updated = 0;
    const errors = [];
    for (const item of items) {
      try {
        const parsed = parseCompositeId(item.id);
        if (!parsed) { errors.push({ id: item.id, error: 'Invalid id' }); continue; }
        const cur = (await store.getStateItem(parsed.candidateId, 'order', parsed.key)) || {};
        const now = new Date().toISOString();
        const next = { ...cur };
        if (item.email_sent !== undefined) {
          next.email_sent = !!item.email_sent;
          if (item.email_sent && !cur.email_sent_date) next.email_sent_date = now;
        }
        if (item.processed !== undefined) {
          next.processed = !!item.processed;
          if (item.processed && !cur.processed_date) next.processed_date = now;
        }
        if (item.note !== undefined) next.note = item.note;
        await store.setStateItem(parsed.candidateId, 'order', parsed.key, next);
        // Cascade email_sent sang email tương ứng
        if (item.email_sent !== undefined) {
          const emailKey = ORDER_TO_EMAIL_KEY[parsed.key];
          if (emailKey) {
            const ec = (await store.getStateItem(parsed.candidateId, 'email', emailKey)) || {};
            await store.setStateItem(parsed.candidateId, 'email', emailKey, {
              ...ec,
              sent: !!item.email_sent,
              sent_date: item.email_sent ? (ec.sent_date || now) : null,
              status: item.email_sent ? 'sent' : 'pending'
            });
          }
        }
        updated++;
      } catch (e) {
        errors.push({ id: item.id, error: e.message });
      }
    }
    res.json({ ok: true, updated, errors });
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
    const { is_done, is_skipped, note } = req.body;
    const next = { ...cur };
    if (is_done !== undefined) {
      next.is_done = !!is_done;
      next.done_at = is_done ? new Date().toISOString() : null;
    }
    if (is_skipped !== undefined) {
      next.is_skipped = !!is_skipped;
      next.skipped_at = is_skipped ? new Date().toISOString() : null;
    }
    if (note !== undefined) next.note = note;
    await store.setStateItem(parsed.candidateId, 'checklist', parsed.key, next);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk skip/restore nhiều items cùng lúc — body: { ids: [...], action: 'skip'|'restore'|'done' }
app.post('/api/checklist/bulk', async (req, res) => {
  try {
    const { ids = [], action } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Thiếu danh sách ids' });
    }
    if (!['skip', 'restore', 'done'].includes(action)) {
      return res.status(400).json({ error: 'action phải là skip / restore / done' });
    }
    let updated = 0;
    for (const id of ids) {
      const parsed = parseCompositeId(id, 'c');
      if (!parsed) continue;
      const cur = (await store.getStateItem(parsed.candidateId, 'checklist', parsed.key)) || {};
      const next = { ...cur };
      if (action === 'skip') {
        next.is_skipped = true;
        next.skipped_at = new Date().toISOString();
      } else if (action === 'restore') {
        next.is_skipped = false;
        next.skipped_at = null;
      } else if (action === 'done') {
        next.is_done = true;
        next.done_at = new Date().toISOString();
      }
      await store.setStateItem(parsed.candidateId, 'checklist', parsed.key, next);
      updated++;
    }
    res.json({ ok: true, updated });
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
// EMAIL TEMPLATES — defaults trong code, override lưu KV/Blob
// ═══════════════════════════════════════════════════════════════════
function toApiTemplate(t) {
  return {
    template_key: t.key,
    milestone: t.milestone,
    email_type: t.email_type,
    day_offset: t.day_offset,
    receiver_field: t.receiver_field || null,
    receiver_setting: t.receiver_setting || null,
    receiver_label: t.receiver_label,
    subject: t.subject,
    body: t.body,
    customized: !!t._customized,
    updated_at: t._updated_at || null
  };
}

app.get('/api/email-templates', async (req, res) => {
  try {
    const effective = await store.getEffectiveTemplates();
    res.json(effective.map(toApiTemplate));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/email-templates/:key', async (req, res) => {
  try {
    const effective = await store.getEffectiveTemplates();
    const t = effective.find(x => x.key === req.params.key);
    if (!t) return res.status(404).json({ error: 'Not found' });
    res.json(toApiTemplate(t));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// SỬA template — lưu override vào KV/Blob
app.put('/api/email-templates/:key', async (req, res) => {
  try {
    const { subject, body, day_offset } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'Thiếu subject hoặc body' });
    const def = tmpl.EMAIL_TEMPLATES.find(x => x.key === req.params.key);
    if (!def) return res.status(404).json({ error: 'Template không tồn tại' });
    const patch = { subject, body };
    if (day_offset !== undefined) patch.day_offset = Number(day_offset);
    await store.setTemplateOverride(req.params.key, patch);
    const effective = await store.getEffectiveTemplates();
    const t = effective.find(x => x.key === req.params.key);
    res.json(toApiTemplate(t));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// RESET 1 template về default (xóa override)
app.post('/api/email-templates/:key/reset', async (req, res) => {
  try {
    await store.deleteTemplateOverride(req.params.key);
    const def = tmpl.EMAIL_TEMPLATES.find(x => x.key === req.params.key);
    if (!def) return res.status(404).json({ error: 'Not found' });
    res.json(toApiTemplate(def));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// RESET tất cả templates về default
app.post('/api/email-templates/reset-all', async (req, res) => {
  try {
    await store.clearAllOverrides();
    res.json({ ok: true, count: tmpl.EMAIL_TEMPLATES.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Apply-pending — trong kiến trúc mới emails được generate on-the-fly,
// nên template mới tự áp dụng cho mọi email pending. Stub để frontend tương thích.
app.post('/api/email-templates/:key/apply-pending', async (req, res) => {
  res.json({ ok: true, updated: 'auto (on-the-fly generation)' });
});

app.post('/api/email-templates/:key/preview', async (req, res) => {
  try {
    const effective = await store.getEffectiveTemplates();
    const t = effective.find(x => x.key === req.params.key);
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    // Lazy trigger cron nếu lần cuối > 1h trước (không block response)
    cronRunner.triggerIfStale({ maxAgeMs: 60 * 60 * 1000, source: 'dashboard' }).catch(err => {
      console.error('[lazy cron]', err.message);
    });
    const today = todayStr();
    const cands = await store.listCandidates();
    const dept = await deptEmailsFromSettings();
    const effectiveTemplates = await store.getEffectiveTemplates();

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
      const emails = timeline.generateEmails(c, dept, effectiveTemplates);
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

      // checklist overdue — skip items đã skip; auto-done được coi như done
      const checklist = timeline.generateChecklist(c);
      for (const it of checklist) {
        const s = state[`checklist:${it.item_index}`];
        if (s?.is_skipped) continue;
        const isDone = s?.is_done || checkAutoDone(it, state);
        if (it.deadline && it.deadline < today && !isDone) overdueChecks++;
      }

      // upcoming 7 days — progress = manual done + auto done
      if (c.start_date && c.start_date >= today) {
        const diff = Math.floor((new Date(c.start_date) - new Date(today)) / 86400000);
        if (diff <= 7) {
          let done = 0, totalActive = 0;
          for (const it of checklist) {
            const s = state[`checklist:${it.item_index}`];
            if (s?.is_skipped) continue;
            totalActive++;
            if (s?.is_done || checkAutoDone(it, state)) done++;
          }
          upcoming.push({
            ...c,
            total_tasks: totalActive,
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

// Manual trigger cron — gửi tất cả email đến hạn ngay
app.post('/api/cron/run-now', async (req, res) => {
  try {
    const result = await cronRunner.runForAll({ source: 'manual' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Status — info về lần cron cuối
app.get('/api/cron/status', async (req, res) => {
  try {
    const last = await cronRunner.getLastCronRun();
    res.json({ last });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings/test-email', async (req, res) => {
  try {
    const { to, smtp_host, smtp_port, smtp_user, smtp_pass, smtp_from_name, smtp_from_email, email_signature } = req.body || {};
    if (!to) return res.status(400).json({ error: 'Thiếu email nhận' });

    // Nếu body có SMTP creds → dùng trực tiếp (không cần lưu trước).
    // Field nào trống → fallback từ settings đã lưu.
    const stored = await store.getSettings();
    // smtp_pass: nếu user gõ trực tiếp form, có thể có space (Google App Password)
    // → strip hết space. Nếu là placeholder UI, dùng saved.
    let pass = stored.smtp_pass;
    if (smtp_pass && smtp_pass !== '••••••••') {
      pass = smtp_pass.replace(/\s+/g, '');
    }
    const cfg = {
      host: smtp_host || stored.smtp_host,
      port: smtp_port || stored.smtp_port,
      user: smtp_user || stored.smtp_user,
      pass,
      fromName: smtp_from_name || stored.smtp_from_name || 'APERO HR',
      fromEmail: smtp_from_email || stored.smtp_from_email || stored.smtp_user,
      signature: email_signature || stored.email_signature || ''
    };

    const missing = [];
    if (!cfg.host) missing.push('SMTP host');
    if (!cfg.user) missing.push('SMTP user');
    if (!cfg.pass) missing.push('SMTP password');
    if (missing.length) {
      return res.status(400).json({ error: 'Thiếu cấu hình ' + missing.join(', ') });
    }

    // Build transporter trực tiếp với inline config (timeout phù hợp serverless)
    const nodemailer = require('nodemailer');
    const port = Number(cfg.port || 587);
    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port,
      secure: port === 465,
      auth: { user: cfg.user, pass: cfg.pass },
      connectionTimeout: 8000,
      greetingTimeout: 5000,
      socketTimeout: 8000,
      requireTLS: port !== 465
    });
    await transporter.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to,
      subject: '[APERO] Test Email',
      text: `Email test từ APERO Onboarding. Nhận được = SMTP OK ✅\n\n${cfg.signature}`
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

// /login serve login.html (cho cả local + Vercel)
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

// SPA fallback (chỉ áp dụng local — Vercel xử lý qua vercel.json)
app.get(/^(?!\/api).*/, (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

module.exports = app;
