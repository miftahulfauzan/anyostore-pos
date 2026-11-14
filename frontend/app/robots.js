import { headers } from 'next/headers';

// Robots per host: katalog boleh diindeks, panel staf di domain utama tidak.
const APP_ORIGIN = 'https://anyostore.my.id';

const STAFF_PATHS = [
  '/login',
  '/pos',
  '/dashboard',
  '/products',
  '/inventory',
  '/reports',
  '/finance',
  '/settings',
  '/store-settings',
  '/users',
  '/commissions',
  '/customers',
  '/promotions',
  '/operations',
  '/profile',
  '/history',
  '/receipt',
];

async function currentHost() {
  try {
    const h = await headers();
    return (h.get('x-forwarded-host') || h.get('host') || 'anyostore.my.id').split(':')[0].toLowerCase();
  } catch {
    return 'anyostore.my.id';
  }
}

export default async function robots() {
  const host = await currentHost();
  if (host.startsWith('grosir.')) {
    return {
      rules: [{ userAgent: '*', allow: '/' }],
      sitemap: 'https://grosir.anyostore.my.id/sitemap.xml',
      host: 'https://grosir.anyostore.my.id',
    };
  }
  if (host.startsWith('reseller.')) {
    return {
      rules: [{ userAgent: '*', allow: '/', disallow: ['/masuk', '/daftar', '/akun', '/lacak', '/pesanan'] }],
      sitemap: 'https://reseller.anyostore.my.id/sitemap.xml',
      host: 'https://reseller.anyostore.my.id',
    };
  }
  // Domain utama = homepage gateway + aplikasi staf (staf tidak diindeks).
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: STAFF_PATHS }],
    sitemap: `${APP_ORIGIN}/sitemap.xml`,
    host: APP_ORIGIN,
  };
}