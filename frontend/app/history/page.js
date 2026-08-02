'use client';
import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const todayStr = () => new Date().toISOString().slice(0, 10);
const firstOfMonthStr = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10); };

export default function HistoryPage() {
  const [transactions, setTransactions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [cancelQuantities, setCancelQuantities] = useState({});
  const [cancelReason, setCancelReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(null);
  const [filters, setFilters] = useState({ search: '', date_from: '', date_to: '', status: '' });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('retur'); // retur | cancel | info
  const loadSeq = useRef(0);

  const h = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });
  const canCancel = ['owner', 'manager', 'admin'].includes(role);

  async function load(p = page) {
    setLoading(true);
    const seq = ++loadSeq.current;
    try {
      const qs = new URLSearchParams({ page: String(p), limit: '20', search: filters.search, date_from: filters.date_from, date_to: filters.date_to, status: filters.status }).toString();
      const r = await fetch(api + '/transactions?' + qs, { headers: h() });
      const b = await r.json();
      if (seq !== loadSeq.current) return;
      if (!r.ok) throw Error(b.message);
      setTransactions(b.data);
      setTotal(b.total || 0);
      setTotalPages(b.totalPages || 1);
      setPage(b.page || p);
    } catch (e) {
      if (seq === loadSeq.current) setMessage(e.message);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/auth/me', { headers: h() })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (b?.data?.role) setRole(b.data.role); })
      .catch(() => {});
  }, []);

  useEffect(() => { if (!filters.date_from || !filters.date_to) setFilters((f) => ({ ...f, date_from: f.date_from || firstOfMonthStr(), date_to: f.date_to || todayStr() })); }, []);

  useEffect(() => { load(1); }, []);

  async function applyFilter() {
    setPage(1);
    await load(1);
  }

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
      setActiveTab('retur');
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
      setMessage('Retur ' + b.data.return_no + ' dibuat.');
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

  return (
    <AppShell title="Riwayat Transaksi" eyebrow="PENJUALAN" actions={<a className="button-link" href="/pos">Buka Kasir</a>}>
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1.1fr .9fr' : '1fr', gap: '1rem', alignItems: 'start', maxWidth: 1400, margin: '0 auto' }}>
        {/* LEFT LIST */}
        <div style={{ display: 'grid', gap: '1rem' }}>
          <section className="panel">
            <div className="section-heading">
              <div><h2>Cari Transaksi</h2><p>Invoice, kasir, pelanggan, atau rentang tanggal</p></div>
              <span className="tag">{total} trx</span>
            </div>
            <div style={{ display: 'grid', gap: '.6rem', marginTop: '.75rem' }}>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <input style={{ flex: '1 1 200px' }} placeholder="Cari invoice / kasir / pelanggan" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && applyFilter()} />
                <button type="button" onClick={applyFilter} disabled={loading} style={{ minHeight: 40 }}>{loading ? '...' : 'Cari'}</button>
              </div>
              <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <label style={{ minWidth: 140 }}>Dari<input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} /></label>
                <label style={{ minWidth: 140 }}>Sampai<input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} /></label>
                <label>Status
                  <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                    <option value="">Semua</option>
                    <option value="completed">Selesai</option>
                    <option value="partially_cancelled">Sebagian batal</option>
                    <option value="cancelled">Batal</option>
                  </select>
                </label>
                <button type="button" className="small secondary" onClick={applyFilter} style={{ alignSelf: 'end', minHeight: 40 }}>Filter</button>
              </div>
            </div>
            {message && <p className={`message ${message.toLowerCase().includes('berhasil') || message.toLowerCase().includes('retur') ? 'success' : ''}`}>{message}</p>}
          </section>

          <section className="panel">
            <div className="product-list" role="list">
              {transactions.map((t) => (
                <article key={t.id} role="button" tabIndex={0} onClick={() => inspect(t.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inspect(t.id); } }} style={{ cursor: 'pointer', border: selected?.id === t.id ? '1px solid #2563eb' : undefined, borderRadius: 6, padding: '.6rem', background: selected?.id === t.id ? '#eff6ff' : undefined }}>
                  <div>
                    <strong style={{ fontSize: '.9rem' }}>{t.invoice_no}</strong>
                    <span>{t.cashier} {t.customer ? `• ${t.customer} (${t.customer_tier})` : ''} • {new Date(t.created_at).toLocaleString('id-ID')}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>{rp(t.grand_total)}</strong>
                    <span><span className={'status ' + (t.status === 'completed' ? 'paid' : t.status === 'cancelled' ? 'pending' : 'approved')}>{t.status}</span> • {t.payment_method}</span>
                  </div>
                </article>
              ))}
              {!transactions.length && !loading && <p className="muted">Belum ada transaksi.</p>}
              {loading && <p className="muted">Memuat…</p>}
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center', marginTop: '1rem' }}>
                <button disabled={page <= 1} onClick={() => load(page - 1)} className="small secondary">Prev</button>
                <span className="muted" style={{ alignSelf: 'center', fontSize: '.85rem' }}>Hal {page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => load(page + 1)} className="small secondary">Next</button>
              </div>
            )}
          </section>
        </div>

        {/* RIGHT DETAIL SIDEBAR */}
        {selected && (
          <div style={{ position: 'sticky', top: '1rem', display: 'grid', gap: '1rem' }}>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <h2 style={{ fontSize: '1.1rem' }}>{selected.invoice_no}</h2>
                  <p>{new Date(selected.created_at).toLocaleString('id-ID')} • {selected.payment_method} • {rp(selected.grand_total)}{selected.cancelled_amount ? ` • refund ${rp(selected.cancelled_amount)}` : ''}</p>
                </div>
                <button type="button" className="small secondary" onClick={() => setSelected(null)}>Tutup</button>
              </div>

              <div style={{ display: 'flex', gap: '.4rem', marginTop: '.75rem' }}>
                <button className={activeTab === 'info' ? 'small' : 'small secondary'} onClick={() => setActiveTab('info')}>Info</button>
                <button className={activeTab === 'retur' ? 'small' : 'small secondary'} onClick={() => setActiveTab('retur')}>Retur</button>
                {canCancel && <button className={activeTab === 'cancel' ? 'small' : 'small secondary'} onClick={() => setActiveTab('cancel')}>Batal</button>}
                <a className="small secondary" href={'/receipt/' + selected.id + '?print=1'} target="_blank" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>Cetak ulang</a>
              </div>

              <div style={{ marginTop: '1rem' }}>
                {activeTab === 'info' && (
                  <div style={{ display: 'grid', gap: '.5rem' }}>
                    <p className="muted" style={{ margin: 0 }}>Klik Cetak ulang untuk struk. {selected.status !== 'completed' ? `Status: ${selected.status}. Alasan: ${selected.cancel_reason || '-'}` : ''}</p>
                    {selected.items.map((it) => (
                      <div key={it.transaction_item_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <strong style={{ fontSize: 13 }}>{it.product_name}</strong>
                          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>{it.product_sku} {it.variant_detail ? `· ${it.variant_detail}` : ''}{it.cancelled_qty ? ` · batal ${it.cancelled_qty}` : ''}</p>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>×{it.quantity}</div>
                          <div style={{ fontSize: 12, color: '#64748b' }}>{rp(it.price)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {activeTab === 'retur' && (
                  <div style={{ display: 'grid', gap: '.6rem' }}>
                    <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Pilih qty yang mau diretur. Stok akan kembali setelah approve.</p>
                    {selected.items.map((item) => {
                      const remaining = item.quantity - (item.cancelled_qty || 0);
                      const qty = quantities[item.transaction_item_id] ?? 0;
                      return (
                        <div key={item.transaction_item_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: qty > 0 ? '#f0fdf4' : undefined }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ fontSize: 13 }}>{item.product_name}</strong>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>sisa {remaining}/{item.quantity} · Rp{Number(item.price || 0).toLocaleString('id-ID')}</p>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <button type="button" onClick={() => setQuantities({ ...quantities, [item.transaction_item_id]: Math.max(0, qty - 1) })} disabled={qty <= 0} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: qty <= 0 ? 'default' : 'pointer', opacity: qty <= 0 ? .4 : 1 }}>−</button>
                            <input type="number" min="0" max={remaining} value={qty} onChange={(e) => setQuantities({ ...quantities, [item.transaction_item_id]: Math.min(remaining, Math.max(0, Number(e.target.value))) })} style={{ width: 48, height: 36, textAlign: 'center', borderRadius: 6, border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14 }} />
                            <button type="button" onClick={() => setQuantities({ ...quantities, [item.transaction_item_id]: Math.min(remaining, qty + 1) })} disabled={qty >= remaining} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: qty >= remaining ? 'default' : 'pointer', opacity: qty >= remaining ? .4 : 1 }}>+</button>
                          </div>
                        </div>
                      );
                    })}
                    <button disabled={saving} onClick={createReturn} style={{ minHeight: 44 }}>{saving ? '…' : 'Buat retur'}</button>
                  </div>
                )}
                {activeTab === 'cancel' && canCancel && (
                  <div style={{ display: 'grid', gap: '.6rem' }}>
                    {selected.status === 'cancelled' ? <p className="message">Transaksi sudah batal total.</p> : <>
                      <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Batalkan sebagian atau semua item. Refund dihitung otomatis.</p>
                      {selected.items.map((item) => {
                        const remaining = item.quantity - (item.cancelled_qty || 0);
                        if (remaining <= 0) return null;
                        const qty = cancelQuantities[item.transaction_item_id] ?? 0;
                        return (
                          <div key={item.transaction_item_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: qty > 0 ? '#fef2f2' : undefined }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <strong style={{ fontSize: 13 }}>{item.product_name}</strong>
                              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>sisa {remaining} · Rp{Number(item.price || 0).toLocaleString('id-ID')}</p>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button type="button" onClick={() => setCancelQuantities({ ...cancelQuantities, [item.transaction_item_id]: Math.max(0, qty - 1) })} disabled={qty <= 0} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: qty <= 0 ? 'default' : 'pointer', opacity: qty <= 0 ? .4 : 1 }}>−</button>
                              <input type="number" min="0" max={remaining} value={qty} onChange={(e) => setCancelQuantities({ ...cancelQuantities, [item.transaction_item_id]: Math.min(remaining, Math.max(0, Number(e.target.value))) })} style={{ width: 48, height: 36, textAlign: 'center', borderRadius: 6, border: '1px solid #e2e8f0', fontWeight: 700, fontSize: 14 }} />
                              <button type="button" onClick={() => setCancelQuantities({ ...cancelQuantities, [item.transaction_item_id]: Math.min(remaining, qty + 1) })} disabled={qty >= remaining} style={{ width: 32, height: 32, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: qty >= remaining ? 'default' : 'pointer', opacity: qty >= remaining ? .4 : 1 }}>+</button>
                            </div>
                          </div>
                        );
                      })}
                      <label style={{ fontSize: 13 }}>Alasan batal<input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Opsional — misal salah input" style={{ marginTop: 4 }} /></label>
                      <button className="secondary" disabled={saving} onClick={cancelItems} style={{ minHeight: 44 }}>{saving ? '…' : 'Batalkan item'}</button>
                    </>}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
