'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, LockKeyhole, Printer, Unlock } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';
import { openPrintView } from '../lib/print-utils';
import { storeNameFontSize } from '../lib/receipt-name';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const currentLocalDate = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};
const methodLabel = { cash: 'Kas', qris: 'QRIS', debit: 'Debit', transfer: 'Transfer', split: 'Split' };
const rp = (n) => {
  const v = Number(n || 0);
  return (v < 0 ? '-Rp' : 'Rp') + Math.abs(v).toLocaleString('id-ID');
};
const toNumber = (value) => {
  const digits = String(value ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
};
const longDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortStamp = (s) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s || '');
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const clock = (s) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

export default function ClosingPage() {
  const { user, activeBranchId, resolved } = useAppSession();
  const [tab, setTab] = useState('kas');
  const [date, setDate] = useState(currentLocalDate());
  const [data, setData] = useState(null);
  const [storeLogo, setStoreLogo] = useState('');
  const [printerSize, setPrinterSize] = useState('80');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(false);
  const selectedBranchQuery = activeBranchId === 'all' ? 'all' : activeBranchId;

  // Laci kas (operasional)
  const [cash, setCash] = useState(null);
  const [cashLoading, setCashLoading] = useState(true);
  const [cashError, setCashError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [openAmount, setOpenAmount] = useState('');
  const [moveType, setMoveType] = useState('cash-in');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [closeAmount, setCloseAmount] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [closedResult, setClosedResult] = useState(null);

  const branchForCash = user?.role === 'owner'
    ? (String(activeBranchId) === 'all' ? '' : String(activeBranchId || '') )
    : String(user?.branch_id || '');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setPreview(params.get('preview') === '1');
    const queryDate = params.get('date');
    if (/^\d{4}-\d{2}-\d{2}$/.test(queryDate || '')) setDate(queryDate);
    if (params.get('tab') === 'penutupan') setTab('penutupan');
  }, []);

  const loadCash = useCallback(async () => {
    if (!resolved || !user) { setCashLoading(false); return; }
    if (user.role === 'owner' && !branchForCash) {
      setCash(null);
      setCashLoading(false);
      setCashError('');
      return;
    }
    setCashLoading(true);
    setCashError('');
    try {
      const query = branchForCash && user.role === 'owner' ? `?branch_id=${encodeURIComponent(branchForCash)}` : '';
      const response = await fetch(`${api}/cash-drawer/current${query}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Kas tidak dapat dimuat');
      setCash(body.data || { drawer: null });
    } catch (error) {
      setCashError(error.message);
    } finally {
      setCashLoading(false);
    }
  }, [resolved, user, branchForCash]);

  useEffect(() => { loadCash(); }, [loadCash]);
  // Logo kepala nota (sama dengan cetak thermal: invoice_logo > store_logo,
  // dihormati show_logo=false). Mode "Semua Toko" tidak memakai logo.
  useEffect(() => {
    if (!resolved || !user) return;
    if (user.role === 'owner' && selectedBranchQuery === 'all') {
      setStoreLogo('');
      setPrinterSize('80');
      return;
    }
    const query = user.role === 'owner' && activeBranchId ? `?branch_id=${encodeURIComponent(activeBranchId)}` : '';
    fetch(`${api}/settings${query}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        const settings = body?.data || {};
        setPrinterSize(String(settings.printer_size || '80'));
        if (String(settings.show_logo ?? '').toLowerCase() === 'false') {
          setStoreLogo('');
          return;
        }
        const path = String(settings.invoice_logo || settings.store_logo || '').trim();
        if (!path) {
          setStoreLogo('');
          return;
        }
        setStoreLogo(/^https?:/i.test(path) ? path : api.replace('/api', '') + (path.startsWith('/') ? path : `/${path}`));
      })
      .catch(() => setStoreLogo(''));
  }, [resolved, user, activeBranchId, selectedBranchQuery]);


  useEffect(() => {
    if (!resolved || !user || !activeBranchId) return undefined;
    setData(null);
    setMessage('');
    const query = new URLSearchParams({ date });
    if (user.role === 'owner') {
      if (selectedBranchQuery === 'all') query.set('branch_id', 'all');
      else query.set('branch_id', activeBranchId);
    }
    const controller = new AbortController();
    fetch(`${api}/reports/daily-closing?${query.toString()}`, { headers: {}, signal: controller.signal })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setData(b.data); })
      .catch((e) => { if (e?.name !== 'AbortError') setMessage(e.message); });
    return () => controller.abort();
  }, [date, user, activeBranchId, resolved]);

  const drawer = cash?.drawer || null;
  const expectedCash = Number(cash?.expected_cash || 0);
  const closeActual = toNumber(closeAmount);
  const difference = drawer ? Math.round((closeActual - expectedCash) * 100) / 100 : 0;

  async function runCash(url, options, successMessage) {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch(url, options);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Permintaan gagal');
      setNotice(successMessage);
      return body.data;
    } catch (error) {
      setNotice(error.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function openDrawer() {
    if (toNumber(openAmount) < 0) return;
    const body = { opening_amount: toNumber(openAmount) };
    if (user?.role === 'owner' && branchForCash) body.branch_id = Number(branchForCash);
    const result = await runCash(`${api}/cash-drawer/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 'Kas berhasil dibuka.');
    if (result) {
      setOpenAmount('');
      setClosedResult(null);
      await loadCash();
    }
  }

  async function moveCash() {
    const value = toNumber(moveAmount);
    if (!value || !moveReason.trim()) {
      setNotice('Nominal dan alasan wajib diisi.');
      return;
    }
    const body = { amount: value, reason: moveReason.trim() };
    if (user?.role === 'owner' && branchForCash) body.branch_id = Number(branchForCash);
    const result = await runCash(`${api}/cash-drawer/${moveType}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, moveType === 'cash-in' ? 'Kas masuk dicatat.' : 'Kas keluar dicatat.');
    if (result) {
      setMoveAmount('');
      setMoveReason('');
      await loadCash();
    }
  }

  async function closeDrawer() {
    if (difference !== 0 && !closeNotes.trim()) {
      setNotice('Selisih kas wajib diberi alasan.');
      return;
    }
    const body = { actual_cash: toNumber(closeAmount), notes: closeNotes.trim() || undefined };
    if (user?.role === 'owner' && branchForCash) body.branch_id = Number(branchForCash);
    const result = await runCash(`${api}/cash-drawer/close`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 'Kas ditutup.');
    if (result) {
      setClosedResult(result);
      setCloseAmount('');
      setCloseNotes('');
      await loadCash();
      setTab('kas');
    }
  }

  const movements = cash?.movements || [];
  const canOpen = ['owner', 'manager', 'admin', 'kasir'].includes(user?.role);

  const receipt = useMemo(() => {
    const methods = data?.methods || {};
    const methodRows = (m, v) => {
      const isCash = m === 'cash';
      const rows = [
        { label: isCash ? 'Kas Penjualan' : 'Penjualan', value: v.sales },
        { label: isCash ? 'Kas Pengembalian' : 'Pengembalian', value: v.returns },
        { label: isCash ? 'Kas Pembatalan' : 'Batal', value: v.cancellations },
      ];
      if (isCash) rows.push({ label: 'Kas Masuk-Keluar', value: v.cash_in_out });
      return rows;
    };
    return { methods, methodRows };
  }, [data]);

  const actions = (
    <>
      <button type="button" className="button-link" onClick={() => setTab('penutupan')}>Penutupan</button>
      <a className="button-link" href="/dashboard">← Dasbor</a>
    </>
  );

  return (
    <AppShell title="Laci Kas" eyebrow="KASIR & PENUTUPAN" actions={actions}>
      <div className="closing-page">
        <div className="closing-tabs" role="tablist" aria-label="Laci kas dan penutupan">
          <button type="button" role="tab" aria-selected={tab === 'kas'} className={tab === 'kas' ? 'active' : ''} onClick={() => setTab('kas')}>Laci Kas</button>
          <button type="button" role="tab" aria-selected={tab === 'penutupan'} className={tab === 'penutupan' ? 'active' : ''} onClick={() => setTab('penutupan')}>Cetak Penutupan</button>
        </div>

        {tab === 'kas' ? (
          <>
            {notice && <p className="message" role="status">{notice}</p>}
            {cashError && <p className="message" role="alert">{cashError}</p>}

            {user?.role === 'owner' && !branchForCash ? (
              <section className="panel"><p>Pilih satu toko/gudang di header untuk membuka laci kas. Mode “Semua” tidak punya laci kas.</p></section>
            ) : (!resolved || !user || cashLoading) ? (
              <section className="panel"><p>Memuat laci kas…</p></section>
            ) : drawer ? (
              <div className="cash-grid">
                <section className="panel cash-status">
                  <div className="section-heading dashboard-panel-head">
                    <div className="section-head-main"><span className="section-accent" aria-hidden="true" /><h2>Kas terbuka</h2></div>
                    <span className="tag">sejak {clock(drawer.opened_at)}</span>
                  </div>
                  <div className="cash-figures">
                    <div><span>Modal awal</span><strong>{rp(drawer.opening_amount)}</strong></div>
                    <div><span>Kas seharusnya</span><strong>{rp(expectedCash)}</strong></div>
                  </div>
                  <div className="cash-actions">
                    <button type="button" className={moveType === 'cash-in' ? 'selected' : ''} onClick={() => setMoveType('cash-in')}><ArrowDownCircle aria-hidden="true" size={16} /> Kas masuk</button>
                    <button type="button" className={moveType === 'cash-out' ? 'selected' : ''} onClick={() => setMoveType('cash-out')}><ArrowUpCircle aria-hidden="true" size={16} /> Kas keluar</button>
                  </div>
                  <div className="cash-form">
                    <label>Nominal<input inputMode="numeric" value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} placeholder="0" /></label>
                    <label>Alasan<input value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder={moveType === 'cash-in' ? 'Setoran / tambah modal' : 'Ambil untuk belanja'} /></label>
                    <button type="button" onClick={moveCash} disabled={busy}>Catat</button>
                  </div>
                  {movements.length ? (
                    <div className="cash-movements">
                      <span className="cash-movements-title">Riwayat kas</span>
                      {movements.map((movement, index) => (
                        <div className="cash-movement" key={`${movement.created_at}-${index}`}>
                          <span>{clock(movement.created_at)}</span>
                          <span>{movement.reason}</span>
                          <strong className={movement.type === 'cash_in' ? 'positive' : 'negative'}>{movement.type === 'cash_in' ? '+' : '-'}{rp(movement.amount)}</strong>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="panel cash-close">
                  <div className="section-heading dashboard-panel-head">
                    <div className="section-head-main"><span className="section-accent dashboard-accent-orange" aria-hidden="true" /><h2>Tutup kas</h2></div>
                  </div>
                  <label>Kas aktual (dihitung)<input inputMode="numeric" value={closeAmount} onChange={(e) => setCloseAmount(e.target.value)} placeholder="0" /></label>
                  <div className="cash-diff">
                    <span>Selisih</span>
                    <strong className={difference === 0 ? '' : difference > 0 ? 'positive' : 'negative'}>{rp(difference)}</strong>
                  </div>
                  <label>Catatan{closeAmount && difference !== 0 ? ' (wajib)' : ''}<textarea rows={2} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} placeholder={difference !== 0 ? 'Alasan selisih kas' : 'Opsional'} /></label>
                  <button type="button" className="cash-close-button" onClick={closeDrawer} disabled={busy || !closeAmount}><LockKeyhole aria-hidden="true" size={16} /> Tutup kas</button>
                </section>
              </div>
            ) : (
              <section className="panel cash-open">
                <div className="section-heading dashboard-panel-head">
                  <div className="section-head-main"><span className="section-accent" aria-hidden="true" /><h2>Buka kas</h2></div>
                </div>
                <p className="muted">Belum ada laci kas terbuka untuk akun/toko ini. Masukkan modal awal untuk mulai mencatat penjualan tunai.</p>
                <div className="cash-form">
                  <label>Modal awal<input inputMode="numeric" value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="0" /></label>
                  <button type="button" onClick={openDrawer} disabled={busy || !canOpen}><Unlock aria-hidden="true" size={16} /> Buka kas</button>
                </div>
              </section>
            )}

            {closedResult ? (
              <section className="panel cash-result">
                <h2>Kas sudah ditutup</h2>
                <div className="cash-figures">
                  <div><span>Kas seharusnya</span><strong>{rp(closedResult.expected_cash)}</strong></div>
                  <div><span>Kas aktual</span><strong>{rp(closedResult.actual_cash)}</strong></div>
                  <div><span>Selisih</span><strong className={Number(closedResult.difference) === 0 ? '' : Number(closedResult.difference) > 0 ? 'positive' : 'negative'}>{rp(closedResult.difference)}</strong></div>
                </div>
                <div className="form-actions">
                  <a className="button-link" href={`/operations/closing/${closedResult.id}`}><Printer aria-hidden="true" size={15} /> Cetak penutupan kas</a>
                  <button type="button" className="secondary" onClick={() => setClosedResult(null)}>Tutup</button>
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <div className={`closing-wrap${preview ? ' closing-preview-mode' : ''}`}>
            <div className="no-print closing-toolbar">
              <label>Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <button type="button" onClick={() => openPrintView({ selector: '.closing-wrap', title: `Penutupan ${date}`, autoPrint: false })} disabled={!data}>Lihat PDF</button>
              <button type="button" onClick={() => openPrintView({ selector: '.closing-wrap', title: 'Penutupan Penjualan' })} disabled={!data}>Cetak Penutupan</button>
            </div>
            {message && <p className="message" role="status">{message}</p>}
            {user?.role === 'owner' && (activeBranchId === 'all' || activeBranchId == null) && !preview && <p className="muted no-print">Pilih satu toko untuk melihat rincian per toko; mode Semua tetap menampilkan gabungan.</p>}
            {!data && !message && <p>Memuat laporan…</p>}
            {data && (
              <main className="receipt">
                <article className={`receipt-paper${String(printerSize).startsWith('58') ? ' receipt-58mm' : ''}`}>
                  <header className="receipt-store">
                    {storeLogo && <img className="receipt-logo" src={storeLogo} alt={`Logo ${data.store}`} />}
                    <h1 className="receipt-store-name" style={{ fontSize: `${storeNameFontSize(data.store)}px` }}>{data.store}</h1>
                    <p className="receipt-store-tagline">{data.document}</p>
                    {data.store_address && <address><span>{data.store_address}</span></address>}
                  </header>

                  <section className="receipt-section receipt-invoice">
                    <h2>Informasi</h2>
                    <dl>
                      <div><dt>Tanggal</dt><dd>{longDate(data.date)}</dd></div>
                      <div><dt>Dicetak</dt><dd>{shortStamp(data.printed_at)}</dd></div>
                      <div><dt>Oleh</dt><dd>{data.printed_by}</dd></div>
                    </dl>
                  </section>

                  <section className="receipt-section">
                    <h2>Ringkasan</h2>
                    <div className="receipt-summary-row"><span>Resi</span><b>{data.receipt_count}</b></div>
                    <div className="receipt-summary-row"><span>Pengembalian</span><b>{data.return_count}</b></div>
                    <div className="receipt-summary-row strong"><span>Total Penjualan</span><b>{rp(data.total_sales)}</b></div>
                    <div className="receipt-summary-row"><span>Subtotal</span><b>{rp(data.subtotal)}</b></div>
                    <div className="receipt-summary-row"><span>Pengeluaran</span><b>{rp(data.expenses)}</b></div>
                    <div className="receipt-summary-row"><span>Pemasukan</span><b>{rp(data.income)}</b></div>
                  </section>

                  <section className="receipt-section">
                    <h2>Pembayaran</h2>
                    {Object.entries(receipt.methods).map(([m, v]) => (
                      <div key={m} className="closing-method">
                        <div className="receipt-summary-row strong"><span>{methodLabel[m] || m}</span><b>{rp(v.total)}</b></div>
                        <div className="receipt-payment-detail">
                          {receipt.methodRows(m, v).map((row) => (
                            <div key={row.label} className={`receipt-summary-row${Number(row.value) < 0 ? ' negative' : ''}`}><span>{row.label}</span><b>{rp(row.value)}</b></div>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!Object.keys(receipt.methods).length && <p>Belum ada transaksi pada tanggal ini.</p>}
                  </section>

                  <section className="receipt-section">
                    <div className="receipt-summary-row strong"><span>Total Diharapkan</span><b>{rp(data.expected_total)}</b></div>
                  </section>
                </article>
              </main>
            )}
          </div>
        )}
      </div>
      <style>{`
        .closing-method { margin-bottom: 12px; }
        .closing-method:last-child { margin-bottom: 0; }
        @media print {
          .closing-wrap { padding: 0 !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>
    </AppShell>
  );
}
