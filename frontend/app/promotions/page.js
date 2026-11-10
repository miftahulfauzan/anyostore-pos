'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const emptyForm = { code: '', name: '', discount_type: 'percentage', discount_value: '', min_purchase: '', max_discount: '', usage_limit: '' };

export default function PromotionsPage() {
  const { user } = useAppSession();
  const [rows, setRows] = useState([]);
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState(emptyForm);
  const headers = () => ({ 'Content-Type': 'application/json' });
  const isOwner = user?.role === 'owner';

  async function load(branchId = branch) {
    const query = isOwner && branchId ? `?branch_id=${branchId}` : '';
    const r = await fetch(api + '/promotions' + query, { headers: headers() });
    const b = await r.json();
    if (!r.ok) throw Error(b.message);
    setRows(b.data || []);
  }

  useEffect(() => {
    (async () => {
      try {
        if (isOwner) {
          const response = await fetch(api + '/settings/branches', { headers: headers() });
          const body = await response.json();
          const list = (body.data || []).filter((store) => store.is_active !== false);
          setStores(list);
          const first = list[0] ? String(list[0].id) : '';
          setBranch(first);
          await load(first);
        } else {
          await load('');
        }
      } catch (error) { setMessage(error.message); }
    })();
  }, [isOwner]);

  async function save(e) {
    e.preventDefault();
    try {
      const payload = { ...form, ...(isOwner && branch ? { branch_id: Number(branch) } : {}) };
      const r = await fetch(api + '/promotions', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
      const b = await r.json();
      if (!r.ok) throw Error(b.message);
      setForm(emptyForm);
      setMessage('Voucher disimpan.');
      await load();
    } catch (error) { setMessage(error.message); }
  }

  async function toggle(id) {
    const r = await fetch(api + '/promotions/' + id + '/toggle-active', { method: 'PUT', headers: headers(), body: JSON.stringify(isOwner && branch ? { branch_id: Number(branch) } : {}) });
    const b = await r.json();
    if (!r.ok) return setMessage(b.message);
    await load();
  }

  async function remove(id) {
    if (!confirm('Hapus voucher ini?')) return;
    const query = isOwner && branch ? `?branch_id=${branch}` : '';
    const r = await fetch(`${api}/promotions/${id}${query}`, { method: 'DELETE', headers: headers() });
    const b = await r.json();
    if (!r.ok) return setMessage(b.message);
    setMessage('Voucher dihapus.');
    await load();
  }

  return <AppShell title="Promo & Voucher" eyebrow="PENJUALAN">
    <section className="product-grid">
      <form className="panel" onSubmit={save}>
        <h2>Buat voucher</h2>
        {isOwner && stores.length > 0 && (
          <label>Berlaku di toko
            <select value={branch} onChange={(event) => { setBranch(event.target.value); load(event.target.value).catch((error) => setMessage(error.message)); }}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        )}
        <label>Kode voucher<input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="HEMAT10" /></label>
        <label>Nama voucher<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diskon 10%" /></label>
        <label>Jenis diskon<select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value })}><option value="percentage">Persentase (%)</option><option value="nominal">Nominal (Rp)</option></select></label>
        <label>Nilai diskon<input required type="number" min="1" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></label>
        <label>Minimum belanja<input type="number" min="0" value={form.min_purchase} onChange={(e) => setForm({ ...form, min_purchase: e.target.value })} /></label>
        <label>Maksimum diskon (opsional)<input type="number" min="0" value={form.max_discount} onChange={(e) => setForm({ ...form, max_discount: e.target.value })} /></label>
        <label>Batas pemakaian (opsional)<input type="number" min="1" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} /></label>
        <button type="submit">Simpan voucher</button>
        {message && <p className="message">{message}</p>}
      </form>
      <section className="panel">
        <h2>Daftar voucher</h2>
        <p className="muted" style={{ marginTop: 0 }}>Kode ini bisa dipakai pembeli di keranjang landing page toko yang dipilih.</p>
        <div className="product-list">
          {rows.map((p) => (
            <article key={p.id}>
              <div>
                <strong>{p.code} : {p.name}</strong>
                <span>{p.discount_type === 'percentage' ? p.discount_value + '%' : 'Rp' + Number(p.discount_value).toLocaleString('id-ID')} · dipakai {p.usage_count}{p.usage_limit ? '/' + p.usage_limit : ''} · {p.is_active ? 'aktif' : 'nonaktif'}</span>
              </div>
              <div className="actions" style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="secondary" onClick={() => toggle(p.id)}>{p.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                <button type="button" className="danger" onClick={() => remove(p.id)}>Hapus</button>
              </div>
            </article>
          ))}
          {!rows.length && <p>Belum ada voucher.</p>}
        </div>
      </section>
    </section>
  </AppShell>;
}
