/* Audit keranjang grosir di viewport HP: memastikan tombol voucher & "Pesan via
   WhatsApp" tidak melebar/terpotong di dalam modal keranjang.
   Jalankan: node scripts/audit-grosir-cart.cjs [url]
   Screenshot: $AUDIT_OUT (default /tmp/anyostore-audit) */
const os = require('os');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const URL_TARGET = process.argv[2] || 'https://grosir.anyostore.id/';
const OUT_DIR = process.env.AUDIT_OUT || path.join(os.tmpdir(), 'anyostore-audit');
const SCREENSHOT = path.join(OUT_DIR, 'grosir-cart-mobile.png');

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL_TARGET, { waitUntil: 'domcontentloaded' });
    // Isi keranjang lewat storage agar modal bisa diuji tanpa klik katalog.
    await page.evaluate(() => localStorage.setItem('landing_cart', JSON.stringify([
      { key: '1-1', productId: 1, name: 'Tes Item Keranjang', price: 95000, qty: 4, variantId: 1, variantLabel: 'Biru', photo: '' }
    ])));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const fab = page.locator('.cart-fab').first();
    if (await fab.isVisible().catch(() => false)) {
      await fab.click({ force: true }).catch(() => {});
      await page.waitForTimeout(700);
    }

    const layout = await page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('[role=dialog]')];
      const modal = dialogs[dialogs.length - 1];
      if (!modal) return { error: 'no modal' };
      const box = modal.getBoundingClientRect();
      const input = modal.querySelector('input[placeholder*="voucher" i]');
      const pakai = [...modal.querySelectorAll('button')].find((b) => /Pakai|Cek/.test(b.textContent));
      const wa = [...modal.querySelectorAll('button')].find((b) => /Pesan via WhatsApp/.test(b.textContent));
      const rect = (el) => (el ? {
        x: Math.round(el.getBoundingClientRect().x),
        w: Math.round(el.getBoundingClientRect().width),
        right: Math.round(el.getBoundingClientRect().right),
      } : null);
      return {
        modal: { x: Math.round(box.x), w: Math.round(box.width), right: Math.round(box.right) },
        voucherInput: rect(input),
        pakaiBtn: rect(pakai),
        waBtn: rect(wa),
        waInsideModal: wa ? wa.getBoundingClientRect().right <= box.right - 1 : null,
        hasAlamat: /Alamat/.test(modal.innerText),
      };
    });

    await page.screenshot({ path: SCREENSHOT });
    console.log(JSON.stringify(layout, null, 2));
    console.log(`screenshot: ${SCREENSHOT}`);
    // Keluar dengan status bukan-nol bila tombol meluber keluar modal.
    if (layout.waInsideModal === false) {
      console.error('GAGAL: tombol "Pesan via WhatsApp" keluar dari batas modal');
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
})();