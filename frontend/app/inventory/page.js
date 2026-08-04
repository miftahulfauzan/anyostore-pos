'use client';
import { useEffect } from 'react';
import AppShell from '../components/AppShell';
import StockReportSection from './stock-view';

export default function InventoryPage() {
  useEffect(() => {
    /* sesi via httpOnly cookie */
  }, []);
  return <AppShell title="Stok Produk" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory/transfers">Transfer Stok</a>}>
    <StockReportSection />
  </AppShell>;
}
