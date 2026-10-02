const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
  preferencesScript,
  readPreferences,
  createSessionLoader,
  normalizeActiveBranchId,
  createBranchQuery,
  createUnsavedWorkRegistry,
} = require('../app/components/app-state.cjs');

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

test('branch context accepts all or a positive branch id and falls back safely', () => {
  assert.equal(normalizeActiveBranchId('all'), 'all');
  assert.equal(normalizeActiveBranchId('17'), '17');
  assert.equal(normalizeActiveBranchId('0'), 'all');
  assert.equal(normalizeActiveBranchId('12x'), 'all');
  assert.equal(normalizeActiveBranchId(null, 4), '4');
  assert.deepEqual(createBranchQuery('owner', 'all'), { branch_id: 'all' });
  assert.deepEqual(createBranchQuery('owner', '17'), { branch_id: '17' });
  assert.deepEqual(createBranchQuery('manager', 'all'), {});
});

test('unsaved-work registry reflects active carts and releases them on cleanup', () => {
  const registry = createUnsavedWorkRegistry();
  let dirty = false;
  const unregister = registry.register('pos', () => dirty);
  assert.equal(registry.hasUnsavedWork(), false);
  dirty = true;
  assert.equal(registry.hasUnsavedWork(), true);
  unregister();
  assert.equal(registry.hasUnsavedWork(), false);
});
