import { headers } from 'next/headers';

// Homepage gateway: anyostore.my.id bukan lagi katalog, tetapi pintu masuk ke
// dua katalog (grosir & reseller) dan ke aplikasi staf.
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

// Nomor WhatsApp admin diambil dari setelan toko supaya gateway tidak perlu
// di-hardcode saat nomor berganti.
async function adminNumbers() {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') || h.get('host') || 'anyostore.my.id';
    const proto = h.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const response = await fetch(`${proto}://${host}/api/public/settings`, { cache: 'no-store' });
    if (!response.ok) return [];
    const body = await response.json();
    const numbers = body?.data?.whatsapp_numbers;
    return Array.isArray(numbers) ? numbers.filter(Boolean).slice(0, 3) : [];
  } catch {
    return [];
  }
}

function waLink(phone) {
  const clean = String(phone || '').replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent('Halo Anyostore, saya mau tanya katalog denim.')}`;
}

const card = {
  display: 'block',
  padding: '28px 26px',
  borderRadius: 16,
  textDecoration: 'none',
  transition: 'transform .15s ease, box-shadow .15s ease',
};

export default async function GatewayPage() {
  const numbers = await adminNumbers();
  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#fafafa',
        color: '#1a1a1a',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        gap: 28,
      }}
    >
      <header style={{ textAlign: 'center' }}>
        <img
          src="/icon.svg"
          alt="Anyostore"
          width={64}
          height={64}
          style={{ borderRadius: 16, display: 'block', margin: '0 auto 14px' }}
        />
        <h1 style={{ margin: 0, fontSize: 'clamp(26px, 6vw, 38px)', letterSpacing: '-.02em' }}>
          ANYOSTORE
        </h1>
        <p style={{ margin: '6px 0 0', color: '#71717a', fontSize: 14 }}>
          Pakaian denim wanita · pilih katalog yang Anda butuhkan
        </p>
      </header>

      <nav
        aria-label="Pilih katalog"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          width: '100%',
          maxWidth: 720,
        }}
      >
        <a
          href={GROSIR_ORIGIN}
          style={{
            ...card,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            boxShadow: '0 6px 20px rgba(15, 23, 42, .06)',
            color: '#1a1a1a',
          }}
        >
          <span style={{ display: 'block', color: '#1e3a5f', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            Katalog
          </span>
          <strong style={{ display: 'block', marginTop: 6, fontSize: 26, letterSpacing: '-.02em' }}>
            Grosir
          </strong>
          <span style={{ display: 'block', marginTop: 6, color: '#71717a', fontSize: 13.5, lineHeight: 1.5 }}>
            Minimal 4 pcs per model, harga grosir, kirim ke seluruh Indonesia.
          </span>
          <span style={{ display: 'inline-block', marginTop: 14, color: '#1e3a5f', fontWeight: 700, fontSize: 13 }}>
            Buka katalog grosir →
          </span>
        </a>

        <a
          href={RESELLER_ORIGIN}
          style={{ ...card, background: '#1e3a5f', color: '#ffffff', boxShadow: '0 10px 26px rgba(30, 58, 95, .28)' }}
        >
          <span style={{ display: 'block', color: '#b9cbe0', fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>
            Katalog
          </span>
          <strong style={{ display: 'block', marginTop: 6, fontSize: 26, letterSpacing: '-.02em' }}>
            Reseller
          </strong>
          <span style={{ display: 'block', marginTop: 6, color: 'rgba(255,255,255,.82)', fontSize: 13.5, lineHeight: 1.5 }}>
            Harga reseller, bisa pesan langsung dari web, status pesanan bisa dilacak.
          </span>
          <span style={{ display: 'inline-block', marginTop: 14, color: '#ffffff', fontWeight: 700, fontSize: 13 }}>
            Buka katalog reseller →
          </span>
        </a>
      </nav>

      {numbers.length > 0 && (
        <section aria-label="Kontak WhatsApp" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 720 }}>
          {numbers.map((number, index) => (
            <a
              key={number}
              href={waLink(number)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                minHeight: 40,
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid #bfdbfe',
                background: '#ffffff',
                color: '#1e3a5f',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              WA Admin {numbers.length > 1 ? index + 1 : ''} · {number}
            </a>
          ))}
        </section>
      )}

      <footer style={{ textAlign: 'center', color: '#71717a', fontSize: 12.5 }}>
        <a href={`${APP_ORIGIN}/login`} style={{ color: '#1e3a5f', fontWeight: 700, textDecoration: 'none' }}>
          Masuk staf →
        </a>
        <p style={{ margin: '10px 0 0' }}>© {new Date().getFullYear()} Anyostore</p>
      </footer>
    </main>
  );
}