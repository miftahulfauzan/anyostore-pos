// Pratinjau struk thermal untuk halaman Pengaturan → Template Struk.
// Aturannya sama dengan ReceiptLayout di aplikasi Android supaya pratinjau di
// web tidak berbeda dengan hasil cetak.

export const RECEIPT_TEMPLATE_DEFAULTS = {
  store_name: 'BASIK PGMTA',
  receipt_header: 'Terima kasih telah berbelanja',
  receipt_note: 'Barang yang sudah dibeli tidak dapat ditukar/dikembalikan',
  receipt_footer: '',
  receipt_closing: 'Terima kasih, sampai jumpa lagi!',
  receipt_title_info: 'INFORMASI TRANSAKSI',
  receipt_title_products: 'PRODUK',
  receipt_label_invoice: 'Invoice',
  receipt_label_date: 'Tanggal',
  receipt_label_cashier: 'Kasir',
  receipt_label_customer: 'Pelanggan',
  receipt_label_subtotal: 'Subtotal',
  receipt_label_discount: 'Diskon',
  receipt_label_total: 'Total',
  receipt_label_paid: 'Dibayar',
  receipt_label_change: 'Kembalian',
  receipt_show_logo: 'true',
  receipt_show_address: 'true',
  receipt_show_wa: 'true',
  receipt_show_npwp: 'true',
  receipt_show_cashier: 'true',
  receipt_show_customer: 'true',
  receipt_show_payment: 'true',
  receipt_show_paid: 'true',
  receipt_show_change: 'true',
  receipt_separator: 'dash',
  receipt_font: 'b',
  receipt_margin: '',
  printer_size: '80',
};

export const isOn = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true' || String(value) === '1';
};

/** Lebar kolom & margin untuk ukuran kertas tertentu (grid Font B / Font A). */
export function receiptGrid(settings = {}) {
  const narrow = String(settings.printer_size || '80').startsWith('58');
  const fontB = String(settings.receipt_font || 'b').toLowerCase() !== 'a';
  const width = narrow ? (fontB ? 42 : 32) : fontB ? 64 : 48;
  const fallbackMargin = narrow ? 3 : 4;
  const margin = Math.min(6, Math.max(0, Number.parseInt(settings.receipt_margin, 10) || fallbackMargin));
  return { width, margin, inner: width - margin * 2 };
}

const money = (value) => 'Rp' + Number(value || 0).toLocaleString('id-ID');
const price = (value) => Number(value || 0).toLocaleString('id-ID');

/**
 * Hasilkan baris teks struk (tanpa karakter margin kiri/kanan tambahan).
 * @returns {string[]} baris selebar `grid.width` karakter
 */
