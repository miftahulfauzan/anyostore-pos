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

// Pilihan tetap untuk kunci tertentu.
const CHOICES = {
  printer_size: [['58', '58 mm'], ['80', '80 mm']],
  receipt_font: [['b', 'Kecil (Font B)'], ['a', 'Normal (Font A)']],
  receipt_separator: [['dash', 'Garis strip'], ['blank', 'Baris kosong'], ['none', 'Tanpa pemisah']],
  receipt_margin: [['', 'Otomatis'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5']],
  landing_page_size: [['12', '12'], ['24', '24'], ['48', '48']],
  theme: [['green', 'Hijau'], ['blue', 'Biru'], ['purple', 'Ungu'], ['teal', 'Toska'], ['rose', 'Merah muda'], ['amber', 'Cokelat']],
  ongkir_provider: [['manual', 'Manual'], ['rajaongkir', 'RajaOngkir']],
};
const BOOLEAN_KEYS = new Set([
  'show_logo', 'show_qr', 'show_cashier', 'show_barcode', 'auto_print',
  'prices_include_tax', 'loyalty_enabled', 'low_stock_alert',
  'daily_email_enabled',
  'receipt_show_logo', 'receipt_show_address', 'receipt_show_wa', 'receipt_show_npwp',
  'receipt_show_cashier', 'receipt_show_customer', 'receipt_show_payment',
  'receipt_show_paid', 'receipt_show_change',
]);

function groupFor(row) {
  const named = GROUPS.find((group) => group.label !== 'Identitas toko' && group.match(row.key, row));
  return named ? named.label : (row.identity ? 'Identitas toko' : 'Lainnya');
}

const isTruthy = (value) => ['true', '1', 'ya'].includes(String(value ?? '').toLowerCase());

export default function BranchComparePage() {
  const { user } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [stores, setStores] = useState([]);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [rows, setRows] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selected, setSelected] = useState([]);
  const [onlyDifferent, setOnlyDifferent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copying, setCopying] = useState(false);
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
    try {
      const response = await fetch(`${api}/settings/compare?source_id=${source}&target_id=${target}`, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal membandingkan setelan');
      const data = body.data || {};
      setRows(data.rows || []);
      setDrafts(Object.fromEntries((data.rows || []).map((row) => [row.key, row.target ?? ''])));
      setSelected([]);
    } catch (loadError) {
      setError(loadError.message);
      setRows([]);
      setDrafts({});
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

  const dirtyKeys = useMemo(
    () => rows
      .filter((row) => row.editable && !row.identity && String(drafts[row.key] ?? '') !== String(row.target ?? ''))
      .map((row) => row.key),
    [rows, drafts],
  );

  const selectable = visible.filter((row) => row.editable && !row.identity);
  const differentCount = rows.filter((row) => !row.same).length;

  function storeName(id) {
    return stores.find((store) => String(store.id) === String(id))?.name || 'toko tujuan';
  }

  function toggle(key) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function toggleAll() {
    setSelected((current) => (current.length === selectable.length ? [] : selectable.map((row) => row.key)));
  }

  async function saveChanges() {
    if (!dirtyKeys.length) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = { branch_id: Number(target) };
      for (const key of dirtyKeys) {
        const value = drafts[key] ?? '';
        payload[key] = BOOLEAN_KEYS.has(key) ? (isTruthy(value) ? 'true' : 'false') : value;
      }
      const response = await fetch(api + '/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan setelan');
      setMessage(`${dirtyKeys.length} setelan disimpan ke ${storeName(target)}.`);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  async function copySelected() {
    if (!selected.length) {
      setError('Pilih minimal satu setelan yang mau disalin dari kolom sumber.');
      return;
    }
    setCopying(true);
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
      setMessage(`${copied.length} setelan disalin dari ${storeName(source)} ke ${storeName(target)}.`);
      await load();
    } catch (copyError) {
      setError(copyError.message);
    } finally {
      setCopying(false);
    }
  }

  function renderEditor(row) {
    const value = drafts[row.key] ?? '';
    const disabled = !isOwner || !row.editable || row.identity;
    if (CHOICES[row.key]) {
      return (
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => setDrafts({ ...drafts, [row.key]: event.target.value })}
        >
          {CHOICES[row.key].map(([optionValue, label]) => (
            <option key={optionValue} value={optionValue}>{label}</option>
          ))}
        </select>
      );
    }
    if (BOOLEAN_KEYS.has(row.key)) {
      return (
        <select
          value={isTruthy(value) ? 'true' : 'false'}
          disabled={disabled}
          onChange={(event) => setDrafts({ ...drafts, [row.key]: event.target.value })}
        >
          <option value="true">Ya</option>
          <option value="false">Tidak</option>
        </select>
      );
    }
    if (row.identity) {
      return <span>{row.target === '' ? <em className="muted">(kosong)</em> : row.target}</span>;
    }
    return (
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => setDrafts({ ...drafts, [row.key]: event.target.value })}
      />
    );
  }

  return (
    <AppShell title="Bandingkan Setelan" eyebrow="Pengaturan">
      <section className="panel landing-settings-head">
        <div>
          <h2>Setelan antar cabang</h2>
          <p className="muted">
            Bandingkan semua setelan dua cabang, lalu ubah langsung di kolom kanan atau salin dari cabang kiri.
            Identitas toko (nama, alamat, telepon, email, NPWP) tetap diatur di Pengaturan → Info Toko.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="branch-compare-pickers">
          <label>Sumber (pembanding)
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <span className="branch-compare-arrow" aria-hidden="true">→</span>
          <label>Tujuan (bisa diubah)
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
          <p className="muted" style={{ marginBottom: 0 }}>
            {differentCount} dari {rows.length} setelan berbeda.
            {dirtyKeys.length > 0 && ` ${dirtyKeys.length} perubahan belum disimpan.`}
          </p>
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
              {selected.length === selectable.length && selectable.length > 0 ? 'Batal pilih semua' : 'Pilih semua untuk disalin'}
            </button>
            <button type="button" className="secondary" onClick={copySelected} disabled={copying || !selected.length || !isOwner}>
              {copying ? 'Menyalin…' : `Salin ${selected.length || 0} setelan dari ${storeName(source)}`}
            </button>
            <button type="button" onClick={saveChanges} disabled={saving || !dirtyKeys.length || !isOwner}>
              {saving ? 'Menyimpan…' : `Simpan ${dirtyKeys.length || 0} perubahan ke ${storeName(target)}`}
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
                    <th>{storeName(target)} (bisa diubah)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => {
                    const dirty = dirtyKeys.includes(row.key);
                    return (
                      <tr key={row.key} className={dirty ? 'dirty' : (row.same ? 'same' : 'different')}>
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
                          {dirty && <span className="tag" style={{ marginLeft: 6 }}>diubah</span>}
                        </td>
                        <td>{row.source === '' ? <em className="muted">(kosong)</em> : row.source}</td>
                        <td className="branch-compare-value">{renderEditor(row)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </AppShell>
  );
}
