const express = require('express');
const db = require('../db');
const { authenticate, authorize } = require('../auth');
const { decodeDataUpload, persistUploadedFile, removeMedia } = require('../media-storage');

const router = express.Router();

const CONFIG_KEY = 'link_page';
const THEMES = new Set(['denim', 'dark', 'light']);
const ICONS = new Set(['whatsapp', 'channel', 'instagram', 'tiktok', 'shopee', 'toco', 'pdf', 'catalog', 'phone', 'map', 'email', 'link']);
const MAX_LINKS = 40;
const AVATAR_FOLDER = 'link-avatars';

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
  const links = waList.map((num, i) => ({
    id: `wa${i + 1}`,
    label: i === 0 ? 'WhatsApp Admin' : `WhatsApp Admin ${i + 1}`,
    url: waUrl(num),
    icon: 'whatsapp',
    active: true,
  }));
  links.push(
    { id: 'wa-channel', label: 'WhatsApp Channel', url: 'https://whatsapp.com/channel/0029VbDIHJ79hXFFZjnRGz3n', icon: 'channel', active: true },
    { id: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/anyostore.pgmta', icon: 'instagram', active: true },
    { id: 'tiktok', label: 'TikTok', url: 'https://www.tiktok.com/@anyostore', icon: 'tiktok', active: true },
    { id: 'shopee', label: 'Shopee Mall', url: 'https://shopee.co.id/anyostore', icon: 'shopee', active: true },
    { id: 'toco', label: 'Toko TOCO', url: 'https://toco.id/store/anyostore', icon: 'toco', active: true },
  );
  return {
    title: storeName,
    subtitle: 'Denim wanita grosir & reseller',
    address: settings.store_address || branch?.address || '',
    hours: '07.00 - 14.00 WIB',
    min_order: 'Min. 4 pcs per model',
    avatar: settings.store_logo || '',
    theme: 'denim',
    show_info: true,
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

function sanitizePublic(config) {
  const links = Array.isArray(config.links)
    ? config.links
        .filter((l) => l && l.active && l.url && l.label)
        .map((l) => ({
          id: String(l.id || ''),
          label: String(l.label || '').slice(0, 120),
          url: String(l.url || '').slice(0, 1000),
          icon: ICONS.has(l.icon) ? l.icon : 'link',
          active: true,
        }))
    : [];
  return {
    title: String(config.title || '').slice(0, 120),
    subtitle: String(config.subtitle || '').slice(0, 300),
    address: String(config.address || '').slice(0, 300),
    hours: String(config.hours || '').slice(0, 120),
    min_order: String(config.min_order || '').slice(0, 160),
    avatar: String(config.avatar || ''),
    theme: THEMES.has(config.theme) ? config.theme : 'denim',
    show_info: config.show_info !== false,
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
  if (body.avatar != null && body.avatar !== '' && !String(body.avatar).startsWith('/uploads/')) errors.push('Avatar tidak valid');
  if (body.links != null) {
    if (!Array.isArray(body.links) || body.links.length > MAX_LINKS) errors.push(`Jumlah link maksimal ${MAX_LINKS}`);
    else {
      for (const [i, l] of body.links.entries()) {
        if (!l || typeof l !== 'object') { errors.push(`Link ke-${i + 1} tidak valid`); continue; }
        if (!String(l.label || '').trim()) errors.push(`Label link ke-${i + 1} wajib diisi`);
        if (String(l.label || '').length > 120) errors.push(`Label link ke-${i + 1} maksimal 120 karakter`);
        const url = String(l.url || '').trim();
        if (url && !/^https?:\/\//i.test(url)) errors.push(`URL link ke-${i + 1} harus diawali http:// atau https://`);
        if (url.length > 1000) errors.push(`URL link ke-${i + 1} terlalu panjang`);
        if (l.icon != null && !ICONS.has(l.icon)) errors.push(`Ikon link ke-${i + 1} tidak valid`);
      }
    }
  }
  return errors;
}

// GET /api/link-page — publik (tanpa login)
router.get('/', async (req, res, next) => {
  try {
    const branchId = await resolveBranchId(req.query.branch_id);
    if (!branchId) return res.json({ success: true, data: { branch_id: null, title: 'Anyostore', links: [] } });
    const { branch, settings } = await loadBranchAndSettings(branchId);
    if (!branch) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    const config = sanitizePublic(parseConfig(settings[CONFIG_KEY], { branch, settings }));
    res.json({ success: true, data: { branch_id: branchId, ...config } });
  } catch (e) { next(e); }
});

// GET /api/link-page/config — owner saja, untuk halaman pengaturan
router.get('/config', authenticate, authorize('owner'), async (req, res, next) => {
  try {
    const branchId = Number(req.query.branch_id) || req.user.branch_id;
    if (!Number.isInteger(branchId)) return res.status(400).json({ success: false, message: 'ID toko tidak valid' });
    const [branches] = await db.execute('SELECT id, name, is_active, type FROM branches ORDER BY id');
    const { branch, settings } = await loadBranchAndSettings(branchId);
    if (!branch) return res.status(404).json({ success: false, message: 'Toko tidak ditemukan' });
    const config = parseConfig(settings[CONFIG_KEY], { branch, settings });
    res.json({ success: true, data: { branches, branch_id: branchId, store_name: branch.name, ...config } });
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
    const config = {
      title: String(existing.title ?? '').slice(0, 120),
      subtitle: String(existing.subtitle ?? '').slice(0, 300),
      address: String(existing.address ?? '').slice(0, 300),
      hours: String(existing.hours ?? '').slice(0, 120),
      min_order: String(existing.min_order ?? '').slice(0, 160),
      avatar: String(existing.avatar ?? ''),
      theme: THEMES.has(existing.theme) ? existing.theme : 'denim',
      show_info: existing.show_info !== false,
      links: Array.isArray(existing.links)
        ? existing.links.slice(0, MAX_LINKS).map((l, i) => ({
            id: String(l.id || `link-${i + 1}`),
            label: String(l.label || '').trim().slice(0, 120),
            url: String(l.url || '').trim().slice(0, 1000),
            icon: ICONS.has(l.icon) ? l.icon : 'link',
            active: l.active !== false,
          }))
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

module.exports = router;
