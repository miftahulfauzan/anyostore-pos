'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Barcode,
  BadgeDollarSign,
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  ReceiptText,
  Settings,
  Tags,
  Users,
  WalletCards,
  X,
} from 'lucide-react';

// ownerOnly: menu yang hanya tampil untuk role owner.
const navigation = [
  {
    label: 'UTAMA',
    items: [
      { href: '/dashboard', label: 'Dasbor', icon: LayoutDashboard },
      { href: '/history', label: 'Transaksi', icon: ReceiptText },
    ],
  },
  {
    label: 'PRODUK & INVENTORI',
    items: [
      { href: '/products', label: 'Daftar Produk', icon: Package },
      { href: '/products/new', label: 'Tambah Produk', icon: PlusCircle },
      { href: '/inventory', label: 'Stok Produk', icon: Boxes },
      { href: '/inventory/movements', label: 'Riwayat Stok', icon: History },
      { href: '/inventory/barcodes', label: 'Cetak Barcode', icon: Barcode },
      { href: '/inventory/incoming', label: 'Produk Masuk', icon: ArrowDownToLine },
      { href: '/inventory/outgoing', label: 'Produk Keluar', icon: ArrowUpFromLine },
      { href: '/inventory/opname', label: 'Stok Opname', icon: ClipboardCheck },
    ],
  },
  {
    label: 'BISNIS',
    items: [
      { href: '/customers', label: 'Pelanggan', icon: Users },
      { href: '/promotions', label: 'Promo & Diskon', icon: Tags },
      { href: '/expenses', label: 'Pengeluaran', icon: WalletCards },
      { href: '/operations', label: 'Operasional', icon: ClipboardCheck },
      { href: '/reports', label: 'Laporan', icon: ChartNoAxesCombined },
    ],
  },
  {
    label: 'ADMINISTRASI',
    items: [
      { href: '/commissions', label: 'Komisi Staf', icon: BadgeDollarSign, ownerOnly: true },
      { href: '/users', label: 'Pegawai & Akses', icon: Users, ownerOnly: true },
      { href: '/settings', label: 'Pengaturan', icon: Settings, ownerOnly: true },
    ],
  },
];

export default function AppShell({ title, eyebrow, actions, children }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [role, setRole] = useState(null);
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(
    navigation.map((group) => [group.label, group.items.some((item) => pathname === item.href)])
  ));

  // Ambil role user untuk menyaring menu khusus owner.
  useEffect(() => {
    const token = localStorage.getItem('pos_access_token');
    if (!token) return;
    const authHeader = { Authorization: `Bearer ${token}` };
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${baseUrl}/auth/me`, { headers: authHeader })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (body?.data?.role) setRole(body.data.role); })
      .catch(() => {});
    fetch(`${baseUrl}/settings`, { headers: authHeader })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body?.data?.theme) document.documentElement.dataset.theme = body.data.theme;
      })
      .catch(() => {});
  }, []);

  // Saring menu: sembunyikan item ownerOnly untuk non-owner. Buang grup yang jadi kosong.
  const visibleNavigation = navigation
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.ownerOnly || role === 'owner'),
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
    localStorage.removeItem('pos_access_token');
    localStorage.removeItem('pos_refresh_token');
    window.location.assign('/');
  }

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
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`} aria-label="Navigasi utama" id="mobile-navigation">
        <button type="button" className="sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Tutup menu">
          <X aria-hidden="true" size={20} />
        </button>
        <a className="brand" href="/dashboard">
          <span className="brand-mark">A</span>
          <span>Anyostore<small>Retail operations</small></span>
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
          <div><strong>Sesi aktif</strong><small>Kelola toko dengan aman</small></div>
        </div>
        <button className="logout" onClick={logout}><LogOut aria-hidden="true" size={15} /> Keluar</button>
      </aside>

      <main className="app-main">
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
          <div className="header-actions">{actions}</div>
        </header>
        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
