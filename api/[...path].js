// ═══════════════════════════════════════════════════════════════════
// Vercel Function Entry — catch-all API routes
// ═══════════════════════════════════════════════════════════════════
const app = require('../lib/express-app');
const store = require('../lib/store');
const kv = require('../lib/kv');

let _seedDone = false;

module.exports = async (req, res) => {
  try {
    if (!_seedDone) {
      if (!kv.HAS_BLOB && kv.IS_SERVERLESS) {
        console.warn('⚠️  Vercel deployment detected but BLOB_READ_WRITE_TOKEN not set.');
        console.warn('   App đang chạy ở chế độ in-memory — DATA MẤT mỗi cold start!');
        console.warn('   → Vào Vercel Dashboard → Storage tab → Create Database → Blob → Continue');
      }
      try {
        await store.seedIfEmpty();
      } catch (e) {
        console.error('Seed error (non-fatal):', e.message);
      }
      _seedDone = true;
    }
    return app(req, res);
  } catch (err) {
    console.error('API handler crash:', err.stack || err.message);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal error',
        message: err.message,
        hint: !kv.HAS_BLOB && kv.IS_SERVERLESS
          ? 'Vercel Dashboard → Storage tab → Create Database → Blob'
          : undefined
      });
    }
  }
};
