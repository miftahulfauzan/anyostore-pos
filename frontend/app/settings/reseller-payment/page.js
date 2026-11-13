'use client';
import { useEffect, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession } from '../../components/AppStateProvider';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const emptyRow = () => ({ bank: '', number: '', holder: '' });

export default function ResellerPaymentSettingsPage() {
  const { user } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [rows, setRows] = useState([emptyRow()]);
  const [note, setNote] = useState('');
  const [qris, setQris] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        if (isOwner) {
          const response = await fetch(`${api}/settings/branches`);
          const body = await response.json();
          const list = (body.data || []).filter((store) => store.is_active !== false);
          setStores(list);
          if (list[0]) setBranch(String(list[0].id));
        }
      } catch (cause) {
        setError(cause.message);
      }
    })();
  }, [isOwner]);

  useEffect(() => {
    if (isOwner && !branch) return;
    (async () => {
      try {
        setError('');
        const query = branch ? `?branch_id=${branch}` : '';
        const response = await fetch(`${api}/settings${query}`);
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Gagal memuat setelan');
        const data = body.data || {};
        let parsed = [];
        try {
          const value = JSON.parse(data.payment_bank_accounts || '[]');
          parsed = Array.isArray(value) ? value : [];
        } catch { parsed = []; }
        setRows(parsed.length ? parsed.map((row) => ({ bank: row.bank || '', number: row.number || '', holder: row.holder || '' })) : [emptyRow()]);
        setNote(data.payment_note || '');
        setQris(data.payment_qris_image || '');
      } catch (cause) {
        setError(cause.message);
      }
    })();
  }, [branch, isOwner]);

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const cleaned = rows
        .map((row) => ({ bank: row.bank.trim(), number: row.number.trim(), holder: row.holder.trim() }))
        .filter((row) => row.bank && row.number);
      const response = await fetch(`${api}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: Number(branch) || undefined,
          payment_bank_accounts: JSON.stringify(cleaned),
          payment_note: note,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan');
      setMessage('Info pembayaran reseller tersimpan.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadQris(file) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Gagal membaca file'));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`${api}/settings/logo-data${branch ? `?branch_id=${branch}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: file.type, filename: file.name, data_url: dataUrl, key: 'payment_qris' }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal mengunggah QRIS');
      setQris(body.data.payment_qris_image);
      setMessage('Gambar QRIS tersimpan.');
    } catch (cause) {
      setError(cause.message);
    } finally {
      setUploading(false);
    }
  }

  async function removeQris() {
    try {
      const response = await fetch(`${api}/settings/logo?key=payment_qris_image${branch ? `&branch_id=${branch}` : ''}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menghapus QRIS');
      setQris('');
      setMessage('Gambar QRIS dihapus.');
    } catch (cause) {
      setError(cause.message);
    }
  }

  return (
    <AppShell title="Pembayaran Reseller" eyebrow="ADMINISTRASI">
      <section className="panel">
        <p style={{ marginTop: 0, fontSize: 'var(--fs-md)', color: '#475569' }}>
          Informasi ini tampil di halaman checkout reseller (reseller.anyostore.my.id) setelah pembeli mengisi alamat.
        </p>

        {isOwner && stores.length > 0 && (
          <label>
            Toko / Cabang
            <select value={branch} onChange={(event) => setBranch(event.target.value)}>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <h3 style={{ fontSize: 'var(--fs-md)' }}>Rekening bank</h3>
        {rows.map((row, index) => (
          <div key={index} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ flex: '1 1 110px' }}>
              Bank
              <input value={row.bank} onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, bank: event.target.value } : item)))} placeholder="BCA" />
            </label>
            <label style={{ flex: '2 1 180px' }}>
              Nomor rekening
              <input value={row.number} onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, number: event.target.value } : item)))} placeholder="0042813603" />
            </label>
            <label style={{ flex: '1 1 160px' }}>
              Atas nama
              <input value={row.holder} onChange={(event) => setRows(rows.map((item, i) => (i === index ? { ...item, holder: event.target.value } : item)))} placeholder="Nama pemilik rekening" />
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() => setRows(rows.length > 1 ? rows.filter((_, i) => i !== index) : [emptyRow()])}
            >
              Hapus
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setRows([...rows, emptyRow()])}>
          Tambah rekening
        </button>

        <h3 style={{ fontSize: 'var(--fs-md)' }}>QRIS (gambar statis)</h3>
        {qris ? (
          <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${api.replace('/api', '')}${qris}`} alt="QRIS" style={{ width: 160, border: '1px solid #e5e7eb', borderRadius: 8 }} />
            <button type="button" className="secondary" onClick={removeQris}>
              Hapus QRIS
            </button>
          </div>
        ) : (
          <p style={{ fontSize: 'var(--fs-sm)', color: '#475569' }}>Belum ada gambar QRIS.</p>
        )}
        <label className="button-link" style={{ cursor: 'pointer' }}>
          {uploading ? 'Mengunggah…' : qris ? 'Ganti gambar QRIS' : 'Unggah gambar QRIS'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: 'none' }}
            onChange={(event) => uploadQris(event.target.files?.[0])}
          />
        </label>

        <h3 style={{ fontSize: 'var(--fs-md)' }}>Catatan pembayaran</h3>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Kirim bukti transfer ke WhatsApp admin agar pesanan segera diproses."
        />

        <div className="row" style={{ gap: 8 }}>
          <button type="button" onClick={save} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
        {message && <p className="form-message" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
    </AppShell>
  );
}