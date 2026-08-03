'use client';
import { useState } from 'react';

// Pop-up pilih varian + jumlah: dipakai Mutasi Stok & Transfer Stok supaya
// produk ber-varian bisa langsung masuk keranjang dengan warna dan qty.
export default function StockVariantPicker({ product, onClose, onAdd }) {
  const [variantId, setVariantId] = useState(product?.variants?.[0]?.id || null);
  const [qty, setQty] = useState(1);
  const variant = product?.variants?.find((v) => v.id === variantId) || null;
  if (!product) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'grid', placeItems: 'center', zIndex: 80, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, maxWidth: 420, width: '100%', padding: 20, display: 'grid', gap: 14, boxShadow: '0 20px 50px rgba(15,23,42,.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 15, display: 'block' }}>{product.name}</strong>
            <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{product.sku || 'Tanpa SKU'}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#1e3a5f', color: '#fff', display: 'grid', placeItems: 'center', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div>
          <strong style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Pilih varian (warna)</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(product.variants || []).map((v) => (
              <button key={v.id} type="button" onClick={() => setVariantId(v.id)} style={{ padding: '7px 12px', borderRadius: 999, border: v.id === variantId ? '1.5px solid #1e3a5f' : '1px solid #d1d5db', background: v.id === variantId ? '#1e3a5f' : '#f8fafc', color: v.id === variantId ? '#ffffff' : '#334155', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                {v.color} <span style={{ opacity: .75, fontWeight: 600 }}>({v.stock})</span>
              </button>
            ))}
          </div>
        </div>
        <label>Jumlah<input type="number" min="1" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} style={{ minHeight: 40 }} /></label>
        <button type="button" onClick={() => onAdd(product, variant, qty)} style={{ minHeight: 44, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>
          Tambah ke Keranjang · {qty} pcs
        </button>
      </div>
    </div>
  );
}
