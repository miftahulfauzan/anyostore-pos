import LandingClient from '../LandingClient';

// Landing kedua: desain sama dengan halaman utama, tetapi katalog & pengaturan
// diambil dari cabang "Blok B" (anyostore.my.id/reseller).
export const metadata = {
  title: { absolute: 'Anyostore Reseller - Pakaian Denim Wanita' },
  description: 'Katalog reseller Anyostore (Blok B): pakaian denim wanita siap jual, pengiriman ke seluruh Indonesia, dan konsultasi via WhatsApp.',
  // Subdomain reseller menampilkan konten yang sama dengan /reseller pada
  // domain utama; canonical menunjuk ke versi utama agar tidak duplikat.
  alternates: { canonical: 'https://anyostore.my.id/reseller' },
  openGraph: {
    type: 'website',
    title: 'Anyostore Reseller - Pakaian Denim Wanita',
    description: 'Katalog reseller Anyostore (Blok B). Minimal 4 pcs per model, pengiriman ke seluruh Indonesia.',
    url: 'https://anyostore.my.id/reseller',
    siteName: 'Anyostore',
    images: [{ url: 'https://anyostore.my.id/og-image.png', width: 1200, height: 630, alt: 'Anyostore Reseller' }],
  },
};

// Domain khusus reseller dilayani lewat rewrite di middleware.js
// (reseller.anyostore.my.id -> /reseller).
export default function ResellerLandingPage() {
  // basePath "/" karena di subdomain reseller root adalah landing reseller
  // (rewrite middleware). Di domain utama /reseller tetap halaman ini.
  return <LandingClient branchSlug="reseller" wholesaleCopy={false} basePath="/" orderMode="reseller" />;
}
