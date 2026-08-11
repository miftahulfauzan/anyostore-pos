'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
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
      { href: '/inventory/mutations', label: 'Mutasi Stok', icon: ArrowUpFromLine, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory/transfers', label: 'Transfer Stok', icon: ArrowRightLeft, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory/opname', label: 'Stok Opname', icon: ClipboardCheck, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory/movements', label: 'Riwayat Stok', icon: History },
      { href: '/inventory/mutation-report', label: 'Laporan Masuk/Keluar', icon: History, roles: ['owner', 'manager', 'admin', 'gudang'] },
    ],
  },
  {
    label: 'BISNIS',
    items: [
      { href: '/customers', label: 'Pelanggan', icon: Users, roles: ['owner', 'manager', 'admin'] },
      { href: '/promotions', label: 'Promo & Diskon', icon: Tags, roles: ['owner', 'manager', 'admin'] },
      { href: '/finance', label: 'Keuangan', icon: WalletCards, roles: ['owner', 'manager', 'admin'] },
      { href: '/reports', label: 'Laporan', icon: ChartNoAxesCombined, roles: ['owner', 'manager', 'admin'] },
      { href: '/reports/tax', label: 'Laporan Pajak', icon: Receipt, roles: ['owner'] },
    ],
  },
  {
    label: 'ADMINISTRASI',
    items: [
      { href: '/commissions', label: 'Komisi Staf', icon: BadgeDollarSign, roles: ['owner'] },
      { href: '/users', label: 'Pegawai & Akses', icon: Users, roles: ['owner'] },
      { href: '/settings/link-page', label: 'Halaman Link', icon: Link2, roles: ['owner'] },
      { href: '/settings', label: 'Pengaturan', icon: Settings, roles: ['owner'] },
      { href: '/profile', label: 'Akun Saya', icon: User },
    ],
  },
];

export default function AppShell({ title, eyebrow, actions, children }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('pos_sidebar_collapsed') === 'true' : false);
  const [role, setRole] = useState(null);
  const [userName, setUserName] = useState('');
  const [theme, setTheme] = useState('light');
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(
    navigation.map((group) => [group.label, group.items.some((item) => pathname === item.href)])
  ));

  // Ambil role user dan tema (localStorage dulu, fallback ke settings backend).
  useEffect(() => {
    // Selalu mulai terang; mode gelap hanya aktif setelah user menekan tombol tema.
    setTheme('light');
    document.documentElement.classList.toggle('dark', false);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${baseUrl}/auth/me`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data?.role) setRole(body.data.role);
        if (body?.data?.name) setUserName(body.data.name);
      })
      .catch(() => {});
    fetch(`${baseUrl}/settings`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        // Tema brand (green/blue/purple) dari Pengaturan toko -> data-theme.
        const brandTheme = body?.data?.theme;
        if (brandTheme && ['green', 'blue', 'purple'].includes(brandTheme)) {
          document.documentElement.dataset.theme = brandTheme;
        }
        // Mode gelap/terang tidak lagi otomatis dari penyimpanan lama;
        // dashboard selalu terang saat dibuka.
      })
      .catch(() => {});
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('pos_theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  }

  // Saring menu per role: item tanpa field `roles` tampil semua; dengan `roles`
  // hanya untuk role tersebut. Selama role null (belum termuat), tampilkan semua
  // supaya tidak flicker.
  const roleKnown = role !== null;
  const visibleNavigation = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !roleKnown || !item.roles || item.roles.includes(role)),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    document.body.classList.add('mobile-nav-active');
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('mobile-nav-active');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileNavOpen]);

  function logout() {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${baseUrl}/auth/logout`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      .catch(() => {})
      .finally(() => {
        localStorage.removeItem('pos_access_token');
        localStorage.removeItem('pos_refresh_token');
        window.location.assign('/');
      });
  }

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('pos_sidebar_collapsed', String(next));
  }

  const sidebarClass = `sidebar${collapsed ? ' collapsed' : ''}${mobileNavOpen ? ' mobile-open' : ''}`;

  return (
    <div className="app-shell">
      <button
        type="button"
        className={`sidebar-backdrop ${mobileNavOpen ? 'visible' : ''}`}
        aria-label="Tutup menu navigasi"
        aria-hidden={!mobileNavOpen}
        tabIndex={mobileNavOpen ? 0 : -1}
        onClick={() => setMobileNavOpen(false)}
      />
      <aside className={sidebarClass} aria-label="Navigasi utama" id="mobile-navigation">
        <button type="button" className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Tutup menu">
          <X aria-hidden="true" size={20} />
        </button>
        <a className="brand" href={role === 'gudang' ? '/dashboard' : '/pos'}>
          <span className="brand-mark">A</span>
          <span>Anyostore<small>{role === 'gudang' ? 'Operasional gudang' : 'Retail operations'}</small></span>
        </a>

        <nav className="side-nav">
          {visibleNavigation.map((group) => (
            <section key={group.label} className="nav-group">
              <button
                type="button"
                className="nav-group-toggle"
                onClick={() => setOpenGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
                aria-expanded={Boolean(openGroups[group.label])}
              >
                <span>{group.label}</span>
                <ChevronDown aria-hidden="true" size={14} className={openGroups[group.label] ? 'chevron-open' : ''} />
              </button>
              {openGroups[group.label] && group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <a key={item.href} href={item.href} className={active ? 'active' : ''}>
                    <Icon aria-hidden="true" size={15} strokeWidth={active ? 2.4 : 1.9} />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="sidebar-store-dot" aria-hidden="true" />
          {!collapsed && <div><strong>{userName || 'Sesi aktif'}</strong><small>{role ? roleLabel(role) : 'Kelola toko dengan aman'}</small></div>}
          <button type="button" className="collapse-toggle" onClick={toggleCollapse} aria-label={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}>
            <ChevronDown aria-hidden="true" size={16} style={{ transform: collapsed ? 'rotate(90deg)' : 'rotate(-90deg)', transition: 'transform .2s' }} />
          </button>
        </div>
        <button className="logout" onClick={logout}><LogOut aria-hidden="true" size={15} /> Keluar</button>
      </aside>

      <main className={`app-main${collapsed ? ' sidebar-collapsed' : ''}`}>
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
