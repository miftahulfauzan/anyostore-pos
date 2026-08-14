'use client';

const localDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export const DATE_PRESETS = [
  { key: 'today', label: 'Hari Ini', range: () => { const d = new Date(); return { start: localDate(d), end: localDate(d) }; } },
  { key: 'yesterday', label: 'Kemarin', range: () => { const d = new Date(); d.setDate(d.getDate() - 1); return { start: localDate(d), end: localDate(d) }; } },
  { key: '7d', label: '7 Hari Terakhir', range: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 6); return { start: localDate(s), end: localDate(e) }; } },
  { key: '30d', label: '30 Hari Terakhir', range: () => { const e = new Date(); const s = new Date(); s.setDate(s.getDate() - 29); return { start: localDate(s), end: localDate(e) }; } },
  { key: 'month', label: 'Bulan Ini', range: () => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth(), 1); return { start: localDate(s), end: localDate(d) }; } },
  { key: 'lastmonth', label: 'Bulan Lalu', range: () => { const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() - 1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0); return { start: localDate(s), end: localDate(e) }; } },
];

// Tombol preset rentang tanggal untuk semua filter laporan.
import { useEffect, useState } from 'react';

export default function DateRangePresets({ active, onPick }) {
  // Pantau mode gelap supaya warna tombol selalu kontras tinggi (terang/gelap).
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const update = () =>
      setDark(document.documentElement.classList.contains('dark'));
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => mo.disconnect();
  }, []);
  const style = (isActive) =>
    isActive
      ? { background: dark ? '#2563eb' : '#1e3a5f', color: '#fff', borderColor: 'transparent' }
      : {
          background: dark ? '#253247' : '#eef3fb',
          color: dark ? '#eef3fb' : '#172033',
          border: `1px solid ${dark ? '#334155' : '#cbd5e1'}`,
        };
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {DATE_PRESETS.map((p) => (
        <button key={p.key} type="button" className="small secondary" style={style(active === p.key)} onClick={() => onPick(p.key, p.range())}>{p.label}</button>
      ))}
      <button type="button" className="small secondary" style={style(active === 'custom')} onClick={() => onPick('custom', null)}>Rentang Kustom</button>
    </div>
  );
}
