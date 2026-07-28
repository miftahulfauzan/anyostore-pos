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
  chevL: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  chevR: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
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

function seededShuffle(arr, seed) {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619); }
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

  const [slidesAll, setSlidesAll] = useState([]);
  const [slideIdx, setSlideIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const waPhone = settings?.whatsapp || settings?.store_phone || '';
  const waPhones = settings?.whatsapp_numbers?.length ? settings.whatsapp_numbers : waPhone ? [waPhone] : [];

  function pickWa(msg) {
    if (!waPhones.length) return;
    setWaMsg(msg);
    setWaPicker(true);
  }

  const today = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;
  const slides = useMemo(() => (slidesAll.length ? seededShuffle(slidesAll, today).slice(0, 10) : []), [slidesAll, today]);

  useEffect(() => { if (slideIdx >= slides.length && slides.length) setSlideIdx(0); }, [slides, slideIdx]);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length, paused]);

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

  useEffect(() => {
    fetch(`${api}/public/products?limit=60`)
      .then((r) => r.json())
      .then((b) => setSlidesAll(b.data || []))
      .catch(() => setSlidesAll([]));
  }, []);

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

  const slide = slides[slideIdx];

  return (
    <div style={{ background: '#ffffff', color: '#0f172a', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}>
      {/* top minimal order banner */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#1e3a5f', color: '#fff', textAlign: 'center', padding: '7px 12px', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <ICON.box style={{ width: 15, height: 15 }} /> Minimal pembelian <span style={{ background: '#fff', color: '#1e3a5f', padding: '2px 8px', borderRadius: 999, marginLeft: 6 }}>4 pcs per model</span> — Grosir langsung dari supplier
      </div>

      <header className="site-header" style={{ position: 'sticky', top: 33, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 1200, margin: '0 auto', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900, fontSize: 20, color: '#1e3a5f', letterSpacing: '-.02em' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 36, height: 36, borderRadius: 10, background: '#1e3a5f', color: '#fff' }}><ICON.store style={{ width: 19, height: 19 }} /></span>
          Anyostore
        </div>
        <nav style={{ display: 'flex', gap: 8 }}>
          <a href="#produk" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 42, padding: '0 16px', borderRadius: 10, background: '#1e3a5f', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Lihat Produk</a>
          <a href="#" onClick={(e) => { e.preventDefault(); pickWa(katalogWA); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 16px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#fff', color: '#1e3a5f', fontWeight: 700, textDecoration: 'none', fontSize: 13, cursor: 'pointer' }}><ICON.chat style={{ width: 16, height: 16 }} /> Chat Admin</a>
        </nav>
      </header>

      {/* HERO SLIDESHOW */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px 8px' }}>
        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', background: 'linear-gradient(135deg,#13243d 0%,#1e3a5f 55%,#2563eb 100%)', color: '#fff', minHeight: 460, display: 'grid', gridTemplateColumns: '1.05fr .95fr', alignItems: 'center', gap: 24, padding: '40px 44px' }}
        >
          {slide ? (
            <div key={slide.id} className="slide-fade" style={{ display: 'grid', gridTemplateColumns: '1.05fr .95fr', alignItems: 'center', gap: 24, width: '100%' }}>
              <div style={{ display: 'grid', gap: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase', color: '#bfdbfe' }}>{slide.category_name || 'Denim'}</span>
                <h1 style={{ margin: 0, fontSize: 'clamp(28px,4vw,44px)', lineHeight: 1.08, letterSpacing: '-.03em', fontWeight: 800 }}>{slide.name}</h1>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <strong style={{ fontSize: 28, fontWeight: 800 }}>Rp{Number(slide.price || 0).toLocaleString('id-ID')}</strong>
                  <span style={{ fontSize: 12, color: '#cbd5e1' }}>/ pcs · grosir</span>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a href={`/produk/${slide.id}`} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 46, padding: '0 22px', borderRadius: 11, background: '#fff', color: '#1e3a5f', fontWeight: 800, textDecoration: 'none' }}>Lihat Produk <ICON.arrow style={{ width: 16, height: 16, marginLeft: 8 }} /></a>
                  <a href="#" onClick={(e) => { e.preventDefault(); pickWa(waTemplateProduct(slide, '')); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 46, padding: '0 22px', borderRadius: 11, background: 'rgba(255,255,255,.14)', color: '#fff', fontWeight: 800, textDecoration: 'none', border: '1px solid rgba(255,255,255,.3)' }}><ICON.chat style={{ width: 18, height: 18 }} /> Chat Admin</a>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#bfdbfe', background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', padding: '6px 12px', borderRadius: 999, width: 'fit-content' }}><ICON.box style={{ width: 13, height: 13 }} /> Minimal 4 pcs per model</span>
              </div>
              <div style={{ borderRadius: 16, overflow: 'hidden', background: '#fff', display: 'grid', placeItems: 'center', minHeight: 360, padding: 10 }}>
                <SafeImage src={slide.photo_path ? `${api.replace('/api','')}${slide.photo_path}` : ''} alt={slide.name} style={{ width: '100%', height: 'auto', maxHeight: 380, objectFit: 'contain', display: 'block' }} />
              </div>
            </div>
          ) : (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#cbd5e1' }}>Memuat produk unggulan…</div>
          )}

          {/* Arrows */}
          {slides.length > 1 && (
            <>
              <button aria-label="Sebelumnya" onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.16)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><ICON.chevL style={{ width: 20, height: 20 }} /></button>
              <button aria-label="Berikutnya" onClick={() => setSlideIdx((i) => (i + 1) % slides.length)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.16)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><ICON.chevR style={{ width: 20, height: 20 }} /></button>
            </>
          )}
        </div>
        {/* Dots */}
        {slides.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
            {slides.map((s, i) => (
              <button key={s.id} aria-label={`Slide ${i + 1}`} onClick={() => setSlideIdx(i)} style={{ width: i === slideIdx ? 26 : 9, height: 9, borderRadius: 999, border: 'none', cursor: 'pointer', background: i === slideIdx ? '#1e3a5f' : '#cbd5e1', transition: 'width .2s ease, background .2s ease' }} />
            ))}
          </div>
        )}
      </section>

      {/* VALUE PROPS */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 16px 4px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { icon: ICON.box, title: 'Minimal Order', desc: '4 pcs / model' },
          { icon: ICON.truck, title: 'Kirim', desc: 'Seluruh Indonesia' },
          { icon: ICON.store, title: 'Ready Stock', desc: 'Stok real toko' },
          { icon: ICON.chat, title: 'Konsultasi WA', desc: 'Fast respon admin' },
        ].map((it) => (
          <div key={it.title} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '16px 18px', borderRadius: 14, background: '#f8fafc', border: '1px solid #eef2f7' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 40, height: 40, borderRadius: 11, background: '#eef2ff', color: '#2563eb' }}>{it.icon({ width: 20, height: 20 })}</span>
            <div><strong style={{ display: 'block', fontSize: 13 }}>{it.title}</strong><span style={{ fontSize: 12, color: '#64748b' }}>{it.desc}</span></div>
          </div>
        ))}
      </section>

      {/* KATALOG */}
      <section id="produk" style={{ maxWidth: 1200, margin: '0 auto', padding: '26px 16px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 26, letterSpacing: '-.02em' }}>Katalog Produk</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Data langsung dari database Toko Metro • {MIN_ORDER_BADGE} • {total} produk</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <ICON.search style={{ position: 'absolute', left: 12, width: 16, height: 16, color: '#94a3b8', pointerEvents: 'none' }} />
              <input placeholder="Cari produk…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minHeight: 44, minWidth: 200, paddingLeft: 36, paddingRight: 12, borderRadius: 11, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14 }} />
            </div>
            <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} style={{ minHeight: 44, minWidth: 150, borderRadius: 11, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14, padding: '0 10px' }}>
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ minHeight: 44, minWidth: 150, borderRadius: 11, border: '1px solid #cbd5e1', background: '#fff', fontSize: 14, padding: '0 10px' }}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
          {loading && Array.from({ length: 12 }).map((_, i) => <div key={i} style={{ height: 300, borderRadius: 16, background: '#f1f5f9' }} />)}
          {!loading && products.map((p) => {
            const colors = (p.variant_colors || '').split('|').filter(Boolean).slice(0, 6);
            const img = p.photo_path ? `${api.replace('/api','')}${p.photo_path}` : '';
            const waMsg = `Halo Admin Anyostore. Saya tertarik dengan ${p.name}. Link: ${typeof window !== 'undefined' ? window.location.origin : ''}/produk/${p.id}. Saya paham minimal 4 pcs per model.`;
            return (
              <article key={p.id} className="product-card" style={{ display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden', background: '#fff', border: '1px solid #eef2f7', boxShadow: '0 6px 18px rgba(15,23,42,.05)' }}>
                <div style={{ position: 'relative', aspectRatio: '1/1', background: '#f8fafc', overflow: 'hidden' }}>
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
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 42, padding: '0 14px', borderRadius: 11, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? .5 : 1 }}><ICON.chevL style={{ width: 16, height: 16 }} /> Seb</button>
            {pages[0] > 1 && <button onClick={() => setPage(1)} style={{ minWidth: 42, minHeight: 42, borderRadius: 11, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>1</button>}
            {pages[0] > 2 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
            {pages.map((p) => (
              <button key={p} onClick={() => setPage(p)} style={{ minWidth: 42, minHeight: 42, borderRadius: 11, border: p === page ? '1px solid #1e3a5f' : '1px solid #e2e8f0', background: p === page ? '#1e3a5f' : '#fff', color: p === page ? '#fff' : '#0f172a', fontWeight: 700, cursor: 'pointer' }}>{p}</button>
            ))}
            {pages[pages.length - 1] < totalPages - 1 && <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>}
            {pages[pages.length - 1] < totalPages && <button onClick={() => setPage(totalPages)} style={{ minWidth: 42, minHeight: 42, borderRadius: 11, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>{totalPages}</button>}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 42, padding: '0 14px', borderRadius: 11, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 700, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? .5 : 1 }}>Lanj <ICON.chevR style={{ width: 16, height: 16 }} /></button>
          </div>
        )}
      </section>

      <footer style={{ maxWidth: 1200, margin: '0 auto', padding: '22px 16px 90px', color: '#64748b', fontSize: 12, borderTop: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
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
        .site-header { background: rgba(255,255,255,.85); backdrop-filter: blur(12px); border-bottom: 1px solid #eef2f7; }
        .product-card { transition: transform .2s ease, box-shadow .2s ease; }
        .product-card:hover { transform: translateY(-4px); box-shadow: 0 16px 34px rgba(15,23,42,.1); }
        .slide-fade { animation: slideFade .5s ease; }
        @keyframes slideFade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        a, button { -webkit-tap-highlight-color: transparent; }
        @media (max-width: 720px) {
          header.site-header + section { }
          div[style*="gridTemplateColumns: '1.05fr .95fr'"], .slide-fade { grid-template-columns: 1fr !important; }
          section#produk > div:first-child { flex-direction: column; align-items: stretch !important; }
          div[style*="repeat(4,1fr)"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="repeat(auto-fill"] { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .product-card, .slide-fade { transition: none; animation: none; }
        }
      `}</style>
    </div>
  );
}
