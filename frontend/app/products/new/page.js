'use client';

import { useEffect, useState } from 'react';
import { GripVertical, Plus, X } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { uploadMediaData, validateDataUpload } from '../../lib/media-upload';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const emptyForm = { name: '', category_id: '', sku: '', barcode: '', price: '', cost: '', min_stock: '5', gender: 'unisex' };
const emptyVariant = () => ({ color: '', size: '', sku: '', barcode: '', price: '' });

export default function NewProductPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageFiles, setImageFiles] = useState(Array(10).fill(null));
  const [imagePreviews, setImagePreviews] = useState(Array(10).fill(''));
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState('');
  const [tiers, setTiers] = useState([]);
  const [variants, setVariants] = useState([]);
  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

  useEffect(() => {
    if (!token()) { window.location.assign('/'); return; }
    fetch(`${apiUrl}/products/categories`, { headers: headers() })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setCategories(body.data || []);
      })
      .catch((error) => setMessage(error.message || 'Kategori tidak dapat dimuat'));
  }, []);

  function chooseImage(index, file) {
    if (!file) return;
    const error = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (error) {
      setMessage(error);
      return;
    }
    setImageFiles((current) => current.map((item, itemIndex) => itemIndex === index ? file : item));
    setImagePreviews((current) => current.map((item, itemIndex) => itemIndex === index ? URL.createObjectURL(file) : item));
    setMessage('');
  }
  function chooseVideo(file) {
    if (!file) return;
    const error = validateDataUpload(file, ['video/mp4', 'video/webm']);
    if (error) {
      setMessage(error);
      return;
    }
    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
    setMessage('');
  }
  function removeImage(index) {
    setImageFiles((current) => current.map((item, itemIndex) => itemIndex === index ? null : item));
    setImagePreviews((current) => current.map((item, itemIndex) => itemIndex === index ? '' : item));
  }
  function moveImage(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    setImageFiles((current) => { const next = [...current]; const [moved] = next.splice(fromIndex, 1); next.splice(toIndex, 0, moved); return next; });
    setImagePreviews((current) => { const next = [...current]; const [moved] = next.splice(fromIndex, 1); next.splice(toIndex, 0, moved); return next; });
  }
  const [dragFrom, setDragFrom] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const onDragStart = (index) => (event) => { setDragFrom(index); event.dataTransfer.effectAllowed = 'move'; };
  const onDragEnd = () => { setDragFrom(null); setDropTarget(null); };
  const onDragOver = (index) => (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dropTarget !== index) setDropTarget(index); };
  const onDrop = (toIndex) => (event) => { event.preventDefault(); if (dragFrom != null) moveImage(dragFrom, toIndex); setDragFrom(null); setDropTarget(null); };
  function updateTier(index, key, value) { setTiers((current) => current.map((tier, itemIndex) => itemIndex === index ? { ...tier, [key]: value } : tier)); }
  function updateVariant(index, key, value) { setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, [key]: value } : variant)); }

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/products`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...form, category_id: Number(form.category_id), price: Number(form.price), cost: Number(form.cost || 0), min_stock: Number(form.min_stock), wholesale_prices: tiers, variants }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan produk');
      // Upload the first selected photo last because every newly uploaded photo
      // becomes primary on the server. The user's Foto 1 remains the cover.
      const selectedMedia = [...imageFiles.filter(Boolean).reverse(), ...(videoFile ? [videoFile] : [])];
      for (const file of selectedMedia) await uploadMediaData(`${apiUrl}/products/${body.data.id}/media-data`, file, token());
      setForm(emptyForm);
      setImageFiles(Array(10).fill(null));
      setImagePreviews(Array(10).fill(''));
      setVideoFile(null);
      setVideoPreview('');
      setTiers([]);
      setVariants([]);
      formElement.reset();
      setMessage(selectedMedia.length ? 'Produk, varian, foto, dan video berhasil disimpan.' : 'Produk dan varian berhasil disimpan.');
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  return (
    <AppShell title="Tambah Produk" eyebrow="KATALOG PRODUK" actions={<a className="button-link secondary-link" href="/products">Kembali ke Daftar</a>}>
      <section className="form-page">
        <form className="panel product-form" onSubmit={submit}>
          <div><h2>Informasi produk</h2><p className="muted">Isi data produk sekaligus dengan maksimal 10 foto dan 1 video.</p></div>
          <section className="media-manager new-product-media"><div className="section-heading"><div><h3>Foto & video produk</h3><p>Klik setiap kotak untuk memilih media. Foto pertama menjadi gambar utama.</p></div><span className="media-counter">{imageFiles.filter(Boolean).length}/10 foto · {videoFile ? 1 : 0}/1 video</span></div><div className="media-grid">{imageFiles.map((file, index) => imagePreviews[index] ? <figure key={index} className={`media-draggable${dragFrom === index ? ' is-dragging' : ''}${dropTarget === index && dragFrom !== index ? ' drop-target' : ''}`} draggable onDragStart={onDragStart(index)} onDragEnd={onDragEnd} onDragOver={onDragOver(index)} onDrop={onDrop(index)}><img src={imagePreviews[index]} alt={'Pratinjau foto produk ' + (index + 1)} /><span className="media-drag-handle" aria-hidden="true"><GripVertical size={14} /></span><button type="button" className="media-delete" aria-label={'Hapus foto ' + (index + 1)} onClick={() => removeImage(index)}><X aria-hidden="true" size={14} /></button><figcaption>{index === 0 ? 'Foto utama' : 'Foto ' + (index + 1)}</figcaption></figure> : <label className="media-slot" key={index}><strong>Foto {index + 1}</strong><span>JPG, PNG, WebP</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseImage(index, event.target.files?.[0])} /></label>)}<label className="media-slot video-slot">{videoPreview ? <video src={videoPreview} muted /> : <><strong>Video</strong><span>MP4 atau WebM</span></>}<input type="file" accept="video/mp4,video/webm" onChange={(event) => chooseVideo(event.target.files?.[0])} /></label></div></section>
          <label>Nama produk<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required autoFocus /></label>
          <label>Kategori<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} required><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <div className="two-fields"><label>SKU<input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></label><label>Barcode<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label></div>
          <div className="two-fields"><label>Harga jual<input type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label><label>Harga beli<input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></label></div>
          <div className="two-fields"><label>Stok minimum<input type="number" min="0" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} required /></label><label>Target pengguna<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="unisex">Unisex</option><option value="male">Pria</option><option value="female">Wanita</option><option value="kids">Anak</option></select></label></div>
          <section className="variant-section">
            <div className="section-heading"><div><h3>Varian warna</h3><p>Tambahkan warna dan harga khusus bila diperlukan. Stok setiap warna diatur dari menu inventori.</p></div><button type="button" className="secondary small" onClick={() => setVariants((current) => [...current, emptyVariant()])}><Plus aria-hidden="true" size={14} /> Tambah warna</button></div>
            {variants.length > 0 && <div className="variant-list">{variants.map((variant, index) => <div className="variant-row" key={index}><label>Warna<input value={variant.color} onChange={(event) => updateVariant(index, 'color', event.target.value)} placeholder="Contoh: Navy" required /></label><label>SKU varian<input value={variant.sku} onChange={(event) => updateVariant(index, 'sku', event.target.value)} placeholder="Opsional" /></label><label>Harga khusus<input type="number" min="0" value={variant.price} onChange={(event) => updateVariant(index, 'price', event.target.value)} placeholder="Harga produk" /></label><button className="remove-variant" type="button" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Hapus varian ${index + 1}`}><X aria-hidden="true" size={16} /></button></div>)}</div>}
          </section>
          <section className="wholesale-section"><div className="section-heading"><div><h3>Harga grosir</h3><p>Berlaku otomatis saat pembelian mencapai jumlah minimum.</p></div><button type="button" className="secondary small" onClick={() => setTiers((current) => [...current, { min_qty: '', max_qty: '', price: '' }])}>Tambah tingkat</button></div>{tiers.map((tier, index) => <div className="wholesale-row" key={index}><label>Min. qty<input type="number" min="1" value={tier.min_qty} onChange={(event) => updateTier(index, 'min_qty', event.target.value)} required /></label><label>Maks. qty<input type="number" min="1" value={tier.max_qty} onChange={(event) => updateTier(index, 'max_qty', event.target.value)} placeholder="Tanpa batas" /></label><label>Harga/unit<input type="number" min="0" value={tier.price} onChange={(event) => updateTier(index, 'price', event.target.value)} required /></label><button type="button" className="remove-tier" onClick={() => setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Hapus</button></div>)}</section>
          <div className="form-actions"><button disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Produk'}</button><a href="/products">Batal</a></div>
          {message && <p className="message" role="status">{message}</p>}
        </form>
      </section>
    </AppShell>
  );
}
