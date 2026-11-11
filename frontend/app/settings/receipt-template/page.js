'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession } from '../../components/AppStateProvider';
import {
  RECEIPT_SAMPLE,
  RECEIPT_TEMPLATE_DEFAULTS,
  buildReceiptPreview,
  isOn,
  receiptGrid,
} from '../../lib/receipt-preview';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const TEMPLATE_KEYS = Object.keys(RECEIPT_TEMPLATE_DEFAULTS);

const TOGGLES = [
  ['receipt_show_logo', 'Logo'],
  ['receipt_show_address', 'Alamat'],
  ['receipt_show_wa', 'Nomor WA'],
  ['receipt_show_npwp', 'NPWP'],
  ['receipt_show_cashier', 'Kasir'],
  ['receipt_show_customer', 'Pelanggan'],
  ['receipt_show_payment', 'Metode bayar'],
  ['receipt_show_paid', 'Dibayar'],
  ['receipt_show_change', 'Kembalian'],
];

const TEXT_FIELDS = [
  ['receipt_title_info', 'Judul informasi', 'INFORMASI TRANSAKSI'],
  ['receipt_title_products', 'Judul produk', 'PRODUK'],
  ['receipt_label_invoice', 'Label invoice', 'Invoice'],
  ['receipt_label_date', 'Label tanggal', 'Tanggal'],
  ['receipt_label_cashier', 'Label kasir', 'Kasir'],
  ['receipt_label_customer', 'Label pelanggan', 'Pelanggan'],
  ['receipt_label_subtotal', 'Label subtotal', 'Subtotal'],
  ['receipt_label_discount', 'Label diskon', 'Diskon'],
  ['receipt_label_total', 'Label total', 'Total'],
  ['receipt_label_paid', 'Label dibayar', 'Dibayar'],
  ['receipt_label_change', 'Label kembalian', 'Kembalian'],
];

