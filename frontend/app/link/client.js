'use client';

import { useEffect, useState } from 'react';
import LinkBioPage from '../components/LinkBioPage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function LinkBioClient() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(api + '/link-page')
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (!body.success) throw new Error(body.message || 'Gagal memuat halaman link');
        setConfig(body.data);
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'Terjadi kesalahan'); });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ color: '#71717a', textAlign: 'center' }}>{error}</p>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", background: '#f6f8fb' }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid #dbe3ee', borderTopColor: '#1e3a5f', animation: 'linkbio-spin 1s linear infinite' }} aria-label="Memuat" />
        <style>{'@keyframes linkbio-spin{to{transform:rotate(360deg)}}'}</style>
      </div>
    );
  }

  return <LinkBioPage config={config} />;
}
