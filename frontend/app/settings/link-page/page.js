'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, GripVertical, Link2, Plus, Trash2 } from 'lucide-react';
import AppShell from '../../components/AppShell';
import LinkBioPage from '../../components/LinkBioPage';
import { uploadMediaData, validateDataUpload } from '../../lib/media-upload';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const iconOptions = [
  ['whatsapp', 'WhatsApp'],
  ['channel', 'WA Channel'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['shopee', 'Shopee'],
  ['toco', 'TOCO'],
  ['pdf', 'PDF'],
  ['catalog', 'Katalog'],
  ['phone', 'Telepon'],
  ['map', 'Alamat'],
  ['email', 'Email'],
  ['link', 'Tautan biasa'],
];

const themeOptions = [
  { id: 'denim', label: 'Denim', hint: 'Terang kebiruan, konsisten dengan landing', colors: ['#1e3a5f', '#e9eef5'] },
  { id: 'dark', label: 'Hitam elegan', hint: 'Gelap, kontras tinggi', colors: ['#161b23', '#2b3340'] },
  { id: 'light', label: 'Terang minimalis', hint: 'Putih bersih', colors: ['#ffffff', '#ececec'] },
];

const emptyForm = {
  title: '', subtitle: '', address: '', hours: '', min_order: '',
  avatar: '', theme: 'denim', show_info: true, links: [],
};

export default function LinkPageSettings() {
  const [form, setForm] = useState(emptyForm);
  const [stores, setStores] = useState([]);
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [message, setMessage] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [copied, setCopied] = useState(false);

  const jsonHeaders = () => ({ 'Content-Type': 'application/json' });
  const mediaUrl = (value) => (value ? api.replace('/api', '') + value : '');
  const pageUrl = typeof window !== 'undefined' ? window.location.origin + '/link' : 'https://anyostore.my.id/link';

  const previewConfig = useMemo(() => ({
    title: form.title,
    subtitle: form.subtitle,
    address: form.address,
    hours: form.hours,
    min_order: form.min_order,
    avatar: form.avatar,
    theme: form.theme,
    show_info: form.show_info,
    links: form.links.filter((l) => l.active && l.url && l.label),
  }), [form]);

  async function loadConfig(id) {
    const response = await fetch(api + '/link-page/config?branch_id=' + id, { headers: jsonHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    setForm({
      title: body.data.title || '',
      subtitle: body.data.subtitle || '',
      address: body.data.address || '',
      hours: body.data.hours || '',
      min_order: body.data.min_order || '',
      avatar: body.data.avatar || '',
      theme: body.data.theme || 'denim',
      show_info: body.data.show_info !== false,
      links: Array.isArray(body.data.links) ? body.data.links : [],
    });
  }

  useEffect(() => {
    fetch(api + '/auth/me', { headers: jsonHeaders() })
      .then((r) => r.json())
      .then((b) => { if (b?.data?.role === 'owner') setIsOwner(true); })
      .catch(() => {});

    fetch(api + '/settings/branches', { headers: jsonHeaders() })
      .then((r) => r.json())
      .then((body) => {
        if (!body.success) throw new Error(body.message);
        const list = body.data || [];
        setStores(list);
        const first = list.find((s) => s.is_active) || list[0];
        if (first) {
          setBranch(String(first.id));
          return loadConfig(first.id);
        }
        return null;
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, []);

  function updateLink(index, patch) {
    setForm((current) => {
      const next = [...current.links];
      next[index] = { ...next[index], ...patch };
      return { ...current, links: next };
    });
  }

  function removeLink(index) {
    setForm((current) => ({ ...current, links: current.links.filter((_, i) => i !== index) }));
  }

  function addLink() {
    setForm((current) => ({
      ...current,
      links: [...current.links, { id: 'l' + Date.now().toString(36), label: '', url: '', icon: 'link', active: true }],
    }));
  }

  function moveLink(from, to) {
    setForm((current) => {
      const next = [...current.links];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...current, links: next };
    });
  }

  async function uploadAvatar(file) {
    if (!file) return;
    const invalid = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (invalid) { setMessage(invalid); return; }
    setUploadingAvatar(true);
    setMessage('');
    try {
      const body = await uploadMediaData(api + '/link-page/avatar?branch_id=' + branch, file);
      setForm((current) => ({ ...current, avatar: body.data.avatar }));
      setMessage('Avatar halaman link tersimpan.');
    } catch (e) { setMessage(e.message); }
    finally { setUploadingAvatar(false); }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(api + '/link-page', {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({ branch_id: Number(branch), ...form }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setMessage('Halaman link tersimpan.');
    } catch (e) { setMessage(e.message); }
    finally { setSaving(false); }
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { setMessage('Tidak bisa menyalin otomatis, salin manual: ' + pageUrl); }
  }

  if (loading) {
    return <AppShell title="Halaman Link" eyebrow="SETTING ADMIN"><p className="muted">Memuat…</p></AppShell>;
  }

  if (!isOwner) {
    return <AppShell title="Halaman Link" eyebrow="SETTING ADMIN"><p className="message">Halaman ini khusus owner.</p></AppShell>;
  }

  return (
    <AppShell title="Halaman Link" eyebrow="SETTING ADMIN">
      <div style={{ display: 'grid', gap: '1.25rem', maxWidth: 1180, margin: '0 auto' }}>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Halaman Link untuk bio Instagram</h2>
              <p>Seperti Linktree, tapi di domain sendiri: <strong>{pageUrl}</strong>. Kelola tombol, urutan, dan tampilannya di sini.</p>
            </div>
            <button type="button" className="small secondary" onClick={copyUrl} style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Copy style={{ width: 14, height: 14 }} /> {copied ? 'Tersalin!' : 'Salin URL'}
            </button>
          </div>

          <form onSubmit={save} style={{ display: 'grid', gap: '1rem', marginTop: '.5rem' }}>
            {stores.length > 1 && (
              <label>Toko<select value={branch} onChange={(e) => { const id = e.target.value; setBranch(id); setMessage(''); loadConfig(id).catch((err) => setMessage(err.message)); }}>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? '' : ' (nonaktif)'}</option>)}
              </select></label>
            )}

            <div className="two-fields">
              <label>Judul (nama toko)<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} /></label>
              <label>Deskripsi singkat<input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} maxLength={300} /></label>
            </div>
            <div className="two-fields">
              <label>Alamat<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={300} /></label>
              <label>Jam operasional<input value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} maxLength={120} /></label>
            </div>
            <div className="two-fields">
              <label>Min. order<input value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} maxLength={160} /></label>
              <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', alignSelf: 'end', minHeight: 40, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.show_info} onChange={(e) => setForm({ ...form, show_info: e.target.checked })} /> Tampilkan info (alamat/jam/min order)
              </label>
            </div>

            <div>
              <strong style={{ fontSize: '.9rem' }}>Avatar</strong>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '.5rem', flexWrap: 'wrap' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}>
                  {form.avatar ? <img src={mediaUrl(form.avatar)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 28 }}>?</div>}
                </div>
                <label className="media-upload">{uploadingAvatar ? 'Mengunggah…' : 'Upload avatar'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingAvatar} onChange={(e) => uploadAvatar(e.target.files?.[0])} /></label>
                {form.avatar && <button type="button" className="small secondary" onClick={() => setForm({ ...form, avatar: '' })}>Hapus avatar</button>}
              </div>
            </div>

            <div>
              <strong style={{ fontSize: '.9rem' }}>Tema</strong>
              <div style={{ display: 'grid', gap: '.6rem', marginTop: '.5rem' }}>
                {themeOptions.map((t) => (
                  <label key={t.id} style={{ display: 'flex', gap: '.75rem', alignItems: 'center', padding: '.7rem .85rem', borderRadius: '.6rem', border: form.theme === t.id ? '2px solid var(--accent)' : '1px solid var(--border)', background: form.theme === t.id ? 'rgba(30,58,95,.06)' : '#fff', cursor: 'pointer' }}>
                    <input type="radio" name="theme" checked={form.theme === t.id} onChange={() => setForm({ ...form, theme: t.id })} style={{ accentColor: 'var(--accent)' }} />
                    <span style={{ display: 'flex', gap: 4 }}>
                      <span style={{ width: 18, height: 18, borderRadius: 5, background: t.colors[0], border: '1px solid rgba(0,0,0,.12)' }} />
                      <span style={{ width: 18, height: 18, borderRadius: 5, background: t.colors[1], border: '1px solid rgba(0,0,0,.12)' }} />
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '.9rem' }}>{t.label}</span>
                    <span className="muted" style={{ fontSize: '.8rem' }}>{t.hint}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '.9rem' }}>Daftar link ({form.links.length})</strong>
                <button type="button" className="small" onClick={addLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Plus style={{ width: 14, height: 14 }} /> Tambah link
                </button>
              </div>
              <p className="muted" style={{ fontSize: '.8rem', margin: '.35rem 0 .6rem' }}>Seret handle untuk mengubah urutan. Link yang tidak aktif disembunyikan dari halaman.</p>
              {form.links.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>Belum ada link. Klik "Tambah link".</p>}
              <div style={{ display: 'grid', gap: '.55rem' }}>
                {form.links.map((link, i) => (
                  <div
                    key={link.id}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragIndex !== null && dragIndex !== i) moveLink(dragIndex, i); setDragIndex(null); }}
                    style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.6rem', borderRadius: '.6rem', border: '1px solid var(--border)', background: dragIndex === i ? 'rgba(30,58,95,.08)' : '#fff', flexWrap: 'wrap' }}
                  >
                    <button
                      type="button"
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      title="Seret untuk pindah"
                      style={{ cursor: 'grab', display: 'inline-flex', padding: 6, background: 'none', border: 0, color: 'var(--muted-foreground)' }}
                    >
                      <GripVertical style={{ width: 16, height: 16 }} />
                    </button>
                    <select value={link.icon} onChange={(e) => updateLink(i, { icon: e.target.value })} style={{ width: 130, padding: '.45rem .5rem', borderRadius: '.45rem', border: '1px solid var(--border)', background: '#fff' }} aria-label="Ikon">
                      {iconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <input value={link.label} onChange={(e) => updateLink(i, { label: e.target.value })} placeholder="Label (mis. WhatsApp Admin 1)" maxLength={120} style={{ flex: '1 1 180px', minWidth: 160 }} />
                    <input value={link.url} onChange={(e) => updateLink(i, { url: e.target.value })} placeholder="https://…" maxLength={1000} style={{ flex: '1 1 220px', minWidth: 200 }} />
                    <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: '.82rem', cursor: 'pointer' }} title="Aktif">
                      <input type="checkbox" checked={link.active} onChange={(e) => updateLink(i, { active: e.target.checked })} /> Aktif
                    </label>
                    <button type="button" className="small secondary" onClick={() => removeLink(i)} aria-label="Hapus link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626' }}>
                      <Trash2 style={{ width: 14, height: 14 }} /> Hapus
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Halaman Link'}</button>
              <span className="muted" style={{ alignSelf: 'center', fontSize: '.85rem' }}>Perubahan langsung tampil di {pageUrl}</span>
            </div>
            {message && <p className="message" role="status">{message}</p>}
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Preview</h2>
              <p className="muted" style={{ fontSize: '.85rem' }}>Tampilan persis seperti di HP pengunjung.</p>
            </div>
            <span className="tag" style={{ alignSelf: 'center' }}>Mobile</span>
          </div>
          <div style={{ margin: '0 auto', maxWidth: 420, borderRadius: 18, overflow: 'hidden', border: '1px solid var(--border)', boxShadow: '0 16px 44px rgba(0,0,0,.12)' }}>
            <LinkBioPage config={previewConfig} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
