'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function InventoryPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [warehouse, setWarehouse] = useState('');
  const [stock, setStock] = useState([]);
  const [message, setMessage] = useState('');
  const headers = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });
  async function load(id) {
    if (!id) return;
    const response = await fetch(api + '/inventory/stock?warehouse_id=' + id, { headers: headers() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    setStock(body.data);
  }
  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/inventory/warehouses', { headers: headers() }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setWarehouses(body.data);
      const id = String(body.data[0]?.id || '');
      setWarehouse(id);
      load(id);
    }).catch((error) => setMessage(error.message));
  }, []);

  const products = useMemo(() => {
    const grouped = new Map();
    stock.forEach((item) => {
      const current = grouped.get(item.product_id) || { id: item.product_id, name: item.name, sku: item.sku, standardStock: null, variants: [] };
      if (item.variant_id) current.variants.push(item);
      else current.standardStock = item;
      grouped.set(item.product_id, current);
    });
    return Array.from(grouped.values());
  }, [stock]);

  return <AppShell title="Stok Produk" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory/opname">Stok Opname</a>}><section className="panel inventory-panel"><label>Gudang<select value={warehouse} onChange={(event) => { setWarehouse(event.target.value); load(event.target.value).catch((error) => setMessage(error.message)); }}>{warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="muted">Produk tanpa varian memakai stok produk. Produk berwarna menampilkan stok setiap warna secara terpisah.</p>{message && <p className="message">{message}</p>}<div className="inventory-list">{products.map((product) => <article key={product.id} className="inventory-product"><header><div><strong>{product.name}</strong><span>{product.sku || 'Tanpa SKU'}</span></div>{product.variants.length > 0 ? <b>{product.variants.reduce((total, item) => total + Number(item.quantity), 0)} total varian</b> : <b>{product.standardStock?.quantity || 0} stok</b>}</header>{product.variants.length > 0 ? <div className="inventory-variants">{product.variants.map((variant) => <div key={variant.variant_id}><span className="inventory-color">{variant.variant_color}</span><strong>{variant.quantity}</strong><small>{variant.reserved_quantity} dialokasikan</small></div>)}{product.standardStock && Number(product.standardStock.quantity) > 0 && <p className="unallocated-stock">Stok umum {product.standardStock.quantity} belum dialokasikan ke warna.</p>}</div> : <div className="inventory-standard"><span>Stok produk</span><strong>{product.standardStock?.quantity || 0}</strong><small>{product.standardStock?.reserved_quantity || 0} dialokasikan</small></div>}</article>)}{!products.length && <p>Belum ada stok di gudang ini.</p>}</div></section></AppShell>;
}
