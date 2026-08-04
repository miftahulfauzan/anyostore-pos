'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { FlipHorizontal2, FlipVertical2, GripVertical, ImagePlus, Plus, RotateCcw, RotateCw, Video, X, ZoomIn, ZoomOut } from 'lucide-react';
import AppShell from '../../../components/AppShell';
import { fileToDataUrl, uploadMediaData, validateDataUpload } from '../../../lib/media-upload';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const emptyVariant = () => ({ color: '', size: '', sku: '', barcode: '', price: '' });
const ACCENT = '#1e3a5f';

// Transform lama disimpan sebagai "scale,xPct,yPct" untuk thumbnail WYSIWYG.
// Modal "Ubah Foto Produk" sekarang mem-bake crop menjadi JPEG 1200x1600
// dan mereset transform ke NULL, jadi thumbnail selalu sama dengan hasil crop.
const parseTransform = (raw) => {
  const t = String(raw || '').split(',').map(Number);
  return { scale: t.length >= 3 && isFinite(t[0]) && t[0] > 0 ? t[0] : 1, x: isFinite(t[1]) ? t[1] : 0, y: isFinite(t[2]) ? t[2] : 0 };
};
const CROP_W = 360;
const CROP_H = 480;
const OUT_W = 1200;
const OUT_H = 1600;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const round2 = (v) => Math.round(v * 100) / 100;

