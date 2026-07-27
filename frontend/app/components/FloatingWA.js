'use client';

export default function FloatingWA({ phone, message }) {
  if (!phone) return null;
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  const url = `https://wa.me/${clean}?text=${encodeURIComponent(message || 'Halo Admin Anyostore. Saya ingin meminta katalog grosir. Saya mengetahui bahwa minimal pembelian adalah 4 pcs per model. Mohon informasi lebih lanjut.')}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Chat WhatsApp Admin" style={{
      position: 'fixed', zIndex: 90, right: 16, bottom: 16,
      display: 'inline-flex', alignItems: 'center', gap: 8,
      minHeight: 52, padding: '0 16px', borderRadius: 999,
      background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 14,
      boxShadow: '0 12px 28px rgba(0,0,0,.22)', textDecoration: 'none'
    }}>
      <span style={{ fontSize: 20 }}>💬</span> Chat Admin
    </a>
  );
}
