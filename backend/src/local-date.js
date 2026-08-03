// Tanggal lokal Asia/Jakarta (UTC+7). `new Date().toISOString().slice(0, 10)`
// memakai UTC, jadi antara 00:00–07:00 WIB "hari ini" bisa salah sehari —
// berdampak ke default rentang laporan dan nomor invoice harian.
const WIB_TIME_ZONE = 'Asia/Jakarta';

function localDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function localMonthStartString(date = new Date()) {
  return `${localDateString(date).slice(0, 8)}01`;
}

module.exports = { localDateString, localMonthStartString };
