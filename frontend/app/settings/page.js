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
  const [waList, setWaList] = useState([]);

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
      setWaList(buildWaList(body.data));
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

  function buildWaList(f) {
    if (Array.isArray(f.whatsapp_numbers)) return f.whatsapp_numbers.map(String).filter(Boolean);
    try { const parsed = JSON.parse(f.whatsapp_numbers); if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean); } catch {}
    return [f.whatsapp_number, f.whatsapp_number_2, f.whatsapp_number_3].map((v) => String(v || '').trim()).filter(Boolean);
  }

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
      const cleanWa = waList.map((n) => String(n).trim()).filter(Boolean);
      const payload = { ...form, branch_id: Number(branch) };
      payload.whatsapp_number = cleanWa[0] || '';
      payload.whatsapp_number_2 = cleanWa[1] || '';
      payload.whatsapp_number_3 = cleanWa[2] || '';
      payload.whatsapp_numbers = JSON.stringify(cleanWa);
      const response = await fetch(api + '/settings', {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify(payload)
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
    <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 1180, margin: '0 auto' }}>
      {isOwner && (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Tambah Toko</h2>
              <p>Buat cabang baru + clone katalog. Produk sama, stok 0, harga jual beda per toko.</p>
            </div>
            <span className="tag" style={{ alignSelf: 'center' }}>Owner</span>
          </div>
          <form onSubmit={createBranch} style={{ display: 'grid', gap: '1rem', marginTop: '.5rem' }}>
            <div className="two-fields">
              <label>Nama toko baru*<input value={newBranch.name} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })} placeholder="Contoh: Toko Metro" required /></label>
              <label>Clone dari toko<select value={newBranch.source_branch_id} onChange={(e) => setNewBranch({ ...newBranch, source_branch_id: e.target.value })}><option value="">Tanpa clone (kosong)</option>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            </div>
            <div className="two-fields">
              <label>Alamat<input value={newBranch.address} onChange={(e) => setNewBranch({ ...newBranch, address: e.target.value })} placeholder="Jl. ..." /></label>
              <label>Telepon<input value={newBranch.phone} onChange={(e) => setNewBranch({ ...newBranch, phone: e.target.value })} /></label>
            </div>
            <div className="two-fields">
              <label>Email<input type="email" value={newBranch.email} onChange={(e) => setNewBranch({ ...newBranch, email: e.target.value })} placeholder="metro@anyostore.my.id" /></label>
              <label>Pengali harga (1 = sama, 1.2 = 20% mahal)<input type="number" step="0.01" min="0.1" value={newBranch.price_multiplier} onChange={(e) => setNewBranch({ ...newBranch, price_multiplier: e.target.value })} /></label>
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={newBranch.clone_photos} onChange={(e) => setNewBranch({ ...newBranch, clone_photos: e.target.checked })} /> Foto</label>
              <label style={{ display: 'flex', gap: '.45rem', alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={newBranch.pricing_tier_enabled} onChange={(e) => setNewBranch({ ...newBranch, pricing_tier_enabled: e.target.checked })} /> Tier harga</label>
            </div>
            <div className="form-actions">
              <button type="submit" disabled={creating}>{creating ? 'Membuat…' : 'Buat Toko'}</button>
              <span className="muted" style={{ alignSelf: 'center', fontSize: '.85rem' }}>SKU baru B+ID-SKU • Stok 0 • Gudang auto</span>
            </div>
            {createMessage && <p className="message" role="status">{createMessage}</p>}
          </form>
        </section>
      )}

      <div className="settings-form" style={{ margin: 0 }}>
      {isOwner && stores.length > 0 && (
        <section className="panel" style={{ gridColumn: '1 / -1' }}>
          <h2>Daftar Toko</h2>
          <p className="muted" style={{ fontSize: '.85rem' }}>Kelola cabang. Tidak bisa hapus toko dengan transaksi.</p>
          <div className="table-wrap" style={{ marginTop: '.75rem' }}>
            <table>
              <thead><tr><th>ID</th><th>Nama</th><th>Produk</th><th>User</th><th>Aktif</th><th>Aksi</th></tr></thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td><strong>{s.name}</strong>{String(s.id) === String(branch) ? <span className="tag" style={{ marginLeft: '.5rem' }}>dipilih</span> : null}<br /><small className="muted">{s.address || '-'}</small></td>
                    <td>{s.product_count ?? '-'}</td>
                    <td>{s.user_count ?? '-'}</td>
                    <td>{s.is_active ? <span className="status paid">aktif</span> : <span className="status pending">nonaktif</span>}</td>
                    <td>
                      <button type="button" className="small secondary" disabled={String(s.id) === String(branch)} onClick={async () => {
                        const isPermanent = !s.is_active;
                        const msg = isPermanent
                          ? `Hapus PERMANEN toko "${s.name}"? Semua produk, foto, dan data toko akan dihapus selamanya. Tidak bisa dibatalkan.`
                          : `Nonaktifkan toko "${s.name}"? Tidak bisa jika ada transaksi.`;
                        if (!confirm(msg)) return;
                        try {
                          const r = await fetch(`${api}/settings/branches/${s.id}`, { method: 'DELETE', headers: jsonHeaders() });
                          const b = await r.json();
                          if (!r.ok) throw new Error(b.message);
                          setMessage(isPermanent ? `Toko ${s.name} dihapus permanen.` : `Toko ${s.name} dinonaktifkan.`);
                          const fresh = await loadBranches();
                          const nextId = fresh.find((x) => x.is_active)?.id || fresh[0]?.id;
                          if (nextId) { setBranch(String(nextId)); load(String(nextId)); }
                        } catch (e) { setMessage(e.message); }
                      }}>{s.is_active ? 'Nonaktifkan' : 'Hapus Permanen'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <section className="panel">
        <h2>Toko aktif & identitas</h2>
        {stores.length > 1 && <label>Pilih toko<select value={branch} onChange={(event) => { setBranch(event.target.value); load(event.target.value); }}>{stores.map((store) => <option key={store.id} value={store.id} style={{ opacity: store.is_active ? 1 : .5 }}>{store.name}{store.is_active ? '' : ' (nonaktif)'}</option>)}</select></label>}
        {input('store_name', 'Nama toko')}
        {input('store_address', 'Alamat')}
        <div className="two-fields">
          {input('store_phone', 'Telepon', 'tel')}
          {input('store_email', 'Email toko', 'email')}
        </div>
        <div style={{ display: 'grid', gap: '.5rem' }}>
          <strong style={{ fontSize: '.9rem' }}>Nomor WhatsApp Admin</strong>
          {waList.length === 0 && <p className="muted" style={{ fontSize: '.82rem', margin: 0 }}>Belum ada nomor. Tambah minimal 1 nomor untuk tombol chat di landing.</p>}
          {waList.map((num, i) => (
            <div key={i} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
              <input type="tel" value={num} placeholder={`WA Admin ${i + 1}`} onChange={(e) => { const next = [...waList]; next[i] = e.target.value; setWaList(next); }} style={{ flex: 1 }} />
              <button type="button" onClick={() => setWaList(waList.filter((_, j) => j !== i))} aria-label="Hapus nomor" style={{ minWidth: 40, minHeight: 40, borderRadius: '.45rem', border: '1px solid var(--border)', background: '#fff', color: '#dc2626', fontWeight: 800, cursor: 'pointer' }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setWaList([...waList, ''])} style={{ justifySelf: 'start', minHeight: 38, padding: '0 14px', borderRadius: '.45rem', border: '1px dashed #2563eb', background: '#eff6ff', color: '#1e3a5f', fontWeight: 700, cursor: 'pointer' }}>+ Tambah nomor WA</button>
          <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>Nomor dipakai di landing grosir (bisa lebih dari 1 admin, tampil popup pilih admin). Format 08... otomatis jadi 62...</p>
        </div>
        {input('store_tax_id', 'NPWP')}
        <div style={{ marginTop: '.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          <h3 style={{ margin: '0 0 .75rem', fontSize: '.95rem' }}>Logo</h3>
          <div className="store-logo-upload">
            <div className="store-logo-preview">{form.store_logo ? <img src={mediaUrl(form.store_logo)} alt={'Logo'} /> : <span>Belum ada</span>}</div>
            <div><label className="media-upload">{uploadingLogo ? 'Mengunggah…' : 'Pilih logo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingLogo} onChange={(event) => uploadLogo(event.target.files?.[0])} /></label></div>
          </div>
          {select('show_logo', 'Tampilkan logo', [['true', 'Ya'], ['false', 'Tidak']])}
        </div>
      </section>

      <section className="panel">
        <h2>Struk & operasional</h2>
        {input('receipt_header', 'Header struk')}
        {input('receipt_footer', 'Footer struk')}
        {input('receipt_note', 'Catatan')}
        <div className="two-fields">
          {select('printer_size', 'Printer', [['58', '58 mm'], ['80', '80 mm']])}
          {input('invoice_prefix', 'Prefix invoice')}
        </div>
        <div className="two-fields">
          {select('show_cashier', 'Kasir di struk', [['true', 'Ya'], ['false', 'Tidak']])}
          {select('show_barcode', 'Barcode di struk', [['true', 'Ya'], ['false', 'Tidak']])}
        </div>
      </section>

      <section className="panel">
        <h2>Penjualan</h2>
        {select('theme', 'Tema', [['green', 'Hijau'], ['blue', 'Biru'], ['purple', 'Ungu']])}
        <div className="two-fields">
          {input('tax_rate', 'Pajak %', 'number')}
          {select('prices_include_tax', 'Termasuk pajak', [['true', 'Ya'], ['false', 'Tidak']])}
        </div>
        {select('loyalty_enabled', 'Loyalitas', [['true', 'Ya'], ['false', 'Tidak']])}
        <div className="two-fields">
          {input('loyalty_points_rate', 'Poin / 10k', 'number')}
          {input('loyalty_points_value', 'Nilai poin', 'number')}
        </div>
        {select('low_stock_alert', 'Alert stok rendah', [['true', 'Ya'], ['false', 'Tidak']])}
        {input('low_stock_email', 'Email alert', 'email')}
      </section>

      <section className="panel">
        <h2>Simpan</h2>
        <p className="muted">Perubahan berlaku untuk toko dipilih.</p>
        <button onClick={save} disabled={saving} style={{ width: '100%' }}>{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}</button>
        {message && <p className="message" role="status">{message}</p>}
      </section>
      </div>
    </div>
  </AppShell>;
}
