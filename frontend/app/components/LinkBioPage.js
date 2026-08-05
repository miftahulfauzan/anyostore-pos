import {
  ArrowUpRight,
  BookOpen,
  Clock,
  FileText,
  Link as LinkIcon,
  Mail,
  MapPin,
  MessageCircle,
  Music2,
  PackageCheck,
  Phone,
  Send,
  ShoppingBag,
  Store,
} from 'lucide-react';

function InstagramIcon({ style }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

const themes = {
  denim: {
    page: { background: 'linear-gradient(160deg, #f6f8fb 0%, #e9eef5 55%, #dce5ef 100%)', color: '#1a1a1a' },
    card: { background: 'rgba(255,255,255,.92)', border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(30,58,95,.08)' },
    muted: '#5b6472',
    chip: { background: 'rgba(255,255,255,.8)', border: '1px solid #e2e8f0', color: '#39424f' },
    footer: '#7b8594',
  },
  dark: {
    page: { background: 'linear-gradient(160deg, #101318 0%, #161b23 55%, #1c2230 100%)', color: '#f4f6f8' },
    card: { background: 'rgba(28,34,45,.92)', border: '1px solid #2b3340', boxShadow: '0 10px 28px rgba(0,0,0,.35)' },
    muted: '#a7b0bd',
    chip: { background: 'rgba(38,46,60,.85)', border: '1px solid #313b4c', color: '#d7dde6' },
    footer: '#8b95a3',
  },
  light: {
    page: { background: '#ffffff', color: '#18181b' },
    card: { background: '#fafafa', border: '1px solid #ececec', boxShadow: '0 4px 16px rgba(0,0,0,.05)' },
    muted: '#71717a',
    chip: { background: '#fafafa', border: '1px solid #ececec', color: '#52525b' },
    footer: '#a1a1aa',
  },
};

const iconMap = {
  whatsapp: { Icon: MessageCircle, color: '#25d366' },
  channel: { Icon: Send, color: '#25d366' },
  instagram: { Icon: InstagramIcon, color: '#e1306c' },
  tiktok: { Icon: Music2, color: '#111827' },
  shopee: { Icon: ShoppingBag, color: '#ee4d2d' },
  toco: { Icon: Store, color: '#7c3aed' },
  pdf: { Icon: FileText, color: '#dc2626' },
  catalog: { Icon: BookOpen, color: '#2563eb' },
  phone: { Icon: Phone, color: '#16a34a' },
  map: { Icon: MapPin, color: '#dc2626' },
  email: { Icon: Mail, color: '#2563eb' },
  link: { Icon: LinkIcon, color: '#71717a' },
};

function initialOf(title) {
  return String(title || 'A').trim().charAt(0).toUpperCase();
}

export default function LinkBioPage({ config }) {
  const theme = themes[config?.theme] || themes.denim;
  const links = Array.isArray(config?.links) ? config.links : [];
  const showInfo = config?.show_info !== false;
  const info = [
    { key: 'address', value: config?.address, Icon: MapPin },
    { key: 'hours', value: config?.hours, Icon: Clock },
    { key: 'min_order', value: config?.min_order, Icon: PackageCheck },
  ].filter((item) => showInfo && item.value);

  return (
    <div style={{ minHeight: '100vh', background: theme.page.background, color: theme.page.color, fontFamily: "'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '56px 20px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {config?.avatar ? (
          <img
            src={config.avatar}
            alt={config.title || 'Anyostore'}
            width={112}
            height={112}
            style={{ width: 112, height: 112, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,.9)', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}
          />
        ) : (
          <div style={{ width: 112, height: 112, borderRadius: '50%', background: 'linear-gradient(135deg,#1e3a5f,#2f5f96)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, fontWeight: 800, border: '3px solid rgba(255,255,255,.9)', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }} aria-hidden="true">
            {initialOf(config?.title)}
          </div>
        )}

        <h1 style={{ margin: '18px 0 0', fontSize: 24, fontWeight: 700, textAlign: 'center', letterSpacing: '-.01em' }}>
          {config?.title || 'Anyostore'}
        </h1>
        {config?.subtitle && (
          <p style={{ margin: '8px 0 0', fontSize: 14.5, lineHeight: 1.55, color: theme.muted, textAlign: 'center', maxWidth: 360 }}>
            {config.subtitle}
          </p>
        )}

        {info.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 18 }}>
            {info.map(({ key, value, Icon }) => (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, ...theme.chip }}>
                <Icon style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
                {value}
              </span>
            ))}
          </div>
        )}

        <nav style={{ width: '100%', marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Tautan">
          {links.map((link) => {
            const { Icon, color } = iconMap[link.icon] || iconMap.link;
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 58, padding: '10px 16px',
                  borderRadius: 16, textDecoration: 'none', color: 'inherit', transition: 'transform .15s ease, box-shadow .15s ease',
                  ...theme.card,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 32px rgba(0,0,0,.14)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = theme.card.boxShadow; }}
              >
                <span style={{ width: 38, height: 38, borderRadius: 12, background: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon style={{ width: 19, height: 19 }} aria-hidden="true" />
                </span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 700, textAlign: 'left' }}>{link.label}</span>
                <ArrowUpRight style={{ width: 18, height: 18, color: theme.muted, flexShrink: 0 }} aria-hidden="true" />
              </a>
            );
          })}
        </nav>

        <p style={{ margin: '34px 0 0', fontSize: 12, color: theme.footer, textAlign: 'center' }}>
          {config?.title || 'Anyostore'} · Katalog grosir denim wanita
        </p>
      </div>
    </div>
  );
}
