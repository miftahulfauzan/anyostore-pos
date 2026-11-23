/* Audit desain halaman publik web Anyostore — screenshot + deteksi kejanggalan.
   Jalankan: node scripts/audit-web-design.cjs [url ...] */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = process.env.AUDIT_OUT || '/private/var/folders/lw/42tbp4xs7d94jtz0hrj2cxmr0000gp/T/opencode/webshots';
const URLS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['https://anyostore.id/', 'https://grosir.anyostore.id/', 'https://reseller.anyostore.id/'];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const AUDIT = () => {
  const issues = [];
  const vw = window.innerWidth;
  if (document.documentElement.scrollWidth > vw + 1)
    issues.push(`horizontal-overflow: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);

  const tiny = [], small = [], smallButtons = [], zeroGap = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (!el.offsetParent) return;
    const cs = getComputedStyle(el);
    const isText = el.childNodes.length === 1 && el.firstChild.nodeType === 3 && el.textContent.trim();
    if (isText) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 10) tiny.push(`${el.textContent.trim().slice(0, 40)} (${fs}px)`);
      else if (fs < 11) small.push(`${el.textContent.trim().slice(0, 40)} (${fs}px)`);
    }
  });
  document.querySelectorAll('a, button, [role=button], input, select').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    if (r.height < 30 || r.width < 30)
      smallButtons.push(`"${(el.innerText || el.getAttribute('aria-label') || el.type || '').trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  const brokenImgs = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(-70));

  // Teks terpotong parah (tidak ellipsis) di elemen berukuran tetap
  const clipped = [];
  document.querySelectorAll('h1,h2,h3,p,span,a,button').forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.overflow === 'hidden' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 4)
      clipped.push(`"${(el.textContent || '').trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
  });

  // Kontras teks kecil (sampling < 400 elemen)
  const lowContrast = [];
  const lum = (c) => {
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (s) => { const m = s.match(/rgba?\(([\d.]+), ?([\d.]+), ?([\d.]+)(?:, ?([\d.]+))?/); return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null; };
  const bgOf = (el) => { let n = el; while (n && n !== document.documentElement) { const b = parse(getComputedStyle(n).backgroundColor); if (b && b.a > 0.5) return b.c; n = n.parentElement; } return [255, 255, 255]; };
  let checked = 0;
  document.querySelectorAll('p,span,small,a,button,label,li').forEach((el) => {
    if (checked > 400 || !el.offsetParent) return;
    const txt = (el.textContent || '').trim();
    if (!txt || el.children.length) return;
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    if (!fg) return;
    const fs = parseFloat(cs.fontSize);
    if (fs > 16) return;
    const bg = bgOf(el);
    const L1 = lum(fg.c), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const need = fs >= 14 ? 4.5 : 4.5;
    if (ratio < need - 0.4) lowContrast.push(`"${txt.slice(0, 40)}" ${ratio.toFixed(2)}:1 (${fs}px)`);
    checked++;
  });

  return {
    url: location.href,
    title: document.title,
    viewport: `${innerWidth}x${innerHeight}`,
    docHeight: document.documentElement.scrollHeight,
    issues,
    tinyText: tiny.slice(0, 6), tinyCount: tiny.length,
    smallText: small.slice(0, 6), smallCount: small.length,
    smallButtons: smallButtons.slice(0, 8), smallButtonCount: smallButtons.length,
    brokenImgs,
    clipped: clipped.slice(0, 6),
    lowContrast: lowContrast.slice(0, 8), lowContrastCount: lowContrast.length,
  };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const report = [];
  for (const url of URLS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1800);
        const audit = await page.evaluate(AUDIT);
        const slug = url.replace(/https?:\/\//, '').replace(/[^\w]+/g, '-').replace(/-+$/, '');
        const file = path.join(OUT, `${slug}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        report.push({ ...audit, shot: file, consoleErrors: [...new Set(consoleErrors)].slice(0, 5) });
      } catch (e) {
        report.push({ url, viewport: vp.name, error: String(e).slice(0, 200) });
      }
      await ctx.close();
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})();