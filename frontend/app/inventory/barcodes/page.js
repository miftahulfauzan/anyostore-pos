'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/AppShell';
import { useAppSession } from '../../components/AppStateProvider';
import { createBranchQuery } from '../../components/app-state.cjs';
import BarcodeLabel from '../../components/BarcodeLabel';
import {
  A6_LAYOUT,
  barcodeItemKey,
  countBarcodeLabels,
  getFirstLabelPage,
  getSelectedBarcodeItems,
  printBarcodeItems,
} from '../../components/barcode-print.cjs';
import styles from './barcode-preview.module.css';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function BarcodePage() {
  const { user, activeBranchId, resolved } = useAppSession();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryVersion, setRetryVersion] = useState(0);
  const loadSeq = useRef(0);
  const previousBranch = useRef(null);

  const load = useCallback(async (query) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(api + '/inventory/barcode-items?' + query);
      const body = await response.json();
      if (seq !== loadSeq.current) return;
      if (!response.ok) throw new Error(body.message || 'Data barcode tidak dapat dimuat');
      setItems(body.data || []);
    } catch (error) {
      if (seq === loadSeq.current) {
        setItems([]);
        setMessage(error.message || 'Data barcode tidak dapat dimuat');
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const branch = user?.role === 'owner' ? activeBranchId : user?.branch_id;
    if (previousBranch.current !== null && previousBranch.current !== branch) {
      setItems([]);
      setSelected({});
    }
    previousBranch.current = branch;
  }, [activeBranchId, user?.branch_id, user?.role]);

  useEffect(() => {
    if (!resolved) return undefined;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(createBranchQuery(user?.role, activeBranchId));
      if (search.trim()) params.set('search', search.trim());
      load(params.toString());
    }, search.trim() ? 280 : 0);
    return () => {
      window.clearTimeout(timer);
      loadSeq.current += 1;
    };
  }, [activeBranchId, load, resolved, retryVersion, search, user?.role]);

  const selectedItems = useMemo(() => getSelectedBarcodeItems(items, selected), [items, selected]);
  const labelCount = useMemo(() => countBarcodeLabels(selectedItems), [selectedItems]);
  const firstSheet = useMemo(() => getFirstLabelPage(selectedItems), [selectedItems]);

  function setCopies(item, value) {
    const key = barcodeItemKey(item);
    const copies = Math.max(0, Math.min(99, Number(value) || 0));
    setSelected((current) => {
      if (!copies) {
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: { item, copies } };
    });
  }

  function printSelected() {
    try {
      printBarcodeItems(selectedItems);
    } catch (error) {
      setMessage(error.message || 'Lembar barcode gagal disiapkan.');
    }
  }

  const pageCount = Math.ceil(labelCount / A6_LAYOUT.labelsPerPage);

  return <AppShell title="Cetak Barcode" eyebrow="PRODUK & INVENTORI" actions={<button type="button" onClick={printSelected} disabled={!labelCount || loading}>{labelCount ? `Cetak ${labelCount} label · ${pageCount} lembar A6` : 'Cetak label'}</button>}>
    <section className="panel barcode-picker">
      <div className="section-heading"><div><h2>Pilih label produk</h2><p>Isi jumlah pada beberapa produk atau warna. Pilihan tetap tersimpan saat Anda mencari produk lain. Barcode varian diprioritaskan, lalu barcode/SKU produk.</p></div></div>
      <div className="barcode-selection-summary" aria-live="polite">
        <span>{Object.values(selected).filter(({ copies }) => Number(copies) > 0).length} jenis · {labelCount} label · {pageCount} lembar A6</span>
        {labelCount > 0 && <button type="button" className="barcode-clear-selection" onClick={() => setSelected({})}>Kosongkan pilihan</button>}
      </div>
      <label className="catalog-search">Cari produk, SKU, barcode, atau warna<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Contoh: A100 atau Denim" /></label>
      {message && <p className="message" role="alert">{message} <button type="button" onClick={() => setRetryVersion((current) => current + 1)}>Coba lagi</button></p>}
      <div className="table-wrap"><table><thead><tr><th>Produk / warna</th><th>Nilai barcode</th><th>Harga</th><th>Jumlah label</th></tr></thead><tbody>{items.map((item) => {
        const key = barcodeItemKey(item);
        return <tr key={key}><td><strong>{item.name}</strong><small>{item.product_sku || 'Tanpa SKU'}{item.variant_color ? ' · ' + item.variant_color : ''}</small></td><td><code>{item.barcode_value}</code></td><td>Rp{Number(item.price || 0).toLocaleString('id-ID')}</td><td><input className="copies-input" aria-label={'Jumlah label ' + item.name + ' ' + (item.variant_color || '')} type="number" min="0" max="99" value={selected[key]?.copies || 0} onChange={(event) => setCopies(item, event.target.value)} /></td></tr>;
      })}{loading && !items.length && <tr><td colSpan="4" className="empty-table" role="status">Memuat daftar produk…</td></tr>}{!loading && !message && !items.length && <tr><td colSpan="4" className="empty-table">Tidak ada produk dengan SKU atau barcode pada toko/gudang terpilih.</td></tr>}</tbody></table></div>
    </section>
    <section className="barcode-print-area" aria-label="Pratinjau label barcode">
      <div className={styles.previewHeading}>
        <div><h2>Pratinjau lembar A6 pertama</h2><p>24 label per lembar, 3 kolom × 8 baris. Ukuran label aktual {A6_LAYOUT.labelWidthMm.toLocaleString('id-ID')} × {A6_LAYOUT.labelHeightMm.toLocaleString('id-ID')} mm. Cetak pada Actual Size / 100%.</p></div>
        <span className="item-count">{labelCount} label · {pageCount} lembar</span>
      </div>
      {firstSheet.length ? <div className={styles.sheet} aria-label="Susunan 3 kolom dan 8 baris">
        <div className={styles.grid}>
          {firstSheet.map((item, index) => <BarcodeLabel key={item.product_id + '-' + (item.variant_id || 0) + '-' + index} item={item} />)}
        </div>
      </div> : <p className={styles.emptyPreview}>Tentukan jumlah label di atas untuk melihat susunan lembar cetak.</p>}
    </section>
  </AppShell>;
}
