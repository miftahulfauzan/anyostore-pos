'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Share2 } from 'lucide-react';
import { openPrintView } from '../../lib/print-utils';
import { shareInvoiceImage, storePhones, instagramFor, customerTierLabel, invoiceDate } from '../../lib/invoice-image';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rp = (number) => `Rp${Number(number || 0).toLocaleString('id-ID')}`;
const paymentLabels = { cash: 'Tunai', qris: 'QRIS', debit: 'Kartu debit', transfer: 'Transfer', split: 'Pembayaran terpisah', other: 'Lainnya / tidak diketahui' };

function ReceiptRow({ label, value, strong = false, negative = false }) {
  return <div className={`receipt-summary-row${strong ? ' strong' : ''}${negative ? ' negative' : ''}`}><span>{label}</span><b>{value}</b></div>;
}

export default function Receipt({ params }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const search = useSearchParams();

  useEffect(() => {
    Promise.resolve(params)
      .then(({ id }) => fetch(`${api}/printer/invoice/${id}`, { headers: {} }))
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setData(body.data);
      })
      .catch((error) => setMessage(error.message));
  }, [params]);

  useEffect(() => {
    if (data && search.get('print') === '1') window.setTimeout(() => window.print(), 250);
  }, [data, search]);

  // Bagikan invoice sebagai gambar 3:4 (siap dikirim ke WhatsApp pembeli).
  async function shareInvoice() {
    if (!data || sharing) return;
    setSharing(true);
    setMessage('');
    try {
      const result = await shareInvoiceImage({
        storeName: data.store?.store_name || 'Anyostore',
        storeAddress: data.store?.store_address || '',
        phones: storePhones(data.store || {}).length ? storePhones(data.store || {}) : [data.store?.store_phone].filter(Boolean),
        instagram: instagramFor(data.store?.store_name),
        invoiceNo: data.invoice_no,
        dateText: invoiceDate(data.created_at || data.transaction_date),
        cashier: data.cashier || '-',
        customerLabel: data.customer_name
          ? `${data.customer_name} · ${customerTierLabel(data.customer_tier || data.price_tier)}`
          : 'Umum',
        items: (data.items || []).map((item) => ({
          name: item.name,
          variant: item.variant_detail || '',
          qty: item.quantity,
          price: item.price,
          subtotal: item.subtotal,
        })),
        subtotal: data.subtotal,
        discount: data.discount,
        total: data.grand_total,
      });
      if (result === 'downloaded') setMessage('Browser tidak mendukung berbagi file. Gambar invoice sudah diunduh.');
    } catch (error) {
      setMessage(error.message || 'Gagal membagikan invoice');
    } finally {
      setSharing(false);
    }
  }

  if (!data) return <main className="workspace"><p>{message || 'Memuat struk…'}</p></main>;

  const logoPath = data.store.invoice_logo || data.store.store_logo;
  const logo = logoPath ? api.replace('/api', '') + logoPath : '';
  const printerSize = String(data.store.printer_size || '80mm').includes('58') ? '58mm' : '80mm';
  const date = new Date(data.created_at);
  const businessDate = String(data.transaction_date || data.created_at).slice(0, 10).split('-').reverse().join('/');
  const payments = data.payments?.length ? data.payments : [{ payment_method: data.payment_method, amount: data.grand_total }];

  return <main className="receipt">
    <div className="receipt-share-bar no-print">
      <button type="button" onClick={shareInvoice} disabled={sharing}>
        <Share2 aria-hidden="true" size={16} /> {sharing ? 'Menyiapkan…' : 'Bagikan Invoice'}
      </button>
      <button type="button" className="secondary" onClick={() => openPrintView({ selector: '.receipt-paper', title: `Struk ${data.invoice_no}` })}>Cetak Struk</button>
      <a className="button-link" href="/history">← Riwayat</a>
      {message && <span className="message" role="status">{message}</span>}
    </div>
    <article className={`receipt-paper receipt-${printerSize}`}>
      <header className="receipt-store">
        {logo && String(data.store.show_logo) !== 'false' && <img className="receipt-logo" src={logo} alt={`Logo ${data.store.store_name}`} />}
        <h1>{data.store.store_name}</h1>
        {data.store.receipt_header && <p className="receipt-store-tagline">{data.store.receipt_header}</p>}
        <address>
          {data.store.store_address && <span>{data.store.store_address}</span>}
          {(data.store.store_phone || data.store.store_email) && <span>{[data.store.store_phone, data.store.store_email].filter(Boolean).join(' · ')}</span>}
          {data.store.store_tax_id && <span>NPWP: {data.store.store_tax_id}</span>}
        </address>
      </header>

      <section className="receipt-section receipt-invoice" aria-labelledby="receipt-invoice-title">
        <h2 id="receipt-invoice-title">Informasi transaksi</h2>
        <dl>
          <div><dt>Invoice</dt><dd>{data.invoice_no}</dd></div>
          <div><dt>Tanggal</dt><dd>{businessDate} · {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}</dd></div>
          <div><dt>Kasir</dt><dd>{data.cashier}</dd></div>
          {data.customer_name && <div><dt>Pelanggan</dt><dd>{data.customer_name}</dd></div>}
        </dl>
      </section>

      <section className="receipt-section receipt-products" aria-labelledby="receipt-products-title">
        <h2 id="receipt-products-title">Produk</h2>
        <div className="receipt-product-list">
          {data.items.map((item, index) => <article className="receipt-product" key={`${item.sku || item.name}-${index}`}>
            <div className="receipt-product-heading">
              <strong>{item.name}</strong>
              <b>{rp(item.subtotal)}</b>
            </div>
            <p>{[item.sku, item.variant_detail].filter(Boolean).join(' · ') || 'Produk reguler'}</p>
            <div className="receipt-product-calculation"><span>{item.quantity} × {rp(item.price)}</span>{Number(item.discount) > 0 && <span>Diskon -{rp(item.discount)}</span>}</div>
          </article>)}
        </div>
      </section>

      <section className="receipt-section receipt-totals" aria-label="Ringkasan pembayaran">
        <ReceiptRow label="Subtotal" value={rp(data.subtotal)} />
        {Number(data.discount) > 0 && <ReceiptRow label="Diskon" value={`-${rp(data.discount)}`} negative />}
        <ReceiptRow label="Total" value={rp(data.grand_total)} strong />
        <div className="receipt-payment-detail">
          {payments.map((payment, index) => <ReceiptRow key={`${payment.payment_method}-${index}`} label={paymentLabels[payment.payment_method] || payment.payment_method?.toUpperCase()} value={rp(payment.amount)} />)}
          <ReceiptRow label="Dibayar" value={rp(data.amount_paid)} />
          <ReceiptRow label="Kembalian" value={rp(data.change)} />
        </div>
      </section>

      {(data.notes || data.store.receipt_note) && <section className="receipt-section receipt-notes" aria-labelledby="receipt-notes-title">
        <h2 id="receipt-notes-title">Catatan</h2>
        {data.notes && <p>{data.notes}</p>}
        {data.store.receipt_note && <p>{data.store.receipt_note}</p>}
      </section>}

      <footer className="receipt-footer">
        <strong>Terima kasih</strong>
        <p>{data.store.receipt_footer || 'Terima kasih telah berbelanja di toko kami.'}</p>
        <small>Simpan struk ini sebagai bukti transaksi.</small>
      </footer>
    </article>
    <div className="receipt-actions no-print"><button type="button" onClick={() => openPrintView({ selector: '.receipt', title: `Struk ${data.invoice_no}` })}>Cetak struk</button><a href="/history">Kembali ke transaksi</a></div>
  </main>;
}
