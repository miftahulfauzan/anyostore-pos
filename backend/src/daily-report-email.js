const db = require('./db');
const { localDateString } = require('./local-date');

const DEFAULT_API_URL = 'https://api.resend.com/emails';
const EMAIL_TIME_ZONE = 'Asia/Jakarta';

function currentWibTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: EMAIL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatQty(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function isSafeEmailApiUrl(value) {
  try {
    const parsed = new URL(value || DEFAULT_API_URL);
    return parsed.protocol === 'https:' && parsed.hostname === 'api.resend.com' && parsed.pathname === '/emails' && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function productRowsHtml(products) {
  if (!products.length) return '<tr><td colspan="3" style="padding:12px;text-align:center;color:#64748b">Tidak ada pergerakan stok hari ini.</td></tr>';
  return products.map((product) => `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(product.name)}<br><small style="color:#64748b">${escapeHtml(product.sku || '')}</small></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#15803d">+${formatQty(product.incoming)}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">-${formatQty(product.outgoing)}</td></tr>`).join('');
}

function buildDailyEmailHtml({ branchName = 'Semua toko dan gudang', reportDate, totals, products = [], branches = [] }) {
  const typeSummary = ['toko', 'gudang'].map((type) => {
    const matching = branches.filter((branch) => branch.type === type);
    return {
      type,
      count: matching.length,
      incoming: matching.reduce((sum, branch) => sum + branch.totals.incoming, 0),
      outgoing: matching.reduce((sum, branch) => sum + branch.totals.outgoing, 0),
    };
  });
  const summaryRows = branches.length
    ? `${typeSummary.map((item) => `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">${item.type === 'gudang' ? 'Gudang' : 'Toko'} (${formatQty(item.count)} cabang)</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#15803d">+${formatQty(item.incoming)}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">-${formatQty(item.outgoing)}</td></tr>`).join('')}<tr style="font-weight:bold;background:#f1f5f9"><td style="padding:8px">Total semua cabang</td><td style="padding:8px;text-align:right;color:#15803d">+${formatQty(totals.incoming)}</td><td style="padding:8px;text-align:right;color:#b91c1c">-${formatQty(totals.outgoing)}</td></tr>`
    : `<tr style="font-weight:bold"><td style="padding:8px">${escapeHtml(branchName)}</td><td style="padding:8px;text-align:right;color:#15803d">+${formatQty(totals.incoming)}</td><td style="padding:8px;text-align:right;color:#b91c1c">-${formatQty(totals.outgoing)}</td></tr>`;
  const sections = branches.length
    ? branches.map((branch) => `<section style="margin-top:24px"><h2 style="font-size:17px;margin:0 0 4px">${escapeHtml(branch.name)} <small style="font-size:12px;color:#64748b;font-weight:normal">· ${branch.type === 'gudang' ? 'Gudang' : 'Toko'}</small></h2><p style="margin:0 0 8px;color:#64748b;font-size:13px">Masuk <strong style="color:#15803d">+${formatQty(branch.totals.incoming)}</strong> · Keluar <strong style="color:#b91c1c">-${formatQty(branch.totals.outgoing)}</strong></p><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;border-bottom:2px solid #cbd5e1"><th style="padding:8px">Produk</th><th style="padding:8px;text-align:right">Masuk</th><th style="padding:8px;text-align:right">Keluar</th></tr></thead><tbody>${productRowsHtml(branch.products)}</tbody></table>${branch.omittedProducts ? `<p style="color:#64748b;font-size:12px">${formatQty(branch.omittedProducts)} produk lain tidak ditampilkan.</p>` : ''}</section>`).join('')
    : `<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;border-bottom:2px solid #cbd5e1"><th style="padding:8px">Produk</th><th style="padding:8px;text-align:right">Masuk</th><th style="padding:8px;text-align:right">Keluar</th></tr></thead><tbody>${productRowsHtml(products)}</tbody></table>`;
  const branchCount = branches.length || (products.length ? 1 : 0);
  return `<!doctype html><html lang="id"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><div style="max-width:760px;margin:0 auto"><h1 style="font-size:22px;margin-bottom:4px">Laporan Harian Stok · Semua Toko &amp; Gudang</h1><p style="margin-top:0;color:#64748b">${escapeHtml(reportDate)} · ${formatQty(branchCount)} cabang aktif</p><h2 style="font-size:17px;margin:20px 0 8px">Ringkasan gabungan</h2><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;border-bottom:2px solid #cbd5e1"><th style="padding:8px">Cabang</th><th style="padding:8px;text-align:right">Stok masuk</th><th style="padding:8px;text-align:right">Stok keluar</th></tr></thead><tbody>${summaryRows}</tbody></table>${sections}<p style="margin-top:24px;color:#64748b;font-size:12px">Email otomatis ini merangkum mutasi stok yang tercatat pada seluruh toko dan gudang aktif di Anyostore.</p></div></body></html>`;
}

async function getAllBranchesReport(reportDate) {
  const [branchRows] = await db.execute(
    `SELECT b.id, b.name, COALESCE(b.type, 'toko') AS type,
            COALESCE(SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END), 0) AS incoming,
            COALESCE(SUM(CASE WHEN sm.qty < 0 THEN -sm.qty ELSE 0 END), 0) AS outgoing
       FROM branches b
       LEFT JOIN stock_mutations sm ON sm.branch_id = b.id AND DATE(sm.created_at) = ?
      WHERE b.is_active = TRUE
      GROUP BY b.id, b.name, b.type
      ORDER BY CASE WHEN b.type = 'gudang' THEN 1 ELSE 0 END, b.name`,
    [reportDate],
  );
  const [productRows] = await db.execute(
    `SELECT sm.branch_id, p.name, p.sku,
            COALESCE(SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END), 0) AS incoming,
            COALESCE(SUM(CASE WHEN sm.qty < 0 THEN -sm.qty ELSE 0 END), 0) AS outgoing
       FROM stock_mutations sm
       JOIN branches b ON b.id = sm.branch_id AND b.is_active = TRUE
       JOIN products p ON p.id = sm.product_id
      WHERE DATE(sm.created_at) = ?
      GROUP BY sm.branch_id, p.id, p.name, p.sku
      ORDER BY sm.branch_id, (incoming + outgoing) DESC, p.name`,
    [reportDate],
  );
  const productsByBranch = new Map();
  for (const product of productRows) {
    const items = productsByBranch.get(Number(product.branch_id)) || [];
    if (items.length < 50) {
      items.push({ ...product, incoming: Number(product.incoming || 0), outgoing: Number(product.outgoing || 0) });
    } else {
      items.omitted = (items.omitted || 0) + 1;
    }
    productsByBranch.set(Number(product.branch_id), items);
  }
  const branches = branchRows.map((branch) => {
    const branchProducts = productsByBranch.get(Number(branch.id)) || [];
    return {
      id: Number(branch.id),
      name: branch.name,
      type: branch.type === 'gudang' ? 'gudang' : 'toko',
      totals: { incoming: Number(branch.incoming || 0), outgoing: Number(branch.outgoing || 0) },
      products: branchProducts,
      omittedProducts: branchProducts.omitted || 0,
    };
  });
  return {
    branchName: 'Semua toko dan gudang',
    reportDate,
    branches,
    totals: branches.reduce((sum, branch) => ({
      incoming: sum.incoming + branch.totals.incoming,
      outgoing: sum.outgoing + branch.totals.outgoing,
    }), { incoming: 0, outgoing: 0 }),
  };
}

async function sendEmail(config, report) {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject: `Laporan stok semua toko dan gudang — ${report.reportDate}`,
      html: buildDailyEmailHtml(report),
    }),
  });
  if (!response.ok) throw new Error(`provider email mengembalikan HTTP ${response.status}`);
}

