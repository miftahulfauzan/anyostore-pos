'use client';

import { MOTION_MODES, resolveMotion } from '../components/app-state.cjs';

export const MOTION_STORAGE_KEY = 'pos_motion';

export const MOTION_CHOICES = [
  { value: '', label: 'Ikuti sistem' },
  { value: 'full', label: 'Penuh (animasi lengkap)' },
  { value: 'reduced', label: 'Sederhana (fade saja)' },
  { value: 'off', label: 'Nonaktif' },
];

export function currentMotionChoice() {
  try {
    const stored = window.localStorage.getItem(MOTION_STORAGE_KEY);
    return MOTION_MODES.includes(stored) ? stored : '';
  } catch {
    return '';
  }
}

/**
 * Simpan pilihan pengguna lalu terapkan ke <html data-motion>. Mengembalikan
 * mode efektif (pilihan eksplisit atau hasil mengikuti sistem).
 */
export function setMotionChoice(value) {
  const next = MOTION_MODES.includes(value) ? value : '';
  try {
    if (next) window.localStorage.setItem(MOTION_STORAGE_KEY, next);
    else window.localStorage.removeItem(MOTION_STORAGE_KEY);
  } catch { /* penyimpanan penuh/mode privat: tetap terapkan untuk sesi ini */ }
  const mode = resolveMotion(next);
  document.documentElement.dataset.motion = mode;
  window.dispatchEvent(new CustomEvent('pos:motion-change', { detail: { mode } }));
  return mode;
}

export function currentMotionMode() {
  return document.documentElement.dataset.motion || 'full';
}