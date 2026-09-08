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

function buildDailyEmailHtml({ branchName, reportDate, totals, products }) {
  const rows = products.length
    ? products.map((product) => `<tr><td style="padding:8px;border-bottom:1px solid #e2e8f0">${escapeHtml(product.name)}<br><small style="color:#64748b">${escapeHtml(product.sku || '')}</small></td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#15803d">+${formatQty(product.incoming)}</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#b91c1c">-${formatQty(product.outgoing)}</td></tr>`).join('')
    : '<tr><td colspan="3" style="padding:16px;text-align:center;color:#64748b">Tidak ada pergerakan stok pada hari ini.</td></tr>';
  return `<!doctype html><html lang="id"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><div style="max-width:720px;margin:0 auto"><h1 style="font-size:22px;margin-bottom:4px">Laporan Harian Stok</h1><p style="margin-top:0;color:#64748b">${escapeHtml(branchName)} · ${escapeHtml(reportDate)}</p><div style="display:flex;gap:12px;margin:20px 0"><div style="flex:1;padding:14px;border-radius:8px;background:#ecfdf5"><small>Stok masuk</small><br><strong style="font-size:22px;color:#15803d">+${formatQty(totals.incoming)}</strong></div><div style="flex:1;padding:14px;border-radius:8px;background:#fef2f2"><small>Stok keluar</small><br><strong style="font-size:22px;color:#b91c1c">-${formatQty(totals.outgoing)}</strong></div></div><table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;border-bottom:2px solid #cbd5e1"><th style="padding:8px">Produk</th><th style="padding:8px;text-align:right">Masuk</th><th style="padding:8px;text-align:right">Keluar</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:24px;color:#64748b;font-size:12px">Email ini dibuat otomatis dari mutasi stok yang tercatat di Anyostore.</p></div></body></html>`;
}

async function getBranchReport(branchId, branchName, reportDate) {
  const [totalsRows] = await db.execute(
    `SELECT COALESCE(SUM(CASE WHEN qty > 0 THEN qty ELSE 0 END), 0) AS incoming,
            COALESCE(SUM(CASE WHEN qty < 0 THEN -qty ELSE 0 END), 0) AS outgoing
       FROM stock_mutations
      WHERE branch_id = ? AND DATE(created_at) = ?`,
    [branchId, reportDate],
  );
  const [products] = await db.execute(
    `SELECT p.name, p.sku,
            COALESCE(SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END), 0) AS incoming,
            COALESCE(SUM(CASE WHEN sm.qty < 0 THEN -sm.qty ELSE 0 END), 0) AS outgoing
       FROM stock_mutations sm
       JOIN products p ON p.id = sm.product_id
      WHERE sm.branch_id = ? AND DATE(sm.created_at) = ?
      GROUP BY p.id, p.name, p.sku
     HAVING incoming > 0 OR outgoing > 0
      ORDER BY (incoming + outgoing) DESC, p.name
      LIMIT 50`,
    [branchId, reportDate],
  );
  return {
    branchName,
    reportDate,
    totals: {
      incoming: Number(totalsRows[0]?.incoming || 0),
      outgoing: Number(totalsRows[0]?.outgoing || 0),
    },
    products: products.map((product) => ({ ...product, incoming: Number(product.incoming || 0), outgoing: Number(product.outgoing || 0) })),
  };
}

async function sendEmail(config, report) {
  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: config.from,
      to: [config.to],
      subject: `Laporan stok ${report.branchName} — ${report.reportDate}`,
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
  let sent = 0;
  for (const row of rows) {
    if (String(row.enabled) !== 'true' || currentTime < String(row.email_time || '19:00') || String(row.last_sent_date || '') === reportDate) continue;
    if (!row.email_to || !row.email_from || !row.api_key || !isSafeEmailApiUrl(row.api_url || DEFAULT_API_URL)) {
      console.warn(`[daily-email] konfigurasi belum lengkap untuk cabang ${row.id}; email dilewati`);
      continue;
    }
    try {
      const report = await getBranchReport(row.id, row.name, reportDate);
      await sendEmail({ to: row.email_to, from: row.email_from, apiKey: row.api_key, apiUrl: row.api_url || DEFAULT_API_URL }, report);
      await db.execute(
        'INSERT INTO store_settings (branch_id, `key`, `value`) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [row.id, 'daily_email_last_sent_date', reportDate],
      );
      sent += 1;
    } catch (error) {
      console.error(`[daily-email] gagal untuk cabang ${row.id}: ${error.message}`);
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
