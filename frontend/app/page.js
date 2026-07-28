'use client';

import { useEffect, useMemo, useState } from 'react';
import FloatingWA from './components/FloatingWA';
import SafeImage from './components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

/* ── Colour tokens (denim + copper + cotton) ─────────────────────── */
const C = {
  denim: '#1a1f3a',
  copper: '#c87941',
  copperLight: '#e8c4a0',
  cotton: '#faf8f5',
  ink: '#0f1219',
  stone: '#8b8680',
  stoneLight: '#d4d0ca',
  white: '#ffffff',
};

/* ── SVG icons (Lucide-style, no emojis) ─────────────────────────── */
const I = {
  box: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>),
  truck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" /><path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>),
  chat: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>),
  store: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 9l1-5h16l1 5" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>),
  chevL: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  chevR: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
  arrow: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>),
};

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
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

/* ── Stitch divider (signature element) ──────────────────────────── */
function Stitch() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      <div style={{ height: 2, background: `repeating-linear-gradient(90deg, ${C.copper} 0 8px, transparent 8px 14px)`, opacity: .5 }} />
    </div>
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
    const t = setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 5000);
    return () => clearInterval(t);
  }, [slides.length, paused]);

  const katalogWA = useMemo(() => `Halo Admin Anyostore.\n\nSaya ingin meminta katalog grosir.\n\nSaya mengetahui bahwa minimal pembelian adalah 4 pcs per model.\n\nMohon informasi lebih lanjut.`, []);

  useEffect(() => {
    Promise.all([
      fetch(`${api}/public/settings`).then((r) => r.json()).then((b) => b.data).catch(() => null),
      fetch(`${api}/public/categories`).then((r) => r.json()).then((b) => b.data || []).catch(() => []),
    ]).then(([s, cats]) => { setSettings(s); setCategories(cats); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ limit: '48', page: String(page), ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}), ...(sort ? { sort } : {}) }).toString();
    fetch(`${api}/public/products?${qs}`)
      .then((r) => r.json())
      .then((b) => { setProducts(b.data || []); setTotalPages(b.totalPages || 1); setTotal(b.total || 0); })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [cat, q, sort, page]);

  useEffect(() => {
    fetch(`${api}/public/products?limit=60`).then((r) => r.json()).then((b) => setSlidesAll(b.data || [])).catch(() => {});
  }, []);

  const pages = useMemo(() => {
    const tp = totalPages; let s = Math.max(1, page - 2); let e = Math.min(tp, s + 4); s = Math.max(1, e - 4);
    const out = []; for (let i = s; i <= e; i++) out.push(i); return out;
  }, [page, totalPages]);

  const slide = slides[slideIdx];

  const waText = `Halo Admin Anyostore.\n\nSaya tertarik dengan produk berikut.\n\nNama Produk:\n${slide?.name || ''}\n\nLink Produk:\n${typeof window !== 'undefined' ? window.location.origin : ''}/produk/${slide?.id || ''}\n\nSaya ingin mengetahui:\n- Harga grosir\n- Stok tersedia\n- Warna yang ready\n- Ukuran yang tersedia\n\nSaya memahami bahwa minimal pembelian adalah 4 pcs per model.\n\nTerima kasih.`;

  return (
    <div style={{ background: C.cotton, color: C.ink, minHeight: '100vh', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* ── Top banner ─────────────────────────────────────────────── */}
      <div style={{ background: C.denim, color: C.white, textAlign: 'center', padding: '8px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '.04em' }}>
        Minimal pembelian <span style={{ color: C.copper, fontWeight: 800 }}>4 pcs per model</span> — Grosir langsung dari supplier
      </div>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 40, background: `${C.cotton}ee`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${C.stoneLight}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="/" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 22, fontWeight: 400, color: C.denim, textDecoration: 'none', letterSpacing: '-.02em' }}>
            Anyostore
          </a>
          <nav style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <a href="#produk" style={{ fontSize: 13, fontWeight: 600, color: C.denim, textDecoration: 'none', padding: '8px 14px' }}>Katalog</a>
            <a href="#" onClick={(e) => { e.preventDefault(); pickWa(katalogWA); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: C.white, background: C.copper, padding: '8px 16px', borderRadius: 6, textDecoration: 'none' }}>
              <I.chat style={{ width: 14, height: 14 }} /> Chat Admin
            </a>
          </nav>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section style={{ background: C.denim, color: C.white, position: 'relative', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 16px 50px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center', position: 'relative', zIndex: 1 }}>
          {/* Left: typography */}
          <div style={{ display: 'grid', gap: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: C.copper }}>Supplier Grosir Denim</span>
            <h1 style={{ margin: 0, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(36px, 5vw, 64px)', lineHeight: 1.05, fontWeight: 400, letterSpacing: '-.02em' }}>
              Baju Denim<br /><em style={{ color: C.copper }}>Wanita</em> Grosir
            </h1>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: C.stoneLight, maxWidth: 420 }}>
              Belanja grosir langsung dari supplier. Ready stock, kirim seluruh Indonesia, konsultasi warna & stok via WhatsApp.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <a href="#produk" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 24px', borderRadius: 6, background: C.copper, color: C.white, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                Lihat Katalog <I.arrow style={{ width: 16, height: 16 }} />
              </a>
              <a href="#" onClick={(e) => { e.preventDefault(); pickWa(katalogWA); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 24px', borderRadius: 6, border: `1px solid ${C.stone}`, color: C.white, fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
                <I.chat style={{ width: 16, height: 16 }} /> Chat Admin
              </a>
            </div>
          </div>

          {/* Right: slideshow */}
          <div
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#111827', aspectRatio: '4/5', display: 'grid', placeItems: 'center' }}
          >
            {slide ? (
              <div key={slide.id} className="slide-fade" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 16, overflow: 'hidden' }}>
                  <SafeImage src={slide.photo_path ? `${api.replace('/api', '')}${slide.photo_path}` : ''} alt={slide.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ padding: '14px 18px', background: `${C.denim}cc`, backdropFilter: 'blur(8px)' }}>
                  <p style={{ margin: 0, fontSize: 11, color: C.copper, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{slide.category_name || 'Denim'}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: C.white }}>{slide.name}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 800, color: C.copper }}>Rp{Number(slide.price || 0).toLocaleString('id-ID')}</p>
                </div>
              </div>
            ) : (
              <div style={{ color: C.stone, fontSize: 13 }}>Memuat…</div>
            )}

            {/* Arrows */}
            {slides.length > 1 && (
              <>
                <button aria-label="Sebelumnya" onClick={() => setSlideIdx((i) => (i - 1 + slides.length) % slides.length)} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 999, border: `1px solid ${C.stone}`, background: `${C.denim}aa`, color: C.white, cursor: 'pointer', display: 'grid', placeItems: 'center', backdropFilter: 'blur(4px)' }}><I.chevL style={{ width: 18, height: 18 }} /></button>
                <button aria-label="Berikutnya" onClick={() => setSlideIdx((i) => (i + 1) % slides.length)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 36, height: 36, borderRadius: 999, border: `1px solid ${C.stone}`, background: `${C.denim}aa`, color: C.white, cursor: 'pointer', display: 'grid', placeItems: 'center', backdropFilter: 'blur(4px)' }}><I.chevR style={{ width: 18, height: 18 }} /></button>
              </>
            )}
          </div>
        </div>

        {/* Dots */}
        {slides.length > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingBottom: 24 }}>
            {slides.map((s, i) => (
              <button key={s.id} aria-label={`Slide ${i + 1}`} onClick={() => setSlideIdx(i)} style={{ width: i === slideIdx ? 24 : 8, height: 8, borderRadius: 999, border: 'none', cursor: 'pointer', background: i === slideIdx ? C.copper : C.stone, transition: 'width .2s, background .2s' }} />
            ))}
          </div>
        )}
      </section>

      <Stitch />

      {/* ── Trust strip ────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 1 }}>
        {[
          { icon: I.box, label: 'Min 4 pcs/model' },
          { icon: I.truck, label: 'Kirim nasional' },
          { icon: I.store, label: 'Ready stock' },
          { icon: I.chat, label: 'Konsultasi WA' },
        ].map((it, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', background: i % 2 === 0 ? C.white : C.cotton, borderLeft: i > 0 ? `1px solid ${C.stoneLight}` : 'none' }}>
            <it.icon style={{ width: 20, height: 20, color: C.copper, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{it.label}</span>
          </div>
        ))}
      </section>

      <Stitch />

      {/* ── Katalog ────────────────────────────────────────────────── */}
      <section id="produk" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 28, fontWeight: 400, color: C.denim }}>Katalog Produk</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.stone }}>{total} produk dari Toko Metro</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <I.search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: C.stone, pointerEvents: 'none' }} />
              <input placeholder="Cari produk…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ minHeight: 42, minWidth: 180, paddingLeft: 34, paddingRight: 12, borderRadius: 6, border: `1px solid ${C.stoneLight}`, background: C.white, fontSize: 13 }} />
            </div>
            <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} style={{ minHeight: 42, minWidth: 140, borderRadius: 6, border: `1px solid ${C.stoneLight}`, background: C.white, fontSize: 13, padding: '0 10px' }}>
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ minHeight: 42, minWidth: 140, borderRadius: 6, border: `1px solid ${C.stoneLight}`, background: C.white, fontSize: 13, padding: '0 10px' }}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
          {loading && Array.from({ length: 12 }).map((_, i) => <div key={i} style={{ height: 300, borderRadius: 8, background: C.stoneLight }} />)}
          {!loading && products.map((p) => {
            const colors = (p.variant_colors || '').split('|').filter(Boolean).slice(0, 6);
            const img = p.photo_path ? `${api.replace('/api', '')}${p.photo_path}` : '';
            const waMsg = `Halo Admin Anyostore. Saya tertarik dengan ${p.name}. Link: ${typeof window !== 'undefined' ? window.location.origin : ''}/produk/${p.id}. Saya paham minimal 4 pcs per model.`;
            return (
              <article key={p.id} className="product-card" style={{ display: 'flex', flexDirection: 'column', borderRadius: 8, overflow: 'hidden', background: C.white, border: `1px solid ${C.stoneLight}` }}>
                <div style={{ position: 'relative', aspectRatio: '1/1', background: C.cotton, overflow: 'hidden' }}>
                  <SafeImage src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  {Number(p.total_stock || 0) > 0 ? <span style={{ position: 'absolute', right: 8, top: 8, padding: '3px 8px', borderRadius: 4, background: C.denim, color: C.white, fontSize: 10, fontWeight: 700 }}>Ready</span> : <span style={{ position: 'absolute', right: 8, top: 8, padding: '3px 8px', borderRadius: 4, background: `${C.copper}22`, color: C.copper, fontSize: 10, fontWeight: 700 }}>Tanya stok</span>}
                </div>
                <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <strong style={{ fontSize: 13, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: C.ink }}>{p.name}</strong>
                  <span style={{ color: C.copper, fontWeight: 800, fontSize: 15 }}>Rp{Number(p.price || 0).toLocaleString('id-ID')}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 18 }}>
                    {colors.map((c) => <span key={c} style={{ padding: '2px 6px', borderRadius: 4, background: C.cotton, border: `1px solid ${C.stoneLight}`, fontSize: 10, color: C.stone }}>{c}</span>)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginTop: 'auto', paddingTop: 8 }}>
                    <a href={`/produk/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 6, background: C.denim, color: C.white, fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>Detail</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); pickWa(waMsg); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, padding: '0 10px', borderRadius: 6, background: `${C.copper}15`, color: C.copper, fontWeight: 700, fontSize: 12, textDecoration: 'none', cursor: 'pointer' }}>WA</a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!loading && !products.length && <p style={{ textAlign: 'center', color: C.stone, marginTop: 24, fontSize: 14 }}>Tidak ada produk ditemukan.</p>}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 28 }}>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1px solid ${C.stoneLight}`, background: C.white, fontWeight: 600, fontSize: 13, cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? .4 : 1 }}><I.chevL style={{ width: 14, height: 14 }} /> Seb</button>
            {pages[0] > 1 && <button onClick={() => setPage(1)} style={{ minWidth: 40, minHeight: 40, borderRadius: 6, border: `1px solid ${C.stoneLight}`, background: C.white, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>1</button>}
            {pages[0] > 2 && <span style={{ padding: '0 4px', color: C.stone }}>…</span>}
            {pages.map((p) => (
              <button key={p} onClick={() => setPage(p)} style={{ minWidth: 40, minHeight: 40, borderRadius: 6, border: `1px solid ${p === page ? C.copper : C.stoneLight}`, background: p === page ? C.copper : C.white, color: p === page ? C.white : C.ink, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{p}</button>
            ))}
            {pages[pages.length - 1] < totalPages - 1 && <span style={{ padding: '0 4px', color: C.stone }}>…</span>}
            {pages[pages.length - 1] < totalPages && <button onClick={() => setPage(totalPages)} style={{ minWidth: 40, minHeight: 40, borderRadius: 6, border: `1px solid ${C.stoneLight}`, background: C.white, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{totalPages}</button>}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 40, padding: '0 14px', borderRadius: 6, border: `1px solid ${C.stoneLight}`, background: C.white, fontWeight: 600, fontSize: 13, cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? .4 : 1 }}>Lanj <I.chevR style={{ width: 14, height: 14 }} /></button>
          </div>
        )}
      </section>

      <Stitch />

      {/* ── CTA band ───────────────────────────────────────────────── */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 16px 0' }}>
        <div style={{ borderRadius: 12, padding: '44px 36px', textAlign: 'center', background: C.denim, color: C.white, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, background: `repeating-linear-gradient(45deg, transparent, transparent 20px, ${C.copper}08 20px, ${C.copper}08 40px)`, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2 style={{ margin: '0 0 8px', fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 400 }}>Siap order grosir hari ini?</h2>
            <p style={{ margin: '0 auto 20px', maxWidth: 480, color: C.stoneLight, fontSize: 14, lineHeight: 1.6 }}>Konsultasikan warna, stok, dan harga grosir langsung dengan admin via WhatsApp.</p>
            <a href="#" onClick={(e) => { e.preventDefault(); pickWa(katalogWA); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 48, padding: '0 28px', borderRadius: 6, background: C.copper, color: C.white, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}>
              <I.chat style={{ width: 18, height: 18 }} /> Chat Admin Sekarang
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px 80px', borderTop: `1px solid ${C.stoneLight}`, marginTop: 32, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, fontSize: 12, color: C.stone }}>
        <span>© {new Date().getFullYear()} Anyostore — Grosir Baju Denim Wanita</span>
        <a href="/login" style={{ color: C.copper, fontWeight: 600, textDecoration: 'none' }}>Login Pegawai</a>
      </footer>

      {/* ── WA picker modal ────────────────────────────────────────── */}
      {waPicker && (
        <div onClick={() => setWaPicker(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(15,18,25,.6)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: C.white, borderRadius: 12, padding: 24, maxWidth: 360, width: '100%', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 15, color: C.denim }}>Pilih Admin WhatsApp</strong>
              <button onClick={() => setWaPicker(false)} aria-label="Tutup" style={{ border: 'none', background: 'transparent', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: C.stone }}>×</button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {waPhones.map((ph, idx) => (
                <a key={idx} href={waLink(ph, waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => setWaPicker(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 6, background: idx === 0 ? '#25D366' : '#dcfce7', color: idx === 0 ? '#fff' : '#166534', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
                  <I.chat style={{ width: 16, height: 16 }} /> WA Admin {idx + 1} — {ph}
                </a>
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 11, color: C.stone, textAlign: 'center' }}>Pilih admin untuk chat harga grosir & stok.</p>
          </div>
        </div>
      )}

      <FloatingWA phones={waPhones} message={katalogWA} />

      <style>{`
        .product-card { transition: transform .2s ease, box-shadow .2s ease; }
        .product-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(26,31,58,.1); }
        .slide-fade { animation: slideFade .4s ease; }
        @keyframes slideFade { from { opacity: 0; } to { opacity: 1; } }
        a, button { -webkit-tap-highlight-color: transparent; }
        a:focus-visible, button:focus-visible { outline: 2px solid ${C.copper}; outline-offset: 2px; }
        @media (max-width: 720px) {
          section > div[style*="grid-template-columns: 1fr 1fr"], section > div[style*="gridTemplateColumns: '1fr 1fr'"] { grid-template-columns: 1fr !important; }
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