async function runDailyReportEmail(now = new Date()) {
  const currentTime = currentWibTime(now);
  const reportDate = localDateString(now);
  const [rows] = await db.execute(
    `SELECT b.id, b.name,
            MAX(CASE WHEN ss.key = 'daily_email_enabled' THEN ss.value END) AS enabled,
            MAX(CASE WHEN ss.key = 'daily_email_to' THEN ss.value END) AS email_to,
            MAX(CASE WHEN ss.key = 'daily_email_from' THEN ss.value END) AS email_from,
            MAX(CASE WHEN ss.key = 'daily_email_time' THEN ss.value END) AS email_time,
            MAX(CASE WHEN ss.key = 'daily_email_api_url' THEN ss.value END) AS api_url,
            MAX(CASE WHEN ss.key = 'daily_email_api_key' THEN ss.value END) AS api_key,
            MAX(CASE WHEN ss.key = 'daily_email_last_sent_date' THEN ss.value END) AS last_sent_date
       FROM branches b
       LEFT JOIN store_settings ss ON ss.branch_id = b.id
      WHERE b.is_active = TRUE
      GROUP BY b.id, b.name`,
  );
  const configsByRecipient = new Map();
  for (const row of rows) {
    if (String(row.enabled) !== 'true') continue;
    if (!row.email_to || !row.email_from || !row.api_key || !isSafeEmailApiUrl(row.api_url || DEFAULT_API_URL)) {
      const due = currentTime >= String(row.email_time || '19:00');
      const alreadySent = String(row.last_sent_date || '') === reportDate;
      if (due && !alreadySent) console.warn(`[daily-email] konfigurasi belum lengkap untuk cabang ${row.id}; email dilewati`);
      continue;
    }
    const recipientKey = String(row.email_to).trim().toLowerCase();
    const matching = configsByRecipient.get(recipientKey) || [];
    matching.push(row);
    configsByRecipient.set(recipientKey, matching);
  }
  const dueGroups = [...configsByRecipient.values()]
    .filter((matchingRows) => !matchingRows.some((row) => String(row.last_sent_date || '') === reportDate))
    .map((matchingRows) => ({
      matchingRows,
      dueRows: matchingRows.filter((row) => currentTime >= String(row.email_time || '19:00')),
    }))
    .filter((group) => group.dueRows.length);
  if (!dueGroups.length) return 0;

  const report = await getAllBranchesReport(reportDate);
  let sent = 0;
  for (const { matchingRows, dueRows } of dueGroups) {
    const configRow = dueRows[0];
    try {
      await sendEmail({ to: configRow.email_to, from: configRow.email_from, apiKey: configRow.api_key, apiUrl: configRow.api_url || DEFAULT_API_URL }, report);
      for (const row of matchingRows) {
        await db.execute(
          'INSERT INTO store_settings (branch_id, `key`, `value`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
          [row.id, 'daily_email_last_sent_date', reportDate],
        );
      }
      sent += 1;
    } catch (error) {
      console.error(`[daily-email] gagal untuk konfigurasi cabang ${configRow.id}: ${error.message}`);
    }
  }
  return sent;
}

function startDailyReportEmail() {
  const run = () => runDailyReportEmail().catch((error) => console.error('[daily-email] gagal mengirim laporan:', error.message));
  const timer = setInterval(run, 60_000);
  timer.unref?.();
  setTimeout(run, 5_000).unref?.();
  return timer;
}

module.exports = { buildDailyEmailHtml, currentWibTime, isSafeEmailApiUrl, runDailyReportEmail, startDailyReportEmail };
