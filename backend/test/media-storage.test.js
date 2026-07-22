const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeDataUpload, decodeMediaFromStorage, encodeMediaForStorage } = require('../src/media-storage');

const onePixelPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('decodeDataUpload preserves valid PNG bytes', () => {
  const file = decodeDataUpload(
    { filename: 'pixel.png', content_type: 'image/png', data_url: `data:image/png;base64,${onePixelPng}` },
    { fileSize: 1024, mimeTypes: ['image/png'] }
  );
  assert.equal(file.mimetype, 'image/png');
  assert.equal(file.originalname, 'pixel.png');
  assert.deepEqual([...file.buffer.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test('decodeDataUpload rejects mismatched binary signatures', () => {
  assert.throws(
    () => decodeDataUpload(
      { filename: 'fake.jpg', content_type: 'image/jpeg', data_url: `data:image/jpeg;base64,${onePixelPng}` },
      { fileSize: 1024, mimeTypes: ['image/jpeg'] }
    ),
    /Isi file tidak sesuai/
  );
});

test('database encoding round-trip preserves non-ASCII media bytes', () => {
  const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0x00, 0x80]);
  const stored = encodeMediaForStorage({ mimetype: 'image/png', buffer: original });
  assert.equal(stored.contentType, 'image/png;base64');
  assert.match(stored.data, /^[A-Za-z0-9+/=]+$/);
  const served = decodeMediaFromStorage({ content_type: stored.contentType, data: Buffer.from(stored.data, 'ascii') });
  assert.equal(served.contentType, 'image/png');
  assert.deepEqual(served.data, original);
});
