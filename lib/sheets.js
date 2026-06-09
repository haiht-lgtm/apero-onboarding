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

// File HỒ SƠ (Profile) — tra cứu chi tiết từng ứng viên
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1nJGX480Z2M4MpUPAiUpB5VM75LpzaES8LPf5IxbZ-WE';
const SHEET_GID = process.env.GOOGLE_SHEET_GID || '1783420024';
// File APERO ONBOARDING — theo dõi Ngày nhận việc + Trạng thái (dashboard cảnh báo)
const ONB_SHEET_ID = process.env.GOOGLE_ONBOARDING_SHEET_ID || '1FwFUx0HHt4F-kmH_0Du8Bt7J5_CdkNDCpItngloQBkw';
const ONB_GID = process.env.GOOGLE_ONBOARDING_GID || '0';
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

// ─── Tìm tên tab (title) theo gid — cache theo từng sheetId ───
const _tabTitle = {};
async function getTabTitle(token, sheetId, gid) {
  if (_tabTitle[sheetId]) return _tabTitle[sheetId];
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`;
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await resp.json();
  if (!resp.ok) throw new Error('META_FAILED: ' + (data.error?.message || resp.status));
  const sheets = data.sheets || [];
  const match = sheets.find(s => String(s.properties?.sheetId) === String(gid));
  _tabTitle[sheetId] = (match || sheets[0])?.properties?.title || 'Sheet1';
  return _tabTitle[sheetId];
}

// ─── Đọc toàn bộ vùng dữ liệu của tab (cache ngắn 60s, theo từng sheetId) ───
const _rowsCache = {};
async function fetchRows(sheetId, gid) {
  const c = _rowsCache[sheetId];
  if (c && c.rows && Date.now() - c.at < 60000) return c.rows;
  const token = await getAccessToken();
  const title = await getTabTitle(token, sheetId, gid);
  const range = encodeURIComponent(`${title}!A1:AZ5000`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?majorDimension=ROWS`;
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await resp.json();
  if (!resp.ok) throw new Error('READ_FAILED: ' + (data.error?.message || resp.status));
  _rowsCache[sheetId] = { rows: data.values || [], at: Date.now() };
  return _rowsCache[sheetId].rows;
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
  const rows = await fetchRows(SHEET_ID, SHEET_GID);
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

function sheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=${SHEET_GID}#gid=${SHEET_GID}`;
}

// ═══════════════════════════════════════════════════════════════════
// FILE APERO ONBOARDING — đọc Ngày nhận việc + Trạng thái (read-only)
// ═══════════════════════════════════════════════════════════════════
const ONB_KEYS = {
  name:      ['ho va ten', 'ho ten', 'ten nhan su', 'ten ung vien', 'ho'],
  startDate: ['ngay nhan viec', 'ngay onboard', 'ngay vao lam', 'ngay di lam', 'ngay bat dau', 'start'],
  status:    ['trang thai']
};
// Dòng header = dòng đầu tiên (trong 12 dòng đầu) có cột "ngày nhận việc"
function findOnbHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const r = (rows[i] || []).map(norm);
    if (r.some(c => ONB_KEYS.startDate.some(k => c.includes(k)))) return i;
  }
  return -1;
}
function mapOnbColumns(headerCells) {
  const h = headerCells.map(norm);
  const idx = {};
  for (const [field, keys] of Object.entries(ONB_KEYS)) {
    idx[field] = h.findIndex(c => keys.some(k => c.includes(k)));
  }
  return idx;
}
// Parse ngày → 'YYYY-MM-DD' hoặc null. Mặc định ưu tiên D/M/Y (kiểu VN).
// LƯU Ý: cần kiểm chứng định dạng thật của file khi có quyền đọc.
function parseDateISO(s) {
  s = String(s || '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO sẵn
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); // D/M/Y hoặc M/D/Y
  if (!m) return null;
  let a = +m[1], b = +m[2], y = +m[3];
  if (y < 100) y += 2000;
  let day, month;
  if (a > 12) { day = a; month = b; }
  else if (b > 12) { month = a; day = b; }
  else { day = a; month = b; } // ambiguous → giả định D/M (VN)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
// Trả về các dòng CÓ ngày nhận việc: { name, startDate, startISO, status, rowNumber }
async function getOnboardingRows() {
  const rows = await fetchRows(ONB_SHEET_ID, ONB_GID);
  const hIdx = findOnbHeaderRow(rows);
  if (hIdx < 0) throw new Error('ONB_HEADER_NOT_FOUND');
  const col = mapOnbColumns(rows[hIdx]);
  if (col.startDate < 0) throw new Error('ONB_STARTDATE_NOT_FOUND');
  const out = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const sd = (col.startDate >= 0 ? (row[col.startDate] || '') : '').trim();
    if (!sd) continue; // chỉ lấy dòng CÓ ngày nhận việc
    out.push({
      name: (col.name >= 0 ? (row[col.name] || '') : '').trim(),
      startDate: sd,
      startISO: parseDateISO(sd),
      status: (col.status >= 0 ? (row[col.status] || '') : '').trim(),
      rowNumber: i + 1
    });
  }
  return out;
}
function onboardingUrl() {
  return `https://docs.google.com/spreadsheets/d/${ONB_SHEET_ID}/edit?gid=${ONB_GID}#gid=${ONB_GID}`;
}

module.exports = {
  isConfigured, searchByName, sheetUrl, SHEET_ID, SHEET_GID,
  getOnboardingRows, onboardingUrl, ONB_SHEET_ID, ONB_GID
};
