'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History, PackageSearch } from 'lucide-react';
import { useParams } from 'next/navigation';
import AppShell from '../../../components/AppShell';
import { stockHistoryLabel, stockHistoryQuery } from '../../history/history-state.cjs';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const typeOptions = [
  { value: 'incoming', label: 'Stok masuk' },
  { value: 'outgoing', label: 'Stok keluar' },
  { value: 'opname', label: 'Opname' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'sale', label: 'Penjualan / retur' },
];

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function historyFilter(row, filter) {
  if (!filter) return true;
  if (filter === 'incoming') return Number(row.qty) > 0;
  if (filter === 'outgoing') return Number(row.qty) < 0;
  if (filter === 'opname') return row.reference_type === 'stock_opname';
  if (filter === 'transfer') return row.type === 'transfer_in' || row.type === 'transfer_out' || row.reference_type === 'inter_store_transfer' || row.reference_type === 'transfer';
  if (filter === 'sale') return row.type === 'sale' || row.type === 'sale_return';
  return true;
}

function rowTone(row) {
  if (row.reference_type === 'stock_opname') return { background: '#eff6ff', color: '#1d4ed8' };
  if (Number(row.qty) > 0) return { background: '#ecfdf5', color: '#047857' };
  return { background: '#fff1f2', color: '#be123c' };
}

