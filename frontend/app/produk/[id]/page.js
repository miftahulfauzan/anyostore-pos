'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import FloatingWA from '../../components/FloatingWA';
import SafeImage from '../../components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const C = { white: '#ffffff', bg: '#f8fafc', ink: '#0f172a', muted: '#64748b', border: '#e2e8f0', accent: '#1e3a5f', accentLight: '#eef2ff' };

const I = {
  box: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>),
  truck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" /><path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>),
  chat: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>),
  store: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9l1-5h16l1 5" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /></svg>),
};

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export default function ProdukDetail() {
  const params = useParams();
  const id = params?.id;
  const [product, setProduct] = useState(null);
  const [settings, setSettings] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Detail Produk — Anyostore';
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      fetch(`${api}/public/products/${id}`).then((r) => r.json()).then((b) => b.data || null).catch(() => null),
      fetch(`${api}/public/settings`).then((r) => r.json()).then((b) => b.data || null).catch(() => null),
    ])
      .then(([p, s]) => { setProduct(p); setSettings(s); })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', fontFamily: "'DM Sans', sans-serif" }}>Memuat produk…</div>;
  if (!product) return <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto', fontFamily: "'DM Sans', sans-serif" }}>Produk tidak ditemukan. <a href="/" style={{ color: C.accent, fontWeight: 700 }}>Kembali ke katalog</a></div>;

  const media = product.media || [];
  const variants = product.variants || [];
  const imgs = [
    ...media.map((m) => ({ path: m.path, color: null })),
    ...variants.filter((v) => v.photo_path).map((v) => ({ path: v.photo_path, color: v.color })),
  ];
  const waPhones = settings?.whatsapp_numbers?.length ? settings.whatsapp_numbers : [];
  const waPhone = settings?.whatsapp || settings?.store_phone || '';
  if (!waPhones.length && waPhone) waPhones.push(waPhone);

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <header style={{ background: C.white, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ fontSize: 14, fontWeight: 600, color: C.ink, textDecoration: 'none' }}>← Katalog</a>
          <span style={{ fontSize: 13, color: C.muted }}>{product.branch_name || ''}</span>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>
        {/* gallery */}
        <div style={{ display: 'grid', gap: 10 }} className="m-fade-up">
          <div style={{ borderRadius: 12, overflow: 'hidden', background: C.white, border: `1px solid ${C.border}`, display: 'grid', placeItems: 'center', minHeight: 380 }}>
            <SafeImage src={imgs[activeImg]?.path ? `${api.replace('/api','')}${imgs[activeImg].path}` : ''} alt={product.name} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'cover', objectPosition: 'center', ...((imgs[activeImg]?.transform||'').trim() ? (() => { const t = (imgs[activeImg].transform||'').split(',').map(Number); return { objectFit: 'cover', transform: `translate(${t[1]||0}px, ${t[2]||0}px) scale(${t[0]})` }; })() : {}) }} />
          </div>
          {imgs.length > 1 && (
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {imgs.map((m, i) => (
                <button key={`${m.path}-${i}`} onClick={() => setActiveImg(i)} title={m.color || ''} style={{ flex: '0 0 56px', width: 56, height: 56, borderRadius: 6, overflow: 'hidden', border: i === activeImg ? `2px solid ${C.accent}` : `1px solid ${C.border}`, padding: 0, background: C.white }}>
                  <SafeImage src={`${api.replace('/api','')}${m.path}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* info */}
        <div style={{ display: 'grid', gap: 16 }} className="m-fade-up">
          <div>
            <p style={{ margin: 0, color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{product.category_name || 'Denim'}</p>
            <h1 style={{ margin: '6px 0 0', fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 26, fontWeight: 400, lineHeight: 1.15 }}>{product.name}</h1>
            <p style={{ margin: '6px 0 0', color: C.muted, fontSize: 13 }}>{product.sku || ''}</p>
          </div>

          <strong style={{ fontSize: 24, color: C.accent }}>Rp{Number(product.price || 0).toLocaleString('id-ID')}</strong>

          

          <div style={{ padding: '12px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, color: C.muted }}>
            Minimal pembelian <strong style={{ color: C.ink }}>4 pcs per model</strong>. Bisa mix warna.
          </div>

          {variants.length > 0 && (
            <div style={{ padding: 14, borderRadius: 8, background: C.white, border: `1px solid ${C.border}` }}>
              <strong style={{ fontSize: 13, color: C.ink }}>Warna Tersedia</strong>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {variants.map((v, i) => (
                  <span key={i} onClick={() => { if (v.photo_path) { const idx = imgs.findIndex((m) => m.path === v.photo_path); if (idx >= 0) setActiveImg(idx); } }} style={{ padding: '4px 10px', borderRadius: 6, background: C.accentLight, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, cursor: v.photo_path ? 'pointer' : 'default', color: C.accent }}>{v.color || 'Warna'}</span>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div style={{ display: 'grid', gap: 8 }}>
            {waPhones.map((ph, idx) => (
              <a key={idx} href={waLink(ph, `Saya tertarik dengan ${product.name}. Link: /produk/${product.id}. Harga grosir, stok, warna ready?`)} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 8, background: C.accent, color: C.white, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                <I.chat style={{ width: 16, height: 16 }} /> WA Admin {waPhones.length > 1 ? `${idx + 1}` : ''} — {ph}
              </a>
            ))}
          </div>
          <p style={{ margin: 0, fontSize: 11, color: C.muted, textAlign: 'center' }}>Chat admin untuk harga grosir, stok, warna ready.</p>

          {/* trust strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[{ icon: I.box, label: 'Min 4 pcs/model' }, { icon: I.truck, label: 'Kirim Nasional' }, { icon: I.store, label: 'Ready Stock' }].map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: `1px solid ${C.border}`, borderRadius: 6, background: C.white, justifyContent: 'center' }}>
                <it.icon style={{ width: 15, height: 15, color: C.muted }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: C.ink }}>{it.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {product.description && (
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px 24px' }}>
          <div style={{ padding: 20, borderRadius: 10, background: C.white, border: `1px solid ${C.border}` }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>Deskripsi Produk</h2>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: '#334155', whiteSpace: 'pre-wrap' }}>{product.description}</div>
          </div>
        </section>
      )}

      <FloatingWA phones={waPhones} message={`Saya tertarik dengan ${product.name}. Harga grosir, stok, warna ready?`} />

      <style>{`@media(max-width:720px){main{grid-template-columns:1fr !important;}}`}</style>
    </div>
  );
}
