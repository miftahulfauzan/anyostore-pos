import { NextResponse } from 'next/server';

// Tiga host dengan peran berbeda:
//   anyostore.my.id           -> homepage gateway + aplikasi staf (login/POS/…)
//   grosir.anyostore.my.id    -> katalog grosir (rewrite ke /grosir)
//   reseller.anyostore.my.id  -> katalog reseller (rewrite ke /reseller)
// www.anyostore.my.id dialihkan ke domain utama.
export const APP_HOST = 'anyostore.my.id';
export const GROSIR_HOST = 'grosir.anyostore.my.id';
export const RESELLER_HOST = 'reseller.anyostore.my.id';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

// Halaman aplikasi staf: hanya boleh dibuka di domain utama.
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

// Halaman katalog publik yang dulu ada di root dan sekarang pindah ke grosir.
function isCatalogPath(pathname) {
  return pathname === '/produk' || pathname.startsWith('/produk/') || pathname === '/link' || pathname.startsWith('/link/');
}

function redirect(origin, pathname, search = '', status = 308) {
  return NextResponse.redirect(new URL(`${pathname}${search}`, origin), status);
}

export function middleware(request) {
  const url = request.nextUrl;
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  const isAppHost = host === APP_HOST;
  const isGrosirHost = host === GROSIR_HOST;
  const isResellerHost = host === RESELLER_HOST;

  // www (dan host lain yang bukan ketiga peran di atas) -> domain utama.
  if (!isAppHost && !isGrosirHost && !isResellerHost) {
    if (host === `www.${APP_HOST}`) {
      return redirect(`https://${APP_HOST}`, url.pathname, url.search);
    }
    return NextResponse.next();
  }

  // Halaman pembeli reseller selalu dilayani di subdomain reseller.
  if (isBuyerPath(url.pathname)) {
    if (!isResellerHost) {
      return redirect(`https://${RESELLER_HOST}`, url.pathname, url.search);
    }
    url.pathname = `/reseller${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  // Aplikasi staf hanya di domain utama.
  if (isStaffPath(url.pathname)) {
    if (!isAppHost) return redirect(`https://${APP_HOST}`, url.pathname, url.search);
    return NextResponse.next();
  }

  // ===== Host grosir =====
  if (isGrosirHost) {
    if (url.pathname === '/grosir') return redirect(`https://${GROSIR_HOST}`, '/', url.search);
    if (url.pathname === '/reseller' || url.pathname.startsWith('/reseller/')) {
      return redirect(`https://${RESELLER_HOST}`, url.pathname.replace(/^\/reseller/, '') || '/', url.search);
    }
    if (url.pathname === '/') {
      url.pathname = '/grosir';
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // ===== Host reseller =====
  if (isResellerHost) {
    if (url.pathname === '/reseller') return redirect(`https://${RESELLER_HOST}`, '/', url.search);
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/reseller';
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // ===== Domain utama: gateway + aplikasi staf =====
  // Katalog publik tidak lagi dilayani di root supaya canonical tunggal.
  if (url.pathname === '/grosir') return redirect(`https://${GROSIR_HOST}`, '/', url.search);
  if (isCatalogPath(url.pathname)) return redirect(`https://${GROSIR_HOST}`, url.pathname, url.search);
  if (url.pathname === '/reseller' || url.pathname.startsWith('/reseller/')) {
    return redirect(`https://${RESELLER_HOST}`, url.pathname.replace(/^\/reseller/, '') || '/', url.search);
  }
  return NextResponse.next();
}