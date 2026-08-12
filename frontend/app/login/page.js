'use client';

import { useState } from 'react';
import { Eye, EyeOff, Mail, ShoppingBag } from 'lucide-react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState('password');
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function homeFor(role) {
    return role === 'gudang' ? '/dashboard' : '/pos';
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/auth/${mode === 'pin' ? 'login-pin' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'pin' ? { email, pin } : { email, password })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Login gagal');
      window.location.assign(homeFor(body.data?.user?.role));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  const secret = mode === 'pin' ? pin : password;
  const setSecret = (v) => (mode === 'pin' ? setPin(v) : setPassword(v));

  return (
    <main className="login-page">
      <header className="login-brand">
        <div className="login-brand-inner">
          <div className="login-logo-tile"><ShoppingBag size={26} strokeWidth={2.2} aria-hidden="true" /></div>
          <div>
            <h1>Anyostore App</h1>
            <p>Powering Your Business</p>
          </div>
        </div>
      </header>

      <div className="login-body">
        <form className="login-card" onSubmit={submit}>
          <div className="login-heading">
            <h2>Login</h2>
            <p>Masuk untuk mengakses kasir, stok, dan laporan toko.</p>
          </div>

          <div className="login-mode" role="tablist" aria-label="Metode masuk">
            <button type="button" className={mode === 'password' ? 'active' : ''} onClick={() => setMode('password')}>Password</button>
            <button type="button" className={mode === 'pin' ? 'active' : ''} onClick={() => setMode('pin')}>PIN</button>
          </div>

          <label className="login-field">
            <span>Email <em className="login-required">*</em></span>
            <div className="login-input">
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" autoComplete="email" required />
              <Mail size={16} strokeWidth={2} aria-hidden="true" />
            </div>
          </label>

          <label className="login-field">
            <span>{mode === 'pin' ? 'PIN (6 digit)' : 'Password'} <em className="login-required">*</em></span>
            <div className="login-input">
              <input
                type={mode === 'pin' || showPassword ? 'text' : 'password'}
                inputMode={mode === 'pin' ? 'numeric' : undefined}
                maxLength={mode === 'pin' ? 6 : undefined}
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={mode === 'pin' ? '••••••' : '••••••••'}
                autoComplete={mode === 'pin' ? 'one-time-code' : 'current-password'}
                required
              />
              {mode === 'password' && (
                <button type="button" className="login-eye" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>
                  {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                </button>
              )}
            </div>
          </label>

          <button className="login-submit" disabled={loading}>
            {loading ? 'Memproses…' : 'Login'}
          </button>

          {message && <p className="message" role="status">{message}</p>}

          <a className="login-back" href="/">Kembali ke Grosir</a>
        </form>
      </div>
    </main>
  );
}
