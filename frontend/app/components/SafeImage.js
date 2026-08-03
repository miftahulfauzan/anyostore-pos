'use client';
import { useState } from 'react';

export default function SafeImage({ src, alt, style, className, eager }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%', background: '#f1f5f9', color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 12, ...style }} className={className}>
        <span>Tanpa foto<br />{alt || ''}</span>
      </div>
    );
  }
  return <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} style={style} className={className} onError={() => setErr(true)} />;
}
