import { headers } from 'next/headers';

// Homepage gateway: anyostore.my.id adalah pintu masuk ke dua katalog
// (grosir & reseller) sekaligus pintu aplikasi staf.
// Katalog grosir: grosir.anyostore.my.id · katalog reseller: reseller.anyostore.my.id
export const dynamic = 'force-dynamic';

const APP_ORIGIN = 'https://anyostore.my.id';
const GROSIR_ORIGIN = 'https://grosir.anyostore.my.id';
const RESELLER_ORIGIN = 'https://reseller.anyostore.my.id';

export const metadata = {
  title: { absolute: 'Anyostore - Grosir & Reseller Pakaian Denim Wanita' },
  description:
    'Anyostore: pilih katalog grosir (minimal 4 pcs per model) atau katalog reseller pakaian denim wanita. Pengiriman ke seluruh Indonesia.',
  alternates: { canonical: APP_ORIGIN },
  openGraph: {
    type: 'website',
    title: 'Anyostore - Grosir & Reseller Pakaian Denim Wanita',
    description:
      'Pilih katalog grosir atau reseller pakaian denim wanita Anyostore. Minimal 4 pcs per model, kirim seluruh Indonesia.',
    url: APP_ORIGIN,
    siteName: 'Anyostore',
    images: [{ url: `${APP_ORIGIN}/og-image.png`, width: 1200, height: 630, alt: 'Anyostore' }],
  },
};

