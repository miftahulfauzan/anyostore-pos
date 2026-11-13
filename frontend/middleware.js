import { NextResponse } from 'next/server';

// Dua jalur katalog memakai domain berbeda:
//   anyostore.my.id             -> landing grosir
//   reseller.anyostore.my.id    -> landing reseller
// www.anyostore.my.id tetap ke landing grosir.
export const RESELLER_HOST = 'reseller.anyostore.my.id';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

// Halaman yang tetap hanya boleh dibuka di domain utama.
function isStaffPath(pathname) {
  return ['/login', '/pos', '/dashboard', '/products', '/inventory', '/reports', '/finance', '/settings', '/store-settings', '/users', '/commissions', '/customers', '/promotions', '/operations', '/profile', '/history', '/receipt'].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// Halaman pembeli reseller: /masuk, /daftar, /akun, /lacak, /pesanan/<token>.
// Dipetakan ke berkas di app/reseller/* supaya URL di subdomain reseller bersih.
const BUYER_PATHS = ['/masuk', '/daftar', '/akun', '/lacak', '/pesanan'];
function isBuyerPath(pathname) {
  return BUYER_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(request) {
  const url = request.nextUrl;
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const isResellerHost = host === RESELLER_HOST;

  // Halaman pembeli reseller dilayani berkas app/reseller/* di kedua domain,
  // sehingga tautan /masuk dan /akun tetap berfungsi dari mana pun dibuka.
  if (isBuyerPath(url.pathname)) {
    url.pathname = `/reseller${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  if (!isResellerHost) return NextResponse.next();

  // Panel staf dialihkan ke domain utama.
  if (isStaffPath(url.pathname)) {
    return NextResponse.redirect(new URL(`https://anyostore.my.id${url.pathname}${url.search}`), 307);
  }
  // /reseller di subdomain reseller = halaman utama subdomain itu.
  if (url.pathname === '/reseller') {
    return NextResponse.redirect(new URL(`/${url.search}`, url), 308);
  }
  // Host reseller menampilkan landing reseller di semua halaman katalog.
  if (url.pathname === '/') {
    url.pathname = '/reseller';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
