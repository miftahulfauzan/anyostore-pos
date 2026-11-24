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
  Globe,
  ChevronDown,
  ClipboardCheck,
  History,
  LayoutDashboard,
  ShoppingCart,
  Link2,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  Package,
  PackageSearch,
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
import BranchSwitcher from './BranchSwitcher';

// Roles per item: owner/manajer/admin/kasir/gudang.
// Jika field `roles` tidak ada → tampil untuk semua role login.
const navigation = [
  {
    label: 'OPERASIONAL',
    items: [
      { href: '/pos', label: 'POS', icon: ShoppingCart },
      { href: '/dashboard', label: 'Dasbor', icon: LayoutDashboard },
      { href: '/history', label: 'Transaksi', icon: ReceiptText, roles: ['owner', 'manager', 'admin'] },
      { href: '/closing', label: 'Laci Kas', icon: WalletCards, roles: ['owner', 'manager', 'admin', 'kasir'] },
    ],
  },
  {
    label: 'PRODUK & INVENTORI',
    items: [
      { href: '/inventory/dashboard', label: 'Dashboard Stok', icon: LayoutDashboard, roles: ['owner', 'manager', 'admin'] },
      { href: '/products', label: 'Daftar Produk', icon: Package, roles: ['owner', 'manager', 'admin', 'gudang'] },
      { href: '/inventory', label: 'Stok Produk', icon: Boxes },
      {
        label: 'Mutasi Stok',
        icon: ArrowRightLeft,
        children: [
          { href: '/inventory/incoming', label: 'Stok Masuk', icon: ArrowDownToLine, roles: ['owner', 'gudang'] },
          { href: '/inventory/outgoing', label: 'Stok Keluar', icon: ArrowUpFromLine, roles: ['owner', 'gudang'] },
          { href: '/inventory/transfers', label: 'Transfer Stok', icon: ArrowRightLeft, roles: ['owner', 'manager', 'admin', 'gudang'] },
          { href: '/inventory/opname', label: 'Stok Opname', icon: ClipboardCheck, roles: ['owner', 'manager', 'admin', 'gudang'] },
        ],
      },
      {
        label: 'Riwayat',
        icon: History,
        children: [
          { href: '/inventory/transfers?view=history', label: 'Riwayat Transfer', icon: History, roles: ['owner', 'manager', 'admin'] },
          { href: '/inventory/movements', label: 'Pergerakan Stok', icon: History },
          { href: '/inventory/mutation-report', label: 'Riwayat Mutasi', icon: History, roles: ['owner', 'manager', 'admin', 'gudang'] },
        ],
      },
    ],
  },
  {
    label: 'BISNIS',
    items: [
      { href: '/reports', label: 'Laporan', icon: ChartNoAxesCombined, roles: ['owner', 'manager', 'admin'] },
      { href: '/finance', label: 'Keuangan', icon: WalletCards, roles: ['owner', 'manager', 'admin'] },
      { href: '/reseller-orders', label: 'Pesanan Reseller', icon: PackageSearch, roles: ['owner', 'manager', 'admin'] },
      { href: '/customers', label: 'Pelanggan', icon: Users, roles: ['owner', 'manager', 'admin'] },
      { href: '/promotions', label: 'Promo & Diskon', icon: Tags, roles: ['owner', 'manager', 'admin'] },
      { href: '/reports/tax', label: 'Laporan Pajak', icon: Receipt, roles: ['owner'] },
    ],
  },
  {
    label: 'ADMINISTRASI',
    items: [
      { href: '/commissions', label: 'Komisi Staf', icon: BadgeDollarSign, roles: ['owner', 'manager', 'admin'] },
      { href: '/users', label: 'Pegawai & Akses', icon: Users, roles: ['owner'] },
      { href: '/settings/link-page', label: 'Halaman Link', icon: Link2, roles: ['owner'] },
      { href: '/settings/reseller-payment', label: 'Pembayaran Reseller', icon: WalletCards, roles: ['owner', 'manager', 'admin'] },
      { href: '/store-settings', label: 'Setelan Toko', icon: Settings, roles: ['owner'] },
      { href: '/profile', label: 'Akun Saya', icon: User },
      { href: '/account-switcher', label: 'Ganti Akun', icon: Users },
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
      { href: '/inventory/mutation-report', label: 'Riwayat Mutasi', icon: History, roles: ['gudang'], tone: 'blue' },
      { href: '/inventory/movements', label: 'Laporan Lainnya', icon: ChartNoAxesCombined, roles: ['gudang'], tone: 'pink' },
      { href: '/settings', label: 'Pengaturan', icon: Settings, roles: ['gudang'], tone: 'slate' },
      { href: '/account-switcher', label: 'Ganti Akun', icon: Users, roles: ['gudang'], tone: 'slate' },
    ],
  },
];

