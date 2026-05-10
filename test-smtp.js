// Quick SMTP debug — chạy: node test-smtp.js <to-email>
require('dotenv').config();
const nodemailer = require('nodemailer');
const store = require('./lib/store');

(async () => {
  const to = process.argv[2];
  if (!to) {
    console.error('Usage: node test-smtp.js <to-email>');
    process.exit(1);
  }
  const s = await store.getSettings();
  console.log('Config from KV:');
  console.log('  Host:', s.smtp_host);
  console.log('  Port:', s.smtp_port);
  console.log('  User:', s.smtp_user);
  console.log('  Pass length:', (s.smtp_pass || '').length, '(should be 16)');
  console.log('  Pass có space?:', /\s/.test(s.smtp_pass || '') ? 'YES (XÓA SPACE!)' : 'NO ✓');
  console.log('');

  const t = nodemailer.createTransport({
    host: s.smtp_host,
    port: Number(s.smtp_port),
    secure: Number(s.smtp_port) === 465,
    auth: { user: s.smtp_user, pass: s.smtp_pass },
    debug: true,
    logger: true
  });

  try {
    console.log('Sending...');
    const info = await t.sendMail({
      from: `"${s.smtp_from_name}" <${s.smtp_from_email || s.smtp_user}>`,
      to,
      subject: '[APERO] Test SMTP',
      text: 'Nếu bạn nhận được email này = SMTP đã hoạt động ✅'
    });
    console.log('✅ SUCCESS:', info.messageId);
  } catch (err) {
    console.error('❌ FAIL:', err.message);
    if (err.code) console.error('   Code:', err.code);
    if (err.responseCode) console.error('   Response code:', err.responseCode);
  }
})();
