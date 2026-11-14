import LandingClient from '../LandingClient';

// Landing kedua: desain sama dengan halaman utama, tetapi katalog & pengaturan
// diambil dari cabang "Blok B" (anyostore.my.id/reseller).
export const metadata = {
  title: { absolute: 'Anyostore Reseller - Pakaian Denim Wanita' },
  description: 'Katalog reseller Anyostore (Blok B): pakaian denim wanita siap jual, pengiriman ke seluruh Indonesia, dan konsultasi via WhatsApp.',
  // Sejak katalog dipisah per subdomain, canonical menunjuk ke subdomain
  // reseller (satu-satunya URL katalog reseller).
  alternates: { canonical: 'https://reseller.anyostore.my.id' },
  openGraph: {
    type: 'website',
    title: 'Anyostore Reseller - Pakaian Denim Wanita',
    description: 'Katalog reseller Anyostore (Blok B). Minimal 4 pcs per model, pengiriman ke seluruh Indonesia.',
    url: 'https://reseller.anyostore.my.id',
    siteName: 'Anyostore',
    images: [{ url: 'https://reseller.anyostore.my.id/og-image.png', width: 1200, height: 630, alt: 'Anyostore Reseller' }],
  },
};

// Domain khusus reseller dilayani lewat rewrite di middleware.js
// (reseller.anyostore.my.id -> /reseller).
export default function ResellerLandingPage() {
  // basePath "/" karena di subdomain reseller root adalah landing reseller
  // (rewrite middleware). Di domain utama /reseller tetap halaman ini.
  return <LandingClient branchSlug="reseller" wholesaleCopy={false} basePath="/" orderMode="reseller" />;
}
