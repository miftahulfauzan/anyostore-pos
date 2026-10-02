'use client';

import { useEffect, useRef, useState } from 'react';
import { Building2, Check, ChevronDown, Store, X } from 'lucide-react';
import { useAppSession } from './AppStateProvider';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function branchLabel(branch) {
  return `${branch.type === 'gudang' ? 'Gudang' : 'Toko'} · ${branch.name}`;
}

export default function BranchSwitcher() {
  const { user, activeBranchId, requestActiveBranchChange } = useAppSession();
  const [branches, setBranches] = useState([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const trigger = useRef(null);
  const panel = useRef(null);

  useEffect(() => {
    if (user?.role !== 'owner') return undefined;
    let active = true;
    fetch(`${api}/settings/branches`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Daftar toko tidak dapat dimuat.');
        return (body.data || []).filter((branch) => branch.is_active === undefined || ![false, 0, '0'].includes(branch.is_active));
      })
      .then((items) => { if (active) setBranches(items); })
      .catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [user?.role]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => panel.current?.querySelector('button:not(:disabled)')?.focus());
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const focusable = [...(panel.current?.querySelectorAll('button:not(:disabled)') || [])]
        .filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (user?.role !== 'owner') return null;
  const selected = branches.find((branch) => String(branch.id) === String(activeBranchId));
  const currentLabel = activeBranchId === 'all' ? 'Semua Toko/Gudang' : selected ? branchLabel(selected) : 'Memuat toko…';

  function choose(value) {
    setMessage('');
    if (requestActiveBranchChange(value)) setOpen(false);
  }

  return (
    <div className="branch-switcher">
      <button
        ref={trigger}
        type="button"
        className="branch-switcher-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Toko aktif: ${currentLabel}. Ganti toko`}
        onClick={() => setOpen((value) => !value)}
      >
        {selected?.type === 'gudang' ? <Building2 aria-hidden="true" size={17} /> : <Store aria-hidden="true" size={17} />}
        <span>{currentLabel}</span>
        <ChevronDown aria-hidden="true" size={15} />
      </button>
      {open && <>
        <button type="button" className="branch-switcher-backdrop" aria-label="Tutup pilihan toko" onClick={() => setOpen(false)} />
        <section ref={panel} className="branch-switcher-panel" role="dialog" aria-modal="true" aria-label="Pilih toko atau gudang">
          <header className="branch-switcher-heading">
            <div><strong>Pilih toko / gudang</strong><small>Filter berlaku di halaman yang mendukung konteks ini.</small></div>
            <button type="button" className="branch-switcher-close" aria-label="Tutup pilihan toko" onClick={() => setOpen(false)}><X aria-hidden="true" size={18} /></button>
          </header>
          {message && <p className="branch-switcher-error" role="alert">{message}</p>}
          <div className="branch-switcher-options">
            <button type="button" className={activeBranchId === 'all' ? 'selected' : ''} onClick={() => choose('all')}>
              <span className="branch-switcher-option-icon"><Building2 aria-hidden="true" size={17} /></span>
              <span><strong>Semua Toko/Gudang</strong><small>Agregat untuk halaman yang mendukung</small></span>
              {activeBranchId === 'all' && <Check aria-hidden="true" size={17} />}
            </button>
            {branches.map((branch) => (
              <button type="button" key={branch.id} className={String(activeBranchId) === String(branch.id) ? 'selected' : ''} onClick={() => choose(String(branch.id))}>
                <span className="branch-switcher-option-icon">{branch.type === 'gudang' ? <Building2 aria-hidden="true" size={17} /> : <Store aria-hidden="true" size={17} />}</span>
                <span><strong>{branchLabel(branch)}</strong>{branch.address && <small>{branch.address}</small>}</span>
                {String(activeBranchId) === String(branch.id) && <Check aria-hidden="true" size={17} />}
              </button>
            ))}
            {!branches.length && !message && <p className="branch-switcher-loading">Memuat daftar toko…</p>}
          </div>
        </section>
      </>}
    </div>
  );
}
