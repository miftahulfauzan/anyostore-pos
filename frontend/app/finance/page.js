'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import AppShell from '../components/AppShell';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (value) => `Rp${Number(value || 0).toLocaleString('id-ID')}`;

export default function Finance() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pos_access_token');
    if (!token) {
      window.location.assign('/');
      return;
    }
    fetch(`${api}/finance/profit-loss`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message);
        setData(body.data);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  return (
    <AppShell title="Laba Rugi" eyebrow="KEUANGAN" actions={<a className="button-link" href="/reports">Semua laporan <ArrowUpRight aria-hidden="true" size={15} /></a>}>
      {data ? (
        <section className="metrics-grid finance-metrics">
          <article className="metric-card"><div><span>Pendapatan</span><strong>{rupiah(data.revenue)}</strong><small>Penjualan + pemasukan lain</small></div></article>
          <article className="metric-card"><div><span>Pemasukan Lain</span><strong>{rupiah(data.income)}</strong><small>Kas masuk selain penjualan</small></div></article>
          <article className="metric-card"><div><span>Pengeluaran</span><strong>{rupiah(data.expenses)}</strong><small>Seluruh pengeluaran tercatat</small></div></article>
          <article className="metric-card"><div><span>Laba bersih</span><strong>{rupiah(data.net_profit)}</strong><small>Pendapatan dikurangi pengeluaran</small></div></article>
        </section>
      ) : <section className="panel"><p>{message || 'Memuat laporan…'}</p></section>}
    </AppShell>
  );
}
