'use client';
import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import StockReportSection from './stock-view';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const TYPE_LABEL = { utama: 'Gudang Utama', cadangan: 'Gudang Cadangan', reject: 'Gudang Reject' };

export default function InventoryPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [message, setMessage] = useState('');
  const [canManageWh, setCanManageWh] = useState(false);
  const [showWhManage, setShowWhManage] = useState(false);
  const [newWh, setNewWh] = useState({ name: '', type: 'utama', description: '' });
  const headers = () => ({ Authorization: 'Bearer ' + localStorage.getItem('pos_access_token') });

  async function reloadWarehouses() {
    const resp = await fetch(api + '/inventory/warehouses/all', { headers: headers() });
    const bb = await resp.json();
    if (!resp.ok) throw new Error(bb.message);
    setWarehouses(bb.data || []);
  }

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) return window.location.assign('/');
    fetch(api + '/auth/me', { headers: headers() })
      .then((r) => r.json())
      .then((b) => { if (['owner', 'manager', 'admin', 'gudang'].includes(b?.data?.role)) setCanManageWh(true); })
      .catch(() => {});
    reloadWarehouses().catch((error) => setMessage(error.message));
  }, []);

  return <AppShell title="Stok Produk" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory/transfers">Transfer Stok</a>}>
    {canManageWh && (
      <div style={{ marginBottom: 12 }}>
        <button type="button" className="button-link" onClick={() => setShowWhManage((v) => !v)}>{showWhManage ? 'Tutup Kelola Gudang' : 'Kelola Gudang'}</button>
      </div>
    )}
    {showWhManage && (
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Kelola Gudang</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Nama gudang (misal: Gudang Reject)" value={newWh.name} onChange={(e) => setNewWh({ ...newWh, name: e.target.value })} style={{ flex: 1 }} />
            <select value={newWh.type} onChange={(e) => setNewWh({ ...newWh, type: e.target.value })}>
              <option value="utama">Gudang Utama</option>
              <option value="cadangan">Gudang Cadangan</option>
              <option value="reject">Gudang Reject (barang rusak/retur)</option>
            </select>
            <button type="button" onClick={async () => {
              try {
                const r = await fetch(api + '/inventory/warehouses', { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(newWh) });
                const b = await r.json();
                if (!r.ok) throw new Error(b.message);
                setMessage('Gudang "' + b.data.name + '" dibuat.');
                setNewWh({ name: '', type: 'utama', description: '' });
                reloadWarehouses();
              } catch (e) { setMessage(e.message); }
            }}>Tambah</button>
          </div>
          {warehouses.map((w) => (
            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: 13 }}>{w.branch_name ? `${w.branch_name} — ` : ''}{w.name}<small style={{ display: 'block', color: 'var(--muted-foreground)' }}>{TYPE_LABEL[w.type] || w.type}</small></span>
              <button type="button" className="button-link" style={{ minHeight: 28, padding: '0 8px', fontSize: 12 }} onClick={async () => {
                const next = prompt('Nama gudang baru:', w.name);
                if (!next?.trim() || next.trim() === w.name) return;
                try {
                  const r = await fetch(api + '/inventory/warehouses/' + w.id, { method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: next.trim(), type: w.type, description: w.description }) });
                  const b = await r.json();
                  if (!r.ok) throw new Error(b.message);
                  setMessage('Gudang diganti nama.');
                  reloadWarehouses();
                } catch (e) { setMessage(e.message); }
              }}>Rename</button>
              <button type="button" className="button-link" style={{ minHeight: 28, padding: '0 8px', fontSize: 12, color: '#dc2626' }} onClick={async () => {
                if (!confirm('Hapus gudang "' + w.name + '"?')) return;
                try {
                  const r = await fetch(api + '/inventory/warehouses/' + w.id, { method: 'DELETE', headers: headers() });
                  const b = await r.json();
                  if (!r.ok) throw new Error(b.message);
                  setMessage(b.message || 'Gudang dihapus.');
                  reloadWarehouses();
                } catch (e) { setMessage(e.message); }
              }}>Hapus</button>
            </div>
          ))}
        </div>
      </section>
    )}
    <StockReportSection />
    {message && <p className="message">{message}</p>}
  </AppShell>;
}
