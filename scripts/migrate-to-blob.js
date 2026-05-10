// ═══════════════════════════════════════════════════════════════════
// Migrate data from .kv-local.json → Vercel Blob
// Cần BLOB_READ_WRITE_TOKEN trong .env
// Chạy: node scripts/migrate-to-blob.js
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { put, list } = require('@vercel/blob');

const LOCAL_FILE = path.join(__dirname, '..', '.kv-local.json');
const BLOB_PATH = 'apero-data.json';
const BLOB_ACCESS = process.env.BLOB_ACCESS || 'private';

// Detect token (BLOB_READ_WRITE_TOKEN hoặc <STORE>_READ_WRITE_TOKEN)
function findToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const k of Object.keys(process.env)) {
    if (k.endsWith('_READ_WRITE_TOKEN') && process.env[k]?.startsWith('vercel_blob_rw_')) {
      console.log('   Using token from env:', k);
      return process.env[k];
    }
  }
  return null;
}

const TOKEN = findToken();

(async () => {
  if (!TOKEN) {
    console.error('❌ Thiếu BLOB_READ_WRITE_TOKEN hoặc *_READ_WRITE_TOKEN trong .env');
    process.exit(1);
  }
  if (!fs.existsSync(LOCAL_FILE)) {
    console.error('❌ Không tìm thấy', LOCAL_FILE);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  console.log('📂 Local data keys:', Object.keys(data).length);
  for (const k of Object.keys(data)) {
    const v = data[k];
    const summary = Array.isArray(v) ? `[${v.length} items]` : typeof v === 'object' ? `{${Object.keys(v || {}).length} fields}` : v;
    console.log(`   ${k}: ${summary}`);
  }

  // Check existing
  console.log('\n🔍 Check Blob hiện tại...');
  const { blobs } = await list({ prefix: BLOB_PATH, token: TOKEN });
  const existing = blobs.find(b => b.pathname === BLOB_PATH);
  if (existing) {
    console.log('   ⚠️  Đã có file', BLOB_PATH, '(size:', existing.size, ') → SẼ BỊ GHI ĐÈ');
  } else {
    console.log('   ✓ Chưa có, sẽ tạo mới');
  }

  console.log('\n📤 Uploading...');
  const r = await put(BLOB_PATH, JSON.stringify(data, null, 2), {
    access: BLOB_ACCESS,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: TOKEN
  });
  console.log('✅ Done!');
  console.log('   URL:', r.url);
  console.log('   Size:', r.size || 'n/a');
})().catch(err => {
  console.error('\n❌ Error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
