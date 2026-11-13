'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api, cardStyle, inputStyle, labelStyle, linkStyle, pageStyle, primaryButton, secondaryButton,
  shellStyle, shortDate, rp, T, STATUS_LABEL, PAYMENT_LABEL,
} from '../ui';

const emptyAddress = { label: '', recipient: '', phone: '', address: '', city: '', postal_code: '', is_default: false };

export default function ResellerAccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(emptyAddress);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const me = await fetch(`${api}/reseller/me`, { credentials: 'include' }).then((response) => response.json());
    if (!me.data) {
      router.replace('/masuk');
      return;
    }
    setAccount(me.data);
    const list = await fetch(`${api}/reseller/orders`, { credentials: 'include' }).then((response) => response.json());
    setOrders(Array.isArray(list.data) ? list.data : []);
    setLoading(false);
  }, [router]);

  useEffect(() => { load().catch((error) => { setMessage(error.message); setLoading(false); }); }, [load]);

  async function saveAddress(event) {
    event.preventDefault();
    setMessage('');
    const payload = { ...form, is_default: Boolean(form.is_default) };
    const response = await fetch(`${api}/reseller/addresses${editingId ? `/${editingId}` : ''}`, {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message || 'Gagal menyimpan alamat'); return; }
    setForm(emptyAddress);
    setEditingId(null);
    setMessage('Alamat tersimpan.');
    await load();
  }

  async function removeAddress(id) {
    const response = await fetch(`${api}/reseller/addresses/${id}`, { method: 'DELETE', credentials: 'include' });
    const body = await response.json();
    if (!response.ok) { setMessage(body.message || 'Gagal menghapus alamat'); return; }
    await load();
  }

  function editAddress(row) {
    setEditingId(row.id);
    setForm({
      label: row.label || '',
      recipient: row.recipient || '',
      phone: row.phone || '',
      address: row.address || '',
      city: row.city || '',
      postal_code: row.postal_code || '',
      is_default: Boolean(row.is_default),
    });
  }

  async function logout() {
    await fetch(`${api}/reseller/logout`, { method: 'POST', credentials: 'include' });
    router.replace('/');
  }

  if (loading) {
    return <main style={pageStyle}><div style={shellStyle}><p>Memuat akun…</p></div></main>;
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <a href="/" style={{ ...linkStyle, fontSize: 12 }}>← Katalog</a>
          <button type="button" onClick={logout} style={{ ...secondaryButton, minHeight: 34, padding: '6px 12px', fontSize: 12 }}>Keluar</button>
        </div>

        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 19 }}>{account.name}</h1>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>{account.email} · {account.phone || '-'}</p>
          {message && <p role="status" style={{ margin: 0, fontSize: 12.5, color: T.blue }}>{message}</p>}
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Alamat pengiriman</h2>
          {(account.addresses || []).length === 0 && <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Belum ada alamat tersimpan.</p>}
          {(account.addresses || []).map((row) => (
            <div key={row.id} style={{ display: 'grid', gap: 4, padding: 10, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <strong style={{ fontSize: 13 }}>{row.recipient} · {row.phone}{row.is_default ? ' · Utama' : ''}</strong>
              <span style={{ fontSize: 12.5, color: T.muted }}>{row.address}{row.city ? `, ${row.city}` : ''} {row.postal_code || ''}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => editAddress(row)} style={{ ...secondaryButton, minHeight: 32, padding: '4px 10px', fontSize: 12 }}>Ubah</button>
                <button type="button" onClick={() => removeAddress(row.id)} style={{ ...secondaryButton, minHeight: 32, padding: '4px 10px', fontSize: 12 }}>Hapus</button>
              </div>
            </div>
          ))}

          <form onSubmit={saveAddress} style={{ display: 'grid', gap: 8, marginTop: 6 }}>
            <label style={labelStyle}>Label (mis. Rumah)
              <input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>Nama penerima
              <input required value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>No HP penerima
              <input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>Alamat lengkap
              <textarea required rows={2} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <label style={labelStyle}>Kota
                <input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} style={inputStyle} />
              </label>
              <label style={labelStyle}>Kode pos
                <input value={form.postal_code} onChange={(event) => setForm({ ...form, postal_code: event.target.value })} style={inputStyle} />
              </label>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: T.muted }}>
              <input type="checkbox" checked={form.is_default} onChange={(event) => setForm({ ...form, is_default: event.target.checked })} />
              Jadikan alamat utama
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={primaryButton}>{editingId ? 'Simpan perubahan' : 'Tambah alamat'}</button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setForm(emptyAddress); }} style={secondaryButton}>Batal</button>
              )}
            </div>
          </form>
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Riwayat pesanan</h2>
          {orders.length === 0 && <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Belum ada pesanan.</p>}
          {orders.map((order) => (
            <div key={order.order_no} style={{ display: 'grid', gap: 4, padding: 10, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                <strong>{order.order_no}</strong>
                <span>{rp(order.total)}</span>
              </div>
              <span style={{ fontSize: 12, color: T.muted }}>
                {shortDate(order.created_at)} · {STATUS_LABEL[order.status] || order.status} · {PAYMENT_LABEL[order.payment_status] || order.payment_status}
              </span>
              {order.tracking_no && <span style={{ fontSize: 12, color: T.muted }}>Resi {order.courier || ''} {order.tracking_no}</span>}
              <a href={`/pesanan/${order.public_token}`} style={{ ...linkStyle, fontSize: 12 }}>Lihat detail</a>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}