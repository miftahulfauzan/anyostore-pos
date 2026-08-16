'use client';

import dynamic from 'next/dynamic';

// Load detail produk murni di sisi client untuk mencegah hydration mismatch
// (React 441) karena halaman di-render ulang dari fetch di browser.
const ProdukDetailClient = dynamic(() => import('./ProdukDetailClient'), {
  ssr: false,
});

export default function ProdukDetailLoader() {
  return <ProdukDetailClient />;
}
