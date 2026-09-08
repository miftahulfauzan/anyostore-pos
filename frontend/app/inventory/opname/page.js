'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function Opname() {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [stock, setStock] = useState([]);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const headers = () => ({ 'Content-Type': 'application/json' });

  async function load(id) {
    const response = await fetch(`${api}/inventory/stock?warehouse_id=${id}`, { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw Error(body.message);
    setStock(body.data.map((item) => ({ ...item, physical_stock: item.quantity })));
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

  const visibleStock = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return stock;
    return stock.filter((item) => `${item.name || ''} ${item.sku || ''}`.toLowerCase().includes(query));
  }, [search, stock]);

  async function save(event) {
    event.preventDefault();
    try {
      setSaving(true);
      const payload = {
        warehouse_id: Number(warehouse),
        notes,
        items: stock.map((item) => ({
          product_id: item.product_id,
          variant_id: item.variant_id,
          physical_stock: Number(item.physical_stock),
        })),
      };
      const response = await fetch(`${api}/inventory-control/opnames`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.message);
      setMessage(`Stok opname tersimpan. Total selisih: ${body.data.total_selisih}.`);
      load(warehouse);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  function changeWarehouse(event) {
    const id = event.target.value;
    setWarehouse(id);
    setSearch('');
    load(id).catch((error) => setMessage(error.message));
  }

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
                  <td><strong>{item.name}</strong><small>{item.sku}</small></td>
                  <td>{item.quantity}</td>
                  <td><input type="number" min="0" value={item.physical_stock} onChange={(event) => setStock((rows) => rows.map((row) => row === item ? { ...row, physical_stock: event.target.value } : row))} /></td>
                  <td>{Number(item.physical_stock || 0) - Number(item.quantity)}</td>
                </tr>)}
                {!visibleStock.length && <tr><td colSpan="4" className="opname-empty">Produk tidak ditemukan.</td></tr>}
              </tbody>
            </table>
          </div>
          <label>Catatan<textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="submit" disabled={saving || !stock.length}>{saving ? 'Menyimpan…' : 'Simpan stok opname'}</button>
        </form>
        {message && <p className="message">{message}</p>}
      </section>
    </AppShell>
  );
}
