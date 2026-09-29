'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { countedOpnameItems, createOpnameRows } from './opname-state.cjs';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function Opname() {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [stock, setStock] = useState([]);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const headers = () => ({ 'Content-Type': 'application/json' });

  async function load(id) {
    const response = await fetch(`${api}/inventory/stock?warehouse_id=${id}`, { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw Error(body.message);
    setStock(createOpnameRows(body.data));
  }

  async function loadHistory(id = warehouse) {
    if (!id) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const response = await fetch(`${api}/inventory-control/opnames?warehouse_id=${id}&limit=25`, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw Error(body.message);
      setHistory(body.data || []);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    fetch(`${api}/inventory/warehouses`, { headers: headers() })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.message);
        setWarehouses(body.data);
        const id = String(body.data[0]?.id || '');
        setWarehouse(id);
        if (id) load(id);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (warehouse) loadHistory(warehouse);
  }, [warehouse]);

  const visibleStock = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return stock;
    return stock.filter((item) => `${item.name || ''} ${item.sku || ''}`.toLowerCase().includes(query));
  }, [search, stock]);

  async function save(event) {
    event.preventDefault();
    let items;
    try {
      items = countedOpnameItems(stock);
    } catch (error) {
      setMessage(error.message);
      return;
    }
    if (!items.length) {
      setMessage('Isi stok fisik minimal satu produk sebelum menyimpan.');
      return;
    }
    try {
      setSaving(true);
      const payload = {
        warehouse_id: Number(warehouse),
        notes,
        items,
      };
      const response = await fetch(`${api}/inventory-control/opnames`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.message);
      setMessage(`Stok opname tersimpan. Total selisih: ${body.data.total_selisih}.`);
      await load(warehouse);
      await loadHistory(warehouse);
    } catch (error) {
      if (error?.message?.includes('Muat ulang')) {
        try {
          await load(warehouse);
          setMessage(`${error.message} Daftar stok sudah dimuat ulang; periksa kembali stok fisik lalu simpan lagi.`);
        } catch (reloadError) {
          setMessage(reloadError.message);
        }
      } else {
        setMessage(error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  function changeWarehouse(event) {
    const id = event.target.value;
    setWarehouse(id);
    setSearch('');
    setHistory([]);
    load(id).catch((error) => setMessage(error.message));
  }

  const opnameCount = stock.filter((item) => String(item.physical_stock ?? '').trim() !== '').length;
  const statusLabels = { approved: 'Disetujui', pending_approval: 'Menunggu persetujuan', rejected: 'Ditolak', draft: 'Draft' };

  return (
    <AppShell title="Stok Opname" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
      <section className="panel">
        <p className="muted">Masukkan stok fisik yang dihitung. Sistem otomatis mencatat selisih dan menyesuaikan stok.</p>
        <form onSubmit={save}>
          <div className="opname-controls">
            <label>
              Gudang / toko
              <select value={warehouse} onChange={changeWarehouse}>
                {warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              Cari produk
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari nama atau SKU..."
                aria-label="Cari produk berdasarkan nama atau SKU"
              />
            </label>
          </div>
          <div className="opname-search-meta" aria-live="polite">
            {search.trim() ? `${visibleStock.length} dari ${stock.length} produk` : `${stock.length} produk`}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produk</th><th>Stok sistem</th><th>Stok fisik</th><th>Selisih</th></tr></thead>
              <tbody>
                {visibleStock.map((item) => <tr key={`${item.product_id}-${item.variant_id || 0}`}>
                  <td><strong>{item.name}</strong><small>{item.sku}</small>{item.rack_position && <small>Posisi Rak: {item.rack_position}</small>}</td>
                  <td>{item.quantity}</td>
                  <td><input type="number" min="0" value={item.physical_stock} onChange={(event) => setStock((rows) => rows.map((row) => row === item ? { ...row, physical_stock: event.target.value } : row))} /></td>
                  <td>{Number(item.physical_stock || 0) - Number(item.quantity)}</td>
                </tr>)}
                {!visibleStock.length && <tr><td colSpan="4" className="opname-empty">Produk tidak ditemukan.</td></tr>}
              </tbody>
            </table>
          </div>
          <label>Catatan<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="submit" disabled={saving || !opnameCount}>{saving ? 'Menyimpan…' : 'Simpan stok opname'}</button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>
      <section className="panel opname-history">
        <div className="opname-history-heading">
          <div>
            <h2>Riwayat stok opname</h2>
            <p className="muted">Daftar pemeriksaan fisik dan selisih stok di gudang yang dipilih.</p>
          </div>
          <button type="button" className="button-secondary" onClick={() => loadHistory()} disabled={historyLoading || !warehouse}>
            {historyLoading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        {historyLoading && <p className="muted">Memuat riwayat…</p>}
        {!historyLoading && !history.length && <p className="opname-history-empty">Belum ada riwayat opname untuk gudang ini.</p>}
        {!historyLoading && history.length > 0 && <div className="opname-history-list">
          {history.map((row) => (
            <details key={row.id} className="opname-history-item">
              <summary>
                <span className="opname-history-main">
                  <strong>{String(row.opname_date || '').slice(0, 10)}</strong>
                  <span>{row.warehouse_name}{row.branch_name ? ` · ${row.branch_name}` : ''}</span>
                  <small>{row.created_by_name || 'Sistem'} · {row.item_count || row.total_items} produk</small>
                </span>
                <span className={`opname-difference ${Number(row.total_selisih) < 0 ? 'negative' : Number(row.total_selisih) > 0 ? 'positive' : 'neutral'}`}>
                  {Number(row.total_selisih) > 0 ? '+' : ''}{row.total_selisih || 0}
                </span>
              </summary>
              <div className="opname-history-detail">
                <div className="opname-history-meta">
                  <span>Status: {statusLabels[row.status] || row.status}</span>
                  <span>Total item: {row.total_items}</span>
                  {row.notes && <span>Catatan: {row.notes}</span>}
                </div>
                {(row.items || []).map((item) => (
                  <div key={`${row.id}-${item.product_id}-${item.variant_id || 0}`} className="opname-history-line">
                    <span><strong>{item.product_name}</strong><small>{item.product_sku}{item.variant_color ? ` · ${item.variant_color}` : ''}{item.variant_size ? ` · ${item.variant_size}` : ''}</small></span>
                    <span>{item.system_stock} → {item.physical_stock} <b className={Number(item.selisih) < 0 ? 'negative' : Number(item.selisih) > 0 ? 'positive' : ''}>({Number(item.selisih) > 0 ? '+' : ''}{item.selisih})</b></span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>}
      </section>
    </AppShell>
  );
}