export default function ProductHistoryPage() {
  const routeParams = useParams();
  const productId = Array.isArray(routeParams?.id) ? routeParams.id[0] : routeParams?.id;
  const [branchId, setBranchId] = useState('');
  const [product, setProduct] = useState(null);
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setBranchId(query.get('branch_id') || '');
  }, []);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setLoadingProduct(true);
    const query = branchId ? `?branch_id=${encodeURIComponent(branchId)}` : '';
    fetch(`${api}/products/${encodeURIComponent(productId)}${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Produk tidak dapat dimuat');
        setProduct(body.data);
      })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingProduct(false); });
    return () => controller.abort();
  }, [productId, branchId]);

  useEffect(() => {
    if (!productId) return;
    const controller = new AbortController();
    setLoadingHistory(true);
    const query = stockHistoryQuery(productId, branchId, page);
    fetch(`${api}/inventory/mutations?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Riwayat stok tidak dapat dimuat');
        setRows(body.data || []);
        setTotal(Number(body.total) || 0);
        setTotalPages(Math.max(1, Number(body.totalPages) || 1));
      })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    return () => controller.abort();
  }, [productId, branchId, page]);

  const visibleRows = useMemo(() => rows.filter((row) => historyFilter(row, filter)), [rows, filter]);
  const totalIn = rows.reduce((sum, row) => sum + (Number(row.qty) > 0 ? Number(row.qty) : 0), 0);
  const totalOut = rows.reduce((sum, row) => sum + (Number(row.qty) < 0 ? Math.abs(Number(row.qty)) : 0), 0);

  function changeFilter(value) {
    setFilter(value);
    setPage(1);
  }

  return (
    <AppShell
      title="Riwayat Produk"
      eyebrow="PRODUK & INVENTORI"
      actions={<a className="button-link" href="/products"><ArrowLeft size={15} /> Kembali ke produk</a>}
    >
      <div style={{ display: 'grid', gap: 16, maxWidth: 1200, margin: '0 auto' }}>
        <section className="panel" style={{ display: 'grid', gap: 14 }}>
          {loadingProduct && <p className="muted">Memuat produk…</p>}
          {!loadingProduct && product && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {product.photo_path ? <img src={`${api.replace('/api', '')}${product.photo_path}`} alt="" style={{ width: 56, height: 70, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} /> : <div style={{ width: 56, height: 70, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'var(--muted)', color: 'var(--muted-foreground)' }}><PackageSearch size={22} /></div>}
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, overflowWrap: 'anywhere' }}>{product.name}</h2>
                  <p className="muted" style={{ margin: '4px 0 0' }}>{product.sku || 'Tanpa SKU'}{product.category_name ? ` · ${product.category_name}` : ''}</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="button-secondary" href={`/products/${product.id}/edit${branchId ? `?branch_id=${encodeURIComponent(branchId)}` : ''}`}>Edit produk</a>
                <a className="button-secondary" href={`/inventory/mutations?product_id=${product.id}`}>Lihat semua mutasi</a>
              </div>
            </div>
          )}
          {message && <p className="message" role="alert">{message}</p>}
        </section>

        <section className="metrics-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <article className="metric-card"><span>Total riwayat</span><strong>{formatNumber(total)}</strong><small>catatan perubahan stok</small></article>
          <article className="metric-card"><span>Total masuk</span><strong style={{ color: '#047857' }}>+{formatNumber(totalIn)}</strong><small>pada halaman ini</small></article>
          <article className="metric-card"><span>Total keluar</span><strong style={{ color: '#be123c' }}>−{formatNumber(totalOut)}</strong><small>pada halaman ini</small></article>
        </section>

        <section className="panel" style={{ display: 'grid', gap: 14 }}>
          <div className="section-heading" style={{ alignItems: 'center', marginBottom: 0 }}>
            <div><h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><History size={19} /> Semua perubahan stok</h2><p>Masuk, keluar, opname, transfer, penjualan, dan retur produk.</p></div>
            <label style={{ minWidth: 190 }}>Filter jenis<select value={filter} onChange={(event) => changeFilter(event.target.value)}><option value="">Semua perubahan</option>{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          {loadingHistory && <p className="muted">Memuat riwayat…</p>}
          {!loadingHistory && !visibleRows.length && <div className="empty-state"><strong>Belum ada perubahan stok.</strong><span>Riwayat akan muncul setelah produk mengalami transaksi stok.</span></div>}
          {!loadingHistory && visibleRows.length > 0 && <div style={{ display: 'grid', gap: 10 }}>
            {visibleRows.map((row) => {
              const tone = rowTone(row);
              const qty = Number(row.qty || 0);
              return <article key={row.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) minmax(120px, 2fr) auto', gap: 14, alignItems: 'center', padding: '13px 14px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)' }}>
                <div style={{ display: 'grid', gap: 5 }}>
                  <span style={{ width: 'fit-content', padding: '4px 8px', borderRadius: 999, background: tone.background, color: tone.color, fontSize: 11, fontWeight: 800 }}>{stockHistoryLabel(row)}</span>
                  <strong style={{ fontSize: 12 }}>{formatDate(row.created_at)}</strong>
                  <small className="muted">{row.user_name || 'Sistem'}{row.branch_name ? ` · ${row.branch_name}` : ''}</small>
                </div>
                <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                  <strong>{row.warehouse_name || 'Gudang tidak tercatat'}{row.variant_color ? ` · ${row.variant_color}` : ''}</strong>
                  <small className="muted">Stok {row.stock_before == null ? '-' : formatNumber(row.stock_before)} → {row.stock_after == null ? '-' : formatNumber(row.stock_after)} · {row.reference_type || 'tanpa referensi'}{row.reference_id ? ` #${row.reference_id}` : ''}</small>
                  {row.notes && <small className="muted" style={{ overflowWrap: 'anywhere' }}>{row.notes}</small>}
                </div>
                <strong style={{ whiteSpace: 'nowrap', color: qty >= 0 ? '#047857' : '#be123c', fontSize: 17 }}>{qty > 0 ? '+' : ''}{formatNumber(qty)} pcs</strong>
              </article>;
            })}
          </div>}
          {!loadingHistory && totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className="muted">Halaman {page} dari {totalPages}</span>
            <div style={{ display: 'flex', gap: 8 }}><button type="button" className="button-secondary" disabled={page <= 1 || loadingHistory} onClick={() => setPage((value) => value - 1)}>Sebelumnya</button><button type="button" className="button-secondary" disabled={page >= totalPages || loadingHistory} onClick={() => setPage((value) => value + 1)}>Berikutnya</button></div>
          </div>}
        </section>
      </div>
      <style>{`
        @media (max-width: 700px) {
          .metrics-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 8px !important; }
          .metric-card { padding: 11px 9px !important; }
          .metric-card strong { font-size: 18px !important; }
          .metric-card span, .metric-card small { font-size: 10px !important; }
          .section-heading { align-items: stretch !important; }
          .section-heading label { min-width: 0 !important; }
          .panel article { grid-template-columns: 1fr auto !important; gap: 8px !important; }
          .panel article > div:nth-child(2) { grid-column: 1 / -1; }
        }
      `}</style>
    </AppShell>
  );
}