async function currentOrigin() {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'anyostore.my.id';
  const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// Nomor WhatsApp admin diambil dari setelan toko supaya gateway tidak perlu
// di-hardcode saat nomor berganti.
async function adminNumbers(origin) {
  try {
    const response = await fetch(`${origin}/api/public/settings`, { cache: 'no-store' });
    if (!response.ok) return [];
    const body = await response.json();
    const numbers = body?.data?.whatsapp_numbers;
    return Array.isArray(numbers) ? numbers.filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}

// Foto hero diambil dari katalog grosir supaya selalu produk yang dijual saat ini.
async function heroPhoto(origin) {
  try {
    const response = await fetch(`${origin}/api/public/products?limit=8`, { cache: 'no-store' });
    if (!response.ok) return '';
    const body = await response.json();
    const rows = Array.isArray(body.data) ? body.data : [];
    const withPhoto = rows.find((row) => row.photo_path);
    if (!withPhoto) return '';
    const path = String(withPhoto.photo_path);
    return /^https?:/i.test(path) ? path : `${origin}${path.startsWith('/') ? path : `/${path}`}`;
  } catch {
    return '';
  }
}

function waLink(phone) {
  const clean = String(phone || '').replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent('Halo Anyostore, saya mau tanya katalog denim.')}`;
}

export default async function GatewayPage() {
  const origin = await currentOrigin();
  const [numbers, hero] = await Promise.all([adminNumbers(origin), heroPhoto(origin)]);

  return (
    <main className="gw">
      <style>{`
        .gw { min-height: 100vh; display: grid; place-items: center; padding: 28px 18px; background: #f5f1ea;
              font-family: 'DM Sans', system-ui, sans-serif; color: #1a1a1a; }
        .gw-card { width: 100%; max-width: 1040px; display: grid; grid-template-columns: 1fr 1fr;
                   background: #fff; border: 1px solid #e5e7eb; border-radius: 22px; overflow: hidden;
                   box-shadow: 0 24px 60px rgba(15, 23, 42, .12); }
        .gw-visual { position: relative; padding: 26px; display: flex; flex-direction: column; gap: 18px;
                     background: linear-gradient(160deg, #1e3a5f 0%, #2e5d8f 100%); color: #fff; }
        .gw-brand { display: flex; align-items: center; gap: 10px; }
        .gw-brand img { width: 44px; height: 44px; border-radius: 12px; background: #fff; }
        .gw-brand span { font-weight: 800; letter-spacing: -.01em; font-size: 18px; }
        .gw-photo { position: relative; flex: 1; min-height: 240px; border-radius: 16px; overflow: hidden;
                    background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.28); }
        .gw-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .gw-photo-empty { display: grid; place-items: center; height: 100%; min-height: 240px;
                          color: rgba(255,255,255,.72); font-size: 13px; }
        .gw-copy { padding: 40px 36px; display: flex; flex-direction: column; justify-content: center; gap: 14px; }
        .gw-eyebrow { color: #1e3a5f; font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
        .gw-title { margin: 0; font-size: clamp(28px, 3.4vw, 40px); line-height: 1.1; letter-spacing: -.03em; }
        .gw-sub { margin: 0; color: #52525b; font-size: 15px; line-height: 1.6; max-width: 42ch; }
        .gw-actions { display: grid; gap: 10px; margin-top: 6px; }
        .gw-btn { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px;
                  padding: 12px 18px; border-radius: 12px; font-weight: 800; font-size: 14px;
                  text-decoration: none; transition: transform .12s ease, box-shadow .12s ease; }
        .gw-btn:hover { transform: translateY(-1px); }
        .gw-btn-primary { background: #1e3a5f; color: #fff; box-shadow: 0 10px 24px rgba(30,58,95,.28); }
        .gw-btn-secondary { background: #fff; color: #1e3a5f; border: 1.5px solid #1e3a5f; }
        .gw-wa { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
        .gw-wa a { display: inline-flex; align-items: center; min-height: 36px; padding: 6px 12px; border-radius: 999px;
                   border: 1px solid #bfdbfe; background: #f8fafc; color: #1e3a5f; font-size: 12px;
                   font-weight: 700; text-decoration: none; }
        .gw-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px;
                   margin-top: 16px; color: #71717a; font-size: 12px; }
        .gw-foot a { color: #1e3a5f; font-weight: 700; text-decoration: none; }
        @media (max-width: 820px) {
          .gw-card { grid-template-columns: 1fr; border-radius: 18px; }
          .gw-visual { padding: 20px; gap: 14px; }
          .gw-photo { min-height: 200px; }
          .gw-photo-empty { min-height: 200px; }
          .gw-copy { padding: 24px 20px 26px; gap: 12px; }
          .gw-actions { gap: 8px; }
          .gw-btn { min-height: 46px; }
          .gw-foot { flex-direction: column; align-items: flex-start; gap: 6px; }
        }
      `}</style>

      <section className="gw-card" aria-label="Anyostore">
        <div className="gw-visual">
          <div className="gw-brand">
            <img src="/icon.svg" alt="Logo Anyostore" width={44} height={44} />
            <span>ANYOSTORE</span>
          </div>
          <div className="gw-photo">
            {hero ? (
              <img src={hero} alt="Koleksi denim Anyostore" />
            ) : (
              <div className="gw-photo-empty">Koleksi denim terbaru</div>
            )}
          </div>
        </div>

        <div className="gw-copy">
          <span className="gw-eyebrow">Pakaian denim wanita</span>
          <h1 className="gw-title">Grosir atau reseller, pilih katalog Anda</h1>
          <p className="gw-sub">
            Satu merek, dua jalur pembelian. Grosir minimal 4 pcs per model untuk dijual kembali,
            atau katalog reseller dengan harga khusus dan pesanan bisa dilacak dari web.
          </p>

          <div className="gw-actions">
            <a className="gw-btn gw-btn-primary" href={GROSIR_ORIGIN}>
              Katalog Grosir →
            </a>
            <a className="gw-btn gw-btn-secondary" href={RESELLER_ORIGIN}>
              Katalog Reseller →
            </a>
          </div>

          {numbers.length > 0 && (
            <div className="gw-wa" aria-label="Kontak WhatsApp">
              {numbers.map((number, index) => (
                <a key={number} href={waLink(number)}>
                  WA Admin {numbers.length > 1 ? index + 1 : ''} · {number}
                </a>
              ))}
            </div>
          )}

          <div className="gw-foot">
            <a href={`${APP_ORIGIN}/login`}>Masuk staf →</a>
            <span>© {new Date().getFullYear()} Anyostore</span>
          </div>
        </div>
      </section>
    </main>
  );
}