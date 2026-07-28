import './globals.css';
import NotificationCenter from './components/NotificationCenter';

export const metadata = {
  title: 'POS Pakaian',
  description: 'Sistem point of sale pakaian',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icon.svg', type: 'image/svg+xml' }],
  },
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
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@500;600;700;800&display=swap&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Plus Jakarta Sans', Inter, system-ui, -apple-system, sans-serif" }}>
        {children}
        <NotificationCenter />
      </body>
    </html>
  );
}
