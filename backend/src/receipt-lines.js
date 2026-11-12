// Tata letak struk thermal — SATU-SATUNYA sumber aturan struk.
//
// Keluaran berupa baris siap cetak ({ text, bold, alignment }) supaya bisa
// dipakai tiga permukaan sekaligus:
//   1. Android (ESC/POS lewat printer_service.printReceipt)
//   2. Halaman resi web /receipt/[id]
//   3. Pratinjau template /settings/receipt-template (POST /api/printer/preview)
//
// Logika ini adalah port 1:1 dari mobile/lib/src/receipt_layout.dart. Kedua
// implementasi dijaga sama oleh fixture di backend/test/fixtures/receipt-lines
// yang dibaca juga oleh test Flutter (mobile/test/receipt_lines_golden_test.dart).
//
// Badan struk memakai Font B printer (9x17 dot) sehingga satu baris muat 42
// karakter pada kertas 58 mm dan 64 karakter pada 80 mm.

const META_LABEL = 12;

function asNum(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Format Rupiah tanpa spasi: Rp1.234.567 (sama dengan fmtRp di aplikasi). */
function money(value) {
  const digits = String(Math.round(asNum(value)));
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += '.';
    out += digits[i];
  }
  return `Rp${out}`;
}

/** Angka ribuan tanpa "Rp", dipakai kolom harga pada baris produk. */
function moneyNumber(value) {
  return money(value).replace(/^Rp/, '');
}

function twoDigit(value) {
  return String(value).padStart(2, '0');
}

const paymentLabels = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
  debit: 'Debit',
  credit: 'Kredit',
  split: 'Pembayaran terpisah',
};

function paymentLabel(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (paymentLabels[key]) return paymentLabels[key];
  const raw = String(value ?? '').trim();
  return raw || 'Pembayaran';
}

/** Printer thermal memakai codepage lama: ganti karakter non-ASCII. */
function ascii(value) {
  return String(value ?? '')
    .replace(/\u00b7/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u00d7/g, 'x');
}

function fit(value, max) {
  const normalized = String(value ?? '').trim();
  if (max <= 0) return '';
  if (normalized.length <= max) return normalized;
  if (max <= 3) return normalized.slice(0, max);
  return `${normalized.slice(0, max - 3)}...`;
}

