const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DB_HOST = 'test';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.DB_NAME = 'test';
process.env.JWT_SECRET = 'test';
process.env.JWT_REFRESH_SECRET = 'test';

const printerRouter = require('../src/routes/printer');

test('receipt store data keeps the invoice logo setting', () => {
  const store = printerRouter.buildReceiptStore(
    {
      store_name: 'Toko Basik',
      store_address: '',
      store_phone: '',
      store_email: '',
      store_tax_id: '',
    },
    [
      { key: 'store_logo', value: '/uploads/logos/app.png' },
      { key: 'invoice_logo', value: '/uploads/logos/invoice.png' },
    ]
  );

  assert.equal(store.store_logo, '/uploads/logos/app.png');
  assert.equal(store.invoice_logo, '/uploads/logos/invoice.png');
});

test('identitas toko di struk selalu memakai data branches terbaru', () => {
  const store = printerRouter.buildReceiptStore(
    {
      store_name: 'BASIK PGMTA',
      store_address: 'Blok B lantai 6 no 118',
      store_phone: '0813',
      store_email: '',
      store_tax_id: '',
    },
    [
      { key: 'store_name', value: 'Nama Lama' },
      { key: 'store_address', value: 'Alamat lama yang sudah pindah' },
      { key: 'store_phone', value: '0000' },
    ]
  );

  assert.equal(store.store_name, 'BASIK PGMTA');
  assert.equal(store.store_address, 'Blok B lantai 6 no 118');
  assert.equal(store.store_phone, '0813');
});
