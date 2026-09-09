'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  BadgeDollarSign,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  Moon,
  Package,
  ReceiptText,
  Receipt,
  Settings,
  Sun,
  Tags,
  User,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { roleLabel } from '../lib/roles';
import { useAppSession } from './AppStateProvider';

// Roles per item: owner/manajer/admin/kasir/gudang.
// Jika field `roles` tidak ada → tampil untuk semua role login.
const navigation = [
  {
    label: 'UTAMA',
    items: [
      { href: '/dashboard', label: 'Dasbor', icon: LayoutDashboard },
      { href: '/history', label: 'Transaksi', icon: ReceiptText, roles: ['owner', 'manager', 'admin'] },
    ],
  },
  {
    label: 'PRODUK & INVENTORI',
    items: [
      { href: '/products', label: 'Daftar Produk', icon: Package, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory', label: 'Stok Produk', icon: Boxes },
      { href: '/inventory/incoming', label: 'Stok Masuk', icon: ArrowDownToLine, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory/outgoing', label: 'Stok Keluar', icon: ArrowUpFromLine, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory/transfers', label: 'Transfer Stok', icon: ArrowRightLeft, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory/transfers?view=history', label: 'Riwayat Transfer', icon: History, roles: ['owner', 'manager', 'admin'] },
      { href: '/inventory/opname', label: 'Stok Opname', icon: ClipboardCheck, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory/movements', label: 'Riwayat Stok', icon: History },
      { href: '/inventory/mutation-report', label: 'Laporan Masuk/Keluar', icon: History, roles: ['owner', 'manager', 'admin', 'gudang'] },
    ],
  },
  {
    label: 'BISNIS',
    items: [
      { href: '/customers', label: 'Transaksi', icon: Users, roles: ['owner', 'manager', 'admin'] },
      { href: '/promotions', label: 'Promo & Diskon', icon: Tags, roles: ['owner', 'manager', 'admin'] },
      { href: '/finance', label: 'Keuangan', icon: WalletCards, roles: ['owner', 'manager', 'admin'] },
      { href: '/reports', label: 'Laporan', icon: ChartNoAxesCombined, roles: ['owner', 'manager', 'admin'] },
      { href: '/reports/tax', label: 'Laporan Pajak', icon: Receipt, roles: ['owner'] },
    ],
  },
  {
    label: 'ADMINISTRASI',
    items: [
      { href: '/commissions', label: 'Komisi Staf', icon: BadgeDollarSign, roles: ['owner', 'manager', 'admin'] },
      { href: '/users', label: 'Pegawai & Akses', icon: Users, roles: ['owner'] },
      { href: '/settings/link-page', label: 'Halaman Link', icon: Link2, roles: ['owner'] },
      { href: '/settings', label: 'Pengaturan', icon: Settings, roles: ['owner'] },
      { href: '/profile', label: 'Akun Saya', icon: User },
    ],
  },
];

// Navigasi khusus Admin Gudang: dibuat ringkas sesuai alur kerja gudang,
// sementara role toko/owner tetap memakai navigasi umum di atas.
const warehouseNavigation = [
  {
    label: 'UTAMA',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['gudang'], tone: 'green' },
    ],
  },
  {
    label: 'TRANSAKSI',
    items: [
      { href: '/products', label: 'Master Produk', icon: Tags, roles: ['gudang'], tone: 'purple' },
      { href: '/inventory/incoming', label: 'Stock Masuk', icon: ArrowDownToLine, roles: ['gudang'], tone: 'blue' },
      { href: '/inventory/outgoing', label: 'Stock Keluar', icon: ArrowUpFromLine, roles: ['gudang'], tone: 'red' },
      { href: '/inventory/opname', label: 'Stock Opname', icon: ClipboardCheck, roles: ['gudang'], tone: 'cyan' },
    ],
  },
  {
    label: 'GUDANG',
    items: [
      { href: '/inventory', label: 'Manajemen Gudang', icon: Boxes, roles: ['gudang'], tone: 'blue' },
      { href: '/inventory/transfers', label: 'Transfer Gudang', icon: ArrowRightLeft, roles: ['gudang'], tone: 'cyan' },
      { href: '/inventory/transfers?view=history', label: 'Riwayat Transfer', icon: History, roles: ['gudang'], tone: 'cyan' },
    ],
  },
  {
    label: 'LAINNYA',
    items: [
      { href: '/inventory/mutation-report', label: 'Keluar Masuk', icon: ArrowDownToLine, roles: ['gudang'], tone: 'blue' },
      { href: '/inventory/movements', label: 'Laporan Lainnya', icon: ChartNoAxesCombined, roles: ['gudang'], tone: 'pink' },
      { href: '/settings', label: 'Pengaturan', icon: Settings, roles: ['gudang'], tone: 'slate' },
    ],
  },
];

export default function AppShell({ title, eyebrow, actions, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, resolved: roleResolved, collapsed, theme, toggleTheme, toggleCollapse, clearSession, openGroups, setOpenGroups } = useAppSession();
  const role = user?.role || null;
  const userName = user?.name || '';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState('');
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const groupIsOpen = (group) => role === 'gudang' || (openGroups[group.label] ?? group.items.some((item) => pathname === item.href.split('?')[0]));

  function showTooltip(event, label) {
    if (!collapsed || !window.matchMedia('(min-width: 821px)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltip({ label, left: rect.right + 10, top: Math.min(rect.top, window.innerHeight - 40) });
  }

  function tooltipProps(label) {
    return { title: label, 'aria-label': label,
      onMouseEnter: (event) => showTooltip(event, label), onFocus: (event) => showTooltip(event, label),
      onMouseLeave: () => setTooltip(null), onBlur: () => setTooltip(null),
      onKeyDown: (event) => { if (event.key === 'Escape') setTooltip(null); },
    };
  }

  // Saring menu per role. Saat role belum selesai dibaca, menu dikosongkan
  // sementara supaya navigasi role lain tidak sempat terlihat.
  const roleKnown = role !== null;
  const navSource = role === 'gudang' ? warehouseNavigation : navigation;
  const visibleNavigation = roleResolved && roleKnown ? navSource
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !roleKnown || !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0) : [];

  useEffect(() => {
    setMobileNavOpen(false);
    setTooltip(null);
    setSearch(window.location.search);
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const previousFocus = document.activeElement;
    sidebarRef.current?.querySelector('.sidebar-close')?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
      if (event.key === 'Tab') {
        const focusable = [...sidebarRef.current.querySelectorAll('a[href], button:not(:disabled)')].filter((node) => node.getClientRects().length > 0);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.body.classList.add('mobile-nav-active');
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('mobile-nav-active');
      window.removeEventListener('keydown', closeOnEscape);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileNavOpen]);

  function logout() {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .catch(() => {})
      .finally(() => {
        clearSession();
        try {
          localStorage.removeItem('pos_access_token');
          localStorage.removeItem('pos_refresh_token');
        } catch { /* Logout also works when storage is blocked. */ }
        router.replace('/');
      });
  }

  const sidebarClass = `sidebar${collapsed ? ' collapsed' : ''}${mobileNavOpen ? ' mobile-open' : ''}${role === 'gudang' ? ' sidebar-warehouse' : ''}${roleResolved ? ' role-ready' : ' role-loading'}`;

  return (
    <div className={`app-shell${role === 'gudang' ? ' app-shell-warehouse' : ''}`}>
      <button
        type="button"
        className={`sidebar-backdrop ${mobileNavOpen ? 'visible' : ''}`}
        aria-label="Tutup menu navigasi"
        aria-hidden={!mobileNavOpen}
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside ref={sidebarRef} className={sidebarClass} aria-label="Navigasi utama" id="mobile-navigation" onScroll={() => setTooltip(null)}>
        <button type="button" className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Tutup menu">
          <X aria-hidden="true" size={20} />
        </button>
        <Link className="brand" href={role === 'gudang' ? '/dashboard' : '/pos'} {...tooltipProps('Anyostore')}>
          <span className="brand-mark">A</span>
          <span>Anyostore<small>{role === 'gudang' ? 'Operasional gudang' : 'Retail operations'}</small></span>
        </Link>

        <nav className="side-nav">
          {!roleResolved && <div className="sidebar-nav-skeleton" aria-label="Memuat navigasi"><i /><i /><i /><i /></div>}
          {roleResolved && !roleKnown && <div className="sidebar-session-error" role="alert"><strong>Sesi tidak tersedia</strong><Link href="/login">Masuk lagi</Link></div>}
          {visibleNavigation.map((group) => (
            <section key={group.label} className={`nav-group${groupIsOpen(group) ? ' nav-group-open' : ''}${role === 'gudang' ? ' warehouse-nav-group' : ''}`}>
              {role === 'gudang' ? <div className="warehouse-nav-label">{group.label}</div> : <button
                type="button"
                className="nav-group-toggle"
                onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !groupIsOpen(group) }))}
                aria-label={group.label}
                aria-expanded={groupIsOpen(group)}
              >
                <span>{group.label}</span>
                <ChevronDown aria-hidden="true" size={14} className={groupIsOpen(group) ? 'chevron-open' : ''} />
              </button>}
              {group.items.map((item) => {
                const Icon = item.icon;
                const itemPath = item.href.split('?')[0];
                const itemQuery = item.href.includes('?') ? item.href.slice(item.href.indexOf('?')) : '';
                const active = item.active !== false && pathname === itemPath && (itemQuery ? search === itemQuery : !search);
                return (
                  <Link key={item.href} href={item.href} onClick={() => { setSearch(itemQuery); setTooltip(null); setMobileNavOpen(false); }} className={`${active ? 'active' : ''}${item.tone ? ` tone-${item.tone}` : ''}`} aria-current={active ? 'page' : undefined} {...tooltipProps(item.label)}>
                    <Icon aria-hidden="true" size={15} strokeWidth={active ? 2.4 : 1.9} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-store-dot" aria-hidden="true" />
          <div><strong>{userName || 'Sesi aktif'}</strong><small>{role ? roleLabel(role) : 'Kelola toko dengan aman'}</small></div>
          <button type="button" className="collapse-toggle" onClick={() => { toggleCollapse(); setTooltip(null); }} aria-expanded={!collapsed} {...tooltipProps(collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar')}>
            <ChevronDown aria-hidden="true" size={16} style={{ transform: collapsed ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
          </button>
        </div>
        <button type="button" className="logout" onClick={logout} {...tooltipProps('Keluar')}><LogOut aria-hidden="true" size={15} /> <span>Keluar</span></button>
      </aside>
      {tooltip && <div className="sidebar-tooltip" role="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>{tooltip.label}</div>}

      <main ref={mainRef} id="main-content" tabIndex={-1} className={`app-main${collapsed ? ' sidebar-collapsed' : ''}`}>
        <header className="app-header">
          <div className="app-header-heading">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Buka menu navigasi"
              aria-controls="mobile-navigation"
              aria-expanded={mobileNavOpen}
            >
              <Menu aria-hidden="true" size={21} />
            </button>
            <div>
              <p className="eyebrow">{eyebrow || 'OPERASIONAL TOKO'}</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="header-actions">
            <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}>
              {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            </button>
            {actions}
          </div>
        </header>
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
