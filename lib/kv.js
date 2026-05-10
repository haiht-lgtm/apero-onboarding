// ═══════════════════════════════════════════════════════════════════
// KV Adapter — dùng Vercel KV (Upstash Redis) trong production
// Fallback: in-memory Map cho local dev (không persist qua restart)
//
// Detection: nếu có KV_REST_API_URL + KV_REST_API_TOKEN → Vercel KV
//            ngược lại → in-memory + ghi ra file .kv-local.json để dev cũng persist
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const HAS_KV = !!(UPSTASH_URL && UPSTASH_TOKEN);
const LOCAL_FILE = path.join(process.cwd(), '.kv-local.json');

let _cloud = null;
let _local = null;

function getCloud() {
  if (_cloud) return _cloud;
  const { Redis } = require('@upstash/redis');
  _cloud = new Redis({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
  return _cloud;
}

function loadLocal() {
  if (_local) return _local;
  try {
    if (fs.existsSync(LOCAL_FILE)) {
      _local = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
    } else {
      _local = {};
    }
  } catch (err) {
    console.error('⚠️  Lỗi đọc .kv-local.json — bắt đầu rỗng:', err.message);
    _local = {};
  }
  return _local;
}

function saveLocal() {
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(_local, null, 2), 'utf8');
  } catch (err) {
    console.error('⚠️  Lỗi ghi .kv-local.json:', err.message);
  }
}

async function get(key) {
  if (HAS_KV) {
    return await getCloud().get(key);
  }
  loadLocal();
  return _local[key] !== undefined ? _local[key] : null;
}

async function set(key, value) {
  if (HAS_KV) {
    return await getCloud().set(key, value);
  }
  loadLocal();
  _local[key] = value;
  saveLocal();
}

async function del(key) {
  if (HAS_KV) {
    return await getCloud().del(key);
  }
  loadLocal();
  delete _local[key];
  saveLocal();
}

async function keys(pattern = '*') {
  if (HAS_KV) {
    return await getCloud().keys(pattern);
  }
  loadLocal();
  if (pattern === '*') return Object.keys(_local);
  // Glob đơn giản: chỉ support prefix*
  const m = pattern.match(/^([^*]+)\*$/);
  if (m) return Object.keys(_local).filter(k => k.startsWith(m[1]));
  return Object.keys(_local).filter(k => k === pattern);
}

function mode() {
  return HAS_KV ? 'cloud' : 'local-file';
}

module.exports = { get, set, del, keys, mode, HAS_KV };
