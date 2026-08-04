'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import FloatingWA from './components/FloatingWA';
import SafeImage from './components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const T = { black: '#1a1a1a', blue: '#1e3a5f', white: '#ffffff', bg: '#fafafa', card: '#ffffff', muted: '#71717a', border: '#e5e7eb' };

const I = {
  box: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>),
  truck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" /><path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>),
  chat: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>),
  chevL: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  chevR: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>),
};

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
const SORTS = [{ value: 'newest', label: 'Terbaru' }, { value: 'price_asc', label: 'Harga Termurah' }, { value: 'price_desc', label: 'Harga Termahal' }, { value: 'name', label: 'Nama A-Z' }];

function seededShuffle(arr, seed) {
  let s = 2166136261; for (let i = 0; i < seed.length; i++) { s ^= seed.charCodeAt(i); s = Math.imul(s, 16777619); }
  const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a;
}
function parsePhotos(paths) {
  if (!paths) return [];
  return String(paths).split('||').filter(Boolean).map((p) => ({ path: p.trim() }));
}
function photoStyle(transform, base) {
  const t = String(transform || '').split(',').map(Number);
  return t.length === 3 && isFinite(t[0]) && (t[0] !== 1 || t[1] !== 0 || t[2] !== 0) ? { objectFit: 'cover', objectPosition: 'center', transform: `translate(${t[1] || 0}%, ${t[2] || 0}%) scale(${t[0]})`, ...base } : { objectFit: 'cover', objectPosition: 'center', ...base };
}

