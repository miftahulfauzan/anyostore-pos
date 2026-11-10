'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// Indikator offline sederhana untuk PWA: muncul saat browser kehilangan
// koneksi supaya pengguna tahu data tidak akan tersimpan sampai internet
// kembali. Aplikasi Android punya antrean offline; web hanya memberi tahu.
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff aria-hidden="true" size={15} />
      <span>Koneksi terputus. Transaksi tidak akan tersimpan sampai internet kembali.</span>
    </div>
  );
}
