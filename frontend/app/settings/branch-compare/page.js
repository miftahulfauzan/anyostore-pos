'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession } from '../../components/AppStateProvider';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const headers = () => ({ 'Content-Type': 'application/json' });

// Kelompok tampilan supaya daftar setelan mudah dibaca.
const GROUPS = [
  { label: 'Template & teks struk', match: (key) => key.startsWith('receipt_') || key === 'show_logo' },
  { label: 'Printer & dokumen', match: (key) => ['printer_size', 'auto_print', 'invoice_prefix', 'order_prefix'].includes(key) },
  { label: 'Landing & ongkir', match: (key) => key.startsWith('landing_') || key.startsWith('min_order') || key.startsWith('ongkir_') || key.startsWith('rajaongkir_') },
  { label: 'WhatsApp', match: (key) => key.startsWith('whatsapp') },
  { label: 'Pajak & harga', match: (key) => ['tax_rate', 'prices_include_tax', 'loyalty_enabled', 'loyalty_points_rate', 'loyalty_points_value'].includes(key) },
  { label: 'Notifikasi & email', match: (key) => key.startsWith('low_stock') || key.startsWith('daily_email_') },
  { label: 'Identitas toko', match: (key, row) => row?.identity },
];

function groupFor(row) {
  const named = GROUPS.find((group) => group.label !== 'Identitas toko' && group.match(row.key, row));
  return named ? named.label : (row.identity ? 'Identitas toko' : 'Lainnya');
}

export default function BranchComparePage() {
  const { user } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [stores, setStores] = useState([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [onlyDifferent, setOnlyDifferent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(api + '/settings/branches', { headers: headers() });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Gagal memuat cabang');
        const list = Array.isArray(body.data) ? body.data : [];
        setStores(list);
        if (list.length >= 2) {
          setSource(String(list[0].id));
          setTarget(String(list[1].id));
        }
      } catch (loadError) {
        setError(loadError.message);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!source || !target || source === target) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`${api}/settings/compare?source_id=${source}&target_id=${target}`, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal membandingkan setelan');
      setRows(body.data?.rows || []);
      setSelected([]);
    } catch (loadError) {
      setError(loadError.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [source, target]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => rows.filter((row) => (onlyDifferent ? !row.same : true)),
    [rows, onlyDifferent],
  );

  const grouped = useMemo(() => {
    const map = new Map();
    for (const row of visible) {
      const label = groupFor(row);
      if (!map.has(label)) map.set(label, []);
      map.get(label).push(row);
    }
    const order = [...GROUPS.map((group) => group.label), 'Lainnya'];
    return [...map.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [visible]);

  const selectable = visible.filter((row) => row.editable && !row.identity);
  const differentCount = rows.filter((row) => !row.same).length;

  function toggle(key) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function toggleAll() {
    setSelected((current) => (current.length === selectable.length ? [] : selectable.map((row) => row.key)));
  }

  async function apply() {
    if (!selected.length) {
      setError('Pilih minimal satu setelan yang mau disalin.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(api + '/settings/compare/apply', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ source_id: Number(source), target_id: Number(target), keys: selected }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyalin setelan');
      const copied = body.data?.copied || [];
      setMessage(`${copied.length} setelan disalin ke ${rows.length ? storeName(target) : 'tujuan'}.`);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function storeName(id) {
    return stores.find((store) => String(store.id) === String(id))?.name || 'toko tujuan';
  }

  return (
    <AppShell title="Bandingkan Setelan Cabang" eyebrow="Pengaturan">
      <section className="panel landing-settings-head">
        <div>
          <h2>Setelan antar cabang</h2>
          <p className="muted">Lihat semua setelan yang bisa diatur di Pengaturan untuk dua cabang, lalu salin yang Anda mau. Identitas toko (nama, alamat, telepon, email, NPWP) sengaja tidak ikut supaya tiap cabang tetap punya identitasnya sendiri.</p>
        </div>
      </section>

      <section className="panel">
        <div className="branch-compare-pickers">
          <label>Sumber (contoh)
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <span className="branch-compare-arrow" aria-hidden="true">→</span>
          <label>Tujuan (disamakan)
            <select value={target} onChange={(event) => setTarget(event.target.value)}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label className="receipt-toggle" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={onlyDifferent} onChange={(event) => setOnlyDifferent(event.target.checked)} />
            Hanya yang berbeda
          </label>
        </div>
        {!isOwner && <p className="message error">Hanya owner yang dapat membandingkan setelan cabang.</p>}
        {source === target && <p className="message error">Cabang sumber dan tujuan tidak boleh sama.</p>}
        {loading && <p className="muted">Membandingkan setelan…</p>}
        {!loading && !!rows.length && (
          <p className="muted" style={{ marginBottom: 0 }}>{differentCount} dari {rows.length} setelan berbeda.</p>
        )}
      </section>

      {message && <p className="message" role="status">{message}</p>}
      {error && <p className="message error" role="alert">{error}</p>}

      {!loading && !rows.length && !error && !!source && !!target && source !== target && (
        <p className="muted">Tidak ada setelan tersimpan di kedua cabang.</p>
      )}

      {!!grouped.length && (
        <section className="panel">
          <div className="branch-compare-toolbar">
            <button type="button" className="secondary" onClick={toggleAll}>
              {selected.length === selectable.length && selectable.length > 0 ? 'Batal pilih semua' : 'Pilih semua yang berbeda'}
            </button>
            <button type="button" onClick={apply} disabled={saving || !selected.length || !isOwner}>
              {saving ? 'Menyalin…' : `Salin ${selected.length || ''} setelan ke ${storeName(target)}`.replace('  ', ' ')}
            </button>
          </div>

          {grouped.map(([label, items]) => (
            <div key={label} className="branch-compare-group">
              <h3>{label}</h3>
              <table className="branch-compare-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }} aria-label="Pilih" />
                    <th>Setelan</th>
                    <th>{storeName(source)}</th>
                    <th>{storeName(target)}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.key} className={row.same ? 'same' : 'different'}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${row.key}`}
                          checked={selected.includes(row.key)}
                          disabled={!row.editable || row.identity}
                          onChange={() => toggle(row.key)}
                        />
                      </td>
                      <td>
                        <code>{row.key}</code>
                        {row.identity && <span className="tag" style={{ marginLeft: 6 }}>identitas</span>}
                        {!row.editable && <span className="tag" style={{ marginLeft: 6 }}>khusus sistem</span>}
                      </td>
                      <td>{row.source === '' ? <span className="muted">(kosong)</span> : row.source}</td>
                      <td>
                        {row.target === '' ? <span className="muted">(kosong)</span> : row.target}
                        {row.missing && <span className="tag" style={{ marginLeft: 6 }}>belum ada</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </AppShell>
  );
}
