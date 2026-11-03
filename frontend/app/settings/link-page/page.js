'use client';
import { localDateString } from '../../lib/local-date';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  BookOpen,
  Copy,
  ExternalLink,
  Eye,
  GalleryHorizontalEnd,
  GripVertical,
  ImagePlus,
  LayoutGrid,
  Minus,
  MousePointerClick,
  Plus,
  Presentation,
  RotateCcw,
  Rows3,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import AppShell from '../../components/AppShell';
import LinkBioPage from '../../components/LinkBioPage';
import { uploadMediaData, validateDataUpload } from '../../lib/media-upload';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const linkOptionStyle = (selected) => ({
  position: 'relative',
  display: 'flex', gap: '.6rem', alignItems: 'center',
  padding: '.7rem .75rem .7rem 1.6rem',
  borderRadius: '.65rem',
  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
  background: selected ? 'rgba(30,58,95,.06)' : 'var(--card)',
  cursor: 'pointer',
  transition: 'border-color .15s ease, background .15s ease',
});

const hiddenRadioStyle = { position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none', margin: 0 };

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
  { id: 'sage', label: 'Sage hijau', hint: 'Kalem & natural', colors: ['#3f6212', '#eaf2e3'] },
];

const layoutOptions = [
  { id: 'list', label: 'List', hint: 'Tombol vertikal satu kolom', Icon: Rows3 },
  { id: 'grid', label: 'Grid', hint: 'Kartu 2 kolom', Icon: LayoutGrid },
  { id: 'carousel', label: 'Carousel', hint: 'Geser horizontal', Icon: GalleryHorizontalEnd },
  { id: 'showcase', label: 'Showcase', hint: 'Kartu besar dengan gambar', Icon: Presentation },
];

const typeOptions = [
  ['link', 'Tautan'],
  ['text', 'Teks judul'],
  ['divider', 'Pembatas'],
];

const cardLayoutOptions = [
  ['', 'Ikuti halaman'],
  ['list', 'List'],
  ['grid', 'Grid'],
  ['carousel', 'Carousel'],
  ['showcase', 'Showcase'],
];

const backgroundOptions = [
  ['theme', 'Tema'],
  ['image', 'Foto'],
  ['gradient', 'Gradient'],
];

const emptyForm = {
  title: '', subtitle: '', address: '', hours: '', min_order: '',
  avatar: '', theme: 'denim', layout: 'list', background_type: 'theme', background: '',
  show_info: true, social: [], links: [],
};

function slugFromName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

