'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const emptyVoucher = { code: '', name: '', discount_type: 'percentage', discount_value: '', min_purchase: '', max_discount: '', usage_limit: '' };

const TABS = [
  { key: 'profil', label: 'Profil & katalog' },
  { key: 'ongkir', label: 'Ongkir' },
  { key: 'voucher', label: 'Voucher' },
];

export default function LandingSettingsPage() {
  const { user } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [tab, setTab] = useState('profil');
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Profil & katalog
  const [profile, setProfile] = useState({ store_name: '', store_address: '', store_phone: '', landing_page_size: '24', min_order_qty: '4' });
  const [ongkir, setOngkir] = useState({ ongkir_provider: 'manual', rajaongkir_api_key: '', rajaongkir_origin_id: '', rajaongkir_origin_label: '', ongkir_couriers: ['jne', 'jnt', 'sicepat'] });
  const [originQuery, setOriginQuery] = useState('');
  const [originResults, setOriginResults] = useState([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [waList, setWaList] = useState(['', '', '']);

  // Ongkir
  const [rates, setRates] = useState([]);
  const [rateForm, setRateForm] = useState({ area: '', cost: '', cost_per_kg: '' });

  // Voucher
  const [vouchers, setVouchers] = useState([]);
  const [voucherForm, setVoucherForm] = useState(emptyVoucher);
  const [editingVoucher, setEditingVoucher] = useState(null);

  const headers = () => ({ 'Content-Type': 'application/json' });

  const loadProfile = useCallback(async (branchId) => {
    const response = await fetch(api + '/settings' + (branchId ? `?branch_id=${branchId}` : ''), { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Gagal memuat pengaturan');
    const data = body.data || {};
    setProfile({
      store_name: data.store_name || '',
      store_address: data.store_address || '',
      store_phone: data.store_phone || '',
      landing_page_size: String(data.landing_page_size || '24'),
      min_order_qty: String(data.min_order_qty ?? '4'),
    });
    let couriers = ['jne', 'jnt', 'sicepat'];
    try {
      const parsed = JSON.parse(data.ongkir_couriers || '[]');
      if (Array.isArray(parsed) && parsed.length) couriers = parsed.map(String);
    } catch { /* default */ }
    setOngkir({
      ongkir_provider: data.ongkir_provider === 'rajaongkir' ? 'rajaongkir' : 'manual',
      rajaongkir_api_key: data.rajaongkir_api_key || '',
      rajaongkir_origin_id: data.rajaongkir_origin_id || '',
      rajaongkir_origin_label: data.rajaongkir_origin_label || '',
      ongkir_couriers: couriers,
    });
    let numbers = [];
    if (Array.isArray(data.whatsapp_numbers)) numbers = data.whatsapp_numbers.map(String).filter(Boolean);
    else if (typeof data.whatsapp_numbers === 'string') {
      try { const parsed = JSON.parse(data.whatsapp_numbers); if (Array.isArray(parsed)) numbers = parsed.map(String).filter(Boolean); } catch { /* pakai kolom tunggal */ }
    }
    if (!numbers.length) numbers = [data.whatsapp_number, data.whatsapp_number_2, data.whatsapp_number_3].map((value) => String(value || '').trim()).filter(Boolean);
    setWaList([numbers[0] || '', numbers[1] || '', numbers[2] || '']);
  }, []);

  const loadRates = useCallback(async (branchId) => {
    const response = await fetch(`${api}/settings/shipping-rates?branch_id=${branchId}`, { headers: headers() });
    const body = await response.json();
    if (response.ok) setRates(body.data || []);
  }, []);

  const loadVouchers = useCallback(async (branchId) => {
    const query = isOwner && branchId ? `?branch_id=${branchId}` : '';
    const response = await fetch(api + '/promotions' + query, { headers: headers() });
    const body = await response.json();
    if (response.ok) setVouchers(body.data || []);
  }, [isOwner]);

  const loadAll = useCallback(async (branchId) => {
    setMessage('');
    try {
      if (branchId) await loadProfile(branchId);
      await Promise.all([loadRates(branchId), loadVouchers(branchId)]);
    } catch (error) {
      setMessage(error.message);
    }
  }, [loadProfile, loadRates, loadVouchers]);

  useEffect(() => {
    (async () => {
      if (!isOwner) {
        setBranch(String(user?.branch_id || ''));
        await loadAll('');
        return;
      }
      try {
        const response = await fetch(api + '/settings/branches', { headers: headers() });
        const body = await response.json();
        const list = (body.data || []).filter((store) => store.is_active !== false);
        setStores(list);
        const first = list[0] ? String(list[0].id) : '';
        setBranch(first);
        await loadAll(first);
      } catch (error) {
        setMessage(error.message);
      }
    })();
  }, [isOwner]);

  function changeBranch(value) {
    setBranch(value);
    loadAll(value);
  }

  async function saveProfile(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const cleanWa = waList.map((value) => String(value || '').replace(/[^0-9+]/g, '')).filter(Boolean);
      const response = await fetch(api + '/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          ...profile,
          branch_id: Number(branch),
          whatsapp_number: cleanWa[0] || '',
          whatsapp_number_2: cleanWa[1] || '',
          whatsapp_number_3: cleanWa[2] || '',
          whatsapp_numbers: JSON.stringify(cleanWa),
          min_order_qty: Number(profile.min_order_qty || 0),
          ongkir_provider: ongkir.ongkir_provider,
          rajaongkir_api_key: ongkir.rajaongkir_api_key,
          rajaongkir_origin_id: ongkir.rajaongkir_origin_id,
          rajaongkir_origin_label: ongkir.rajaongkir_origin_label,
          ongkir_couriers: JSON.stringify(ongkir.ongkir_couriers),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan');
      setMessage('Profil landing disimpan.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
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
    setMessage('');
    try {
      const response = await fetch(api + '/settings/shipping-rates', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...rateForm, branch_id: Number(branch) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan tarif');
      setRateForm({ area: '', cost: '', cost_per_kg: '' });
      setMessage('Tarif ongkir disimpan.');
      await loadRates(branch);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function removeRate(id) {
    if (!confirm('Hapus tarif ongkir ini?')) return;
    const response = await fetch(`${api}/settings/shipping-rates/${id}?branch_id=${branch}`, { method: 'DELETE', headers: headers() });
    if (response.ok) await loadRates(branch);
  }

  async function saveVoucher(event) {
    event.preventDefault();
    setMessage('');
    try {
      const url = editingVoucher ? `${api}/promotions/${editingVoucher}` : api + '/promotions';
      const response = await fetch(url, {
        method: editingVoucher ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify({ ...voucherForm, pcs: undefined, branch_id: Number(branch) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan voucher');
      setVoucherForm(emptyVoucher);
      setEditingVoucher(null);
      setMessage(editingVoucher ? 'Voucher diperbarui.' : 'Voucher disimpan.');
      await loadVouchers(branch);
    } catch (error) {
      setMessage(error.message);
    }
  }

  function startEditVoucher(voucher) {
    setEditingVoucher(voucher.id);
    setVoucherForm({
      code: voucher.code || '',
      name: voucher.name || '',
      discount_type: voucher.discount_type || 'percentage',
      discount_value: String(voucher.discount_value ?? ''),
      min_purchase: String(voucher.min_purchase ?? ''),
      max_discount: voucher.max_discount == null ? '' : String(voucher.max_discount),
      usage_limit: voucher.usage_limit == null ? '' : String(voucher.usage_limit),
    });
    setTab('voucher');
  }

  async function toggleVoucher(id) {
    await fetch(`${api}/promotions/${id}/toggle-active`, { method: 'PUT', headers: headers(), body: JSON.stringify({ branch_id: Number(branch) }) });
    await loadVouchers(branch);
  }

  async function removeVoucher(id) {
    if (!confirm('Hapus voucher ini?')) return;
    await fetch(`${api}/promotions/${id}?branch_id=${branch}`, { method: 'DELETE', headers: headers() });
    await loadVouchers(branch);
  }

  const storeLabel = useMemo(() => stores.find((store) => String(store.id) === String(branch))?.name || (user?.role ? user.role : ''), [stores, branch, user]);

  return (
    <AppShell title="Landing Page" eyebrow="KATALOG ONLINE">
      <section className="panel landing-settings-head">
        <div>
          <h2>Setelan landing page</h2>
          <p className="muted">Semua yang tampil di halaman katalog publik: profil toko, katalog, ongkir, dan voucher.</p>
        </div>
        <div className="landing-settings-actions">
          {isOwner && stores.length > 0 && (
            <label>Toko
              <select value={branch} onChange={(event) => changeBranch(event.target.value)}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
          )}
          <a className="button-link" href="/" target="_blank" rel="noopener noreferrer">Lihat landing utama</a>
          <a className="button-link" href="/reseller" target="_blank" rel="noopener noreferrer">Lihat /reseller</a>
        </div>
      </section>

      <div className="tabs landing-settings-tabs" role="tablist" aria-label="Bagian setelan landing">
        {TABS.map((item) => (
          <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>{item.label}</button>
        ))}
      </div>

      {message && <p className="message" role="status">{message}</p>}

      {tab === 'profil' && (
        <form className="panel" onSubmit={saveProfile}>
          <h2>Profil toko di landing</h2>
          <p className="muted" style={{ marginTop: 0 }}>Dipengaruhi: nama & alamat toko di header, nomor WhatsApp untuk pesanan, dan jumlah produk per halaman.</p>
          <label>Nama toko<input value={profile.store_name} onChange={(event) => setProfile({ ...profile, store_name: event.target.value })} placeholder="Toko B" /></label>
          <label>Alamat<input value={profile.store_address} onChange={(event) => setProfile({ ...profile, store_address: event.target.value })} placeholder="Blok B lantai LG los F no 107" /></label>
          <label>Telepon toko<input value={profile.store_phone} onChange={(event) => setProfile({ ...profile, store_phone: event.target.value })} placeholder="0856..." /></label>
          <div className="two-fields">
            <label>WhatsApp 1<input value={waList[0]} onChange={(event) => setWaList([event.target.value, waList[1], waList[2]])} placeholder="08..." /></label>
            <label>WhatsApp 2<input value={waList[1]} onChange={(event) => setWaList([waList[0], event.target.value, waList[2]])} /></label>
          </div>
          <div className="two-fields">
            <label>WhatsApp 3<input value={waList[2]} onChange={(event) => setWaList([waList[0], waList[1], event.target.value])} /></label>
            <label>Produk per halaman
              <select value={profile.landing_page_size} onChange={(event) => setProfile({ ...profile, landing_page_size: event.target.value })}>
                <option value="12">12 produk</option>
                <option value="24">24 produk</option>
                <option value="48">48 produk</option>
              </select>
            </label>
            <label>Minimal order per model
              <input type="number" min="0" value={profile.min_order_qty} onChange={(event) => setProfile({ ...profile, min_order_qty: event.target.value })} placeholder="4" />
            </label>
            <small className="muted" style={{ gridColumn: '1 / -1' }}>Isi 0 bila toko ini tanpa minimum order.</small>
          </div>
          <div className="form-actions"><button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : `Simpan untuk ${storeLabel}`}</button></div>
        </form>
      )}

      {tab === 'ongkir' && (
        <form className="panel" onSubmit={saveProfile}>
          <h2>Metode perhitungan ongkir</h2>
          <label>Penyedia
            <select value={ongkir.ongkir_provider} onChange={(event) => setOngkir({ ...ongkir, ongkir_provider: event.target.value })}>
              <option value="manual">Tarif manual per kota</option>
              <option value="rajaongkir">RajaOngkir (otomatis, cek tarif ekspedisi)</option>
            </select>
          </label>
          {ongkir.ongkir_provider === 'rajaongkir' && (
            <>
              <label>API key RajaOngkir<input type="password" autoComplete="new-password" value={ongkir.rajaongkir_api_key} onChange={(event) => setOngkir({ ...ongkir, rajaongkir_api_key: event.target.value })} placeholder="Tempel API key" /></label>
              <div className="two-fields">
                <label>Kota asal (cari kecamatan)
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={originQuery} onChange={(event) => setOriginQuery(event.target.value)} placeholder="Mis. Metro Pusat" />
                    <button type="button" className="secondary" onClick={searchOrigin} disabled={originLoading}>{originLoading ? '…' : 'Cari'}</button>
                  </div>
                </label>
                <label>Kota asal terpilih<input value={ongkir.rajaongkir_origin_label} readOnly placeholder="Belum dipilih" /></label>
              </div>
              {originResults.length > 0 && (
                <div className="product-list">
                  {originResults.map((item) => (
                    <article key={item.id}>
                      <div><strong>{item.label}</strong></div>
                      <button type="button" onClick={() => { setOngkir({ ...ongkir, rajaongkir_origin_id: String(item.id), rajaongkir_origin_label: item.label }); setOriginResults([]); setOriginQuery(item.label); }}>Pilih</button>
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
                        checked={ongkir.ongkir_couriers.includes(code)}
                        onChange={(event) => setOngkir({ ...ongkir, ongkir_couriers: event.target.checked ? [...ongkir.ongkir_couriers, code] : ongkir.ongkir_couriers.filter((item) => item !== code) })}
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
      )}

      {tab === 'ongkir' && ongkir.ongkir_provider === 'manual' && (
        <div className="product-grid">
          <form className="panel" onSubmit={saveRate}>
            <h2>Tambah tarif ongkir</h2>
            <p className="muted" style={{ marginTop: 0 }}>Isi <strong>Tarif tetap</strong> untuk biaya per pengiriman, atau <strong>Tarif per kg</strong> bila dihitung dari berat produk.</p>
            <label>Kota / kecamatan<input required value={rateForm.area} onChange={(event) => setRateForm({ ...rateForm, area: event.target.value })} placeholder="Metro" /></label>
            <label>Tarif tetap (Rp)<input type="number" min="0" value={rateForm.cost} onChange={(event) => setRateForm({ ...rateForm, cost: event.target.value })} placeholder="0" /></label>
            <label>Tarif per kg (Rp)<input type="number" min="0" value={rateForm.cost_per_kg} onChange={(event) => setRateForm({ ...rateForm, cost_per_kg: event.target.value })} placeholder="0" /></label>
            <button type="submit">Tambah / ubah tarif</button>
          </form>
          <section className="panel">
            <h2>Daftar tarif ongkir</h2>
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

      {tab === 'voucher' && (
        <div className="product-grid">
          <form className="panel" onSubmit={saveVoucher}>
            <h2>{editingVoucher ? 'Edit voucher' : 'Buat voucher'}</h2>
            <p className="muted" style={{ marginTop: 0 }}>Kode dipakai pembeli di keranjang landing toko yang dipilih.</p>
            <label>Kode voucher<input required value={voucherForm.code} onChange={(event) => setVoucherForm({ ...voucherForm, code: event.target.value.toUpperCase() })} placeholder="HEMAT10" /></label>
            <label>Nama voucher<input required value={voucherForm.name} onChange={(event) => setVoucherForm({ ...voucherForm, name: event.target.value })} placeholder="Diskon 10%" /></label>
            <label>Jenis diskon
              <select value={voucherForm.discount_type} onChange={(event) => setVoucherForm({ ...voucherForm, discount_type: event.target.value })}>
                <option value="percentage">Persentase (%)</option>
                <option value="nominal">Nominal (Rp)</option>
                <option value="per_pcs">Per pcs (Rp per pcs)</option>
              </select>
            </label>
            <label>Nilai diskon<input required type="number" min="1" value={voucherForm.discount_value} onChange={(event) => setVoucherForm({ ...voucherForm, discount_value: event.target.value })} /></label>
            <label>Minimum belanja<input type="number" min="0" value={voucherForm.min_purchase} onChange={(event) => setVoucherForm({ ...voucherForm, min_purchase: event.target.value })} /></label>
            <label>Maksimum diskon (opsional)<input type="number" min="0" value={voucherForm.max_discount} onChange={(event) => setVoucherForm({ ...voucherForm, max_discount: event.target.value })} /></label>
            <label>Batas pemakaian (opsional)<input type="number" min="1" value={voucherForm.usage_limit} onChange={(event) => setVoucherForm({ ...voucherForm, usage_limit: event.target.value })} /></label>
            <button type="submit">{editingVoucher ? 'Simpan perubahan' : 'Simpan voucher'}</button>
            {editingVoucher && <button type="button" className="secondary" onClick={() => { setEditingVoucher(null); setVoucherForm(emptyVoucher); }}>Batal edit</button>}
          </form>
          <section className="panel">
            <h2>Daftar voucher</h2>
            <div className="product-list">
              {vouchers.map((voucher) => (
                <article key={voucher.id}>
                  <div>
                    <strong>{voucher.code} : {voucher.name}</strong>
                    <span>{voucher.discount_type === 'percentage' ? `${voucher.discount_value}%` : voucher.discount_type === 'per_pcs' ? `Rp${Number(voucher.discount_value).toLocaleString('id-ID')}/pcs` : `Rp${Number(voucher.discount_value).toLocaleString('id-ID')}`} · min Rp{Number(voucher.min_purchase || 0).toLocaleString('id-ID')} · dipakai {voucher.usage_count}{voucher.usage_limit ? `/${voucher.usage_limit}` : ''} · {voucher.is_active ? 'aktif' : 'nonaktif'}</span>
                  </div>
                  <div className="actions" style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="secondary" onClick={() => startEditVoucher(voucher)}>Edit</button>
                    <button type="button" className="secondary" onClick={() => toggleVoucher(voucher.id)}>{voucher.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                    <button type="button" className="danger" onClick={() => removeVoucher(voucher.id)}>Hapus</button>
                  </div>
                </article>
              ))}
              {!vouchers.length && <p className="muted">Belum ada voucher.</p>}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
