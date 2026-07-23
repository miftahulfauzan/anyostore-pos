'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');

export default function HistoryPage() {
  const [transactions, setTransactions] = useState([]);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [cancelQuantities, setCancelQuantities] = useState({});
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(null);

  const h = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });
  const canCancel = ['owner', 'manager', 'admin'].includes(role);

  async function load() {
    const r = await fetch(api + '/transactions', { headers: h() });
    const b = await r.json();
    if (!r.ok) throw Error(b.message);
    setTransactions(b.data);
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    load().catch((e) => setMessage(e.message));
    fetch(api + '/auth/me', { headers: h() })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (b?.data?.role) setRole(b.data.role); })
      .catch(() => {});
  }, []);

  async function inspect(id) {
    try {
      const r = await fetch(api + '/transactions/' + id, { headers: h() });
      const b = await r.json();
      if (!r.ok) throw Error(b.message);
      setSelected(b.data);
      const maxQty = (i) => i.quantity - (i.cancelled_qty || 0);
      setQuantities(Object.fromEntries(b.data.items.map((i) => [i.transaction_item_id, maxQty(i)])));
      setCancelQuantities(Object.fromEntries(b.data.items.map((i) => [i.transaction_item_id, 0])));
      setCancelReason('');
    } catch (e) { setMessage(e.message); }
  }

  async function createReturn() {
    const items = selected.items.map((i) => ({ transaction_item_id: i.transaction_item_id, quantity: Number(quantities[i.transaction_item_id] || 0) })).filter((i) => i.quantity > 0);
    if (!items.length) return setMessage('Pilih minimal satu item untuk diretur.');
    try {
      setSaving(true);
      const r = await fetch(api + '/returns', { method: 'POST', headers: { ...h(), 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_id: selected.id, items, reason: 'Retur dari riwayat transaksi' }) });
      const b = await r.json();
      if (!r.ok) throw Error(b.message);
      setMessage('Retur ' + b.data.return_no + ' dibuat dan menunggu persetujuan.');
      setSelected(null);
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  async function cancelItems() {
    const items = selected.items.map((i) => ({ transaction_item_id: i.transaction_item_id, qty: Number(cancelQuantities[i.transaction_item_id] || 0), reason: cancelReason })).filter((i) => i.qty > 0);
    if (!items.length) return setMessage('Pilih minimal satu item untuk dibatalkan.');
    try {
      setSaving(true);
      const r = await fetch(api + '/transactions/' + selected.id + '/cancel', { method: 'PUT', headers: { ...h(), 'Content-Type': 'application/json' }, body: JSON.stringify({ items, reason: cancelReason }) });
      const b = await r.json();
      if (!r.ok) throw Error(b.message);
      setMessage('Transaksi dibatalkan. Refund: ' + rp(b.data.refund));
      setSelected(null);
      load();
    } catch (e) { setMessage(e.message); } finally { setSaving(false); }
  }

  return <AppShell title="Riwayat Transaksi" eyebrow="PENJUALAN" actions={<a className="button-link" href="/pos">Buka Kasir</a>}>
    <section className="panel">
      <h2>Transaksi Terakhir</h2>
      <p className="muted">Klik transaksi untuk detail, retur, atau cancel.</p>
      {message && <p className="message">{message}</p>}
      <div className="product-list">{transactions.map((t) =>
        <article key={t.id} onClick={() => inspect(t.id)} style={{ cursor: 'pointer' }}>
          <div>
            <strong>{t.invoice_no}</strong>
            <span>{t.cashier} · {new Date(t.created_at).toLocaleString('id-ID')}</span>
          </div>
          <div>
            <strong>{rp(t.grand_total)}</strong>
            <span>{t.payment_method} · {t.status}{t.cancelled_amount ? ' · refund ' + rp(t.cancelled_amount) : ''}</span>
          </div>
        </article>)}{!transactions.length && <p>Belum ada transaksi.</p>}</div>
    </section>
    {selected && <section className="panel">
      <div className="section-heading">
        <div>
          <h2>{selected.invoice_no}</h2>
          <p>Detail, retur, atau cancel transaksi.</p>
        </div>
        <div>
          <a href={'/receipt/' + selected.id + '?print=1'} target="_blank">Cetak ulang</a>
          <button type="button" onClick={() => setSelected(null)}>Tutup</button>
        </div>
      </div>
      <div className="history-item-list">{selected.items.map((item) => {
        const remaining = item.quantity - (item.cancelled_qty || 0);
        return <article key={item.transaction_item_id} className="history-item">
          <div className="history-item-info">
            <strong>{item.product_name}</strong>
            <span>{item.product_sku} · {rp(item.price)} · qty {item.quantity}{item.cancelled_qty ? ' (batal ' + item.cancelled_qty + ')' : ''}</span>
          </div>
          <div className="history-item-actions">
            <label>Retur<input type="number" min="0" max={remaining} value={quantities[item.transaction_item_id] ?? 0} onChange={(e) => setQuantities({ ...quantities, [item.transaction_item_id]: Math.min(remaining, Math.max(0, Number(e.target.value))) })} /></label>
            {canCancel && selected.status !== 'cancelled' && remaining > 0 && <label>Batal<input type="number" min="0" max={remaining} value={cancelQuantities[item.transaction_item_id] ?? 0} onChange={(e) => setCancelQuantities({ ...cancelQuantities, [item.transaction_item_id]: Math.min(remaining, Math.max(0, Number(e.target.value))) })} /></label>}
          </div>
        </article>;
      })}</div>
      {canCancel && selected.status !== 'cancelled' && <label>Alasan batal<input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Opsional" /></label>}
      <div className="history-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
        <button disabled={saving} onClick={createReturn}>{saving ? 'Membuat retur…' : 'Buat retur'}</button>
        {canCancel && selected.status !== 'cancelled' && <button className="secondary" disabled={saving} onClick={cancelItems}>{saving ? 'Membatalkan…' : 'Batalkan item'}</button>}
      </div>
    </section>}</AppShell>;
}
