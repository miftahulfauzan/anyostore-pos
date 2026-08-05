'use client';

import { useRef } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
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
    section: '#1e3a5f',
    divider: '#d7dfe9',
  },
  dark: {
    page: { background: 'linear-gradient(160deg, #101318 0%, #161b23 55%, #1c2230 100%)', color: '#f4f6f8' },
    card: { background: 'rgba(28,34,45,.92)', border: '1px solid #2b3340', boxShadow: '0 10px 28px rgba(0,0,0,.35)' },
    muted: '#a7b0bd',
    chip: { background: 'rgba(38,46,60,.85)', border: '1px solid #313b4c', color: '#d7dde6' },
    footer: '#8b95a3',
    section: '#e6ebf2',
    divider: '#313b4c',
  },
  light: {
    page: { background: '#ffffff', color: '#18181b' },
    card: { background: '#fafafa', border: '1px solid #ececec', boxShadow: '0 4px 16px rgba(0,0,0,.05)' },
    muted: '#71717a',
    chip: { background: '#fafafa', border: '1px solid #ececec', color: '#52525b' },
    footer: '#a1a1aa',
    section: '#18181b',
    divider: '#e4e4e7',
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

const socialLabels = {
  whatsapp: 'WhatsApp',
  channel: 'WhatsApp Channel',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  shopee: 'Shopee',
  toco: 'TOCO',
  pdf: 'Katalog PDF',
  catalog: 'Katalog',
  phone: 'Telepon',
  map: 'Alamat',
  email: 'Email',
  link: 'Tautan',
};

function initialOf(title) {
  return String(title || 'A').trim().charAt(0).toUpperCase();
}

function CardIcon({ item, size = 38, iconSize = 19, theme }) {
  const { Icon, color } = iconMap[item.icon] || iconMap.link;
  if (item.logo) {
    return (
      <img
        src={item.logo}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: 12, objectFit: 'cover', background: '#fff', border: '1px solid rgba(0,0,0,.08)', flexShrink: 0 }}
      />
    );
  }
  return (
    <span style={{ width: size, height: size, borderRadius: 12, background: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon style={{ width: iconSize, height: iconSize }} aria-hidden="true" />
    </span>
  );
}

function TextItem({ item, theme, layout }) {
  const full = layout === 'grid' ? { gridColumn: '1 / -1' } : {};
  return (
    <h2
      key={item.id}
      style={{
        margin: layout === 'list' || layout === 'showcase' ? '8px 0 2px' : '10px 4px 2px',
        fontSize: 13,
        fontWeight: 800,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        color: theme.section,
        textAlign: 'center',
        ...full,
      }}
    >
      {item.label}
    </h2>
  );
}

function DividerItem({ item, theme, layout }) {
  const full = layout === 'grid' ? { gridColumn: '1 / -1' } : {};
  return (
    <hr
      key={item.id}
      style={{
        width: '100%', margin: '4px 0', border: 'none', borderTop: `1px solid ${theme.divider}`,
        ...full,
      }}
    />
  );
}

function LinkCard({ item, theme, layout, onLinkClick }) {
  const { color } = iconMap[item.icon] || iconMap.link;
  const handleClick = () => onLinkClick?.(item);
  const external = /^https?:\/\//i.test(item.url);

  if (layout === 'grid') {
    return (
      <a
        key={item.id}
        href={item.url}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        onClick={handleClick}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 10px',
          borderRadius: 16, textDecoration: 'none', color: 'inherit', textAlign: 'center',
          transition: 'transform .15s ease, box-shadow .15s ease', ...theme.card,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 26px rgba(0,0,0,.13)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = theme.card.boxShadow; }}
      >
        <CardIcon item={item} size={42} iconSize={21} theme={theme} />
        <span style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>{item.label}</span>
      </a>
    );
  }

  if (layout === 'showcase') {
    return (
      <a
        key={item.id}
        href={item.url}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        onClick={handleClick}
        style={{
          display: 'block', borderRadius: 18, overflow: 'hidden', textDecoration: 'none', color: 'inherit',
          transition: 'transform .15s ease, box-shadow .15s ease', ...theme.card,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 32px rgba(0,0,0,.16)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = theme.card.boxShadow; }}
      >
        {item.logo ? (
          <img src={item.logo} alt="" style={{ width: '100%', height: 170, objectFit: 'cover', display: 'block', background: '#fff' }} />
        ) : (
          <div style={{ height: 112, background: `linear-gradient(135deg, ${color}22, ${color}0d)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CardIcon item={item} size={56} iconSize={28} theme={theme} />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 14px' }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{item.label}</span>
          <ArrowUpRight style={{ width: 18, height: 18, color: theme.muted, flexShrink: 0 }} aria-hidden="true" />
        </div>
      </a>
    );
  }

  // list & carousel
  return (
    <a
      key={item.id}
      href={item.url}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 58, padding: '10px 16px',
        borderRadius: 16, textDecoration: 'none', color: 'inherit', transition: 'transform .15s ease, box-shadow .15s ease',
        ...theme.card,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 32px rgba(0,0,0,.14)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = theme.card.boxShadow; }}
    >
      <CardIcon item={item} theme={theme} />
      <span style={{ flex: 1, fontSize: 15, fontWeight: 700, textAlign: 'left' }}>{item.label}</span>
      <ArrowUpRight style={{ width: 18, height: 18, color: theme.muted, flexShrink: 0 }} aria-hidden="true" />
    </a>
  );
}

export default function LinkBioPage({ config, onLinkClick }) {
  const theme = themes[config?.theme] || themes.denim;
  const items = Array.isArray(config?.links) ? config.links : [];
  const social = Array.isArray(config?.social) ? config.social : [];
  const layout = ['list', 'grid', 'carousel', 'showcase'].includes(config?.layout) ? config.layout : 'list';
  const showInfo = config?.show_info !== false;
  const carouselRef = useRef(null);
  const bgType = config?.background_type || 'theme';
  const overlay = config?.theme === 'dark' ? 'rgba(16,19,24,.87)' : config?.theme === 'light' ? 'rgba(255,255,255,.9)' : 'rgba(246,248,251,.9)';
  const pageBackground = bgType === 'image' && config?.background
    ? { backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(${config.background})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }
    : bgType === 'gradient' && config?.background
      ? { background: config.background }
      : theme.page;
  const info = [
    { key: 'address', value: config?.address, Icon: MapPin },
    { key: 'hours', value: config?.hours, Icon: Clock },
    { key: 'min_order', value: config?.min_order, Icon: PackageCheck },
  ].filter((item) => showInfo && item.value);

  const scrollCarousel = (dir) => carouselRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });

  const containerStyle = {
    width: '100%', marginTop: 28,
    display: layout === 'grid' ? 'grid' : layout === 'carousel' ? 'flex' : 'flex',
    flexDirection: layout === 'list' || layout === 'showcase' ? 'column' : 'row',
    gridTemplateColumns: layout === 'grid' ? 'repeat(2, minmax(0, 1fr))' : undefined,
    gap: layout === 'grid' ? 10 : 12,
  };

  if (layout === 'carousel') {
    containerStyle.overflowX = 'auto';
    containerStyle.scrollSnapType = 'x mandatory';
    containerStyle.padding = '4px 4px 12px';
    containerStyle.scrollbarWidth = 'none';
  }

  return (
    <div style={{ minHeight: '100vh', color: theme.page.color, fontFamily: "'DM Sans', 'Plus Jakarta Sans', system-ui, sans-serif", ...pageBackground }}>
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

        {social.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 16 }}>
            {social.map((s) => {
              const { Icon, color } = iconMap[s.icon] || iconMap.link;
              const external = /^https?:\/\//i.test(s.url);
              return (
                <a
                  key={s.id}
                  href={s.url}
                  target={external ? '_blank' : undefined}
                  rel={external ? 'noopener noreferrer' : undefined}
                  aria-label={socialLabels[s.icon] || 'Tautan'}
                  title={socialLabels[s.icon] || 'Tautan'}
                  style={{ width: 42, height: 42, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color, textDecoration: 'none', transition: 'transform .15s ease', ...theme.chip }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  <Icon style={{ width: 19, height: 19 }} aria-hidden="true" />
                </a>
              );
            })}
          </div>
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

        {layout === 'carousel' && items.filter((i) => i.type !== 'text' && i.type !== 'divider').length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%', marginTop: 18 }}>
            <button
              type="button"
              aria-label="Geser kiri"
              onClick={() => scrollCarousel(-1)}
              style={{ width: 36, height: 36, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,.12)', background: 'rgba(255,255,255,.7)', color: theme.muted, cursor: 'pointer' }}
            >
              <ChevronLeft style={{ width: 18, height: 18 }} />
            </button>
            <button
              type="button"
              aria-label="Geser kanan"
              onClick={() => scrollCarousel(1)}
              style={{ width: 36, height: 36, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,.12)', background: 'rgba(255,255,255,.7)', color: theme.muted, cursor: 'pointer' }}
            >
              <ChevronRight style={{ width: 18, height: 18 }} />
            </button>
          </div>
        )}

        <nav ref={layout === 'carousel' ? carouselRef : undefined} style={containerStyle} aria-label="Tautan">
          {items.map((item) => {
            const type = ['text', 'divider', 'link'].includes(item.type) ? item.type : 'link';
            if (type === 'text') {
              const text = <TextItem item={item} theme={theme} layout={layout} />;
              return layout === 'carousel' ? <div key={item.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'start' }}>{text}</div> : text;
            }
            if (type === 'divider') {
              const divider = <DividerItem item={item} theme={theme} layout={layout} />;
              return layout === 'carousel' ? <div key={item.id} style={{ flex: '0 0 100%', scrollSnapAlign: 'start' }}>{divider}</div> : divider;
            }
            const card = <LinkCard item={item} theme={theme} layout={layout} onLinkClick={onLinkClick} />;
            if (layout === 'carousel') {
              return <div key={item.id} style={{ flex: '0 0 78%', maxWidth: 340, scrollSnapAlign: 'center' }}>{card}</div>;
            }
            return card;
          })}
        </nav>

        <p style={{ margin: '34px 0 0', fontSize: 12, color: theme.footer, textAlign: 'center' }}>
          {config?.title || 'Anyostore'} · Katalog grosir denim wanita
        </p>
      </div>
    </div>
  );
}
