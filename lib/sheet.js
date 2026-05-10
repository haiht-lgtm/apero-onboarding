// ═══════════════════════════════════════════════════════════════════
// Google Sheets Reader — đọc danh sách ứng viên từ Sheet private
// Authenticate bằng Service Account (file JSON credentials)
// ═══════════════════════════════════════════════════════════════════
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

function getAuth() {
  const credPath = process.env.GOOGLE_CREDENTIALS_PATH || './google-credentials.json';
  const fullPath = path.isAbsolute(credPath) ? credPath : path.join(process.cwd(), credPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Không tìm thấy file credentials: ${fullPath}\n→ Tải JSON từ Google Cloud Console và đặt tại đường dẫn này (hoặc set env GOOGLE_CREDENTIALS_PATH)`);
  }
  const creds = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  return new google.auth.JWT(
    creds.client_email,
    null,
    creds.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );
}

async function readSheet({ sheetId, tabName, range }) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const fullRange = tabName ? `${tabName}!${range || 'A:Z'}` : (range || 'A:Z');
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: fullRange
  });
  return res.data.values || [];
}

async function getSheetMetadata(sheetId) {
  const auth = getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  return {
    title: res.data.properties.title,
    tabs: res.data.sheets.map(s => ({
      name: s.properties.title,
      rows: s.properties.gridProperties.rowCount,
      cols: s.properties.gridProperties.columnCount
    }))
  };
}

// Convert rows array (2D) thành array of objects, dùng row 1 làm header
function rowsToObjects(rows) {
  if (!rows.length) return [];
  const [header, ...data] = rows;
  return data.map(row => {
    const obj = {};
    header.forEach((col, i) => { obj[col] = row[i] || ''; });
    return obj;
  });
}

module.exports = { readSheet, getSheetMetadata, rowsToObjects };
