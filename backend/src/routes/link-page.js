const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { decodeDataUpload, persistUploadedFile, removeMedia } = require('../media-storage');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
  validate: { ip: false },
  handler: (req, res) => res.status(429).json({ success: false, message: 'Terlalu banyak permintaan, coba lagi nanti' }),
});

const CONFIG_KEY = 'link_page';
const THEMES = new Set(['denim', 'dark', 'light', 'sage']);
const LAYOUTS = new Set(['list', 'grid', 'carousel', 'showcase']);
const BACKGROUND_TYPES = new Set(['theme', 'image', 'gradient']);
const ITEM_TYPES = new Set(['link', 'text', 'divider']);
const ICONS = new Set(['whatsapp', 'channel', 'instagram', 'tiktok', 'shopee', 'toco', 'pdf', 'catalog', 'phone', 'map', 'email', 'link']);
const MAX_LINKS = 40;
const AVATAR_FOLDER = 'link-avatars';
const LOGO_FOLDER = 'link-logos';
const MAX_SOCIAL = 8;

function cleanWa(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? '62' + digits.slice(1) : digits;
}

function waUrl(phone) {
  const clean = cleanWa(phone);
  return clean ? `https://wa.me/${clean}` : '';
}

async function resolveBranchId(queryBranchId) {
  const requested = Number(queryBranchId) || null;
  if (requested && Number.isInteger(requested)) return requested;
  const [metro] = await db.execute("SELECT id FROM branches WHERE name LIKE '%metro%' AND is_active=TRUE ORDER BY id LIMIT 1");
  if (metro[0]) return metro[0].id;
  const [first] = await db.execute('SELECT id FROM branches WHERE is_active=TRUE ORDER BY id LIMIT 1');
  return first[0]?.id || null;
}

async function loadBranchAndSettings(branchId) {
  const [branchRows] = await db.execute('SELECT id, name, address, phone FROM branches WHERE id=? AND is_active=TRUE LIMIT 1', [branchId]);
  const [settingsRows] = await db.execute('SELECT `key`, `value` FROM store_settings WHERE branch_id=?', [branchId]);
  return {
    branch: branchRows[0] || null,
    settings: Object.fromEntries(settingsRows.map((r) => [r.key, r.value])),
  };
}

function collectWaList(settings, branch) {
  let waList = [];
  try {
    if (settings.whatsapp_numbers) {
      const parsed = JSON.parse(settings.whatsapp_numbers);
      if (Array.isArray(parsed)) waList = parsed.filter(Boolean);
    }
  } catch {}
  ['whatsapp_number', 'whatsapp_number_2', 'whatsapp_number_3', 'whatsapp_admin_1', 'whatsapp_admin_2', 'whatsapp_admin_3'].forEach((k) => {
    if (settings[k] && !waList.includes(settings[k])) waList.push(settings[k]);
  });
  if (!waList.length) {
    const fallback = settings.store_phone || branch?.phone || '';
    if (fallback) waList = [fallback];
  }
  return [...new Set(waList.filter(Boolean))];
}

