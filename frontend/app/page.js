'use client';

import { useEffect, useMemo, useState } from 'react';
import FloatingWA from './components/FloatingWA';
import SafeImage from './components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const MIN_ORDER_BADGE = 'Minimal 4 pcs / model';

const ICON = {
  box: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>),
  truck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" /><path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>),
  chat: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>),
  store: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9l1-5h16l1 5" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>),
  chevL: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  chevR: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
  arrow: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>),
};

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function waTemplateProduct(product, origin) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/produk/${product.id}` : `${origin || ''}/produk/${product.id}`;
  return `Halo Admin Anyostore.\n\nSaya tertarik dengan produk berikut.\n\nNama Produk:\n${product.name}\n\nLink Produk:\n${url}\n\nSaya ingin mengetahui:\n- Harga grosir\n- Stok tersedia\n- Warna yang ready\n- Ukuran yang tersedia\n\nSaya memahami bahwa minimal pembelian adalah 4 pcs per model.\n\nTerima kasih.`;
}

const SORTS = [
  { value: 'newest', label: 'Terbaru' },
  { value: 'price_asc', label: 'Harga Termurah' },
  { value: 'price_desc', label: 'Harga Termahal' },
  { value: 'name', label: 'Nama A-Z' },
];

export default function LandingPage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [waPicker, setWaPicker] = useState(false);
  const [waMsg, setWaMsg] = useState('');

  const waPhone = settings?.whatsapp || settings?.store_phone || '';
  const waPhones = settings?.whatsapp_numbers?.length ? settings.whatsapp_numbers : waPhone ? [waPhone] : [];

  function pickWa(msg) {
    if (!waPhones.length) return;
    setWaMsg(msg);
    setWaPicker(true);
  }

  useEffect(() => {
    Promise.all([
      fetch(`${api}/public/settings`).then((r) => r.json()).then((b) => b.data).catch(() => null),
      fetch(`${api}/public/categories`).then((r) => r.json()).then((b) => b.data || []).catch(() => []),
    ]).then(([s, cats]) => {
      setSettings(s);
      setCategories(cats);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '48', page: String(page), ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}), ...(sort ? { sort } : {}) }).toString();
    fetch(`${api}/public/products?${qs}`)
      .then((r) => r.json())
      .then((b) => {
        setProducts(b.data || []);
        setTotalPages(b.totalPages || 1);
        setTotal(b.total || 0);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [cat, q, sort, page]);

  const katalogWA = useMemo(() => `Halo Admin Anyostore.\n\nSaya ingin meminta katalog grosir.\n\nSaya mengetahui bahwa minimal pembelian adalah 4 pcs per model.\n\nMohon informasi lebih lanjut.`, []);

  const pages = useMemo(() => {
    const tp = totalPages;
    let start = Math.max(1, page - 2);
    let end = Math.min(tp, start + 4);
    start = Math.max(1, end - 4);
    const out = [];
    for (let i = start; i <= end; i++) out.push(i);
    return out;
  }, [page, totalPages]);

  return (
    <div style={{ background: 'linear-gradient(180deg,#eef3fb 0%,#f8fafc 240px,#f8fafc 100%)', color: '#1e293b', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}>
      {/* top minimal order banner */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#1e3a5f', color: '#fff', textAlign: 'center', padding: '7px 12px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <ICON.box style={{ width: 15, height: 15 }} /> Minimal pembelian <span style={{ background: '#fff', color: '#1e3a5f', padding: '2px 8px', borderRadius: 999, marginLeft: 6 }}>4 pcs per model</span> — Grosir langsung dari supplier
      </div>

      <header className="glass-nav" style={{ position: 'sticky', top: 36, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 1200, margin: '0 auto', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900, fontSize: 18, color: '#1e3a5f' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, background: '#1e3a5f', color: '#fff' }}><ICON.store style={{ width: 18, height: 18 }} /></span>
          Anyostore <span style={{ fontWeight: 600, color: '#64748b', fontSize: 12, marginLeft: 2 }}>Grosir Denim</span>
        </div>
        <nav style={{ display: 'flex', gap: 8 }}>
          <a href="#produk" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 10, background: '#1e3a5f', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Lihat Produk</a>
          <a href="#" onClick={(e) => { e.preventDefault(); pickWa(katalogWA); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: 'rgba(255,255,255,.7)', color: '#1e3a5f', fontWeight: 700, textDecoration: 'none', fontSize: 13, cursor: 'pointer' }}><ICON.chat style={{ width: 16, height: 16 }} /> Chat Admin</a>
        </nav>
      </header>

      {/* HERO */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 16px 18px', display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 28, alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <span style={{ display: 'inline-flex', alignSelf: 'start', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: 'rgba(37,99,235,.1)', color: '#2563eb', fontWeight: 800, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase' }}>Supplier Baju Denim Wanita</span>
          <h1 style={{ margin: 0, fontSize: 'clamp(30px,5vw,48px)', lineHeight: 1.05, letterSpacing: '-.03em', fontWeight: 800, color: '#0f172a' }}>Supplier Baju Denim Wanita <span style={{ color: '#1e3a5f' }}>Grosir</span></h1>
          <p style={{ margin: 0, color: '#475569', fontSize: 16, lineHeight: 1.6, maxWidth: 520 }}>Belanja grosir langsung dari supplier dengan kualitas terbaik. Ready stock, pengiriman seluruh Indonesia, konsultasi warna & stok via WhatsApp.</p>

          <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 12, background: '#fffbeb', border: '2px solid #f59e0b', width: 'fit-content' }}>
            <ICON.box style={{ width: 18, height: 18, color: '#d97706' }} />
            <strong style={{ color: '#92400e' }}>Minimal pembelian 4 pcs per model</strong>
            <span style={{ fontSize: 12, color: '#a16207', background: '#fef3c7', padding: '2px 8px', borderRadius: 999 }}>Wajib untuk semua model</span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
            <a href="#produk" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 46, padding: '0 20px', borderRadius: 10, background: '#1e3a5f', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Lihat Produk <ICON.arrow style={{ width: 16, height: 16, marginLeft: 8 }} /></a>
            <a href="#" onClick={(e) => { e.preventDefault(); pickWa(katalogWA); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 20px', borderRadius: 10, background: '#25D366', color: '#fff', fontWeight: 800, textDecoration: 'none' }}><ICON.chat style={{ width: 18, height: 18 }} /> Chat Admin</a>
          </div>

          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 6, color: '#64748b', fontSize: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ICON.truck style={{ width: 16, height: 16 }} /> Kirim Seluruh Indonesia</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ICON.store style={{ width: 16, height: 16 }} /> Ready Stock</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><ICON.chat style={{ width: 16, height: 16 }} /> Konsultasi WA</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 18px 40px rgba(30,58,95,.12)', minHeight: 280, display: 'grid', placeItems: 'center' }}>
            {products[0]?.photo_path ? <SafeImage src={`${api.replace('/api','')}${products[0].photo_path}`} alt={products[0].name} style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }} /> : <span style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Foto produk unggulan</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.7)' }}><span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(37,99,235,.1)', color: '#2563eb' }}><ICON.box style={{ width: 18, height: 18 }} /></span><div><strong style={{ display: 'block', fontSize: 12 }}>Min Order</strong><span style={{ fontSize: 12, color: '#475569' }}>4 pcs / model</span></div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.7)' }}><span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(249,115,22,.12)', color: '#ea580c' }}><ICON.store style={{ width: 18, height: 18 }} /></span><div><strong style={{ display: 'block', fontSize: 12 }}>Grosir</strong><span style={{ fontSize: 12, color: '#475569' }}>Harga khusus</span></div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.7)' }}><span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(37,99,235,.1)', color: '#2563eb' }}><ICON.truck style={{ width: 18, height: 18 }} /></span><div><strong style={{ display: 'block', fontSize: 12 }}>Kirim</strong><span style={{ fontSize: 12, color: '#475569' }}>Seluruh Indonesia</span></div></div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.7)' }}><span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 9, background: 'rgba(34,197,94,.12)', color: '#16a34a' }}><ICON.chat style={{ width: 18, height: 18 }} /></span><div><strong style={{ display: 'block', fontSize: 12 }}>WA</strong><span style={{ fontSize: 12, color: '#475569' }}>Fast respon</span></div></div>
          </div>
        </div>
      </section>

      {/* INFO 4 ICON */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 16px 18px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { icon: ICON.box, title: 'Minimal Order', desc: '4 pcs / model' },
          { icon: ICON.truck, title: 'Kirim', desc: 'Seluruh Indonesia' },
          { icon: ICON.store, title: 'Ready Stock', desc: 'Stok real toko' },
          { icon: ICON.chat, title: 'Konsultasi WA', desc: 'Fast respon admin' },
        ].map((it) => (
          <div key={it.title} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 16px', borderRadius: 12, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 6px 18px rgba(30,58,95,.06)' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 10, background: 'rgba(37,99,235,.1)', color: '#2563eb' }}>{it.icon({ width: 20, height: 20 })}</span>
            <div><strong style={{ display: 'block', fontSize: 13 }}>{it.title}</strong><span style={{ fontSize: 12, color: '#64748b' }}>{it.desc}</span></div>
          </div>
        ))}
      </section>

      {/* KATALOG */}
      <section id="produk" style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 16px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>Katalog Produk</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Data langsung dari database Toko Metro • {MIN_ORDER_BADGE} • {total} produk</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <ICON.search style={{ position: 'absolute', left: 12, width: 16, height: 16, color: '#94a3b8', pointerEvents: 'none' }} />
              <input placeholder="Cari produk…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minHeight: 42, minWidth: 200, paddingLeft: 36, paddingRight: 12, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14 }} />
            </div>
            <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} style={{ minHeight: 42, minWidth: 150, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14, padding: '0 10px' }}>
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ minHeight: 42, minWidth: 150, borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14, padding: '0 10px' }}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
          {loading && Array.from({ length: 12 }).map((_, i) => <div key={i} style={{ height: 300, borderRadius: 16, background: 'rgba(255,255,255,.6)' }} />)}
          {!loading && products.map((p) => {
            const colors = (p.variant_colors || '').split('|').filter(Boolean).slice(0, 6);
            const img = p.photo_path ? `${api.replace('/api','')}${p.photo_path}` : '';
            const waMsg = `Halo Admin Anyostore. Saya tertarik dengan ${p.name}. Link: ${typeof window !== 'undefined' ? window.location.origin : ''}/produk/${p.id}. Saya paham minimal 4 pcs per model.`;
            return (
              <article key={p.id} className="product-card" style={{ display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden', background: 'rgba(255,255,255,.72)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,.7)', boxShadow: '0 8px 24px rgba(30,58,95,.08)' }}>
                <div style={{ position: 'relative', aspectRatio: '1/1', background: '#eef2f7', overflow: 'hidden' }}>
                  <SafeImage src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  <span style={{ position: 'absolute', left: 8, top: 8, padding: '4px 8px', borderRadius: 999, background: '#fff', border: '1px solid #f59e0b', color: '#92400e', fontSize: 10, fontWeight: 800 }}>Min 4 pcs / model</span>
                  {Number(p.total_stock || 0) > 0 ? <span style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700 }}>Ready</span> : <span style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontSize: 10, fontWeight: 700 }}>Tanya stok</span>}
                </div>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <strong style={{ fontSize: 13, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: '#0f172a' }}>{p.name}</strong>
                  <span style={{ color: '#1e3a5f', fontWeight: 800, fontSize: 15 }}>Rp{Number(p.price || 0).toLocaleString('id-ID')}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 18 }}>
                    {colors.map((c) => <span key={c} style={{ padding: '2px 6px', borderRadius: 999, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 10 }}>{c}</span>)}
                    {!colors.length && <span style={{ fontSize: 11, color: '#94a3b8' }}>Varian warna tersedia</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginTop: 2 }}>
                    <a href={`/produk/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 38, borderRadius: 9, background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>Lihat Detail</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); pickWa(waMsg); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 38, padding: '0 10px', borderRadius: 9, background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 12, textDecoration: 'none', cursor: 'pointer' }}>WA</a>
                  </div>
                  <span style={{ fontSize: 10, color: '#92400e', background: '#fffbeb', border: '1px dashed #fbbf24', padding: '4px 6px', borderRadius: 6, textAlign: 'center' }}>Minimal pembelian <strong>4 pcs per model</strong></span>
                </div>
              </article>
            );
          })}
        </div>
        {!loading && !products.length && <p style={{ textAlign: 'center', color: '#64748b', marginTop: 20 }}>Tidak ada produk di cabang Metro.</p>}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 24, flexWrap: 'wrap' }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 40, padding: '0 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? .5 : 1 }}><ICON.chevL style={{ width: 16, height: 16 }} /> Seb</button>
            {pages[0] > 1 && <button onClick={() => setPage(1)} style={{ minWidth: 40, minHeight: 40, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>1</button>}
            {pages[0] > 2 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
            {pages.map((p) => (
              <button key={p} onClick={() => setPage(p)} style={{ minWidth: 40, minHeight: 40, borderRadius: 10, border: p === page ? '1px solid #1e3a5f' : '1px solid #e2e8f0', background: p === page ? '#1e3a5f' : '#fff', color: p === page ? '#fff' : '#1e293b', fontWeight: 700, cursor: 'pointer' }}>{p}</button>
            ))}
            {pages[pages.length - 1] < totalPages - 1 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
            {pages[pages.length - 1] < totalPages && <button onClick={() => setPage(totalPages)} style={{ minWidth: 40, minHeight: 40, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>{totalPages}</button>}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 40, padding: '0 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? .5 : 1 }}>Lanj <ICON.chevR style={{ width: 16, height: 16 }} /></button>
          </div>
        )}
      </section>

      <footer style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 16px 90px', color: '#64748b', fontSize: 12, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>© {new Date().getFullYear()} Anyostore • Supplier Baju Denim Wanita Grosir • Minimal 4 pcs per model</span>
        <span><a href="/login" style={{ color: '#1e3a5f', fontWeight: 700 }}>Login Pegawai</a></span>
      </footer>

      {waPicker && (
        <div onClick={() => setWaPicker(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 20, maxWidth: 360, width: '100%', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 15 }}>Pilih Admin WhatsApp</strong>
              <button onClick={() => setWaPicker(false)} aria-label="Tutup" style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: '#64748b' }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {waPhones.map((ph, idx) => (
                <a key={idx} href={waLink(ph, waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => setWaPicker(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 10, background: idx === 0 ? '#25D366' : '#dcfce7', color: idx === 0 ? '#fff' : '#166534', fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
                  <ICON.chat style={{ width: 18, height: 18 }} /> WA Admin {idx + 1} — {ph}
                </a>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b', textAlign: 'center' }}>Pilih admin untuk chat harga grosir & stok.</p>
          </div>
        </div>
      )}

      <FloatingWA phones={waPhones} message={`Halo Admin Anyostore.\n\nSaya ingin meminta katalog grosir.\n\nSaya mengetahui bahwa minimal pembelian adalah 4 pcs per model.\n\nMohon informasi lebih lanjut.`} />

      <style>{`
        .glass-nav { backdrop-filter: blur(12px); background: rgba(255,255,255,.72); border-bottom: 1px solid rgba(30,58,95,.08); }
        .product-card { transition: transform .2s ease, box-shadow .2s ease; }
        .product-card:hover { transform: translateY(-4px); box-shadow: 0 16px 34px rgba(30,58,95,.16); }
        a, button { -webkit-tap-highlight-color: transparent; }
        @media (max-width: 720px) {
          header.glass-nav + section { grid-template-columns: 1fr !important; }
          section#produk > div:first-child { flex-direction: column; align-items: stretch !important; }
          div[style*="repeat(4,1fr)"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="repeat(auto-fill"] { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .product-card { transition: none; }
        }
      `}</style>
    </div>
  );
}
