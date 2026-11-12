'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';
import SafeImage from '../components/SafeImage';
import { RECEIPT_SAMPLE, buildReceiptPreview, receiptGrid, isOn } from '../lib/receipt-preview';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const headers = () => ({ 'Content-Type': 'application/json' });
const mediaUrl = (path) => {
  if (!path) return '';
  if (/^https?:/i.test(path)) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

const TABS = [
  { key: 'identitas', label: 'Identitas & kontak' },
  { key: 'landing', label: 'Landing & aturan' },
  { key: 'struk', label: 'Struk & printer' },
  { key: 'template', label: 'Template struk' },
  { key: 'ongkir', label: 'Ongkir' },
  { key: 'pajak', label: 'Pajak & harga' },
  { key: 'notifikasi', label: 'Notifikasi' },
  { key: 'administrasi', label: 'Administrasi' },
];

const TEMPLATE_TOGGLES = [
  ['receipt_show_logo', 'Logo'],
  ['receipt_show_address', 'Alamat'],
  ['receipt_show_wa', 'Nomor WA'],
  ['receipt_show_npwp', 'NPWP'],
  ['receipt_show_cashier', 'Kasir'],
  ['receipt_show_customer', 'Pelanggan'],
  ['receipt_show_payment', 'Metode bayar'],
  ['receipt_show_paid', 'Dibayar'],
  ['receipt_show_change', 'Kembalian'],
];

const TEMPLATE_TEXTS = [
  ['receipt_title_info', 'Judul informasi', 'INFORMASI TRANSAKSI'],
  ['receipt_title_products', 'Judul produk', 'PRODUK'],
  ['receipt_label_invoice', 'Label invoice', 'Invoice'],
  ['receipt_label_date', 'Label tanggal', 'Tanggal'],
  ['receipt_label_cashier', 'Label kasir', 'Kasir'],
  ['receipt_label_customer', 'Label pelanggan', 'Pelanggan'],
  ['receipt_label_subtotal', 'Label subtotal', 'Subtotal'],
  ['receipt_label_discount', 'Label diskon', 'Diskon'],
  ['receipt_label_total', 'Label total', 'Total'],
  ['receipt_label_paid', 'Label dibayar', 'Dibayar'],
  ['receipt_label_change', 'Label kembalian', 'Kembalian'],
];

const BOOL = [['true', 'Ya'], ['false', 'Tidak']];

// Daftar kurir disimpan sebagai JSON string; terima juga input "jne,jnt".
function parseCouriers(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean);
  } catch { /* bukan JSON, lanjut pecah per koma */ }
  return raw.replaceAll('[', '').replaceAll(']', '').replaceAll('"', '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function StoreSettingsPage() {
  const { user } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [tab, setTab] = useState('identitas');
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [form, setForm] = useState({});
  const [waList, setWaList] = useState(['', '', '']);
  const [rates, setRates] = useState([]);
  const [rateForm, setRateForm] = useState({ area: '', cost: '', cost_per_kg: '' });
  const [originQuery, setOriginQuery] = useState('');
  const [originResults, setOriginResults] = useState([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [newBranch, setNewBranch] = useState({ name: '', address: '', phone: '', email: '', source_branch_id: '', price_multiplier: '1', clone_photos: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const loadBranches = useCallback(async () => {
    const response = await fetch(api + '/settings/branches', { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Gagal memuat cabang');
    const list = Array.isArray(body.data) ? body.data : [];
    setStores(list);
    return list;
  }, []);

  const loadSettings = useCallback(async (branchId) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(api + '/settings' + (branchId ? `?branch_id=${branchId}` : ''), { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal memuat setelan toko');
      const data = body.data || {};
      const next = {};
      for (const [key, value] of Object.entries(data)) {
        if (key === 'whatsapp_numbers' || key === 'rapidapi_key_set') continue;
        next[key] = value == null ? '' : String(value);
      }
      setForm(next);
      let numbers = [];
      if (Array.isArray(data.whatsapp_numbers)) numbers = data.whatsapp_numbers.map(String).filter(Boolean);
      else if (typeof data.whatsapp_numbers === 'string') {
        try {
          const parsed = JSON.parse(data.whatsapp_numbers);
          if (Array.isArray(parsed)) numbers = parsed.map(String).filter(Boolean);
        } catch { /* pakai kolom tunggal */ }
      }
      if (!numbers.length) {
        numbers = [data.whatsapp_number, data.whatsapp_number_2, data.whatsapp_number_3]
          .map((value) => String(value || '').trim()).filter(Boolean);
      }
      setWaList([numbers[0] || '', numbers[1] || '', numbers[2] || '']);
      const rateResponse = await fetch(`${api}/settings/shipping-rates?branch_id=${branchId}`, { headers: headers() });
      const rateBody = await rateResponse.json();
      setRates(rateResponse.ok ? (rateBody.data || []) : []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await loadBranches();
        if (!active) return;
        const initial = list[0] ? String(list[0].id) : '';
        setBranch(initial);
        if (initial) await loadSettings(initial);
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
          setLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [loadBranches, loadSettings]);

  async function changeBranch(value) {
    setBranch(value);
    setMessage('');
    await loadSettings(value);
  }

  async function save(payload, note = 'Setelan toko tersimpan.') {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const body = { branch_id: Number(branch), ...payload };
      const response = await fetch(api + '/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Gagal menyimpan setelan');
      setMessage(note);
      await loadSettings(branch);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function saveIdentity() {
    save({
      store_name: form.store_name ?? '',
      store_address: form.store_address ?? '',
      store_phone: form.store_phone ?? '',
      store_email: form.store_email ?? '',
      store_tax_id: form.store_tax_id ?? '',
      show_logo: form.show_logo || 'true',
    });
  }

  function saveWhatsapp() {
    const clean = waList.map((value) => String(value).trim()).filter(Boolean);
    save({
      whatsapp_number: clean[0] || '',
      whatsapp_number_2: clean[1] || '',
      whatsapp_number_3: clean[2] || '',
      whatsapp_numbers: JSON.stringify(clean),
    }, 'Nomor WhatsApp tersimpan.');
  }

  function saveLanding() {
    save({
      landing_page_size: form.landing_page_size || '24',
      min_order_qty: form.min_order_qty || '0',
    }, 'Aturan landing tersimpan.');
  }

  function saveReceipt() {
    save({
      printer_size: form.printer_size || '80',
      invoice_prefix: form.invoice_prefix || 'INV',
      order_prefix: form.order_prefix || 'PO',
      auto_print: form.auto_print || 'false',
      show_cashier: form.show_cashier || 'true',
      show_barcode: form.show_barcode || 'false',
      show_qr: form.show_qr || 'false',
      receipt_contacts: form.receipt_contacts ?? '',
      theme: form.theme || 'blue',
    }, 'Setelan struk & printer tersimpan.');
  }

  function saveTemplate() {
    const payload = {};
    for (const [key] of TEMPLATE_TOGGLES) payload[key] = isOn(form[key]) ? 'true' : 'false';
    for (const [key] of TEMPLATE_TEXTS) payload[key] = form[key] ?? '';
    payload.receipt_header = form.receipt_header ?? '';
    payload.receipt_closing = form.receipt_closing ?? '';
    payload.receipt_footer = form.receipt_footer ?? '';
    payload.receipt_note = form.receipt_note ?? '';
    payload.receipt_separator = form.receipt_separator || 'dash';
    payload.receipt_font = form.receipt_font || 'b';
    payload.receipt_margin = form.receipt_margin ?? '';
    save(payload, 'Template struk tersimpan. Aplikasi Android akan memakai setelan ini saat mencetak.');
  }

  function saveOngkir(event) {
    event?.preventDefault();
    save({
      ongkir_provider: form.ongkir_provider === 'rajaongkir' ? 'rajaongkir' : 'manual',
      rajaongkir_api_key: form.rajaongkir_api_key ?? '',
      rajaongkir_origin_id: form.rajaongkir_origin_id ?? '',
      rajaongkir_origin_label: form.rajaongkir_origin_label ?? '',
      ongkir_couriers: JSON.stringify(parseCouriers(form.ongkir_couriers)),
    }, 'Setelan ongkir tersimpan.');
  }

  function saveTax() {
    save({
      tax_rate: form.tax_rate ?? '',
      prices_include_tax: form.prices_include_tax || 'false',
      loyalty_enabled: form.loyalty_enabled || 'false',
      loyalty_points_rate: form.loyalty_points_rate ?? '',
      loyalty_points_value: form.loyalty_points_value ?? '',
    }, 'Setelan pajak & harga tersimpan.');
  }

  function saveNotification() {
    save({
      low_stock_alert: form.low_stock_alert || 'false',
      low_stock_email: form.low_stock_email ?? '',
      daily_email_enabled: form.daily_email_enabled || 'false',
      daily_email_to: form.daily_email_to ?? '',
      daily_email_from: form.daily_email_from ?? '',
      daily_email_time: form.daily_email_time || '07:00',
      daily_email_api_key: form.daily_email_api_key ?? '',
    }, 'Setelan notifikasi tersimpan.');
  }

  async function uploadLogo(file, key) {
    if (!file) return;
    setUploading(key);
    setError('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`${api}/settings/logo-data?branch_id=${branch}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ content_type: file.type, filename: file.name, data_url: dataUrl, key }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal mengunggah logo');
      setMessage(key === 'invoice_logo' ? 'Logo kepala invoice tersimpan.' : 'Logo toko tersimpan.');
      await loadSettings(branch);
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading('');
    }
  }

  async function deleteLogo(key) {
    try {
      const response = await fetch(`${api}/settings/logo?branch_id=${branch}&key=${key}`, { method: 'DELETE', headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menghapus logo');
      setMessage('Logo dihapus.');
      await loadSettings(branch);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function searchOrigin() {
    const query = originQuery.trim();
    if (query.length < 3) return;
    setOriginLoading(true);
    try {
      const response = await fetch(`${api}/public/shipping/destinations?branch_id=${branch}&q=${encodeURIComponent(query)}`);
      const body = await response.json();
      setOriginResults(Array.isArray(body.data) ? body.data : []);
    } catch {
      setOriginResults([]);
    } finally {
      setOriginLoading(false);
    }
  }

  async function saveRate(event) {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch(api + '/settings/shipping-rates', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...rateForm, branch_id: Number(branch) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan tarif');
      setRateForm({ area: '', cost: '', cost_per_kg: '' });
      setMessage('Tarif ongkir tersimpan.');
      await loadSettings(branch);
    } catch (rateError) {
      setError(rateError.message);
    }
  }

  async function removeRate(id) {
    const response = await fetch(`${api}/settings/shipping-rates/${id}?branch_id=${branch}`, { method: 'DELETE', headers: headers() });
    if (response.ok) await loadSettings(branch);
  }

  async function changeType(type) {
    const response = await fetch(`${api}/settings/branches/${branch}/type`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ type }),
    });
    if (response.ok) {
      setMessage('Tipe cabang diperbarui.');
      await loadBranches();
      await loadSettings(branch);
    }
  }

  async function toggleSemiGrosir(enabled) {
    const response = await fetch(`${api}/settings/branches/${branch}/pricing`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ semi_grosir_enabled: enabled }),
    });
    if (response.ok) {
      setMessage('Aturan semi grosir diperbarui.');
      await loadBranches();
    }
  }

  async function createBranch(event) {
    event.preventDefault();
    setError('');
    try {
      const response = await fetch(api + '/settings/branches', {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ ...newBranch, price_multiplier: Number(newBranch.price_multiplier) || 1 }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menambah toko');
      setMessage(`Toko ${newBranch.name} dibuat.`);
      setNewBranch({ name: '', address: '', phone: '', email: '', source_branch_id: '', price_multiplier: '1', clone_photos: true });
      const list = await loadBranches();
      if (list.length) await changeBranch(String(list[list.length - 1].id));
    } catch (createError) {
      setError(createError.message);
    }
  }

  async function downloadBackup() {
    setError('');
    try {
      const response = await fetch(api + '/backup', { headers: headers() });
      if (!response.ok) throw new Error('Gagal membuat backup');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `anyostore-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Backup diunduh.');
    } catch (backupError) {
      setError(backupError.message);
    }
  }

  const store = stores.find((item) => String(item.id) === String(branch)) || {};
  const preview = useMemo(() => buildReceiptPreview(form, RECEIPT_SAMPLE).join('\n'), [form]);
  const grid = useMemo(() => receiptGrid(form), [form]);
  const couriers = useMemo(() => parseCouriers(form.ongkir_couriers), [form.ongkir_couriers]);

  return (
    <AppShell title="Setelan Toko" eyebrow="Pengaturan">
      <section className="panel landing-settings-head">
        <div>
          <h2>Semua aturan toko di satu tempat</h2>
          <p className="muted">Pilih toko, lalu atur identitas, aturan landing, struk, ongkir, pajak, dan notifikasi. Aplikasi Android hanya membaca setelan ini.</p>
        </div>
        <div className="landing-settings-actions">
          {isOwner && stores.length > 0 && (
            <label>Toko
              <select value={branch} onChange={(event) => changeBranch(event.target.value)}>
                {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="secondary" onClick={() => loadSettings(branch)} disabled={loading}>Muat ulang</button>
        </div>
      </section>

      <div className="tabs store-settings-tabs" role="tablist" aria-label="Bagian setelan toko">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key}
            className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>
            {item.label}
          </button>
        ))}
      </div>

      {message && <p className="message" role="status">{message}</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      {loading && <p className="muted">Memuat setelan toko…</p>}

      {!loading && tab === 'identitas' && (
        <>
          <form className="panel" onSubmit={(event) => { event.preventDefault(); saveIdentity(); }}>
            <h2>Identitas &amp; kontak</h2>
            <p className="muted" style={{ marginTop: 0 }}>Dipakai di struk, invoice gambar, dan landing page toko ini.</p>
            <label>Nama toko<input value={form.store_name ?? ''} onChange={(event) => set('store_name', event.target.value)} /></label>
            <label>Alamat
              <textarea
                rows={3}
                value={form.store_address ?? ''}
                placeholder={'Baris 1 (gedung / lantai / blok)\nBaris 2 (jalan / kawasan)\nBaris 3 (kota)'}
                onChange={(event) => set('store_address', event.target.value.split('\n').slice(0, 3).join('\n'))}
              />
              <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Maksimal 3 baris, tampil apa adanya di struk & invoice.</span>
            </label>
            <div className="two-fields">
              <label>Telepon<input value={form.store_phone ?? ''} onChange={(event) => set('store_phone', event.target.value)} /></label>
              <label>Email toko<input type="email" value={form.store_email ?? ''} onChange={(event) => set('store_email', event.target.value)} /></label>
            </div>
            <div className="two-fields">
              <label>NPWP<input value={form.store_tax_id ?? ''} onChange={(event) => set('store_tax_id', event.target.value)} /></label>
              <label>Tampilkan logo
                <select value={form.show_logo || 'true'} onChange={(event) => set('show_logo', event.target.value)}>
                  {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>

            <h3 style={{ fontSize: 'var(--fs-md)', marginBottom: '.5rem' }}>Logo</h3>
            <div className="store-logo-grid">
              {[['store_logo', 'Logo aplikasi'], ['invoice_logo', 'Logo kepala invoice']].map(([key, label]) => (
                <div key={key} className="store-logo-box">
                  <strong>{label}</strong>
                  <div className="store-logo-preview">
                    {form[key] ? <SafeImage src={mediaUrl(form[key])} alt={label} /> : <span>Belum ada</span>}
                  </div>
                  <div className="store-logo-actions">
                    <label className="media-upload">
                      {uploading === key ? 'Mengunggah…' : 'Pilih gambar'}
                      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!uploading}
                        onChange={(event) => uploadLogo(event.target.files?.[0], key)} />
                    </label>
                    {form[key] && <button type="button" className="secondary" onClick={() => deleteLogo(key)}>Hapus</button>}
                  </div>
                </div>
              ))}
            </div>

            <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : `Simpan untuk ${store.name || 'toko ini'}`}</button></div>
          </form>

          <form className="panel" onSubmit={(event) => { event.preventDefault(); saveWhatsapp(); }}>
            <h2>Nomor WhatsApp admin</h2>
            <p className="muted" style={{ marginTop: 0 }}>Semua nomor tampil di struk, invoice, dan tombol chat landing.</p>
            <div className="two-fields">
              <label>WhatsApp 1<input value={waList[0]} onChange={(event) => setWaList([event.target.value, waList[1], waList[2]])} placeholder="08..." /></label>
              <label>WhatsApp 2<input value={waList[1]} onChange={(event) => setWaList([waList[0], event.target.value, waList[2]])} /></label>
            </div>
            <label>WhatsApp 3<input value={waList[2]} onChange={(event) => setWaList([waList[0], waList[1], event.target.value])} /></label>
            <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan nomor WhatsApp'}</button></div>
          </form>

          {isOwner && (
            <section className="panel">
              <h2>Tipe toko &amp; harga</h2>
              <div className="two-fields">
                <label>Tipe cabang
                  <select value={store.type || 'toko'} onChange={(event) => changeType(event.target.value)}>
                    <option value="toko">Toko (kasir & penjualan)</option>
                    <option value="gudang">Gudang (stok saja)</option>
                  </select>
                </label>
                <label>Harga semi grosir
                  <select value={store.semi_grosir_enabled == null || Number(store.semi_grosir_enabled) ? 'true' : 'false'}
                    onChange={(event) => toggleSemiGrosir(event.target.value === 'true')}>
                    <option value="true">Aktif</option>
                    <option value="false">Nonaktif</option>
                  </select>
                </label>
              </div>
              <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>Tier harga grosir seri/semi grosir mengikuti aturan di menu Promo &amp; Diskon serta Komisi Staf.</p>
            </section>
          )}
        </>
      )}

      {!loading && tab === 'landing' && (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); saveLanding(); }}>
          <h2>Landing &amp; aturan toko</h2>
          <p className="muted" style={{ marginTop: 0 }}>Aturan yang dipakai katalog publik dan keranjang reseller untuk toko ini.</p>
          <div className="two-fields">
            <label>Produk per halaman
              <select value={form.landing_page_size || '24'} onChange={(event) => set('landing_page_size', event.target.value)}>
                <option value="12">12 produk</option>
                <option value="24">24 produk</option>
                <option value="48">48 produk</option>
              </select>
            </label>
            <label>Minimal order per model (pcs)
              <input type="number" min="0" value={form.min_order_qty ?? ''} onChange={(event) => set('min_order_qty', event.target.value)} placeholder="0" />
            </label>
          </div>
          <p className="muted" style={{ marginTop: 0, fontSize: 'var(--fs-sm)' }}>
            Contoh: BASIK PGMTA 4 pcs, Anyo Blok B 1 pcs. Isi 0 bila toko ini tanpa minimum order.
          </p>
          <label>Slug landing cabang
            <input value={store.landing_slug || ''} readOnly placeholder="(kosong = landing utama)" />
            <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>Contoh: <code>reseller</code> membuka /reseller untuk toko ini.</span>
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
            Voucher &amp; diskon diatur di menu <a href="/promotions">Promo &amp; Diskon</a>; tarif ongkir manual di tab Ongkir.
          </p>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : `Simpan untuk ${store.name || 'toko ini'}`}</button></div>
        </form>
      )}

      {!loading && tab === 'struk' && (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); saveReceipt(); }}>
          <h2>Struk &amp; printer</h2>
          <div className="two-fields">
            <label>Ukuran kertas
              <select value={form.printer_size || '80'} onChange={(event) => set('printer_size', event.target.value)}>
                <option value="58">58 mm</option>
                <option value="80">80 mm</option>
              </select>
            </label>
            <label>Cetak otomatis setelah bayar
              <select value={form.auto_print || 'false'} onChange={(event) => set('auto_print', event.target.value)}>
                {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="two-fields">
            <label>Prefix invoice<input value={form.invoice_prefix ?? ''} onChange={(event) => set('invoice_prefix', event.target.value)} placeholder="INV" /></label>
            <label>Prefix pesanan<input value={form.order_prefix ?? ''} onChange={(event) => set('order_prefix', event.target.value)} placeholder="PO" /></label>
          </div>
          <div className="two-fields">
            <label>Kasir di struk
              <select value={form.show_cashier || 'true'} onChange={(event) => set('show_cashier', event.target.value)}>
                {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Barcode di struk
              <select value={form.show_barcode || 'false'} onChange={(event) => set('show_barcode', event.target.value)}>
                {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="two-fields">
            <label>QR di struk
              <select value={form.show_qr || 'false'} onChange={(event) => set('show_qr', event.target.value)}>
                {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Tema tampilan
              <select value={form.theme || 'blue'} onChange={(event) => set('theme', event.target.value)}>
                {[['blue', 'Biru'], ['green', 'Hijau'], ['purple', 'Ungu'], ['teal', 'Toska'], ['rose', 'Merah muda'], ['amber', 'Cokelat']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <label>Kontak tambahan di kepala struk
            <textarea rows={3} value={form.receipt_contacts ?? ''} onChange={(event) => set('receipt_contacts', event.target.value)} placeholder="Baris tambahan (opsional)" />
          </label>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan struk & printer'}</button></div>
        </form>
      )}

      {!loading && tab === 'template' && (
        <div className="receipt-template-layout">
          <form className="panel" onSubmit={(event) => { event.preventDefault(); saveTemplate(); }}>
            <h2>Bagian yang tampil</h2>
            <div className="receipt-toggle-grid">
              {TEMPLATE_TOGGLES.map(([key, label]) => (
                <label key={key} className="receipt-toggle">
                  <input type="checkbox" checked={isOn(form[key])} onChange={(event) => set(key, event.target.checked ? 'true' : 'false')} />
                  {label}
                </label>
              ))}
            </div>

            <h3 style={{ marginTop: '1.1rem', fontSize: 'var(--fs-md)' }}>Teks judul &amp; label</h3>
            <div className="receipt-text-grid">
              {TEMPLATE_TEXTS.map(([key, label, placeholder]) => (
                <label key={key}>{label}
                  <input value={form[key] ?? ''} placeholder={placeholder} onChange={(event) => set(key, event.target.value)} />
                </label>
              ))}
            </div>

            <h3 style={{ marginTop: '1.1rem', fontSize: 'var(--fs-md)' }}>Sapaan, catatan &amp; penutup</h3>
            <label>Sapaan<input value={form.receipt_header ?? ''} onChange={(event) => set('receipt_header', event.target.value)} placeholder="Terima kasih telah berbelanja" /></label>
            <label>Penutup<input value={form.receipt_closing ?? ''} onChange={(event) => set('receipt_closing', event.target.value)} placeholder="Terima kasih, sampai jumpa lagi!" /></label>
            <label>Footer tambahan<input value={form.receipt_footer ?? ''} onChange={(event) => set('receipt_footer', event.target.value)} placeholder="Opsional" /></label>
            <label>Catatan
              <textarea rows={2} value={form.receipt_note ?? ''} onChange={(event) => set('receipt_note', event.target.value.split('\n').slice(0, 2).join('\n'))} />
            </label>

            <div className="two-fields">
              <label>Ukuran font
                <select value={form.receipt_font || 'b'} onChange={(event) => set('receipt_font', event.target.value)}>
                  <option value="b">Kecil (Font B)</option>
                  <option value="a">Normal (Font A)</option>
                </select>
              </label>
              <label>Pemisah
                <select value={form.receipt_separator || 'dash'} onChange={(event) => set('receipt_separator', event.target.value)}>
                  <option value="dash">Garis strip (----)</option>
                  <option value="blank">Baris kosong</option>
                  <option value="none">Tanpa pemisah</option>
                </select>
              </label>
            </div>
            <div className="two-fields">
              <label>Margin kiri-kanan
                <select value={form.receipt_margin || ''} onChange={(event) => set('receipt_margin', event.target.value)}>
                  <option value="">Otomatis</option>
                  <option value="2">2 karakter</option>
                  <option value="3">3 karakter</option>
                  <option value="4">4 karakter</option>
                  <option value="5">5 karakter</option>
                </select>
              </label>
              <label>Lebar kertas
                <select value={form.printer_size || '80'} onChange={(event) => set('printer_size', event.target.value)}>
                  <option value="80">80 mm</option>
                  <option value="58">58 mm</option>
                </select>
              </label>
            </div>
            <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan template struk'}</button></div>
          </form>

          <aside className="receipt-template-preview">
            <h2>Pratinjau</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {grid.width} kolom · margin {grid.margin} · {String(form.printer_size).startsWith('58') ? '58 mm' : '80 mm'} · {String(form.receipt_font) === 'a' ? 'Font A' : 'Font B'}
            </p>
            <pre className="receipt-preview-paper">{preview}</pre>
          </aside>
        </div>
      )}

      {!loading && tab === 'ongkir' && (
        <>
          <form className="panel" onSubmit={saveOngkir}>
            <h2>Metode ongkir</h2>
            <label>Cara hitung
              <select value={form.ongkir_provider || 'manual'} onChange={(event) => set('ongkir_provider', event.target.value)}>
                <option value="manual">Tarif manual per kota</option>
                <option value="rajaongkir">RajaOngkir (otomatis)</option>
              </select>
            </label>
            {form.ongkir_provider === 'rajaongkir' && (
              <>
                <label>API key RajaOngkir
                  <input type="password" autoComplete="new-password" value={form.rajaongkir_api_key ?? ''} onChange={(event) => set('rajaongkir_api_key', event.target.value)} placeholder={form.rajaongkir_api_key ? 'Tersimpan (kosongkan bila tidak diubah)' : 'Tempel API key'} />
                </label>
                <div className="two-fields">
                  <label>Kota asal (cari kecamatan)
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={originQuery} onChange={(event) => setOriginQuery(event.target.value)} placeholder="Mis. Metro Pusat" />
                      <button type="button" className="secondary" onClick={searchOrigin} disabled={originLoading}>{originLoading ? '…' : 'Cari'}</button>
                    </div>
                  </label>
                  <label>Kota asal terpilih<input value={form.rajaongkir_origin_label ?? ''} readOnly placeholder="Belum dipilih" /></label>
                </div>
                {originResults.length > 0 && (
                  <div className="product-list">
                    {originResults.map((item) => (
                      <article key={item.id}>
                        <div><strong>{item.label}</strong></div>
                        <button type="button" onClick={() => { set('rajaongkir_origin_id', String(item.id)); set('rajaongkir_origin_label', item.label); setOriginResults([]); setOriginQuery(item.label); }}>Pilih</button>
                      </article>
                    ))}
                  </div>
                )}
                <fieldset style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                  <legend style={{ padding: '0 6px', fontSize: 12, fontWeight: 800, color: '#334155' }}>Ekspedisi yang dicek</legend>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8 }}>
                    {['jne', 'jnt', 'sicepat', 'anteraja', 'ninja', 'pos', 'tiki'].map((code) => (
                      <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, fontSize: 12, fontWeight: 700 }}>
                        <input
                          type="checkbox"
                          style={{ width: 16, height: 16, minHeight: 0, margin: 0, flex: '0 0 auto' }}
                          checked={couriers.includes(code)}
                          onChange={(event) => {
                            const next = event.target.checked ? [...couriers, code] : couriers.filter((item) => item !== code);
                            set('ongkir_couriers', JSON.stringify(next));
                          }}
                        />
                        {code.toUpperCase()}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan metode ongkir'}</button></div>
          </form>

          {form.ongkir_provider !== 'rajaongkir' && (
            <div className="product-grid">
              <form className="panel" onSubmit={saveRate}>
                <h2>Tarif manual</h2>
                <label>Kota / kecamatan<input required value={rateForm.area} onChange={(event) => setRateForm({ ...rateForm, area: event.target.value })} placeholder="Metro" /></label>
                <label>Tarif tetap (Rp)<input type="number" min="0" value={rateForm.cost} onChange={(event) => setRateForm({ ...rateForm, cost: event.target.value })} placeholder="0" /></label>
                <label>Tarif per kg (Rp)<input type="number" min="0" value={rateForm.cost_per_kg} onChange={(event) => setRateForm({ ...rateForm, cost_per_kg: event.target.value })} placeholder="0" /></label>
                <button type="submit">Tambah / ubah tarif</button>
              </form>
              <section className="panel">
                <h2>Daftar tarif</h2>
                <div className="product-list">
                  {rates.map((rate) => (
                    <article key={rate.id}>
                      <div>
                        <strong>{rate.area}</strong>
                        <span>{Number(rate.cost) > 0 ? `Rp${Number(rate.cost).toLocaleString('id-ID')}` : '-'}{Number(rate.cost_per_kg) > 0 ? ` · Rp${Number(rate.cost_per_kg).toLocaleString('id-ID')}/kg` : ''}</span>
                      </div>
                      <button type="button" className="danger" onClick={() => removeRate(rate.id)}>Hapus</button>
                    </article>
                  ))}
                  {!rates.length && <p className="muted">Belum ada tarif ongkir untuk toko ini.</p>}
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'pajak' && (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); saveTax(); }}>
          <h2>Pajak &amp; harga</h2>
          <div className="two-fields">
            <label>Pajak (%)<input type="number" step="0.01" value={form.tax_rate ?? ''} onChange={(event) => set('tax_rate', event.target.value)} placeholder="0" /></label>
            <label>Harga sudah termasuk pajak
              <select value={form.prices_include_tax || 'false'} onChange={(event) => set('prices_include_tax', event.target.value)}>
                {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <label>Program loyalitas
            <select value={form.loyalty_enabled || 'false'} onChange={(event) => set('loyalty_enabled', event.target.value)}>
              {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="two-fields">
            <label>Poin per Rp10.000<input type="number" min="0" value={form.loyalty_points_rate ?? ''} onChange={(event) => set('loyalty_points_rate', event.target.value)} placeholder="0" /></label>
            <label>Nilai tukar poin (Rp)<input type="number" min="0" value={form.loyalty_points_value ?? ''} onChange={(event) => set('loyalty_points_value', event.target.value)} placeholder="0" /></label>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
            Aturan harga grosir seri/semi grosir &amp; komisi diatur di <a href="/promotions">Promo &amp; Diskon</a> dan <a href="/commissions">Komisi Staf</a>.
          </p>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan pajak & harga'}</button></div>
        </form>
      )}

      {!loading && tab === 'notifikasi' && (
        <form className="panel" onSubmit={(event) => { event.preventDefault(); saveNotification(); }}>
          <h2>Notifikasi</h2>
          <div className="two-fields">
            <label>Peringatan stok menipis
              <select value={form.low_stock_alert || 'false'} onChange={(event) => set('low_stock_alert', event.target.value)}>
                {BOOL.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Email penerima peringatan<input type="email" value={form.low_stock_email ?? ''} onChange={(event) => set('low_stock_email', event.target.value)} /></label>
          </div>
          <h3 style={{ fontSize: 'var(--fs-md)' }}>Laporan harian email</h3>
          <div className="two-fields">
            <label>Status laporan
              <select value={form.daily_email_enabled || 'false'} onChange={(event) => set('daily_email_enabled', event.target.value)}>
                <option value="false">Nonaktif</option>
                <option value="true">Aktif</option>
              </select>
            </label>
            <label>Jam kirim (WIB)<input type="time" value={form.daily_email_time || '07:00'} onChange={(event) => set('daily_email_time', event.target.value)} /></label>
          </div>
          <div className="two-fields">
            <label>Email tujuan<input type="email" value={form.daily_email_to ?? ''} onChange={(event) => set('daily_email_to', event.target.value)} /></label>
            <label>Email pengirim<input value={form.daily_email_from ?? ''} onChange={(event) => set('daily_email_from', event.target.value)} placeholder="Laporan <laporan@domain>" /></label>
          </div>
          <label>API key Resend
            <input
              type="password"
              autoComplete="new-password"
              value={form.daily_email_api_key ?? ''}
              onChange={(event) => set('daily_email_api_key', event.target.value)}
              placeholder="re_… (kosongkan bila tidak diubah)"
            />
          </label>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan notifikasi'}</button></div>
        </form>
      )}

      {!loading && tab === 'administrasi' && isOwner && (
        <>
          <section className="panel">
            <h2>Daftar toko</h2>
            <div className="product-list">
              {stores.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.type === 'gudang' ? 'Gudang' : 'Toko'} · {item.address || 'Alamat belum diisi'}{item.is_active ? '' : ' · nonaktif'}</span>
                  </div>
                  <button type="button" className="secondary" onClick={() => { setTab('identitas'); changeBranch(String(item.id)); }}>Atur</button>
                </article>
              ))}
            </div>
          </section>

          <form className="panel" onSubmit={createBranch}>
            <h2>Tambah toko</h2>
            <div className="two-fields">
              <label>Nama toko<input required value={newBranch.name} onChange={(event) => setNewBranch({ ...newBranch, name: event.target.value })} /></label>
              <label>Telepon<input value={newBranch.phone} onChange={(event) => setNewBranch({ ...newBranch, phone: event.target.value })} /></label>
            </div>
            <label>Alamat<input value={newBranch.address} onChange={(event) => setNewBranch({ ...newBranch, address: event.target.value })} /></label>
            <div className="two-fields">
              <label>Email<input type="email" value={newBranch.email} onChange={(event) => setNewBranch({ ...newBranch, email: event.target.value })} /></label>
              <label>Salin katalog dari
                <select value={newBranch.source_branch_id} onChange={(event) => setNewBranch({ ...newBranch, source_branch_id: event.target.value })}>
                  <option value="">Tanpa salin</option>
                  {stores.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
            <div className="two-fields">
              <label>Pengali harga<input type="number" step="0.01" value={newBranch.price_multiplier} onChange={(event) => setNewBranch({ ...newBranch, price_multiplier: event.target.value })} /></label>
              <label className="receipt-toggle" style={{ alignSelf: 'end' }}>
                <input type="checkbox" checked={newBranch.clone_photos} onChange={(event) => setNewBranch({ ...newBranch, clone_photos: event.target.checked })} />
                Salin foto produk
              </label>
            </div>
            <div className="form-actions"><button type="submit" disabled={saving}>Buat toko</button></div>
          </form>

          <section className="panel">
            <h2>Alat &amp; data</h2>
            <p className="muted" style={{ marginTop: 0 }}>Backup, impor, dan perbandingan setelan antar toko.</p>
            <div className="form-actions">
              <button type="button" className="secondary" onClick={downloadBackup}>Unduh backup</button>
              <a className="button-link" href="/settings/branch-compare">Bandingkan setelan</a>
              <a className="button-link" href="/products/excel">Impor produk</a>
              <a className="button-link" href="/settings/olsera-import">Impor Olsera</a>
            </div>
            <p className="muted" style={{ marginBottom: 0, fontSize: 'var(--fs-sm)' }}>
              Kategori produk diatur di halaman <a href="/products">Produk</a> (Kelola kategori).
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