function defaultConfig({ branch, settings }) {
  const storeName = settings.store_name || branch?.name || 'Anyostore';
  const waList = collectWaList(settings, branch);
  const social = waList.map((num, i) => ({
    id: `soc-wa${i + 1}`,
    icon: 'whatsapp',
    url: waUrl(num),
    active: true,
  }));
  social.push(
    { id: 'soc-instagram', icon: 'instagram', url: 'https://www.instagram.com/anyostore.pgmta', active: true },
    { id: 'soc-tiktok', icon: 'tiktok', url: 'https://www.tiktok.com/@anyostore', active: true },
    { id: 'soc-shopee', icon: 'shopee', url: 'https://shopee.co.id/anyostore', active: true },
  );
  const links = waList.map((num, i) => ({
    id: `wa${i + 1}`,
    type: 'link',
    label: i === 0 ? 'WhatsApp Admin' : `WhatsApp Admin ${i + 1}`,
    url: waUrl(num),
    icon: 'whatsapp',
    logo: '',
    active: true,
  }));
  links.push(
    { id: 'wa-channel', type: 'link', label: 'WhatsApp Channel', url: 'https://whatsapp.com/channel/0029VbDIHJ79hXFFZjnRGz3n', icon: 'channel', logo: '', active: true },
    { id: 'instagram', type: 'link', label: 'Instagram', url: 'https://www.instagram.com/anyostore.pgmta', icon: 'instagram', logo: '', active: true },
    { id: 'tiktok', type: 'link', label: 'TikTok', url: 'https://www.tiktok.com/@anyostore', icon: 'tiktok', logo: '', active: true },
    { id: 'shopee', type: 'link', label: 'Shopee Mall', url: 'https://shopee.co.id/anyostore', icon: 'shopee', logo: '', active: true },
    { id: 'toco', type: 'link', label: 'Toko TOCO', url: 'https://toco.id/store/anyostore', icon: 'toco', logo: '', active: true },
  );
  return {
    title: storeName,
    subtitle: 'Denim wanita grosir & reseller',
    address: settings.store_address || branch?.address || '',
    hours: '07.00 - 14.00 WIB',
    min_order: 'Min. 4 pcs per model',
    avatar: settings.store_logo || '',
    theme: 'denim',
    layout: 'list',
    background_type: 'theme',
    background: '',
    show_info: true,
    social,
    links,
  };
}

function parseConfig(raw, { branch, settings }) {
  if (!raw) return defaultConfig({ branch, settings });
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.links)) return defaultConfig({ branch, settings });
    return parsed;
  } catch {
    return defaultConfig({ branch, settings });
  }
}

function publicItem(item) {
  const id = String(item.id || '').slice(0, 64);
  const type = ITEM_TYPES.has(item.type) ? item.type : 'link';
  if (type === 'divider') return { id, type, active: true };
  const label = String(item.label || '').slice(0, 120);
  if (type === 'text') return { id, type, label, active: true };
  return {
    id,
    type,
    label,
    url: String(item.url || '').slice(0, 1000),
    icon: ICONS.has(item.icon) ? item.icon : 'link',
    logo: String(item.logo || '').startsWith('/uploads/') ? String(item.logo).slice(0, 500) : '',
    layout: LAYOUTS.has(item.layout) ? item.layout : '',
    active: true,
  };
}

