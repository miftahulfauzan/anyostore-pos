const MAX_DATA_UPLOAD_SIZE = 3 * 1024 * 1024;

export function validateDataUpload(file, allowedTypes) {
  if (!file) return 'Pilih file terlebih dahulu.';
  if (!allowedTypes.includes(file.type)) return 'Jenis file tidak didukung.';
  if (file.size > MAX_DATA_UPLOAD_SIZE) return 'Ukuran file maksimal 3 MB.';
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

export async function uploadMediaData(url, file, accessToken) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ filename: file.name, content_type: file.type, data_url: await fileToDataUrl(file) }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || 'Media gagal diunggah');
  return body;
}

export { MAX_DATA_UPLOAD_SIZE };
