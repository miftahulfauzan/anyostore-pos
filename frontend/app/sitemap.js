const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://anyostore.my.id';

export const revalidate = 86400;

export default async function sitemap() {
  const entries = [
    { url: `${siteUrl}/`, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/link`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];

  try {
    let page = 1;
    let total = Infinity;
    let seen = 0;
    while (seen < total && page <= 10) {
      const res = await fetch(`${siteUrl}/api/public/products?limit=100&page=${page}`, { cache: 'no-store' });
      if (!res.ok) break;
      const body = await res.json();
      const data = Array.isArray(body.data) ? body.data : [];
      total = Number(body.total) || data.length;
      for (const product of data) {
        entries.push({ url: `${siteUrl}/produk/${product.id}`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 });
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
