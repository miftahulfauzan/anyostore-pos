const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('./db');

const useDatabase = () => process.env.MEDIA_STORAGE === 'database';
const useMemoryStorage = () => useDatabase();
const cleanExtension = (filename) => path.extname(filename || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
const makeFilename = (file) => `${Date.now()}-${crypto.randomUUID()}${cleanExtension(file.originalname)}`;

function matchesSignature(buffer, mimetype) {
  if (mimetype === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimetype === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (mimetype === 'video/mp4') return buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp';
  if (mimetype === 'video/webm') return buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  return false;
}

function decodeDataUpload(payload, { fileSize, mimeTypes }) {
  const mimetype = String(payload?.content_type || '').toLowerCase();
  const originalname = path.basename(String(payload?.filename || 'media'));
  const dataUrl = String(payload?.data_url || '');
  if (!mimeTypes.includes(mimetype)) throw Object.assign(new Error('Jenis file tidak didukung'), { status: 400 });
  const match = dataUrl.match(/^data:([^;,]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match || match[1].toLowerCase() !== mimetype) throw Object.assign(new Error('Data media tidak valid'), { status: 400 });
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > fileSize) throw Object.assign(new Error(`Ukuran media maksimal ${Math.floor(fileSize / 1024 / 1024)} MB`), { status: 400 });
  if (!matchesSignature(buffer, mimetype)) throw Object.assign(new Error('Isi file tidak sesuai dengan format media'), { status: 400 });
  return { buffer, mimetype, originalname };
}

function encodeMediaForStorage(file) {
  return { contentType: `${file.mimetype};base64`, data: file.buffer.toString('base64') };
}

function decodeMediaFromStorage(entry) {
  const encoded = String(entry.content_type || '').endsWith(';base64');
  return {
    contentType: encoded ? entry.content_type.slice(0, -';base64'.length) : entry.content_type,
    data: encoded ? Buffer.from(Buffer.isBuffer(entry.data) ? entry.data.toString('ascii') : String(entry.data), 'base64') : entry.data,
  };
}

function createMediaUpload(folder, { fileSize, mimeTypes }) {
  let storage;
  if (useMemoryStorage()) {
    storage = multer.memoryStorage();
  } else {
    const directory = path.join(process.cwd(), 'uploads', folder);
    fs.mkdirSync(directory, { recursive: true });
    storage = multer.diskStorage({
      destination: (_req, _file, callback) => callback(null, directory),
      filename: (_req, file, callback) => callback(null, makeFilename(file)),
    });
  }

  return multer({
    storage,
    limits: { fileSize },
    fileFilter: (_req, file, callback) => callback(null, mimeTypes.includes(file.mimetype)),
  });
}

async function persistUploadedFile(file, folder) {
  if (!file) return null;
  if (!useDatabase()) {
    if (!file.filename) {
      const directory = path.join(process.cwd(), 'uploads', folder);
      await fs.promises.mkdir(directory, { recursive: true });
      file.filename = makeFilename(file);
      file.path = path.join(directory, file.filename);
      await fs.promises.writeFile(file.path, file.buffer);
    }
    return `/uploads/${folder}/${file.filename}`;
  }

  const filename = makeFilename(file);
  const key = `${folder}/${filename}`;
  // TiDB's serverless connection path can coerce raw non-ASCII Buffer bytes to
  // UTF-8. Persist Base64 ASCII and decode it when serving to preserve bytes.
  const stored = encodeMediaForStorage(file);
  await db.execute(
    `INSERT INTO media_files (\`key\`, content_type, data)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE content_type = VALUES(content_type), data = VALUES(data)`,
    [key, stored.contentType, stored.data]
  );
  file.filename = filename;
  file.storageKey = key;
  return `/uploads/${key}`;
}

async function removeMedia(publicPath) {
  if (!publicPath?.startsWith('/uploads/')) return;
  if (useDatabase()) {
    await db.execute('DELETE FROM media_files WHERE `key` = ?', [publicPath.slice('/uploads/'.length)]);
    return;
  }
  await fs.promises.unlink(path.join(process.cwd(), publicPath.replace(/^\/+/, ''))).catch(() => {});
}

async function discardUploadedFile(file) {
  if (!file || useMemoryStorage() || !file.path) return;
  await fs.promises.unlink(file.path).catch(() => {});
}

async function serveBlob(req, res, next) {
  if (!useDatabase()) return next();
  try {
    const key = decodeURIComponent(req.path.replace(/^\/+/, ''));
    const [rows] = await db.execute('SELECT content_type, data FROM media_files WHERE `key` = ? LIMIT 1', [key]);
    const entry = rows[0];
    if (!entry) return res.status(404).end();
    const media = decodeMediaFromStorage(entry);
    res.set({
      'Content-Type': media.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    });
    return res.send(media.data);
  } catch (error) {
    return next(error);
  }
}

module.exports = { createMediaUpload, decodeDataUpload, decodeMediaFromStorage, discardUploadedFile, encodeMediaForStorage, persistUploadedFile, removeMedia, serveBlob };
