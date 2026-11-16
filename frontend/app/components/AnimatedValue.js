'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { countDuration, countValue, formatCount } from '../lib/count-up.cjs';

// useLayoutEffect aman dipakai karena komponen ini hanya dirender di klien.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Angka ringkasan yang menghitung naik. Hanya dipakai di kartu ringkasan —
 * tabel dan nominal transaksi tetap statis agar mudah dicocokkan.
 *
 * Preferensi gerak dibaca dari <html data-motion="full|reduced|off">, jadi
 * pilihan pengguna di Akun Saya dan setelan sistem langsung berlaku.
 */
export default function AnimatedValue({ value, money = false, suffix = '', duration = 520, className }) {
  const numeric = Number(value) || 0;
  const [display, setDisplay] = useState(() => formatCount(numeric, money));
  const previousRef = useRef(numeric);
  const frameRef = useRef(0);
  const mountedRef = useRef(false);

  useIsomorphicLayoutEffect(() => {
    const mode = document.documentElement.dataset.motion || 'full';
    const ms = countDuration(mode, duration);
    cancelAnimationFrame(frameRef.current);

    if (!ms || !Number.isFinite(numeric)) {
      previousRef.current = numeric;
      setDisplay(formatCount(numeric, money));
      return undefined;
    }

    // Pertama kali tampil: hitung dari 0. Perubahan berikutnya: dari angka lama.
    const from = mountedRef.current ? previousRef.current : 0;
    mountedRef.current = true;
    previousRef.current = numeric;
    const start = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - start) / ms);
      setDisplay(formatCount(countValue(from, numeric, progress), money));
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    setDisplay(formatCount(from, money));
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [numeric, money, duration]);

  // Saat pengguna mematikan animasi di tengah jalan, langsung loncat ke nilai akhir.
  useEffect(() => {
    const onMotion = () => {
      const mode = document.documentElement.dataset.motion || 'full';
      if (mode === 'off' || mode === 'reduced') {
        cancelAnimationFrame(frameRef.current);
        previousRef.current = numeric;
        setDisplay(formatCount(numeric, money));
      }
    };
    window.addEventListener('pos:motion-change', onMotion);
    return () => window.removeEventListener('pos:motion-change', onMotion);
  }, [numeric, money]);

  return <span className={className}>{display}{suffix}</span>;
}