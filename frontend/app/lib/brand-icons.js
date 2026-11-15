// Mark brand Shopee & TikTok memakai file logo resmi di public/brand.
// Ukuran 128x128 (dari 2000x2000) supaya ringan: ikon hanya tampil 16-26 px.
// Bila file hilang, komponen jatuh ke mark SVG sederhana agar tampilan tidak
// rusak (lihat fallback di bawah).

import { useState } from 'react';

const SOURCES = {
  shopee: '/brand/shopee.png',
  tiktok: '/brand/tiktok.png',
};

function BrandImage({ brand, size, radius, style }) {
  const s = Number(size) || 18;
  const [failed, setFailed] = useState(false);
  if (failed) return <BrandFallback brand={brand} size={s} radius={radius} style={style} />;
  return (
    <img
      src={SOURCES[brand]}
      alt=""
      aria-hidden="true"
      width={s}
      height={s}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{
        display: 'block',
        flex: '0 0 auto',
        width: s,
        height: s,
        objectFit: 'contain',
        borderRadius: radius ?? (brand === 'shopee' ? 999 : 6),
        ...style,
      }}
    />
  );
}

// Cadangan minimal (bentuk sederhana) bila file logo tidak tersedia.
function BrandFallback({ brand, size, radius, style }) {
  const s = Number(size) || 18;
  const shopee = brand === 'shopee';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
        width: s,
        height: s,
        borderRadius: radius ?? (shopee ? 999 : 6),
        background: shopee ? '#ee4d2d' : '#010101',
        color: '#fff',
        fontSize: Math.max(8, Math.round(s * 0.55)),
        fontWeight: 800,
        lineHeight: 1,
        ...style,
      }}
    >
      {shopee ? 'S' : 'T'}
    </span>
  );
}

export function ShopeeMark({ size = 18, style }) {
  return <BrandImage brand="shopee" size={size} radius={999} style={style} />;
}

export function TikTokMark({ size = 18, style }) {
  return <BrandImage brand="tiktok" size={size} radius={6} style={style} />;
}