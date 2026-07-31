'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import FloatingWA from './components/FloatingWA';
import SafeImage from './components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const T = { black: '#1a1a1a', bronze: '#c8956a', bg: '#fafafa', card: '#ffffff', muted: '#6b7280', border: '#e5e7eb' };

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
function parsePhotos(paths, single) {
  if (paths) return paths.split('||').filter(Boolean).map((p) => ({ path: p.trim() }));
  if (single) return [{ path: single }]; return [];
}

function ProductCard({ product, onWa }) {
  const photos = useMemo(() => parsePhotos(product.photo_paths, product.photo_path), [product.photo_paths, product.photo_path]);
  const colors = (product.variant_colors || '').split('|').filter(Boolean).slice(0, 4);
  return (
    <article className="pcard">
      <a href={`/produk/${product.id}`} className="pcard-img">
        <SafeImage src={photos[0] ? `${api.replace('/api', '')}${photos[0].path}` : ''} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
        {!photos.length && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.muted, fontSize: 12, background: '#f3f4f6' }}>Tanpa foto</span>}
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

  const today = `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`;
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
  const slidePhotos = useMemo(() => parsePhotos(slide?.photo_paths, slide?.photo_path), [slide?.photo_paths, slide?.photo_path]);

  return (
    <div style={{ background: T.bg, color: T.black, minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* 1. Top bar */}
      <div style={{ background: '#111', color: '#fff', textAlign: 'center', padding: '6px 16px', fontSize: 11, fontWeight: 500, letterSpacing: '.04em' }}>
        Minimal 4 pcs per model · Grosir langsung dari supplier
      </div>

      {/* 2. Header */}
      <header className="site-header" style={{ position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontSize: 18, fontWeight: 800, color: T.black, textDecoration: 'none', letterSpacing: '-.02em' }}>ANYOSTORE</a>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <a href="#produk" style={{ fontSize: 13, fontWeight: 500, color: T.muted, textDecoration: 'none', padding: '8px 12px', borderRadius: 6, transition: 'color .2s' }} onMouseOver={(e) => e.target.style.color = T.black} onMouseOut={(e) => e.target.style.color = T.muted}>Produk</a>
            <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} style={{ fontSize: 13, fontWeight: 600, color: '#fff', background: T.black, padding: '9px 18px', borderRadius: 6, textDecoration: 'none', transition: 'background .2s' }} className="hero-btn">Hubungi Kami</a>
          </nav>
        </div>
      </header>

      {/* 3. Hero */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 24px' }}>
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} className="hero-wrap" style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', background: T.card, display: 'grid', gridTemplateColumns: '1fr 1fr', height: 400 }}>
          {slide ? (
            <div key={slide.id} className="slide-fade" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%', height: '100%' }}>
              <div style={{ padding: '44px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: T.bronze }}>{slide.category_name || 'Denim'}</span>
                <h1 style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 700, lineHeight: 1.15, color: T.black }}>{slide.name}</h1>
                <strong style={{ fontSize: 28, fontWeight: 800, color: T.bronze }}>Rp{Number(slide.price || 0).toLocaleString('id-ID')}</strong>
                <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                  <a href={`/produk/${slide.id}`} className="hero-btn btn-primary">Lihat Produk</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); pickWa(`Saya tertarik dengan ${slide.name}`); }} className="hero-btn btn-outline"><I.chat style={{ width: 14, height: 14 }} /> Hubungi Admin</a>
                </div>
              </div>
              <div style={{ position: 'relative', borderLeft: `1px solid ${T.border}`, background: '#f3f4f6', overflow: 'hidden' }}>
                {slidePhotos.length > 0 ? (
                  <div style={{ position: 'absolute', inset: 0 }}>
                    {slidePhotos.map((ph, i) => (
                      <SafeImage key={i} src={`${api.replace('/api', '')}${ph.path}`} alt={slide.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: i === 0 ? 1 : 0, transition: 'opacity .5s' }} />
                    ))}
                  </div>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.muted, fontSize: 13 }}>Foto produk</div>
                )}
              </div>
            </div>
          ) : <div style={{ gridColumn: '1/-1', padding: 48, textAlign: 'center', color: T.muted }}>Memuat…</div>}
          {slides.length > 1 && (
            <>
              <button aria-label="Prev" onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)} className="slide-arrow left"><I.chevL style={{ width: 18, height: 18 }} /></button>
              <button aria-label="Next" onClick={() => setSlideIdx((i) => (i + 1) % slides.length)} className="slide-arrow right"><I.chevR style={{ width: 18, height: 18 }} /></button>
            </>
          )}
        </div>
        {slides.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14 }}>
            {slides.map((s, i) => <button key={s.id} onClick={() => setSlideIdx(i)} style={{ width: i === slideIdx ? 28 : 8, height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', background: i === slideIdx ? T.black : '#d1d5db', transition: 'all .3s cubic-bezier(.4,0,.2,1)' }} />)}
          </div>
        )}
      </section>

      {/* 4. Feature strip */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 8px', display: 'flex', justifyContent: 'center', gap: 28, flexWrap: 'wrap', color: T.muted, fontSize: 13 }}>
        <span><I.box style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6, color: T.bronze }} />Min 4 pcs/model</span>
        <span><I.truck style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6, color: T.bronze }} />Pengiriman nasional</span>
        <span><I.chat style={{ width: 14, height: 14, verticalAlign: '-2px', marginRight: 6, color: T.bronze }} />Konsultasi via WhatsApp</span>
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
        <div style={{ borderRadius: 14, padding: '48px 32px', textAlign: 'center', background: T.black, color: T.white }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700 }}>Siap order grosir?</h2>
          <p style={{ margin: '0 auto 20px', maxWidth: 440, color: '#9ca3af', fontSize: 15, lineHeight: 1.6 }}>Konsultasi harga, stok, dan warna langsung dengan admin via WhatsApp.</p>
          <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} className="hero-btn btn-primary" style={{ background: T.bronze, padding: '0 28px', fontSize: 15 }}>Chat Admin Sekarang</a>
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
              <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} style={{ fontSize: 13, color: T.muted, textDecoration: 'none' }}>Hubungi Kami</a>
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
          © {new Date().getFullYear()} Anyostore. All rights reserved.
        </div>
      </footer>

      {/* WA picker modal */}
      {waPicker && (
        <div onClick={() => setWaPicker(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 12, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 16, color: T.black }}>Pilih Admin WhatsApp</strong>
              <button onClick={() => setWaPicker(false)} style={{ border: 'none', background: 'transparent', fontSize: 20, lineHeight: 1, cursor: 'pointer', color: T.muted }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {waPhones.map((ph, idx) => (
                <a key={idx} href={waLink(ph, waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => setWaPicker(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 8, background: idx === 0 ? T.black : '#f3f4f6', color: idx === 0 ? T.white : T.black, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}><I.chat style={{ width: 16, height: 16 }} /> Admin {idx + 1} — {ph}</a>
              ))}
            </div>
          </div>
        </div>
      )}

      <FloatingWA phones={waPhones} message="Halo Anyostore, saya ingin order grosir." />

      <style>{`
        .site-header { background: rgba(255,255,255,.9); backdrop-filter: blur(12px); border-bottom: 1px solid ${T.border}; }
        .btn-primary { display: inline-flex; align-items: center; gap: 6; minHeight: 44px; padding: 0 20px; border-radius: 8; background: ${T.black}; color: ${T.white}; font-weight: 600; font-size: 13; text-decoration: none; border: none; cursor: pointer; transition: all .2s; }
        .btn-primary:hover { background: #333; }
        .btn-outline { display: inline-flex; align-items: center; gap: 6; minHeight: 44px; padding: 0 20px; border-radius: 8; background: transparent; color: ${T.black}; font-weight: 500; font-size: 13; text-decoration: none; border: 1px solid ${T.border}; cursor: pointer; transition: all .2s; }
        .btn-outline:hover { border-color: ${T.black}; }
        .hero-btn { transition: transform .18s cubic-bezier(.4,0,.2,1), box-shadow .18s; }
        .hero-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.1); }
        .hero-btn:active { transform: scale(.98); }
        .slide-fade { animation: slideIn .45s cubic-bezier(.4,0,.2,1); }
        @keyframes slideIn { from { opacity: 0; transform: scale(.985) translateY(8px); } to { opacity: 1; transform: none; } }
        .slide-arrow { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; border: none; background: ${T.card}; color: ${T.black}; cursor: pointer; display: grid; place-items: center; box-shadow: 0 4px 16px rgba(0,0,0,.12); z-index: 5; transition: transform .15s, box-shadow .15s; }
        .slide-arrow:hover { transform: translateY(-50%) scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,.16); }
        .slide-arrow.left { left: 14px; }
        .slide-arrow.right { right: 14px; }
        .pcard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .pcard { display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: ${T.card}; border: 1px solid ${T.border}; transition: transform .25s cubic-bezier(.4,0,.2,1), box-shadow .25s cubic-bezier(.4,0,.2,1); }
        .pcard:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.08); }
        .pcard:active { transform: scale(.985); }
        .pcard-img { display: grid; place-items: center; aspect-ratio: 3/4; overflow: hidden; position: relative; background: #f3f4f6; }
        .pcard-body { padding: 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .pcard-body strong { font-size: 14px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pcard-price { color: ${T.bronze}; font-weight: 700; font-size: 16px; }
        .pcard-color { padding: 2px 8px; border-radius: 4px; background: #f3f4f6; font-size: 11px; color: ${T.muted}; }
        .pcard-actions { display: flex; gap: 8; margin-top: auto; padding-top: 8px; }
        .pcard-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; min-height: 36px; border-radius: 6; font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; transition: all .2s; }
        .pcard-btn.primary { background: ${T.black}; color: ${T.white}; border: none; }
        .pcard-btn.primary:hover { background: #333; }
        .pcard-btn.secondary { background: transparent; color: ${T.black}; border: 1px solid ${T.border}; }
        .pcard-btn.secondary:hover { border-color: ${T.black}; }
        .pcard-skeleton { height: 380px; border-radius: 12px; background: #f3f4f6; }
        .page-btn { min-width: 40px; min-height: 40px; border-radius: 6px; border: 1px solid ${T.border}; background: ${T.card}; font-weight: 500; font-size: 13; cursor: pointer; transition: all .2s; }
        .page-btn:hover { border-color: ${T.black}; }
        .page-btn.active { background: ${T.black}; color: ${T.white}; border-color: ${T.black}; }
        @keyframes slideIn { from { opacity: 0; transform: scale(.985) translateY(8px); } to { opacity: 1; transform: none; } }
        .wa-modal-in { animation: modalIn .3s cubic-bezier(.4,0,.2,1); }
        @keyframes modalIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
        @media (max-width: 900px) { .pcard-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .pcard-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; } .hero-wrap { grid-template-columns: 1fr !important; height: auto !important; } }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      `}</style>
    </div>
  );
}
