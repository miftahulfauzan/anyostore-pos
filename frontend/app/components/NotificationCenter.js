'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, LoaderCircle, X, XCircle } from 'lucide-react';

const ERROR_WORDS = /gagal|error|kesalahan|tidak dapat|tidak valid|wajib|pilih minimal|maksimal|ditolak|habis|kurang|token/i;
const SUCCESS_WORDS = /berhasil|tersimpan|disimpan|dibuat|diperbarui|ditambahkan|dibuka|ditutup|disetujui|dibayar|selesai/i;

function notificationType(message) {
  if (ERROR_WORDS.test(message)) return 'error';
  if (SUCCESS_WORDS.test(message)) return 'success';
  return 'info';
}

function responseMessage(body, fallback) {
  if (!body || typeof body !== 'object') return fallback;
  return body.message || body.error || body.errors?.[0]?.message || fallback;
}

export default function NotificationCenter() {
  const [notice, setNotice] = useState(null);
  const pendingRequests = useRef(new Set());
  const requestSequence = useRef(0);
  const inlineMessageAt = useRef(0);
  const dismissTimer = useRef(null);
  const successTimer = useRef(null);
  const lastNotice = useRef({ message: '', at: 0 });

  const clearTimers = useCallback(() => {
    window.clearTimeout(dismissTimer.current);
    window.clearTimeout(successTimer.current);
  }, []);

  const show = useCallback((type, message, options = {}) => {
    const cleanMessage = String(message || '').trim();
    if (!cleanMessage) return;

    const now = Date.now();
    if (type !== 'loading' && lastNotice.current.message === cleanMessage && now - lastNotice.current.at < 900) return;
    lastNotice.current = { message: cleanMessage, at: now };
    window.clearTimeout(dismissTimer.current);
    setNotice({ type, message: cleanMessage });

    if (type !== 'loading') {
      dismissTimer.current = window.setTimeout(() => setNotice(null), options.duration || (type === 'error' ? 5000 : 3500));
    }
  }, []);

  const close = useCallback(() => {
    if (notice?.type === 'loading') return;
    window.clearTimeout(dismissTimer.current);
    setNotice(null);
  }, [notice]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.posNotify = {
      loading: (message = 'Sedang memproses…') => show('loading', message),
      success: (message) => show('success', message),
      error: (message) => show('error', message),
      info: (message) => show('info', message),
      close: () => setNotice(null)
    };

    const wrappedFetch = async (input, init = {}) => {
      const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(method);
      const requestId = ++requestSequence.current;
      const startedAt = Date.now();
      let completedSuccessfully = false;

      if (isMutation) {
        window.clearTimeout(successTimer.current);
        pendingRequests.current.add(requestId);
        show('loading', 'Sedang memproses data…');
      }

      try {
        const response = await originalFetch(input, init);
        completedSuccessfully = response.ok;
        if (!response.ok) {
          let body = null;
          try { body = await response.clone().json(); } catch { /* Respons tidak selalu berupa JSON. */ }
          show('error', responseMessage(body, `Proses gagal (${response.status}). Silakan coba lagi.`));
        }
        return response;
      } catch (error) {
        show('error', error?.message === 'Failed to fetch'
          ? 'Tidak dapat terhubung ke server. Periksa koneksi lalu coba lagi.'
          : error?.message || 'Terjadi kesalahan. Silakan coba lagi.');
        throw error;
      } finally {
        if (isMutation) {
          pendingRequests.current.delete(requestId);
          if (completedSuccessfully && pendingRequests.current.size === 0) {
            successTimer.current = window.setTimeout(() => {
              if (inlineMessageAt.current <= startedAt && lastNotice.current.at <= startedAt + 50) {
                show('success', 'Proses berhasil diselesaikan.');
              }
            }, 320);
          }
        }
      }
    };

    window.fetch = wrappedFetch;

    const forwardInlineMessages = () => {
      document.querySelectorAll('.message').forEach((element) => {
        const message = element.textContent?.trim();
        if (!message || element.dataset.popupForwarded === message) return;
        element.dataset.popupForwarded = message;
        element.classList.add('notification-inline-hidden');
        inlineMessageAt.current = Date.now();
        show(notificationType(message), message);
      });
    };

    const observer = new MutationObserver(forwardInlineMessages);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    forwardInlineMessages();

    return () => {
      observer.disconnect();
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
      delete window.posNotify;
      clearTimers();
    };
  }, [clearTimers, show]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && notice?.type !== 'loading') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, notice]);

  if (!notice) return null;

  const Icon = notice.type === 'success' ? CheckCircle2 : notice.type === 'error' ? XCircle : notice.type === 'info' ? Info : LoaderCircle;
  const title = notice.type === 'loading' ? 'Mohon tunggu' : notice.type === 'success' ? 'Berhasil' : notice.type === 'error' ? 'Proses gagal' : 'Informasi';

  return (
    <div className={`notification-layer ${notice.type === 'loading' ? 'is-loading' : ''}`} aria-live={notice.type === 'error' ? 'assertive' : 'polite'}>
      <section className={`notification-popup ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'} aria-atomic="true">
        <span className="notification-icon" aria-hidden="true"><Icon size={24} /></span>
        <div>
          <strong>{title}</strong>
          <p>{notice.message}</p>
        </div>
        {notice.type !== 'loading' && <button type="button" className="notification-close" onClick={close} aria-label="Tutup notifikasi"><X size={18} /></button>}
      </section>
    </div>
  );
}
