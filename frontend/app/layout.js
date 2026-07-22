import './globals.css';
import NotificationCenter from './components/NotificationCenter';

export const metadata = {
  title: 'POS Pakaian',
  description: 'Sistem point of sale pakaian'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return <html lang="id"><body>{children}<NotificationCenter /></body></html>;
}
