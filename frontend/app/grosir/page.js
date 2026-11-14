import LandingClient from '../LandingClient';

// Katalog grosir: dulu halaman ini ada di root (anyostore.my.id), sekarang
// dipindah ke subdomain grosir.anyostore.my.id lewat rewrite di middleware.js.
// Root / sendiri sekarang menjadi homepage gateway.
export const metadata = {
  title: { absolute: 'Anyostore Grosir - Pakaian Denim Wanita' },
  description:
    'Grosir pakaian denim wanita langsung dari supplier. Katalog lengkap, minimal 4 pcs per model, pengiriman ke seluruh Indonesia, dan konsultasi harga via WhatsApp.',
  alternates: { canonical: 'https://grosir.anyostore.my.id' },
  openGraph: {
    type: 'website',
    title: 'Anyostore Grosir - Pakaian Denim Wanita',
    description:
      'Grosir pakaian denim wanita langsung dari supplier. Minimal 4 pcs per model, pengiriman ke seluruh Indonesia.',
    url: 'https://grosir.anyostore.my.id',
    siteName: 'Anyostore',
    images: [
      {
        url: 'https://grosir.anyostore.my.id/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Anyostore Grosir - Pakaian Denim Wanita',
      },
    ],
  },
};

export default function GrosirLandingPage() {
  return (
    <LandingClient
      basePath="/"
      wholesaleCopy
      resellerHref="https://reseller.anyostore.my.id"
    />
  );
}