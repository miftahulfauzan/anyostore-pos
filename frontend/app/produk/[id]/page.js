'use client';

import { useEffect, useState } from 'react';
import FloatingWA from '../../components/FloatingWA';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function waLink(phone, text) {
  const clean = String(phone || '').replace(/[^0-9+]/g, '').replace(/^0/, '62');
  if (!clean) return '#';
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export default function ProdukDetail({ params }) {
  const id = params?.id;
  const [product, setProduct] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`${api}/public/products/${id}`).then((r) => r.json()).then((b) => b.data || null).catch(() => null),
      fetch(`${api}/public/settings`).then((r) => r.json()).then((b) => b.data || null).catch(() => null),
    ])
      .then(([p, s]) => {
        setProduct(p);
        setSettings(s);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>Memuat produk…</div>;
  if (!product) return <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>Produk tidak ditemukan. <a href="/" style={{ color: '#1e3a5f', fontWeight: 700 }}>Kembali ke katalog</a></div>;

  const media = product.media || [];
  const imgs = media.length ? media : product.photo_path ? [{ path: product.photo_path, media_type: 'image' }] : [];
  const waPhone = settings?.whatsapp || settings?.store_phone || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const prodUrl = `${origin}/produk/${product.id}`;
  const waText = `Halo Admin Anyostore.\n\nSaya tertarik dengan produk berikut.\n\nNama Produk:\n${product.name}\n\nLink Produk:\n${prodUrl}\n\nSaya ingin mengetahui:\n- Harga grosir\n- Stok tersedia\n- Warna yang ready\n- Ukuran yang tersedia\n\nSaya memahami bahwa minimal pembelian adalah 4 pcs per model.\n\nTerima kasih.`;

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', color: '#0f172a' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: '#1e3a5f', color: '#fff', textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 800 }}>
        📦 Minimal pembelian <span style={{ background: '#fff', color: '#1e3a5f', padding: '2px 8px', borderRadius: 999, marginLeft: 6 }}>4 pcs per model</span>
      </div>

      <header style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href="/" style={{ fontWeight: 900, textDecoration: 'none', color: '#0f172a' }}>← Katalog</a>
        <a href="/login" style={{ fontSize: 12, color: '#64748b', textDecoration: 'none' }}>Login</a>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* gallery */}
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', background: '#fff', border: '1px solid #e2e8f0', display: 'grid', placeItems: 'center' }}>
            {imgs[activeImg]?.path ? <img src={`${api.replace('/api','')}${imgs[activeImg].path}`} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ color: '#94a3b8' }}>Tanpa foto</span>}
          </div>
          {imgs.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {imgs.map((m, i) => (
                <button key={i} onClick={() => setActiveImg(i)} style={{ flex: '0 0 64px', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: i === activeImg ? '2px solid #1e3a5f' : '1px solid #e2e8f0', padding: 0, background: '#fff' }}>
                  <img src={`${api.replace('/api','')}${m.path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* info */}
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <p style={{ margin: 0, color: '#2563eb', fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{product.category_name || 'Denim'}</p>
            <h1 style={{ margin: '6px 0 0', fontSize: 24, lineHeight: 1.2 }}>{product.name}</h1>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 12 }}>{product.branch_name} • {product.sku || ''}</p>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <strong style={{ fontSize: 22, color: '#1e3a5f' }}>Rp{Number(product.price || 0).toLocaleString('id-ID')}</strong>
          </div>

          {/* Syarat pembelian grosir - kontras */}
          <div style={{ padding: '12px 14px', borderRadius: 10, background: '#fffbeb', border: '2px solid #f59e0b' }}>
            <strong style={{ display: 'block', color: '#92400e', fontSize: 13, marginBottom: 4 }}>Syarat Pembelian Grosir</strong>
            <span style={{ fontSize: 13, color: '#78350f' }}>Minimal pembelian <strong style={{ background: '#fff', padding: '1px 6px', borderRadius: 999, border: '1px solid #fbbf24' }}>4 pcs untuk setiap model</strong>.</span>
          </div>

          {product.description && <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{product.description}</div>}

          {product.colors?.length || product.variants?.length ? (
            <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: 13 }}>Warna Tersedia</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {(product.colors?.length ? product.colors : product.variants?.map((v) => v.color).filter(Boolean)).map((c) => (
                  <span key={c} style={{ padding: '4px 10px', borderRadius: 999, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 12 }}>{c}</span>
                ))}
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11, color: '#92400e', background: '#fffbeb', border: '1px dashed #fbbf24', padding: '6px 8px', borderRadius: 6 }}>Minimal pembelian <strong>4 pcs per model</strong> — bisa mix warna dalam 1 model.</p>
            </div>
          ) : null}

          {/* CTA besar */}
          <a href={waLink(waPhone, waText)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>
            💬 Tanya via WhatsApp
          </a>
          <p style={{ margin: 0, fontSize: 11, color: '#64748b', textAlign: 'center' }}>Chat admin untuk harga grosir, stok, warna ready. Syarat 4 pcs per model sudah dipahami.</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 4 }}>
            <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}><span style={{ fontSize: 16 }}>📦</span><br /><span style={{ fontSize: 11, fontWeight: 700 }}>Min 4 pcs/model</span></div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}><span style={{ fontSize: 16 }}>🚚</span><br /><span style={{ fontSize: 11, fontWeight: 700 }}>Kirim Nasional</span></div>
            <div style={{ padding: 10, borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', textAlign: 'center' }}><span style={{ fontSize: 16 }}>🏪</span><br /><span style={{ fontSize: 11, fontWeight: 700 }}>Ready Stock</span></div>
          </div>
        </div>
      </main>

      <FloatingWA phone={waPhone} message={waText} />

      <style>{`@media(max-width:720px){main{grid-template-columns:1fr !important;}}`}</style>
    </div>
  );
}
