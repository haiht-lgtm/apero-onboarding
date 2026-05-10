// ═══════════════════════════════════════════════════════════════════
// Vercel Function Entry — catch-all API routes
// Mọi request /api/* và non-static path đều vào file này.
// Express app từ lib/express-app.js xử lý routing.
// ═══════════════════════════════════════════════════════════════════
const app = require('../lib/express-app');
const store = require('../lib/store');

let _seedDone = false;

module.exports = async (req, res) => {
  // Seed lần đầu (idempotent — chỉ seed nếu KV trống)
  if (!_seedDone) {
    try { await store.seedIfEmpty(); } catch (e) { console.error('Seed error:', e.message); }
    _seedDone = true;
  }
  return app(req, res);
};