export default function AppShell({ title, eyebrow, actions, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, resolved: roleResolved, collapsed, theme, toggleTheme, toggleCollapse, clearSession, hasUnsavedWork, openGroups, setOpenGroups } = useAppSession();
  const role = user?.role || null;
  const userName = user?.name || '';
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const mainRef = useRef(null);
  const sidebarRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  function itemIsCurrent(item) {
    if (!item?.href) return false;
    const itemPath = item.href.split('?')[0];
    const itemQuery = item.href.includes('?') ? item.href.slice(item.href.indexOf('?')) : '';
    return pathname === itemPath && (itemQuery ? search === itemQuery : !search);
  }
  const groupIsOpen = (group) => role === 'gudang' || (openGroups[group.label] ?? group.items.some((item) => itemIsCurrent(item) || item.children?.some(itemIsCurrent)));
  const submenuIsOpen = (item) => openGroups['submenu:' + item.label] ?? item.children.some(itemIsCurrent);

  function confirmNavigation(event, href) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return true;
    if (event.defaultPrevented || (pathname === href.split('?')[0] && window.location.search === (href.includes('?') ? href.slice(href.indexOf('?')) : ''))) return true;
    if (!hasUnsavedWork() || window.confirm('Ada input atau keranjang stok yang belum disimpan. Jika pindah halaman, data tersebut akan hilang. Tetap keluar?')) return true;
    event.preventDefault();
    return false;
  }

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
  const roleCanSee = (item) => !item.roles || item.roles.includes(role);
  const visibleNavigation = roleResolved && roleKnown ? navSource
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => item.children ? { ...item, children: item.children.filter(roleCanSee) } : item)
        .filter((item) => item.children ? item.children.length > 0 : roleCanSee(item)),
    }))
    .filter((group) => group.items.length > 0) : [];

  useEffect(() => {
    // Preferensi eksplisit pengguna (pos_motion) menang; kalau belum ada,
    // atribut data-motion mengikuti setelan sistem secara langsung.
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      let stored = '';
      try { stored = window.localStorage.getItem('pos_motion') || ''; } catch { stored = ''; }
      if (stored) return;
      document.documentElement.dataset.motion = media.matches ? 'reduced' : 'full';
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setTooltip(null);
    setSearch(window.location.search);
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [pathname]);

  useEffect(() => {
    if (!actionsOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setActionsOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [actionsOpen]);

  useEffect(() => { setActionsOpen(false); }, [pathname]);

  useEffect(() => {
    // Submenu (Mutasi Stok / Riwayat) hanya terbuka otomatis saat salah satu
    // isinya sedang dibuka. Begitu pindah ke menu lain (mis. Daftar Produk,
    // Stok Produk, Dasbor), submenu itu ditutup lagi agar sidebar ringkas.
    const submenuItems = navigation.flatMap((group) => group.items).filter((item) => item.children?.length);
    const activeSubmenu = submenuItems.find((item) => item.children.some((child) => {
      const itemPath = child.href.split('?')[0];
      const itemQuery = child.href.includes('?') ? child.href.slice(child.href.indexOf('?')) : '';
      return pathname === itemPath && (itemQuery ? search === itemQuery : !search);
    }));
    setOpenGroups((current) => {
      let changed = false;
      const next = { ...current };
      for (const item of submenuItems) {
        const key = 'submenu:' + item.label;
        const shouldOpen = activeSubmenu === item;
        if (shouldOpen && !next[key]) { next[key] = true; changed = true; }
        if (!shouldOpen && next[key]) { next[key] = false; changed = true; }
      }
      if (activeSubmenu && !next['PRODUK & INVENTORI']) { next['PRODUK & INVENTORI'] = true; changed = true; }
      return changed ? next : current;
    });
  }, [pathname, search, setOpenGroups]);

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

  useEffect(() => {
    // Geser dari tepi kiri layar membuka sidebar di HP, geser ke kiri saat
    // sidebar terbuka menutupnya. Zona mulai 24 px (bukan 0) karena tepi kiri
    // dipakai gesture Back Chrome/Android; ambang 56 px memisahkan dari ketukan.
    const edgeZone = 24;
    const threshold = 56;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onTouchStart = (event) => {
      tracking = false;
      if (event.touches.length !== 1 || !window.matchMedia('(max-width: 820px)').matches) return;
      const touch = event.touches[0];
      // Saat terbuka, geseran hanya dilacak bila dimulai di dalam sidebar agar
      // daftar isi (tabel, chip) tetap bisa digeser seperti biasa.
      if (mobileNavOpen) tracking = Boolean(sidebarRef.current?.contains(event.target));
      else tracking = touch.clientX <= edgeZone;
      startX = touch.clientX;
      startY = touch.clientY;
    };
    const onTouchMove = (event) => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
      if (mobileNavOpen) {
        if (dx <= -threshold) { tracking = false; setMobileNavOpen(false); }
        return;
      }
      if (dx >= threshold) { tracking = false; setMobileNavOpen(true); }
    };
    const onTouchEnd = () => { tracking = false; };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [mobileNavOpen]);

  function logout() {
    // Dialog dua pilihan seperti APK: akun yang diingat tetap tersedia setelah
    // "Keluar saja", atau ikut dihapus dengan "Keluar & hapus akun ini".
    if (hasUnsavedWork() && !window.confirm('Ada input atau keranjang stok yang belum disimpan. Jika keluar, data tersebut akan hilang. Tetap keluar?')) return;
    setLogoutOpen(true);
  }

  async function performLogout(removeSaved) {
    setLogoutOpen(false);
    setLoggingOut(true);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    try {
      await fetch(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(removeSaved ? { remove_saved: true } : { preserve_saved: true }),
      });
    } catch {
      // Logout tetap mengosongkan sesi lokal meski jaringan gagal.
    } finally {
      clearSession();
      try {
        localStorage.removeItem('pos_access_token');
        localStorage.removeItem('pos_refresh_token');
      } catch { /* Logout also works when storage is blocked. */ }
      router.replace('/');
    }
  }

  const sidebarClass = `sidebar${collapsed ? ' collapsed' : ''}${mobileNavOpen ? ' mobile-open' : ''}${role === 'gudang' ? ' sidebar-warehouse' : ''}${roleResolved ? ' role-ready' : ' role-loading'}`;

  function renderNavigationLink(item) {
    const Icon = item.icon;
    const active = item.active !== false && itemIsCurrent(item);
    const itemQuery = item.href.includes('?') ? item.href.slice(item.href.indexOf('?')) : '';
    return (
      <Link key={item.href} href={item.href} onClick={(event) => { if (!confirmNavigation(event, item.href)) return; setSearch(itemQuery); setTooltip(null); setMobileNavOpen(false); }} className={(active ? 'active' : '') + (item.tone ? ' tone-' + item.tone : '')} aria-current={active ? 'page' : undefined} {...tooltipProps(item.label)}>
        <Icon aria-hidden="true" size={15} strokeWidth={active ? 2.4 : 1.9} />
        <span>{item.label}</span>
      </Link>
    );
  }

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
        <Link className="brand" href={role === 'gudang' ? '/dashboard' : '/pos'} onClick={(event) => confirmNavigation(event, role === 'gudang' ? '/dashboard' : '/pos')} {...tooltipProps('Anyostore')}>
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
                if (!item.children) return renderNavigationLink(item);
                const Icon = item.icon;
                const opened = submenuIsOpen(item);
                const active = item.children.some(itemIsCurrent);
                const submenuKey = 'submenu:' + item.label;
                return (
                  <div key={item.label} className={'nav-subgroup' + (opened ? ' nav-subgroup-open' : '')}>
                    <button
                      type="button"
                      className={'nav-subgroup-toggle' + (active ? ' active' : '')}
                      onClick={() => setOpenGroups((current) => ({ ...current, [submenuKey]: !opened }))}
                      aria-label={item.label}
                      aria-expanded={opened}
                      {...tooltipProps(item.label)}
                    >
                      <Icon aria-hidden="true" size={15} strokeWidth={active ? 2.4 : 1.9} />
                      <span className="nav-subgroup-label">{item.label}</span>
                      <ChevronDown aria-hidden="true" size={14} className={'nav-subgroup-chevron' + (opened ? ' chevron-open' : '')} />
                    </button>
                    {opened && <div className="nav-subgroup-items">{item.children.map(renderNavigationLink)}</div>}
                  </div>
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
      {logoutOpen && (
        <div className="modal-backdrop">
          <section className="panel modal-card" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title">
            <h2 id="logout-dialog-title" style={{ fontSize: 18, marginTop: 0 }}>Keluar dari akun</h2>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              Pilih apakah akun ini tetap tersimpan di browser untuk berpindah cepat nanti.
            </p>
            <div className="modal-actions" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <button type="button" onClick={() => performLogout(false)} disabled={loggingOut}>
                {loggingOut ? 'Memproses…' : 'Keluar saja (akun tersimpan)'}
              </button>
              <button type="button" className="button-secondary" onClick={() => performLogout(true)} disabled={loggingOut}>
                Keluar &amp; hapus akun ini
              </button>
              <button type="button" className="button-secondary" onClick={() => setLogoutOpen(false)} disabled={loggingOut}>Batal</button>
            </div>
          </section>
        </div>
      )}
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
          <div className={`header-actions${actions ? ' has-menu' : ''}`}>
            <BranchSwitcher />
            <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'}>
              {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            </button>
            {actions ? (
              <button
                type="button"
                className="header-actions-menu"
                onClick={() => setActionsOpen(true)}
                aria-label="Aksi halaman"
                aria-haspopup="dialog"
                aria-expanded={actionsOpen}
              >
                <MoreHorizontal aria-hidden="true" size={20} />
              </button>
            ) : null}
            <div className="header-action-links">{actions}</div>
          </div>
        </header>
        {actions && actionsOpen ? (
          <div className="header-actions-sheet" role="dialog" aria-modal="true" aria-label="Aksi halaman">
            <button type="button" className="header-actions-sheet-backdrop" aria-label="Tutup aksi halaman" onClick={() => setActionsOpen(false)} />
            <div className="header-actions-sheet-panel">
              <div className="header-actions-sheet-head">
                <strong>Aksi halaman</strong>
                <button type="button" className="header-actions-sheet-close" onClick={() => setActionsOpen(false)} aria-label="Tutup">
                  <X aria-hidden="true" size={18} />
                </button>
              </div>
              <div className="header-actions-sheet-body">{actions}</div>
              <button type="button" className="header-actions-sheet-theme" onClick={() => { toggleTheme(); setActionsOpen(false); }}>
                {theme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
                <span>{theme === 'dark' ? 'Mode terang' : 'Mode gelap'}</span>
              </button>
            </div>
          </div>
        ) : null}
        <div className="app-content m-page" key={pathname}>{children}</div>
      </main>
    </div>
  );
}
