import './globals.css';
import NotificationCenter from './components/NotificationCenter';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://anyostore.my.id';
const siteName = 'Anyostore - Grosir Pakaian Denim Wanita';
const siteDescription = 'Grosir pakaian denim wanita langsung dari supplier. Katalog lengkap, minimal 4 pcs per model, pengiriman ke seluruh Indonesia, dan konsultasi harga via WhatsApp.';

export const metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: '%s | Anyostore' },
  description: siteDescription,
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'Anyostore',
    title: siteName,
    description: siteDescription,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: siteName }],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: siteDescription,
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Plus Jakarta Sans', Inter, system-ui, -apple-system, sans-serif" }}>
        {children}
        <NotificationCenter />
      </body>
    </html>
  );
}
