'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import BarcodeLabel from '../../components/BarcodeLabel';
import {
  barcodeItemKey,
  getBarcodeCopies,
  printBarcodeLabels,
  selectedBarcodeLabels,
  splitBarcodeLabels,
  summarizeBarcodeSelection,
  updateBarcodeSelection,
} from '../../components/barcodeSheets';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function BarcodePage() {
  const [items, setItems] = useState([]);
  const [selection, setSelection] = useState([]);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const headers = () => ({});

  async function load(keyword = '') {
    setLoading(true);
    const seq = ++loadSeq.current;
    try {
      const query = keyword.trim() ? '?search=' + encodeURIComponent(keyword.trim()) : '';
      const response = await fetch(api + '/inventory/barcode-items' + query, { headers: headers() });
      const body = await response.json();
      if (seq !== loadSeq.current) return;
      if (!response.ok) throw new Error(body.message || 'Data barcode tidak dapat dimuat');
      setMessage('');
      setItems(body.data || []);
    } catch (error) { if (seq === loadSeq.current) setMessage(error.message); }
    finally { if (seq === loadSeq.current) setLoading(false); }
  }

  useEffect(() => {
    /* sesi via httpOnly cookie */
    load().catch(() => {});
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => load(search), 280);
    return () => window.clearTimeout(timer);
  }, [search]);

  const chosen = useMemo(() => selectedBarcodeLabels(selection), [selection]);
  const printSheets = useMemo(() => splitBarcodeLabels(chosen), [chosen]);
  const selectionSummary = useMemo(() => summarizeBarcodeSelection(selection), [selection]);
  function setCopies(item, value) {
    setSelection((current) => updateBarcodeSelection(current, item, value));
  }

  return <AppShell title="Cetak Barcode" eyebrow="PRODUK & INVENTORI" actions={<button type="button" onClick={printBarcodeLabels} disabled={!chosen.length}>{chosen.length ? `Cetak ${chosen.length} label · ${selectionSummary.sheetCount} lembar A6` : 'Cetak label'}</button>}>
    <section className="panel barcode-picker">
      <div className="section-heading"><div><h2>Pilih label produk</h2><p>Isi jumlah pada beberapa produk atau warna. Pilihan tetap tersimpan saat Anda mencari produk lain. Label dicetak berurutan, maksimal 24 label (3 × 8) per lembar A6. Barcode varian diprioritaskan, lalu barcode atau SKU produk.</p></div></div>
      <div className="barcode-selection-summary" aria-live="polite">
        <span>{selectionSummary.productCount} jenis · {selectionSummary.totalLabels} label · {selectionSummary.sheetCount} lembar A6</span>
        {selectionSummary.totalLabels > 0 && <button type="button" className="barcode-clear-selection" onClick={() => setSelection([])}>Kosongkan pilihan</button>}
      </div>
      <label className="catalog-search">Cari produk, SKU, barcode, atau warna<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Contoh: A100 atau Denim" /></label>
      {message && <p className="message" role="alert">{message} <button type="button" onClick={() => load(search)}>Coba lagi</button></p>}
      <div className="table-wrap"><table><thead><tr><th>Produk / warna</th><th>Nilai barcode</th><th>Harga</th><th>Jumlah label</th></tr></thead><tbody>{items.map((item) => {
        const key = barcodeItemKey(item);
        return <tr key={key}><td><strong>{item.name}</strong><small>{item.product_sku || 'Tanpa SKU'}{item.variant_color ? ' · ' + item.variant_color : ''}</small></td><td><code>{item.barcode_value}</code></td><td>Rp{Number(item.price || 0).toLocaleString('id-ID')}</td><td><input className="copies-input" aria-label={'Jumlah label ' + item.name + ' ' + (item.variant_color || '')} type="number" min="0" max="99" value={getBarcodeCopies(selection, item)} onChange={(event) => setCopies(item, event.target.value)} /></td></tr>;
      })}{loading && !items.length && <tr><td colSpan="4" className="empty-table" role="status">Memuat daftar produk...</td></tr>}{!loading && !message && !items.length && <tr><td colSpan="4" className="empty-table">Tidak ada produk dengan SKU atau barcode.</td></tr>}</tbody></table></div>
    </section>
    <section className="barcode-print-area" aria-label="Pratinjau label barcode">{printSheets.map((sheet, sheetIndex) => <div className="barcode-print-sheet" key={`sheet-${sheetIndex}`}>{sheet.map((item, index) => <BarcodeLabel key={item.product_id + '-' + (item.variant_id || 0) + '-' + (sheetIndex * 24 + index)} item={item} />)}</div>)}</section>
  </AppShell>;
}
