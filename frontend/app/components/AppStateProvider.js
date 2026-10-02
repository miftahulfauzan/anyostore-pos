'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  applyPreferences,
  createSessionLoader,
  createUnsavedWorkRegistry,
  normalizeActiveBranchId,
  readActiveBranchId,
  readPreferences,
} from './app-state.cjs';

const AppStateContext = createContext(null);
const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function AppStateProvider({ children }) {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState({ collapsed: false, theme: 'light', brandTheme: '' });
  const [session, setSession] = useState({ user: null, resolved: false });
  const [activeBranchId, setActiveBranchId] = useState('');
  const [openGroups, setOpenGroups] = useState({});
  const generation = useRef(0);
  const loader = useRef(null);
  const unsavedWork = useRef(null);
  if (!unsavedWork.current) unsavedWork.current = createUnsavedWorkRegistry();
  if (!loader.current) loader.current = createSessionLoader(async () => {
    const response = await fetch(`${api}/auth/me`);
    if (!response.ok) throw new Error('Sesi tidak tersedia');
    const body = await response.json();
    return body.data || null;
  });
  const settingsLoaded = useRef(false);
  const registerUnsavedWork = useCallback((key, isDirty) => unsavedWork.current.register(key, isDirty), []);
  const hasUnsavedWork = useCallback(() => unsavedWork.current.hasUnsavedWork(), []);

  useEffect(() => {
    const user = session.user;
    if (!user) return;
    if (user.role !== 'owner') {
      setActiveBranchId(user.branch_id ? String(user.branch_id) : '');
      return;
    }
    const fallback = user.branch_id ? String(user.branch_id) : 'all';
    let next = fallback;
    try { next = readActiveBranchId(window.localStorage, fallback); } catch { /* The account branch is a safe default. */ }
    setActiveBranchId(next);
    try { window.localStorage.setItem('pos_active_branch_id', next); } catch { /* Context remains available for this session. */ }
  }, [session.user]);

  useEffect(() => {
    function syncPreferences() {
      let next;
      try { next = readPreferences(window.localStorage); } catch { next = readPreferences(null); }
      applyPreferences(next, document.documentElement);
      setPreferences(next);
    }
    syncPreferences();
    window.addEventListener('storage', syncPreferences);
    return () => window.removeEventListener('storage', syncPreferences);
  }, []);

  useEffect(() => {
    if (session.user?.role !== 'owner') return undefined;
    function syncActiveBranch(event) {
      if (event.key !== 'pos_active_branch_id' && event.key !== null) return;
      const fallback = session.user.branch_id ? String(session.user.branch_id) : 'all';
      let next = fallback;
      try { next = readActiveBranchId(window.localStorage, fallback); } catch { /* Keep a safe branch context. */ }
      if (next === activeBranchId) return;
      if (hasUnsavedWork() && !window.confirm('Toko aktif berubah di tab lain. Pekerjaan yang belum disimpan akan dikosongkan. Lanjutkan?')) {
        try { window.localStorage.setItem('pos_active_branch_id', activeBranchId || fallback); } catch { /* Keep this tab's current context. */ }
        return;
      }
      setActiveBranchId(next);
    }
    window.addEventListener('storage', syncActiveBranch);
    return () => window.removeEventListener('storage', syncActiveBranch);
  }, [activeBranchId, hasUnsavedWork, session.user]);

  const clearSession = useCallback(() => {
    generation.current += 1;
    loader.current.reset();
    settingsLoaded.current = false;
    setSession({ user: null, resolved: false });
    setOpenGroups({});
  }, []);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/') clearSession();
  }, [pathname, clearSession]);

  const ensureSession = useCallback(async () => {
    const current = generation.current;
    try {
      const user = await loader.current.load();
      if (current !== generation.current) return;
      setSession({ user, resolved: true });
      if (user && !settingsLoaded.current) {
        settingsLoaded.current = true;
        fetch(`${api}/settings`).then((r) => r.ok ? r.json() : null).then((body) => {
          if (current !== generation.current) return;
          const brandTheme = body?.data?.theme;
          if (!['green', 'blue', 'purple'].includes(brandTheme)) return;
          document.documentElement.dataset.theme = brandTheme;
          try { localStorage.setItem('pos_brand_theme', brandTheme); } catch { /* Storage is optional. */ }
          setPreferences((previous) => ({ ...previous, brandTheme }));
        }).catch(() => {});
      }
    } catch {
      if (current === generation.current) setSession({ user: null, resolved: true });
    }
  }, []);

  const requestActiveBranchChange = useCallback((value) => {
    if (session.user?.role !== 'owner') return false;
    const next = normalizeActiveBranchId(value, activeBranchId || 'all');
    if (next === activeBranchId) return true;
    if (hasUnsavedWork() && !window.confirm('Ada transaksi atau keranjang yang belum disimpan. Berpindah toko akan mengosongkan pekerjaan tersebut. Lanjutkan?')) return false;
    setActiveBranchId(next);
    try { window.localStorage.setItem('pos_active_branch_id', next); } catch { /* Context remains available for this session. */ }
    return true;
  }, [activeBranchId, hasUnsavedWork, session.user]);

  function updatePreference(key, value) {
    const next = { ...preferences, [key]: value };
    applyPreferences(next, document.documentElement);
    setPreferences(next);
    try { localStorage.setItem(key === 'collapsed' ? 'pos_sidebar_collapsed' : 'pos_theme', String(value)); } catch { /* Preferences still work without storage. */ }
  }

  return <AppStateContext.Provider value={{
    ...preferences, ...session, activeBranchId, requestActiveBranchChange,
    registerUnsavedWork, hasUnsavedWork, ensureSession, clearSession, openGroups, setOpenGroups,
    toggleCollapse: () => updatePreference('collapsed', !preferences.collapsed),
    toggleTheme: () => updatePreference('theme', preferences.theme === 'dark' ? 'light' : 'dark'),
  }}>{children}</AppStateContext.Provider>;
}

export function useAppSession() {
  const state = useContext(AppStateContext);
  if (!state) throw new Error('AppStateProvider is required');
  const { ensureSession } = state;
  useEffect(() => { ensureSession(); }, [ensureSession]);
  return state;
}

export function useUnsavedWork(key, isDirty) {
  const { registerUnsavedWork } = useAppSession();
  const dirtyRef = useRef(Boolean(isDirty));
  dirtyRef.current = Boolean(isDirty);
  useEffect(() => registerUnsavedWork(key, () => dirtyRef.current), [key, registerUnsavedWork]);
}
