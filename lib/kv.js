// ═══════════════════════════════════════════════════════════════════
// KV Adapter — JSON file storage
//
// Production (Vercel): @vercel/blob — literal JSON file lưu trên Vercel Blob
//   Token env: BLOB_READ_WRITE_TOKEN (default) hoặc <STORE_NAME>_READ_WRITE_TOKEN
//   (Vercel auto-inject với prefix tên store khi connect, vd ONBOARDING_READ_WRITE_TOKEN)
//
// Local dev: file .kv-local.json trong thư mục project
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

// Detect token: thử BLOB_READ_WRITE_TOKEN trước, fallback bất kỳ *_READ_WRITE_TOKEN nào
function findBlobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const k of Object.keys(process.env)) {
    if (k.endsWith('_READ_WRITE_TOKEN') && process.env[k]?.startsWith('vercel_blob_rw_')) {
      return process.env[k];
    }
  }
  return null;
}

const BLOB_TOKEN = findBlobToken();
const HAS_BLOB = !!BLOB_TOKEN;
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const CAN_WRITE_FILE = !IS_SERVERLESS;
const LOCAL_FILE = path.join(process.cwd(), '.kv-local.json');
const BLOB_PATH = 'apero-data.json';

let _data = null;
// Cache access type sau khi detect (private | public)
let _detectedAccess = process.env.BLOB_ACCESS || null;

// Detect access type từ blob URL hoặc thử put
async function detectAccess() {
  if (_detectedAccess) return _detectedAccess;
  const { list } = require('@vercel/blob');
  try {
    const { blobs } = await list({ limit: 1, token: BLOB_TOKEN });
    if (blobs.length) {
      _detectedAccess = blobs[0].url.includes('.private.') ? 'private' : 'public';
      return _detectedAccess;
    }
  } catch {}
  // Chưa có blob nào → thử put với 'public' (default mặc định nhanh hơn)
  _detectedAccess = 'public';
  return _detectedAccess;
}

// ─── Backend: Vercel Blob ───
async function loadFromBlob() {
  const { list, head } = require('@vercel/blob');
  try {
    // Dùng head() thay vì list() — fresh metadata, ít cache hơn
    let blob;
    try {
      blob = await head(BLOB_PATH, { token: BLOB_TOKEN });
    } catch (e) {
      // Blob chưa tồn tại → return empty
      if (/not found|404/i.test(e.message)) return {};
      // Fallback to list nếu head fail vì lý do khác
      const { blobs } = await list({ prefix: BLOB_PATH, limit: 1, token: BLOB_TOKEN });
      blob = blobs.find(b => b.pathname === BLOB_PATH);
      if (!blob) return {};
    }
    // Auto-detect access type từ URL
    if (!_detectedAccess) {
      _detectedAccess = blob.url.includes('.private.') ? 'private' : 'public';
    }
    // Aggressive cache busting:
    // 1. Query param với timestamp
    // 2. Cache-Control headers no-cache
    // 3. fetch option cache: 'no-store'
    const headers = {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache'
    };
    if (_detectedAccess === 'private') {
      headers['Authorization'] = `Bearer ${BLOB_TOKEN}`;
    }
    const url = blob.url + (blob.url.includes('?') ? '&' : '?') + '_=' + Date.now();
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      console.error('Blob fetch failed:', res.status);
      return {};
    }
    return await res.json();
  } catch (err) {
    console.error('Blob load error:', err.message);
    return {};
  }
}

async function saveToBlob() {
  const { put } = require('@vercel/blob');
  let access = await detectAccess();
  const tryPut = (acc) => put(BLOB_PATH, JSON.stringify(_data, null, 2), {
    access: acc,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    token: BLOB_TOKEN,
    // Tắt CDN cache để read sau write thấy data mới ngay (mặc định 30 ngày!)
    cacheControlMaxAge: 0
  });
  try {
    await tryPut(access);
  } catch (err) {
    // Nếu store là loại khác → fall back
    if (/Cannot use (private|public) access on a (public|private) store/.test(err.message)) {
      access = access === 'private' ? 'public' : 'private';
      _detectedAccess = access;
      await tryPut(access);
    } else {
      throw err;
    }
  }
}

// ─── Backend: Local file ───
function loadFromFile() {
  if (!CAN_WRITE_FILE) return {};
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('File load error:', err.message);
  }
  return {};
}

function saveToFile() {
  if (!CAN_WRITE_FILE) return;
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(_data, null, 2), 'utf8');
  } catch (err) {
    console.error('File save error:', err.message);
  }
}

// ─── Public API ───
async function ensureLoaded() {
  if (_data !== null) return;
  if (HAS_BLOB) {
    _data = await loadFromBlob();
  } else {
    _data = loadFromFile();
  }
}

async function persist() {
  if (HAS_BLOB) {
    await saveToBlob();
  } else {
    saveToFile();
  }
}

async function get(key) {
  await ensureLoaded();
  return _data[key] !== undefined ? _data[key] : null;
}

async function set(key, value) {
  await ensureLoaded();
  _data[key] = value;
  await persist();
}

async function del(key) {
  await ensureLoaded();
  delete _data[key];
  await persist();
}

async function keys(pattern = '*') {
  await ensureLoaded();
  const all = Object.keys(_data);
  if (pattern === '*') return all;
  const m = pattern.match(/^([^*]+)\*$/);
  if (m) return all.filter(k => k.startsWith(m[1]));
  return all.filter(k => k === pattern);
}

function invalidate() {
  _data = null;
}

function mode() {
  if (HAS_BLOB) return _detectedAccess ? `vercel-blob (${_detectedAccess})` : 'vercel-blob';
  if (IS_SERVERLESS) return 'in-memory (NO PERSISTENCE — connect Vercel Blob!)';
  return 'local-file';
}

module.exports = {
  get, set, del, keys, mode, invalidate,
  HAS_KV: HAS_BLOB,
  HAS_BLOB,
  IS_SERVERLESS
};
