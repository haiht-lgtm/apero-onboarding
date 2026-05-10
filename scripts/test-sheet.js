// ═══════════════════════════════════════════════════════════════════
// Script test: kết nối Google Sheets, in metadata + 3 hàng đầu
// Chạy: npm run sheet:test
// ═══════════════════════════════════════════════════════════════════
require('dotenv').config();
const { readSheet, getSheetMetadata, rowsToObjects } = require('../lib/sheet');

async function main() {
  const SHEET_ID = process.env.SHEET_ID;
  if (!SHEET_ID) {
    console.error('❌ Thiếu SHEET_ID trong .env (copy .env.example → .env và điền)');
    process.exit(1);
  }

  console.log('🔍 Đang kết nối Google Sheets...');
  console.log('   Sheet ID:', SHEET_ID);

  // 1. Liệt kê tất cả tab
  let meta;
  try {
    meta = await getSheetMetadata(SHEET_ID);
  } catch (err) {
    console.error('❌ Lỗi auth/access:', err.message);
    if (err.message.includes('does not have access') || err.code === 403) {
      console.error('   → Check: bạn đã share Sheet cho service account email chưa?');
      console.error('   → Email service account nằm trong file google-credentials.json, field "client_email"');
    }
    process.exit(1);
  }

  console.log(`\n📋 Sheet: "${meta.title}"`);
  console.log(`📑 Có ${meta.tabs.length} tab:`);
  meta.tabs.forEach((t, i) => {
    console.log(`   ${i+1}. "${t.name}" (${t.rows} rows × ${t.cols} cols)`);
  });

  // 2. Đọc tab đầu tiên (hoặc tab chỉ định trong .env)
  const tabName = process.env.SHEET_TAB_NAME || meta.tabs[0].name;
  const range = process.env.SHEET_RANGE || 'A:Z';
  console.log(`\n📥 Đọc tab "${tabName}" range "${range}"...`);

  const rows = await readSheet({ sheetId: SHEET_ID, tabName, range });
  console.log(`   ${rows.length} hàng (bao gồm header)`);

  if (rows.length === 0) {
    console.log('   ⚠️  Tab trống — không có data');
    return;
  }

  // 3. In header
  console.log('\n📌 HEADER (row 1):');
  rows[0].forEach((col, i) => {
    const colLetter = String.fromCharCode(65 + i);
    console.log(`   ${colLetter}: ${col}`);
  });

  // 4. In 3 hàng data đầu tiên
  console.log('\n📊 SAMPLE DATA (3 hàng đầu):');
  const samples = rowsToObjects(rows.slice(0, 4));
  samples.forEach((obj, i) => {
    console.log(`\n   --- Row ${i+2} ---`);
    Object.entries(obj).forEach(([k, v]) => {
      if (v) console.log(`   ${k}: ${v}`);
    });
  });

  console.log('\n✅ Kết nối Sheet OK! Tổng:', rows.length - 1, 'rows data.');
}

main().catch(err => {
  console.error('\n❌ Lỗi:', err.message);
  console.error(err.stack);
  process.exit(1);
});
