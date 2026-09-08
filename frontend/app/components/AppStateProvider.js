'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { applyPreferences, createSessionLoader, readPreferences } from './app-state.cjs';

const AppStateContext = createContext(null);
const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function AppStateProvider({ children }) {
  const pathname = usePathname();
  const [preferences, setPreferences] = useState({ collapsed: false, theme: 'light', brandTheme: '' });
  const [session, setSession] = useState({ user: null, resolved: false });
  const [openGroups, setOpenGroups] = useState({});
  const generation = useRef(0);
  const loader = useRef(null);
  if (!loader.current) loader.current = createSessionLoader(async () => {
    const response = await fetch(`${api}/auth/me`);
    if (!response.ok) throw new Error('Sesi tidak tersedia');
    const body = await response.json();
    return body.data || null;
  });
  const settingsLoaded = useRef(false);

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

  function updatePreference(key, value) {
    const next = { ...preferences, [key]: value };
    applyPreferences(next, document.documentElement);
    setPreferences(next);
    try { localStorage.setItem(key === 'collapsed' ? 'pos_sidebar_collapsed' : 'pos_theme', String(value)); } catch { /* Preferences still work without storage. */ }
  }

  return <AppStateContext.Provider value={{
    ...preferences, ...session, ensureSession, clearSession, openGroups, setOpenGroups,
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