function sanitizePublic(config) {
  let background = '';
  const bgType = BACKGROUND_TYPES.has(config.background_type) ? config.background_type : 'theme';
  if (bgType === 'image' && String(config.background || '').startsWith('/uploads/')) background = String(config.background).slice(0, 500);
  if (bgType === 'gradient' && /^(linear|radial)-gradient\(/i.test(String(config.background || ''))) background = String(config.background).slice(0, 500);
  const social = Array.isArray(config.social)
    ? config.social
        .filter((s) => s && s.active && s.url)
        .slice(0, MAX_SOCIAL)
        .map((s) => ({
          id: String(s.id || '').slice(0, 64),
          icon: ICONS.has(s.icon) ? s.icon : 'link',
          url: String(s.url || '').slice(0, 1000),
          active: true,
        }))
    : [];
  const links = Array.isArray(config.links)
    ? config.links
        .filter((l) => {
          if (!l || !l.active) return false;
          const type = ITEM_TYPES.has(l.type) ? l.type : 'link';
          if (type === 'divider') return true;
          if (type === 'text') return Boolean(String(l.label || '').trim());
          return Boolean(String(l.label || '').trim() && String(l.url || '').trim());
        })
        .map(publicItem)
    : [];
  return {
    title: String(config.title || '').slice(0, 120),
    subtitle: String(config.subtitle || '').slice(0, 300),
    address: String(config.address || '').slice(0, 300),
    hours: String(config.hours || '').slice(0, 120),
    min_order: String(config.min_order || '').slice(0, 160),
    avatar: String(config.avatar || ''),
    theme: THEMES.has(config.theme) ? config.theme : 'denim',
    layout: LAYOUTS.has(config.layout) ? config.layout : 'list',
    background_type: bgType,
    background,
    show_info: config.show_info !== false,
    social,
    links,
  };
}

function validateConfig(body) {
  const errors = [];
  if (body.title != null && String(body.title).length > 120) errors.push('Judul maksimal 120 karakter');
  if (body.subtitle != null && String(body.subtitle).length > 300) errors.push('Deskripsi maksimal 300 karakter');
  if (body.address != null && String(body.address).length > 300) errors.push('Alamat maksimal 300 karakter');
  if (body.hours != null && String(body.hours).length > 120) errors.push('Jam operasional maksimal 120 karakter');
  if (body.min_order != null && String(body.min_order).length > 160) errors.push('Min. order maksimal 160 karakter');
  if (body.theme != null && !THEMES.has(body.theme)) errors.push('Tema tidak valid');
  if (body.layout != null && !LAYOUTS.has(body.layout)) errors.push('Layout tidak valid');
  if (body.background_type != null && !BACKGROUND_TYPES.has(body.background_type)) errors.push('Tipe background tidak valid');
  if (body.background_type === 'image' && body.background != null && !String(body.background || '').startsWith('/uploads/')) errors.push('Background foto tidak valid');
  if (body.background_type === 'gradient' && body.background != null && !/^(linear|radial)-gradient\(/i.test(String(body.background || ''))) errors.push('Background gradient tidak valid (contoh: linear-gradient(135deg, #1e3a5f 0%, #e9eef5 100%))');
  if (body.avatar != null && body.avatar !== '' && !String(body.avatar).startsWith('/uploads/')) errors.push('Avatar tidak valid');
  if (body.social != null) {
    if (!Array.isArray(body.social) || body.social.length > MAX_SOCIAL) errors.push(`Bar ikon sosial maksimal ${MAX_SOCIAL} ikon`);
    else {
      for (const [i, s] of body.social.entries()) {
        if (!s || typeof s !== 'object') { errors.push(`Ikon sosial ke-${i + 1} tidak valid`); continue; }
        if (s.icon != null && !ICONS.has(s.icon)) errors.push(`Ikon sosial ke-${i + 1} tidak valid`);
        const url = String(s.url || '').trim();
        if (url && !/^https?:\/\//i.test(url) && !url.startsWith('/')) errors.push(`URL sosial ke-${i + 1} harus diawali http://, https://, atau /`);
        if (url.length > 1000) errors.push(`URL sosial ke-${i + 1} terlalu panjang`);
      }
    }
  }
  if (body.links != null) {
    if (!Array.isArray(body.links) || body.links.length > MAX_LINKS) errors.push(`Jumlah item maksimal ${MAX_LINKS}`);
    else {
      for (const [i, l] of body.links.entries()) {
        if (!l || typeof l !== 'object') { errors.push(`Item ke-${i + 1} tidak valid`); continue; }
        const type = ITEM_TYPES.has(l.type) ? l.type : 'link';
        if (type !== 'divider' && !String(l.label || '').trim()) errors.push(`Label item ke-${i + 1} wajib diisi`);
        if (String(l.label || '').length > 120) errors.push(`Label item ke-${i + 1} maksimal 120 karakter`);
        if (type === 'link') {
          const url = String(l.url || '').trim();
          if (!url) errors.push(`URL item ke-${i + 1} wajib diisi`);
          else if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) errors.push(`URL item ke-${i + 1} harus diawali http://, https://, atau /`);
          if (url.length > 1000) errors.push(`URL item ke-${i + 1} terlalu panjang`);
        }
        if (l.icon != null && !ICONS.has(l.icon)) errors.push(`Ikon item ke-${i + 1} tidak valid`);
        if (l.layout != null && l.layout !== '' && !LAYOUTS.has(l.layout)) errors.push(`Layout item ke-${i + 1} tidak valid`);
        if (l.logo != null && l.logo !== '' && !String(l.logo).startsWith('/uploads/')) errors.push(`Logo item ke-${i + 1} tidak valid`);
      }
    }
  }
  return errors;
}

// GET /api/link-page — publik (tanpa login), sekaligus mencatat view harian
router.get('/', publicLimiter, async (req, res, next) => {
  try {
    const branchId = await resolveBranchId(req.query.branch_id);
    if (!branchId) return res.json({ success: true, data: { branch_id: null, title: 'Anyostore', links: [] } });
    const { branch, settings } = await loadBranchAndSettings(branchId);
    if (!branch) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    const config = sanitizePublic(parseConfig(settings[CONFIG_KEY], { branch, settings }));
    await db.execute(
      `INSERT INTO link_page_views (branch_id, view_date, views)
       VALUES (?, DATE(CONVERT_TZ(NOW(), '+00:00', '+07:00')), 1)
       ON DUPLICATE KEY UPDATE views = views + 1`
    , [branchId]);
    res.json({ success: true, data: { branch_id: branchId, ...config } });
  } catch (e) { next(e); }
});

// POST /api/link-page/click — publik, catat klik per item
router.post('/click', publicLimiter, async (req, res, next) => {
  try {
    const branchId = Number(req.body.branch_id || req.query.branch_id) || await resolveBranchId(null);
    const itemId = String(req.body.item_id || '').slice(0, 64);
    const label = String(req.body.label || '').slice(0, 120);
    if (!Number.isInteger(branchId) || !itemId) {
      return res.status(400).json({ success: false, message: 'branch_id dan item_id wajib diisi' });
    }
    await db.execute(
      `INSERT INTO link_page_clicks (branch_id, item_id, label, clicks, last_clicked_at)
       VALUES (?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE clicks = clicks + 1, label = VALUES(label), last_clicked_at = NOW()`,
      [branchId, itemId, label]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /api/link-page/config — owner saja, untuk halaman pengaturan (termasuk statistik)
router.get('/config', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const branchId = Number(req.query.branch_id) || req.user.branch_id;
    if (!Number.isInteger(branchId)) return res.status(400).json({ success: false, message: 'ID toko tidak valid' });
    const [branches] = await db.execute('SELECT id, name, is_active, type FROM branches ORDER BY id');
    const { branch, settings } = await loadBranchAndSettings(branchId);
    if (!branch) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    const config = parseConfig(settings[CONFIG_KEY], { branch, settings });
    const [viewsRows] = await db.execute(
      'SELECT view_date, views FROM link_page_views WHERE branch_id=? ORDER BY view_date DESC LIMIT 14',
      [branchId]
    );
    const [viewsTotal] = await db.execute(
      'SELECT COALESCE(SUM(views),0) AS total FROM link_page_views WHERE branch_id=?',
      [branchId]
    );
    const [clicksRows] = await db.execute(
      'SELECT item_id, label, clicks, last_clicked_at FROM link_page_clicks WHERE branch_id=? ORDER BY clicks DESC',
      [branchId]
    );
    const stats = {
      total_views: Number(viewsTotal[0]?.total || 0),
      views_by_day: viewsRows.map((r) => ({ date: r.view_date, views: Number(r.views) })),
      clicks: clicksRows.map((r) => ({ item_id: r.item_id, label: r.label, clicks: Number(r.clicks), last_clicked_at: r.last_clicked_at })),
    };
    res.json({ success: true, data: { branches, branch_id: branchId, store_name: branch.name, stats, ...config } });
  } catch (e) { next(e); }
});

// PUT /api/link-page — simpan konfigurasi (owner saja)
router.put('/', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const branchId = Number(req.body.branch_id || req.query.branch_id || req.user.branch_id);
    if (!Number.isInteger(branchId)) return res.status(400).json({ success: false, message: 'ID toko tidak valid' });
    const [branches] = await db.execute('SELECT id FROM branches WHERE id=? AND is_active=TRUE', [branchId]);
    if (!branches[0]) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });

    const errors = validateConfig(req.body);
    if (errors.length) return res.status(400).json({ success: false, message: errors.join('; ') });

    const existing = req.body;
    const bgType = BACKGROUND_TYPES.has(existing.background_type) ? existing.background_type : 'theme';
    let background = String(existing.background || '');
    if (bgType === 'image' && !background.startsWith('/uploads/')) background = '';
    if (bgType === 'gradient' && !/^(linear|radial)-gradient\(/i.test(background)) background = '';
    if (bgType === 'theme') background = '';
    const social = Array.isArray(existing.social)
      ? existing.social.slice(0, MAX_SOCIAL).map((s, i) => ({
          id: String(s.id || `soc-${i + 1}`).slice(0, 64),
          icon: ICONS.has(s.icon) ? s.icon : 'link',
          url: String(s.url || '').trim().slice(0, 1000),
          active: s.active !== false,
        }))
      : [];
    const config = {
      title: String(existing.title ?? '').slice(0, 120),
      subtitle: String(existing.subtitle ?? '').slice(0, 300),
      address: String(existing.address ?? '').slice(0, 300),
      hours: String(existing.hours ?? '').slice(0, 120),
      min_order: String(existing.min_order ?? '').slice(0, 160),
      avatar: String(existing.avatar ?? ''),
      theme: THEMES.has(existing.theme) ? existing.theme : 'denim',
      layout: LAYOUTS.has(existing.layout) ? existing.layout : 'list',
      background_type: bgType,
      background,
      show_info: existing.show_info !== false,
      social,
      links: Array.isArray(existing.links)
        ? existing.links.slice(0, MAX_LINKS).map((l, i) => {
            const type = ITEM_TYPES.has(l.type) ? l.type : 'link';
            return {
              id: String(l.id || `link-${i + 1}`).slice(0, 64),
              type,
              label: String(l.label || '').trim().slice(0, 120),
              url: type === 'link' ? String(l.url || '').trim().slice(0, 1000) : '',
              icon: ICONS.has(l.icon) ? l.icon : 'link',
              logo: String(l.logo || '').startsWith('/uploads/') ? String(l.logo).slice(0, 500) : '',
              layout: LAYOUTS.has(l.layout) ? l.layout : '',
              active: l.active !== false,
            };
          })
        : [],
    };

    await db.execute(
      'INSERT INTO store_settings (branch_id, `key`, `value`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
      [branchId, CONFIG_KEY, JSON.stringify(config)]
    );
    res.json({ success: true, data: { branch_id: branchId } });
  } catch (e) { next(e); }
});

// POST /api/link-page/avatar — upload avatar halaman link (owner saja)
router.post('/avatar', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const branchId = Number(req.body.branch_id || req.query.branch_id || req.user.branch_id);
    if (!Number.isInteger(branchId)) return res.status(400).json({ success: false, message: 'ID toko tidak valid' });
    const [branches] = await db.execute('SELECT id FROM branches WHERE id=? AND is_active=TRUE', [branchId]);
    if (!branches[0]) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });

    const file = decodeDataUpload(req.body, { fileSize: 3 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    const [settingsRows] = await db.execute('SELECT `value` FROM store_settings WHERE branch_id=? AND `key`=? LIMIT 1', [branchId, CONFIG_KEY]);
    let config = {};
    try { config = JSON.parse(settingsRows[0]?.value || '{}'); } catch {}
    const oldPath = config.avatar || '';
    const publicPath = await persistUploadedFile(file, AVATAR_FOLDER);
    config.avatar = publicPath;
    await db.execute(
      'INSERT INTO store_settings (branch_id, `key`, `value`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)',
      [branchId, CONFIG_KEY, JSON.stringify(config)]
    );
    if (oldPath && oldPath !== publicPath && oldPath.startsWith(`/uploads/${AVATAR_FOLDER}/`)) {
      await removeMedia(oldPath).catch(() => {});
    }
    res.status(201).json({ success: true, data: { avatar: publicPath } });
  } catch (e) { next(e); }
});

// POST /api/link-page/media — upload logo custom per item (owner saja, tidak menyimpan config)
router.post('/media', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const file = decodeDataUpload(req.body, { fileSize: 3 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    const publicPath = await persistUploadedFile(file, LOGO_FOLDER);
    res.status(201).json({ success: true, data: { path: publicPath } });
  } catch (e) { next(e); }
});

// POST /api/link-page/stats/reset — hapus statistik (owner saja)
router.post('/stats/reset', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const branchId = Number(req.body.branch_id || req.query.branch_id || req.user.branch_id);
    if (!Number.isInteger(branchId)) return res.status(400).json({ success: false, message: 'ID toko tidak valid' });
    await Promise.all([
      db.execute('DELETE FROM link_page_views WHERE branch_id=?', [branchId]),
      db.execute('DELETE FROM link_page_clicks WHERE branch_id=?', [branchId]),
    ]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
