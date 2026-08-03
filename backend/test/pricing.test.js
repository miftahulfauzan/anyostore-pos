const test = require('node:test');
const assert = require('node:assert/strict');
const { applyPriceTier } = require('../src/pricing');

function tierConn({ enabled = 1, wholesale = null } = {}) {
  return {
    async execute(sql) {
      if (sql.includes('pricing_tier_enabled')) return [[{ pricing_tier_enabled: enabled }], []];
      if (sql.includes('wholesale_prices')) return wholesale ? [[wholesale], []] : [[], []];
      throw new Error('unexpected sql: ' + sql);
    },
  };
}

test('tier nonaktif -> retail tanpa mengubah harga', async () => {
  const lines = [{ productId: 1, variantId: null, price: 50000, quantity: 2, itemDiscount: 0, lineSubtotal: 100000 }];
  const tier = await applyPriceTier(tierConn({ enabled: 0 }), 1, lines, 'grosir_seri');
  assert.equal(tier, 'retail');
  assert.equal(lines[0].price, 50000);
});

test('semi_grosir memotong 10.000 per pcs', async () => {
  const lines = [{ productId: 1, variantId: null, price: 50000, quantity: 2, itemDiscount: 0, lineSubtotal: 100000 }];
  const tier = await applyPriceTier(tierConn(), 1, lines, 'semi_grosir');
  assert.equal(tier, 'semi_grosir');
  assert.equal(lines[0].price, 40000);
  assert.equal(lines[0].lineSubtotal, 80000);
});

test('grosir_seri memakai harga wholesale', async () => {
  const lines = [{ productId: 1, variantId: null, price: 50000, quantity: 6, itemDiscount: 0, lineSubtotal: 300000 }];
  const tier = await applyPriceTier(tierConn({ wholesale: { price: 30000 } }), 1, lines, 'grosir_seri');
  assert.equal(tier, 'grosir_seri');
  assert.equal(lines[0].price, 30000);
  assert.equal(lines[0].lineSubtotal, 180000);
});

test('pelanggan reguler auto-detect semi_grosir (qty>3, >1 model)', async () => {
  const lines = [
    { productId: 1, variantId: null, price: 50000, quantity: 2, itemDiscount: 0, lineSubtotal: 100000 },
    { productId: 2, variantId: null, price: 40000, quantity: 2, itemDiscount: 0, lineSubtotal: 80000 },
  ];
  const tier = await applyPriceTier(tierConn(), 1, lines, 'reguler');
  assert.equal(tier, 'semi_grosir');
  assert.equal(lines[0].price, 40000);
  assert.equal(lines[1].price, 30000);
});
