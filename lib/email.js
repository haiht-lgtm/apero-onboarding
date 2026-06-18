// ═══════════════════════════════════════════════════════════════════
// Email Sending — Nodemailer wrapper
// Đọc SMTP config từ KV settings (cấu hình qua trang "Cài Đặt" trong app),
// fallback sang process.env.SMTP_* nếu KV chưa có.
// Gửi email dạng HTML + plain-text, kèm chữ ký APERO HR ở cuối.
// ═══════════════════════════════════════════════════════════════════
const nodemailer = require('nodemailer');
const store = require('./store');

// ── Chữ ký mail (áp dụng cho TẤT CẢ email gửi đi) ──────────────────
// Thông tin có thể đổi tại đây; logo dùng wordmark "APERO" (email-safe).
const SIGNATURE = {
  name: 'Hoàng Hải',
  title: 'Human Resource Recruitment',
  company: 'Apero Technologies Group',
  mobile: '+84 867583687',
  website: 'https://apero.vn/',
  email: 'HaiHT@apero.vn',
  logoUrl: 'https://apero-onboarding.vercel.app/apero-logo.png'
};

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Chữ ký dạng HTML — logo wordmark + dải vàng + thông tin liên hệ
function signatureHtml() {
  const orange = '#f5a623';
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;font-family:Arial,'Helvetica Neue',sans-serif">
  <tr>
    <td style="vertical-align:middle;padding-right:22px">
      <img src="${escapeHtml(SIGNATURE.logoUrl)}" alt="APERO" width="120" style="display:block;width:120px;height:auto;border:0;outline:none"/>
    </td>
    <td style="vertical-align:middle;border-left:3px solid ${orange};padding-left:22px">
      <div style="font-size:19px;font-weight:700;color:${orange};margin-bottom:3px">${escapeHtml(SIGNATURE.name)}</div>
      <div style="font-size:13px;font-weight:700;color:#222222;margin-bottom:1px">${escapeHtml(SIGNATURE.title)}</div>
      <div style="font-size:13px;color:#444444;margin-bottom:5px">${escapeHtml(SIGNATURE.company)}</div>
      <div style="font-size:13px;color:#444444;line-height:1.7">
        <span style="color:${orange};font-weight:700">Mobile:</span> ${escapeHtml(SIGNATURE.mobile)}<br>
        <span style="color:${orange};font-weight:700">Website:</span> <a href="${escapeHtml(SIGNATURE.website)}" style="color:#1a73e8;text-decoration:none">${escapeHtml(SIGNATURE.website)}</a><br>
        <span style="color:${orange};font-weight:700">Email:</span> <a href="mailto:${escapeHtml(SIGNATURE.email)}" style="color:#1a73e8;text-decoration:none">${escapeHtml(SIGNATURE.email)}</a>
      </div>
    </td>
  </tr>
</table>`;
}

// Chữ ký dạng plain-text (fallback cho client không hiển thị HTML)
function signatureText() {
  return `\n\n--\n${SIGNATURE.name}\n${SIGNATURE.title}\n${SIGNATURE.company}\nMobile: ${SIGNATURE.mobile}\nWebsite: ${SIGNATURE.website}\nEmail: ${SIGNATURE.email}`;
}

// Convert plain-text body → HTML (escape + nl2br + linkify URL)
function bodyToHtml(body) {
  let html = escapeHtml(body).replace(/\n/g, '<br>');
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1a73e8;text-decoration:none">$1</a>');
  return html;
}

// Wrap body + chữ ký thành HTML email hoàn chỉnh
function wrapHtml(body) {
  return `<div style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:14px;line-height:1.75;color:#222222;max-width:660px">${bodyToHtml(body)}${signatureHtml()}</div>`;
}

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

// body  → nội dung plain-text (bắt buộc, dùng làm text fallback)
// html  → tùy chọn: HTML tùy chỉnh. Nếu có, dùng html này (kèm chữ ký) thay cho
//         việc tự convert body → HTML. Dùng cho email dạng thẻ (vd: nhắc deadline).
async function sendEmail({ to, cc, subject, body, html }) {
  if (!to) throw new Error('Thiếu email người nhận');
  const { transporter, cfg, error } = await buildTransporter();
  if (error) throw new Error(error);
  return transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail}>`,
    to,
    cc: cc || undefined,
    subject,
    text: body + signatureText(),
    html: html ? `${html}${signatureHtml()}` : wrapHtml(body)
  });
}

module.exports = { sendEmail, loadSMTPConfig, signatureHtml, signatureText, bodyToHtml, wrapHtml, SIGNATURE };
