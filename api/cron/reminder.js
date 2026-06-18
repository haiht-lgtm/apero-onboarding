// ═══════════════════════════════════════════════════════════════════
// Vercel Cron — NHẮC DEADLINE
// Chạy 1h UTC = 8h sáng Asia/Ho_Chi_Minh (1 tiếng trước cron gửi mail 9h).
// Gửi 1 email tổng hợp các email tới hạn hôm nay tới reminder_email.
// Schedule cấu hình trong vercel.json.
// ═══════════════════════════════════════════════════════════════════
const cronRunner = require('../../lib/cron-runner');

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await cronRunner.sendDueReminders({ source: 'cron' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
