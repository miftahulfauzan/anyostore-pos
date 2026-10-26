'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, FileSpreadsheet, Upload } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { useAppSession } from '../../components/AppStateProvider';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadErrors(errors) {
  const rows = [
    ['Sheet', 'Baris', 'Kolom', 'Masalah'],
    ...errors.map((error) => [error.sheet, error.row, error.field, error.message]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'error-excel-produk.csv';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatChange(value, field) {
  if (value === '' || value == null) return 'Kosong';
  if (field === 'Aktif') return value === true || value === 1 ? 'Ya' : value === false || value === 0 ? 'Tidak' : String(value);
  if (field.includes('Harga') || field === 'Modal') {
    const amount = Number(value);
    if (Number.isFinite(amount)) return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount);
  }
  return String(value);
}

function responseMessage(body, fallback) {
  return body?.message || fallback;
}

export default function ProductExcelPage() {
  const { user, resolved, activeBranchId } = useAppSession();
  const isOwner = user?.role === 'owner';
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [branchLoading, setBranchLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!resolved || !user) return undefined;
    const controller = new AbortController();
    setBranchLoading(true);
    fetch(`${apiUrl}/settings/branches`, { signal: controller.signal, credentials: 'include' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(responseMessage(body, 'Daftar cabang gagal dimuat.'));
        const active = (body.data || []).filter((branch) => branch.is_active === true || Number(branch.is_active) === 1);
        setBranches(active);
        if (isOwner) {
          const current = activeBranchId === 'all' ? '' : Number(activeBranchId) > 0 ? String(activeBranchId) : '';
          setBranchId(current);
        } else {
          setBranchId(String(user.branch_id || ''));
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setMessage(error.message || 'Daftar cabang gagal dimuat.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setBranchLoading(false);
      });
    return () => controller.abort();
  }, [resolved, user, isOwner, activeBranchId]);

  const selectedBranch = useMemo(() => branches.find((branch) => String(branch.id) === branchId), [branches, branchId]);
  const canUseExcel = resolved && Boolean(user) && !branchLoading && Boolean(branchId);

  function resetFileState(nextFile) {
    setFile(nextFile);
    setPreview(null);
    setResult(null);
    setMessage('');
  }

  async function downloadWorkbook() {
    if (!canUseExcel || busy) return;
    setBusy('download');
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/products/excel/export?branch_id=${encodeURIComponent(branchId)}`, { credentials: 'include' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(responseMessage(body, 'File Excel gagal diunduh.'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `anyostore-produk-${selectedBranch?.name || branchId}.xlsx`.replace(/[^a-zA-Z0-9._-]+/g, '-');
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setMessage(error.message || 'File Excel gagal diunduh.');
    } finally {
      setBusy('');
    }
  }

  async function sendWorkbook(endpoint) {
    const form = new FormData();
    form.append('branch_id', branchId);
    form.append('file', file);
    const response = await fetch(`${apiUrl}/products/excel/${endpoint}`, { method: 'POST', body: form, credentials: 'include' });
    const body = await response.json().catch(() => null);
    return { response, body };
  }

  async function previewWorkbook() {
    if (!file || !canUseExcel || busy) return;
    setBusy('preview');
    setMessage('');
    setPreview(null);
    setResult(null);
    try {
      const { response, body } = await sendWorkbook('preview');
      if (!response.ok) throw new Error(responseMessage(body, 'File gagal diperiksa.'));
      setPreview(body.data);
      if (body.data?.valid) setMessage('Pemeriksaan selesai. Periksa ringkasan sebelum menerapkan perubahan.');
      else setMessage('Ada data yang perlu diperbaiki. Belum ada perubahan yang disimpan.');
    } catch (error) {
      setMessage(error.message || 'File gagal diperiksa.');
    } finally {
      setBusy('');
    }
  }

  async function applyWorkbook() {
    if (!file || !preview?.valid || !preview.changed_count || !canUseExcel || busy) return;
    setBusy('apply');
    setMessage('');
    try {
      const { response, body } = await sendWorkbook('apply');
      if (!response.ok) {
        if (body?.data) setPreview(body.data);
        throw new Error(responseMessage(body, 'Perubahan gagal diterapkan. Tidak ada data yang disimpan.'));
      }
      setResult(body.data);
      setPreview(null);
      setMessage('Perubahan berhasil diterapkan.');
    } catch (error) {
      setMessage(error.message || 'Perubahan gagal diterapkan.');
    } finally {
      setBusy('');
    }
  }

  function handleFileChange(event) {
    const selected = event.target.files?.[0] || null;
    if (selected && !selected.name.toLowerCase().endsWith('.xlsx')) {
      resetFileState(null);
      setMessage('Pilih file .xlsx yang diunduh dari halaman ini.');
      event.target.value = '';
      return;
    }
    if (selected && selected.size > 8 * 1024 * 1024) {
      resetFileState(null);
      setMessage('Ukuran file maksimal 8 MB.');
      event.target.value = '';
      return;
    }
    resetFileState(selected);
  }

  const errorsToShow = preview?.errors || [];
  const changesToShow = preview?.changed_rows || [];

  return <AppShell title="Excel Massal Produk" eyebrow="KATALOG PRODUK" actions={<Link className="button-link" href="/products"><ArrowLeft size={16} /> Kembali ke Produk</Link>}>
    <div className="product-excel-page">
      <header className="product-excel-heading">
        <FileSpreadsheet size={26} aria-hidden="true" />
        <div>
          <h1>Ubah produk lewat Excel</h1>
          <p>Unduh katalog satu cabang, edit data, lalu periksa sebelum disimpan.</p>
        </div>
      </header>

      {message && <p className={`message ${result ? 'success' : ''}`} role={result || preview?.valid ? 'status' : 'alert'}>{message}</p>}

      <section className="panel product-excel-step">
        <div className="product-excel-step-title"><span>1</span><div><h2>Pilih cabang dan unduh file</h2><p>File hanya berisi satu cabang agar perubahan tidak tertukar.</p></div></div>
        {isOwner ? <label htmlFor="product-excel-branch">Cabang
          <select id="product-excel-branch" value={branchId} disabled={branchLoading || Boolean(busy)} onChange={(event) => { setBranchId(event.target.value); resetFileState(null); }}>
            <option value="">Pilih cabang</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label> : <p className="product-excel-branch">Cabang akun: <strong>{selectedBranch?.name || user?.branch_name || 'Cabang saya'}</strong></p>}
        <button type="button" className="product-excel-download" onClick={downloadWorkbook} disabled={!canUseExcel || Boolean(busy)}>
          <Download size={17} aria-hidden="true" />{busy === 'download' ? 'Menyiapkan file…' : 'Unduh file Excel'}
        </button>
      </section>

      <section className="panel product-excel-step">
        <div className="product-excel-step-title"><span>2</span><div><h2>Unggah file yang sudah diedit</h2><p>Gunakan file .xlsx dari langkah pertama. Maksimal 8 MB dan 5.000 baris per sheet.</p></div></div>
        <label className="product-excel-file-label" htmlFor="product-excel-file">File Excel (.xlsx)
          <input id="product-excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={Boolean(busy)} />
        </label>
        {file && <p className="product-excel-filename" role="status">Dipilih: <strong>{file.name}</strong> · {(file.size / 1024).toFixed(0)} KB</p>}
        <div className="product-excel-safety"><strong>Stok dan foto tetap aman.</strong><span>Excel mengubah data produk, varian, dan harga grosir. Baris yang dihapus dari file tidak menghapus data.</span></div>
        <button type="button" onClick={previewWorkbook} disabled={!file || !canUseExcel || Boolean(busy)}>
          <Upload size={17} aria-hidden="true" />{busy === 'preview' ? 'Memeriksa file…' : 'Periksa file'}
        </button>
      </section>

      {preview && <section className="panel product-excel-preview" aria-labelledby="product-excel-preview-title">
        <div className="product-excel-step-title"><span>3</span><div><h2 id="product-excel-preview-title">Pratinjau perubahan</h2><p>{preview.valid ? 'Semua data valid. Perubahan diterapkan sekaligus.' : 'Perbaiki error di file, lalu unggah ulang.'}</p></div></div>
        <div className="product-excel-counts" aria-label="Ringkasan baris Excel">
          {[
            ['Produk', preview.counts?.products],
            ['Varian', preview.counts?.variants],
            ['Harga grosir', preview.counts?.wholesale],
          ].map(([label, counts]) => <div key={label}><span>{label}</span><strong>{counts?.changed || 0} berubah</strong><small>{counts?.unchanged || 0} tetap · {counts?.total || 0} baris</small></div>)}
        </div>

        {preview.error_count > 0 && <div className="product-excel-errors" role="alert">
          <div className="product-excel-result-heading"><strong>{preview.error_count} error</strong><button type="button" className="secondary" onClick={() => downloadErrors(errorsToShow)}>Unduh daftar error</button></div>
          <div className="product-excel-table-wrap"><table><thead><tr><th>Sheet</th><th>Baris</th><th>Kolom</th><th>Masalah</th></tr></thead><tbody>
            {errorsToShow.slice(0, 100).map((error, index) => <tr key={`${error.sheet}-${error.row}-${error.field}-${index}`}><td>{error.sheet}</td><td>{error.row}</td><td>{error.field || 'Tidak diisi'}</td><td>{error.message}</td></tr>)}
          </tbody></table></div>
          {errorsToShow.length > 100 && <small>Menampilkan 100 error pertama. File CSV berisi semua error.</small>}
        </div>}

        {preview.valid && changesToShow.length > 0 && <div className="product-excel-changes">
          <h3>Perubahan yang ditemukan</h3>
          <div className="product-excel-table-wrap"><table><thead><tr><th>Sheet</th><th>Baris</th><th>Produk</th><th>Field</th><th>Sebelum</th><th>Sesudah</th></tr></thead><tbody>
            {changesToShow.map((row) => row.fields.map((field, index) => <tr key={`${row.sheet}-${row.row}-${field.field}`}>
              <td>{row.sheet}</td><td>{row.row}</td><td>{row.name}</td><td>{field.field}</td><td>{formatChange(field.before, field.field)}</td><td>{formatChange(field.after, field.field)}</td>
            </tr>))}
          </tbody></table></div>
          {preview.changed_count > changesToShow.length && <small>Menampilkan {changesToShow.length} dari {preview.changed_count} baris yang berubah.</small>}
        </div>}

        {preview.valid && preview.changed_count === 0 && <p className="product-excel-no-changes">Tidak ada perubahan. Data produk tetap sama.</p>}
        <div className="product-excel-apply-row">
          <button type="button" onClick={applyWorkbook} disabled={!preview.valid || !preview.changed_count || Boolean(busy)}>
            {busy === 'apply' ? 'Menyimpan…' : `Terapkan ${preview.changed_count || 0} perubahan`}
          </button>
          <span>Jika satu baris tidak valid, tidak ada perubahan yang disimpan.</span>
        </div>
      </section>}

      {result && <section className="panel product-excel-result" role="status">
        <h2>Perubahan tersimpan</h2>
        <p>{result.productsUpdated} produk, {result.variantsUpdated} varian, dan {result.wholesaleUpdated} harga grosir diperbarui.</p>
        <Link className="button-link" href="/products">Kembali ke daftar produk</Link>
      </section>}
    </div>
  </AppShell>;
}
