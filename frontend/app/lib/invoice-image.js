'use client';

// Render invoice menjadi gambar 1080 x 1440 (3:4) langsung di browser, lalu
// bagikan lewat Web Share API. Bila browser tidak mendukung berbagi file,
// gambar diunduh supaya tetap bisa dikirim manual (WhatsApp/Drive).

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1440;
const DENIM = '#1e3a5f';
const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';

const bankAccounts = [
  { bank: 'BCA', number: '0042813603' },
  { bank: 'MANDIRI', number: '1640000929465' },
];
const bankHolder = 'Miftahul Fauzan';
const bankNote = 'Jika sudah transfer mohon konfirmasinya ya ka';

export const rupiah = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function invoiceDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '-';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()} · ${hh}.${mm}`;
}

export const showsAnyostoreBrand = (storeName) => !String(storeName || '').toUpperCase().includes('BASIK');
export const instagramFor = (storeName, storeAddress = '') => {
  const name = String(storeName || '').toUpperCase();
  const address = String(storeAddress || '').toUpperCase();
  if (name.includes('BASIK')) return '@basik.pgmta';
  if (name.includes('BLOK B') || name.includes('TOKO B') || address.includes('BLOK B')) return '@anyostore';
  return null;
};

/** Nomor HP/WhatsApp dari pengaturan (satu kolom, tiga kolom, atau daftar JSON). */
export function storePhones(settings = {}) {
  const list = [];
  const add = (value) => {
    const text = String(value ?? '').trim();
    if (text && !list.includes(text)) list.push(text);
  };
  const raw = settings.whatsapp_numbers;
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) parsed.forEach(add);
    } catch { /* daftar tidak valid, pakai kolom tunggal */ }
  } else if (Array.isArray(raw)) {
    raw.forEach(add);
  }
  add(settings.whatsapp_number);
  add(settings.whatsapp_number_2);
  add(settings.whatsapp_number_3);
  add(settings.store_phone);
  return list;
}

export function customerTierLabel(tier) {
  if (tier === 'semi_grosir') return 'Semi Grosir';
  if (tier === 'grosir_seri') return 'Grosir Seri';
  return 'Reguler';
}

function font(size, weight = 600) {
  return `${weight} ${size}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
}

function drawStoreIcon(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.6, size / 10);
  ctx.lineCap = 'round';
  ctx.strokeRect(x, y + size * 0.35, size, size * 0.65);
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.35);
  ctx.lineTo(x + size / 2, y);
  ctx.lineTo(x + size, y + size * 0.35);
  ctx.stroke();
  ctx.restore();
}

function drawWhatsAppIcon(ctx, x, y, size, color, background) {
  ctx.save();
  // gelembung putih + ekor
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y + size * 0.47, size * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.12, y + size * 0.84);
  ctx.lineTo(x + size * 0.03, y + size * 0.99);
  ctx.lineTo(x + size * 0.36, y + size * 0.9);
  ctx.closePath();
  ctx.fill();
  // gagang telepon (warna latar agar terlihat seperti logo WhatsApp)
  ctx.strokeStyle = background;
  ctx.lineWidth = size * 0.15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + size * 0.34, y + size * 0.34);
  ctx.quadraticCurveTo(x + size * 0.36, y + size * 0.52, x + size * 0.62, y + size * 0.64);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.3, y + size * 0.3);
  ctx.lineTo(x + size * 0.4, y + size * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.66, y + size * 0.68);
  ctx.lineTo(x + size * 0.58, y + size * 0.58);
  ctx.stroke();
  ctx.restore();
}

function drawInstagramIcon(ctx, x, y, size, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.1);
  const inset = size * 0.08;
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, size - inset * 2, size - inset * 2, size * 0.26);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size * 0.24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + size * 0.72, y + size * 0.28, size * 0.055, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

/**
 * Gambar invoice ke kanvas 1080 x 1440.
 * payload: { storeName, storeAddress, phones[], instagram, invoiceNo, dateText,
 *            cashier, customerLabel, items[], subtotal, discount, total }
 */
