const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('app/globals.css');
const appShell = read('app/components/AppShell.js');
const appState = read('app/components/app-state.cjs');
const animatedValue = read('app/components/AnimatedValue.js');
const motionLib = read('app/lib/motion.js');
const profile = read('app/profile/page.js');
const commissions = read('app/commissions/page.js');
const dashboardSections = read('app/dashboard/OlseraDashboardSections.js');
const packageJson = JSON.parse(read('package.json'));

function keyframe(name) {
  const match = css.match(new RegExp(`@keyframes ${name} \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `keyframe ${name} harus ada`);
  return match[0];
}

test('token gerak dan tiga mode tersedia di CSS', () => {
  for (const token of ['--motion-fast', '--motion-base', '--motion-slow', '--motion-draw', '--ease-standard', '--ease-emphasized']) {
    assert.match(css, new RegExp(`${token}:`), `token ${token} harus didefinisikan`);
  }
  assert.match(css, /html\[data-motion="full"\] \.app-content\.m-page\s*\{[^}]*animation:\s*m-page-in/s);
  assert.match(css, /html\[data-motion="reduced"\] \.app-content\.m-page/);
  assert.match(css, /html\[data-motion="off"\] \.app-content \*/);
});

test('animasi hanya memakai transform dan opacity (tanpa properti layout)', () => {
  for (const name of ['m-page-in', 'm-row-in', 'm-fade-in', 'm-bar-grow']) {
    const block = keyframe(name);
    assert.doesNotMatch(block, /(^|\s)(width|height|top|left|right|bottom|margin|padding|filter|backdrop-filter)\s*:/m,
      `keyframe ${name} tidak boleh menganimasikan properti layout`);
  }
});

test('reduced-motion lama tetap ada dan print mematikan animasi', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print \{[\s\S]*?\.app-content \*[\s\S]*?animation: none !important/);
});

test('preferensi gerak disiapkan sebelum paint dan disimpan sebagai atribut html', () => {
  assert.match(appState, /const MOTION_MODES = \['full', 'reduced', 'off'\]/);
  assert.match(appState, /function resolveMotion/);
  assert.match(appState, /element\.dataset\.motion = preferences\.motion/);
  assert.match(appState, /prefers-reduced-motion/);
  assert.match(appState, /preferencesScript = `try\{const prefersReducedMotion=/);
  assert.match(motionLib, /MOTION_STORAGE_KEY = 'pos_motion'/);
  assert.match(motionLib, /pos:motion-change/);
});

test('transisi halaman dipasang di AppShell dan mode sistem didengarkan', () => {
  assert.match(appShell, /className="app-content m-page" key=\{pathname\}/);
  assert.match(appShell, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(appShell, /document\.documentElement\.dataset\.motion = media\.matches \? 'reduced' : 'full'/);
});

test('pengguna bisa memilih mode animasi di Akun Saya', () => {
  assert.match(profile, /MOTION_CHOICES/);
  assert.match(profile, /Animasi antarmuka/);
  assert.match(profile, /setMotionChoice\(e\.target\.value\)/);
});

test('count-up hanya dipakai kartu ringkasan dan ikut mode gerak', () => {
  assert.match(animatedValue, /countDuration\(mode, duration\)/);
  assert.match(animatedValue, /countValue\(from, numeric, progress\)/);
  assert.match(animatedValue, /pos:motion-change/);
  assert.match(commissions, /AnimatedValue value=\{value\} money=\{money\}/);
  assert.match(dashboardSections, /<AnimatedValue value=\{countTo\} money=\{money\}/);
  // Tabel tidak boleh memakai count-up.
  assert.doesNotMatch(commissions, /<td[^>]*><AnimatedValue/);
});

test('bar komposisi pcs memakai skala horizontal, bukan lebar animasi', () => {
  assert.match(css, /@keyframes m-bar-grow\s*\{[\s\S]*?transform: scaleX\(0\)/);
  assert.match(commissions, /m-compose-fill/);
  assert.match(commissions, /--m-compose-width/);
});

test('tidak menambah dependency animasi baru', () => {
  const deps = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies });
  for (const banned of ['framer-motion', 'motion', 'gsap', '@react-spring/web', 'react-transition-group']) {
    assert.equal(deps.includes(banned), false, `${banned} tidak boleh ditambahkan`);
  }
});
test('grafik digambar sekali tanpa menyentuh properti layout', () => {
  assert.match(css, /@keyframes m-draw \{\s*\n\s*to \{ stroke-dashoffset: 0; \}/);
  assert.match(css, /html\[data-motion="full"\] \.dashboard-report-chart-line/);
  assert.match(css, /html\[data-motion="full"\] \.trend-line/);
  assert.match(css, /html\[data-motion="reduced"\] \.dashboard-report-chart-line/);
  // pathLength=1 membuat dasharray konsisten untuk semua ukuran grafik.
  assert.match(dashboardSections, /dashboard-report-chart-line[^>]*pathLength="1"/);
  const warehouse = read('app/dashboard/WarehouseDashboard.js');
  assert.match(warehouse, /className="trend-line trend-in" pathLength="1"/);
  const mutation = read('app/inventory/mutation-report/MutationReportInsights.js');
  assert.match(mutation, /className="mutation-chart-line" pathLength="1"/);
});

test('bar daftar tumbuh dengan scaleX dan baris aturan terbesar ditandai', () => {
  assert.match(css, /html\[data-motion="full"\] \.dashboard-list-track i,[\s\S]*?\.warehouse-bar-row div i\s*\{[^}]*animation: m-bar-grow/s);
  assert.match(css, /tr\.is-top-rule td:first-child\s*\{[^}]*box-shadow: inset 3px 0 0/s);
  assert.match(commissions, /className=\{r\.rule_id === topRuleId \? 'is-top-rule' : ''\}/);
});

test('angka ringkasan berubah memberi pop singkat, bukan animasi terus-menerus', () => {
  assert.match(animatedValue, /const \[bumped, setBumped\] = useState\(false\)/);
  assert.match(animatedValue, /m-animated-value/);
  assert.match(css, /@keyframes m-pop/);
  assert.match(css, /html\[data-motion="full"\] \.m-animated-value\.is-bumped/);
});
