import { headers } from 'next/headers';

// Sitemap per host: gateway (domain utama), katalog grosir, dan katalog
// reseller punya URL masing-masing sejak katalog dipisah ke subdomain.
export const revalidate = 86400;

const APP_ORIGIN = 'https://anyostore.my.id';
const GROSIR_ORIGIN = 'https://grosir.anyostore.my.id';
const RESELLER_ORIGIN = 'https://reseller.anyostore.my.id';

async function currentHost() {
  try {
    const h = await headers();
    return (h.get('x-forwarded-host') || h.get('host') || 'anyostore.my.id').split(':')[0].toLowerCase();
  } catch {
    return 'anyostore.my.id';
  }
}

async function grosirEntries() {
  const entries = [
    { url: `${GROSIR_ORIGIN}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${GROSIR_ORIGIN}/link`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];
  try {
    let page = 1;
    let total = Infinity;
    let seen = 0;
    while (seen < total && page <= 10) {
      const res = await fetch(`${GROSIR_ORIGIN}/api/public/products?limit=100&page=${page}`, { cache: 'no-store' });
      if (!res.ok) break;
      const body = await res.json();
      const data = Array.isArray(body.data) ? body.data : [];
      total = Number(body.total) || data.length;
      for (const product of data) {
        entries.push({
          url: `${GROSIR_ORIGIN}/produk/${product.id}`,
          lastModified: new Date(),
          changeFrequency: 'daily',
          priority: 0.8,
        });
      }
      seen += data.length;
      if (!data.length) break;
      page += 1;
    }
  } catch {
    // Offline saat build: sitemap tetap berisi halaman statis.
  }
  return entries;
}

export default async function sitemap() {
  const host = await currentHost();
  if (host.startsWith('grosir.')) return grosirEntries();
  if (host.startsWith('reseller.')) {
    return [
      { url: `${RESELLER_ORIGIN}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    ];
  }
  // Domain utama: homepage gateway (halaman staf tidak diindeks).
  return [{ url: `${APP_ORIGIN}/`, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 }];
}