export default function ReceiptTemplatePage() {
  const { user } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [form, setForm] = useState({ ...RECEIPT_TEMPLATE_DEFAULTS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const headers = () => ({ 'Content-Type': 'application/json' });

  const load = useCallback(async (branchId) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(api + '/settings' + (branchId ? `?branch_id=${branchId}` : ''), { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal memuat setelan struk');
      const data = body.data || {};
      const next = { ...RECEIPT_TEMPLATE_DEFAULTS };
      for (const key of TEMPLATE_KEYS) {
        if (data[key] !== undefined && data[key] !== null && data[key] !== '') next[key] = String(data[key]);
      }
      // Identitas toko hanya bisa diubah di Pengaturan → Info Toko.
      next.store_name = data.store_name || next.store_name;
      next.store_address = data.store_address || '';
      next.store_phone = data.store_phone || '';
      next.store_tax_id = data.store_tax_id || '';
      setForm(next);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(api + '/settings/branches', { headers: headers() });
        const body = await response.json();
        if (!active) return;
        const rows = Array.isArray(body.data) ? body.data : [];
        setStores(rows);
        const initial = rows[0] ? String(rows[0].id) : '';
        setBranch(initial);
        await load(initial);
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
          setLoading(false);
        }
      }
    })();
    return () => { active = false; };
  }, [load]);

  const preview = useMemo(() => buildReceiptPreview(form, RECEIPT_SAMPLE).join('\n'), [form]);
  const grid = useMemo(() => receiptGrid(form), [form]);

  async function save() {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const payload = { branch_id: Number(branch) };
      for (const key of TEMPLATE_KEYS) {
        if (['store_name', 'store_address', 'store_phone', 'store_tax_id', 'printer_size'].includes(key)) continue;
        payload[key] = form[key] ?? '';
      }
      payload.printer_size = form.printer_size || '80';
      const response = await fetch(api + '/settings', {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menyimpan template struk');
      setMessage('Template struk tersimpan. Aplikasi Android akan memakai setelan ini saat mencetak.');
      await load(branch);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  }

  function printPreview() {
    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) {
      setError('Popup diblokir browser. Izinkan popup untuk mencetak pratinjau.');
      return;
    }
    win.document.write(`<pre style="font-family:Menlo,Consolas,monospace;font-size:11px;line-height:1.45;white-space:pre;">${preview.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`);
    win.document.close();
    win.focus();
    win.print();
  }

  return (
    <AppShell title="Template Struk" eyebrow="Pengaturan">
      <section className="panel landing-settings-head">
        <div>
          <h2>Template struk thermal</h2>
          <p className="muted">Atur teks, baris yang tampil, dan gaya struk. Disimpan per cabang dan dibaca aplikasi Android saat mencetak. Tidak ada menu template di HP.</p>
        </div>
        <div className="landing-settings-actions">
          {isOwner && stores.length > 0 && (
            <label>Toko
              <select value={branch} onChange={(event) => { setBranch(event.target.value); load(event.target.value); }}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="secondary" onClick={printPreview}>Cetak pratinjau</button>
        </div>
      </section>

      {message && <p className="message" role="status">{message}</p>}
      {error && <p className="message error" role="alert">{error}</p>}
      {loading && <p className="muted">Memuat setelan struk…</p>}

      <div className="receipt-template-layout">
        <div className="receipt-template-form">
          <form className="panel" onSubmit={(event) => { event.preventDefault(); save(); }}>
            <h2>Bagian yang tampil</h2>
            <p className="muted" style={{ marginTop: 0 }}>Matikan untuk menyembunyikan baris dari struk.</p>
            <div className="receipt-toggle-grid">
              {TOGGLES.map(([key, label]) => (
                <label key={key} className="receipt-toggle">
                  <input
                    type="checkbox"
                    checked={isOn(form[key])}
                    onChange={(event) => setForm({ ...form, [key]: event.target.checked ? 'true' : 'false' })}
                  />
                  {label}
                </label>
              ))}
            </div>

            <h2 style={{ marginTop: '1.2rem' }}>Teks judul &amp; label</h2>
            <p className="muted" style={{ marginTop: 0 }}>Kosongkan untuk memakai teks bawaan.</p>
            <div className="receipt-text-grid">
              {TEXT_FIELDS.map(([key, label, placeholder]) => (
                <label key={key}>{label}
                  <input
                    value={form[key] ?? ''}
                    placeholder={placeholder}
                    onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                  />
                </label>
              ))}
            </div>

            <h2 style={{ marginTop: '1.2rem' }}>Teks sapaan, catatan &amp; penutup</h2>
            <label>Sapaan di bawah nama toko
              <input value={form.receipt_header ?? ''} onChange={(event) => setForm({ ...form, receipt_header: event.target.value })} placeholder="Terima kasih telah berbelanja" />
            </label>
            <label>Penutup
              <input value={form.receipt_closing ?? ''} onChange={(event) => setForm({ ...form, receipt_closing: event.target.value })} placeholder="Terima kasih, sampai jumpa lagi!" />
            </label>
            <label>Footer tambahan
              <input value={form.receipt_footer ?? ''} onChange={(event) => setForm({ ...form, receipt_footer: event.target.value })} placeholder="Opsional" />
            </label>
            <label>Catatan
              <textarea
                rows={2}
                value={form.receipt_note ?? ''}
                onChange={(event) => setForm({ ...form, receipt_note: event.target.value.split('\n').slice(0, 2).join('\n') })}
                placeholder="Barang yang sudah dibeli tidak dapat ditukar/dikembalikan"
              />
            </label>

            <h2 style={{ marginTop: '1.2rem' }}>Gaya tampilan</h2>
            <div className="two-fields">
              <label>Ukuran font
                <select value={form.receipt_font || 'b'} onChange={(event) => setForm({ ...form, receipt_font: event.target.value })}>
                  <option value="b">Kecil (Font B)</option>
                  <option value="a">Normal (Font A)</option>
                </select>
              </label>
              <label>Pemisah antar bagian
                <select value={form.receipt_separator || 'dash'} onChange={(event) => setForm({ ...form, receipt_separator: event.target.value })}>
                  <option value="dash">Garis strip (----)</option>
                  <option value="blank">Baris kosong</option>
                  <option value="none">Tanpa pemisah</option>
                </select>
              </label>
            </div>
            <div className="two-fields">
              <label>Margin kiri-kanan
                <select value={form.receipt_margin || ''} onChange={(event) => setForm({ ...form, receipt_margin: event.target.value })}>
                  <option value="">Otomatis ({String(form.printer_size).startsWith('58') ? 3 : 4} karakter)</option>
                  <option value="2">2 karakter</option>
                  <option value="3">3 karakter</option>
                  <option value="4">4 karakter</option>
                  <option value="5">5 karakter</option>
                </select>
              </label>
              <label>Lebar kertas
                <select value={form.printer_size || '80'} onChange={(event) => setForm({ ...form, printer_size: event.target.value })}>
                  <option value="80">80 mm</option>
                  <option value="58">58 mm</option>
                </select>
              </label>
            </div>
            <small className="muted">Identitas toko (nama, alamat, WA, NPWP, logo) diubah di Pengaturan → Info Toko.</small>

            <div className="form-actions">
              <button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Template'}</button>
            </div>
          </form>
        </div>

        <aside className="receipt-template-preview">
          <h2>Pratinjau</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            {grid.width} kolom · margin {grid.margin} · {String(form.printer_size).startsWith('58') ? '58 mm' : '80 mm'} · {String(form.receipt_font) === 'a' ? 'Font A' : 'Font B'}
          </p>
          <pre className="receipt-preview-paper">{preview}</pre>
        </aside>
      </div>
    </AppShell>
  );
}
