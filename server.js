// ═══════════════════════════════════════════════════════════════════
// APERO Onboarding v2 — Local Dev Entry (Express + Vercel KV)
// Production: dùng api/[...path].js + Vercel Cron qua vercel.json
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();

const app = require('./lib/express-app');
const store = require('./lib/store');

const PORT = process.env.PORT || 3000;

(async () => {
  await store.seedIfEmpty();
  app.listen(PORT);
})().catch(err => {
  console.error('❌ Boot error:', err);
  process.exit(1);
});
