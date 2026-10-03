'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession, useUnsavedWork } from '../../components/AppStateProvider';
import { countedOpnameItems, createOpnameRows, mergeOpnameRows, opnameProductSubLabel } from './opname-state.cjs';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function Opname() {
  const { user, activeBranchId, requestActiveBranchChange } = useAppSession();
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [branchId, setBranchId] = useState('');
  const role = user?.role || '';
  const [stock, setStock] = useState([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const isOwner = role === 'owner';
  const branchOptions = useMemo(() => {
    const unique = new Map();
    for (const item of warehouses) {
      if (item.branch_id != null && !unique.has(String(item.branch_id))) {
        unique.set(String(item.branch_id), {
          id: String(item.branch_id),
          name: item.branch_name || 'Toko/gudang',
          type: item.branch_type,
        });
      }
    }
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [warehouses]);
  const visibleWarehouses = useMemo(() => isOwner
    ? warehouses.filter((item) => String(item.branch_id) === String(branchId))
    : warehouses, [warehouses, branchId, isOwner]);

  const headers = () => ({ 'Content-Type': 'application/json' });
  useUnsavedWork('stock-opname', stock.some((item) => String(item.physical_stock ?? '').trim() !== ''));

  async function load(id, { preservePhysical = false, signal } = {}) {
    const selectedWarehouse = warehouses.find((item) => String(item.id) === String(id));
    const query = new URLSearchParams({ warehouse_id: String(id) });
    if (role === 'owner' && selectedWarehouse?.branch_id) query.set('branch_id', String(selectedWarehouse.branch_id));
    const response = await fetch(`${api}/inventory/stock?${query}`, { headers: headers(), signal });
    const body = await response.json();
    if (!response.ok) throw Error(body.message);
    if (signal?.aborted) return;
    setStock((previous) => preservePhysical
      ? mergeOpnameRows(previous, body.data)
      : createOpnameRows(body.data));
  }

  async function loadHistory(id = warehouse) {
    if (!id) {
      setHistory([]);
      return;
    }
    setHistoryLoading(true);
    try {
      const selectedWarehouse = warehouses.find((item) => String(item.id) === String(id));
      const query = new URLSearchParams({ warehouse_id: String(id), limit: '25' });
      if (role === 'owner' && selectedWarehouse?.branch_id) query.set('branch_id', String(selectedWarehouse.branch_id));
      const response = await fetch(`${api}/inventory-control/opnames?${query}`, { headers: headers() });
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
    if (!role) return undefined;
    let active = true;
    const endpoint = isOwner ? '/inventory/warehouses/all' : '/inventory/warehouses';
    fetch(`${api}${endpoint}`, { headers: headers() })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw Error(body.message);
        return body.data || [];
      })
      .then((list) => {
        if (!active) return;
        setWarehouses(list);
        if (!isOwner) {
          const preferred = list.find((item) => item.type === 'utama') || list[0];
          setWarehouse(String(preferred?.id || ''));
        }
      })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [role, isOwner]);

  useEffect(() => {
    if (!isOwner) return;
    const selected = activeBranchId === 'all' ? '' : String(activeBranchId || '');
    setBranchId(selected);
    setWarehouse('');
    setStock([]);
    setHistory([]);
    setSearch('');
  }, [activeBranchId, isOwner]);

  useEffect(() => {
    if (!warehouse || !warehouses.length || (isOwner && !branchId)) return undefined;
    const controller = new AbortController();
    setStock([]);
    setStockLoading(true);
    load(warehouse, { signal: controller.signal })
      .catch((error) => { if (error.name !== 'AbortError') setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setStockLoading(false); });
    return () => controller.abort();
  }, [warehouse, warehouses, role, branchId, isOwner]);

  useEffect(() => {
    if (warehouse) loadHistory(warehouse);
  }, [warehouse, warehouses, role]);

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
      const selectedWarehouse = warehouses.find((item) => String(item.id) === String(warehouse));
      if (role === 'owner' && selectedWarehouse?.branch_id) payload.branch_id = Number(selectedWarehouse.branch_id);
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
          await load(warehouse, { preservePhysical: true });
          setMessage(`${error.message} Snapshot sudah diperbarui tanpa menghapus isian stok fisik; periksa kembali lalu simpan lagi.`);
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

  function changeBranch(event) {
    const id = event.target.value;
    if (!id || !requestActiveBranchChange(id)) return;
    setBranchId(id === 'all' ? '' : id);
    setWarehouse('');
    setSearch('');
    setStock([]);
    setHistory([]);
  }

  function changeWarehouse(event) {
    const id = event.target.value;
    setWarehouse(id);
    setSearch('');
    setStock([]);
    setHistory([]);
  }

  const opnameCount = stock.filter((item) => String(item.physical_stock ?? '').trim() !== '').length;
  const statusLabels = { approved: 'Disetujui', pending_approval: 'Menunggu persetujuan', rejected: 'Ditolak', draft: 'Draft' };

  return (
    <AppShell title="Stok Opname" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory">Lihat Stok</a>}>
      <section className="panel">
        <p className="muted">Masukkan stok fisik yang dihitung. Sistem otomatis mencatat selisih dan menyesuaikan stok.</p>
        <form onSubmit={save}>
          <div className="opname-controls">
            {isOwner && <label>Toko / gudang
              <select value={branchId || (activeBranchId === 'all' ? 'all' : '')} onChange={changeBranch} aria-label="Pilih toko atau gudang untuk opname">
                <option value="" disabled>Pilih toko/gudang</option>
                <option value="all">Semua toko/gudang (pilih satu lokasi untuk opname)</option>
                {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.type === 'gudang' ? 'Gudang' : 'Toko'} · {branch.name}</option>)}
              </select>
            </label>}
            <label>Gudang
              <select value={warehouse} onChange={changeWarehouse} disabled={isOwner && !branchId} aria-label="Pilih gudang untuk opname">
                <option value="">{isOwner && !branchId ? 'Pilih toko terlebih dahulu' : 'Pilih gudang'}</option>
                {visibleWarehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>Cari produk
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau SKU..." aria-label="Cari produk berdasarkan nama atau SKU" disabled={!warehouse} />
            </label>
          </div>
          {warehouse && <><div className="opname-search-meta" aria-live="polite">
            {search.trim() ? `${visibleStock.length} dari ${stock.length} item stok` : `${stock.length} item stok`}
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Produk</th><th>Stok sistem</th><th>Stok fisik</th><th>Selisih</th></tr></thead>
              <tbody>
                {visibleStock.map((item) => <tr key={`${item.product_id}-${item.variant_id || 0}`}>
                  <td><strong>{item.name}</strong>{opnameProductSubLabel(item) && <small>{opnameProductSubLabel(item)}</small>}{item.rack_position && <small>Posisi Rak: {item.rack_position}</small>}</td>
                  <td>{item.quantity}</td>
                  <td><input type="number" min="0" value={item.physical_stock} onChange={(event) => setStock((rows) => rows.map((row) => row === item ? { ...row, physical_stock: event.target.value } : row))} /></td>
                  <td>{Number(item.physical_stock || 0) - Number(item.quantity)}</td>
                </tr>)}
                {!visibleStock.length && <tr><td colSpan="4" className="opname-empty">Produk tidak ditemukan.</td></tr>}
              </tbody>
            </table>
          </div>
          <label>Catatan<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="submit" disabled={saving || stockLoading || !opnameCount}>{saving ? 'Menyimpan…' : stockLoading ? 'Memuat stok…' : 'Simpan stok opname'}</button>
          </>}
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
        {!warehouse && <p className="opname-history-empty">Pilih toko dan gudang untuk melihat riwayat opname.</p>}
        {warehouse && !historyLoading && !history.length && <p className="opname-history-empty">Belum ada riwayat opname untuk gudang ini.</p>}
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
