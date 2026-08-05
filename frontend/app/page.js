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
  cart: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>),
  plus: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>),
  minus: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14" /></svg>),
  close: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>),
};

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
const fmtRp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const SORTS = [{ value: 'newest', label: 'Terbaru' }, { value: 'price_asc', label: 'Harga Termurah' }, { value: 'price_desc', label: 'Harga Termahal' }, { value: 'name', label: 'Nama A-Z' }];

function parsePhotos(paths) {
  if (!paths) return [];
  return String(paths).split('||').filter(Boolean).map((p) => ({ path: p.trim() }));
}
function photoStyle(transform, base) {
  const t = String(transform || '').split(',').map(Number);
  return t.length === 3 && isFinite(t[0]) && (t[0] !== 1 || t[1] !== 0 || t[2] !== 0) ? { objectFit: 'cover', objectPosition: 'center', transform: `translate(${t[1] || 0}%, ${t[2] || 0}%) scale(${t[0]})`, ...base } : { objectFit: 'cover', objectPosition: 'center', ...base };
}

function ProductCard({ product, onWa, onAdd, inCart }) {
  const photos = useMemo(() => {
    const seen = new Set();
    const list = parsePhotos(product.photo_paths).filter((p) => {
      if (seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    });
    return list.length ? list : (product.photo_path ? [{ path: product.photo_path }] : []);
  }, [product.photo_paths, product.photo_path]);
  // Hover: langsung ganti ke foto berikutnya, lalu lanjut tiap 1 detik selama mouse di kartu.
  const [photoIdx, setPhotoIdx] = useState(0);
  const photoTimer = useRef(null);
  function stopCycle() {
    if (photoTimer.current) { clearInterval(photoTimer.current); photoTimer.current = null; }
  }
  function onEnter() {
    if (photos.length <= 1) return;
    stopCycle();
    setPhotoIdx((i) => (i + 1) % photos.length);
    photoTimer.current = setInterval(() => setPhotoIdx((i) => (i + 1) % photos.length), 1000);
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
      <button type="button" className={`pcard-add${inCart ? ' has' : ''}`} onClick={() => onAdd(product)} aria-label="Tambah ke keranjang" title="Tambah ke keranjang">
        <I.cart style={{ width: 15, height: 15 }} />
        Tambah
        {inCart > 0 && <span className="pcard-add-badge">{inCart}</span>}
      </button>
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
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [picker, setPicker] = useState(null);
  const [pickVariantId, setPickVariantId] = useState(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickerLoading, setPickerLoading] = useState(false);
  const waPhone = settings?.whatsapp || settings?.store_phone || '';
  const waPhones = settings?.whatsapp_numbers?.length ? settings.whatsapp_numbers : waPhone ? [waPhone] : [];
  function pickWa(msg) { if (!waPhones.length) return; setWaMsg(msg); setWaPicker(true); }

  useEffect(() => { try { const raw = localStorage.getItem('landing_cart'); if (raw) setCart(JSON.parse(raw)); } catch (e) {} }, []);
  useEffect(() => { try { localStorage.setItem('landing_cart', JSON.stringify(cart)); } catch (e) {} }, [cart]);
  function countInCart(productId) { return cart.filter((i) => i.productId === productId).reduce((s, i) => s + i.qty, 0); }
  const cartPcs = cart.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const pickMin = picker ? Math.max(1, 4 - countInCart(picker.product.id)) : 1;
  const pickerSelected = picker ? picker.variants.find((v) => v.id === pickVariantId) || null : null;
  const pickerPhoto = pickerSelected?.photo_path || picker?.product?.photo_path || null;
  const modelTotals = cart.reduce((m, i) => { m[i.productId] = (m[i.productId] || 0) + i.qty; return m; }, {});
  const cartWarnings = Object.entries(modelTotals)
    .map(([pid, qty]) => ({ name: cart.find((i) => i.productId === Number(pid))?.name || 'Produk', qty }))
    .filter((w) => w.qty < 4);

  function openPicker(product) {
    setPickQty(Math.max(1, 4 - countInCart(product.id)));
    setPickVariantId(null);
    if (Number(product.variant_count) > 0) {
      setPickerLoading(true);
      setPicker({ product, variants: [] });
      fetch(`${api}/public/products/${product.id}`)
        .then((r) => r.json())
        .then((b) => {
          const variants = (b.data?.variants || []).filter((v) => v.is_active !== false);
          setPicker((cur) => (cur && cur.product.id === product.id ? { product: cur.product, variants } : cur));
          setPickVariantId((cur) => cur ?? (variants[0]?.id ?? null));
        })
        .catch(() => setPicker((cur) => (cur && cur.product.id === product.id ? { ...cur, variants: [] } : cur)))
        .finally(() => setPickerLoading(false));
    } else {
      setPicker({ product, variants: [] });
    }
  }

  function addFromPicker() {
    if (!picker) return;
    const selected = picker.variants.find((v) => v.id === pickVariantId) || null;
    const key = `${picker.product.id}-${selected?.id || 0}`;
    const variantLabel = selected ? [selected.color, selected.size].filter(Boolean).join(' · ') : '';
    const price = Number(selected?.price ?? picker.product.price ?? 0);
    const photo = selected?.photo_path || picker.product.photo_path || null;
    const qty = Math.max(1, pickQty);
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty } : i));
      return [...prev, { key, productId: picker.product.id, name: picker.product.name, sku: picker.product.sku, variantLabel, price, qty, photo }];
    });
    setPicker(null);
    setCartOpen(true);
  }

  function setItemQty(key, qty) {
    setCart((prev) => prev.map((i) => {
      if (i.key !== key) return i;
      const modelTotal = prev.filter((x) => x.productId === i.productId).reduce((s, x) => s + x.qty, 0);
      const others = modelTotal - i.qty;
      const minQty = Math.max(1, 4 - others);
      return { ...i, qty: Math.max(minQty, Number(qty) || minQty) };
    }));
  }
  function removeItem(key) { setCart((prev) => prev.filter((i) => i.key !== key)); }
  function clearCart() { setCart([]); }

  function buildOrderMsg() {
    const groups = {};
    for (const it of cart) {
      if (!groups[it.productId]) groups[it.productId] = { name: it.name, items: [], qty: 0, total: 0 };
      groups[it.productId].items.push(it);
      groups[it.productId].qty += it.qty;
      groups[it.productId].total += it.qty * it.price;
    }
    const lines = Object.values(groups).map((g, gi) => {
      const detail = g.items.map((it) => `    ${it.variantLabel ? `${it.variantLabel}: ` : ''}${it.qty} pcs × ${fmtRp(it.price)} = ${fmtRp(it.qty * it.price)}`).join('\n');
      return `${gi + 1}. ${g.name} — ${g.qty} pcs · ${fmtRp(g.total)}\n${detail}`;
    });
    return `Halo Anyostore, saya mau order grosir:\n\n${lines.join('\n')}\n\nTotal: ${cartPcs} pcs · ${fmtRp(cartTotal)}\nMin. pembelian 4 pcs per model (varian boleh dicampur).`;
  }
  function sendOrder() { setCartOpen(false); pickWa(buildOrderMsg()); }

  const [today, setToday] = useState('');
  useEffect(() => { setToday(`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`); }, []);
  useEffect(() => { document.title = 'Anyostore Grosir PGMTA'; }, []);
  useEffect(() => { Promise.all([fetch(`${api}/public/settings`).then((r) => r.json()).then((b) => b.data).catch(() => null), fetch(`${api}/public/categories`).then((r) => r.json()).then((b) => b.data || []).catch(() => [])]).then(([s, c]) => { setSettings(s); setCategories(c); }); }, []);
  useEffect(() => { setLoading(true); const qs = new URLSearchParams({ limit: '24', page: String(page), ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}), ...(sort ? { sort } : {}) }).toString(); fetch(`${api}/public/products?${qs}`).then((r) => r.json()).then((b) => { setProducts(b.data || []); setTotalPages(b.totalPages || 1); setTotal(b.total || 0); }).catch(() => setProducts([])).finally(() => setLoading(false)); }, [cat, q, sort, page]);
  const pages = useMemo(() => { const tp = totalPages; let s = Math.max(1, page - 2); let e = Math.min(tp, s + 4); s = Math.max(1, e - 4); const o = []; for (let i = s; i <= e; i++) o.push(i); return o; }, [page, totalPages]);
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

      {/* 4. Feature strip */}
      <div className="feature-strip">
        <div className="feature-item">
          <span className="feature-icon"><I.box style={{ width: 20, height: 20 }} /></span>
          <span><strong>Min 4 pcs/model</strong><span className="feature-desc">Grosir langsung dari supplier</span></span>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><I.truck style={{ width: 20, height: 20 }} /></span>
          <span><strong>Pengiriman nasional</strong><span className="feature-desc">Kirim ke seluruh Indonesia</span></span>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><I.chat style={{ width: 20, height: 20 }} /></span>
          <span><strong>Konsultasi via WhatsApp</strong><span className="feature-desc">Admin siap membantu Anda</span></span>
        </div>
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
          {!loading && products.map((p) => <ProductCard key={p.id} product={p} onWa={pickWa} onAdd={openPicker} inCart={countInCart(p.id)} />)}
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

      {cartPcs > 0 && (
        <button type="button" onClick={() => setCartOpen(true)} className="cart-fab" aria-label="Buka keranjang">
          <I.cart style={{ width: 20, height: 20 }} />
          <span className="cart-fab-badge">{cartPcs}</span>
        </button>
      )}

      {/* Keranjang */}
      {cartOpen && (
        <div onClick={() => setCartOpen(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 120, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 14, maxWidth: 480, width: '100%', maxHeight: 'min(640px, 88vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 12px' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.black }}>Keranjang <span style={{ color: T.muted, fontWeight: 500, fontSize: 13 }}>{cartPcs} pcs</span></h3>
              <button onClick={() => setCartOpen(false)} aria-label="Tutup" style={{ width: 34, height: 34, padding: 0, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, cursor: 'pointer', color: T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}><I.close style={{ width: 16, height: 16, display: 'block' }} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '4px 20px', display: 'grid', gap: 4 }}>
              {cart.map((it) => (
                <div key={it.key} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
                  {it.photo
                    ? <img src={`${api.replace('/api', '')}${it.photo}`} alt={it.name} style={{ width: 52, height: 64, objectFit: 'cover', borderRadius: 8 }} />
                    : <div style={{ width: 52, height: 64, borderRadius: 8, background: '#f3f4f6' }} />}
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 13, display: 'block', color: T.black }}>{it.name}</strong>
                    {it.variantLabel && <span style={{ fontSize: 11, color: T.muted }}>{it.variantLabel}</span>}
                    <div style={{ fontSize: 12, color: T.blue, fontWeight: 700, marginTop: 2 }}>{fmtRp(it.price)}/pcs</div>
                  </div>
                  <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button className="qty-btn small" onClick={() => setItemQty(it.key, it.qty - 1)} aria-label="Kurangi jumlah"><I.minus style={{ width: 14, height: 14, color: '#fff' }} /></button>
                      <input type="number" min="1" value={it.qty} onChange={(e) => setItemQty(it.key, Math.max(1, Number(e.target.value) || 1))} aria-label={`Jumlah ${it.name}`} className="qty-input" />
                      <button className="qty-btn small" onClick={() => setItemQty(it.key, it.qty + 1)} aria-label="Tambah jumlah"><I.plus style={{ width: 14, height: 14, color: '#fff' }} /></button>
                    </div>
                    <button onClick={() => removeItem(it.key)} style={{ border: 0, background: 'none', color: '#dc2626', fontSize: 11, cursor: 'pointer', padding: 0 }}>Hapus</button>
                  </div>
                </div>
              ))}
              {!cart.length && <p style={{ textAlign: 'center', color: T.muted, padding: '24px 0', fontSize: 14 }}>Keranjang masih kosong.</p>}
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, padding: '14px 20px 18px', display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 15, color: T.black }}>
                <span>Total</span><span>{fmtRp(cartTotal)}</span>
              </div>
              {cartWarnings.length > 0 && (
                <div style={{ display: 'grid', gap: 3 }}>
                  {cartWarnings.map((w) => <p key={w.name} style={{ margin: 0, fontSize: 11, color: '#b45309' }}>{w.name} masih {w.qty} pcs — min. 4 pcs per model.</p>)}
                </div>
              )}
              <p style={{ margin: 0, fontSize: 11, color: T.muted }}>Min. pembelian 4 pcs per model — varian boleh dicampur.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={clearCart} disabled={!cart.length} className="pcard-btn secondary" style={{ flex: '0 0 auto', minWidth: 110 }}>Kosongkan</button>
                <button onClick={sendOrder} disabled={!cart.length} className="pcard-btn primary" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 }}><I.chat style={{ width: 15, height: 15 }} /> Chat Pesanan via WhatsApp</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pilih varian + jumlah */}
      {picker && (
        <div onClick={() => setPicker(null)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 130, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 14, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.black }}>{picker.product.name}</h3>
              <button onClick={() => setPicker(null)} aria-label="Tutup" style={{ width: 34, height: 34, padding: 0, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, cursor: 'pointer', color: T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}><I.close style={{ width: 16, height: 16, display: 'block' }} /></button>
            </div>
            {pickerPhoto
              ? <img src={`${api.replace('/api', '')}${pickerPhoto}`} alt={picker.product.name} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 16, background: '#f3f4f6' }} />
              : <div style={{ width: '100%', height: 200, borderRadius: 10, background: '#f3f4f6', display: 'grid', placeItems: 'center', color: T.muted, fontSize: 13, marginBottom: 16 }}>Tanpa foto</div>}
            {pickerLoading && <p style={{ color: T.muted, fontSize: 13 }}>Memuat varian…</p>}
            {!pickerLoading && picker.variants.length > 0 && (
              <>
                <strong style={{ fontSize: 12, color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Pilih varian</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, margin: '10px 0 18px' }}>
                  {picker.variants.map((v) => {
                    const active = v.id === pickVariantId;
                    const label = [v.color, v.size].filter(Boolean).join(' · ') || 'Varian';
                    return (
                      <button key={v.id} type="button" onClick={() => setPickVariantId(v.id)} style={{ padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${active ? T.blue : T.border}`, background: active ? T.blue : T.card, color: active ? '#fff' : T.black, fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all .2s' }}>
                        {label}
                        {Number(v.price) > 0 && Number(v.price) !== Number(picker.product.price) && <span style={{ display: 'block', fontSize: 11, opacity: .85 }}>{fmtRp(v.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <strong style={{ fontSize: 12, color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Jumlah</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 18px' }}>
              <button className="qty-btn" onClick={() => setPickQty((q) => Math.max(pickMin, q - 1))} aria-label="Kurangi jumlah"><I.minus style={{ width: 18, height: 18, color: '#fff' }} /></button>
              <input type="number" min={pickMin} value={pickQty} onChange={(e) => setPickQty(Math.max(pickMin, Number(e.target.value) || pickMin))} aria-label="Jumlah" className="qty-input" style={{ width: 60, height: 36, fontSize: 16 }} />
              <button className="qty-btn" onClick={() => setPickQty((q) => q + 1)} aria-label="Tambah jumlah"><I.plus style={{ width: 18, height: 18, color: '#fff' }} /></button>
            </div>
            <button onClick={addFromPicker} className="pcard-btn primary" style={{ width: '100%', minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}><I.cart style={{ width: 16, height: 16 }} /> Tambah ke Keranjang</button>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: T.muted, textAlign: 'center' }}>Min. 4 pcs per model — varian boleh dicampur.</p>
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
        .feature-strip { max-width: 1200px; margin: 0 auto; padding: 20px 16px 6px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .feature-item { display: flex; align-items: center; gap: 12px; background: ${T.card}; border: 1px solid ${T.border}; border-radius: 12px; padding: 14px 16px; }
        .feature-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(30,58,95,.08); color: ${T.blue}; display: grid; place-items: center; flex-shrink: 0; }
        .feature-item strong { display: block; font-size: 13px; font-weight: 700; color: ${T.black}; }
        .feature-desc { display: block; font-size: 12px; color: ${T.muted}; margin-top: 2px; }
        .pcard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .pcard { position: relative; display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; background: #fff; border: 1px solid #e5e7eb; transition: all .3s cubic-bezier(.4,0,.2,1); box-shadow: 0 1px 3px rgba(0,0,0,.04); }
        .pcard:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(15,23,42,.08); border-color: #d1d5db; }
        .pcard:active { transform: scale(.985); }
        .pcard-add { position: absolute; top: 10px; right: 10px; z-index: 4; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(30,58,95,.94); color: #fff; font-weight: 700; font-size: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(15,23,42,.35); transition: all .2s; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
        .pcard-add:hover { background: #152d4a; transform: translateY(-1px); }
        .pcard-add.has { background: #152d4a; }
        .pcard-add-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 10px; font-weight: 800; display: grid; place-items: center; padding: 0 4px; }
        .cart-fab { position: fixed; right: 16px; bottom: 82px; z-index: 95; width: 56px; height: 56px; border-radius: 999px; border: 0; background: ${T.blue}; color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 12px 28px rgba(15,23,42,.25); transition: all .2s; }
        .cart-fab:hover { transform: translateY(-2px); }
        .cart-fab-badge { position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; padding: 0 5px; border: 2px solid #fff; }
        .qty-btn { width: 34px; height: 34px; padding: 0; border-radius: 8px; border: 1px solid ${T.blue}; background: ${T.blue}; color: #fff; display: grid; place-items: center; cursor: pointer; transition: all .2s; box-shadow: 0 2px 6px rgba(30,58,95,.22); }
        .qty-btn:hover { background: #152d4a; }
        .qty-btn.small { width: 28px; height: 28px; }
        .qty-btn svg { display: block; }
        .qty-input { width: 52px; height: 28px; text-align: center; border: 1px solid #94a3b8; border-radius: 8px; font-weight: 700; font-size: 13px; color: #1a1a1a; background: #fff; -moz-appearance: textfield; }
        .qty-input::-webkit-outer-spin-button, .qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
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
        .pcard-actions { display: flex; gap: 10px; margin-top: auto; padding-top: 12px; }
        .pcard-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 0 10px; border-radius: 8px; font-size: 13px; font-weight: 700; line-height: 1.1; text-align: center; text-decoration: none; cursor: pointer; box-sizing: border-box; transition: all .3s cubic-bezier(.4,0,.2,1); }
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
        }
        @media (max-width: 600px) {
          .pcard-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .feature-strip { grid-template-columns: 1fr; gap: 8px; padding: 16px 16px 4px; }
        }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      `}</style>
    </div>
  );
}