export default function LinkPageSettings() {
  const [form, setForm] = useState(emptyForm);
  const [stats, setStats] = useState(null);
  const [stores, setStores] = useState([]);
  const [pages, setPages] = useState([]);
  const [branch, setBranch] = useState('');
  const [selectedPageId, setSelectedPageId] = useState('');
  const [pageName, setPageName] = useState('');
  const [pageSlug, setPageSlug] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [newPageName, setNewPageName] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');
  const [newSlugEdited, setNewSlugEdited] = useState(false);
  const [duplicateCurrent, setDuplicateCurrent] = useState(false);
  const [activeSection, setActiveSection] = useState('profile');
  const [showCreatePage, setShowCreatePage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [uploadingLogoIndex, setUploadingLogoIndex] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState('');
  const [dragIndex, setDragIndex] = useState(null);
  const [copied, setCopied] = useState(false);

  const jsonHeaders = () => ({ 'Content-Type': 'application/json' });
  const mediaUrl = (value) => (value ? api.replace('/api', '') + value : '');
  const pageUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/${pageSlug || `toko-${branch || '1'}`}`
    : `https://anyostore.my.id/${pageSlug || `toko-${branch || '1'}`}`;
  const hasUnsavedChanges = Boolean(savedFingerprint) && savedFingerprint !== JSON.stringify({ form, pageName, pageSlug, isPublished, isDefault });

  const previewConfig = useMemo(() => ({
    title: form.title,
    subtitle: form.subtitle,
    address: form.address,
    hours: form.hours,
    min_order: form.min_order,
    avatar: form.avatar,
    theme: form.theme,
    layout: form.layout,
    background_type: form.background_type,
    background: form.background,
    show_info: form.show_info,
    social: form.social.filter((s) => s.active && s.url),
    links: form.links.filter((l) => {
      if (!l.active) return false;
      const type = l.type || 'link';
      if (type === 'divider') return true;
      if (type === 'text') return Boolean(String(l.label || '').trim());
      return Boolean(String(l.label || '').trim() && String(l.url || '').trim());
    }),
  }), [form]);

  async function loadConfig(id, pageId) {
    const params = new URLSearchParams({ branch_id: String(id) });
    if (pageId) params.set('page_id', String(pageId));
    const response = await fetch(api + '/link-page/config?' + params.toString(), { headers: jsonHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    const nextForm = {
      title: body.data.title || '',
      subtitle: body.data.subtitle || '',
      address: body.data.address || '',
      hours: body.data.hours || '',
      min_order: body.data.min_order || '',
      avatar: body.data.avatar || '',
      theme: body.data.theme || 'denim',
      layout: body.data.layout || 'list',
      background_type: body.data.background_type || 'theme',
      background: body.data.background || '',
      show_info: body.data.show_info !== false,
      social: Array.isArray(body.data.social) ? body.data.social : [],
      links: Array.isArray(body.data.links) ? body.data.links : [],
    };
    const nextPageName = body.data.page_name || body.data.title || '';
    const nextSlug = body.data.slug || '';
    const nextPublished = body.data.is_published !== false;
    const nextDefault = body.data.is_default === true || Number(body.data.is_default) === 1;
    setForm(nextForm);
    setSelectedPageId(String(body.data.page_id || pageId || ''));
    setPageName(nextPageName);
    setPageSlug(nextSlug);
    setIsPublished(nextPublished);
    setIsDefault(nextDefault);
    setSavedFingerprint(JSON.stringify({ form: nextForm, pageName: nextPageName, pageSlug: nextSlug, isPublished: nextPublished, isDefault: nextDefault }));
    setStats(body.data.stats || null);
  }

  async function loadPages(id, preferredId) {
    const response = await fetch(api + '/link-page/pages?branch_id=' + encodeURIComponent(id), { headers: jsonHeaders() });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message);
    const list = body.data.pages || [];
    setPages(list);
    const selected = list.find((page) => String(page.id) === String(preferredId))
      || list.find((page) => page.is_default)
      || list[0];
    if (selected) await loadConfig(id, selected.id);
    else {
      setSelectedPageId('');
      setStats(null);
    }
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
          return loadPages(first.id);
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

  function addItem(type) {
    setForm((current) => ({
      ...current,
      links: [...current.links, { id: 'l' + Date.now().toString(36), type, label: '', url: '', icon: 'link', logo: '', layout: '', active: true }],
    }));
  }

  function addCatalogLink() {
    setForm((current) => ({
      ...current,
      links: [...current.links, {
        id: 'l' + Date.now().toString(36),
        type: 'link',
        label: 'Lihat Katalog',
        url: '/#produk',
        icon: 'catalog',
        logo: '',
        layout: '',
        active: true,
      }],
    }));
  }

  function updateSocial(index, patch) {
    setForm((current) => {
      const next = [...current.social];
      next[index] = { ...next[index], ...patch };
      return { ...current, social: next };
    });
  }

  function removeSocial(index) {
    setForm((current) => ({ ...current, social: current.social.filter((_, i) => i !== index) }));
  }

  function addSocial() {
    setForm((current) => ({
      ...current,
      social: [...current.social, { id: 's' + Date.now().toString(36), icon: 'link', url: '', active: true }],
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

  async function selectPage(pageId) {
    if (hasUnsavedChanges && !window.confirm('Perubahan belum disimpan. Buang perubahan dan pindah halaman?')) return;
    setMessage('');
    try { await loadConfig(branch, pageId); }
    catch (error) { setMessage(error.message); }
  }

  async function changeBranch(id) {
    if (hasUnsavedChanges && !window.confirm('Perubahan belum disimpan. Buang perubahan dan pindah toko?')) return;
    setBranch(id);
    setMessage('');
    try { await loadPages(id); }
    catch (error) { setMessage(error.message); }
  }

  async function createPage() {
    const name = newPageName.trim();
    const slug = newPageSlug.trim().toLowerCase();
    if (!name || !slug) { setMessage('Nama dan URL halaman wajib diisi.'); return; }
    if (hasUnsavedChanges && !window.confirm(duplicateCurrent
      ? 'Perubahan halaman ini belum disimpan. Duplikat akan memakai versi terakhir yang tersimpan. Lanjutkan?'
      : 'Perubahan halaman ini belum disimpan dan akan ditinggalkan saat halaman baru dibuka. Lanjutkan?')) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(api + '/link-page/pages', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          branch_id: Number(branch),
          name,
          slug,
          source_page_id: duplicateCurrent ? Number(selectedPageId) : undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal membuat halaman');
      setNewPageName('');
      setNewPageSlug('');
      setNewSlugEdited(false);
      await loadPages(branch, body.data.id);
      setShowCreatePage(false);
      setMessage(duplicateCurrent ? 'Halaman berhasil diduplikat.' : 'Halaman baru berhasil dibuat.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function deletePage() {
    if (!selectedPageId || isDefault) return;
    if (!window.confirm(`Hapus halaman “${pageName}” beserta statistiknya? Tindakan ini tidak bisa dibatalkan.`)) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(api + '/link-page/pages/' + encodeURIComponent(selectedPageId), { method: 'DELETE', headers: jsonHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Gagal menghapus halaman');
      await loadPages(branch);
      setMessage('Halaman dihapus.');
    } catch (error) { setMessage(error.message); }
    finally { setSaving(false); }
  }

  async function uploadAvatar(file) {
    if (!file) return;
    const invalid = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (invalid) { setMessage(invalid); return; }
    setUploadingAvatar(true);
    setMessage('');
    try {
      const body = await uploadMediaData(api + '/link-page/avatar?branch_id=' + branch + '&page_id=' + encodeURIComponent(selectedPageId), file);
      setForm((current) => ({ ...current, avatar: body.data.avatar }));
      setMessage('Avatar halaman link tersimpan.');
    } catch (e) { setMessage(e.message); }
    finally { setUploadingAvatar(false); }
  }

  async function uploadBackground(file) {
    if (!file) return;
    const invalid = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (invalid) { setMessage(invalid); return; }
    setUploadingBackground(true);
    setMessage('');
    try {
      const body = await uploadMediaData(api + '/link-page/media', file);
      setForm((current) => ({ ...current, background_type: 'image', background: body.data.path }));
      setMessage('Background foto tersimpan. Jangan lupa klik Simpan Halaman Link.');
    } catch (e) { setMessage(e.message); }
    finally { setUploadingBackground(false); }
  }

  async function uploadLinkLogo(index, file) {
    if (!file) return;
    const invalid = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (invalid) { setMessage(invalid); return; }
    setUploadingLogoIndex(index);
    setMessage('');
    try {
      const body = await uploadMediaData(api + '/link-page/media', file);
      updateLink(index, { logo: body.data.path });
      setMessage('Logo link tersimpan. Jangan lupa klik Simpan Halaman Link.');
    } catch (e) { setMessage(e.message); }
    finally { setUploadingLogoIndex(null); }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      if (!selectedPageId) throw new Error('Pilih halaman yang akan disimpan.');
      const metaResponse = await fetch(api + '/link-page/pages/' + encodeURIComponent(selectedPageId), {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: pageName,
          slug: pageSlug,
          is_published: isPublished,
          is_default: isDefault,
          config: form,
        }),
      });
      const metaBody = await metaResponse.json();
      if (!metaResponse.ok) throw new Error(metaBody.message || 'Gagal menyimpan halaman link');
      await loadPages(branch, selectedPageId);
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

  async function resetStats() {
    if (!confirm(`Hapus semua statistik view dan klik untuk halaman “${pageName}”? Tidak bisa dibatalkan.`)) return;
    setResetting(true);
    setMessage('');
    try {
      const response = await fetch(api + '/link-page/stats/reset', {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ branch_id: Number(branch), page_id: Number(selectedPageId) }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message);
      setStats({ total_views: 0, views_by_day: [], clicks: [] });
      setMessage('Statistik direset.');
    } catch (e) { setMessage(e.message); }
    finally { setResetting(false); }
  }

  function exportStatsCsv() {
    if (!stats) return;
    const date = localDateString();
    const rows = [
      ['LAPORAN STATISTIK HALAMAN LINK'],
      ['Dicetak', new Date().toLocaleString('id-ID')],
      ['Total View', stats.total_views || 0],
      ['Total Klik', (stats.clicks || []).reduce((s, c) => s + c.clicks, 0)],
      [],
      ['VIEW PER HARI'],
      ['Tanggal', 'View'],
      ...(stats.views_by_day || []).map((d) => [String(d.date).slice(0, 10), d.views]),
      [],
      ['KLIK PER ITEM'],
      ['Item', 'Label', 'Klik', 'Terakhir Diklik'],
      ...(stats.clicks || []).map((c) => [c.item_id, c.label || '', c.clicks, c.last_clicked_at ? String(c.last_clicked_at) : '']),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `statistik-halaman-link-${date}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function printStats() {
    if (!stats) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { setMessage('Blokir popup? Izinkan popup dulu untuk mencetak PDF.'); return; }
    const viewBody = (stats.views_by_day || []).slice().reverse().map((d) => `<tr><td>${String(d.date).slice(0, 10)}</td><td>${d.views}</td></tr>`).join('') || '<tr><td colspan="2">Belum ada data</td></tr>';
    const clickRows = (stats.clicks || []).map((c) => `<tr><td>${String(c.label || c.item_id).replace(/</g, '&lt;')}</td><td>${c.clicks}</td><td>${c.last_clicked_at ? String(c.last_clicked_at).slice(0, 16) : '-'}</td></tr>`).join('') || '<tr><td colspan="3">Belum ada data</td></tr>';
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Statistik Halaman Link</title>
      <style>
        @page { size: A4; margin: 14mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 12px; }
        h1 { font-size: 18px; margin: 0; }
        .brand { color: #1e3a5f; font-weight: 800; letter-spacing: .12em; font-size: 11px; }
        .meta { display: flex; gap: 4px 20px; flex-wrap: wrap; margin: 10px 0 18px; font-size: 11px; color: #374151; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
        th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
        th { background: #eef2f7; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
        .sum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
        .sum div { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; }
        .sum strong { display: block; font-size: 18px; margin-top: 2px; }
        .sum span { font-size: 10px; color: #6b7280; }
        h2 { font-size: 13px; margin: 0 0 8px; color: #1e3a5f; }
      </style></head><body>
      <h1>Statistik Halaman Link</h1>
      <div class="brand">ANYOSTORE</div>
      <div class="meta">
        <span>Dicetak: ${new Date().toLocaleString('id-ID')}</span>
        <span>Periode: 14 hari terakhir</span>
        <span>Toko: ${stores.find((s) => String(s.id) === String(branch))?.name || ''}</span>
      </div>
      <div class="sum">
        <div><span>Total View</span><strong>${stats.total_views || 0}</strong></div>
        <div><span>Total Klik</span><strong>${(stats.clicks || []).reduce((s, c) => s + c.clicks, 0)}</strong></div>
        <div><span>Item Terpantau</span><strong>${(stats.clicks || []).length}</strong></div>
      </div>
      <h2>View per Hari (14 hari terakhir)</h2>
      <table><thead><tr><th>Tanggal</th><th>View</th></tr></thead><tbody>${viewBody}</tbody></table>
      <h2>Klik per Item</h2>
      <table><thead><tr><th>Item</th><th>Klik</th><th>Terakhir Diklik</th></tr></thead><tbody>${clickRows}</tbody></table>
      <script>window.onload = function(){ window.print(); }</script>
      </body></html>`);
    win.document.close();
  }

  const maxClicks = Math.max(1, ...(stats?.clicks || []).map((c) => c.clicks));
  const clickTotal = (stats?.clicks || []).reduce((s, c) => s + c.clicks, 0);

  if (loading) {
    return <AppShell title="Halaman Link" eyebrow="SETTING ADMIN"><p className="muted">Memuat…</p></AppShell>;
  }

  return (
    <AppShell title="Halaman Link" eyebrow="SETTING ADMIN">
      <div className="link-settings-shell">
        <header className="link-settings-heading">
          <div>
            <h2>Kelola halaman bio</h2>
            <p>Atur beberapa halaman link toko dari satu tempat.</p>
          </div>
        </header>

        <form onSubmit={save} className="link-settings-workspace">
          <div className="link-settings-editor">
            <section className="link-settings-toolbar" aria-label="Pilih halaman">
              <div className="link-settings-selects">
                {stores.length > 1 && (
                  <label>Toko
                    <select value={branch} onChange={(e) => changeBranch(e.target.value)}>
                      {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? '' : ' (nonaktif)'}</option>)}
                    </select>
                  </label>
                )}
                <label>Halaman
                  <select value={selectedPageId} onChange={(e) => selectPage(e.target.value)}>
                    {pages.map((page) => <option key={page.id} value={page.id}>{page.name}{page.is_default ? ' · Utama' : ''}{!page.is_published ? ' · Draft' : ''}</option>)}
                  </select>
                </label>
              </div>
              <div className="link-settings-actions">
                <button type="button" className="small secondary" onClick={() => setShowCreatePage(true)}>
                  <Plus aria-hidden="true" /> Halaman baru
                </button>
                <button type="button" className="small secondary" onClick={copyUrl}>
                  <Copy aria-hidden="true" /> {copied ? 'Tersalin' : 'Salin URL'}
                </button>
                <a className="small secondary" href={pageUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" /> Buka
                </a>
              </div>
              <div className="link-settings-current-url">
                <span className={isPublished ? 'link-settings-status is-published' : 'link-settings-status is-draft'}>
                  {isPublished ? 'Dipublikasikan' : 'Draft'}
                </span>
                <span className="muted">{pageUrl}</span>
              </div>
            </section>

            <details className="link-settings-page-meta">
              <summary>
                <span>Pengaturan halaman</span>
                <span className="link-settings-meta-hint">
                  {isDefault ? 'Halaman utama' : 'Nama, URL, dan publikasi'}
                </span>
              </summary>
              <div className="link-settings-page-fields">
                <label>Nama halaman
                  <input value={pageName} onChange={(e) => setPageName(e.target.value)} maxLength={120} placeholder="Contoh: Promo Ramadan" />
                </label>
                <label>Slug URL
                  <input value={pageSlug} onChange={(e) => setPageSlug(e.target.value.toLowerCase())} maxLength={80} placeholder="promo-ramadan" />
                </label>
                <div className="link-settings-meta-actions">
                  <label className="link-settings-checkbox">
                    <input type="checkbox" checked={isPublished} disabled={isDefault} onChange={(e) => setIsPublished(e.target.checked)} />
                    Publikasikan
                  </label>
                  {isDefault
                    ? <span className="tag">Halaman utama · /{pageSlug}</span>
                    : <button type="button" className="small secondary" onClick={() => { setIsDefault(true); setIsPublished(true); }}>Jadikan halaman utama</button>}
                  {!isDefault && (
                    <button type="button" className="small secondary link-settings-delete" onClick={deletePage} disabled={saving}>
                      <Trash2 aria-hidden="true" /> Hapus halaman
                    </button>
                  )}
                </div>
                {!isPublished && <p className="muted link-settings-draft-note">Halaman draft belum dapat dibuka pengunjung.</p>}
              </div>
            </details>

            <nav className="link-settings-tabs" role="tablist" aria-label="Bagian editor">
              {[
                { id: 'profile', label: 'Profil', Icon: Type },
                { id: 'design', label: 'Tampilan', Icon: LayoutGrid },
                { id: 'links', label: 'Tautan', Icon: ExternalLink },
                { id: 'stats', label: 'Statistik', Icon: BarChart3 },
              ].map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeSection === id}
                  className={activeSection === id ? 'link-settings-tab active' : 'link-settings-tab'}
                  onClick={() => setActiveSection(id)}
                >
                  <Icon aria-hidden="true" /> <span>{label}</span>
                  {id === 'links' && <small>{form.links.length}</small>}
                </button>
              ))}
            </nav>

            {activeSection === 'profile' && (
              <section className="panel link-settings-content" role="tabpanel">
                <div className="link-settings-section-heading">
                  <div><h3>Profil toko</h3><p>Informasi yang muncul di bagian atas halaman.</p></div>
                </div>
                <div className="link-settings-section-stack">
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
                      <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--card)', flexShrink: 0 }}>
                        {form.avatar ? <img src={mediaUrl(form.avatar)} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted-foreground)', fontSize: 28 }}>?</div>}
                      </div>
                      <label className="media-upload">{uploadingAvatar ? 'Mengunggah…' : 'Upload avatar'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingAvatar} onChange={(e) => uploadAvatar(e.target.files?.[0])} /></label>
                      {form.avatar && <button type="button" className="small secondary" onClick={() => setForm({ ...form, avatar: '' })}>Hapus avatar</button>}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '.9rem' }}>Bar ikon sosial ({form.social.length}/{8})</strong>
                      <button type="button" className="small" onClick={addSocial} disabled={form.social.length >= 8} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Plus style={{ width: 14, height: 14 }} /> Tambah ikon
                      </button>
                    </div>
                    <p className="muted" style={{ fontSize: '.8rem', margin: '.35rem 0 .6rem' }}>Ikon kecil di bawah avatar, terpisah dari tombol utama. Maksimal 8.</p>
                    {form.social.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>Belum ada ikon sosial.</p>}
                    <div style={{ display: 'grid', gap: '.55rem' }}>
                      {form.social.map((s, i) => (
                        <div key={s.id} className="link-settings-social-row" style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                          <select value={s.icon} onChange={(e) => updateSocial(i, { icon: e.target.value })} style={{ width: 130, padding: '.45rem .5rem', borderRadius: '.45rem', border: '1px solid var(--border)', background: 'var(--card)' }} aria-label="Ikon sosial">
                            {iconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                          <input aria-label={`URL ikon sosial ${i + 1}`} value={s.url} onChange={(e) => updateSocial(i, { url: e.target.value })} placeholder="https://… atau /halaman-internal" maxLength={1000} style={{ flex: '1 1 260px', minWidth: 220 }} />
                          <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: '.82rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={s.active} onChange={(e) => updateSocial(i, { active: e.target.checked })} /> Aktif
                          </label>
                          <button type="button" className="small secondary" onClick={() => removeSocial(i)} aria-label="Hapus ikon sosial" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626' }}>
                            <Trash2 style={{ width: 14, height: 14 }} /> Hapus
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'design' && (
              <section className="panel link-settings-content" role="tabpanel">
                <div className="link-settings-section-heading">
                  <div><h3>Tampilan halaman</h3><p>Pilih latar, tema warna, dan susunan tombol.</p></div>
                </div>
                <div className="link-settings-section-stack">
                  <div>
                    <strong style={{ fontSize: '.9rem' }}>Background halaman</strong>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
                      {backgroundOptions.map(([value, label]) => (
                        <label key={value} className="link-option" style={linkOptionStyle(form.background_type === value)}>
                          <input type="radio" name="bgType" checked={form.background_type === value} onChange={() => setForm({ ...form, background_type: value })} style={hiddenRadioStyle} />
                          {form.background_type === value && <Check style={{ position: 'absolute', top: 8, right: 8, width: 14, height: 14, color: 'var(--accent)' }} aria-hidden="true" />}
                          <span style={{ fontSize: '.85rem', fontWeight: 600 }}>{label}</span>
                        </label>
                      ))}
                    </div>
                    {form.background_type === 'image' && (
                      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '.5rem', flexWrap: 'wrap' }}>
                        {form.background && <img src={mediaUrl(form.background)} alt="Background" style={{ width: 120, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
                        <label className="media-upload">{uploadingBackground ? 'Mengunggah…' : 'Upload foto background'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingBackground} onChange={(e) => uploadBackground(e.target.files?.[0])} /></label>
                        {form.background && <button type="button" className="small secondary" onClick={() => setForm({ ...form, background: '' })}>Hapus foto</button>}
                      </div>
                    )}
                    {form.background_type === 'gradient' && (
                      <label style={{ marginTop: '.5rem', display: 'block' }}>CSS gradient<input value={form.background} onChange={(e) => setForm({ ...form, background: e.target.value })} placeholder="linear-gradient(135deg, #1e3a5f 0%, #e9eef5 100%)" /></label>
                    )}
                    {form.background_type === 'theme' && (
                      <p className="muted" style={{ fontSize: '.8rem', margin: '.4rem 0 0' }}>Mengikuti tema yang dipilih (Denim / Hitam / Terang).</p>
                    )}
                  </div>

                  <div>
                    <strong style={{ fontSize: '.9rem' }}>Tema</strong>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.55rem', marginTop: '.5rem' }}>
                      {themeOptions.map((t) => (
                        <label key={t.id} className="link-option" style={linkOptionStyle(form.theme === t.id)}>
                          <input type="radio" name="theme" checked={form.theme === t.id} onChange={() => setForm({ ...form, theme: t.id })} style={hiddenRadioStyle} />
                          {form.theme === t.id && <Check style={{ position: 'absolute', top: 8, right: 8, width: 14, height: 14, color: 'var(--accent)' }} aria-hidden="true" />}
                          <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <span style={{ width: 18, height: 18, borderRadius: 6, background: t.colors[0], border: '1px solid rgba(0,0,0,.12)' }} />
                            <span style={{ width: 18, height: 18, borderRadius: 6, background: t.colors[1], border: '1px solid rgba(0,0,0,.12)' }} />
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700, fontSize: '.85rem' }}>{t.label}</span>
                            <span className="muted" style={{ display: 'block', fontSize: '.72rem', lineHeight: 1.3 }}>{t.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <strong style={{ fontSize: '.9rem' }}>Layout halaman (default)</strong>
                    <p className="muted" style={{ fontSize: '.78rem', margin: '.2rem 0 .5rem' }}>Pilih default untuk semua link. Link yang diatur khusus di bawah akan menimpa default ini.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '.55rem' }}>
                      {layoutOptions.map((l) => (
                        <label key={l.id} className="link-option" style={linkOptionStyle(form.layout === l.id)}>
                          <input type="radio" name="layout" checked={form.layout === l.id} onChange={() => setForm({ ...form, layout: l.id })} style={hiddenRadioStyle} />
                          {form.layout === l.id && <Check style={{ position: 'absolute', top: 8, right: 8, width: 14, height: 14, color: 'var(--accent)' }} aria-hidden="true" />}
                          <l.Icon style={{ width: 17, height: 17, color: 'var(--muted-foreground)', flexShrink: 0 }} aria-hidden="true" />
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 700, fontSize: '.85rem' }}>{l.label}</span>
                            <span className="muted" style={{ display: 'block', fontSize: '.72rem', lineHeight: 1.3 }}>{l.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'links' && (
              <section className="panel link-settings-content" role="tabpanel">
                <div className="link-settings-section-heading">
                  <div><h3>Susun tautan</h3><p>Atur tombol, judul bagian, logo, dan urutannya.</p></div>
                </div>
                <div className="link-settings-section-stack">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '.9rem' }}>Daftar item ({form.links.length})</strong>
                      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                        <button type="button" className="small" onClick={() => addItem('link')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Plus style={{ width: 14, height: 14 }} /> Tautan
                        </button>
                        <button type="button" className="small" onClick={addCatalogLink} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <BookOpen style={{ width: 14, height: 14 }} /> Lihat Katalog
                        </button>
                        <button type="button" className="small secondary" onClick={() => addItem('text')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Type style={{ width: 14, height: 14 }} /> Teks
                        </button>
                        <button type="button" className="small secondary" onClick={() => addItem('divider')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <Minus style={{ width: 14, height: 14 }} /> Pembatas
                        </button>
                      </div>
                    </div>
                    <p className="muted" style={{ fontSize: '.8rem', margin: '.35rem 0 .6rem' }}>Seret handle untuk mengubah urutan. Item yang tidak aktif disembunyikan dari halaman.</p>
                    {form.links.length === 0 && <p className="muted" style={{ fontSize: '.85rem' }}>Belum ada item. Tambahkan tautan, teks, atau pembatas.</p>}
                    <div style={{ display: 'grid', gap: '.55rem' }}>
                      {form.links.map((link, i) => {
                        const type = link.type || 'link';
                        return (
                          <div
                            key={link.id}
                            className="link-settings-link-row"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => { if (dragIndex !== null && dragIndex !== i) moveLink(dragIndex, i); setDragIndex(null); }}
                            style={{ display: 'flex', gap: '.5rem', alignItems: 'center', padding: '.6rem', borderRadius: '.6rem', border: '1px solid var(--border)', background: dragIndex === i ? 'rgba(30,58,95,.08)' : 'var(--card)', flexWrap: 'wrap' }}
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
                            <select value={type} onChange={(e) => updateLink(i, { type: e.target.value })} style={{ width: 110, padding: '.45rem .5rem', borderRadius: '.45rem', border: '1px solid var(--border)', background: 'var(--card)' }} aria-label="Tipe item">
                              {typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>

                            {type === 'link' && (
                              <>
                                <select value={link.icon} onChange={(e) => updateLink(i, { icon: e.target.value })} style={{ width: 120, padding: '.45rem .5rem', borderRadius: '.45rem', border: '1px solid var(--border)', background: 'var(--card)' }} aria-label="Ikon">
                                  {iconOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                                <select value={link.layout || ''} onChange={(e) => updateLink(i, { layout: e.target.value })} style={{ width: 135, padding: '.45rem .5rem', borderRadius: '.45rem', border: '1px solid var(--border)', background: 'var(--card)' }} aria-label="Layout kartu">
                                  {cardLayoutOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                                <label className="media-upload" style={{ margin: 0 }}>
                                  {uploadingLogoIndex === i ? 'Mengunggah…' : <><ImagePlus style={{ width: 13, height: 13 }} /> Logo</>}
                                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploadingLogoIndex === i} onChange={(e) => uploadLinkLogo(i, e.target.files?.[0])} />
                                </label>
                                {link.logo && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <img src={mediaUrl(link.logo)} alt="" style={{ width: 26, height: 26, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--border)' }} />
                                    <button type="button" className="small secondary" onClick={() => updateLink(i, { logo: '' })} title="Hapus logo">×</button>
                                  </span>
                                )}
                                <input aria-label={`URL tautan ${i + 1}`} value={link.url} onChange={(e) => updateLink(i, { url: e.target.value })} placeholder="https://…" maxLength={1000} style={{ flex: '1 1 220px', minWidth: 200 }} />
                              </>
                            )}

                            <input
                              value={link.label}
                              onChange={(e) => updateLink(i, { label: e.target.value })}
                              placeholder={type === 'divider' ? 'Pembatas' : type === 'text' ? 'Judul bagian (mis. KATALOG)' : 'Label (mis. WhatsApp Admin 1)'}
                              maxLength={120}
                              style={{ flex: '1 1 180px', minWidth: type === 'divider' ? 120 : 160 }}
                            />

                            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: '.82rem', cursor: 'pointer' }} title="Aktif">
                              <input type="checkbox" checked={link.active} onChange={(e) => updateLink(i, { active: e.target.checked })} /> Aktif
                            </label>
                            <button type="button" className="small secondary" onClick={() => removeLink(i)} aria-label="Hapus item" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626' }}>
                              <Trash2 style={{ width: 14, height: 14 }} /> Hapus
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeSection === 'stats' && (
              <section className="panel lp-stats-panel">
                <div className="section-heading">
                  <div>
                    <h2>Statistik</h2>
                    <p className="muted" style={{ fontSize: '.85rem' }}>View dihitung setiap halaman dibuka, klik dihitung saat pengunjung menekan tombol.</p>
                  </div>
                  <div style={{ display: 'flex', gap: '.5rem', alignSelf: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="small secondary" onClick={exportStatsCsv} disabled={!stats} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Unduh Excel
                    </button>
                    <button type="button" className="small secondary" onClick={printStats} disabled={!stats} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      Unduh PDF
                    </button>
                    <button type="button" className="small secondary" onClick={resetStats} disabled={resetting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <RotateCcw style={{ width: 14, height: 14 }} /> Reset statistik
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: '.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.9rem', borderRadius: '.7rem', border: '1px solid var(--border)', background: 'var(--card)' }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(30,58,95,.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Eye style={{ width: 20, height: 20 }} />
                    </span>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{stats?.total_views ?? 0}</div>
                      <div className="muted" style={{ fontSize: '.8rem' }}>Total view halaman</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.9rem', borderRadius: '.7rem', border: '1px solid var(--border)', background: 'var(--card)' }}>
                    <span style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(37,99,235,.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MousePointerClick style={{ width: 20, height: 20 }} />
                    </span>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{clickTotal}</div>
                      <div className="muted" style={{ fontSize: '.8rem' }}>Total klik</div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginTop: '1rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 .6rem', fontSize: '.95rem' }}>View 14 hari terakhir</h3>
                    {(stats?.views_by_day || []).length === 0 ? (
                      <p className="muted" style={{ fontSize: '.85rem' }}>Belum ada data view.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: '.35rem' }}>
                        {[...(stats?.views_by_day || [])].reverse().map((d) => (
                          <div key={d.date} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontSize: '.84rem' }}>
                            <span style={{ width: 96, flexShrink: 0, color: 'var(--muted-foreground)' }}>{String(d.date).slice(0, 10)}</span>
                            <div style={{ flex: 1, height: 16, borderRadius: 6, background: 'var(--muted)', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, Math.round((d.views / Math.max(1, stats.total_views)) * 100))}%`, height: '100%', borderRadius: 6, background: 'var(--primary)' }} />
                            </div>
                            <strong style={{ width: 36, textAlign: 'right' }}>{d.views}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 style={{ margin: '0 0 .6rem', fontSize: '.95rem' }}>Klik per item</h3>
                    {(stats?.clicks || []).length === 0 ? (
                      <p className="muted" style={{ fontSize: '.85rem' }}>Belum ada klik. Statistik mengikuti item yang sudah dihapus tetap tersimpan sampai direset.</p>
                    ) : (
                      <div style={{ display: 'grid', gap: '.4rem' }}>
                        {stats.clicks.map((c) => (
                          <div key={c.item_id} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', fontSize: '.84rem' }}>
                            <span style={{ flex: '0 0 42%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--muted-foreground)' }} title={c.label || c.item_id}>
                              {c.label || c.item_id}
                            </span>
                            <div style={{ flex: 1, height: 16, borderRadius: 6, background: 'var(--muted)', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.round((c.clicks / maxClicks) * 100)}%`, height: '100%', borderRadius: 6, background: '#2563eb' }} />
                            </div>
                            <strong style={{ width: 36, textAlign: 'right' }}>{c.clicks}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {message && <p className="message link-settings-message" role="status">{message}</p>}

            <div className="link-settings-savebar">
              <span className={hasUnsavedChanges ? 'link-settings-save-state is-dirty' : 'link-settings-save-state'}>
                {saving ? 'Menyimpan perubahan…' : hasUnsavedChanges ? 'Ada perubahan belum disimpan' : 'Semua perubahan tersimpan'}
              </span>
              <button type="submit" disabled={saving}>
                {saving ? 'Menyimpan…' : 'Simpan perubahan'}
              </button>
            </div>
          </div>

          <aside className="link-settings-preview-column">
            <section className="panel link-settings-preview">
              <div className="link-settings-preview-heading">
                <div><h3>Pratinjau</h3><p>Seperti yang dilihat pengunjung di ponsel.</p></div>
                <span className="tag">Mobile</span>
              </div>
              <div className="link-settings-preview-frame">
                <LinkBioPage config={previewConfig} />
              </div>
              <a className="link-settings-preview-link" href={pageUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" /> Buka halaman publik
              </a>
            </section>
          </aside>
        </form>

        {showCreatePage && (
          <div className="link-settings-modal-backdrop">
            <section className="link-settings-create-modal" role="dialog" aria-modal="true" aria-labelledby="link-page-create-title">
              <div className="link-settings-modal-heading">
                <div><h3 id="link-page-create-title">Buat halaman baru</h3><p>Halaman akan mendapat URL publik sendiri.</p></div>
                <button type="button" className="link-settings-modal-close" onClick={() => setShowCreatePage(false)} aria-label="Tutup">
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className="link-settings-section-stack">
                <label>Nama halaman
                  <input value={newPageName} onChange={(e) => {
                    const value = e.target.value;
                    setNewPageName(value);
                    if (!newSlugEdited) setNewPageSlug(slugFromName(value));
                  }} maxLength={120} placeholder="Contoh: Koleksi Lebaran" autoFocus />
                </label>
                <label>Slug URL
                  <input value={newPageSlug} onChange={(e) => { setNewPageSlug(e.target.value.toLowerCase()); setNewSlugEdited(true); }} maxLength={80} placeholder="koleksi-lebaran" />
                </label>
                <label className="link-settings-checkbox">
                  <input type="checkbox" checked={duplicateCurrent} onChange={(e) => setDuplicateCurrent(e.target.checked)} />
                  Salin desain dan tautan dari halaman ini
                </label>
              </div>
              <div className="link-settings-modal-actions">
                <button type="button" className="small secondary" onClick={() => setShowCreatePage(false)}>Batal</button>
                <button type="button" onClick={createPage} disabled={saving || !newPageName.trim() || !newPageSlug.trim()}>
                  <Plus aria-hidden="true" /> {saving ? 'Memproses…' : duplicateCurrent ? 'Duplikat halaman' : 'Buat halaman'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </AppShell>
  );
}
