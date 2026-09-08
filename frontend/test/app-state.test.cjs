const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { preferencesScript, readPreferences, createSessionLoader } = require('../app/components/app-state.cjs');

test('preload and hydrated preferences agree, and blocked storage falls back safely', () => {
  const storage = { getItem: (key) => ({ pos_theme: 'dark', pos_sidebar_collapsed: 'true', pos_brand_theme: 'blue' })[key] };
  const element = { dataset: {}, style: {}, classList: { toggle: (name, enabled) => { element[name] = enabled; } } };
  vm.runInNewContext(preferencesScript, { localStorage: storage, document: { documentElement: element } });
  assert.deepEqual(readPreferences(storage), { collapsed: true, theme: 'dark', brandTheme: 'blue' });
  assert.equal(element.dataset.posCollapsed, 'true');
  assert.equal(element.dark, true);
  assert.equal(element.style.colorScheme, 'dark');
  const blocked = { getItem() { throw new Error('blocked'); } };
  assert.deepEqual(readPreferences(blocked), { collapsed: false, theme: 'light', brandTheme: '' });
  assert.doesNotThrow(() => vm.runInNewContext(preferencesScript, { localStorage: blocked, document: { documentElement: element } }));
});

test('concurrent consumers and route remounts share one session request; reset discards old session', async () => {
  let calls = 0;
  const loader = createSessionLoader(async () => ({ id: ++calls, role: 'gudang' }));
  const [first, second] = await Promise.all([loader.load(), loader.load()]);
  assert.deepEqual(first, second);
  assert.equal((await loader.load()).id, 1);
  assert.equal(calls, 1);
  loader.reset();
  assert.equal((await loader.load()).id, 2);
});

test('session failures can retry and a reset during load cannot cache the old account', async () => {
  let resolve;
  let attempts = 0;
  const loader = createSessionLoader(() => {
    attempts += 1;
    if (attempts === 1) return Promise.reject(new Error('offline'));
    if (attempts === 2) return new Promise((done) => { resolve = done; });
    return Promise.resolve({ id: 2 });
  });
  await assert.rejects(loader.load(), /offline/);
  const old = loader.load();
  await Promise.resolve();
  loader.reset();
  assert.deepEqual(await loader.load(), { id: 2 });
  resolve({ id: 1 });
  await old;
  assert.deepEqual(await loader.load(), { id: 2 });
});
