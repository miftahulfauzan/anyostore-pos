import LandingClient from './LandingClient';

export const metadata = {
  title: { absolute: 'Anyostore - Grosir Pakaian Denim Wanita' },
  description: 'Grosir pakaian denim wanita langsung dari supplier. Katalog lengkap, minimal 4 pcs per model, pengiriman ke seluruh Indonesia, dan konsultasi harga via WhatsApp.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    title: 'Anyostore - Grosir Pakaian Denim Wanita',
    description: 'Grosir pakaian denim wanita langsung dari supplier. Minimal 4 pcs per model, pengiriman ke seluruh Indonesia.',
    url: '/',
    siteName: 'Anyostore',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Anyostore - Grosir Pakaian Denim Wanita' }],
  },
};

export default function LandingPage() {
  return <LandingClient />;
}
