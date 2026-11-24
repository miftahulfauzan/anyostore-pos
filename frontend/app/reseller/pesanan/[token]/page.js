'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, cardStyle, linkStyle, pageStyle, shellStyle, shortDate, rp, T, STATUS_LABEL, PAYMENT_LABEL } from '../../ui';

const STEPS = [
  ['new', 'Pesanan diterima'],
  ['confirmed', 'Dikonfirmasi admin'],
  ['paid', 'Pembayaran diterima'],
  ['shipped', 'Dikirim'],
  ['done', 'Selesai'],
];

export default function ResellerOrderStatusPage() {
  const params = useParams();
  const token = params?.token;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [proofBusy, setProofBusy] = useState(false);
  const [proofNote, setProofNote] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${api}/reseller/orders/${token}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Pesanan tidak ditemukan');
        setOrder(body.data);
      })
      .catch((cause) => setError(cause.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function uploadProof(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setProofBusy(true);
    setProofNote('');
    try {
      const form = new FormData();
      form.append('proof', file);
      const response = await fetch(`${api}/reseller/orders/${token}/proof`, { method: 'POST', body: form });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Bukti transfer gagal diunggah');
      setOrder((current) => current ? { ...current, payment_proof_path: body.data?.payment_proof_path || null } : current);
      setProofNote('Bukti transfer terkirim. Admin akan memverifikasi.');
    } catch (cause) {
      setProofNote(cause.message);
    } finally {
      setProofBusy(false);
      event.target.value = '';
    }
  }

  if (loading) {
    return <main style={pageStyle}><div style={shellStyle}><p>Memuat pesanan…</p></div></main>;
  }
  if (error || !order) {
    return (
      <main style={pageStyle}>
        <div style={shellStyle}>
          <div style={cardStyle}>
            <h1 style={{ margin: 0, fontSize: 18 }}>Pesanan tidak ditemukan</h1>
            <p style={{ margin: 0, fontSize: 13, color: T.muted }}>{error || 'Tautan tidak valid.'}</p>
            <a href="/lacak" style={linkStyle}>Lacak dengan nomor pesanan</a>
          </div>
        </div>
      </main>
    );
  }

  const currentIndex = STEPS.findIndex(([status]) => status === order.status);

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <a href="/" style={{ ...linkStyle, fontSize: 12 }}>← Katalog</a>
        <div style={cardStyle}>
          <h1 style={{ margin: 0, fontSize: 19 }}>{order.order_no}</h1>
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
            {shortDate(order.created_at)} · {STATUS_LABEL[order.status] || order.status} · {PAYMENT_LABEL[order.payment_status] || order.payment_status}
          </p>
          {order.status === 'rejected' && order.reject_reason && (
            <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>Alasan: {order.reject_reason}</p>
          )}
          {order.tracking_no && (
            <p style={{ margin: 0, fontSize: 13 }}>
              Kurir {order.courier || '-'} · Resi <strong>{order.tracking_no}</strong>
            </p>
          )}
        </div>

        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Status</h2>
          <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6, fontSize: 13 }}>
            {STEPS.map(([status, label], index) => (
              <li key={status} style={{ color: index <= currentIndex ? T.black : T.muted, fontWeight: index === currentIndex ? 700 : 400 }}>
                {label}
              </li>
            ))}
          </ol>
        </div>

        {['new', 'confirmed'].includes(order.status) && order.payment_status !== 'paid' && (
          <div style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Bukti transfer</h2>
            <p style={{ margin: 0, fontSize: 13, color: T.muted }}>
              Transfer sesuai total pesanan, lalu unggah bukti di sini (JPG/PNG/WebP, maks 5 MB).
            </p>
            {order.payment_proof_path && (
              <img
                src={order.payment_proof_path}
                alt="Bukti transfer yang sudah diunggah"
                style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.border}`, display: 'block' }}
              />
            )}
            <label style={{ ...linkStyle, display: 'inline-block', cursor: 'pointer' }}>
              {proofBusy ? 'Mengunggah…' : order.payment_proof_path ? 'Ganti bukti transfer' : 'Unggah bukti transfer'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadProof} disabled={proofBusy} style={{ display: 'none' }} />
            </label>
            {proofNote && <p style={{ margin: 0, fontSize: 13, color: T.muted }}>{proofNote}</p>}
          </div>
        )}
        {order.payment_proof_path && (order.payment_status === 'paid' || ['shipped', 'done'].includes(order.status)) && (
          <div style={cardStyle}>
            <h2 style={{ margin: 0, fontSize: 15 }}>Bukti transfer</h2>
            <img
              src={order.payment_proof_path}
              alt="Bukti transfer"
              style={{ width: '100%', borderRadius: 10, border: `1px solid ${T.border}`, display: 'block' }}
            />
            <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Pembayaran sudah diverifikasi admin.</p>
          </div>
        )}

        <div style={cardStyle}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Rincian</h2>
          {(order.items || []).map((item, index) => (
            <div key={`${item.name}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
              <span>
                {item.name}
                {item.variant ? ` · ${item.variant}` : ''}
                <br />
                <small style={{ color: T.muted }}>{item.quantity} × {rp(item.price)}</small>
              </span>
              <strong>{rp(item.subtotal)}</strong>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, display: 'grid', gap: 4, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Subtotal</span><span>{rp(order.subtotal)}</span></div>
            {Number(order.discount) > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Diskon</span><span>-{rp(order.discount)}</span></div>}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Ongkir</span><span>{rp(order.shipping_cost)}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Total</span><span>{rp(order.total)}</span></div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: 12, color: T.muted }}>
          Simpan tautan ini untuk memantau pesanan. Ada pertanyaan? Hubungi admin lewat WhatsApp.
        </p>
      </div>
    </main>
  );
}