'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Loader2, Upload, XCircle } from 'lucide-react';
import AppShell from '../../components/AppShell';
import { uploadMediaData } from '../../lib/media-upload';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function cleanSku(name) {
  let s = String(name || '').replace(/\.[^.]+$/, '').trim().toUpperCase();
  s = s.replace(/\s*\(\d+\)\s*$/, '');
  s = s.replace(/[-_\s]+(?:DEPAN|BELAKANG|DETAIL|SAMPING|ATAS|BAWAH|FRONT|BACK|SIDE|MAIN|1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20)$/, '');
  return s;
}

const statusColor = { menunggu: '#64748b', mengupload: '#1e3a5f', berhasil: '#16a34a', gagal: '#dc2626', dilewati: '#b45309' };

export default function BulkPhotoUploadPage() {
  const [products, setProducts] = useState([]);
  const [files, setFiles] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState('');
  const [failures, setFailures] = useState([]);
  const folderInputRef = useRef(null);
  const token = () => typeof window === 'undefined' ? '' : localStorage.getItem('pos_access_token');
  const headers = () => ({ Authorization: `Bearer ${token()}` });

  useEffect(() => {
    if (!token()) { window.location.assign('/'); return; }
    fetch(`${apiUrl}/products?limit=500`, { headers: headers() })
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.message); setProducts(b.data || []); })
      .catch((e) => setMessage(e.message || 'Gagal memuat daftar produk'));
  }, []);

  useEffect(() => {
    const el = folderInputRef.current;
    if (!el) return;
    el.setAttribute('webkitdirectory', '');
    el.setAttribute('directory', '');
    try { el.webkitdirectory = true; } catch {}
  }, []);

  const skuMap = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const sku = String(p.sku || '').trim().toUpperCase();
      if (sku) map.set(sku, p);
    }
    return map;
  }, [products]);

  function findProduct(file) {
    const base = cleanSku(file.name);
    const candidates = [base, base.replace(/[-_\s]+(?:DEPAN|BELAKANG|DETAIL|SAMPING|ATAS|BAWAH|FRONT|BACK|SIDE|MAIN)$/, '')];
    for (const c of candidates) if (skuMap.has(c)) return skuMap.get(c);
    return null;
  }

  function addFiles(list) {
    const incoming = Array.from(list || []).filter((f) => f.type.startsWith('image/'));
    if (!incoming.length) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((i) => `${i.file.name}|${i.file.size}`));
      const fresh = incoming.filter((f) => !existing.has(`${f.name}|${f.size}`));
      return [...prev, ...fresh.map((file) => ({ id: `${Date.now()}-${Math.random()}`, file, preview: URL.createObjectURL(file), status: 'menunggu' }))];
    });
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files);
  }

  async function uploadAll() {
    const byProduct = {};
    for (const item of files) {
      const product = findProduct(item.file);
      if (!product) continue;
      if (!byProduct[product.id]) byProduct[product.id] = { product, entries: [] };
      byProduct[product.id].entries.push({ item, file: item.file });
    }
    const groups = Object.values(byProduct);
    let selected = [];
    const skipped = [];
    for (const group of groups) {
      group.entries.sort((a, b) => a.file.name.localeCompare(b.file.name));
      selected = selected.concat(group.entries.slice(0, 10));
      skipped.push(...group.entries.slice(10));
    }
    if (!selected.length) return;
    setUploading(true);
    setFailures([]);
    setMessage('');
    setProgress({ done: 0, total: selected.length });
    setFiles((prev) => prev.map((f) => skipped.some((s) => s.file === f.file) ? { ...f, status: 'dilewati' } : f));
    const ordered = [...selected].reverse(); // foto pertama per produk diupload terakhir → jadi foto utama
    let ok = 0;
    const fails = [];
    for (let i = 0; i < ordered.length; i++) {
      const { item, file, product } = ordered[i];
      setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: 'mengupload' } : f));
      try {
        await uploadMediaData(`${apiUrl}/products/${product.id}/media-data`, file, token());
        ok += 1;
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: 'berhasil' } : f));
      } catch (err) {
        fails.push({ name: file.name, sku: product.sku, error: err.message });
        setFiles((prev) => prev.map((f) => f.id === item.id ? { ...f, status: 'gagal' } : f));
      }
      setProgress({ done: i + 1, total: ordered.length });
    }
    setUploading(false);
    setFailures(fails);
    setMessage(`${ok} foto berhasil diupload${fails.length ? `, ${fails.length} gagal` : ''}.`);
  }

  const matchedCount = files.filter((f) => findProduct(f.file)).length;
  const unmatched = files.filter((f) => !findProduct(f.file));
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <AppShell title="Upload Foto Massal" eyebrow="KATALOG PRODUK" actions={<a className="button-link secondary-link" href="/products">← Kembali ke Produk</a>}>
      <section className="form-page">
        <div className="panel product-form">
          <div><h2>Upload foto banyak produk sekaligus</h2><p className="muted">Pilih semua foto sekaligus dari Finder/Explorer. Nama file harus memuat SKU produk, contoh: <strong>A100.jpg</strong>, <strong>AB12-1.jpg</strong>, <strong>AT77 BORDIR depan.jpg</strong>. Maksimal 10 foto per produk.</p></div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
            onDrop={onDrop}
            style={{ border: `2px dashed ${dragOver ? '#1e3a5f' : '#94a3b8'}`, borderRadius: 12, background: dragOver ? '#eff6ff' : '#f8fafc', padding: '34px 20px', textAlign: 'center', cursor: 'pointer', transition: 'all .2s' }}
            onClick={() => document.getElementById('bulk-photo-input')?.click()}
          >
            <ImagePlus size={28} style={{ color: '#1e3a5f', margin: '0 auto 8px', display: 'block' }} />
            <strong style={{ fontSize: 14, color: '#1e293b' }}>{dragOver ? 'Lepaskan foto di sini' : 'Klik atau seret banyak foto ke sini'}</strong>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>JPG, PNG, WebP — bisa puluhan file sekaligus</p>
            <input id="bulk-photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <input ref={folderInputRef} id="bulk-folder-input" type="file" multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12 }}>
            <button type="button" className="secondary small" onClick={() => folderInputRef.current?.click()}><ImagePlus size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} /> Pilih Folder</button>
            <span style={{ fontSize: 11, color: '#64748b', alignSelf: 'center' }}>Pilih satu folder — semua foto di dalamnya ikut terdeteksi.</span>
          </div>

          {message && <p style={{ margin: '12px 0 0', fontSize: 13, color: failures.length ? '#dc2626' : '#16a34a', fontWeight: 600 }}>{message}</p>}

          {files.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                <strong style={{ fontSize: 14 }}>{files.length} file · {matchedCount} cocok dengan SKU · {unmatched.length} tidak cocok</strong>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="secondary small" disabled={uploading} onClick={() => { setFiles([]); setFailures([]); setMessage(''); setProgress({ done: 0, total: 0 }); }}>Bersihkan</button>
                  <button disabled={uploading || !matchedCount} onClick={uploadAll} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 14px', borderRadius: 8, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 700, fontSize: 13, cursor: uploading || !matchedCount ? 'not-allowed' : 'pointer', opacity: uploading || !matchedCount ? .55 : 1 }}>
                    {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {uploading ? `Mengupload ${progress.done}/${progress.total}…` : `Upload ${matchedCount} Foto`}
                  </button>
                </div>
              </div>

              {uploading && (
                <div style={{ background: '#f1f5f9', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                  <div style={{ width: `${percent}%`, height: 8, background: '#1e3a5f', transition: 'width .25s' }} />
                </div>
              )}

              <div style={{ display: 'grid', gap: 6, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
                {files.map((item) => {
                  const product = findProduct(item.file);
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
                      <img src={item.preview} alt="" style={{ width: 40, height: 50, objectFit: 'cover', borderRadius: 6, background: '#f1f5f9' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.file.webkitRelativePath || item.file.name}</strong>
                        {product
                          ? <span style={{ fontSize: 11, color: '#475569' }}>{product.name} · SKU {product.sku}</span>
                          : <span style={{ fontSize: 11, color: '#dc2626' }}>Tidak cocok dengan SKU produk mana pun</span>}
                      </div>
                      {item.status === 'berhasil' ? <CheckCircle2 size={16} color="#16a34a" />
                        : item.status === 'gagal' ? <XCircle size={16} color="#dc2626" />
                          : item.status === 'mengupload' ? <Loader2 size={16} color="#1e3a5f" className="spin" />
                            : <span style={{ fontSize: 11, color: statusColor[item.status] || '#64748b', fontWeight: 600 }}>{item.status === 'dilewati' ? 'Maks 10/produk' : 'Menunggu'}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!files.length && (
            <div style={{ marginTop: 18, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569' }}>
              <strong style={{ display: 'block', marginBottom: 6, color: '#1e293b' }}>Contoh penamaan file</strong>
              <div style={{ display: 'grid', gap: 3 }}>
                <span><code>A100.jpg</code> → produk A100</span>
                <span><code>AB12-2.jpg</code> → produk AB12 (foto ke-2)</span>
                <span><code>AT77 BORDIR depan.jpg</code> → produk AT77 BORDIR</span>
                <span><code>V03 (1).jpg</code> → produk V03</span>
              </div>
            </div>
          )}

          {failures.length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10 }}>
              <strong style={{ fontSize: 13, color: '#991b1b' }}>Upload gagal</strong>
              {failures.map((f) => <p key={f.name} style={{ margin: '4px 0 0', fontSize: 12, color: '#7f1d1d' }}>{f.name} ({f.sku}): {f.error}</p>)}
            </div>
          )}
        </div>
      </section>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </AppShell>
  );
}
