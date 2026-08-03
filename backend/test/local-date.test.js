const test = require('node:test');
const assert = require('node:assert/strict');
const { localDateString, localMonthStartString } = require('../src/local-date');

test('localDateString mengikuti WIB (UTC+7), bukan UTC', () => {
  // 2026-08-02 17:30 UTC = 2026-08-03 00:30 WIB — kalau pakai toISOString().slice(0,10) hasilnya 2026-08-02 (salah sehari).
  const d = new Date('2026-08-02T17:30:00Z');
  assert.equal(localDateString(d), '2026-08-03');
});

test('localDateString malam WIB tetap tanggal yang sama', () => {
  // 2026-08-03 15:00 UTC = 2026-08-03 22:00 WIB.
  const d = new Date('2026-08-03T15:00:00Z');
  assert.equal(localDateString(d), '2026-08-03');
});

test('localMonthStartString menghasilkan tanggal 1 bulan berjalan WIB', () => {
  const d = new Date('2026-08-02T17:30:00Z'); // 3 Agustus WIB
  assert.equal(localMonthStartString(d), '2026-08-01');
});
