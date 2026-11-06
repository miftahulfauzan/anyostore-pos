'use client';

import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;
const isBlokB = (branch) => /(?:blok\s*b|toko\s*b)\b/i.test(String(branch?.name || ''));
const isMetro = (branch) => /^anyostore\s+metro$/i.test(String(branch?.name || '').trim());
const profiles = {
  blok_b: { label: 'Olsera Blok B → Toko B', start: '2024-01-01', end: '2026-10-20', matches: isBlokB },
  pgmta_metro: { label: 'Olsera PGMTA → Anyostore Metro', start: '2022-10-02', end: '2026-11-05', matches: isMetro },
};

export default function OlseraImportPage() {
  const [branches, setBranches] = useState([]);
  const [sourceProfile, setSourceProfile] = useState('pgmta_metro');
  const [branchId, setBranchId] = useState('');
  const [files, setFiles] = useState([]);
  const [mappings, setMappings] = useState({});
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [isOwner, setIsOwner] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [userResponse, branchResponse] = await Promise.all([
          fetch(`${api}/auth/me`),
          fetch(`${api}/settings/branches`),
        ]);
        const [userBody, branchBody] = await Promise.all([userResponse.json(), branchResponse.json()]);
        if (!userResponse.ok) throw new Error(userBody.message || 'Gagal memuat akun.');
        if (!branchResponse.ok) throw new Error(branchBody.message || 'Gagal memuat daftar toko.');
        if (!active) return;
        const owner = userBody.data?.role === 'owner';
        setIsOwner(owner);
        const list = (branchBody.data || []).filter((branch) => branch.is_active && branch.type === 'toko');
        setBranches(list);
        const defaultBranch = list.find(isMetro);
        if (defaultBranch) setBranchId(String(defaultBranch.id));
        if (!owner) setMessage('Impor riwayat Olsera hanya tersedia untuk owner.');
        else if (!defaultBranch) setMessage('Cabang Anyostore Metro aktif tidak ditemukan.');
      } catch (error) {
        if (active) setMessage(error.message || 'Gagal memuat halaman impor.');
      } finally {
        if (active) setResolved(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const selectedBytes = useMemo(() => files.reduce((total, file) => total + file.size, 0), [files]);
  const currentProfile = profiles[sourceProfile];
  const targetBranches = branches.filter(currentProfile.matches);
  const productOptions = preview?.product_options || [];
  const unresolved = (preview?.unmatched || []).filter((row) => !mappings[row.sourceName]);

  function changeProfile(nextProfile) {
    setSourceProfile(nextProfile);
    const target = branches.find(profiles[nextProfile].matches);
    setBranchId(target ? String(target.id) : '');
    setFiles([]);
    setMappings({});
    setPreview(null);
    setDone(null);
    setMessage(target ? '' : `Cabang tujuan untuk ${profiles[nextProfile].label} tidak ditemukan.`);
  }

  async function submit(action) {
    if (!branchId) return setMessage(`Pilih cabang tujuan untuk ${currentProfile.label}.`);
    if (!files.length) return setMessage('Pilih file laporan Olsera terlebih dahulu.');
    setBusy(action);
    setMessage('');
    try {
      const form = new FormData();
      form.append('source_profile', sourceProfile);
      form.append('branch_id', branchId);
      form.append('product_mappings', JSON.stringify(mappings));
      files.forEach((file) => form.append('files', file, file.name));
      const response = await fetch(`${api}/olsera-import/${action}`, { method: 'POST', body: form, cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.message || 'Permintaan impor gagal.'), { imported: body.imported_transactions });
      if (action === 'preview') {
        setPreview(body.data);
        setDone(null);
        setMessage('Pratinjau selesai. Periksa transaksi, retur, dan produk yang belum cocok sebelum impor.');
      } else {
        setDone(body.data);
        setMessage('Riwayat Olsera berhasil diimpor.');
        setPreview((current) => current ? { ...current, new_transactions: 0, already_imported: current.transactions } : current);
      }
    } catch (error) {
      setMessage(error.message || 'Permintaan impor gagal.');
      if (error.imported) setDone({ imported_transactions: error.imported, partial: true });
    } finally {
      setBusy('');
    }
  }

  function setMapping(sourceName, productId) {
    setMappings((current) => {
      const next = { ...current };
      if (productId) next[sourceName] = Number(productId);
      else delete next[sourceName];
      return next;
    });
  }

  if (!resolved) return <AppShell title="Impor Olsera" eyebrow="RIWAYAT TRANSAKSI"><section className="panel"><p className="muted">Memuat halaman…</p></section></AppShell>;
  if (!isOwner) return <AppShell title="Impor Olsera" eyebrow="RIWAYAT TRANSAKSI"><section className="panel"><p role="alert">{message || 'Akses hanya untuk owner.'}</p></section></AppShell>;

  return <AppShell title="Impor Riwayat Olsera" eyebrow="MIGRASI DATA · OLSERA">
    <div style={{ display: 'grid', gap: '1rem', maxWidth: 1200, margin: '0 auto' }}>
      <section className="panel">
        <div>
          <h2>Unggah laporan Olsera</h2>
          <p className="muted" style={{ margin: '.35rem 0 0' }}>Unggah pasangan laporan Rincian Penjualan dan Item Penjualan dari satu akun Olsera. Transaksi manual tidak dihapus; cek peringatan transaksi yang sudah ada sebelum impor.</p>
        </div>
        <label>Sumber akun Olsera
          <select value={sourceProfile} onChange={(event) => changeProfile(event.target.value)}>
            {Object.entries(profiles).map(([id, profile]) => <option key={id} value={id}>{profile.label} · {profile.start}–{profile.end}</option>)}
          </select>
        </label>
        <label>Toko tujuan
          <select value={branchId} onChange={(event) => { setBranchId(event.target.value); setPreview(null); setDone(null); }}>
            {targetBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <label>File Excel (.xlsx)
          <input key={sourceProfile} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple onChange={(event) => { setFiles(Array.from(event.target.files || [])); setPreview(null); setDone(null); setMappings({}); setMessage(''); }} />
        </label>
        <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>{files.length} file dipilih · {(selectedBytes / (1024 * 1024)).toFixed(1)} MB · Maksimum 80 file dan 20 MB. Periode {currentProfile.start}–{currentProfile.end}; file hanya diproses sementara saat tombol ditekan.</p>
        {files.length > 0 && <details>
          <summary>Lihat nama file</summary>
          <ul style={{ maxHeight: 180, overflow: 'auto', margin: '.5rem 0', paddingLeft: '1.25rem' }}>
            {files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}
          </ul>
        </details>}
        <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
          <button type="button" className="secondary" disabled={Boolean(busy) || !files.length || !targetBranches.length} onClick={() => submit('preview')}>{busy === 'preview' ? 'Membaca file…' : 'Buat pratinjau'}</button>
          {preview && <button type="button" disabled={Boolean(busy) || !preview.can_apply || !targetBranches.length} onClick={() => submit('apply')}>{busy === 'apply' ? 'Mengimpor…' : `Impor ${preview.new_transactions.toLocaleString('id-ID')} transaksi`}</button>}
        </div>
        {busy === 'apply' && <p className="muted" role="status" style={{ margin: 0 }}>Impor berjalan dalam batch. Jangan tutup halaman; bila koneksi putus, unggah file yang sama lagi untuk melanjutkan tanpa duplikasi.</p>}
        {message && <p className={`message ${done ? 'success' : ''}`} role={done ? 'status' : 'alert'}>{message}</p>}
        {done && <p className="message success" role="status">{done.partial ? `${done.imported_transactions} transaksi sudah tersimpan; ulangi impor file yang sama untuk melanjutkan.` : `${done.imported_transactions.toLocaleString('id-ID')} transaksi masuk, termasuk ${done.imported_returns.toLocaleString('id-ID')} retur. Stok tidak berubah.`}</p>}
      </section>

      {preview && <>
        <section className="panel">
          <div>
            <h2>Ringkasan pratinjau</h2>
            <p className="muted" style={{ margin: '.35rem 0 0' }}>{preview.branch_name} · {preview.date_from || '-'} sampai {preview.date_to || '-'}</p>
          </div>
          <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '.65rem' }}>
            {[
              ['Transaksi ditemukan', preview.transactions],
              ['Transaksi baru', preview.new_transactions],
              ['Sudah pernah masuk', preview.already_imported],
              ['Transaksi manual pada periode', preview.existing_manual_transactions],
              ['Retur', preview.returns],
              ['Nilai retur', rp(preview.return_amount)],
              ['Penjualan bersih', rp(preview.net_sales)],
            ].map(([label, value]) => <article className="metric-card" key={label}><span>{label}</span><strong>{Number.isFinite(Number(value)) ? Number(value).toLocaleString('id-ID') : value}</strong></article>)}
          </div>
          <ul className="muted" style={{ margin: 0, paddingLeft: '1.25rem' }}>
            {preview.existing_manual_transactions > 0 && <li role="alert" style={{ color: '#9a3412', fontWeight: 700 }}>Ada {preview.existing_manual_transactions.toLocaleString('id-ID')} transaksi non-Olsera di toko ini pada periode tersebut. Periksa kemungkinan hitung ganda sebelum impor.</li>}
            <li>{preview.files.sales} file rincian dan {preview.files.items} file item.</li>
            <li>{preview.unpaid_excluded} transaksi positif belum dibayar dilewati; {preview.header_only} transaksi tidak memiliki baris produk.</li>
            <li>{preview.orphan_positive_items} baris penjualan tanpa header tidak diimpor; item retur tanpa header dicatat sebagai retur tanpa invoice asal.</li>
            <li>Data di luar periode {preview.start_date_limit}–{preview.end_date_limit} dilewati. Impor tidak mengubah stok, gudang, atau laci kas.</li>
          </ul>
        </section>

        {preview.unmatched?.length > 0 && <section className="panel">
          <div>
            <h2>Pencocokan produk</h2>
            <p className="muted" style={{ margin: '.35rem 0 0' }}>{unresolved.length} dari {preview.unmatched.length} nama produk belum dipetakan. Transaksi tetap bisa diimpor; produk tanpa pasangan tetap menyimpan nama dan SKU Olsera di detail transaksi.</p>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nama Olsera</th><th>SKU</th><th>Qty bersih</th><th>Nilai</th><th>Produk katalog</th></tr></thead>
              <tbody>{preview.unmatched.map((row) => (
                <tr key={row.sourceName}>
                  <td>{row.sourceName || '(tanpa nama)'}</td>
                  <td>{row.sku || '-'}</td>
                  <td>{row.quantity}</td>
                  <td>{rp(row.amount)}</td>
                  <td><select aria-label={`Cocokkan ${row.sourceName}`} value={mappings[row.sourceName] || ''} onChange={(event) => setMapping(row.sourceName, event.target.value)}>
                    <option value="">Tidak dipetakan</option>
                    {productOptions.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ''}</option>)}
                  </select></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {preview.unmatched.length > 200 && <p className="muted">Pratinjau menampilkan 200 nama pertama. Nama lain tetap tersimpan sebagai data historis.</p>}
        </section>}
      </>}
    </div>
  </AppShell>;
}
