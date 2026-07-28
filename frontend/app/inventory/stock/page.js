'use client';

import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const money = (v) => Number(v || 0).toLocaleString('id-ID');

export default function StockReportPage() {
  const [products, setProducts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const token = () => localStorage.getItem('pos_access_token');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` });

  useEffect(() => { if (!token()) { window.location.assign('/'); } }, []);

  useEffect(() => {
    fetch(`${api}/products/categories`, { headers: headers() })
      .then((r) => r.json())
      .then((b) => setCategories(b.data || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({ ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}) }).toString();
    fetch(`${api}/inventory/stock-total?${qs}`, { headers: headers() })
      .then((r) => r.json())
      .then((b) => {
        if (!b.success) throw new Error(b.message);
        setProducts(b.data.products || []);
        setSummary(b.data.summary || null);
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, [cat, q]);

  return (
    <AppShell title="Laporan Stok" eyebrow="INVENTORY">
      <section className="form-page" style={{ maxWidth: 1100 }}>
        <div className="panel">
          {/* Summary cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ padding: 16, borderRadius: 8, background: 'var(--muted)', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Total Produk</p>
                <strong style={{ fontSize: 24 }}>{money(summary.total_products)}</strong>
              </div>
              <div style={{ padding: 16, borderRadius: 8, background: 'var(--muted)', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Total Stok</p>
                <strong style={{ fontSize: 24, color: 'var(--primary)' }}>{money(summary.total_stock)}</strong>
              </div>
              <div style={{ padding: 16, borderRadius: 8, background: summary.low_stock > 0 ? '#fef2f2' : 'var(--muted)', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Stok Rendah</p>
                <strong style={{ fontSize: 24, color: summary.low_stock > 0 ? '#dc2626' : 'inherit' }}>{money(summary.low_stock)}</strong>
              </div>
              <div style={{ padding: 16, borderRadius: 8, background: summary.out_of_stock > 0 ? '#fef2f2' : 'var(--muted)', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 11, color: 'var(--muted-foreground)' }}>Habis</p>
                <strong style={{ fontSize: 24, color: summary.out_of_stock > 0 ? '#dc2626' : 'inherit' }}>{money(summary.out_of_stock)}</strong>
              </div>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input placeholder="Cari nama/SKU…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180, minHeight: 40 }} />
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ minWidth: 150, minHeight: 40 }}>
              <option value="">Semua kategori</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {message && <p className="message" role="status">{message}</p>}

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 10px' }}>Produk</th>
                  <th style={{ padding: '8px 10px' }}>SKU</th>
                  <th style={{ padding: '8px 10px' }}>Kategori</th>
                  <th style={{ padding: '8px 10px' }}>Warna</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Min</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stok</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Reserved</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>Tersedia</th>
                  <th style={{ padding: '8px 10px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading && Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}><td colSpan={9} style={{ padding: 10, color: 'var(--muted-foreground)' }}>Memuat…</td></tr>
                ))}
                {!loading && products.map((p) => {
                  const stock = Number(p.total_stock || 0);
                  const min = Number(p.min_stock || 0);
                  const reserved = Number(p.reserved || 0);
                  const available = stock - reserved;
                  const colors = (p.colors || '').split('|').filter(Boolean);
                  const isLow = stock > 0 && stock <= min;
                  const isOut = stock === 0;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', background: isOut ? '#fef2f2' : isLow ? '#fffbeb' : 'transparent' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{p.name}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: 'var(--muted-foreground)' }}>{p.sku || '-'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--muted-foreground)' }}>{p.category_name || '-'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {colors.map((c) => <span key={c} style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--muted)', fontSize: 10 }}>{c}</span>)}
                          {!colors.length && <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>-</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{money(min)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700 }}>{money(stock)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--muted-foreground)' }}>{money(reserved)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{money(available)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {isOut ? <span className="status pending">Habis</span> : isLow ? <span className="status pending">Rendah</span> : <span className="status paid">Aman</span>}
                      </td>
                    </tr>
                  );
                })}
                {!loading && !products.length && (
                  <tr><td colSpan={9} style={{ padding: 20, textAlign: 'center', color: 'var(--muted-foreground)' }}>Tidak ada data stok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
