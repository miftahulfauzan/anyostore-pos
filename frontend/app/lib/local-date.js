// Tanggal lokal Asia/Jakarta (WIB) — jangan pakai toISOString().slice(0,10)
// (UTC) untuk "hari ini", karena antara 00:00–07:00 WIB hasilnya salah sehari.
const WIB_TIME_ZONE = 'Asia/Jakarta';

export function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function localMonthStartString(date = new Date()) {
  return `${localDateString(date).slice(0, 8)}01`;
}
