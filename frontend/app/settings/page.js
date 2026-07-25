'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { uploadMediaData, validateDataUpload } from '../lib/media-upload';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const defaults = {
  store_name: '', store_address: '', store_phone: '', store_email: '', store_tax_id: '', store_logo: '',
  receipt_header: '', receipt_footer: '', receipt_note: '', printer_size: '80', auto_print: 'false',
  theme: 'green', currency: 'IDR', tax_rate: '0', prices_include_tax: 'false',
  loyalty_enabled: 'false', loyalty_points_rate: '1', loyalty_points_value: '0',
  show_logo: 'true', show_qr: 'false', show_cashier: 'true', show_barcode: 'true',
  low_stock_alert: 'true', low_stock_email: '', order_prefix: '', invoice_prefix: 'INV', timezone: 'Asia/Jakarta'
};

function sanitizeBranchName(v) { return String(v || '').trim(); }

export default function SettingsPage() {
  const [form, setForm] = useState(defaults);
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // new branch state
  const [newBranch, setNewBranch] = useState({ name: '', address: '', phone: '', email: '', source_branch_id: '', price_multiplier: '1', clone_photos: true, pricing_tier_enabled: true });
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');

  const token = () => localStorage.getItem('pos_access_token');
  const jsonHeaders = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() });
  const mediaUrl = (value) => value ? api.replace('/api', '') + value : '';

  async function load(id) {
    try {
      const response = await fetch(api + '/settings' + (id ? '?branch_id=' + id : ''), { headers: jsonHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setForm({ ...defaults, ...body.data });
    } catch (error) { setMessage(error.message); }
  }

  async function loadBranches() {
    const response = await fetch(api + '/settings/branches', { headers: jsonHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    setStores(body.data || []);
    return body.data || [];
  }

  useEffect(() => {
    if (!token()) { window.location.assign('/'); return; }
    // detect owner
    fetch(api + '/auth/me', { headers: jsonHeaders() })
      .then((r) => r.json())
      .then((b) => { if (b?.data?.role === 'owner') setIsOwner(true); })
      .catch(() => {});
    loadBranches()
      .then(async (data) => {
        const id = String(data?.[0]?.id || '');
        setBranch(id);
        await load(id);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  const input = (key, label, type = 'text') => <label>{label}<input type={type} value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>;
  const select = (key, label, items) => <label>{label}<select value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })}>{items.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;

  async function uploadLogo(file) {
    if (!file) return;
    const invalid = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (invalid) { setMessage(invalid); return; }
    setUploadingLogo(true);
    setMessage('');
    try {
      const body = await uploadMediaData(api + '/settings/logo-data?branch_id=' + branch, file, token());
      setForm((current) => ({ ...current, store_logo: body.data.store_logo }));
      setMessage('Logo toko tersimpan dan siap digunakan pada struk serta laporan.');
    } catch (error) { setMessage(error.message); }
    finally { setUploadingLogo(false); }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(api + '/settings', {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({ ...form, branch_id: Number(branch) })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      document.documentElement.dataset.theme = form.theme;
      await load(branch);
      setMessage('Pengaturan toko tersimpan di database.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function createBranch(event) {
    event.preventDefault();
    if (!sanitizeBranchName(newBranch.name)) { setCreateMessage('Nama toko baru wajib diisi'); return; }
    const mult = Number(newBranch.price_multiplier);
    if (!Number.isFinite(mult) || mult <= 0) { setCreateMessage('Pengali harga harus > 0'); return; }
    setCreating(true);
    setCreateMessage('');
    try {
      const payload = {
        name: newBranch.name.trim(),
        address: newBranch.address.trim() || null,
        phone: newBranch.phone.trim() || null,
        email: newBranch.email.trim() || null,
        pricing_tier_enabled: Boolean(newBranch.pricing_tier_enabled),
        source_branch_id: newBranch.source_branch_id ? Number(newBranch.source_branch_id) : null,
        price_multiplier: mult,
        clone_photos: Boolean(newBranch.clone_photos),
      };
      const response = await fetch(api + '/settings/branches', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || `Gagal buat toko (${response.status})`);
      setCreateMessage(`Toko "${payload.name}" berhasil dibuat (ID ${body.data.id}) — ${body.data.cloned_products} produk dicloning. Stok awal 0, harga jual bisa beda.`);
      // reload list
      const fresh = await loadBranches();
      const id = String(body.data.id);
      setBranch(id);
      await load(id);
      setNewBranch({ name: '', address: '', phone: '', email: '', source_branch_id: fresh?.[0]?.id ? String(fresh[0].id) : '', price_multiplier: '1', clone_photos: true, pricing_tier_enabled: true });
    } catch (error) { setCreateMessage(error.message); }
    finally { setCreating(false); }
  }

  return <AppShell title="Pengaturan" eyebrow="KONFIGURASI TOKO">
    <div className="settings-form">
      {isOwner && (
        <section className="panel" style={{ border: '1px solid var(--border, #e5e7eb)', background: 'var(--panel, #fff)' }}>
          <h2>Tambah Toko + Clone Katalog</h2>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Buat cabang baru. Produk tetap sama (nama, kategori, varian, foto), yang berbeda hanya <strong>stok (0)</strong> dan <strong>harga jual</strong> per toko.
            Cocok untuk buka Toko Metro, Toko B, dll.
          </p>
          <form onSubmit={createBranch}>
            <div className="two-fields">
              <label>Nama toko baru<input value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} placeholder="Contoh: Toko Metro" required /></label>
              <label>Copy produk dari<select value={newBranch.source_branch_id} onChange={(e) => setNewBranch({ ...newBranch, source_branch_id: e.target.value })}><option value="">Jangan clone (kosong)</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name} (ID {s.id})</option>)}</select></label>
            </div>
            <div className="two-fields">
              <label>Alamat<input value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} placeholder="Jl. ..." /></label>
              <label>Telepon<input value={newBranch.phone} onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })} /></label>
            </div>
            <div className="two-fields">
              <label>Email toko<input type="email" value={newBranch.email} onChange={(e) => setNewBranch({ ...newBranch, email: e.target.value })} placeholder="metro@anyostore.my.id" /></label>
              <label>Pengali harga jual (1 = sama, 1.2 = 20% mahal)<input type="number" step="0.01" min="0.1" value={newBranch.price_multiplier} onChange={(e) => setNewBranch({ ...newBranch, price_multiplier: e.target.value })} /></label>
            </div>
            <div className="two-fields">
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}><input type="checkbox" checked={newBranch.clone_photos} onChange={(e) => setNewBranch({ ...newBranch, clone_photos: e.target.checked })} /> Clone foto produk</label>
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}><input type="checkbox" checked={newBranch.pricing_tier_enabled} onChange={(e) => setNewBranch({ ...newBranch, pricing_tier_enabled: e.target.checked })} /> Aktifkan tier harga (Semi/Grosir)</label>
            </div>
            <button type="submit" disabled={creating} style={{ marginTop: '1rem' }}>{creating ? 'Membuat…' : 'Buat Toko Baru'}</button>
            {createMessage && <p className="message" role="status" style={{ marginTop: '.75rem' }}>{createMessage}</p>}
          </form>
          <div className="muted" style={{ marginTop: '1rem', fontSize: '.9em' }}>
            <strong>Catatan:</strong>
            <ul style={{ margin: '.5rem 0 0 1.2rem' }}>
              <li>Stok awal toko baru selalu 0 — input via <a href="/inventory/incoming">Produk Masuk</a> setelah buat.</li>
              <li>SKU baru otomatis: <code>B&lt;idCabang&gt;-&lt;SKU lama&gt;</code> supaya unik.</li>
              <li>Harga jual bisa diubah per produk di <a href="/products">Daftar Produk</a> setelah clone.</li>
              <li>Gudang Utama & Cadangan otomatis dibuat.</li>
            </ul>
          </div>
        </section>
      )}

      <form onSubmit={save}>
      <section className="panel">
        <h2>Toko aktif</h2>
        {stores.length > 1 && <label>Pilih toko<select value={branch} onChange={(event) => { setBranch(event.target.value); load(event.target.value); }}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
        <p className="muted">Admin toko hanya dapat mengubah tokonya sendiri. Owner bisa kelola semua cabang.</p>
        {input('store_name', 'Nama toko')}
        {input('store_address', 'Alamat')}
        {input('store_phone', 'Nomor telepon', 'tel')}
        {input('store_email', 'Email', 'email')}
        {input('store_tax_id', 'NPWP / ID pajak')}
      </section>
      <section className="panel">
        <h2>Logo & identitas cetak</h2>
        <div className="store-logo-upload">
          <div className="store-logo-preview">{form.store_logo ? <img src={mediaUrl(form.store_logo)} alt={'Logo ' + (form.store_name || 'toko')} /> : <span>Belum ada logo</span>}</div>
          <div><p className="muted">Logo digunakan pada struk dan laporan yang dicetak atau disimpan sebagai PDF.</p><label className="media-upload">{uploadingLogo ? 'Mengunggah…' : 'Pilih logo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingLogo} onChange={(event) => uploadLogo(event.target.files?.[0])} /></label></div>
        </div>
        {select('show_logo', 'Tampilkan logo pada cetakan', [['true', 'Ya'], ['false', 'Tidak']])}
      </section>
      <section className="panel">
        <h2>Struk & kasir</h2>
        {input('receipt_header', 'Pesan atas struk')}
        {input('receipt_footer', 'Pesan bawah struk')}
        {input('receipt_note', 'Catatan tambahan')}
        {select('printer_size', 'Ukuran printer', [['58', '58 mm'], ['80', '80 mm']])}
        {select('show_cashier', 'Tampilkan kasir', [['true', 'Ya'], ['false', 'Tidak']])}
        {select('show_barcode', 'Tampilkan barcode', [['true', 'Ya'], ['false', 'Tidak']])}
        {input('invoice_prefix', 'Awalan invoice')}
      </section>
      <section className="panel">
        <h2>Penjualan & tampilan</h2>
        {select('theme', 'Tema aplikasi', [['green', 'Hijau toko'], ['blue', 'Biru profesional'], ['purple', 'Ungu modern']])}
        {input('tax_rate', 'Pajak (%)', 'number')}
        {select('prices_include_tax', 'Harga termasuk pajak', [['true', 'Ya'], ['false', 'Tidak']])}
        {select('loyalty_enabled', 'Loyalitas aktif', [['true', 'Ya'], ['false', 'Tidak']])}
        {input('loyalty_points_rate', 'Poin per Rp10.000', 'number')}
        {input('loyalty_points_value', 'Nilai 1 poin', 'number')}
        {select('low_stock_alert', 'Peringatan stok rendah', [['true', 'Aktif'], ['false', 'Tidak']])}
        {input('low_stock_email', 'Email notifikasi', 'email')}
        {input('timezone', 'Zona waktu')}
      </section>
      <section className="panel settings-submit">
        <h2>Simpan perubahan</h2>
        <p className="muted">Perubahan berlaku untuk toko yang sedang dipilih.</p>
        <button disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}</button>
        {message && <p className="message" role="status">{message}</p>}
      </section>
      </form>
    </div>
  </AppShell>;
}
