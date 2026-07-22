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

export default function SettingsPage() {
  const [form, setForm] = useState(defaults);
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
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

  useEffect(() => {
    if (!token()) { window.location.assign('/'); return; }
    fetch(api + '/settings/branches', { headers: jsonHeaders() })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setStores(body.data || []);
        const id = String(body.data?.[0]?.id || '');
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
    if (invalid) {
      setMessage(invalid);
      return;
    }
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

  return <AppShell title="Pengaturan" eyebrow="KONFIGURASI TOKO">
    <form className="settings-form" onSubmit={save}>
      <section className="panel">
        <h2>Toko aktif</h2>
        {stores.length > 1 && <label>Pilih toko<select value={branch} onChange={(event) => { setBranch(event.target.value); load(event.target.value); }}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
        <p className="muted">Admin toko hanya dapat mengubah tokonya sendiri.</p>
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
  </AppShell>;
}
