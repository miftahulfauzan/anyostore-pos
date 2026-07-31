'use client';

import { useState } from 'react';

function cleanNum(phone) {
  return String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
}

export default function FloatingWA({ phone, phones, message }) {
  const list = Array.isArray(phones) && phones.length ? phones : phone ? [phone] : [];
  const [open, setOpen] = useState(false);
  if (!list.length) return null;

  const defaultMsg = message || 'Halo Admin Anyostore. Saya ingin meminta katalog grosir. Saya mengetahui bahwa minimal pembelian adalah 4 pcs per model. Mohon informasi lebih lanjut.';

  if (list.length === 1) {
    const url = `https://wa.me/${cleanNum(list[0])}?text=${encodeURIComponent(defaultMsg)}`;
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

  return (
    <div style={{ position: 'fixed', zIndex: 90, right: 16, bottom: 16, display: 'grid', gap: 8, justifyItems: 'end' }}>
      {open && (
        <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 12px 28px rgba(0,0,0,.18)', minWidth: 200 }}>
          <strong style={{ fontSize: 12 }}>Pilih Admin</strong>
          {list.map((ph, i) => {
            const url = `https://wa.me/${cleanNum(ph)}?text=${encodeURIComponent(defaultMsg)}`;
            return <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', color: '#166534', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Admin {i + 1} <span>{ph}</span></a>;
          })}
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Chat WhatsApp" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 52, padding: '0 16px', borderRadius: 999, background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 14, border: 0, boxShadow: '0 12px 28px rgba(0,0,0,.22)', cursor: 'pointer' }}>
        <span style={{ fontSize: 20 }}>💬</span> Chat Admin {list.length > 1 ? `(${list.length})` : ''}
      </button>
    </div>
  );
}

