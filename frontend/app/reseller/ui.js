// Gaya ringkas untuk halaman pembeli reseller (login, daftar, akun, lacak).
// Dipisah supaya lima halaman memakai tampilan yang sama tanpa globals.css baru.
export const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export const T = {
  black: '#1a1a1a',
  blue: '#1e3a5f',
  bg: '#fafafa',
  card: '#ffffff',
  muted: '#71717a',
  border: '#e5e7eb',
};

export const pageStyle = {
  minHeight: '100vh',
  background: T.bg,
  color: T.black,
  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
  padding: '24px 16px 48px',
};

export const shellStyle = {
  maxWidth: 520,
  margin: '0 auto',
  display: 'grid',
  gap: 14,
};

export const cardStyle = {
  background: T.card,
  border: `1px solid ${T.border}`,
  borderRadius: 14,
  padding: 18,
  display: 'grid',
  gap: 10,
};

export const labelStyle = { display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 600, color: T.muted };

export const inputStyle = {
  minHeight: 42,
  padding: '9px 12px',
  borderRadius: 9,
  border: `1px solid ${T.border}`,
  font: 'inherit',
  fontSize: 13.5,
  color: T.black,
  background: '#fff',
};

export const primaryButton = {
  minHeight: 44,
  padding: '10px 16px',
  borderRadius: 9,
  border: 0,
  background: T.blue,
  color: '#fff',
  font: 'inherit',
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
};

export const secondaryButton = {
  ...primaryButton,
  background: '#fff',
  color: T.blue,
  border: `1px solid ${T.blue}`,
};

export const linkStyle = { color: T.blue, fontWeight: 700, textDecoration: 'none', fontSize: 13 };

export const STATUS_LABEL = {
  new: 'Pesanan diterima',
  confirmed: 'Dikonfirmasi admin',
  paid: 'Sudah dibayar',
  shipped: 'Dikirim',
  done: 'Selesai',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
};

export const PAYMENT_LABEL = {
  unpaid: 'Belum dibayar',
  waiting_verification: 'Menunggu verifikasi',
  paid: 'Sudah dibayar',
};

export const rp = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;

export const shortDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};