function ProductCard({ product, onWa }) {
  const photos = useMemo(() => {
    const seen = new Set();
    const list = parsePhotos(product.photo_paths).filter((p) => {
      if (seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    });
    return list.length ? list : (product.photo_path ? [{ path: product.photo_path }] : []);
  }, [product.photo_paths, product.photo_path]);
  // Hover: langsung ganti ke foto berikutnya, lalu lanjut tiap 2 detik selama mouse di kartu.
  const [photoIdx, setPhotoIdx] = useState(0);
  const photoTimer = useRef(null);
  function stopCycle() {
    if (photoTimer.current) { clearInterval(photoTimer.current); photoTimer.current = null; }
  }
  function onEnter() {
    if (photos.length <= 1) return;
    stopCycle();
    setPhotoIdx((i) => (i + 1) % photos.length);
    photoTimer.current = setInterval(() => setPhotoIdx((i) => (i + 1) % photos.length), 2000);
  }
  function onLeave() {
    stopCycle();
    setPhotoIdx(0);
  }
  useEffect(() => stopCycle, []);
  const photo = photos[photoIdx] || photos[0];
  const colors = (product.variant_colors || '').split('|').filter(Boolean).slice(0, 4);
  return (
    <article className="pcard" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <a href={`/produk/${product.id}`} className="pcard-img">
        <SafeImage key={photo?.path || 'none'} src={photo ? `${api.replace('/api', '')}${photo.path}` : ''} alt={product.name} style={photoStyle(product.photo_transform, { width: '100%', height: '100%' })} />
        {!photos.length && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.muted, fontSize: 12, background: '#f3f4f6' }}>Tanpa foto</span>}
        {photos.length > 1 && (
          <span className="pcard-dots">
            {photos.map((p, i) => (
              <i key={p.path} className={`pcard-dot${i === photoIdx ? ' active' : ''}`} />
            ))}
          </span>
        )}
      </a>
      <div className="pcard-body">
        <a href={`/produk/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><strong>{product.name}</strong></a>
        <span className="pcard-price">Rp{Number(product.price || 0).toLocaleString('id-ID')}</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {colors.map((c) => <span key={c} className="pcard-color">{c}</span>)}
        </div>
        <div className="pcard-actions">
          <a href={`/produk/${product.id}`} className="pcard-btn primary">Lihat Detail</a>
          <a href="#" onClick={(e) => { e.preventDefault(); onWa(`Saya tertarik dengan ${product.name}`); }} className="pcard-btn secondary">Chat</a>
        </div>
      </div>
    </article>
  );
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
  function pickWa(msg) { if (!waPhones.length) return; setWaMsg(msg); setWaPicker(true); }

  const [today, setToday] = useState('');
  useEffect(() => { setToday(`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`); }, []);
  const slides = useMemo(() => {
    if (!slidesAll.length) return [];
    const hp = slidesAll.filter((p) => p.photo_path);
    return seededShuffle(hp.length >= 10 ? hp : [...hp, ...slidesAll], today).slice(0, 10);
  }, [slidesAll, today]);
  useEffect(() => { if (slideIdx >= slides.length && slides.length) setSlideIdx(0); }, [slides, slideIdx]);
  useEffect(() => { if (slides.length <= 1 || paused) return; const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 5000); return () => clearInterval(t); }, [slides.length, paused]);
  useEffect(() => { document.title = 'Anyostore Grosir PGMTA'; }, []);
  useEffect(() => { Promise.all([fetch(`${api}/public/settings`).then((r) => r.json()).then((b) => b.data).catch(() => null), fetch(`${api}/public/categories`).then((r) => r.json()).then((b) => b.data || []).catch(() => [])]).then(([s, c]) => { setSettings(s); setCategories(c); }); }, []);
  useEffect(() => { setLoading(true); const qs = new URLSearchParams({ limit: '24', page: String(page), ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}), ...(sort ? { sort } : {}) }).toString(); fetch(`${api}/public/products?${qs}`).then((r) => r.json()).then((b) => { setProducts(b.data || []); setTotalPages(b.totalPages || 1); setTotal(b.total || 0); }).catch(() => setProducts([])).finally(() => setLoading(false)); }, [cat, q, sort, page]);
  useEffect(() => { fetch(`${api}/public/products?limit=60`).then((r) => r.json()).then((b) => setSlidesAll(b.data || [])).catch(() => {}); }, []);
  const pages = useMemo(() => { const tp = totalPages; let s = Math.max(1, page - 2); let e = Math.min(tp, s + 4); s = Math.max(1, e - 4); const o = []; for (let i = s; i <= e; i++) o.push(i); return o; }, [page, totalPages]);
  const slide = slides[slideIdx];
  // Hero katalog mini: jendela 3 produk berjalan dari slideshow.
  const group = slides.length
    ? [0, 1, 2].map((offset) => slides[(slideIdx + offset) % slides.length])
    : [];
  return (
    <div style={{ background: T.bg, color: T.black, minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* 1. Top bar */}
      <div style={{ background: T.black, color: '#fff', textAlign: 'center', padding: '6px 16px', fontSize: 11, fontWeight: 500, letterSpacing: '.04em' }}>
        Minimal 4 pcs per model · Grosir langsung dari supplier
      </div>

      {/* 2. Header */}
      <header className="site-header" style={{ position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 800, color: T.black, textDecoration: 'none', letterSpacing: '-.02em' }}>ANYOSTORE</a>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <a href="#produk" style={{ fontSize: 13, fontWeight: 500, color: T.muted, textDecoration: 'none', padding: '8px 12px', borderRadius: 6, transition: 'color .2s' }} onMouseOver={(e) => e.target.style.color = T.black} onMouseOut={(e) => e.target.style.color = T.muted}>Produk</a>
            <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: T.blue, padding: '9px 18px', borderRadius: 6, textDecoration: 'none', transition: 'all .2s', boxShadow: '0 2px 8px rgba(30,58,95,.25)' }} className="hero-btn">Hubungi Admin</a>
          </nav>
        </div>
      </header>

      {/* 3. Hero */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 24px' }}>
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="hero-wrap" style={{ position: 'relative', borderRadius: 14, overflow: 'hidden' }}>
          {slide ? (
            <div key={slideIdx} className="slide-fade hero-b" style={{ minHeight: 500, display: 'grid', gridTemplateColumns: '0.85fr 1.5fr', alignItems: 'center' }}>
              {/* Teks kiri */}
              <div className="hero-text" style={{ padding: '40px 32px', display: 'grid', gap: 14, maxWidth: 430 }}>
                <span className="hero-cat" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase' }}>{slide.category_name || 'Denim'}</span>
                <h1 className="hero-title" style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, lineHeight: 1.15 }}>{slide.name}</h1>
                <strong className="hero-price" style={{ fontSize: 28, fontWeight: 800 }}>Rp{Number(slide.price || 0).toLocaleString('id-ID')}</strong>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <a href={`/produk/${slide.id}`} className="hero-btn btn-primary">Lihat Produk</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); pickWa(`Saya tertarik dengan ${slide.name}`); }} className="hero-btn btn-outline"><I.chat style={{ width: 14, height: 14 }} /> Hubungi Admin</a>
                </div>
              </div>
              {/* Katalog mini 3 produk (gaya sama dengan grid katalog) */}
              <div className="hero-cards">
                {group.map((p) => <ProductCard key={p.id} product={p} onWa={pickWa} />)}
              </div>
            </div>
          ) : <div style={{ padding: 48, textAlign: 'center', color: T.muted }}>Memuat…</div>}
          {slides.length > 1 && (
            <>
              <button aria-label="Prev" onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)} className="slide-arrow left"><I.chevL style={{ width: 18, height: 18 }} /></button>
              <button aria-label="Next" onClick={() => setSlideIdx((i) => (i + 1) % slides.length)} className="slide-arrow right"><I.chevR style={{ width: 18, height: 18 }} /></button>
            </>
          )}
        </div>
        {slides.length > 1 && (
          <div className="hero-dots" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 12 }}>
            {slides.map((s, i) => <button key={s.id} onClick={() => setSlideIdx(i)} className={`hero-dot${i === slideIdx ? ' active' : ''}`} aria-label={`Slide ${i + 1}`} title={`Slide ${i + 1}`} />)}
          </div>
        )}
      </section>

      {/* 4. Feature strip */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 8px', display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', color: T.muted, fontSize: 13 }}>
        <span><I.box style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6, color: T.blue }} />Min 4 pcs/model</span>
        <span><I.truck style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6, color: T.blue }} />Pengiriman nasional</span>
        <span><I.chat style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6, color: T.blue }} />Konsultasi via WhatsApp</span>
      </div>

      {/* 5. Category chips */}
      {categories.length > 0 && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 16px 4px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          <button onClick={() => { setCat(''); setPage(1); }} style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${!cat ? T.black : T.border}`, background: !cat ? T.black : T.card, color: !cat ? T.white : T.muted, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .2s' }}>Semua</button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => { setCat(String(c.id)); setPage(1); }} style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${String(c.id) === cat ? T.black : T.border}`, background: String(c.id) === cat ? T.black : T.card, color: String(c.id) === cat ? T.white : T.muted, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .2s' }}>{c.name}</button>
          ))}
        </div>
      )}

      {/* 6. Katalog */}
      <section id="produk" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 48px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: T.black }}>Produk Kami</h2>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: T.muted }}>{total} produk tersedia</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <I.search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: T.muted, pointerEvents: 'none' }} />
            <input placeholder="Cari produk…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: '100%', height: 44, paddingLeft: 40, paddingRight: 14, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 14 }} />
          </div>
          <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} style={{ height: 44, minWidth: 140, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 13, padding: '0 12px' }}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ height: 44, minWidth: 140, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 13, padding: '0 12px' }}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="pcard-grid">
          {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} className="pcard-skeleton" />)}
          {!loading && products.map((p) => <ProductCard key={p.id} product={p} onWa={pickWa} />)}
        </div>
        {!loading && !products.length && <p style={{ textAlign: 'center', color: T.muted, marginTop: 32, fontSize: 15 }}>Tidak ada produk ditemukan.</p>}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 32 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="page-btn"><I.chevL style={{ width: 14, height: 14 }} /></button>
            {pages.map((p) => <button key={p} onClick={() => setPage(p)} className={`page-btn${p === page ? ' active' : ''}`}>{p}</button>)}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="page-btn"><I.chevR style={{ width: 14, height: 14 }} /></button>
          </div>
        )}
      </section>

      {/* 7. CTA */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 48px' }}>
        <div style={{ borderRadius: 14, padding: '48px 32px', textAlign: 'center', background: T.blue, color: T.white }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: T.white }}>Siap order grosir?</h2>
          <p style={{ margin: '0 auto 20px', maxWidth: 440, color: 'rgba(255,255,255,.82)', fontSize: 15, lineHeight: 1.6 }}>Konsultasi harga, stok, dan warna langsung dengan admin via WhatsApp.</p>
          <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} className="hero-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 30px', borderRadius: 10, background: T.white, color: T.blue, fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}>Hubungi Admin</a>
        </div>
      </section>

      {/* 8. Footer */}
      <footer style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 48px', borderTop: `1px solid ${T.border}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 32 }}>
          <div>
            <strong style={{ fontSize: 16, fontWeight: 800, color: T.black }}>ANYOSTORE</strong>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: T.muted, lineHeight: 1.6 }}>Supplier baju denim grosir wanita. Minimal 4 pcs per model.</p>
          </div>
          <div>
            <strong style={{ fontSize: 13, fontWeight: 700, color: T.black, textTransform: 'uppercase', letterSpacing: '.06em', fontSize: 11 }}>Navigasi</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <a href="#produk" style={{ fontSize: 13, color: T.muted, textDecoration: 'none' }}>Produk</a>
              <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} style={{ fontSize: 13, color: T.muted, textDecoration: 'none' }}>Hubungi Admin</a>
              <a href="/login" style={{ fontSize: 13, color: T.muted, textDecoration: 'none' }}>Login Pegawai</a>
            </div>
          </div>
          <div>
            <strong style={{ fontSize: 13, fontWeight: 700, color: T.black, textTransform: 'uppercase', letterSpacing: '.06em' }}>Kontak</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {waPhones.map((ph, i) => (
                <a key={i} href={waLink(ph, '')} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: T.muted, textDecoration: 'none' }}>Admin {i + 1}: {ph}</a>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.muted, textAlign: 'center' }}>
          © {today.slice(0, 4) || new Date().getFullYear()} Anyostore. All rights reserved.
        </div>
      </footer>

      {/* WA picker modal */}
      {waPicker && (
        <div onClick={() => setWaPicker(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 14, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.black }}>Pilih Admin WhatsApp</h3>
              <button onClick={() => setWaPicker(false)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 16, lineHeight: 1, cursor: 'pointer', color: T.muted, display: 'grid', placeItems: 'center' }} aria-label="Tutup">×</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {waPhones.map((ph, idx) => (
                <a key={idx} href={waLink(ph, waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => setWaPicker(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 8, background: T.blue, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 2px 8px rgba(30,58,95,.2)', transition: 'all .2s' }}><I.chat style={{ width: 16, height: 16 }} /> Admin {idx + 1} — {ph}</a>
              ))}
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 12, color: T.muted, textAlign: 'center' }}>Pilih admin untuk chat harga grosir & stok.</p>
          </div>
        </div>
      )}

      <FloatingWA phones={waPhones} message="Halo Anyostore, saya ingin order grosir." />

      <style>{`
        .site-header { background: rgba(255,255,255,.92); border-bottom: 1px solid rgba(229,231,235,.8); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .btn-primary { display: inline-flex; align-items: center; gap: 6; min-height: 44px; padding: 0 22px; border-radius: 12px; background: ${T.blue}; color: #fff; font-weight: 700; font-size: 14px; text-decoration: none; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(30,58,95,.3); transition: all .35s cubic-bezier(.4,0,.2,1); }
        .btn-primary:hover { background: #152d4a; box-shadow: 0 8px 24px rgba(30,58,95,.4); transform: translateY(-2px); }
        .btn-primary:active { transform: scale(.97); }
        .btn-outline { display: inline-flex; align-items: center; gap: 6; min-height: 44px; padding: 0 22px; border-radius: 12px; background: #fff; color: ${T.blue}; font-weight: 700; font-size: 14px; text-decoration: none; border: 1.5px solid rgba(30,58,95,.35); cursor: pointer; transition: all .35s cubic-bezier(.4,0,.2,1); }
        .btn-outline:hover { background: ${T.blue}; color: #fff; border-color: ${T.blue}; transform: translateY(-2px); }
        .btn-outline:active { transform: scale(.97); }
        .hero-btn { transition: all .35s cubic-bezier(.4,0,.2,1); }
        .hero-btn:hover { transform: translateY(-2px); }
        .hero-btn:active { transform: scale(.97); }
        .hero-wrap { background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 55%, #e0e7ff 100%); }
        .slide-fade { animation: slideIn .5s cubic-bezier(.4,0,.2,1); }
        .hero-cat { color: #1e3a5f; }
        .hero-title { color: #1a1a1a; }
        .hero-price { color: #1e3a5f; }
        .hero-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 28px 28px 32px 0; min-width: 0; }
        .hero-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 999px; border: none; padding: 0; cursor: pointer; background: #d1d5db; transition: all .3s cubic-bezier(.4,0,.2,1); }
        .hero-dot.active { width: 24px; background: #1a1a1a; }
        @keyframes slideIn { from { opacity: 0; transform: scale(.985) translateY(10px); } to { opacity: 1; transform: none; } }
        .slide-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255,255,255,.3); background: rgba(255,255,255,.15); backdrop-filter: blur(12px); color: #fff; cursor: pointer; display: grid; place-items: center; box-shadow: 0 4px 16px rgba(0,0,0,.2); z-index: 5; transition: all .35s cubic-bezier(.4,0,.2,1); -webkit-backdrop-filter: blur(12px); }
        .slide-arrow:hover { transform: translateY(-50%) scale(1.08); background: rgba(255,255,255,.3); box-shadow: 0 6px 24px rgba(0,0,0,.3); }
        .slide-arrow.left { left: 14px; }
        .slide-arrow.right { right: 14px; }
        .pcard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .pcard { display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; background: #fff; border: 1px solid #e5e7eb; transition: all .3s cubic-bezier(.4,0,.2,1); box-shadow: 0 1px 3px rgba(0,0,0,.04); }
        .pcard:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(15,23,42,.08); border-color: #d1d5db; }
        .pcard:active { transform: scale(.985); }
        .pcard-img { display: grid; place-items: center; aspect-ratio: 3/4; overflow: hidden; position: relative; background: #f3f4f6; }
        .pcard-img img { animation: photoIn .35s ease; }
        .pcard-dots { position: absolute; left: 0; right: 0; bottom: 8px; display: flex; justify-content: center; gap: 4px; z-index: 2; pointer-events: none; }
        .pcard-dot { width: 5px; height: 5px; border-radius: 999px; background: rgba(255,255,255,.7); box-shadow: 0 0 0 1px rgba(0,0,0,.18); transition: all .25s cubic-bezier(.4,0,.2,1); }
        .pcard-dot.active { width: 14px; background: #fff; }
        @keyframes photoIn { from { opacity: .25; } to { opacity: 1; } }
        .pcard-body { padding: 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .pcard-body strong { font-size: 14px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pcard-price { color: ${T.blue}; font-weight: 700; font-size: 16px; }
        .pcard-color { padding: 2px 8px; border-radius: 4px; background: rgba(30,58,95,.08); font-size: 11px; color: #52525b; }
        .pcard-actions { display: flex; gap: 12px; margin-top: auto; padding-top: 10px; }
        .pcard-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; transition: all .3s cubic-bezier(.4,0,.2,1); }
        .pcard-btn.primary { background: ${T.blue}; color: #fff; border: none; }
        .pcard-btn.primary:hover { background: #152d4a; transform: translateY(-1px); }
        .pcard-btn.secondary { background: #fff; color: ${T.blue}; border: 1.5px solid rgba(30,58,95,.3); }
        .pcard-btn.secondary:hover { background: ${T.blue}; color: #fff; border-color: ${T.blue}; }
        .pcard-skeleton { height: 380px; border-radius: 16px; background: linear-gradient(135deg, rgba(243,244,246,.8), rgba(243,244,246,.4)); }
        .page-btn { min-width: 42px; min-height: 42px; border-radius: 10px; border: 1.5px solid #cbd5e1; background: #fff; font-weight: 600; font-size: 14px; color: ${T.black}; cursor: pointer; transition: all .3s cubic-bezier(.4,0,.2,1); display: inline-flex; align-items: center; justify-content: center; }
        .page-btn:hover { border-color: ${T.blue}; color: ${T.blue}; background: rgba(255,255,255,.8); }
        .page-btn.active { background: ${T.blue}; color: ${T.white}; border-color: ${T.blue}; box-shadow: 0 2px 8px rgba(30,58,95,.25); }
        .wa-modal-in { animation: modalIn .35s cubic-bezier(.4,0,.2,1); }
        @keyframes modalIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
        @media (max-width: 900px) {
          .pcard-grid { grid-template-columns: repeat(3, 1fr); }
          .hero-wrap { min-height: 0 !important; }
          .slide-fade { grid-template-columns: 1fr !important; min-height: 0 !important; }
          .hero-text { padding: 26px 22px 6px !important; max-width: 100% !important; gap: 10px !important; }
          .hero-b { grid-template-columns: 1fr !important; min-height: 0 !important; }
          .hero-cards { display: flex !important; overflow-x: auto !important; gap: 12px !important; padding: 4px 20px 26px !important; }
          .hero-cards .pcard { flex: 0 0 140px; }
        }
        @media (max-width: 600px) {
          .pcard-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .hero-dots { gap: 4px; margin-top: 10px; }
          .hero-dot { width: 6px; height: 6px; }
          .hero-dot.active { width: 16px; }
        }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      `}</style>
    </div>
  );
}
