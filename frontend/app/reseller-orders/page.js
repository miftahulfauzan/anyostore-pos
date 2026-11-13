'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';
import { openPrintView } from '../lib/print-utils';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const STATUS_LABEL = {
  new: 'Baru',
  confirmed: 'Dikonfirmasi',
  paid: 'Dibayar',
  shipped: 'Dikirim',
  done: 'Selesai',
  rejected: 'Ditolak',
  cancelled: 'Dibatalkan',
};
const PAYMENT_LABEL = {
  unpaid: 'Belum bayar',
  waiting_verification: 'Menunggu verifikasi',
  paid: 'Sudah dibayar',
};
const FILTERS = [
  ['', 'Semua'],
  ['new', 'Baru'],
  ['confirmed', 'Dikonfirmasi'],
  ['paid', 'Dibayar'],
  ['shipped', 'Dikirim'],
  ['done', 'Selesai'],
  ['rejected', 'Ditolak'],
];

const rp = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
const shortDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function ResellerOrdersPage() {
  const { user, activeBranchId } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [tab, setTab] = useState('orders');
  const [branch, setBranch] = useState('');
  const [stores, setStores] = useState([]);
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [labelOrder, setLabelOrder] = useState(null);
  const [shipForm, setShipForm] = useState({ courier: '', tracking_no: '' });
  const [tempPassword, setTempPassword] = useState(null);

  const branchQuery = useCallback(
    (extra = {}) => {
      const params = new URLSearchParams(extra);
      if (isOwner && branch) params.set('branch_id', branch);
      const query = params.toString();
      return query ? `?${query}` : '';
    },
    [branch, isOwner],
  );

  const loadOrders = useCallback(async () => {
    const response = await fetch(`${api}/reseller-admin/orders${branchQuery({ status, search })}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Gagal memuat pesanan');
    setOrders(body.data || []);
  }, [branchQuery, search, status]);

  const loadAccounts = useCallback(async () => {
    const response = await fetch(`${api}/reseller-admin/accounts${branchQuery({ search })}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Gagal memuat pembeli');
    setAccounts(body.data || []);
  }, [branchQuery, search]);

  useEffect(() => {
    (async () => {
      try {
        if (!isOwner) return;
        const response = await fetch(`${api}/settings/branches`);
        const body = await response.json();
        const list = (body.data || []).filter((store) => store.is_active !== false);
        setStores(list);
        const preferred = list.find((store) => String(store.id) === String(activeBranchId)) || list[0];
        if (preferred) setBranch(String(preferred.id));
      } catch (error) {
        setMessage(error.message);
      }
    })();
  }, [activeBranchId, isOwner]);

  useEffect(() => {
    if (isOwner && !branch) return;
    (async () => {
      try {
        setMessage('');
        if (tab === 'orders') await loadOrders();
        else await loadAccounts();
      } catch (error) {
        setMessage(error.message);
      }
    })();
  }, [branch, isOwner, loadAccounts, loadOrders, tab]);

  async function openOrder(id) {
    try {
      setBusy(true);
      const response = await fetch(`${api}/reseller-admin/orders/${id}${branchQuery()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setSelected(body.data);
      setShipForm({ courier: body.data.courier || '', tracking_no: body.data.tracking_no || '' });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function act(path, payload = {}, successMessage) {
    try {
      setBusy(true);
      setMessage('');
      const response = await fetch(`${api}/reseller-admin/orders/${selected.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, ...(isOwner && branch ? { branch_id: Number(branch) } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Aksi gagal');
      setMessage(successMessage);
      await loadOrders();
      await openOrder(selected.id);
      return body.data;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function convertAndPrint() {
    const data = await act('convert', { payment_method: 'transfer' }, 'Transaksi dibuat. Membuka struk…');
    if (data?.transaction_id) {
      window.open(`/receipt/${data.transaction_id}?print=1`, '_blank', 'noopener');
    }
  }

  function printLabel() {
    if (!selected) return;
    setLabelOrder(selected);
    window.setTimeout(() => openPrintView({ selector: '#reseller-shipping-label', title: `Label ${selected.order_no}` }), 60);
  }

  async function toggleAccount(row) {
    try {
      setBusy(true);
      const nextStatus = row.status === 'active' ? 'suspended' : 'active';
      const response = await fetch(`${api}/reseller-admin/accounts/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus, ...(isOwner && branch ? { branch_id: Number(branch) } : {}) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setMessage(nextStatus === 'active' ? 'Akun diaktifkan.' : 'Akun disuspend.');
      await loadAccounts();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword(row) {
    try {
      setBusy(true);
      const response = await fetch(`${api}/reseller-admin/accounts/${row.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isOwner && branch ? { branch_id: Number(branch) } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setTempPassword(body.data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    const map = { new: 0 };
    for (const order of orders) map[order.status] = (map[order.status] || 0) + 1;
    return map;
  }, [orders]);

  const actions = (
    <div className="header-action-links">
      <button type="button" className="secondary" onClick={() => (tab === 'orders' ? loadOrders() : loadAccounts())} disabled={busy}>
        Muat ulang
      </button>
    </div>
  );

  return (
    <AppShell title="Pesanan Reseller" eyebrow="PENJUALAN ONLINE" actions={actions}>
      <div className="card">
        <div className="tabs" role="tablist">
          <button type="button" className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')} role="tab" aria-selected={tab === 'orders'}>
            Pesanan {counts.new ? `(${counts.new} baru)` : ''}
          </button>
          <button type="button" className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')} role="tab" aria-selected={tab === 'accounts'}>
            Pembeli
          </button>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {isOwner && (
            <label>
              Toko
              <select value={branch} onChange={(event) => setBranch(event.target.value)}>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label style={{ flex: 1, minWidth: 200 }}>
            Cari
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nomor pesanan, nama, atau WhatsApp"
            />
          </label>
          {tab === 'orders' && (
            <label>
              Status
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {FILTERS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {message && <p className="form-message" role="status">{message}</p>}
      </div>

      {tab === 'orders' && (
        <div className="card">
          {!orders.length ? (
            <p>Belum ada pesanan pada filter ini.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nomor</th>
                  <th>Tanggal</th>
                  <th>Pembeli</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Bayar</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.order_no}</td>
                    <td>{shortDate(order.created_at)}</td>
                    <td>
                      {order.buyer_name}
                      <br />
                      <small>{order.buyer_phone}</small>
                    </td>
                    <td>{rp(order.total)}</td>
                    <td>
                      <span className="status">{STATUS_LABEL[order.status] || order.status}</span>
                    </td>
                    <td>{PAYMENT_LABEL[order.payment_status] || order.payment_status}</td>
                    <td>
                      <button type="button" className="secondary" onClick={() => openOrder(order.id)}>
                        Detail
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'accounts' && (
        <div className="card">
          {!accounts.length ? (
            <p>Belum ada pembeli terdaftar.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Email</th>
                  <th>WhatsApp</th>
                  <th>Pesanan</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{row.email}</td>
                    <td>{row.phone || '-'}</td>
                    <td>
                      {row.orders_count} · {rp(row.total_spent)}
                    </td>
                    <td>
                      <span className="status">{row.status === 'active' ? 'Aktif' : 'Suspend'}</span>
                    </td>
                    <td className="row" style={{ gap: 6 }}>
                      <button type="button" className="secondary" onClick={() => toggleAccount(row)} disabled={busy}>
                        {row.status === 'active' ? 'Suspend' : 'Aktifkan'}
                      </button>
                      <button type="button" onClick={() => resetPassword(row)} disabled={busy}>
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tempPassword && (
        <div className="card">
          <h3>Password sementara</h3>
          <p>
            {tempPassword.email} - kirim lewat WhatsApp, lalu minta pembeli menggantinya setelah masuk.
          </p>
          <p>
            <code style={{ fontSize: 18 }}>{tempPassword.temporary_password}</code>{' '}
            <button
              type="button"
              className="secondary"
              onClick={() => navigator.clipboard?.writeText(tempPassword.temporary_password)}
            >
              Salin
            </button>
          </p>
          <button type="button" className="secondary" onClick={() => setTempPassword(null)}>
            Tutup
          </button>
        </div>
      )}

      {selected && (
        <div className="card">
          <h3>
            {selected.order_no} · <span className="status">{STATUS_LABEL[selected.status]}</span>
          </h3>
          <p>
            {selected.buyer_name} · {selected.buyer_phone}
            <br />
            {selected.buyer_address}
            {selected.buyer_city ? `, ${selected.buyer_city}` : ''} {selected.buyer_postal || ''}
            {selected.notes ? <><br /><em>{selected.notes}</em></> : null}
          </p>
          <table>
            <thead>
              <tr>
                <th>Produk</th>
                <th>Qty</th>
                <th>Harga</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(selected.items || []).map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.product_name}
                    {item.variant_label ? ` · ${item.variant_label}` : ''}
                    <br />
                    <small>{item.sku}</small>
                  </td>
                  <td>{item.quantity}</td>
                  <td>{rp(item.price)}</td>
                  <td>{rp(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Subtotal {rp(selected.subtotal)} · Diskon {rp(selected.discount)} · Ongkir {rp(selected.shipping_cost)} ·{' '}
            <strong>Total {rp(selected.total)}</strong>
          </p>

          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {selected.status === 'new' && (
              <button type="button" onClick={() => act('confirm', {}, 'Pesanan dikonfirmasi.')} disabled={busy}>
                Konfirmasi
              </button>
            )}
            {['new', 'confirmed'].includes(selected.status) && (
              <>
                <button type="button" onClick={() => act('mark-paid', {}, 'Pesanan ditandai sudah dibayar.')} disabled={busy}>
                  Tandai sudah dibayar
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const reason = window.prompt('Alasan menolak pesanan');
                    if (reason) act('reject', { reason }, 'Pesanan ditolak.');
                  }}
                  disabled={busy}
                >
                  Tolak
                </button>
              </>
            )}
            {selected.status === 'paid' && (
              <span className="row" style={{ gap: 6, alignItems: 'flex-end' }}>
                <label>
                  Kurir
                  <input value={shipForm.courier} onChange={(event) => setShipForm({ ...shipForm, courier: event.target.value })} placeholder="JNE / J&T / SiCepat" />
                </label>
                <label>
                  No resi
                  <input value={shipForm.tracking_no} onChange={(event) => setShipForm({ ...shipForm, tracking_no: event.target.value })} />
                </label>
                <button type="button" onClick={() => act('ship', shipForm, 'Pesanan ditandai dikirim.')} disabled={busy}>
                  Tandai dikirim
                </button>
              </span>
            )}
            {selected.status === 'shipped' && (
              <button type="button" onClick={() => act('done', {}, 'Pesanan selesai.')} disabled={busy}>
                Tandai selesai
              </button>
            )}
            {selected.payment_status === 'paid' && !selected.transaction_id && (
              <button type="button" onClick={convertAndPrint} disabled={busy}>
                Konversi &amp; cetak struk
              </button>
            )}
            {selected.transaction_id && (
              <a className="button-link" href={`/receipt/${selected.transaction_id}`} target="_blank" rel="noreferrer">
                Cetak ulang struk
              </a>
            )}
            <button type="button" className="secondary" onClick={printLabel} disabled={busy}>
              Cetak label resi
            </button>
            <button type="button" className="secondary" onClick={() => setSelected(null)}>
              Tutup
            </button>
          </div>
        </div>
      )}

      {labelOrder && (
        <div style={{ position: 'fixed', left: -10000, top: 0 }} aria-hidden="true">
          <section id="reseller-shipping-label" style={{ width: '105mm', padding: '8mm', fontFamily: 'DM Sans, sans-serif', color: '#111' }}>
            <style>{'@page { size: A6; margin: 6mm; }'}</style>
            <div style={{ border: '1px solid #111', padding: '6mm', borderRadius: 4 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Pengirim</div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Anyostore</div>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Penerima</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{labelOrder.buyer_name}</div>
              <div style={{ marginBottom: 6 }}>{labelOrder.buyer_phone}</div>
              <div style={{ marginBottom: 10 }}>
                {labelOrder.buyer_address}
                {labelOrder.buyer_city ? `, ${labelOrder.buyer_city}` : ''} {labelOrder.buyer_postal || ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #111', paddingTop: 8, fontSize: 12 }}>
                <span>Kurir: {labelOrder.courier || '-'}</span>
                <span>Resi: {labelOrder.tracking_no || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}>
                <span>Pesanan: {labelOrder.order_no}</span>
                <span>
                  {(labelOrder.items || []).reduce((total, item) => total + Number(item.quantity || 0), 0)} pcs
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}