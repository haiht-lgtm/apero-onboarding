// Liệt kê tất cả keys trong storage (Vercel Blob hoặc local file)
require('dotenv').config();
const kv = require('../lib/kv');

(async () => {
  const all = await kv.keys();
  console.log('Storage mode:', kv.mode());
  console.log('Total keys:', all.length);
  console.log('');
  for (const k of all.sort()) {
    const v = await kv.get(k);
    let desc;
    if (Array.isArray(v)) desc = `[array, ${v.length} items]`;
    else if (v === null) desc = '(null)';
    else if (typeof v === 'object') desc = `{object, ${Object.keys(v).length} fields}`;
    else if (typeof v === 'string') desc = `"${v.slice(0, 50)}${v.length > 50 ? '...' : ''}"`;
    else desc = JSON.stringify(v);
    console.log('  ' + k.padEnd(35) + ' => ' + desc);
  }
})().catch(e => console.error('ERR:', e.message));
