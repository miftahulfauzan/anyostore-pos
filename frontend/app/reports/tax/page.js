'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const money = (v) => Number(v || 0).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function TaxReportPage() {
  const [start, setStart] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; });
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [tab, setTab] = useState('ppn');
  const [ppn, setPpn] = useState(null);
  const [faktur, setFaktur] = useState(null);
  const [pph23, setPph23] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const token = () => localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

  useEffect(() => { if (!token()) { window.location.assign('/'); } }, []);

  async function fetchPpn() {
    setLoading(true); setMessage('');
    try {
      const r = await fetch(`${api}/tax/report?start=${start}&end=${end}`, { headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setPpn(b.data);
    } catch (e) { setMessage(e.message); } finally { setLoading(false); }
  }

  async function fetchFaktur() {
    setLoading(true); setMessage('');
    try {
      const r = await fetch(`${api}/tax/faktur-pajak?start=${start}&end=${end}`, { headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setFaktur(b.data);
    } catch (e) { setMessage(e.message); } finally { setLoading(false); }
  }

  async function fetchPph23() {
    setLoading(true); setMessage('');
    try {
      const r = await fetch(`${api}/tax/pph23?start=${start}&end=${end}`, { headers: headers() });
      const b = await r.json();
      if (!r.ok) throw new Error(b.message);
      setPph23(b.data);
    } catch (e) { setMessage(e.message); } finally { setLoading(false); }
  }

  function loadTab(t) {
    setTab(t);
    if (t === 'ppn' && !ppn) fetchPpn();
    else if (t === 'faktur' && !faktur) fetchFaktur();
    else if (t === 'pph23' && !pph23) fetchPph23();
  }

  function refresh() {
    if (tab === 'ppn') fetchPpn();
    else if (tab === 'faktur') fetchFaktur();
    else if (tab === 'pph23') fetchPph23();
  }

  return (
    <AppShell title="Laporan Pajak" eyebrow="PELAPORAN">
      <section className="form-page" style={{ maxWidth: 1100 }}>
        <div className="panel">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 16 }}>
            <label style={{ flex: 1, minWidth: 140 }}>
              Dari
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label style={{ flex: 1, minWidth: 140 }}>
              Sampai
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <button onClick={refresh} disabled={loading} style={{ minWidth: 100 }}>{loading ? 'Memuat…' : 'Muat'}</button>
          </div>

          <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            {[{ id: 'ppn', label: 'PPN (VAT)' }, { id: 'faktur', label: 'Faktur Pajak' }, { id: 'pph23', label: 'PPh 23' }].map((t) => (
              <button key={t.id} onClick={() => loadTab(t.id)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: tab === t.id ? '#1e3a5f' : 'transparent', color: tab === t.id ? '#fff' : '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{t.label}</button>
            ))}
          </div>

          {message && <p className="message" role="status">{message}</p>}

          {/* PPN Report */}
          {tab === 'ppn' && ppn && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 20 }}>
                <div className="panel" style={{ padding: 16 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>PPN Keluaran (dari Penjualan)</p>
                  <strong style={{ fontSize: 22, color: '#1e3a5f' }}>Rp{money(ppn.ppn_keluaran.ppn_amount)}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Dasar PPN: Rp{money(ppn.ppn_keluaran.ppn_base)} · {ppn.ppn_keluaran.transactions} transaksi</p>
                </div>
                <div className="panel" style={{ padding: 16 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>PPN Masukan (dari Pembelian)</p>
                  <strong style={{ fontSize: 22, color: '#16a34a' }}>Rp{money(ppn.ppn_masukan.ppn_amount)}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Dasar PPN: Rp{money(ppn.ppn_masukan.total_purchase)} · {ppn.ppn_masukan.orders} order</p>
                </div>
                <div className="panel" style={{ padding: 16, background: ppn.net_ppn > 0 ? '#fef2f2' : '#f0fdf4' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>PPN Net (terutang)</p>
                  <strong style={{ fontSize: 22, color: ppn.net_ppn > 0 ? '#dc2626' : '#16a34a' }}>Rp{money(ppn.net_ppn)}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>PPN Keluaran − PPN Masukan</p>
                </div>
              </div>

              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Breakdown per Bulan</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Bulan</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Transaksi</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Omset</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Dasar PPN</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>PPN Keluaran</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ppn.monthly.map((r) => (
                      <tr key={r.month} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.month}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{r.transactions}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>Rp{money(r.gross_sales)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>Rp{money(r.ppn_base)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: '#1e3a5f' }}>Rp{money(r.ppn_keluaran)}</td>
                      </tr>
                    ))}
                    {!ppn.monthly.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Tidak ada data</td></tr>}
                  </tbody>
                </table>
              </div>
              <p style={{ marginTop: 12, fontSize: 11, color: '#94a3b8' }}>Tarif PPN: {ppn.tax_rate}% · Harga {ppn.prices_include_tax ? 'sudah termasuk' : 'belum termasuk'} PPN</p>
            </div>
          )}

          {/* Faktur Pajak */}
          {tab === 'faktur' && faktur && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div className="panel" style={{ padding: 16, flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Total Faktur</p>
                  <strong style={{ fontSize: 22 }}>{faktur.total_faktur}</strong>
                </div>
                <div className="panel" style={{ padding: 16, flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Total PPN</p>
                  <strong style={{ fontSize: 22, color: '#1e3a5f' }}>Rp{money(faktur.total_ppn)}</strong>
                </div>
                <div className="panel" style={{ padding: 16, flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Toko</p>
                  <strong style={{ fontSize: 14 }}>{faktur.store?.name || '-'}</strong>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>NPWP: {faktur.store?.npwp || '-'}</p>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 8px' }}>#</th>
                      <th style={{ padding: '8px 8px' }}>No. Faktur</th>
                      <th style={{ padding: '8px 8px' }}>Tanggal</th>
                      <th style={{ padding: '8px 8px' }}>Pelanggan</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Bruto</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>PPN</th>
                      <th style={{ padding: '8px 8px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faktur.faktur.map((f) => (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px' }}>{f.no}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 11 }}>{f.faktur_no}</td>
                        <td style={{ padding: '6px 8px' }}>{f.date?.slice(0, 10)}</td>
                        <td style={{ padding: '6px 8px' }}>{f.customer}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>Rp{money(f.gross_amount)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#1e3a5f' }}>Rp{money(f.ppn_amount)}</td>
                        <td style={{ padding: '6px 8px' }}><span className={`status ${f.status === 'completed' ? 'paid' : 'pending'}`}>{f.status}</span></td>
                      </tr>
                    ))}
                    {!faktur.faktur.length && <tr><td colSpan={7} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Tidak ada faktur</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PPh 23 */}
          {tab === 'pph23' && pph23 && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <div className="panel" style={{ padding: 16, flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Total Pengeluaran</p>
                  <strong style={{ fontSize: 22 }}>{pph23.total_expenses}</strong>
                </div>
                <div className="panel" style={{ padding: 16, flex: 1, minWidth: 180 }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Total PPh 23</p>
                  <strong style={{ fontSize: 22, color: '#dc2626' }}>Rp{money(pph23.total_pph23)}</strong>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 8px' }}>#</th>
                      <th style={{ padding: '8px 8px' }}>Tanggal</th>
                      <th style={{ padding: '8px 8px' }}>Deskripsi</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Jumlah</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>PPh 23 ({pph23.pph23_rate}%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pph23.items.map((i) => (
                      <tr key={i.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 8px' }}>{i.no}</td>
                        <td style={{ padding: '6px 8px' }}>{i.date?.slice(0, 10)}</td>
                        <td style={{ padding: '6px 8px' }}>{i.description}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>Rp{money(i.amount)}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>Rp{money(i.pph23_amount)}</td>
                      </tr>
                    ))}
                    {!pph23.items.length && <tr><td colSpan={5} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>Tidak ada pengeluaran</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
