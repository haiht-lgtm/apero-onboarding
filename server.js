// ═══════════════════════════════════════════════════════════════════
// APERO Onboarding v2 — Local Dev Entry (Express + Vercel KV)
// Production: dùng api/[...path].js + Vercel Cron qua vercel.json
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();

const app = require('./lib/express-app');
const store = require('./lib/store');
const kv = require('./lib/kv');

const PORT = process.env.PORT || 3000;

(async () => {
  console.log(`🗄️  Storage mode: ${kv.mode()}`);
  if (!kv.HAS_BLOB) {
    console.log('   → Local file: .kv-local.json (data persist qua restart)');
    console.log('   → Production: Vercel auto-set BLOB_READ_WRITE_TOKEN khi tạo Blob store');
  }

  const seeded = await store.seedIfEmpty();
  if (seeded) console.log('🌱 Đã seed 2 ứng viên mẫu vào KV');

  app.listen(PORT, () => {
    console.log(`✅ APERO Onboarding v2 running at http://localhost:${PORT}`);
  });
})().catch(err => {
  console.error('❌ Boot error:', err);
  process.exit(1);
});
