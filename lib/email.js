// ═══════════════════════════════════════════════════════════════════
// Email Sending — Nodemailer wrapper
// Đọc SMTP config từ KV settings (cấu hình qua trang "Cài Đặt" trong app),
// fallback sang process.env.SMTP_* nếu KV chưa có.
// ═══════════════════════════════════════════════════════════════════
const nodemailer = require('nodemailer');
const store = require('./store');

async function loadSMTPConfig() {
  const s = await store.getSettings();
  return {
    host: s.smtp_host || process.env.SMTP_HOST || '',
    port: Number(s.smtp_port || process.env.SMTP_PORT || 587),
    user: s.smtp_user || process.env.SMTP_USER || '',
    pass: s.smtp_pass || process.env.SMTP_PASS || '',
    fromName: s.smtp_from_name || process.env.SMTP_FROM_NAME || 'APERO HR',
    fromEmail: s.smtp_from_email || process.env.SMTP_FROM_EMAIL || s.smtp_user || process.env.SMTP_USER || ''
  };
}

async function buildTransporter() {
  const cfg = await loadSMTPConfig();
  const missing = [];
  if (!cfg.host) missing.push('SMTP host');
  if (!cfg.user) missing.push('SMTP user');
  if (!cfg.pass) missing.push('SMTP password');
  if (missing.length) {
    return { error: 'Thiếu cấu hình ' + missing.join(', ') + ' — vào trang Cài Đặt điền SMTP' };
  }
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    // Timeouts ngắn cho serverless (Vercel Free plan = 10s)
    connectionTimeout: 8000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
    // Hint cho Gmail: ưu tiên LOGIN auth
    requireTLS: cfg.port !== 465
  });
  return { transporter, cfg };
}

async function sendEmail({ to, cc, subject, body }) {
  if (!to) throw new Error('Thiếu email người nhận');
  const { transporter, cfg, error } = await buildTransporter();
  if (error) throw new Error(error);
  return transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to,
    cc: cc || undefined,
    subject,
    text: body
  });
}

module.exports = { sendEmail, loadSMTPConfig };
