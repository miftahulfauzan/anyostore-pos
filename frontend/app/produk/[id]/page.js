import { headers } from 'next/headers';
import ProdukDetailLoader from './ProdukDetailLoader';

export const dynamic = 'force-dynamic';

async function apiBase() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'anyostore.my.id';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}/api`;
}

async function fetchProduct(id) {
  try {
    const base = await apiBase();
    const res = await fetch(`${base}/public/products/${id}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return body.data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const product = await fetchProduct(id);
  if (!product) {
    return { title: 'Produk tidak ditemukan', description: 'Katalog grosir pakaian denim wanita Anyostore.' };
  }
  const description = String(product.description || `Beli ${product.name} grosir denim wanita. Chat admin untuk harga grosir, stok, dan warna ready.`).slice(0, 160);
  const media = Array.isArray(product.media) ? product.media : [];
  const photo = media.find((m) => m.path)?.path || null;
  return {
    title: product.name,
    description,
    alternates: { canonical: `/produk/${id}` },
    openGraph: {
      type: 'product',
      title: product.name,
      description,
      url: `/produk/${id}`,
      siteName: 'Anyostore',
      images: photo ? [{ url: `${(await apiBase()).replace(/\/api$/, '')}${photo}` }] : undefined,
    },
  };
}

export default async function ProdukPage({ params }) {
  const { id } = await params;
  const product = await fetchProduct(id);
  const media = Array.isArray(product?.media) ? product.media : [];
  const base = (await apiBase()).replace(/\/api$/, '');
  const images = media.filter((m) => m.path).map((m) => `${base}${m.path}`);
  const jsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        description: product.description || undefined,
        sku: product.sku || undefined,
        image: images,
        brand: { '@type': 'Brand', name: 'Anyostore' },
        offers: {
          '@type': 'Offer',
          url: `${base}/produk/${id}`,
          priceCurrency: 'IDR',
          price: Number(product.price) || 0,
          availability: 'https://schema.org/InStock',
        },
      }
    : null;
  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <ProdukDetailLoader />
    </>
  );
}
