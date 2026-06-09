// ═══════════════════════════════════════════════════════════════════
// Google Sheet reader — tra cứu hồ sơ ứng viên (CHỈ ĐỌC, read-only)
//
// Đọc file Google Sheet "Hồ sơ (Profile)" qua Service Account của công ty.
// KHÔNG cần thư viện ngoài: tự ký JWT (RS256) bằng module 'crypto' có sẵn của
// Node, đổi lấy access token, rồi gọi Google Sheets REST API.
//
// CẤU HÌNH (1 trong 2 cách):
//   A) Local: đặt file google-credentials.json ở thư mục gốc dự án (đã .gitignore)
//   B) Vercel/Prod: set env
//        GOOGLE_SERVICE_ACCOUNT_EMAIL = ...@....iam.gserviceaccount.com
//        GOOGLE_PRIVATE_KEY           = -----BEGIN PRIVATE KEY-----\n...   (giữ \n)
//      (hoặc gộp cả JSON vào 1 env: GOOGLE_CREDENTIALS_JSON = {...nội dung file json...})
//
//   GOOGLE_SHEET_ID  — mặc định đã trỏ tới file hồ sơ; có thể override bằng env.
//   GOOGLE_SHEET_GID — gid của tab cần đọc (mặc định 1783420024).
// ═══════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1nJGX480Z2M4MpUPAiUpB5VM75LpzaES8LPf5IxbZ-WE';
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '1783420024';
const CRED_FILE = path.join(__dirname, '..', 'google-credentials.json');

// ─── Nạp credentials (thử env trước, rồi tới file) ───
function loadCredentials() {
  // 1) Env gộp JSON
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
      const c = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      if (c.client_email && c.private_key) return { email: c.client_email, key: c.private_key };
    } catch { /* ignore */ }
  }
  // 2) Env tách rời
  if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }
  // 3) File local
  try {
    if (fs.existsSync(CRED_FILE)) {
      const c = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
      if (c.client_email && c.private_key) return { email: c.client_email, key: c.private_key };
    }
  } catch { /* ignore */ }
  return null;
}

function isConfigured() {
  return !!loadCredentials();
}

// ─── Lấy access token bằng JWT service account (cache theo hạn) ───
let _token = { value: null, exp: 0 };
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_token.value && _token.exp - 60 > now) return _token.value;

  const cred = loadCredentials();
  if (!cred) throw new Error('SHEET_NOT_CONFIGURED');

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: cred.email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claim));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const signature = base64url(signer.sign(cred.key));
  const jwt = unsigned + '.' + signature;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });
  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error('AUTH_FAILED: ' + (data.error_description || data.error || resp.status));
  }
  _token = { value: data.access_token, exp: now + (data.expires_in || 3600) };
  return _token.value;
}

// ─── Tìm tên tab (title) theo gid — cache ───
let _tabTitle = null;
async function getTabTitle(token) {
  if (_tabTitle) return _tabTitle;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets.properties(sheetId,title)`;
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await resp.json();
  if (!resp.ok) throw new Error('META_FAILED: ' + (data.error?.message || resp.status));
  const sheets = data.sheets || [];
  const match = sheets.find(s => String(s.properties?.sheetId) === String(SHEET_GID));
  _tabTitle = (match || sheets[0])?.properties?.title || 'Sheet1';
  return _tabTitle;
}

// ─── Đọc toàn bộ vùng dữ liệu của tab (cache ngắn 60s) ───
let _rowsCache = { rows: null, at: 0 };
async function fetchRows() {
  if (_rowsCache.rows && Date.now() - _rowsCache.at < 60000) return _rowsCache.rows;
  const token = await getAccessToken();
  const title = await getTabTitle(token);
  const range = encodeURIComponent(`${title}!A1:AZ5000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}?majorDimension=ROWS`;
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await resp.json();
  if (!resp.ok) throw new Error('READ_FAILED: ' + (data.error?.message || resp.status));
  _rowsCache = { rows: data.values || [], at: Date.now() };
  return _rowsCache.rows;
}

// ─── Chuẩn hoá chuỗi: bỏ dấu tiếng Việt, đ→d, lowercase ───
function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim().replace(/\s+/g, ' ');
}

// ─── Tìm dòng header (dòng chứa cả "Họ và tên" và "Trạng thái") ───
function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i].map(norm);
    if (r.some(c => c.includes('ho va ten')) && r.some(c => c.includes('trang thai'))) {
      return i;
    }
  }
  return -1;
}

// ─── Map cột theo tên header (linh hoạt, không phụ thuộc vị trí cố định) ───
const FIELD_KEYS = {
  status:        ['trang thai'],
  name:          ['ho va ten'],
  companyEmail:  ['email cong ty'],
  personalEmail: ['email ca nhan'],
  altEmail:      ['dia chi email'],
  dob:           ['ngay sinh'],
  startDate:     ['ngay nhan viec'],
  position:      ['vi tri'],
  department:    ['phong ban'],
  manager:       ['quan ly truc tiep'],
  location:      ['dia diem lam viec'],
  phone:         ['so dien thoai'],
  gender:        ['gioi tinh']
};
function mapColumns(headerCells) {
  const h = headerCells.map(norm);
  const idx = {};
  for (const [field, keys] of Object.entries(FIELD_KEYS)) {
    idx[field] = h.findIndex(c => keys.some(k => c.includes(k)));
  }
  return idx;
}

// ─── Tra cứu theo tên: trả về danh sách ứng viên khớp ───
async function searchByName(query) {
  const q = norm(query);
  if (!q) return [];
  const rows = await fetchRows();
  const hIdx = findHeaderRow(rows);
  if (hIdx < 0) throw new Error('HEADER_NOT_FOUND');
  const colIdx = mapColumns(rows[hIdx]);
  const nameCol = colIdx.name;
  if (nameCol < 0) throw new Error('NAME_COLUMN_NOT_FOUND');

  const results = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const name = row[nameCol];
    if (!name) continue;
    if (!norm(name).includes(q)) continue;
    const get = f => (colIdx[f] >= 0 ? (row[colIdx[f]] || '').trim() : '');
    results.push({
      name: name.trim(),
      status: get('status'),
      position: get('position'),
      department: get('department'),
      startDate: get('startDate'),
      companyEmail: get('companyEmail') || get('altEmail'),
      personalEmail: get('personalEmail'),
      phone: get('phone'),
      manager: get('manager'),
      location: get('location'),
      dob: get('dob'),
      gender: get('gender'),
      rowNumber: i + 1
    });
    if (results.length >= 50) break; // an toàn: không trả quá nhiều
  }
  return results;
}

module.exports = { isConfigured, searchByName, SHEET_ID, SHEET_GID };
