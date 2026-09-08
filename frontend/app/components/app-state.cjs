function readPreferences(storage) {
  try {
    const brand = storage.getItem('pos_brand_theme');
    return {
      collapsed: storage.getItem('pos_sidebar_collapsed') === 'true',
      theme: storage.getItem('pos_theme') === 'dark' ? 'dark' : 'light',
      brandTheme: ['green', 'blue', 'purple'].includes(brand) ? brand : '',
    };
  } catch {
    return { collapsed: false, theme: 'light', brandTheme: '' };
  }
}

function applyPreferences(preferences, element) {
  element.dataset.posCollapsed = String(preferences.collapsed);
  element.classList.toggle('dark', preferences.theme === 'dark');
  element.style.colorScheme = preferences.theme;
  if (preferences.brandTheme) element.dataset.theme = preferences.brandTheme;
}

// Same validated defaults during HTML parsing and hydration. No user data is
// interpolated into this script and storage failure must not block rendering.
const preferencesScript = `try{(${applyPreferences.toString()})((${readPreferences.toString()})(localStorage),document.documentElement)}catch(e){}`;

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

module.exports = { readPreferences, applyPreferences, preferencesScript, createSessionLoader };
