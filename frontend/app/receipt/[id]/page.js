'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Share2 } from 'lucide-react';
import { openPrintView } from '../../lib/print-utils';
import { shareInvoiceImage, storePhones, instagramFor, customerTierLabel, invoiceDate, storeLogoUrl } from '../../lib/invoice-image';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

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
        logoUrl: storeLogoUrl(data.store || {}, api),
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
  // Baris struk disusun server (backend/src/receipt-lines.js) memakai template
  // cabang yang sama dengan aplikasi Android, jadi tampilan web = hasil cetak.
  const lines = Array.isArray(data.lines) ? data.lines : [];

  return <main className="receipt">
    <div className="receipt-share-bar no-print">
      <button type="button" onClick={shareInvoice} disabled={sharing}>
        <Share2 aria-hidden="true" size={16} /> {sharing ? 'Menyiapkan…' : 'Bagikan Invoice'}
      </button>
      <button type="button" className="secondary" onClick={() => openPrintView({ selector: '.receipt-paper', title: `Struk ${data.invoice_no}` })}>Cetak Struk</button>
      <a className="button-link" href="/history">← Riwayat</a>
      {message && <span className="message" role="status">{message}</span>}
    </div>
    <article className={`receipt-paper receipt-${printerSize} receipt-thermal`}>
      {logo && String(data.store.show_logo) !== 'false' && <img className="receipt-logo" src={logo} alt={`Logo ${data.store.store_name}`} />}
      {lines.length ? (
        <div className="receipt-lines" role="group" aria-label={`Struk ${data.invoice_no}`}>
          {lines.map((line, index) => (
            <div
              key={`${index}-${line.text}`}
              className={line.bold ? 'receipt-line receipt-line--bold' : 'receipt-line'}
            >
              {line.text}
            </div>
          ))}
        </div>
      ) : <p className="muted">Baris struk tidak tersedia. Muat ulang halaman ini.</p>}
    </article>
    <div className="receipt-actions no-print"><button type="button" onClick={() => openPrintView({ selector: '.receipt', title: `Struk ${data.invoice_no}` })}>Cetak struk</button><a href="/history">Kembali ke transaksi</a></div>
  </main>;
}