function center(value, width) {
  const text = fit(value, width);
  const gap = width - text.length;
  if (gap <= 0) return text;
  const left = Math.floor(gap / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(gap - left)}`;
}

function wrap(value, max) {
  if (max <= 0) return [''];
  const result = [];
  const paragraphs = String(value ?? '').replace(/\r\n/g, '\n').split('\n');
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!paragraph.trim()) continue;
    let line = '';
    for (const word of words) {
      if (word.length > max) {
        if (line) {
          result.push(line);
          line = '';
        }
        let remaining = word;
        while (remaining.length > max) {
          result.push(remaining.slice(0, max));
          remaining = remaining.slice(max);
        }
        line = remaining;
      } else if (!line) {
        line = word;
      } else if (line.length + word.length + 1 <= max) {
        line = `${line} ${word}`;
      } else {
        result.push(line);
        line = word;
      }
    }
    if (line) result.push(line);
  }
  return result.length ? result : [''];
}

function isOn(store, key) {
  const raw = String(store?.[key] ?? '').trim().toLowerCase();
  if (!raw) return true;
  return raw === 'true' || raw === '1';
}

function text(store, key, fallback) {
  const raw = ascii(String(store?.[key] ?? '').trim());
  return raw || fallback;
}

function value(source, key, { fallback = '', prefix = '' } = {}) {
  const raw = source && typeof source === 'object' ? String(source[key] ?? '') : '';
  return raw ? `${prefix}${raw}` : fallback;
}

function optional(value_, add, { maxLines = null } = {}) {
  const body = ascii(String(value_ ?? '').trim());
  if (!body) return;
  if (maxLines == null) {
    add(body);
    return;
  }
  const rows = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join('\n');
  add(rows);
}

/** Nomor WhatsApp admin; label sekali di atas lalu nomor per baris. */
function contactLines(store) {
  const numbers = [];
  const add = (rawValue) => {
    const body = ascii(String(rawValue ?? '').trim());
    if (!body) return;
    if (!numbers.includes(body)) numbers.push(body);
  };

  const raw = store?.whatsapp_numbers;
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    for (const part of raw.trim().slice(1, -1).split(',')) {
      add(part.replace(/"/g, '').replace(/[[\]]/g, ''));
    }
  } else if (Array.isArray(raw)) {
    raw.forEach(add);
  }
  add(store?.whatsapp_number);
  add(store?.whatsapp_number_2);
  add(store?.whatsapp_number_3);
  if (!numbers.length) add(store?.store_phone);
  if (!numbers.length) return [];
  return ['WhatsApp', ...numbers];
}

function slashDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!match) return '';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function transactionDateLabel(data) {
  const businessDate = String(data?.transaction_date ?? '');
  let date = slashDate(businessDate);
  const createdAt = String(data?.created_at ?? '');
  const parsed = createdAt ? new Date(createdAt) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) {
    const wib = new Date(parsed.getTime() + 7 * 60 * 60 * 1000);
    if (!date) date = `${twoDigit(wib.getUTCDate())}/${twoDigit(wib.getUTCMonth() + 1)}/${wib.getUTCFullYear()}`;
    return `${date} ${twoDigit(wib.getUTCHours())}:${twoDigit(wib.getUTCMinutes())}`;
  }
  return date;
}

/** Ukuran kertas, margin, dan font yang dipakai struk ini. */
function receiptLayout(receipt = {}) {
  const store = receipt.store || {};
  const size = String(store.printer_size ?? '80').replace(/\s+/g, '').toLowerCase();
  const narrow = size.startsWith('58');
  const fontB = String(store.receipt_font ?? 'b').toLowerCase() !== 'a';
  const width = narrow ? (fontB ? 42 : 32) : (fontB ? 64 : 48);
  const fallbackMargin = narrow ? 3 : 4;
  const custom = Number.parseInt(String(store.receipt_margin ?? ''), 10) || 0;
  const margin = custom >= 0 && custom <= 6 && custom !== 0 ? custom : fallbackMargin;
  return { width, margin, font: fontB ? 'b' : 'a', inner: width - margin * 2 };
}

/**
 * Susun baris struk dari payload transaksi.
 * @returns {{ width: number, margin: number, font: 'a'|'b', inner: number,
 *            lines: Array<{ text: string, bold: boolean, alignment: 'left'|'center' }> }}
 */
function buildReceipt(receipt = {}) {
  const data = receipt || {};
  const store = data.store || {};
  const layout = receiptLayout(data);
  const { width, margin } = layout;
  const inner = layout.inner;
  const lines = [];

  const emit = (content, { bold = false, centered = false } = {}) => {
    const body = centered
      ? center(content, inner)
      : fit(String(content ?? '').replace(/\s+$/, ''), inner).padEnd(inner, ' ');
    const padded = `${' '.repeat(margin)}${body}${' '.repeat(margin)}`;
    lines.push({
      text: padded,
      bold,
      alignment: centered ? 'center' : 'left',
    });
  };

  const centered = (value_, { bold = false } = {}) => {
    for (const part of wrap(value_, inner)) emit(part, { bold, centered: true });
  };

  const meta = (label, val) => {
    const room = inner - META_LABEL;
    const body = String(val ?? '');
    const safe = body.length > room ? `${body.slice(0, room - 3)}...` : body;
    emit(`${String(label).padEnd(META_LABEL, ' ')}${safe}`);
  };

  const pair = (label, val) => {
    const right = fit(val, inner);
    const left = fit(label, inner - right.length - 1);
    emit(`${left.padEnd(inner - right.length, ' ')}${right}`);
  };

  const item = (name, qty, price, amount) => {
    let mid = `${qty} x ${price}`;
    let nameWidth = inner - mid.length - amount.length - 3;
    if (nameWidth < 6) {
      mid = `${qty}x${price}`;
      nameWidth = inner - mid.length - amount.length - 3;
    }
    const nameCol = Math.min(16, Math.max(4, nameWidth));
    const body = String(name ?? '');
    const safeName = body.length <= nameCol ? body : `${body.slice(0, nameCol - 1)}.`;
    const gap = inner - nameCol - 1 - mid.length - amount.length - 1;
    emit(`${safeName.padEnd(nameCol, ' ')} ${mid}${' '.repeat(gap < 1 ? 1 : gap)}${amount}`);
  };

  const rule = () => {
    const style = String(store.receipt_separator ?? 'dash').trim().toLowerCase();
    if (style === 'none') return;
    if (style === 'blank') {
      emit('');
      return;
    }
    emit('-'.repeat(inner));
  };

  // ===== Kepala: nama toko, sapaan, alamat, nomor WhatsApp =====
  centered(ascii(value(store, 'store_name', { fallback: 'Anyostore' })), { bold: true });
  optional(store.receipt_header, centered);
  emit('');
  if (isOn(store, 'receipt_show_address')) {
    optional(store.store_address, centered, { maxLines: 3 });
  }
  emit('');
  if (isOn(store, 'receipt_show_wa')) {
    for (const contact of contactLines(store)) centered(contact);
  }
  if (isOn(store, 'receipt_show_npwp')) {
    const tax = value(store, 'store_tax_id', { prefix: 'NPWP: ' });
    if (tax) centered(tax);
  }
  rule();

  // ===== Informasi transaksi =====
  emit(text(store, 'receipt_title_info', 'INFORMASI TRANSAKSI'), { bold: true });
  meta(text(store, 'receipt_label_invoice', 'Invoice'), ascii(String(data.invoice_no ?? '')));
  const date = transactionDateLabel(data);
  if (date) meta(text(store, 'receipt_label_date', 'Tanggal'), date);
  const cashier = value(data, 'cashier');
  if (cashier && isOn(store, 'receipt_show_cashier')) {
    meta(text(store, 'receipt_label_cashier', 'Kasir'), ascii(cashier));
  }
  const customer = value(data, 'customer_name');
  if (customer && isOn(store, 'receipt_show_customer')) {
    meta(text(store, 'receipt_label_customer', 'Pelanggan'), ascii(customer));
  }
  rule();

  // ===== Produk: nama, qty x harga, jumlah dalam satu baris =====
  emit(text(store, 'receipt_title_products', 'PRODUK'), { bold: true });
  emit('');
  for (const raw of Array.isArray(data.items) ? data.items : []) {
    const row = raw || {};
    const name = row.product_name ?? row.name ?? '';
    item(ascii(name), Math.trunc(asNum(row.quantity)), moneyNumber(row.price), money(row.subtotal));
  }
  emit('');
  rule();

  pair(text(store, 'receipt_label_subtotal', 'Subtotal'), money(data.subtotal));
  const discount = asNum(data.discount);
  if (discount > 0) pair(text(store, 'receipt_label_discount', 'Diskon'), `-${money(discount)}`);
  pair(text(store, 'receipt_label_total', 'Total'), money(data.grand_total));
  rule();

  let payments = Array.isArray(data.payments) ? data.payments : [];
  if (!payments.length && data.payment_method != null) {
    payments = [{ payment_method: data.payment_method, amount: asNum(data.grand_total) }];
  }
  if (isOn(store, 'receipt_show_payment')) {
    for (const raw of payments) {
      const payment = raw || {};
      pair(paymentLabel(payment.payment_method), money(payment.amount));
    }
  }
  const paymentTotal = payments.reduce((total, raw) => total + asNum((raw || {}).amount), 0);
  const amountPaid = asNum(data.amount_paid);
  const paid = amountPaid > 0
    ? amountPaid
    : (paymentTotal > 0 ? paymentTotal : asNum(data.grand_total));
  if (isOn(store, 'receipt_show_paid')) pair(text(store, 'receipt_label_paid', 'Dibayar'), money(paid));
  if (isOn(store, 'receipt_show_change')) pair(text(store, 'receipt_label_change', 'Kembalian'), money(data.change));

  rule();
  centered(text(store, 'receipt_closing', 'Terima kasih, sampai jumpa lagi!'));
  optional(store.receipt_footer, centered);
  optional(store.receipt_note, centered);
  emit('');

  return { width, margin, font: layout.font, inner, lines };
}

/** Baris saja — dipakai klien yang tidak butuh metadata kertas. */
function buildReceiptLines(receipt = {}) {
  return buildReceipt(receipt).lines;
}

module.exports = {
  buildReceipt,
  buildReceiptLines,
  receiptLayout,
  money,
  moneyNumber,
  ascii,
  paymentLabel,
};