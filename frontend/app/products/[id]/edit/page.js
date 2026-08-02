'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { GripVertical, ImagePlus, Plus, Video, X } from 'lucide-react';
import AppShell from '../../../components/AppShell';
import { uploadMediaData, validateDataUpload } from '../../../lib/media-upload';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const emptyVariant = () => ({ color: '', size: '', sku: '', barcode: '', price: '' });
const ACCENT = '#1e3a5f';

// Transform disimpan sebagai "scale,xPct,yPct" — pan dalam persen terhadap box,
// supaya hasil crop konsisten di semua ukuran box (modal, detail, landing, grid).
// maxPanPct = (scale - 1) / 2 * 100, berlaku untuk sumbu X dan Y.
const parseTransform = (raw) => {
  const t = String(raw || '').split(',').map(Number);
  return { scale: t.length >= 3 && isFinite(t[0]) && t[0] > 0 ? t[0] : 1, x: isFinite(t[1]) ? t[1] : 0, y: isFinite(t[2]) ? t[2] : 0 };
};
const formatTransform = (p) => `${Math.round(p.scale * 100) / 100},${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
const maxPanPct = (scale) => ((scale - 1) / 2) * 100;

function AdjModal({ photo, mediaUrl, onClose, onSave, onUpdate }) {
  const [dragging, setDragging] = useState(false);
  const [last, setLast] = useState({ x: 0, y: 0 });
  const viewportRef = useRef(null);

  function clampPan(p) {
    const max = maxPanPct(p.scale);
    return { ...p, x: Math.max(-max, Math.min(max, p.x)), y: Math.max(-max, Math.min(max, p.y)) };
  }
  function zoomBy(delta) {
    const next = Math.min(4, Math.max(1, Math.round((photo.scale + delta) * 100) / 100));
    onUpdate(clampPan({ ...photo, scale: next }));
  }
  function onWheel(e) {
    e.preventDefault();
    zoomBy(e.deltaY > 0 ? -0.08 : 0.08);
  }
  function onPointerDown(e) {
    e.preventDefault();
    setDragging(true);
    setLast({ x: e.clientX, y: e.clientY });
    if (viewportRef.current) viewportRef.current.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const el = viewportRef.current;
    if (!el) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    setLast({ x: e.clientX, y: e.clientY });
    onUpdate(clampPan({ ...photo, x: photo.x + (dx / el.clientWidth) * 100, y: photo.y + (dy / el.clientHeight) * 100 }));
  }
  function onPointerUp(e) {
    setDragging(false);
    if (viewportRef.current) viewportRef.current.releasePointerCapture(e.pointerId);
  }
  const pct = (v) => `${Math.round(v * 10) / 10}%`;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .62)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Atur Foto" style={{ background: '#fff', borderRadius: 16, padding: 0, maxWidth: 460, width: '100%', overflow: 'hidden', boxShadow: '0 24px 60px rgba(15, 23, 42, .35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eef1f5' }}>
          <div>
            <strong style={{ fontSize: 15, color: '#0f172a' }}>Atur Foto</strong>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>Crop 3:4 — hasil sama dengan kartu produk</p>
          </div>
          <button onClick={onClose} aria-label="Tutup" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f1f5f9', fontSize: 16, lineHeight: 1, cursor: 'pointer', color: '#475569', display: 'grid', placeItems: 'center' }}>×</button>
        </div>

        {/* Viewport: dark checkerboard + rule-of-thirds grid overlay */}
        <div style={{ padding: '14px 20px' }}>
          <div
            ref={viewportRef}
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ position: 'relative', width: '100%', aspectRatio: '3/4', overflow: 'hidden', borderRadius: 10, background: 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 0 0 / 24px 24px', border: '1px solid #e2e8f0', cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
          >
            <img src={mediaUrl(photo.path)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', transform: `translate(${photo.x}%, ${photo.y}%) scale(${photo.scale})`, pointerEvents: 'none', display: 'block' }} />
            {/* Rule-of-thirds overlay */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.35)' }} />
              <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.35)' }} />
              <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,.35)' }} />
              <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,.35)' }} />
            </div>
            {/* Full-image thumbnail for context */}
            <div style={{ position: 'absolute', right: 8, bottom: 8, width: 64, height: 85, borderRadius: 6, overflow: 'hidden', border: '2px solid #fff', boxShadow: '0 2px 10px rgba(0,0,0,.35)', background: '#fff', pointerEvents: 'none' }}>
              <img src={mediaUrl(photo.path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            </div>
          </div>
        </div>

        {/* Zoom controls */}
        <div style={{ padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => zoomBy(-0.1)} aria-label="Perkecil" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>−</button>
          <input type="range" min="1" max="4" step="0.01" value={photo.scale} onChange={(e) => onUpdate(clampPan({ ...photo, scale: Number(e.target.value) }))} aria-label="Perbesar" style={{ flex: 1, accentColor: ACCENT }} />
          <button onClick={() => zoomBy(0.1)} aria-label="Perbesar" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 16, lineHeight: 1, cursor: 'pointer', flexShrink: 0 }}>+</button>
          <span style={{ fontSize: 12, color: '#475569', minWidth: 52, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{photo.scale.toFixed(2)}×</span>
        </div>
        <p style={{ margin: '8px 20px 0', fontSize: 11, color: '#94a3b8' }}>Geser untuk posisi · Gulir / slider untuk zoom · Pan maksimal ±{pct(maxPanPct(photo.scale))}</p>

        <div style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid #eef1f5', marginTop: 14 }}>
          <button onClick={() => onUpdate({ ...photo, scale: 1, x: 0, y: 0 })} style={{ minHeight: 42, padding: '0 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', cursor: 'pointer', fontWeight: 600 }}>Reset</button>
          <div style={{ flex: 1 }} />
          <button onClick={onSave} style={{ flex: 1, minHeight: 42, borderRadius: 8, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Simpan</button>
        </div>
      </div>
    </div>
  );
}

export default function EditProductPage() {
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [variants, setVariants] = useState([]);
  const [media, setMedia] = useState([]);
  const [mediaUploading, setMediaUploading] = useState(false);
  const params = useParams();
  const productId = params?.id;
  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });
  const mediaUrl = (path) => path ? `${apiUrl.replace('/api', '')}${path}` : '';
  const thumbStyle = (m) => {
    const t = parseTransform(m.transform);
    return t.scale !== 1 || t.x !== 0 || t.y !== 0 ? { objectFit: 'cover', objectPosition: 'center', transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale})` } : { objectFit: 'contain', objectPosition: 'center' };
  };

  useEffect(() => {
    if (!token()) { window.location.assign('/'); return; }
    Promise.all([fetch(`${apiUrl}/products/${productId}`, { headers: headers() }), fetch(`${apiUrl}/products/categories`, { headers: headers() })])
      .then(async ([itemResponse, categoriesResponse]) => {
        const itemBody = await itemResponse.json();
        const categoriesBody = await categoriesResponse.json();
        if (!itemResponse.ok) throw new Error(itemBody.message);
        if (!categoriesResponse.ok) throw new Error(categoriesBody.message);
        setProduct(itemBody.data);
        setCategories(categoriesBody.data || []);
        setTiers((itemBody.data.wholesale_prices || []).map((tier) => ({ min_qty: String(tier.min_qty), max_qty: tier.max_qty == null ? '' : String(tier.max_qty), price: String(tier.price) })));
        setVariants((itemBody.data.variants || []).map((variant) => ({ id: variant.id, color: variant.color || '', size: variant.size || '', sku: variant.sku || '', barcode: variant.barcode || '', price: variant.price == null ? '' : String(variant.price), stock: variant.stock, photo_path: variant.photo_path || '' })));
        setMedia(itemBody.data.media || []);
        setForm({ name: itemBody.data.name || '', category_id: String(itemBody.data.category_id), sku: itemBody.data.sku || '', barcode: itemBody.data.barcode || '', price: String(itemBody.data.price || ''), cost: String(itemBody.data.cost || ''), min_stock: String(itemBody.data.min_stock || 0), gender: itemBody.data.gender || 'unisex', description: itemBody.data.description || '' });
      })
      .catch((error) => setMessage(error.message || 'Produk tidak dapat dimuat'));
  }, [productId]);

  function choosePhoto(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setMessage('Pilih JPG, PNG, atau WebP.'); return; }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setMessage('');
  }
  function updateTier(index, key, value) { setTiers((current) => current.map((tier, itemIndex) => itemIndex === index ? { ...tier, [key]: value } : tier)); }
  function updateVariant(index, key, value) { setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, [key]: value } : variant)); }
  async function uploadMedia(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const images = selected.filter((file) => file.type.startsWith('image/'));
    const videos = selected.filter((file) => file.type.startsWith('video/'));
    const imageCount = media.filter((item) => item.media_type === 'image').length;
    const videoCount = media.filter((item) => item.media_type === 'video').length;
    if (images.length + imageCount > 10 || videos.length + videoCount > 1) { setMessage('Produk maksimal memiliki 10 foto dan 1 video.'); return; }
    const invalid = selected.map((file) => validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])).find(Boolean);
    if (invalid) { setMessage(invalid); return; }
    setMediaUploading(true); setMessage('');
    try {
      for (const file of selected) await uploadMediaData(`${apiUrl}/products/${productId}/media-data`, file, token());
      const refreshed = await fetch(`${apiUrl}/products/${productId}`, { headers: headers() }).then((result) => result.json());
      setMedia(refreshed.data?.media || []);
      setMessage('Media produk berhasil diunggah.');
    } catch (error) { setMessage(error.message); } finally { setMediaUploading(false); }
  }
  async function uploadVariantPhoto(variantId, file) {
    if (!file) return;
    const invalid = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (invalid) { setMessage(invalid); return; }
    try {
      const body = await uploadMediaData(`${apiUrl}/products/${productId}/variants/${variantId}/photo-data`, file, token());
      setVariants((current) => current.map((variant) => variant.id === variantId ? { ...variant, photo_path: body.data.path } : variant));
      setMessage('Foto varian berhasil diperbarui.');
    } catch (error) { setMessage(error.message); }
  }

  async function deleteMedia(mediaId) {
    if (!window.confirm('Hapus foto ini?')) return;
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/products/${productId}/media/${mediaId}`, { method: 'DELETE', headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Foto gagal dihapus');
      setMedia((current) => current.filter((item) => item.id !== mediaId));
      setMessage('Foto berhasil dihapus.');
    } catch (error) { setMessage(error.message); }
  }

  async function saveOrder(images) {
    try {
      await fetch(`${apiUrl}/products/${productId}/media/reorder`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ order: images.map((item) => item.id) }) });
    } catch { /* urutan tetap tersimpan lokal; abaikan kegagalan kecil */ }
  }

  function moveImage(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    setMedia((current) => {
      const images = current.filter((item) => item.media_type === 'image');
      const others = current.filter((item) => item.media_type !== 'image');
      const reordered = [...images];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      saveOrder(reordered);
      return [...reordered, ...others];
    });
    setMessage('Urutan foto diperbarui. Foto pertama menjadi foto utama.');
  }

  const [dragFrom, setDragFrom] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [adjPhoto, setAdjPhoto] = useState(null);

  function openAdj(m) {
    if (m.media_type !== 'image') return;
    setAdjPhoto({ mediaId: m.id, path: m.path, ...parseTransform(m.transform) });
  }
  async function saveAdj() {
    if (!adjPhoto) return;
    try {
      const transform = formatTransform(adjPhoto);
      const r = await fetch(`${apiUrl}/products/${productId}/media/${adjPhoto.mediaId}/transform`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ transform }) });
      if (!r.ok) throw new Error((await r.json()).message);
      setMedia((current) => current.map((m) => m.id === adjPhoto.mediaId ? { ...m, transform } : m));
      setAdjPhoto(null);
      setMessage('Aturan foto tersimpan.');
    } catch (e) { setMessage(e.message); }
  }
  function onDragStart(index) { return (event) => { setDragFrom(index); event.dataTransfer.effectAllowed = 'move'; }; }
  function onDragEnd() { setDragFrom(null); setDropTarget(null); }
  function onDragOver(index) { return (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dropTarget !== index) setDropTarget(index); }; }
  function onDrop(toIndex) { return (event) => { event.preventDefault(); if (dragFrom != null) moveImage(dragFrom, toIndex); setDragFrom(null); setDropTarget(null); }; }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/products/${productId}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ ...form, category_id: Number(form.category_id), price: Number(form.price), cost: Number(form.cost || 0), min_stock: Number(form.min_stock), wholesale_prices: tiers, variants }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Produk gagal diperbarui');
      if (photo) {
        const upload = new FormData();
        upload.append('photo', photo);
        const uploadResponse = await fetch(`${apiUrl}/products/${productId}/photo`, { method: 'POST', headers: { Authorization: `Bearer ${token()}` }, body: upload });
        const uploadBody = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(`Data produk diperbarui, tetapi foto gagal: ${uploadBody.message || 'coba lagi'}`);
        setProduct({ ...product, photo_path: uploadBody.data.path });
        setPhoto(null);
        setPreview('');
      }
      setMessage('Produk dan varian berhasil diperbarui.');
      window.location.href = '/products';
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  const productImages = media.filter((item) => item.media_type === 'image');
  const productVideo = media.find((item) => item.media_type === 'video');

  return (
    <AppShell title="Edit Produk" eyebrow="KATALOG PRODUK" actions={<><a className="button-link" href={`/produk/${productId}`} target="_blank" rel="noopener noreferrer">Cek Detail Produk</a><a className="button-link secondary-link" href="/products">Kembali ke Daftar</a></>}>
      <section className="form-page">
        {!form ? <section className="panel"><p>Memuat data produk…</p>{message && <p className="message">{message}</p>}</section> : (
          <form className="panel product-form" onSubmit={submit}>
            <div><h2>{product.name}</h2><p className="muted">Stok saat ini {product.stock}. Ubah stok melalui menu inventori agar mutasi tercatat.</p></div>
            <section className="media-manager"><div className="section-heading"><div><h3>Media produk</h3><p>Isi hingga 10 foto dan 1 video. Kotak pertama akan menjadi foto utama katalog.</p></div><span className="media-counter">{productImages.length}/10 foto · {productVideo ? '1/1 video' : '0/1 video'}</span></div>            <div className="media-grid">{Array.from({ length: 10 }, (_, index) => { const item = productImages[index]; return item ? <figure key={item.id} draggable onDragStart={onDragStart(index)} onDragEnd={onDragEnd} onDragOver={onDragOver(index)} onDrop={onDrop(index)} className={`media-draggable${dragFrom === index ? ' is-dragging' : ''}${dropTarget === index && dragFrom !== index ? ' drop-target' : ''}`}>          <img src={mediaUrl(item.path)} alt={`Foto ${index + 1} ${product.name}`} style={{ width: '100%', height: '100%', ...thumbStyle(item) }} /><span className="media-drag-handle" aria-hidden="true"><GripVertical size={14} /></span><button type="button" className="media-delete" aria-label={`Hapus foto ${index + 1}`} onClick={() => deleteMedia(item.id)}><X aria-hidden="true" size={14} /></button><button type="button" onClick={() => openAdj(item)} style={{ position: 'absolute', left: 4, bottom: 4, padding: '2px 6px', borderRadius: 4, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 9, cursor: 'pointer' }}>Atur</button><figcaption>{index === 0 ? 'Foto utama' : `Foto ${index + 1}`}</figcaption></figure> : <label className="media-slot" key={`slot-${index}`}><ImagePlus aria-hidden="true" size={18} /><span>Foto {index + 1}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={mediaUploading} onChange={(event) => uploadMedia(event.target.files)} /></label>; })}<label className="media-slot video-slot">{productVideo ? <video controls preload="metadata" src={mediaUrl(productVideo.path)} /> : <><Video aria-hidden="true" size={18} /><span>Video produk</span></>}<input type="file" accept="video/mp4,video/webm" disabled={mediaUploading || Boolean(productVideo)} onChange={(event) => uploadMedia(event.target.files)} /></label></div>{mediaUploading && <p className="muted">Mengunggah media…</p>}</section>
            <label>Nama produk<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>Kategori<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} required><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <div className="two-fields"><label>SKU<input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></label><label>Barcode<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label></div>
            <div className="two-fields"><label>Harga jual<input type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label><label>Harga beli<input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></label></div>
            <div className="two-fields"><label>Stok minimum<input type="number" min="0" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} required /></label><label>Target pengguna<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="unisex">Unisex</option><option value="male">Pria</option><option value="female">Wanita</option><option value="kids">Anak</option></select></label></div>
            <label>Deskripsi<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} style={{ resize: 'vertical', minHeight: 100 }} /></label>
            <section className="variant-section">
              <div className="section-heading"><div><h3>Varian warna</h3><p>Warna dan harga khusus. Stok setiap warna dikelola melalui inventori.</p></div><button type="button" className="secondary small" onClick={() => setVariants((current) => [...current, emptyVariant()])}><Plus aria-hidden="true" size={14} /> Tambah warna</button></div>
              {variants.length > 0 && <div className="variant-list">{variants.map((variant, index) => <div className="variant-row" key={variant.id || index}><label>Warna<input value={variant.color} onChange={(event) => updateVariant(index, 'color', event.target.value)} placeholder="Contoh: Navy" required /></label><label>SKU varian<input value={variant.sku} onChange={(event) => updateVariant(index, 'sku', event.target.value)} placeholder="Opsional" /></label><label>Harga khusus<input type="number" min="0" value={variant.price} onChange={(event) => updateVariant(index, 'price', event.target.value)} placeholder="Harga produk" /></label><div className="variant-stock"><span>Stok</span><strong>{variant.stock ?? 0}</strong></div>{variant.id && <label className="variant-photo-upload">{variant.photo_path ? <img src={mediaUrl(variant.photo_path)} alt={`Foto varian ${variant.color}`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} /> : 'Foto varian'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadVariantPhoto(variant.id, event.target.files?.[0])} /></label>}<button className="remove-variant" type="button" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Hapus varian ${index + 1}`}><X aria-hidden="true" size={16} /></button></div>)}</div>}
            </section>
            <section className="wholesale-section"><div className="section-heading"><div><h3>Harga grosir</h3><p>Atur harga berdasarkan jumlah pembelian.</p></div><button type="button" className="secondary small" onClick={() => setTiers((current) => [...current, { min_qty: '', max_qty: '', price: '' }])}>Tambah tingkat</button></div>{tiers.map((tier, index) => <div className="wholesale-row" key={index}><label>Min. qty<input type="number" min="1" value={tier.min_qty} onChange={(event) => updateTier(index, 'min_qty', event.target.value)} required /></label><label>Maks. qty<input type="number" min="1" value={tier.max_qty} onChange={(event) => updateTier(index, 'max_qty', event.target.value)} placeholder="Tanpa batas" /></label><label>Harga/unit<input type="number" min="0" value={tier.price} onChange={(event) => updateTier(index, 'price', event.target.value)} required /></label><button type="button" className="remove-tier" onClick={() => setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Hapus</button></div>)}</section>
            <div className="form-actions"><button disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button><a href="/products">Batal</a></div>
            {message && <p className="message" role="status">{message}</p>}
          </form>
        )}
      </section>

      {adjPhoto && (
        <AdjModal photo={adjPhoto} mediaUrl={mediaUrl} onClose={() => setAdjPhoto(null)} onSave={saveAdj} onUpdate={setAdjPhoto} />
      )}

    </AppShell>
  );
}
