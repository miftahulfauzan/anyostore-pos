'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogIn, Plus, Trash2, UserRound } from 'lucide-react';
import AppShell from '../components/AppShell';
import { useAppSession } from '../components/AppStateProvider';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const ACCOUNT_LIMIT = 8;

const ROLE_LABEL = {
  owner: 'Owner', manager: 'Manajer', admin: 'Admin', kasir: 'Kasir', gudang: 'Admin Gudang',
};

function homeFor(role) {
  if (role === 'owner' || role === 'gudang') return '/dashboard';
  return '/pos';
}

export default function AccountSwitcherPage() {
  const router = useRouter();
  const { user, resolved, clearSession, hasUnsavedWork } = useAppSession();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [addChoiceOpen, setAddChoiceOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/auth/accounts`, { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) { router.replace('/login'); return; }
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Daftar akun tidak dapat dimuat');
      setData(body.data);
    } catch (error) {
      setMessage(error.message);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  // Sesi habis saat halaman terbuka: kembali ke login, jangan biarkan halaman
  // ini tampil dengan daftar kosong tanpa penjelasan.
  useEffect(() => {
    if (resolved && !user) router.replace('/login');
  }, [resolved, user, router]);

  function guardUnsaved() {
    return !hasUnsavedWork() || window.confirm('Ada input atau keranjang yang belum disimpan. Pindah akun akan menghapus pekerjaan tersebut. Lanjutkan?');
  }

  async function switchTo(account) {
    if (account.id === data?.active?.id) return;
    if (!guardUnsaved()) return;
    setBusy(`switch-${account.id}`);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/accounts/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: account.id }),
      });
      const body = await response.json();
      if (!response.ok) {
        // Muat ulang daftar: cookie bisa saja sudah dirotasi oleh permintaan
        // lain yang selesai lebih dulu.
        await load();
        throw new Error(body.message || 'Tidak dapat berpindah akun');
      }
      clearSession();
      window.location.replace(homeFor(body.data?.user?.role));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function removeAccount(account) {
    const isActive = account.id === data?.active?.id;
    const confirmation = isActive
      ? `Hapus akun ${account.name || account.email} dan keluar sekarang?`
      : `Hapus akun ${account.name || account.email} dari daftar akun tersimpan?`;
    if (!window.confirm(confirmation)) return;
    setBusy(`remove-${account.id}`);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/accounts/${account.id}`, {
        method: 'DELETE', credentials: 'include',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Akun tidak dapat dihapus');
      if (body.data?.removed_active) {
        clearSession();
        router.replace('/login');
        return;
      }
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy('');
    }
  }

  async function rememberActive() {
    setBusy('remember');
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/accounts/remember`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Akun tidak dapat disimpan');
      await load();
      return true;
    } catch (error) {
      setMessage(error.message);
      return false;
    } finally {
      setBusy('');
    }
  }

  // Menambah akun = tinggalkan akun aktif sekarang. Bila akun aktif belum
  // diingat, spec mewajibkan tiga pilihan: Simpan & lanjut / Lanjut tanpa
  // menyimpan / Batal.
  function addAccount() {
    if (!data?.active_saved) {
      setAddChoiceOpen(true);
      return;
    }
    leaveForNewAccount();
  }

  async function leaveAfterSaving() {
    setAddChoiceOpen(false);
    const saved = await rememberActive();
    if (!saved) return;
    leaveForNewAccount();
  }

  async function leaveForNewAccount() {
    setAddChoiceOpen(false);
    if (!guardUnsaved()) return;
    // Sesi aktif HARUS diakhiri di server dulu: /login mengarahkan balik ke
    // halaman awal role bila cookie sesi masih sah, sehingga tanpa logout
    // "Tambah akun" akan memantul dan tidak pernah menampilkan form.
    setBusy('leave');
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // preserve_saved: akun yang diingat tetap tersedia untuk dipilih lagi.
        body: JSON.stringify({ preserve_saved: true }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Sesi tidak dapat diakhiri. Coba lagi.');
      clearSession();
      router.replace('/login');
    } catch (error) {
      setMessage(error.message || 'Sesi tidak dapat diakhiri. Coba lagi.');
    } finally {
      setBusy('');
    }
  }

  const active = data?.active || user;
  const accounts = (data?.accounts || []).filter((account) => account.id !== active?.id);

  return (
    <AppShell title="Ganti Akun" eyebrow="AKUN">
      <section className="panel" style={{ maxWidth: 620 }}>
        <div className="section-heading">
          <div className="section-head-main"><span className="section-accent" aria-hidden="true" /><h2>Akun aktif</h2></div>
        </div>
        <article className="data-list-item" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <UserRound aria-hidden="true" size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>{active?.name || '-'}</strong>
            <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              {[ROLE_LABEL[active?.role] || active?.role, active?.username || active?.email].filter(Boolean).join(' · ')}
            </div>
          </div>
          {data?.active_saved
            ? <span className="status-pill status-pill-success">Tersimpan</span>
            : (
              <button type="button" className="button-secondary" onClick={rememberActive} disabled={Boolean(busy)}>
                {busy === 'remember' ? 'Menyimpan…' : 'Simpan akun'}
              </button>
            )}
        </article>

        <div className="section-heading" style={{ marginTop: 18 }}>
          <div className="section-head-main"><span className="section-accent" aria-hidden="true" /><h2>Akun tersimpan</h2></div>
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{accounts.length + (data?.active_saved ? 1 : 0)}/{ACCOUNT_LIMIT}</span>
        </div>
        {accounts.length === 0 ? (
          <p className="muted">Belum ada akun lain tersimpan. Tambah akun untuk berpindah tanpa mengetik ulang kredensial.</p>
        ) : (
          <div className="data-list">
            {accounts.map((account) => (
              <div key={account.id} className="data-list-item" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <UserRound aria-hidden="true" size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{account.name || '-'}</strong>
                  <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                    {[ROLE_LABEL[account.role] || account.role, account.username || account.email].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button type="button" className="button-secondary" onClick={() => switchTo(account)} disabled={Boolean(busy)}>
                  <LogIn aria-hidden="true" size={15} /> {busy === `switch-${account.id}` ? 'Berpindah…' : 'Pindah'}
                </button>
                <button
                  type="button"
                  className="icon-action"
                  aria-label={`Hapus akun ${account.name || account.email}`}
                  onClick={() => removeAccount(account)}
                  disabled={Boolean(busy)}
                >
                  <Trash2 aria-hidden="true" size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={addAccount} disabled={Boolean(busy)}>
            <Plus aria-hidden="true" size={15} /> Tambah akun
          </button>
          {data?.active_saved && (
            <button type="button" className="button-secondary" onClick={() => removeAccount(active)} disabled={Boolean(busy)}>
              <Trash2 aria-hidden="true" size={15} /> Hapus akun ini
            </button>
          )}
        </div>
        {message && <p className="message" role="status" style={{ marginTop: 12 }}>{message}</p>}
        <p className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 14 }}>
          Akun hanya disimpan bila Anda memilih &ldquo;Ingat akun ini&rdquo; saat masuk. Maksimal {ACCOUNT_LIMIT} akun
          tersimpan per browser; kredensial dan token tidak pernah disimpan di penyimpanan yang dapat dibaca JavaScript.
        </p>
      </section>

      {addChoiceOpen && (
        <div className="modal-backdrop">
          <section className="panel modal-card" role="dialog" aria-modal="true" aria-labelledby="add-account-title">
            <h2 id="add-account-title" style={{ fontSize: 18, marginTop: 0 }}>Tambah akun lain</h2>
            <p className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
              Akun <strong>{active?.name || active?.email}</strong> belum disimpan di browser ini. Simpan dulu agar bisa
              dipilih kembali tanpa mengetik kredensial?
            </p>
            <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
              <button type="button" onClick={leaveAfterSaving} disabled={busy === 'remember'}>
                {busy === 'remember' ? 'Menyimpan…' : 'Simpan & lanjut'}
              </button>
              <button type="button" className="button-secondary" onClick={leaveForNewAccount}>Lanjut tanpa menyimpan</button>
              <button type="button" className="button-secondary" onClick={() => setAddChoiceOpen(false)}>Batal</button>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