function AdjModal({ photo, mediaUrl, onClose, onSave }) {
  const [image, setImage] = useState(null);
  const [status, setStatus] = useState('loading');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cropRef = useRef(null);
  const previewRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const [cropScale, setCropScale] = useState(1);
  const [previewScale, setPreviewScale] = useState(0.66);

  useEffect(() => {
    setStatus('loading');
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setError('');
    const img = new Image();
    img.onload = () => { setImage(img); setStatus('ready'); };
    img.onerror = () => setStatus('error');
    img.src = mediaUrl(photo.path);
    return () => { img.onload = null; img.onerror = null; };
  }, [photo.path, mediaUrl]);

  useEffect(() => {
    function measure() {
      if (cropRef.current) setCropScale(cropRef.current.clientWidth / CROP_W);
      if (previewRef.current) setPreviewScale(previewRef.current.clientWidth / CROP_W);
    }
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      if (cropRef.current) ro.observe(cropRef.current);
      if (previewRef.current) ro.observe(previewRef.current);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const rotDim = image && rotation % 180 !== 0
    ? { w: image.naturalHeight, h: image.naturalWidth }
    : { w: image?.naturalWidth || 1, h: image?.naturalHeight || 1 };
  const cover = image ? Math.max(CROP_W / rotDim.w, CROP_H / rotDim.h) : 1;
  const scale = cover * zoom;
  const dw = rotDim.w * scale;
  const dh = rotDim.h * scale;
  const maxPanX = Math.max(0, (dw - CROP_W) / 2);
  const maxPanY = Math.max(0, (dh - CROP_H) / 2);
  const panX = clamp(pan.x, -maxPanX, maxPanX);
  const panY = clamp(pan.y, -maxPanY, maxPanY);

  function zoomBy(factor) {
    const nextZoom = clamp(zoom * factor, 1, 4);
    const nextScale = cover * nextZoom;
    const cu = -panX / scale;
    const cv = -panY / scale;
    const nextMaxX = Math.max(0, (rotDim.w * nextScale - CROP_W) / 2);
    const nextMaxY = Math.max(0, (rotDim.h * nextScale - CROP_H) / 2);
    setZoom(round2(nextZoom));
    setPan({ x: clamp(-cu * nextScale, -nextMaxX, nextMaxX), y: clamp(-cv * nextScale, -nextMaxY, nextMaxY) });
  }

  function onWheel(e) {
    e.preventDefault();
    const el = cropRef.current;
    if (!el || !image) return;
    const rect = el.getBoundingClientRect();
    const k = rect.width / CROP_W;
    const lx = (e.clientX - rect.left) / k;
    const ly = (e.clientY - rect.top) / k;
    const nextZoom = clamp(zoom * (e.deltaY > 0 ? 1 / 1.12 : 1.12), 1, 4);
    const nextScale = cover * nextZoom;
    const cu = (lx - CROP_W / 2 - panX) / scale;
    const cv = (ly - CROP_H / 2 - panY) / scale;
    const nextMaxX = Math.max(0, (rotDim.w * nextScale - CROP_W) / 2);
    const nextMaxY = Math.max(0, (rotDim.h * nextScale - CROP_H) / 2);
    setZoom(round2(nextZoom));
    setPan({ x: clamp(lx - CROP_W / 2 - cu * nextScale, -nextMaxX, nextMaxX), y: clamp(ly - CROP_H / 2 - cv * nextScale, -nextMaxY, nextMaxY) });
  }
  useEffect(() => {
    const el = cropRef.current;
    if (!el) return;
    const handler = (e) => { e.preventDefault(); onWheel(e); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  });

  function onPointerDown(e) {
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    dragRef.current = { id: e.pointerId, clientX: e.clientX, clientY: e.clientY, panX, panY };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }
  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.id || !cropRef.current) return;
    const rect = cropRef.current.getBoundingClientRect();
    const k = rect.width / CROP_W;
    setPan({ x: clamp(d.panX + (e.clientX - d.clientX) / k, -maxPanX, maxPanX), y: clamp(d.panY + (e.clientY - d.clientY) / k, -maxPanY, maxPanY) });
  }
  function onPointerEnd(e) {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      const t = e.touches;
      pinchRef.current = {
        dist: Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY),
        midX: (t[0].clientX + t[1].clientX) / 2,
        midY: (t[0].clientY + t[1].clientY) / 2,
        zoom, panX, panY,
      };
      dragRef.current = null;
    } else if (e.touches.length === 1) {
      const t = e.touches[0];
      pinchRef.current = null;
      dragRef.current = { id: `touch-${t.identifier}`, clientX: t.clientX, clientY: t.clientY, panX, panY };
    }
  }
  function onTouchMove(e) {
    const el = cropRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const k = rect.width / CROP_W;
    if (e.touches.length === 2 && pinchRef.current) {
      const t = e.touches;
      const dist = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      if (dist > 0 && pinchRef.current.dist > 0) {
        const s = pinchRef.current;
        const nextZoom = clamp(s.zoom * (dist / s.dist), 1, 4);
        const nextScale = cover * nextZoom;
        const lx0 = (s.midX - rect.left) / k;
        const ly0 = (s.midY - rect.top) / k;
        const lx1 = ((t[0].clientX + t[1].clientX) / 2 - rect.left) / k;
        const ly1 = ((t[0].clientY + t[1].clientY) / 2 - rect.top) / k;
        const cu = (lx0 - CROP_W / 2 - s.panX) / (cover * s.zoom);
        const cv = (ly0 - CROP_H / 2 - s.panY) / (cover * s.zoom);
        const nextMaxX = Math.max(0, (rotDim.w * nextScale - CROP_W) / 2);
        const nextMaxY = Math.max(0, (rotDim.h * nextScale - CROP_H) / 2);
        const nx = clamp(lx1 - CROP_W / 2 - cu * nextScale, -nextMaxX, nextMaxX);
        const ny = clamp(ly1 - CROP_H / 2 - cv * nextScale, -nextMaxY, nextMaxY);
        setZoom(round2(nextZoom));
        setPan({ x: nx, y: ny });
        pinchRef.current = { ...s, dist, midX: (t[0].clientX + t[1].clientX) / 2, midY: (t[0].clientY + t[1].clientY) / 2, zoom: nextZoom, panX: nx, panY: ny };
      }
    } else if (e.touches.length === 1 && dragRef.current && String(dragRef.current.id).startsWith('touch')) {
      const t = e.touches[0];
      const d = dragRef.current;
      setPan({ x: clamp(d.panX + (t.clientX - d.clientX) / k, -maxPanX, maxPanX), y: clamp(d.panY + (t.clientY - d.clientY) / k, -maxPanY, maxPanY) });
    }
  }
  function onTouchEnd() { pinchRef.current = null; dragRef.current = null; }

  function reset() { setZoom(1); setPan({ x: 0, y: 0 }); setRotation(0); setFlipH(false); setFlipV(false); setError(''); }

  function computeSourceRect() {
    const corners = [[0, 0], [CROP_W, 0], [0, CROP_H], [CROP_W, CROP_H]];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [vx, vy] of corners) {
      let u = (vx - CROP_W / 2 - panX) / scale;
      let v = (vy - CROP_H / 2 - panY) / scale;
      if (flipH) u = -u;
      if (flipV) v = -v;
      let nx, ny;
      if (rotation === 90) { nx = v; ny = -u; }
      else if (rotation === 180) { nx = -u; ny = -v; }
      else if (rotation === 270) { nx = -v; ny = u; }
      else { nx = u; ny = v; }
      const ox = nx + image.naturalWidth / 2;
      const oy = ny + image.naturalHeight / 2;
      minX = Math.min(minX, ox); minY = Math.min(minY, oy);
      maxX = Math.max(maxX, ox); maxY = Math.max(maxY, oy);
    }
    const sx = clamp(minX, 0, image.naturalWidth);
    const sy = clamp(minY, 0, image.naturalHeight);
    const sw = clamp(maxX, 0, image.naturalWidth) - sx;
    const sh = clamp(maxY, 0, image.naturalHeight) - sy;
    return { sx, sy, sw, sh };
  }

  function drawCropInto(canvas) {
    if (!image || status !== 'ready') return;
    const { sx, sy, sw, sh } = computeSourceRect();
    if (sw <= 0 || sh <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(canvas.clientHeight * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (cropCanvasRef.current) drawCropInto(cropCanvasRef.current);
      if (previewCanvasRef.current) drawCropInto(previewCanvasRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [image, status, zoom, panX, panY, rotation, flipH, flipV, cropScale, previewScale]);

  async function handleSave() {
    if (!image || status !== 'ready') return;
    setSaving(true);
    setError('');
    try {
      const { sx, sy, sw, sh } = computeSourceRect();
      if (sw <= 0 || sh <= 0) throw new Error('Area crop tidak valid.');
      const canvas = document.createElement('canvas');
      canvas.width = OUT_W;
      canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Browser tidak mendukung pemrosesan gambar.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, OUT_W, OUT_H);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, OUT_W, OUT_H);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gagal membuat gambar hasil crop'))), 'image/jpeg', 0.9));
      const file = new File([blob], 'crop-1200x1600.jpg', { type: 'image/jpeg' });
      await onSave(file);
      onClose();
    } catch (err) {
      setError(err.message || 'Gagal menyimpan foto.');
    } finally {
      setSaving(false);
    }
  }

  const toolBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', fontSize: 12, fontWeight: 600, cursor: 'pointer' };
  const toolBtnActive = { ...toolBtn, background: ACCENT, borderColor: ACCENT, color: '#fff' };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .62)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 120, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Ubah Foto Produk" style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 920, maxHeight: '94vh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(15, 23, 42, .35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #eef1f5' }}>
          <div>
            <strong style={{ fontSize: 16, color: '#0f172a' }}>Ubah Foto Produk</strong>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>Geser untuk posisi · gulir / pinch untuk zoom · hasil 1200×1600 (3:4)</p>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Tutup" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: '#f1f5f9', fontSize: 16, lineHeight: 1, cursor: 'pointer', color: '#475569', display: 'grid', placeItems: 'center' }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 18, padding: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Kiri: area crop */}
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <div
              ref={cropRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerLeave={onPointerEnd}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              style={{ position: 'relative', width: '100%', maxWidth: 440, margin: '0 auto', aspectRatio: '3/4', overflow: 'hidden', borderRadius: 12, background: '#0f172a', border: '1px solid #e2e8f0', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
            >
              <canvas ref={cropCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
              {status === 'loading' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 13, background: '#0f172a' }}>Memuat foto…</div>}
              {status === 'error' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fca5a5', fontSize: 13, padding: 20, textAlign: 'center', background: '#0f172a' }}>Foto tidak dapat dimuat. Silakan pilih foto lain.</div>}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.32)' }} />
                <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, background: 'rgba(255,255,255,.32)' }} />
                <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,.32)' }} />
                <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,.32)' }} />
              </div>
              <div style={{ position: 'absolute', inset: 0, border: '2px solid rgba(255,255,255,.75)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.2)', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Kanan: preview realtime */}
          <div style={{ flex: '1 1 220px', minWidth: 0, display: 'grid', gap: 8, alignContent: 'start' }}>
            <strong style={{ fontSize: 12, color: '#334155', textTransform: 'uppercase', letterSpacing: '.05em' }}>Preview · 1200×1600</strong>
            <div ref={previewRef} style={{ position: 'relative', width: '100%', maxWidth: 180, margin: '0 auto', aspectRatio: '3/4', overflow: 'hidden', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(15,23,42,.12)' }}>
              <canvas ref={previewCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
            </div>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b', textAlign: 'center' }}>Hasil crop otomatis mengikuti preview. Tersimpan sebagai JPEG 1200×1600.</p>
          </div>
        </div>

        {/* Toolbar + aksi */}
        <div style={{ padding: '14px 20px 18px', borderTop: '1px solid #eef1f5', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => zoomBy(1 / 1.2)} style={toolBtn}><ZoomOut size={15} /> Perkecil</button>
            <span style={{ fontSize: 12, color: '#475569', minWidth: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{zoom.toFixed(2)}×</span>
            <button onClick={() => zoomBy(1.2)} style={toolBtn}><ZoomIn size={15} /> Perbesar</button>
            <span style={{ width: 1, height: 24, background: '#e2e8f0' }} />
            <button onClick={() => setRotation((r) => (r + 270) % 360)} style={toolBtn}><RotateCcw size={15} /> Putar Kiri</button>
            <button onClick={() => setRotation((r) => (r + 90) % 360)} style={toolBtn}><RotateCw size={15} /> Putar Kanan</button>
            <button onClick={() => setFlipH((v) => !v)} style={flipH ? toolBtnActive : toolBtn}><FlipHorizontal2 size={15} /> Horizontal</button>
            <button onClick={() => setFlipV((v) => !v)} style={flipV ? toolBtnActive : toolBtn}><FlipVertical2 size={15} /> Vertikal</button>
            <button onClick={reset} style={toolBtn}>Reset</button>
          </div>
          {error && <p style={{ margin: 0, color: '#b91c1c', fontSize: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} disabled={saving} style={{ minHeight: 44, padding: '0 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#1e293b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Tutup</button>
            <button onClick={handleSave} disabled={!image || saving || status !== 'ready'} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: 'none', background: ACCENT, color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: !image || status !== 'ready' ? .55 : 1 }}>{saving ? 'Menyimpan…' : 'Simpan Hasil Crop'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditProductPage() {
  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [tiers, setTiers] = useState([]);
  const [variants, setVariants] = useState([]);
  const [media, setMedia] = useState([]);
  const [mediaUploading, setMediaUploading] = useState(false);
  const params = useParams();
  const productId = params?.id;
  const headers = () => ({ 'Content-Type': 'application/json'});
  const mediaUrl = (path) => path ? `${apiUrl.replace('/api', '')}${path}` : '';
  const thumbStyle = (m) => {
    const t = parseTransform(m.transform);
    return t.scale !== 1 || t.x !== 0 || t.y !== 0 ? { objectFit: 'cover', objectPosition: 'center', transform: `translate(${t.x}%, ${t.y}%) scale(${t.scale})` } : { objectFit: 'contain', objectPosition: 'center' };
  };

  useEffect(() => {
    /* sesi via httpOnly cookie */
    Promise.all([fetch(`${apiUrl}/products/${productId}`, { headers: headers() }), fetch(`${apiUrl}/products/categories`, { headers: headers() })])
      .then(async ([itemResponse, categoriesResponse]) => {
        const itemBody = await itemResponse.json();
        const categoriesBody = await categoriesResponse.json();
        if (!itemResponse.ok) throw new Error(itemBody.message);
        if (!categoriesResponse.ok) throw new Error(categoriesBody.message);
        setProduct(itemBody.data);
        setCategories(categoriesBody.data || []);
        setTiers((itemBody.data.wholesale_prices || []).map((tier) => ({ min_qty: String(tier.min_qty), max_qty: tier.max_qty == null ? '' : String(tier.max_qty), price: String(tier.price) })));
        setVariants((itemBody.data.variants || []).map((variant) => ({ id: variant.id, color: variant.color || '', size: variant.size || '', sku: variant.sku || '', barcode: variant.barcode || '', price: variant.price == null ? '' : String(variant.price), stock: variant.stock, photo_path: variant.photo_path || '' })));
        setMedia(itemBody.data.media || []);
        setForm({ name: itemBody.data.name || '', category_id: String(itemBody.data.category_id), sku: itemBody.data.sku || '', barcode: itemBody.data.barcode || '', price: String(itemBody.data.price || ''), cost: String(itemBody.data.cost || ''), min_stock: String(itemBody.data.min_stock || 0), gender: itemBody.data.gender || 'unisex', description: itemBody.data.description || '' });
      })
      .catch((error) => setMessage(error.message || 'Produk tidak dapat dimuat'));
  }, [productId]);

  useEffect(() => {
    function onPaste(event) {
      if (mediaUploading) return;
      const files = [];
      const seen = new Set();
      const key = (f) => `${f.name}|${f.size}|${f.type}|${f.lastModified}`;
      for (const item of Array.from(event.clipboardData?.items || [])) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file && !seen.has(key(file))) {
            seen.add(key(file));
            files.push(file);
          }
        }
      }
      for (const f of Array.from(event.clipboardData?.files || [])) {
        if (f.type.startsWith('image/') && !seen.has(key(f))) {
          seen.add(key(f));
          files.push(f);
        }
      }
      if (!files.length) return;
      event.preventDefault();
      uploadMedia(files);
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  function choosePhoto(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setMessage('Pilih JPG, PNG, atau WebP.'); return; }
    setPhoto(file);
    setPreview(URL.createObjectURL(file));
    setMessage('');
  }
  function updateTier(index, key, value) { setTiers((current) => current.map((tier, itemIndex) => itemIndex === index ? { ...tier, [key]: value } : tier)); }
  function updateVariant(index, key, value) { setVariants((current) => current.map((variant, itemIndex) => itemIndex === index ? { ...variant, [key]: value } : variant)); }
  async function uploadMedia(files) {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const images = selected.filter((file) => file.type.startsWith('image/'));
    const videos = selected.filter((file) => file.type.startsWith('video/'));
    const imageCount = media.filter((item) => item.media_type === 'image').length;
    const videoCount = media.filter((item) => item.media_type === 'video').length;
    if (images.length + imageCount > 10 || videos.length + videoCount > 1) { setMessage('Produk maksimal memiliki 10 foto dan 1 video.'); return; }
    const invalid = selected.map((file) => validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])).find(Boolean);
    if (invalid) { setMessage(invalid); return; }
    setMediaUploading(true); setMessage('');
    try {
      for (const file of selected) await uploadMediaData(`${apiUrl}/products/${productId}/media-data`, file);
      const refreshed = await fetch(`${apiUrl}/products/${productId}`, { headers: headers() }).then((result) => result.json());
      setMedia(refreshed.data?.media || []);
      setMessage('Media produk berhasil diunggah.');
    } catch (error) { setMessage(error.message); } finally { setMediaUploading(false); }
  }
  async function uploadVariantPhoto(variantId, file) {
    if (!file) return;
    const invalid = validateDataUpload(file, ['image/jpeg', 'image/png', 'image/webp']);
    if (invalid) { setMessage(invalid); return; }
    try {
      const body = await uploadMediaData(`${apiUrl}/products/${productId}/variants/${variantId}/photo-data`, file);
      setVariants((current) => current.map((variant) => variant.id === variantId ? { ...variant, photo_path: body.data.path } : variant));
      setMessage('Foto varian berhasil diperbarui.');
    } catch (error) { setMessage(error.message); }
  }

  async function deleteMedia(mediaId) {
    if (!window.confirm('Hapus foto ini?')) return;
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/products/${productId}/media/${mediaId}`, { method: 'DELETE', headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Foto gagal dihapus');
      setMedia((current) => current.filter((item) => item.id !== mediaId));
      setMessage('Foto berhasil dihapus.');
    } catch (error) { setMessage(error.message); }
  }

  async function saveOrder(images) {
    try {
      await fetch(`${apiUrl}/products/${productId}/media/reorder`, { method: 'PATCH', headers: headers(), body: JSON.stringify({ order: images.map((item) => item.id) }) });
    } catch { /* urutan tetap tersimpan lokal; abaikan kegagalan kecil */ }
  }

  function moveImage(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    setMedia((current) => {
      const images = current.filter((item) => item.media_type === 'image');
      const others = current.filter((item) => item.media_type !== 'image');
      const reordered = [...images];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      saveOrder(reordered);
      return [...reordered, ...others];
    });
    setMessage('Urutan foto diperbarui. Foto pertama menjadi foto utama.');
  }

  const [dragFrom, setDragFrom] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [adjPhoto, setAdjPhoto] = useState(null);
  const [dropFilesOver, setDropFilesOver] = useState(false);

  function openAdj(m) {
    if (m.media_type !== 'image') return;
    setAdjPhoto({ mediaId: m.id, path: m.path });
  }
  async function saveCropped(file) {
    if (!adjPhoto) return;
    const dataUrl = await fileToDataUrl(file);
    const response = await fetch(`${apiUrl}/products/${productId}/media/${adjPhoto.mediaId}/image-data`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ filename: file.name || 'crop.jpg', content_type: file.type || 'image/jpeg', data_url: dataUrl }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || 'Gagal menyimpan foto.');
    setMedia((current) => current.map((m) => m.id === adjPhoto.mediaId ? { ...m, path: body.data.path, transform: null } : m));
    setMessage('Foto berhasil diperbarui.');
  }
  function onDragStart(index) { return (event) => { setDragFrom(index); event.dataTransfer.effectAllowed = 'move'; }; }
  function onDragEnd() { setDragFrom(null); setDropTarget(null); }
  function onDragOver(index) { return (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dropTarget !== index) setDropTarget(index); }; }
  function onDrop(toIndex) { return (event) => { event.preventDefault(); if (dragFrom != null) moveImage(dragFrom, toIndex); setDragFrom(null); setDropTarget(null); }; }
  function mediaDragOver(event) {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDropFilesOver(true);
    }
  }
  function mediaDragLeave(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setDropFilesOver(false);
  }
  function mediaDrop(event) {
    event.preventDefault();
    setDropFilesOver(false);
    if (mediaUploading) return;
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length) uploadMedia(files);
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/products/${productId}`, { method: 'PUT', headers: headers(), body: JSON.stringify({ ...form, category_id: Number(form.category_id), price: Number(form.price), cost: Number(form.cost || 0), min_stock: Number(form.min_stock), wholesale_prices: tiers, variants }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Produk gagal diperbarui');
      if (photo) {
        const upload = new FormData();
        upload.append('photo', photo);
        const uploadResponse = await fetch(`${apiUrl}/products/${productId}/photo`, { method: 'POST', headers: {}, body: upload });
        const uploadBody = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error(`Data produk diperbarui, tetapi foto gagal: ${uploadBody.message || 'coba lagi'}`);
        setProduct({ ...product, photo_path: uploadBody.data.path });
        setPhoto(null);
        setPreview('');
      }
      setMessage('Produk dan varian berhasil diperbarui.');
      window.location.href = '/products';
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  }

  const productImages = media.filter((item) => item.media_type === 'image');
  const productVideo = media.find((item) => item.media_type === 'video');

  return (
    <AppShell title="Edit Produk" eyebrow="KATALOG PRODUK" actions={<><a className="button-link" href={`/produk/${productId}`} target="_blank" rel="noopener noreferrer">Cek Detail Produk</a><a className="button-link secondary-link" href="/products">Kembali ke Daftar</a></>}>
      <section className="form-page">
        {!form ? <section className="panel"><p>Memuat data produk…</p>{message && <p className="message">{message}</p>}</section> : (
          <form className="panel product-form" onSubmit={submit}>
            <div><h2>{product.name}</h2><p className="muted">Stok saat ini {product.stock}. Ubah stok melalui menu inventori agar mutasi tercatat.</p></div>
            <section className="media-manager"><div className="section-heading"><div><h3>Media produk</h3><p>Isi hingga 10 foto dan 1 video, seret & lepas dari Finder/Explorer, atau tempel gambar (Ctrl/Cmd+V). Kotak pertama akan menjadi foto utama katalog.</p></div><span className="media-counter">{productImages.length}/10 foto · {productVideo ? '1/1 video' : '0/1 video'}</span></div>            <div className={`media-grid${dropFilesOver ? ' drop-files-over' : ''}`} onDragOver={mediaDragOver} onDragLeave={mediaDragLeave} onDrop={mediaDrop}>{dropFilesOver && <div className="media-drop-hint">Lepaskan foto/video di sini</div>}{Array.from({ length: 10 }, (_, index) => { const item = productImages[index]; return item ? <figure key={item.id} draggable onDragStart={onDragStart(index)} onDragEnd={onDragEnd} onDragOver={onDragOver(index)} onDrop={onDrop(index)} className={`media-draggable${dragFrom === index ? ' is-dragging' : ''}${dropTarget === index && dragFrom !== index ? ' drop-target' : ''}`}>          <img src={mediaUrl(item.path)} alt={`Foto ${index + 1} ${product.name}`} style={{ width: '100%', height: '100%', ...thumbStyle(item) }} /><span className="media-drag-handle" aria-hidden="true"><GripVertical size={14} /></span><button type="button" className="media-delete" aria-label={`Hapus foto ${index + 1}`} onClick={() => deleteMedia(item.id)}><X aria-hidden="true" size={14} /></button><button type="button" onClick={() => openAdj(item)} style={{ position: 'absolute', left: 4, bottom: 4, padding: '2px 6px', borderRadius: 4, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 9, cursor: 'pointer' }}>Atur</button><figcaption>{index === 0 ? 'Foto utama' : `Foto ${index + 1}`}</figcaption></figure> : <label className="media-slot" key={`slot-${index}`}><ImagePlus aria-hidden="true" size={18} /><span>Foto {index + 1}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={mediaUploading} onChange={(event) => uploadMedia(event.target.files)} /></label>; })}<label className="media-slot video-slot">{productVideo ? <video controls preload="metadata" src={mediaUrl(productVideo.path)} /> : <><Video aria-hidden="true" size={18} /><span>Video produk</span></>}<input type="file" accept="video/mp4,video/webm" disabled={mediaUploading || Boolean(productVideo)} onChange={(event) => uploadMedia(event.target.files)} /></label></div>{mediaUploading && <p className="muted">Mengunggah media…</p>}</section>
            <label>Nama produk<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>Kategori<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })} required><option value="">Pilih kategori</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <div className="two-fields"><label>SKU<input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></label><label>Barcode<input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></label></div>
            <div className="two-fields"><label>Harga jual<input type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label><label>Harga beli<input type="number" min="0" value={form.cost} onChange={(event) => setForm({ ...form, cost: event.target.value })} /></label></div>
            <div className="two-fields"><label>Stok minimum<input type="number" min="0" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} required /></label><label>Target pengguna<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="unisex">Unisex</option><option value="male">Pria</option><option value="female">Wanita</option><option value="kids">Anak</option></select></label></div>
            <label>Deskripsi<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={5} style={{ resize: 'vertical', minHeight: 100 }} /></label>
            <section className="variant-section">
              <div className="section-heading"><div><h3>Varian warna</h3><p>Warna dan harga khusus. Stok setiap warna dikelola melalui inventori.</p></div><button type="button" className="secondary small" onClick={() => setVariants((current) => [...current, emptyVariant()])}><Plus aria-hidden="true" size={14} /> Tambah warna</button></div>
              {variants.length > 0 && <div className="variant-list">{variants.map((variant, index) => <div className="variant-row" key={variant.id || index}><label>Warna<input value={variant.color} onChange={(event) => updateVariant(index, 'color', event.target.value)} placeholder="Contoh: Navy" required /></label><label>SKU varian<input value={variant.sku} onChange={(event) => updateVariant(index, 'sku', event.target.value)} placeholder="Opsional" /></label><label>Harga khusus<input type="number" min="0" value={variant.price} onChange={(event) => updateVariant(index, 'price', event.target.value)} placeholder="Harga produk" /></label><div className="variant-stock"><span>Stok</span><strong>{variant.stock ?? 0}</strong></div>{variant.id && <label className="variant-photo-upload">{variant.photo_path ? <img src={mediaUrl(variant.photo_path)} alt={`Foto varian ${variant.color}`} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} /> : 'Foto varian'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => uploadVariantPhoto(variant.id, event.target.files?.[0])} /></label>}<button className="remove-variant" type="button" onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Hapus varian ${index + 1}`}><X aria-hidden="true" size={16} /></button></div>)}</div>}
            </section>
            <section className="wholesale-section"><div className="section-heading"><div><h3>Harga grosir</h3><p>Atur harga berdasarkan jumlah pembelian.</p></div><button type="button" className="secondary small" onClick={() => setTiers((current) => [...current, { min_qty: '', max_qty: '', price: '' }])}>Tambah tingkat</button></div>{tiers.map((tier, index) => <div className="wholesale-row" key={index}><label>Min. qty<input type="number" min="1" value={tier.min_qty} onChange={(event) => updateTier(index, 'min_qty', event.target.value)} required /></label><label>Maks. qty<input type="number" min="1" value={tier.max_qty} onChange={(event) => updateTier(index, 'max_qty', event.target.value)} placeholder="Tanpa batas" /></label><label>Harga/unit<input type="number" min="0" value={tier.price} onChange={(event) => updateTier(index, 'price', event.target.value)} required /></label><button type="button" className="remove-tier" onClick={() => setTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Hapus</button></div>)}</section>
            <div className="form-actions"><button disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Perubahan'}</button><a href="/products">Batal</a></div>
            {message && <p className="message" role="status">{message}</p>}
          </form>
        )}
      </section>

      {adjPhoto && (
        <AdjModal photo={adjPhoto} mediaUrl={mediaUrl} onClose={() => setAdjPhoto(null)} onSave={saveCropped} />
      )}

    </AppShell>
  );
}
