const test = require('node:test');
const assert = require('node:assert/strict');
const { easeOutCubic, countValue, formatCount, countDuration } = require('../app/lib/count-up.cjs');

test('count-up mulai dari angka lama dan berakhir tepat di target', () => {
  assert.equal(countValue(0, 100, 0), 0);
  assert.equal(countValue(0, 100, 1), 100);
  assert.equal(countValue(50, 50, 0.5), 50);
  assert.equal(countValue(10, 20, 1), 20);
});

test('count-up tidak pernah melewati target dan naik monoton', () => {
  let previous = -1;
  for (let step = 0; step <= 20; step += 1) {
    const value = countValue(0, 741, step / 20);
    assert.ok(value >= previous, 'nilai harus naik');
    assert.ok(value <= 741, 'nilai tidak boleh melewati target');
    previous = value;
  }
  assert.equal(easeOutCubic(-1), easeOutCubic(0));
  assert.equal(easeOutCubic(2), easeOutCubic(1));
});

test('format angka mengikuti gaya Indonesia dan opsi Rupiah', () => {
  assert.equal(formatCount(72280000, true), 'Rp72.280.000');
  assert.equal(formatCount(72280000, false), '72.280.000');
  assert.equal(formatCount(741.4), '741');
  assert.equal(formatCount(0, true), 'Rp0');
});

test('durasi mengikuti mode gerak: nonaktif = 0, sederhana = singkat', () => {
  assert.equal(countDuration('off', 520), 0);
  assert.equal(countDuration('reduced', 520), 120);
  assert.equal(countDuration('full', 520), 520);
});