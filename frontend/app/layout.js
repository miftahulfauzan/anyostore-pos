import './globals.css';
import './audit-fixes.css';
import NotificationCenter from './components/NotificationCenter';
import AppStateProvider from './components/AppStateProvider';
import PwaRegister from './components/PwaRegister';
import OfflineBanner from './components/OfflineBanner';
import { preferencesScript } from './components/app-state.cjs';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://anyostore.my.id';
const siteName = 'Anyostore - Grosir Pakaian Denim Wanita';
const siteDescription = 'Grosir pakaian denim wanita langsung dari supplier. Katalog lengkap, minimal 4 pcs per model, pengiriman ke seluruh Indonesia, dan konsultasi harga via WhatsApp.';

export const metadata = {
  metadataBase: new URL(siteUrl),
  // Verifikasi Google Search Console (meta tag) untuk properti katalog.
  // Berlaku di semua host karena layout ini dipakai bersama.
  verification: { google: '-58k2SOD13P7wgvMSBgqC9K9J7Zskjn2jFh8X7kTRl0' },
  title: { default: siteName, template: '%s | Anyostore' },
  description: siteDescription,
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Anyostore POS',
    statusBarStyle: 'black-translucent',
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
  themeColor: '#1E3A5F',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: preferencesScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Plus Jakarta Sans', Inter, system-ui, -apple-system, sans-serif" }}>
        <a className="skip-link" href="#main-content">Lewati ke konten utama</a>
        <AppStateProvider>{children}</AppStateProvider>
        <PwaRegister />
        <OfflineBanner />
        <NotificationCenter />
      </body>
    </html>
  );
}
