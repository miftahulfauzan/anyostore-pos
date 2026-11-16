const MOTION_MODES = ['full', 'reduced', 'off'];

// Preferensi gerak: pilihan eksplisit pengguna (pos_motion) menang; kalau belum
// dipilih, ikuti setelan sistem (prefers-reduced-motion).
function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function resolveMotion(stored) {
  // Daftar ditulis di dalam fungsi supaya ikut terserialisasi ke preferencesScript.
  if (['full', 'reduced', 'off'].includes(stored)) return stored;
  return prefersReducedMotion() ? 'reduced' : 'full';
}

function readPreferences(storage) {
  try {
    const brand = storage.getItem('pos_brand_theme');
    return {
      collapsed: storage.getItem('pos_sidebar_collapsed') === 'true',
      theme: storage.getItem('pos_theme') === 'dark' ? 'dark' : 'light',
      brandTheme: ['green', 'blue', 'purple'].includes(brand) ? brand : '',
      motion: resolveMotion(storage.getItem('pos_motion')),
    };
  } catch {
    return { collapsed: false, theme: 'light', brandTheme: '', motion: resolveMotion('') };
  }
}

function applyPreferences(preferences, element) {
  element.dataset.posCollapsed = String(preferences.collapsed);
  element.classList.toggle('dark', preferences.theme === 'dark');
  element.style.colorScheme = preferences.theme;
  element.dataset.motion = preferences.motion;
  if (preferences.brandTheme) element.dataset.theme = preferences.brandTheme;
}

// Same validated defaults during HTML parsing and hydration. No user data is
// interpolated into this script and storage failure must not block rendering.
// Helper ikut diserialisasi karena readPreferences memakainya.
const preferencesScript = `try{const prefersReducedMotion=${prefersReducedMotion.toString()};const resolveMotion=${resolveMotion.toString()};const readPreferences=${readPreferences.toString()};const applyPreferences=${applyPreferences.toString()};applyPreferences(readPreferences(localStorage),document.documentElement)}catch(e){}`;

function createSessionLoader(fetchSession) {
  let pending;
  let cached;
  let generation = 0;
  return {
    load() {
      if (cached !== undefined) return Promise.resolve(cached);
      if (pending) return pending;
      const current = generation;
      pending = Promise.resolve().then(fetchSession).then((value) => {
        if (current === generation) cached = value;
        return value;
      }).finally(() => { if (current === generation) pending = undefined; });
      return pending;
    },
    reset() { generation += 1; cached = undefined; pending = undefined; },
  };
}

function createRequestSequence() {
  let sequence = 0;
  return {
    next() { sequence += 1; return sequence; },
    isCurrent(requestId) { return requestId === sequence; },
  };
}

function normalizeActiveBranchId(value, fallback = 'all') {
  const normalize = (candidate) => {
    if (candidate === 'all') return 'all';
    const numeric = Number(candidate);
    return Number.isSafeInteger(numeric) && numeric > 0 ? String(numeric) : null;
  };
  return normalize(value) || normalize(fallback) || 'all';
}

function createBranchQuery(role, activeBranchId) {
  return role === 'owner' ? { branch_id: normalizeActiveBranchId(activeBranchId) } : {};
}

function createUnsavedWorkRegistry() {
  const sources = new Map();
  return {
    register(key, isDirty) {
      sources.set(key, isDirty);
      return () => { if (sources.get(key) === isDirty) sources.delete(key); };
    },
    hasUnsavedWork() {
      for (const isDirty of sources.values()) {
        try { if (isDirty()) return true; } catch { /* A broken observer must not block switching. */ }
      }
      return false;
    },
  };
}

function readActiveBranchId(storage, fallback = 'all') {
  try { return normalizeActiveBranchId(storage.getItem('pos_active_branch_id'), fallback); }
  catch { return normalizeActiveBranchId(fallback); }
}

module.exports = {
  MOTION_MODES,
  resolveMotion,
  readPreferences,
  applyPreferences,
  preferencesScript,
  createSessionLoader,
  createRequestSequence,
  normalizeActiveBranchId,
  createBranchQuery,
  createUnsavedWorkRegistry,
  readActiveBranchId,
};
