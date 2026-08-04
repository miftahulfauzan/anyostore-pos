const MAX_DATA_UPLOAD_SIZE = 3 * 1024 * 1024;
const MAX_COMPRESS_DIMENSION = 1600;

export function validateDataUpload(file, allowedTypes) {
  if (!file) return 'Pilih file terlebih dahulu.';
  if (!allowedTypes.includes(file.type)) return 'Jenis file tidak didukung.';
  // Video tetap dibatasi 3 MB. Gambar di atas batas dikompres otomatis oleh compressImage.
  if (file.type.startsWith('video/') && file.size > MAX_DATA_UPLOAD_SIZE) return 'Ukuran video maksimal 3 MB.';
  return '';
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('File tidak dapat dibaca. Silakan pilih ulang.'));
    reader.readAsDataURL(file);
  });
}

// Kompres gambar >3 MB (atau > MAX_COMPRESS_DIMENSION) menjadi JPEG/WebP
// yang muat di bawah batas upload. Gambar kecil dikembalikan apa adanya.
export function compressImage(file, { maxBytes = MAX_DATA_UPLOAD_SIZE, maxDimension = MAX_COMPRESS_DIMENSION } = {}) {
  if (!file || !file.type.startsWith('image/')) return Promise.resolve(file);
  if (file.size <= maxBytes) return Promise.resolve(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Browser tidak mendukung kompresi gambar'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Coba format yang paling kecil: WebP > JPEG. Turunkan kualitas sampai muat.
        const tryFormats = file.type === 'image/webp' ? ['image/webp', 'image/jpeg'] : ['image/webp', 'image/jpeg'];
        const attempts = [];
        let quality = 0.82;
        for (let i = 0; i < 6; i++) {
          for (const type of tryFormats) {
            try {
              const dataUrl = canvas.toDataURL(type, quality);
              const bytes = Math.round((dataUrl.length - 'data:'.length) * 3 / 4);
              if (bytes <= maxBytes) {
                return resolve({ dataUrl, bytes, name: file.name.replace(/\.(jpe?g|png|webp)$/i, '.jpg'), type: 'image/jpeg' });
              }
              attempts.push({ type, quality, bytes });
            } catch { /* format tidak didukung → coba berikutnya */ }
          }
          quality -= 0.12;
        }
        // Jika semua percobaan masih terlalu besar, ambil yang paling kecil.
        if (attempts.length) {
          const best = attempts.sort((a, b) => a.bytes - b.bytes)[0];
          const dataUrl = canvas.toDataURL(best.type, best.quality);
          return resolve({ dataUrl, bytes: best.bytes, name: file.name.replace(/\.(jpe?g|png|webp)$/i, '.jpg'), type: 'image/jpeg' });
        }
        reject(new Error('Gambar tidak dapat dikompres. Silakan pilih gambar lain.'));
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Gambar tidak dapat dibaca.')); };
    img.src = objectUrl;
  });
}

// Upload media. Gambar besar otomatis dikompres sebelum dikirim.
export async function uploadMediaData(url, file, accessToken) {
  let dataUrl;
  let contentType = file.type;
  let filename = file.name;
  if (file.type.startsWith('image/') && file.size > MAX_DATA_UPLOAD_SIZE) {
    const compressed = await compressImage(file);
    if (compressed.dataUrl) {
      dataUrl = compressed.dataUrl;
      contentType = compressed.type || 'image/jpeg';
      filename = compressed.name || filename;
    } else {
      dataUrl = await fileToDataUrl(file);
    }
  } else {
    dataUrl = await fileToDataUrl(file);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json'},
    body: JSON.stringify({ filename, content_type: contentType, data_url: dataUrl }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Media gagal diunggah');
  return body;
}

export { MAX_DATA_UPLOAD_SIZE };
