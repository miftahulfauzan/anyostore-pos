import LandingClient from '../LandingClient';

// Landing kedua: desain sama dengan halaman utama, tetapi katalog & pengaturan
// diambil dari cabang "Blok B" (anyostore.my.id/reseller).
export const metadata = {
  title: { absolute: 'Anyostore Reseller - Pakaian Denim Wanita' },
  description: 'Katalog reseller Anyostore (Blok B): pakaian denim wanita siap jual, pengiriman ke seluruh Indonesia, dan konsultasi via WhatsApp.',
  alternates: { canonical: '/reseller' },
  openGraph: {
    type: 'website',
    title: 'Anyostore Reseller - Pakaian Denim Wanita',
    description: 'Katalog reseller Anyostore (Blok B). Minimal 4 pcs per model, pengiriman ke seluruh Indonesia.',
    url: '/reseller',
    siteName: 'Anyostore',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Anyostore Reseller' }],
  },
};

// Domain khusus reseller dilayani lewat rewrite di middleware.js
// (reseller.anyostore.my.id -> /reseller).
export default function ResellerLandingPage() {
  return <LandingClient branchSlug="reseller" wholesaleCopy={false} basePath="/reseller" />;
}
