'use client';

import { useEffect, useMemo, useState } from 'react';
import FloatingWA from './components/FloatingWA';
import SafeImage from './components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const MIN_ORDER_BADGE = 'Minimal 4 pcs / model';

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

function waTemplateProduct(product, phone, origin) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/produk/${product.id}` : `${origin || ''}/produk/${product.id}`;
  return `Halo Admin Anyostore.\n\nSaya tertarik dengan produk berikut.\n\nNama Produk:\n${product.name}\n\nLink Produk:\n${url}\n\nSaya ingin mengetahui:\n- Harga grosir\n- Stok tersedia\n- Warna yang ready\n- Ukuran yang tersedia\n\nSaya memahami bahwa minimal pembelian adalah 4 pcs per model.\n\nTerima kasih.`;
}

export default function LandingPage() {
  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const waPhone = settings?.whatsapp || settings?.store_phone || '';
  const waPhones = settings?.whatsapp_numbers?.length ? settings.whatsapp_numbers : waPhone ? [waPhone] : [];

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
    const qs = new URLSearchParams({ limit: '24', ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}) }).toString();
    fetch(`${api}/public/products?${qs}`)
      .then((r) => r.json())
      .then((b) => setProducts(b.data || []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [cat, q]);

  const katalogWA = useMemo(() => `Halo Admin Anyostore.\n\nSaya ingin meminta katalog grosir.\n\nSaya mengetahui bahwa minimal pembelian adalah 4 pcs per model.\n\nMohon informasi lebih lanjut.`, []);

  return (
    <div style={{ background: '#f8fafc', color: '#0f172a', minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', Inter, system-ui, sans-serif" }}>
      {/* top minimal order banner */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#1e3a5f', color: '#fff', textAlign: 'center', padding: '8px 12px', fontSize: 13, fontWeight: 800, letterSpacing: '.02em' }}>
        📦 Minimal pembelian <span style={{ background: '#fff', color: '#1e3a5f', padding: '2px 8px', borderRadius: 999, marginLeft: 6 }}>4 pcs per model</span> — Grosir langsung dari supplier
      </div>

      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, maxWidth: 1200, margin: '0 auto', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900, fontSize: 18 }}><span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 8, background: '#1e3a5f', color: '#fff' }}>A</span> Anyostore <span style={{ fontWeight: 600, color: '#64748b', fontSize: 12, marginLeft: 4 }}>Grosir Denim</span></div>
        <nav style={{ display: 'flex', gap: 8 }}>
          <a href="#produk" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 8, background: '#1e3a5f', color: '#fff', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Lihat Produk</a>
          <a href={waLink(waPhone, katalogWA)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 40, padding: '0 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#1e3a5f', fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Chat Admin</a>
        </nav>
      </header>

      {/* HERO */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 16px 18px', display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 20, alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <p style={{ margin: 0, color: '#2563eb', fontWeight: 800, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase' }}>Supplier Baju Denim Wanita</p>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px,5vw,44px)', lineHeight: 1.05, letterSpacing: '-.03em', fontWeight: 800 }}>Supplier Baju Denim Wanita Grosir</h1>
          <p style={{ margin: 0, color: '#475569', fontSize: 16, lineHeight: 1.55 }}>Belanja grosir langsung dari supplier dengan kualitas terbaik. Ready stock, pengiriman seluruh Indonesia, konsultasi warna & stok via WhatsApp.</p>

          <div style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '2px solid #f59e0b' }}>
            <span style={{ fontSize: 18 }}>📦</span>
            <strong style={{ color: '#92400e' }}>Minimal pembelian 4 pcs per model</strong>
            <span style={{ fontSize: 12, color: '#a16207', background: '#fef3c7', padding: '2px 8px', borderRadius: 999 }}>Wajib untuk semua model</span>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <a href="#produk" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px', borderRadius: 8, background: '#1e3a5f', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>Lihat Produk ↓</a>
            <a href={waLink(settings?.whatsapp || waPhone, katalogWA)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px', borderRadius: 8, background: '#25D366', color: '#fff', fontWeight: 800, textDecoration: 'none' }}>💬 Chat Admin</a>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6, color: '#64748b', fontSize: 12 }}>
            <span>🚚 Kirim Seluruh Indonesia</span><span>•</span><span>🏪 Ready Stock</span><span>•</span><span>💬 Konsultasi WA</span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ borderRadius: 12, overflow: 'hidden', background: '#e2e8f0', minHeight: 260, display: 'grid', placeItems: 'center', color: '#64748b', border: '1px solid #cbd5e1' }}>
            {products[0]?.photo_path ? <SafeImage src={`${api.replace('/api','')}${products[0].photo_path}`} alt={products[0].name} style={{ width: '100%', height: '100%' }} /> : <span style={{ padding: 20, textAlign: 'center' }}>Foto produk akan tampil di sini</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}><strong style={{ display: 'block', fontSize: 12 }}>📦 Min Order</strong><span style={{ fontSize: 12, color: '#475569' }}>4 pcs / model</span></div>
            <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}><strong style={{ display: 'block', fontSize: 12 }}>💰 Grosir</strong><span style={{ fontSize: 12, color: '#475569' }}>Harga khusus</span></div>
            <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}><strong style={{ display: 'block', fontSize: 12 }}>🚚 Kirim</strong><span style={{ fontSize: 12, color: '#475569' }}>Seluruh Indonesia</span></div>
            <div style={{ padding: 12, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}><strong style={{ display: 'block', fontSize: 12 }}>💬 WA</strong><span style={{ fontSize: 12, color: '#475569' }}>Fast respon</span></div>
          </div>
        </div>
      </section>

      {/* INFO 4 ICON */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '10px 16px 18px', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
        {[
          { icon: '📦', title: 'Minimal Order', desc: '4 pcs / model' },
          { icon: '🚚', title: 'Kirim', desc: 'Seluruh Indonesia' },
          { icon: '🏪', title: 'Ready Stock', desc: 'Stok real toko' },
          { icon: '💬', title: 'Konsultasi WA', desc: 'Fast respon admin' },
        ].map((it) => (
          <div key={it.title} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 14px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: 20 }}>{it.icon}</span>
            <div><strong style={{ display: 'block', fontSize: 13 }}>{it.title}</strong><span style={{ fontSize: 12, color: '#64748b' }}>{it.desc}</span></div>
          </div>
        ))}
      </section>

      {/* KATALOG */}
      <section id="produk" style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 16px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Katalog Produk</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>Data langsung dari database Toko Metro • {MIN_ORDER_BADGE}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ minHeight: 40, minWidth: 160 }}>
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input placeholder="Cari produk…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minHeight: 40, minWidth: 180 }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ height: 280, borderRadius: 12, background: '#e2e8f0' }} />)}
          {!loading && products.map((p) => {
            const colors = (p.variant_colors || '').split('|').filter(Boolean).slice(0, 6);
            const img = p.photo_path ? `${api.replace('/api','')}${p.photo_path}` : '';
            const waMsg = `Halo Admin Anyostore. Saya tertarik dengan ${p.name}. Link: ${typeof window !== 'undefined' ? window.location.origin : ''}/produk/${p.id}. Saya paham minimal 4 pcs per model.`;
            return (
              <article key={p.id} style={{ display: 'grid', gap: 0, borderRadius: 12, overflow: 'hidden', background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 2px 10px rgba(0,0,0,.04)' }}>
                <div style={{ position: 'relative', aspectRatio: '1/1', background: '#f1f5f9', overflow: 'hidden' }}>
                  <SafeImage src={img} alt={p.name} style={{ width: '100%', height: '100%' }} />
                  <span style={{ position: 'absolute', left: 8, top: 8, padding: '4px 8px', borderRadius: 999, background: '#fff', border: '1px solid #f59e0b', color: '#92400e', fontSize: 10, fontWeight: 800 }}>Min 4 pcs / model</span>
                  {Number(p.total_stock || 0) > 0 ? <span style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', borderRadius: 999, background: '#dcfce7', color: '#166534', fontSize: 10, fontWeight: 700 }}>Ready</span> : <span style={{ position: 'absolute', right: 8, top: 8, padding: '4px 8px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontSize: 10, fontWeight: 700 }}>Tanya stok</span>}
                </div>
                <div style={{ padding: 12, display: 'grid', gap: 6 }}>
                  <strong style={{ fontSize: 13, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.name}</strong>
                  <span style={{ color: '#1e3a5f', fontWeight: 800, fontSize: 14 }}>Rp{Number(p.price || 0).toLocaleString('id-ID')}</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 18 }}>
                    {colors.map((c) => <span key={c} style={{ padding: '2px 6px', borderRadius: 999, background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: 10 }}>{c}</span>)}
                    {!colors.length && <span style={{ fontSize: 11, color: '#94a3b8' }}>Varian warna tersedia</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, marginTop: 2 }}>
                    <a href={`/produk/${p.id}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, borderRadius: 8, background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>Lihat Detail</a>
                    <a href={waLink(waPhone, waMsg)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, padding: '0 10px', borderRadius: 8, background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: 12, textDecoration: 'none' }}>WA</a>
                  </div>
                  <span style={{ fontSize: 10, color: '#92400e', background: '#fffbeb', border: '1px dashed #fbbf24', padding: '4px 6px', borderRadius: 6, textAlign: 'center' }}>Minimal pembelian <strong>4 pcs per model</strong></span>
                </div>
              </article>
            );
          })}
        </div>
        {!loading && !products.length && <p style={{ textAlign: 'center', color: '#64748b', marginTop: 20 }}>Tidak ada produk di cabang Metro.</p>}
      </section>

      <footer style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 16px 90px', color: '#64748b', fontSize: 12, borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>© {new Date().getFullYear()} Anyostore • Supplier Baju Denim Wanita Grosir • Minimal 4 pcs per model</span>
        <span><a href="/login" style={{ color: '#1e3a5f', fontWeight: 700 }}>Login Pegawai</a></span>
      </footer>

      <FloatingWA phones={waPhones} message={`Halo Admin Anyostore.\n\nSaya ingin meminta katalog grosir.\n\nSaya mengetahui bahwa minimal pembelian adalah 4 pcs per model.\n\nMohon informasi lebih lanjut.`} />

      <style>{`
        @media (max-width: 720px) {
          header + section { grid-template-columns: 1fr !important; }
          section#produk > div:first-child { flex-direction: column; align-items: stretch !important; }
          div[style*="repeat(4,1fr)"] { grid-template-columns: repeat(2,1fr) !important; }
          div[style*="repeat(auto-fill"] { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
        }
      `}</style>
    </div>
  );
}
