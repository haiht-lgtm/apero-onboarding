// ═══════════════════════════════════════════════════════════════════
// KV Adapter — JSON file storage
//
// Production (Vercel): @vercel/blob — literal JSON file lưu trên Vercel Blob
//   Env: BLOB_READ_WRITE_TOKEN (Vercel auto-inject khi tạo Blob store)
//
// Local dev: file .kv-local.json trong thư mục project
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const CAN_WRITE_FILE = !IS_SERVERLESS;
const LOCAL_FILE = path.join(process.cwd(), '.kv-local.json');
const BLOB_PATH = 'apero-data.json';

let _data = null;

// ─── Backend: Vercel Blob ───
async function loadFromBlob() {
  const { list } = require('@vercel/blob');
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const blob = blobs.find(b => b.pathname === BLOB_PATH);
    if (!blob) return {};
    // Cache buster vì Vercel Blob có CDN cache
    const res = await fetch(blob.url + '?t=' + Date.now());
    if (!res.ok) return {};
    return await res.json();
  } catch (err) {
    console.error('Blob load error:', err.message);
    return {};
  }
}

async function saveToBlob() {
  const { put } = require('@vercel/blob');
  await put(BLOB_PATH, JSON.stringify(_data, null, 2), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true
  });
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

// Force reload từ source (dùng khi nghi cache cũ)
function invalidate() {
  _data = null;
}

function mode() {
  if (HAS_BLOB) return 'vercel-blob';
  if (IS_SERVERLESS) return 'in-memory (NO PERSISTENCE — connect Vercel Blob!)';
  return 'local-file';
}

module.exports = {
  get, set, del, keys, mode, invalidate,
  HAS_KV: HAS_BLOB, // backward compat
  HAS_BLOB,
  IS_SERVERLESS
};