export function renderInvoiceCanvas(payload) {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_WIDTH;
  canvas.height = OUTPUT_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);
  ctx.textBaseline = 'alphabetic';

  const pad = 72;
  const contentWidth = OUTPUT_WIDTH - pad * 2;
  const storeName = String(payload.storeName || 'Anyostore').trim();
  const brand = showsAnyostoreBrand(storeName);
  const initial = (storeName || 'A').trim().charAt(0).toUpperCase();
  const phones = (payload.phones || []).filter(Boolean);
  const instagram = payload.instagram || null;

  // ===== Kepala (dua kolom) =====
  // Kiri: logo + nama toko + alamat. Kanan: nomor WhatsApp + Instagram.
  const headerTop = 0;
  const contactLines = [
    ...phones.map((phone) => ({ icon: 'wa', text: phone })),
    ...(instagram ? [{ icon: 'ig', text: instagram }] : []),
  ];
  const leftWidth = 500;
  const addressLines = payload.storeAddress
    ? wrapText(ctx, payload.storeAddress, font(19, 600), leftWidth - 120)
    : [];
  const leftBlockHeight = 96 + (brand ? 30 : 0) + addressLines.length * 26;
  const rightBlockHeight = contactLines.length * 30;
  const headerHeight = Math.max(196, 60 + Math.max(leftBlockHeight, rightBlockHeight));

  ctx.fillStyle = DENIM;
  ctx.fillRect(0, headerTop, OUTPUT_WIDTH, headerHeight);

  // blok kiri: logo + nama toko + alamat, rata kiri & sejajar
  const logoSize = 84;
  const nameX = pad + logoSize + 22;
  const textBlock = [];
  let textY = 0;
  const nameFont = brand ? font(30, 900) : font(36, 900);

  // kontak kanan (dihitung dulu supaya tinggi header pas)
  const iconSize = 20;
  ctx.font = font(21, 700);
  const textWidth = contactLines.length ? Math.max(...contactLines.map((line) => ctx.measureText(line.text).width)) : 0;
  const blockWidth = contactLines.length ? iconSize + 10 + textWidth : 0;

  const headerContentTop = 34;
  if (brand) {
    textBlock.push({ text: 'ANYOSTORE', font: nameFont, color: '#ffffff' });
    textBlock.push({ text: storeName.toUpperCase(), font: font(16, 800), color: 'rgba(255,255,255,.82)', spacing: 1.4 });
  } else {
    textBlock.push({ text: storeName, font: nameFont, color: '#ffffff' });
  }
  if (addressLines.length) {
    addressLines.forEach((line) => textBlock.push({ text: line, font: font(19, 600), color: 'rgba(255,255,255,.9)' }));
  }
  const textBlockHeight = textBlock.reduce((total, line) => total + (line.font.includes('30px') || line.font.includes('36px') ? 40 : 27), 0);
  const leftBlockTop = headerContentTop;
  const logoY = leftBlockTop + Math.max(0, (textBlockHeight - logoSize) / 2);

  // logo
  roundedRect(ctx, pad, logoY, logoSize, logoSize, 22);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = DENIM;
  ctx.font = font(44, 900);
  ctx.textAlign = 'center';
  ctx.fillText(initial, pad + logoSize / 2, logoY + logoSize / 2 + 16);

  // teks kiri
  ctx.textAlign = 'left';
  textY = leftBlockTop;
  textBlock.forEach((line) => {
    ctx.font = line.font;
    ctx.fillStyle = line.color;
    const isName = line.font.includes('30px') || line.font.includes('36px');
    textY += isName ? 32 : 22;
    if (line.spacing) drawSpacedText(ctx, line.text, nameX, textY, line.spacing);
    else ctx.fillText(line.text, nameX, textY);
    textY += isName ? 8 : 5;
  });

  // kontak kanan: satu kolom ikon + teks, rata tengah vertikal tiap baris
  if (contactLines.length) {
    const iconBox = 26;
    const gap = 10;
    ctx.font = font(21, 700);
    const textWidth = Math.max(...contactLines.map((line) => ctx.measureText(line.text).width));
    const blockWidth = iconBox + gap + textWidth;
    const iconX = OUTPUT_WIDTH - pad - blockWidth;
    const lineHeight = 36;
    let rowTop = leftBlockTop + 4;
    contactLines.forEach((line) => {
      const centerY = rowTop + lineHeight / 2;
      if (line.icon === 'wa') {
        drawWhatsAppIcon(ctx, iconX, centerY - iconBox / 2, iconBox, '#ffffff', DENIM);
      } else if (line.icon === 'ig') {
        drawInstagramIcon(ctx, iconX, centerY - iconBox / 2, iconBox, 'rgba(255,255,255,.95)');
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = font(21, 700);
      ctx.fillText(line.text, iconX + iconBox + gap, centerY + 7);
      rowTop += lineHeight;
    });
    ctx.textAlign = 'right';
  }

  // ===== Baris dokumen =====
  let y = headerHeight;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(OUTPUT_WIDTH - pad, y);
  ctx.stroke();

  const docHeight = 74;
  ctx.textAlign = 'left';
  ctx.fillStyle = DENIM;
  ctx.font = font(22, 800);
  drawSpacedText(ctx, 'INVOICE', pad, y + 48, 5);
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = font(24, 800);
  ctx.fillText(String(payload.invoiceNo || '-'), OUTPUT_WIDTH - pad, y + 48);
  y += docHeight;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(OUTPUT_WIDTH - pad, y);
  ctx.stroke();

  // ===== Meta (4 kolom) =====
  const metaTop = y + 26;
  const metaColumns = [
    ['TANGGAL', payload.dateText || '-', 1.25],
    ['KASIR', payload.cashier || '-', 0.95],
    ['PELANGGAN', payload.customerLabel || 'Umum', 1.35],
    ['STATUS', 'Tagihan', 0.8],
  ];
  const metaUnit = contentWidth / metaColumns.reduce((total, column) => total + column[2], 0);
  let metaX = pad;
  metaColumns.forEach(([label, value, ratio]) => {
    const columnWidth = metaUnit * ratio;
    const x = metaX;
    metaX += columnWidth;
    ctx.textAlign = 'left';
    ctx.fillStyle = MUTED;
    ctx.font = font(17, 800);
    drawSpacedText(ctx, label, x, metaTop, 1.6);
    ctx.fillStyle = INK;
    ctx.font = font(22, 700);
    const lines = wrapText(ctx, String(value), font(22, 700), columnWidth - 16);
    lines.slice(0, 2).forEach((text, lineIndex) => ctx.fillText(text, x, metaTop + 34 + lineIndex * 30));
  });
  y = metaTop + 84;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(OUTPUT_WIDTH - pad, y);
  ctx.stroke();

  // ===== Item =====
  const colQty = OUTPUT_WIDTH - pad - 196;
  const colAmount = OUTPUT_WIDTH - pad;
  y += 40;
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = font(17, 800);
  drawSpacedText(ctx, 'BARANG', pad, y, 1.6);
  ctx.textAlign = 'center';
  ctx.fillText('QTY', colQty, y);
  ctx.textAlign = 'right';
  ctx.fillText('JUMLAH', colAmount, y);
  y += 18;
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(OUTPUT_WIDTH - pad, y);
  ctx.stroke();

  const rows = Array.isArray(payload.items) ? payload.items : [];
  rows.forEach((item) => {
    y += 40;
    ctx.textAlign = 'left';
    ctx.fillStyle = INK;
    ctx.font = font(24, 700);
    const nameLines = wrapText(ctx, item.name || '-', font(24, 700), contentWidth - 300);
    ctx.fillText(nameLines[0], pad, y);
    if (nameLines.length > 1) {
      ctx.font = font(20, 600);
      ctx.fillStyle = MUTED;
      ctx.fillText(nameLines[1], pad, y + 26);
      y += 26;
    }
    if (item.variant) {
      y += 24;
      ctx.font = font(19, 600);
      ctx.fillStyle = MUTED;
      ctx.fillText(item.variant, pad, y);
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#475569';
    ctx.font = font(24, 600);
    ctx.fillText(String(item.qty ?? 0), colQty, y - (item.variant ? 24 : 0));
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = font(24, 700);
    ctx.fillText(rupiah(item.subtotal), colAmount, y - (item.variant ? 24 : 0));
    y += 16;
    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(OUTPUT_WIDTH - pad, y);
    ctx.stroke();
  });

  // ===== Ringkasan =====
  y += 26;
  const summaryLeft = OUTPUT_WIDTH - pad - 320;
  const summaryRow = (label, value) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = font(22, 600);
    ctx.fillText(label, summaryLeft, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = font(22, 700);
    ctx.fillText(value, OUTPUT_WIDTH - pad, y);
    y += 34;
  };
  summaryRow('Subtotal', rupiah(payload.subtotal));
  if (Number(payload.discount) > 0) summaryRow('Diskon', '-' + rupiah(payload.discount));

  y += 14;
  const totalBoxHeight = 74;
  roundedRect(ctx, summaryLeft - 18, y - 36, OUTPUT_WIDTH - pad - summaryLeft + 18, totalBoxHeight, 16);
  ctx.fillStyle = '#eef3fb';
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = DENIM;
  ctx.font = font(28, 800);
  ctx.fillText('Total', summaryLeft, y + 12);
  ctx.textAlign = 'right';
  ctx.font = font(38, 900);
  ctx.fillText(rupiah(payload.total), OUTPUT_WIDTH - pad - 4, y + 16);
  y += totalBoxHeight + 10;

  // ===== Rekening + kaki: diletakkan di tengah sisa ruang kosong =====
  const bankBoxHeight = 214;
  const footerHeight = 112;
  const contentEnd = y;
  const freeSpace = OUTPUT_HEIGHT - contentEnd - pad;
  const stackHeight = bankBoxHeight + footerHeight;
  const gapTop = Math.max(36, (freeSpace - stackHeight) / 2);
  y = contentEnd + gapTop;

  roundedRect(ctx, pad, y, contentWidth, bankBoxHeight, 18);
  ctx.fillStyle = '#f8fafc';
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  let bankY = y + 42;
  ctx.textAlign = 'left';
  ctx.fillStyle = DENIM;
  ctx.font = font(19, 800);
  drawSpacedText(ctx, 'REKENING', pad + 22, bankY, 2);
  bankY += 34;
  bankAccounts.forEach((account) => {
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 1.8;
    roundedRect(ctx, pad + 22, bankY - 16, 22, 22, 5);
    ctx.stroke();
    ctx.fillStyle = '#334155';
    ctx.font = font(22, 800);
    ctx.fillText(account.bank, pad + 58, bankY);
    ctx.fillStyle = INK;
    ctx.font = font(22, 700);
    ctx.fillText(account.number, pad + 200, bankY);
    bankY += 34;
  });
  ctx.fillStyle = INK;
  ctx.font = font(21, 800);
  ctx.fillText(`a.n ${bankHolder}`, pad + 22, bankY);
  bankY += 28;
  ctx.fillStyle = '#475569';
  ctx.font = font(20, 600);
  ctx.fillText(bankNote, pad + 22, bankY);

  let footerY = y + bankBoxHeight + 46;
  ctx.textAlign = 'center';
  ctx.fillStyle = DENIM;
  ctx.font = font(22, 800);
  ctx.fillText('Terima kasih sudah berbelanja', OUTPUT_WIDTH / 2, footerY);
  footerY += 34;
  ctx.font = font(20, 800);
  ctx.fillText('cek produk kami lainnya anyostore.my.id', OUTPUT_WIDTH / 2, footerY);

  return canvas;
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawSpacedText(ctx, text, x, y, spacing) {
  const chars = [...String(text)];
  const width = chars.reduce((total, char) => total + ctx.measureText(char).width + spacing, 0) - spacing;
  const align = ctx.textAlign;
  let cursor = x;
  if (align === 'right') cursor = x - width;
  else if (align === 'center') cursor = x - width / 2;
  chars.forEach((char) => {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  });
  ctx.textAlign = align;
}

function wrapText(ctx, text, textFont, maxWidth) {
  const previous = ctx.font;
  ctx.font = textFont;
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  ctx.font = previous;
  return lines.length ? lines : [''];
}

/** Ubah kanvas menjadi Blob PNG. */
function canvasToBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

/**
 * Bagikan gambar invoice. Mengembalikan 'shared' bila memakai Web Share API,
 * atau 'downloaded' bila file diunduh.
 */
export async function shareInvoiceImage(payload) {
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* font sistem tetap dipakai */ }
  }
  const canvas = renderInvoiceCanvas(payload);
  const blob = await canvasToBlob(canvas);
  if (!blob) throw new Error('Gambar invoice gagal dibuat');
  const safeName = String(payload.invoiceNo || 'invoice').replace(/[^A-Za-z0-9-]/g, '');
  const file = new File([blob], `invoice-${safeName}.png`, { type: 'image/png' });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `Invoice ${payload.invoiceNo}`, text: `Invoice ${payload.invoiceNo}` });
    return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
