// ═══════════════════════════════════════════════════════════════════
// Vercel Cron — chạy 1h UTC = 8h sáng Asia/Ho_Chi_Minh
// Schedule cấu hình trong vercel.json
// ═══════════════════════════════════════════════════════════════════
const store = require('../../lib/store');
const timeline = require('../../lib/timeline');
const { sendEmail } = require('../../lib/email');
const { todayStr } = require('../../lib/helpers');

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const today = todayStr();
  const settings = await store.getSettings();
  const dept = {
    dept_hcns_email: settings.dept_hcns_email,
    dept_it_mynth_email: settings.dept_it_mynth_email,
    dept_it_hungnx_email: settings.dept_it_hungnx_email,
    dept_cb_phuongth_email: settings.dept_cb_phuongth_email
  };

  const effectiveTemplates = await store.getEffectiveTemplates();
  const cands = await store.listCandidates();
  let due = 0, sent = 0, failed = 0;
  const results = [];

  for (const c of cands) {
    if (c.status !== 'active') continue;
    const state = await store.getState(c.id);
    const emails = timeline.generateEmails(c, dept, effectiveTemplates);
    for (const e of emails) {
      const s = state[`email:${e.template_key}`];
      if (e.scheduled_date !== today || s?.sent) continue;
      due++;
      if (!e.receiver) {
        const err = e.email_type === 'department' ? 'Bộ phận chưa cấu hình email' : 'Ứng viên thiếu email';
        await store.setStateItem(c.id, 'email', e.template_key, { status: 'failed', error: err });
        failed++;
        results.push({ candidate: c.full_name, key: e.template_key, status: 'failed', error: err });
        continue;
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
        sent++;
        results.push({ candidate: c.full_name, key: e.template_key, status: 'sent' });
      } catch (err) {
        await store.setStateItem(c.id, 'email', e.template_key, {
          status: 'failed', error: err.message
        });
        failed++;
        results.push({ candidate: c.full_name, key: e.template_key, status: 'failed', error: err.message });
      }
    }
  }

  res.json({ ok: true, today, due, sent, failed, results });
};