export function buildReceiptPreview(settings = {}, sample = {}) {
  const value = { ...RECEIPT_TEMPLATE_DEFAULTS, ...settings };
  const { width, margin, inner } = receiptGrid(value);
  const rows = [];

  const emit = (content) => {
    const body = String(content).slice(0, inner).padEnd(inner);
    rows.push(' '.repeat(margin) + body + ' '.repeat(margin));
  };
  const center = (text) => {
    const words = String(text).split(/\s+/).filter(Boolean);
    let line = '';
    const parts = [];
    for (const word of words) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= inner) line += ` ${word}`;
      else { parts.push(line); line = word; }
    }
    if (line) parts.push(line);
    for (const part of parts) {
      const gap = Math.max(0, inner - part.length);
      const left = Math.floor(gap / 2);
      emit(' '.repeat(left) + part);
    }
  };
  const meta = (label, text) => {
    const safeLabel = String(label || '').slice(0, 12).padEnd(12);
    const room = inner - safeLabel.length;
    const safeText = String(text || '').slice(0, room);
    emit(safeLabel + safeText);
  };
  const pair = (label, amount) => {
    const right = String(amount);
    const left = String(label || '').slice(0, Math.max(0, inner - right.length - 1));
    emit(left + ' '.repeat(Math.max(1, inner - left.length - right.length)) + right);
  };
  const item = (name, qty, unitPrice, amount) => {
    let mid = `${qty} x ${unitPrice}`;
    let room = inner - mid.length - amount.length - 3;
    if (room < 6) {
      mid = `${qty}x${unitPrice}`;
      room = inner - mid.length - amount.length - 3;
    }
    const nameWidth = Math.min(16, Math.max(4, room));
    const safeName = String(name).length <= nameWidth ? String(name) : String(name).slice(0, nameWidth - 1);
    const gap = Math.max(1, inner - nameWidth - 1 - mid.length - amount.length - 1);
    emit(safeName.padEnd(nameWidth) + ' ' + mid + ' '.repeat(gap) + amount);
  };
  const rule = () => {
    const style = String(value.receipt_separator || 'dash');
    if (style === 'none') return;
    if (style === 'blank') { emit(''); return; }
    emit('-'.repeat(inner));
  };

  const storeName = String(value.store_name || 'Anyostore');
  center(storeName);
  if (value.receipt_header) center(value.receipt_header);
  emit('');
  if (isOn(value.receipt_show_address) && value.store_address) {
    const address = String(value.store_address)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);
    address.forEach((line) => center(line));
  }
  emit('');
  if (isOn(value.receipt_show_wa)) {
    const numbers = Array.isArray(sample.phones) ? sample.phones : [];
    numbers.forEach((number) => center(`WA ${number}`));
  }
  if (isOn(value.receipt_show_npwp) && value.store_tax_id) center(`NPWP: ${value.store_tax_id}`);
  rule();

  emit(value.receipt_title_info || 'INFORMASI TRANSAKSI');
  meta(value.receipt_label_invoice, sample.invoiceNo || '');
  meta(value.receipt_label_date, sample.date || '');
  if (isOn(value.receipt_show_cashier)) meta(value.receipt_label_cashier, sample.cashier || '-');
  if (isOn(value.receipt_show_customer) && sample.customer) meta(value.receipt_label_customer, sample.customer);
  rule();

  emit(value.receipt_title_products || 'PRODUK');
  emit('');
  (sample.items || []).forEach((line) => item(line.name, line.qty, price(line.price), money(line.subtotal)));
  emit('');
  rule();

  pair(value.receipt_label_subtotal, money(sample.subtotal));
  if (Number(sample.discount) > 0) pair(value.receipt_label_discount, `-${money(sample.discount)}`);
  pair(value.receipt_label_total, money(sample.total ?? sample.subtotal));
  rule();

  if (isOn(value.receipt_show_payment)) pair(sample.paymentLabel || 'Transfer', money(sample.paid ?? sample.total));
  if (isOn(value.receipt_show_paid)) pair(value.receipt_label_paid, money(sample.paid ?? sample.total));
  if (isOn(value.receipt_show_change)) pair(value.receipt_label_change, money(sample.change || 0));

  rule();
  if (value.receipt_closing) center(value.receipt_closing);
  if (value.receipt_footer) center(value.receipt_footer);
  if (value.receipt_note) center(value.receipt_note);
  emit('');
  return rows;
}

export const RECEIPT_SAMPLE = {
  invoiceNo: 'INV-20261110-B1-0008',
  date: '10/11/2026 14:12',
  cashier: 'Anyostore',
  customer: 'Umum',
  items: [
    { name: 'B-05', qty: 6, price: 90000, subtotal: 540000 },
    { name: 'A101-BLAZE', qty: 8, price: 100000, subtotal: 800000 },
    { name: 'A102 BORDIR', qty: 12, price: 95000, subtotal: 1140000 },
  ],
  subtotal: 2480000,
  discount: 0,
  total: 2480000,
  paid: 2480000,
  change: 0,
  phones: ['0813-1313-3162', '0856-9116-6333', '0877-6676-6769'],
};
