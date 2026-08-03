'use client';
import { useEffect } from 'react';
import AppShell from '../components/AppShell';
import StockReportSection from './stock-view';

export default function InventoryPage() {
  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) window.location.assign('/');
  }, []);
  return <AppShell title="Stok Produk" eyebrow="PRODUK & INVENTORI" actions={<a className="button-link" href="/inventory/transfers">Transfer Stok</a>}>
    <StockReportSection />
  </AppShell>;
}
