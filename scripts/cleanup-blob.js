// Xóa test blobs còn sót lại
require('dotenv').config();
const { list, del } = require('@vercel/blob');

(async () => {
  const { blobs } = await list();
  console.log('Found', blobs.length, 'blobs:');
  for (const b of blobs) console.log(' -', b.pathname);

  const toDelete = blobs.filter(b => b.pathname.startsWith('test-'));
  console.log('\nDelete', toDelete.length, 'test blob(s)...');
  for (const b of toDelete) {
    await del(b.url);
    console.log('   ✓ Deleted', b.pathname);
  }

  const { blobs: remaining } = await list();
  console.log('\nRemaining:');
  for (const b of remaining) console.log(' -', b.pathname);
})();
