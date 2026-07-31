'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import FloatingWA from './components/FloatingWA';
import SafeImage from './components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const C = {
  white: '#ffffff',
  bg: '#f8fafc',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  accent: '#1e3a5f',
  accentLight: '#eef2ff',
  green: '#16a34a',
  greenLight: '#dcfce7',
};

const I = {
  box: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>),
  truck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" /><path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>),
  chat: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>),
  store: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9l1-5h16l1 5" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>),
  chevL: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  chevR: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
  arrow: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>),
};

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function parsePhotos(photoPaths, transformStr) {
  if (!photoPaths) return [];
  const paths = photoPaths.split('||').filter(Boolean);
  return paths.map((path) => ({ path: path.trim() }));
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
  for (let i = a.length - 1; i > 0; i--) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function ProductCard({ product }) {
  const [hoverIdx, setHoverIdx] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const intervalRef = useRef(null);
  const photos = useMemo(() => parsePhotos(product.photo_paths), [product.photo_paths]);
  const hasMultiple = photos.length > 1;

  useEffect(() => {
    if (isHovered && hasMultiple) {
      intervalRef.current = setInterval(() => setHoverIdx((i) => (i + 1) % photos.length), 1500);
    }
    return () => clearInterval(intervalRef.current);
  }, [isHovered, hasMultiple, photos.length]);

  const img = photos.length ? `${api.replace('/api', '')}${photos[hoverIdx]?.path}` : '';
  const colors = (product.variant_colors || '').split('|').filter(Boolean).slice(0, 6);

  return (
    <article className="pcard"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setHoverIdx(0); }}
    >
      <a href={`/produk/${product.id}`} className="pcard-img" style={{ textDecoration: 'none' }}>
        <SafeImage
          src={img}
          alt={product.name}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
        {hasMultiple && (
          <div className="pcard-dots">
            {photos.map((_, i) => (
              <span key={i} className={i === hoverIdx ? 'active' : ''} />
            ))}
          </div>
        )}
      </a>
      <div className="pcard-body">
        <a href={`/produk/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <strong>{product.name}</strong>
        </a>
        <span className="pcard-price">Rp{Number(product.price || 0).toLocaleString('id-ID')}</span>
        {colors.length > 0 && (
          <div className="pcard-colors">
            {colors.map((c) => <span key={c}>{c}</span>)}
          </div>
        )}
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
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  useEffect(() => {
    Promise.all([
      fetch(`${api}/public/settings`).then((r) => r.json()).then((b) => b.data).catch(() => null),
      fetch(`${api}/public/categories`).then((r) => r.json()).then((b) => b.data || []).catch(() => []),
    ]).then(([s, cats]) => { setSettings(s); setCategories(cats); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '24', page: String(page), ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}), ...(sort ? { sort } : {}) }).toString();
    fetch(`${api}/public/products?${qs}`)
      .then((r) => r.json()).then((b) => { setProducts(b.data || []); setTotalPages(b.totalPages || 1); setTotal(b.total || 0); })
      .catch(() => setProducts([])).finally(() => setLoading(false));
  }, [cat, q, sort, page]);

  useEffect(() => {
    fetch(`${api}/public/products?limit=60`).then((r) => r.json()).then((b) => setSlidesAll(b.data || [])).catch(() => {});
  }, []);

  const pages = useMemo(() => {
    const tp = totalPages; let s = Math.max(1, page - 2); let e = Math.min(tp, s + 4); s = Math.max(1, e - 4);
    const out = []; for (let i = s; i <= e; i++) out.push(i); return out;
  }, [page, totalPages]);

  const slide = slides[slideIdx];
  const slidePhotos = useMemo(() => parsePhotos(slide?.photo_paths), [slide?.photo_paths]);

  return (
    <div style={{ background: C.bg, color: C.ink, minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Top banner */}
      <div style={{ background: C.accent, color: C.white, textAlign: 'center', padding: '6px 16px', fontSize: 12, fontWeight: 600 }}>
        Minimal pembelian 4 pcs per model — Grosir langsung dari supplier
      </div>

      {/* Header */}
      <header style={{ background: C.white, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontSize: 20, fontWeight: 800, color: C.accent, textDecoration: 'none', letterSpacing: '-.02em' }}>Anyostore</a>
          <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="#produk" style={{ fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: 'none', padding: '8px 14px' }}>Katalog</a>
            <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} style={{ fontSize: 13, fontWeight: 600, color: C.white, background: C.accent, padding: '8px 16px', borderRadius: 6, textDecoration: 'none' }}>Chat Admin</a>
          </nav>
        </div>
      </header>

      {/* Hero slideshow */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px' }}>
        <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: C.white, border: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', minHeight: 340 }}>
          {slide ? (
            <div key={slide.id} className="slide-fade" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', width: '100%' }}>
              <div style={{ padding: 32, display: 'grid', gap: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.muted }}>{slide.category_name || 'Denim'}</span>
                <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 400, lineHeight: 1.1, color: C.ink }}>{slide.name}</h1>
                <strong style={{ fontSize: 22, color: C.accent }}>Rp{Number(slide.price || 0).toLocaleString('id-ID')}</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={`/produk/${slide.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 18px', borderRadius: 6, background: C.accent, color: C.white, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>Lihat Detail</a>
                  <a href="#" onClick={(e) => { e.preventDefault(); pickWa(`Saya tertarik dengan ${slide.name}`); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 18px', borderRadius: 6, border: `1px solid ${C.border}`, color: C.ink, fontWeight: 500, fontSize: 13, textDecoration: 'none' }}><I.chat style={{ width: 14, height: 14 }} /> WA</a>
                </div>
              </div>
              <div style={{ display: 'grid', placeItems: 'center', background: C.bg, minHeight: 320, padding: 16 }}>
                {slidePhotos.length > 0 ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    {slidePhotos.map((ph, i) => (
                      <div key={i} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, opacity: i === 0 ? 1 : 0, transition: 'opacity .5s' }}>
                        <SafeImage src={`${api.replace('/api', '')}${ph.path}`} alt={slide.name} style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain' }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: C.muted, fontSize: 13 }}>Foto produk</div>
                )}
              </div>
            </div>
          ) : <div style={{ gridColumn: '1/-1', padding: 48, textAlign: 'center', color: C.muted }}>Memuat…</div>}
          {slides.length > 1 && (
            <>
              <button aria-label="Prev" onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.white, color: C.ink, cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}><I.chevL style={{ width: 16, height: 16 }} /></button>
              <button aria-label="Next" onClick={() => setSlideIdx((i) => (i + 1) % slides.length)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34, borderRadius: '50%', border: `1px solid ${C.border}`, background: C.white, color: C.ink, cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}><I.chevR style={{ width: 16, height: 16 }} /></button>
            </>
          )}
        </div>
        {slides.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12 }}>
            {slides.map((s, i) => (
              <button key={s.id} onClick={() => setSlideIdx(i)} style={{ width: i === slideIdx ? 24 : 8, height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', background: i === slideIdx ? C.accent : C.border, transition: 'width .2s' }} />
            ))}
          </div>
        )}
      </section>

      {/* Trust strip */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '4px 16px 20px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[{ icon: I.box, label: 'Min 4 pcs/model' }, { icon: I.truck, label: 'Kirim nasional' }, { icon: I.store, label: 'Ready stock' }, { icon: I.chat, label: 'Konsultasi WA' }].map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.white }}>
            <it.icon style={{ width: 16, height: 16, color: C.muted, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{it.label}</span>
          </div>
        ))}
      </section>

      {/* Katalog */}
      <section id="produk" style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 26, fontWeight: 400 }}>Katalog Produk</h2>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: C.muted }}>{total} produk</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <I.search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: C.muted, pointerEvents: 'none' }} />
              <input placeholder="Cari produk…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minHeight: 40, minWidth: 180, paddingLeft: 32, paddingRight: 12, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontSize: 13 }} />
            </div>
            <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} style={{ minHeight: 40, minWidth: 130, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, padding: '0 10px' }}>
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ minHeight: 40, minWidth: 130, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontSize: 13, padding: '0 10px' }}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="pcard-grid">
          {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} className="pcard-skeleton" />)}
          {!loading && products.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
        {!loading && !products.length && <p style={{ textAlign: 'center', color: C.muted, marginTop: 24, fontSize: 14 }}>Tidak ada produk ditemukan.</p>}

        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, marginTop: 24 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ minHeight: 36, padding: '0 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontWeight: 500, fontSize: 13, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? .4 : 1 }}><I.chevL style={{ width: 14, height: 14 }} /></button>
            {pages.map((p) => (
              <button key={p} onClick={() => setPage(p)} style={{ minWidth: 36, minHeight: 36, borderRadius: 6, border: `1px solid ${p === page ? C.accent : C.border}`, background: p === page ? C.accent : C.white, color: p === page ? C.white : C.ink, fontWeight: 500, fontSize: 13, cursor: 'pointer' }}>{p}</button>
            ))}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ minHeight: 36, padding: '0 12px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, fontWeight: 500, fontSize: 13, cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? .4 : 1 }}><I.chevR style={{ width: 14, height: 14 }} /></button>
          </div>
        )}
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 12px' }}>
        <div style={{ borderRadius: 12, padding: '36px 32px', textAlign: 'center', border: `1px solid ${C.border}`, background: C.white }}>
          <h2 style={{ margin: '0 0 6px', fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(20px, 2.5vw, 28px)', fontWeight: 400 }}>Siap order grosir?</h2>
          <p style={{ margin: '0 auto 16px', maxWidth: 420, color: C.muted, fontSize: 14 }}>Konsultasi langsung dengan admin via WhatsApp.</p>
          <a href="#" onClick={(e) => { e.preventDefault(); pickWa(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 24px', borderRadius: 6, background: '#25D366', color: C.white, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            <I.chat style={{ width: 16, height: 16 }} /> Chat Admin Sekarang
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 16px 80px', borderTop: `1px solid ${C.border}`, marginTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 12, color: C.muted }}>
        <span>© {new Date().getFullYear()} Anyostore — Supplier Denim Wanita</span>
        <a href="/login" style={{ color: C.accent, fontWeight: 600, textDecoration: 'none' }}>Login Pegawai</a>
      </footer>

      {/* WA picker */}
      {waPicker && (
        <div onClick={() => setWaPicker(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', display: 'grid', gap: 12, boxShadow: '0 20px 60px rgba(0,0,0,.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 15 }}>Pilih Admin WhatsApp</strong>
              <button onClick={() => setWaPicker(false)} aria-label="Tutup" style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: C.muted }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {waPhones.map((ph, idx) => (
                <a key={idx} href={waLink(ph, waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => setWaPicker(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 6, background: idx === 0 ? '#25D366' : '#f0fdf4', color: idx === 0 ? '#fff' : '#166534', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <I.chat style={{ width: 16, height: 16 }} /> WA Admin {idx + 1} — {ph}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      <FloatingWA phones={waPhones} message="Halo Admin Anyostore, saya ingin order grosir." />

      <style>{`
        .pcard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .pcard { display: flex; flex-direction: column; border-radius: 10px; overflow: hidden; background: #fff; border: 1px solid #e2e8f0; cursor: pointer; transition: transform .25s ease, box-shadow .25s ease; }
        .pcard:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(15,23,42,.1); }
        .pcard-img { display: grid; place-items: center; aspect-ratio: 3/4; background: #f8fafc; overflow: hidden; position: relative; }
        .pcard-dots { display: flex; gap: 4px; justify-content: center; position: absolute; bottom: 8px; left: 0; right: 0; }
        .pcard-dots span { width: 6px; height: 6px; border-radius: 999px; background: #cbd5e1; transition: background .2s, width .2s; }
        .pcard-dots span.active { background: #1e3a5f; width: 16px; }
        .pcard-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
        .pcard-body strong { font-size: 14px; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pcard-price { color: #1e3a5f; font-weight: 700; font-size: 15px; }
        .pcard-colors { display: flex; gap: 4px; flex-wrap: wrap; }
        .pcard-colors span { padding: 2px 6px; border-radius: 3px; background: #eef2ff; font-size: 10px; color: #1e3a5f; }
        .pcard-skeleton { height: 360px; border-radius: 10px; background: #e2e8f0; }
        .slide-fade { animation: slideFade .5s ease; }
        @keyframes slideFade { from { opacity: 0; } to { opacity: 1; } }
        @media (max-width: 900px) { .pcard-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 600px) { .pcard-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } section > div[style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; } div[style*="repeat(4,1fr)"] { grid-template-columns: repeat(2,1fr) !important; } }
        @media (prefers-reduced-motion: reduce) { .pcard, .slide-fade { transition: none; animation: none; } }
      `}</style>
    </div>
  );
}
