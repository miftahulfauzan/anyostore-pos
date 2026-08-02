'use client';
import AppShell from '../../components/AppShell';
import StockReportSection from '../stock-view';

export default function StockReportPage() {
  return (
    <AppShell title="Laporan Stok" eyebrow="INVENTORY">
      <StockReportSection />
    </AppShell>
  );
}
