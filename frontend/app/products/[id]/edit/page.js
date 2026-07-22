'use client';

import { use, useEffect, useState } from 'react';
import { ImagePlus, Plus, Video, X } from 'lucide-react';
import AppShell from '../../../components/AppShell';
import { uploadMediaData, validateDataUpload } from '../../../lib/media-upload';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const emptyVariant = () => ({ color: '', size: '', sku: '', barcode: '', price: '' });

export default function EditProductPage({ params }) {
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
  const { id: productId } = use(params);
  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });
  const mediaUrl = (path) => path ? `${apiUrl.replace('/api', '')}${path}` : '';

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
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setMessage('Pilih JPG, PNG, atau WebP dengan ukuran maksimal 5 MB.'); return; }
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
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  const productImages = media.filter((item) => item.media_type === 'image');
  const productVideo = media.find((item) => item.media_type === 'video');

  return (
    <AppShell title="Edit Produk" eyebrow="KATALOG PRODUK" actions={<a className="button-link secondary-link" href="/products">Kembali ke Daftar</a>}>
      <section className="form-page">
        {!form ? <section className="panel"><p>Memuat data produk…</p>{message && <p className="message">{message}</p>}</section> : (
          <form className="panel product-form" onSubmit={submit}>
            <div><h2>{product.name}</h2><p className="muted">Stok saat ini {product.stock}. Ubah stok melalui menu inventori agar mutasi tercatat.</p></div>
            <section className="media-manager"><div className="section-heading"><div><h3>Media produk</h3><p>Isi hingga 10 foto dan 1 video. Kotak pertama akan menjadi foto utama katalog.</p></div><span className="media-counter">{productImages.length}/10 foto · {productVideo ? '1/1 video' : '0/1 video'}</span></div><div className="media-grid">{Array.from({ length: 10 }, (_, index) => { const item = productImages[index]; return item ? <figure key={item.id}>{<img src={mediaUrl(item.path)} alt={`Foto ${index + 1} ${product.name}`} />}<figcaption>{index === 0 ? 'Foto utama' : `Foto ${index + 1}`}</figcaption></figure> : <label className="media-slot" key={`slot-${index}`}><ImagePlus aria-hidden="true" size={18} /><span>Foto {index + 1}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={mediaUploading} onChange={(event) => uploadMedia(event.target.files)} /></label>; })}<label className="media-slot video-slot">{productVideo ? <video controls preload="metadata" src={mediaUrl(productVideo.path)} /> : <><Video aria-hidden="true" size={18} /><span>Video produk</span></>}<input type="file" accept="video/mp4,video/webm" disabled={mediaUploading || Boolean(productVideo)} onChange={(event) => uploadMedia(event.target.files)} /></label></div>{mediaUploading && <p className="muted">Mengunggah media…</p>}</section>
            <label>Nama produk<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>Kategori<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} required><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <div className="two-fields"><label>SKU<input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></label><label>Barcode<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label></div>
            <div className="two-fields"><label>Harga jual<input type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label><label>Harga beli<input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></label></div>
            <div className="two-fields"><label>Stok minimum<input type="number" min="0" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} required /></label><label>Target pengguna<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="unisex">Unisex</option><option value="male">Pria</option><option value="female">Wanita</option><option value="kids">Anak</option></select></label></div>
            <label>Deskripsi<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <section className="variant-section">
              <div className="section-heading"><div><h3>Varian warna</h3><p>Warna dan harga khusus. Stok setiap warna dikelola melalui inventori.</p></div><button type="button" className="secondary small" onClick={() => setVariants((current) => [...current, emptyVariant()])}><Plus aria-hidden="true" size={14} /> Tambah warna</button></div>
              {variants.length > 0 && <div className="variant-list">{variants.map((variant, index) => <div className="variant-row" key={variant.id || index}><label>Warna<input value={variant.color} onChange={(event) => updateVariant(index, 'color', event.target.value)} placeholder="Contoh: Navy" required /></label><label>SKU varian<input value={variant.sku} onChange={(event) => updateVariant(index, 'sku', event.target.value)} placeholder="Opsional" /></label><label>Harga khusus<input type="number" min="0" value={variant.price} onChange={(event) => updateVariant(index, 'price', event.target.value)} placeholder="Harga produk" /></label><div className="variant-stock"><span>Stok</span><strong>{variant.stock ?? 0}</strong></div>{variant.id && <label className="variant-photo-upload">{variant.photo_path ? <img src={mediaUrl(variant.photo_path)} alt={`Foto varian ${variant.color}`} /> : 'Foto varian'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadVariantPhoto(variant.id, event.target.files?.[0])} /></label>}<button className="remove-variant" type="button" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Hapus varian ${index + 1}`}><X aria-hidden="true" size={16} /></button></div>)}</div>}
            </section>
            <section className="wholesale-section"><div className="section-heading"><div><h3>Harga grosir</h3><p>Atur harga berdasarkan jumlah pembelian.</p></div><button type="button" className="secondary small" onClick={() => setTiers((current) => [...current, { min_qty: '', max_qty: '', price: '' }])}>Tambah tingkat</button></div>{tiers.map((tier, index) => <div className="wholesale-row" key={index}><label>Min. qty<input type="number" min="1" value={tier.min_qty} onChange={(event) => updateTier(index, 'min_qty', event.target.value)} required /></label><label>Maks. qty<input type="number" min="1" value={tier.max_qty} onChange={(event) => updateTier(index, 'max_qty', event.target.value)} placeholder="Tanpa batas" /></label><label>Harga/unit<input type="number" min="0" value={tier.price} onChange={(event) => updateTier(index, 'price', event.target.value)} required /></label><button type="button" className="remove-tier" onClick={() => setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Hapus</button></div>)}</section>
            <div className="form-actions"><button disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button><a href="/products">Batal</a></div>
            {message && <p className="message" role="status">{message}</p>}
          </form>
        )}
      </section>
    </AppShell>
  );
}
