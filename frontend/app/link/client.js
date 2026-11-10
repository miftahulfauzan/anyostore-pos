'use client';

import { useEffect, useState } from 'react';
import LinkBioPage from '../components/LinkBioPage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function LinkBioClient({ slug = '' }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const endpoint = slug
      ? api + '/link-page/public/' + encodeURIComponent(slug)
      : api + '/link-page';
    fetch(endpoint)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (!body.success) throw new Error(body.message || 'Gagal memuat halaman link');
        setConfig(body.data);
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'Terjadi kesalahan'); });
    return () => { cancelled = true; };
  }, [slug]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <p style={{ color: '#71717a', textAlign: 'center' }}>{error}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans', sans-serif", background: '#f6f8fb' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid #dbe3ee', borderTopColor: '#1e3a5f', animation: 'linkbio-spin 1s linear infinite' }} aria-label="Memuat" />
        <style>{'@keyframes linkbio-spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    );
  }

  return (
    <LinkBioPage
      config={config}
      onLinkClick={(item) => {
        fetch(api + '/link-page/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page_id: config.page_id, branch_id: config.branch_id, item_id: item.id, label: item.label }),
        }).catch(() => {});
      }}
    />
  );
}
