'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { marketplaceLinks, showMarketplaceOnCards } from './lib/marketplace';
import FloatingWA from './components/FloatingWA';
import SafeImage from './components/SafeImage';

const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const T = { black: '#1a1a1a', blue: '#1e3a5f', white: '#ffffff', bg: '#fafafa', card: '#ffffff', muted: '#71717a', border: '#e5e7eb' };
const DEFAULT_MIN_ORDER_QTY = 4;

const I = {
  box: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>),
  truck: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 18V6a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h2" /><path d="M14 9h4l3 3v5a1 1 0 0 1-1 1h-1" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>),
  chat: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>),
  chevL: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m15 18-6-6 6-6" /></svg>),
  chevR: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="m9 18 6-6-6-6" /></svg>),
  search: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>),
  bag: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>),
  music: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>),
  cart: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>),
  plus: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>),
  minus: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14" /></svg>),
  close: (p) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 6 6 18M6 6l12 12" /></svg>),
};

function waLink(phone, text) {
  if (!phone) return '#';
  const clean = String(phone).replace(/[^0-9+]/g, '').replace(/^0/, '62');
  return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}
const fmtRp = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const SORTS = [{ value: 'newest', label: 'Terbaru' }, { value: 'price_asc', label: 'Harga Termurah' }, { value: 'price_desc', label: 'Harga Termahal' }, { value: 'name', label: 'Nama A-Z' }];

function parsePhotos(paths) {
  if (!paths) return [];
  return String(paths).split('||').filter(Boolean).map((p) => ({ path: p.trim() }));
}
function photoStyle(transform, base) {
  const t = String(transform || '').split(',').map(Number);
  return t.length === 3 && isFinite(t[0]) && (t[0] !== 1 || t[1] !== 0 || t[2] !== 0) ? { objectFit: 'cover', objectPosition: 'center', transform: `translate(${t[1] || 0}%, ${t[2] || 0}%) scale(${t[0]})`, ...base } : { objectFit: 'cover', objectPosition: 'center', ...base };
}

function ProductCard({ product, onWa, onAdd, inCart, marketplace }) {
  const photos = useMemo(() => {
    const seen = new Set();
    const list = parsePhotos(product.photo_paths).filter((p) => {
      if (seen.has(p.path)) return false;
      seen.add(p.path);
      return true;
    });
    return list.length ? list : (product.photo_path ? [{ path: product.photo_path }] : []);
  }, [product.photo_paths, product.photo_path]);
  // Hover: langsung ganti ke foto berikutnya, lalu lanjut tiap 1 detik selama mouse di kartu.
  const [photoIdx, setPhotoIdx] = useState(0);
  const photoTimer = useRef(null);
  function stopCycle() {
    if (photoTimer.current) { clearInterval(photoTimer.current); photoTimer.current = null; }
  }
  function onEnter() {
    if (photos.length <= 1) return;
    stopCycle();
    setPhotoIdx((i) => (i + 1) % photos.length);
    photoTimer.current = setInterval(() => setPhotoIdx((i) => (i + 1) % photos.length), 1000);
  }
  function onLeave() {
    stopCycle();
    setPhotoIdx(0);
  }
  useEffect(() => stopCycle, []);
  const photo = photos[photoIdx] || photos[0];
  const colors = (product.variant_colors || '').split('|').filter(Boolean).slice(0, 4);
  return (
    <article className="pcard" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <a href={`/produk/${product.id}`} className="pcard-img" onFocus={onEnter} onBlur={onLeave}>
        <SafeImage key={photo?.path || 'none'} src={photo ? `${api.replace('/api', '')}${photo.path}` : ''} alt={product.name} style={photoStyle(product.photo_transform, { width: '100%', height: '100%' })} />
        {!photos.length && <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: T.muted, fontSize: 'var(--fs-sm)', background: '#f3f4f6' }}>Tanpa foto</span>}
        {photos.length > 1 && (
          <span className="pcard-dots">
            {photos.map((p, i) => (
              <i key={p.path} className={`pcard-dot${i === photoIdx ? ' active' : ''}`} />
            ))}
          </span>
        )}
      </a>
      <button type="button" className={`pcard-add${inCart ? ' has' : ''}`} onClick={() => onAdd(product)} aria-label="Tambah ke keranjang" title="Tambah ke keranjang">
        <I.cart style={{ width: 15, height: 15 }} />
        Tambah
        {inCart > 0 && <span className="pcard-add-badge">{inCart}</span>}
      </button>
      <div className="pcard-body">
        <a href={`/produk/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}><strong>{product.name}</strong></a>
        <span className="pcard-price">Rp{Number(product.price || 0).toLocaleString('id-ID')}</span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {colors.map((c) => <span key={c} className="pcard-color">{c}</span>)}
        </div>
        {(marketplace?.shopee || marketplace?.tiktok) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {marketplace.shopee && (
              <a
                href={marketplace.shopee}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title="Cari produk ini di toko Shopee kami"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: '#ee4d2d', color: '#fff', fontSize: 'var(--fs-2xs)', fontWeight: 700, textDecoration: 'none' }}
              >
                <I.bag style={{ width: 11, height: 11 }} /> Shopee
              </a>
            )}
            {marketplace.tiktok && (
              <a
                href={marketplace.tiktok}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title="Buka toko TikTok kami"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: '#111827', color: '#fff', fontSize: 'var(--fs-2xs)', fontWeight: 700, textDecoration: 'none' }}
              >
                <I.music style={{ width: 11, height: 11 }} /> TikTok
              </a>
            )}
          </div>
        )}
        <div className="pcard-actions">
          <a href={`/produk/${product.id}`} className="pcard-btn primary">Lihat Detail</a>
          <button type="button" onClick={() => onWa(`Saya tertarik dengan ${product.name}`)} className="pcard-btn secondary">Chat</button>
        </div>
      </div>
    </article>
  );
}

export default function LandingPage({ branchMatch = '', branchSlug = '', wholesaleCopy = true, basePath = '/', orderMode = 'whatsapp', resellerHref = 'https://reseller.anyostore.my.id' } = {}) {
  // Landing utama tetap memakai alur WhatsApp saja. Landing reseller
  // (orderMode="reseller") menambahkan akun pembeli, info pembayaran QRIS/
  // rekening, dan tombol "Kirim Pesanan ke Sistem".
  const isResellerOrder = orderMode === 'reseller';
  // Beberapa teks memakai kata "grosir" untuk landing utama; landing reseller
  // mematikannya lewat prop wholesaleCopy={false}.
  const supplierLine = wholesaleCopy ? 'Grosir langsung dari supplier' : 'Langsung dari supplier';
  // Landing cabang: cari id cabang berdasarkan potongan nama (mis. "Blok B").
  const [branchId, setBranchId] = useState(null);
  const [branchReady, setBranchReady] = useState(!branchMatch && !branchSlug);
  const branchQuery = branchId ? `branch_id=${branchId}` : '';
  useEffect(() => {
    if (!branchMatch && !branchSlug) return;
    const url = branchSlug
      ? `${api}/public/branches?slug=${encodeURIComponent(branchSlug)}`
      : `${api}/public/branches`;
    fetch(url)
      .then((response) => response.json())
      .then((body) => {
        const list = Array.isArray(body.data) ? body.data : [];
        if (branchSlug) {
          setBranchId(list[0]?.id ?? null);
          return;
        }
        const needle = branchMatch.toUpperCase();
        // Prioritas nama cabang, baru alamat (alamat BASIK juga memuat "Blok B").
        const byName = (item) => String(item.name || '').toUpperCase().includes(needle);
        const match = list.find(byName) || list.find((item) => String(item.address || '').toUpperCase().includes(needle));
        setBranchId(match ? match.id : null);
      })
      .catch(() => setBranchId(null))
      .finally(() => setBranchReady(true));
  }, [branchMatch, branchSlug]);

  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [waPicker, setWaPicker] = useState(false);
  const [waMsg, setWaMsg] = useState('');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartStep, setCartStep] = useState('cart');
  const [orderChecking, setOrderChecking] = useState(false);
  // Ongkir (tarif per kota) + voucher + data pembeli untuk pesanan.
  const [shippingRates, setShippingRates] = useState([]);
  // Ongkir otomatis (RajaOngkir/Komerce) untuk cabang dengan integrasi aktif.
  const [destinationQuery, setDestinationQuery] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [destination, setDestination] = useState(null);
  const [shippingOptions, setShippingOptions] = useState([]);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingNotice, setShippingNotice] = useState('');
  const [shippingArea, setShippingArea] = useState('');
  const [buyer, setBuyer] = useState({ name: '', phone: '', address: '', note: '' });
  const [voucherCode, setVoucherCode] = useState('');
  const [voucher, setVoucher] = useState(null);
  const [voucherMessage, setVoucherMessage] = useState('');
  const [voucherChecking, setVoucherChecking] = useState(false);
  // Pesanan langsung ke sistem (khusus landing reseller).
  const [paymentInfo, setPaymentInfo] = useState(null);
  const [systemBusy, setSystemBusy] = useState(false);
  const [systemNotice, setSystemNotice] = useState('');
  const [orderResult, setOrderResult] = useState(null);
  const [buyerAccount, setBuyerAccount] = useState(null);
  const clientOrderId = useRef(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}`);
  const [picker, setPicker] = useState(null);
  const pickerRequest = useRef(0);
  const [pickVariantId, setPickVariantId] = useState(null);
  const [pickQty, setPickQty] = useState(1);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [stockNotice, setStockNotice] = useState('');
  const stockNoticeTimer = useRef(null);
  const waPhone = settings?.whatsapp || settings?.store_phone || '';
  const waPhones = settings?.whatsapp_numbers?.length ? settings.whatsapp_numbers : waPhone ? [waPhone] : [];
  function pickWa(msg) { if (!waPhones.length) return; setWaMsg(msg); setWaPicker(true); }

  useEffect(() => { try { const raw = localStorage.getItem('landing_cart'); if (raw) setCart(JSON.parse(raw)); } catch { setCart([]); } }, []);
  useEffect(() => { try { localStorage.setItem('landing_cart', JSON.stringify(cart)); } catch { /* storage may be unavailable in private browsing */ } }, [cart]);
  function countInCart(productId) { return cart.filter((i) => Number(i.productId) === Number(productId)).reduce((s, i) => s + Number(i.qty || 0), 0); }
  const cartPcs = cart.reduce((s, i) => s + Number(i.qty || 0), 0);
  // Minimal pembelian per model mengikuti pengaturan cabang (0/1 = tanpa minimum).
  // Landing reseller TIDAK memakai aturan minimum (berlaku hanya untuk landing utama).
  const minOrderQty = (() => {
    if (isResellerOrder) return 1;
    const configured = Number(settings?.min_order_qty);
    if (!Number.isFinite(configured) || configured < 0) return DEFAULT_MIN_ORDER_QTY;
    return configured === 0 ? 1 : configured;
  })();
  const hasMinimumOrder = minOrderQty > 1;
  const cartTotal = cart.reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0);
  const cartWeightGram = cart.reduce((total, item) => total + Number(item.weightGram || 0) * Number(item.qty || 0), 0);
  const usesCourierApi = settings?.ongkir_provider === 'rajaongkir';
  const selectedRate = shippingRates.find((rate) => rate.area === shippingArea) || null;
  const manualShippingCost = selectedRate
    ? (Number(selectedRate.cost_per_kg) > 0
        ? Math.ceil(Math.max(cartWeightGram, 1) / 1000) * Number(selectedRate.cost_per_kg)
        : Number(selectedRate.cost || 0))
    : 0;
  const shippingCost = usesCourierApi ? Number(selectedShipping?.cost || 0) : manualShippingCost;
  const shippingLabel = usesCourierApi
    ? (selectedShipping ? `${selectedShipping.courier_name} ${selectedShipping.service}${selectedShipping.etd ? ` · ${selectedShipping.etd}` : ''}` : '')
    : shippingArea;
  const voucherDiscount = voucher ? Math.min(Number(voucher.discount || 0), cartTotal) : 0;
  const grandTotal = Math.max(0, cartTotal - voucherDiscount) + shippingCost;
  const buyerReady = buyer.name.trim() && buyer.phone.trim() && buyer.address.trim();
  const pickerSelected = picker ? picker.variants.find((v) => v.id === pickVariantId) || null : null;
  const pickerPhoto = pickerSelected?.photo_path || picker?.product?.photo_path || null;
  const modelStockRemaining = picker ? Math.max(0, Number(picker.product.available_stock || 0) - countInCart(picker.product.id)) : 0;
  const selectedVariantQty = pickerSelected ? cart.filter((item) => item.key === `${picker.product.id}-${pickerSelected.id}`).reduce((sum, item) => sum + item.qty, 0) : 0;
  const pickerStockRemaining = pickerSelected
    ? Math.max(0, Number(pickerSelected.available_stock || 0) - selectedVariantQty)
    : modelStockRemaining;
  const pickMax = Math.min(modelStockRemaining, pickerStockRemaining);
  const modelTotals = cart.reduce((m, i) => { const id = Number(i.productId); m[id] = (m[id] || 0) + Number(i.qty || 0); return m; }, {});
  const cartWarnings = Object.entries(modelTotals)
    .map(([pid, qty]) => {
      const item = cart.find((i) => Number(i.productId) === Number(pid));
      return { name: item?.name || 'Produk', qty, available: item?.modelAvailableStock };
    })
    .filter((w) => w.qty < minOrderQty || (w.available != null && w.qty > Number(w.available)));
  const hasMinimumWarning = cartWarnings.some((warning) => warning.qty < minOrderQty);

  function showStockNotice(message) {
    setStockNotice(message);
    if (stockNoticeTimer.current) clearTimeout(stockNoticeTimer.current);
    stockNoticeTimer.current = setTimeout(() => setStockNotice(''), 3600);
  }

  useEffect(() => () => { if (stockNoticeTimer.current) clearTimeout(stockNoticeTimer.current); }, []);

  function closePicker() {
    pickerRequest.current += 1;
    setPickerLoading(false);
    setPicker(null);
  }

  function openPicker(product) {
    const requestId = ++pickerRequest.current;
    setPickVariantId(null);
    setPickerLoading(true);
    setPicker({ product, variants: [] });
    fetch(`${api}/public/products/${product.id}${branchQuery ? `?${branchQuery}` : ''}`)
      .then(async (response) => {
        const body = await response.json();
        if (requestId !== pickerRequest.current) return;
        if (!response.ok || !body.data) throw new Error('Gagal memuat stok produk');
        const currentProduct = { ...product, ...body.data };
        const available = Number(currentProduct.available_stock || 0);
        const alreadyInCart = countInCart(product.id);
        if (available < minOrderQty) {
          setPicker(null);
          showStockNotice(`Stok ${product.name} hanya ${available} pcs. Minimum pembelian ${minOrderQty} pcs per model.`);
          return;
        }
        if (alreadyInCart >= available) {
          setPicker(null);
          showStockNotice(`Stok ${product.name} sudah habis untuk jumlah di keranjang.`);
          return;
        }

        const variants = (currentProduct.variants || []).filter((variant) => variant.is_active !== false);
        if (Number(product.variant_count) > 0 && variants.length === 0) throw new Error('Varian produk tidak tersedia');
        const firstAvailable = variants.find((variant) => Number(variant.available_stock || 0) > 0) || null;
        if (variants.length > 0 && !firstAvailable) {
          setPicker(null);
          showStockNotice(`Stok varian ${product.name} tidak tersedia.`);
          return;
        }

        setPicker((current) => current?.product.id === product.id ? { product: currentProduct, variants } : current);
        setPickVariantId(firstAvailable?.id ?? null);
        const inVariant = firstAvailable
          ? cart.filter((item) => item.key === `${product.id}-${firstAvailable.id}`).reduce((sum, item) => sum + item.qty, 0)
          : 0;
        const remaining = Math.min(minOrderQty - alreadyInCart, available - alreadyInCart, Number(firstAvailable?.available_stock ?? available) - inVariant);
        setPickQty(Math.max(1, remaining));
      })
      .catch(() => {
        if (requestId !== pickerRequest.current) return;
        setPicker((current) => current?.product.id === product.id ? null : current);
        showStockNotice(`Stok ${product.name} gagal diperiksa. Coba lagi.`);
      })
      .finally(() => { if (requestId === pickerRequest.current) setPickerLoading(false); });
  }

  function addFromPicker() {
    if (!picker) return;
    const selected = picker.variants.find((v) => v.id === pickVariantId) || null;
    const key = `${picker.product.id}-${selected?.id || 0}`;
    const variantLabel = selected ? [selected.color, selected.size].filter(Boolean).join(' · ') : '';
    const price = Number(selected?.price > 0 ? selected.price : picker.product.price ?? 0);
    const photo = selected?.photo_path || picker.product.photo_path || null;
    const qty = Math.max(1, pickQty);
    const modelAvailableStock = Number(picker.product.available_stock || 0);
    const variantAvailableStock = selected ? Number(selected.available_stock || 0) : modelAvailableStock;
    const alreadyInModel = countInCart(picker.product.id);
    const alreadyInVariant = cart.filter((item) => item.key === key).reduce((sum, item) => sum + item.qty, 0);
    if (qty > modelAvailableStock - alreadyInModel || qty > variantAvailableStock - alreadyInVariant) {
      showStockNotice(`Stok ${picker.product.name} tidak cukup untuk jumlah yang dipilih.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) return prev.map((i) => (i.key === key ? { ...i, qty: i.qty + qty, variantId: selected?.id || null, availableStock: variantAvailableStock, modelAvailableStock } : i));
      return [...prev, { key, productId: picker.product.id, variantId: selected?.id || null, name: picker.product.name, sku: picker.product.sku, variantLabel, price, qty, photo, weightGram: Number(picker.product.weight_gram || 0), availableStock: variantAvailableStock, modelAvailableStock }];
    });
    closePicker();
    setCartStep('cart');
    setCartOpen(true);
  }

  function setItemQty(key, qty) {
    const item = cart.find((current) => current.key === key);
    if (!item) return;
    const modelTotal = cart.filter((current) => Number(current.productId) === Number(item.productId)).reduce((sum, current) => sum + Number(current.qty || 0), 0);
    const others = modelTotal - item.qty;
    const minQty = Math.max(1, minOrderQty - others);
    const maxQty = Math.min(
      item.availableStock == null ? Number.POSITIVE_INFINITY : Number(item.availableStock) - cart.filter((current) => current.key === key).reduce((sum, current) => sum + current.qty, 0) + item.qty,
      item.modelAvailableStock == null ? Number.POSITIVE_INFINITY : Number(item.modelAvailableStock) - others,
    );
    if (maxQty < minQty) {
      showStockNotice(`Stok ${item.name} tidak cukup untuk minimum ${minOrderQty} pcs per model.`);
      return;
    }
    const requested = Math.max(minQty, Number(qty) || minQty);
    if (requested > maxQty) showStockNotice(`Stok ${item.name} tidak cukup untuk jumlah yang dipilih.`);
    const nextQty = Math.min(requested, maxQty);
    setCart((prev) => prev.map((i) => {
      if (i.key !== key) return i;
      return { ...i, qty: nextQty };
    }));
  }
  function removeItem(key) { setCart((prev) => prev.filter((i) => i.key !== key)); }
  function clearCart() { setCart([]); }

  // Voucher per pcs bergantung pada jumlah barang: hitung ulang saat keranjang berubah.
  useEffect(() => {
    if (!voucher || !branchId) return undefined;
    const timer = setTimeout(() => {
      fetch(`${api}/public/voucher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId, code: voucher.code, subtotal: cartTotal, pcs: cartPcs }),
      })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.message || 'Voucher tidak berlaku');
          setVoucher(body.data);
          setVoucherMessage(`Voucher ${body.data.code} dipakai (-${fmtRp(body.data.discount)}).`);
        })
        .catch((error) => {
          setVoucher(null);
          setVoucherMessage(error.message);
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [cartTotal, cartPcs]);

  async function applyVoucher() {
    const code = voucherCode.trim();
    if (!code || !branchId) return;
    setVoucherChecking(true);
    setVoucherMessage('');
    try {
      const response = await fetch(`${api}/public/voucher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_id: branchId, code, subtotal: cartTotal, pcs: cartPcs }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Voucher tidak berlaku');
      setVoucher(body.data);
      setVoucherMessage(`Voucher ${body.data.code} dipakai (-${fmtRp(body.data.discount)}).`);
    } catch (error) {
      setVoucher(null);
      setVoucherMessage(error.message);
    } finally {
      setVoucherChecking(false);
    }
  }

  // Cari kecamatan tujuan (RajaOngkir) dengan jeda ketik.
  useEffect(() => {
    if (!usesCourierApi || !branchId) return undefined;
    const query = destinationQuery.trim();
    if (query.length < 3) {
      setDestinations([]);
      return undefined;
    }
    const timer = setTimeout(() => {
      fetch(`${api}/public/shipping/destinations?branch_id=${branchId}&q=${encodeURIComponent(query)}`)
        .then((response) => response.json())
        .then((body) => setDestinations(Array.isArray(body.data) ? body.data : []))
        .catch(() => setDestinations([]));
    }, 350);
    return () => clearTimeout(timer);
  }, [destinationQuery, usesCourierApi, branchId]);

  // Hitung tarif ekspedisi saat tujuan/berat keranjang berubah.
  useEffect(() => {
    if (!usesCourierApi || !branchId || !destination?.id) {
      setShippingOptions([]);
      setSelectedShipping(null);
      return;
    }
    let cancelled = false;
    setShippingLoading(true);
    setShippingNotice('');
    fetch(`${api}/public/shipping/cost`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_id: branchId, destination: String(destination.id), weight: Math.max(cartWeightGram, 300) }),
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Gagal menghitung ongkir');
        if (cancelled) return;
        const options = Array.isArray(body.data?.options) ? body.data.options : [];
        setShippingOptions(options);
        setSelectedShipping(options[0] || null);
        if (!options.length) setShippingNotice('Tidak ada layanan pengiriman untuk tujuan ini.');
      })
      .catch((error) => {
        if (cancelled) return;
        setShippingOptions([]);
        setSelectedShipping(null);
        setShippingNotice(error.message);
      })
      .finally(() => { if (!cancelled) setShippingLoading(false); });
    return () => { cancelled = true; };
  }, [destination, cartWeightGram, usesCourierApi, branchId]);

  function buildOrderMsg() {
    const groups = {};
    for (const it of cart) {
      if (!groups[it.productId]) groups[it.productId] = { name: it.name, items: [] };
      groups[it.productId].items.push(it);
    }
    const lines = Object.values(groups).map((g, gi) => {
      const detail = g.items.map((it) => `    ${it.variantLabel ? `${it.variantLabel}: ` : ''}${it.qty} pcs × ${fmtRp(it.price)} = ${fmtRp(it.qty * it.price)}`).join('\n');
      return `${gi + 1}. ${g.name}\n${detail}`;
    });
    const buyerBlock = [
      buyer.name.trim() ? `Nama: ${buyer.name.trim()}` : null,
      buyer.phone.trim() ? `No HP: ${buyer.phone.trim()}` : null,
      (usesCourierApi ? destination?.label : shippingArea) ? `Tujuan: ${usesCourierApi ? destination?.label : shippingArea}` : null,
      buyer.address.trim() ? `Alamat: ${buyer.address.trim()}` : null,
      buyer.note.trim() ? `Catatan: ${buyer.note.trim()}` : null,
    ].filter(Boolean).join('\n');
    const costBlock = [
      `Subtotal: ${fmtRp(cartTotal)}`,
      voucher ? `Voucher ${voucher.code}: -${fmtRp(voucherDiscount)}` : null,
      (shippingArea || selectedShipping) ? `Ongkir${shippingLabel ? ` (${shippingLabel})` : ''}: ${fmtRp(shippingCost)}` : null,
      `Total: ${fmtRp(grandTotal)}`,
    ].filter(Boolean).join('\n');
    return `Halo Anyostore, saya mau order${wholesaleCopy ? ' grosir' : ''}:\n\n${lines.join('\n')}\n\n${buyerBlock ? `${buyerBlock}\n\n` : ''}${costBlock}\n${cartPcs} pcs${hasMinimumOrder ? ` · min. pembelian ${minOrderQty} pcs per model` : ''}\n\nSilahkan Transfer ke Rekening Berikut:\n\n[ ] BCA          : 0042813603\n[ ] MANDIRI  : 1640000929465\n\na.n. Miftahul Fauzan\n\nJika sudah transfer Mohon Konfirmasinya ya ka`;
  }
  async function sendOrder() {
    if (!cart.length || hasMinimumWarning || orderChecking) return;
    setOrderChecking(true);
    try {
      const productIds = [...new Set(cart.map((item) => Number(item.productId)))];
      const checkedProducts = await Promise.all(productIds.map(async (productId) => {
        const response = await fetch(`${api}/public/products/${productId}${branchQuery ? `?${branchQuery}` : ''}`);
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error('Stok produk gagal diperiksa');
        return [productId, body.data];
      }));
      const productsById = new Map(checkedProducts);
      const quantitiesByModel = cart.reduce((totals, item) => {
        const productId = Number(item.productId);
        totals[productId] = (totals[productId] || 0) + Number(item.qty || 0);
        return totals;
      }, {});

      for (const [productId, qty] of Object.entries(quantitiesByModel)) {
        const product = productsById.get(Number(productId));
        const available = Number(product.available_stock || 0);
        if (qty < minOrderQty) {
          showStockNotice(`${product.name}: minimum pembelian ${minOrderQty} pcs per model.`);
          return;
        }
        if (qty > available) {
          showStockNotice(`Stok ${product.name} tersisa ${available} pcs, sedangkan keranjang berisi ${qty} pcs.`);
          return;
        }
      }

      const refreshedCart = [];
      for (const item of cart) {
        const product = productsById.get(Number(item.productId));
        const encodedVariantId = Number(String(item.key).split('-').pop()) || null;
        const variantId = Number(item.variantId) || encodedVariantId;
        const variant = variantId ? (product.variants || []).find((candidate) => Number(candidate.id) === variantId) : null;
        if (variantId && !variant) {
          showStockNotice(`Varian ${item.variantLabel || item.name} sudah tidak tersedia. Perbarui keranjang.`);
          return;
        }
        const availableStock = Number(variant?.available_stock ?? product.available_stock ?? 0);
        if (Number(item.qty) > availableStock) {
          showStockNotice(`Stok ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''} tersisa ${availableStock} pcs.`);
          return;
        }
        refreshedCart.push({ ...item, variantId, availableStock, weightGram: Number(product.weight_gram ?? item.weightGram ?? 0), modelAvailableStock: Number(product.available_stock || 0) });
      }

      setCart(refreshedCart);
      setCartOpen(false);
      pickWa(buildOrderMsg());
    } catch {
      showStockNotice('Stok gagal diperiksa. Coba lagi sebelum mengirim pesanan.');
    } finally {
      setOrderChecking(false);
    }
  }

  async function sendOrderToSystem() {
    if (!isResellerOrder || !cart.length || systemBusy) return;
    setSystemBusy(true);
    setSystemNotice('');
    try {
      const response = await fetch(`${api}/reseller/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...(branchId ? { branch_id: branchId } : {}),
          buyer: {
            name: buyer.name,
            phone: buyer.phone,
            address: buyer.address,
            note: buyer.note,
          },
          items: cart.map((item) => ({
            product_id: Number(item.productId),
            variant_id: item.variantId ? Number(item.variantId) : null,
            quantity: Number(item.qty),
          })),
          ...(usesCourierApi ? { shipping_cost: shippingCost } : { shipping_area: shippingArea }),
          ...(voucher ? { voucher_code: voucher.code } : {}),
          client_order_id: clientOrderId.current,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Pesanan gagal dikirim');
      setOrderResult(body.data);
      setCart([]);
      setCartStep('cart');
      setCartOpen(false);
      clientOrderId.current = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}`;
    } catch (error) {
      setSystemNotice(error.message);
    } finally {
      setSystemBusy(false);
    }
  }

  const [today, setToday] = useState('');
  useEffect(() => { setToday(`${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`); }, []);
  useEffect(() => {
    if (!branchReady) return;
    const settingsUrl = `${api}/public/settings${branchQuery ? `?${branchQuery}` : ''}`;
    Promise.all([
      fetch(settingsUrl).then((r) => r.json()).then((b) => b.data).catch(() => null),
      fetch(`${api}/public/categories`).then((r) => r.json()).then((b) => b.data || []).catch(() => []),
    ]).then(([s, c]) => { setSettings(s); setCategories(c); });
  }, [branchReady, branchQuery]);
  useEffect(() => {
    if (!branchReady || !branchId) return;
    fetch(`${api}/public/shipping-rates?branch_id=${branchId}`)
      .then((response) => response.json())
      .then((body) => setShippingRates(Array.isArray(body.data) ? body.data : []))
      .catch(() => setShippingRates([]));
  }, [branchReady, branchId]);

  // Info pembayaran (QRIS statis + rekening) dan sesi pembeli hanya untuk
  // landing reseller.
  useEffect(() => {
    if (!isResellerOrder) return;
    const qs = branchId ? `?branch_id=${branchId}` : '';
    fetch(`${api}/reseller/payment-info${qs}`, { credentials: 'include' })
      .then((response) => response.json())
      .then((body) => setPaymentInfo(body.data || null))
      .catch(() => setPaymentInfo(null));
    fetch(`${api}/reseller/me`, { credentials: 'include' })
      .then((response) => response.json())
      .then((body) => setBuyerAccount(body.data || null))
      .catch(() => setBuyerAccount(null));
  }, [branchId, isResellerOrder]);

  useEffect(() => {
    if (!buyerAccount) return;
    const primary = (buyerAccount.addresses || []).find((row) => row.is_default) || (buyerAccount.addresses || [])[0];
    setBuyer((prev) => ({
      ...prev,
      name: prev.name || buyerAccount.name || '',
      phone: prev.phone || buyerAccount.phone || '',
      address: prev.address || primary?.address || '',
    }));
  }, [buyerAccount]);

  useEffect(() => { if (!branchReady) return; setLoading(true); const pageSize = [12, 24, 48].includes(Number(settings?.landing_page_size)) ? Number(settings.landing_page_size) : 24; const qs = new URLSearchParams({ limit: String(pageSize), page: String(page), ...(cat ? { category_id: cat } : {}), ...(q ? { search: q } : {}), ...(sort ? { sort } : {}), ...(branchId ? { branch_id: String(branchId) } : {}) }).toString(); fetch(`${api}/public/products?${qs}`).then((r) => r.json()).then((b) => { setProducts(b.data || []); setTotalPages(b.totalPages || 1); setTotal(b.total || 0); }).catch(() => setProducts([])).finally(() => setLoading(false)); }, [cat, q, sort, page, settings?.landing_page_size, branchReady, branchId]);
  const pages = useMemo(() => { const tp = totalPages; let s = Math.max(1, page - 2); let e = Math.min(tp, s + 4); s = Math.max(1, e - 4); const o = []; for (let i = s; i <= e; i++) o.push(i); return o; }, [page, totalPages]);
  return (
    <div id="main-content" style={{ background: T.bg, color: T.black, minHeight: '100vh', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}>
      {stockNotice && <div role="status" aria-live="polite" style={{ position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 160, width: 'min(520px, calc(100% - 32px))', padding: '12px 16px', borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 14, fontWeight: 700, boxShadow: '0 8px 24px rgba(15,23,42,.16)' }}>{stockNotice}</div>}
      <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>{wholesaleCopy ? 'Anyostore - Grosir Pakaian Denim Wanita' : 'Anyostore - Pakaian Denim Wanita'}</h1>
      {/* 1. Top bar */}
      <div style={{ background: T.black, color: '#fff', textAlign: 'center', padding: '6px 16px', fontSize: 'var(--fs-xs)', fontWeight: 500, letterSpacing: '.04em' }}>
        {hasMinimumOrder ? `Minimal ${minOrderQty} pcs per model · ${supplierLine}` : `Tanpa minimum order · ${supplierLine}`}
      </div>

      {/* 2. Header */}
      <header className="site-header" style={{ position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href={basePath} aria-label={wholesaleCopy ? 'Landing grosir' : 'Landing reseller'} style={{ fontSize: 18, fontWeight: 800, color: T.black, textDecoration: 'none', letterSpacing: '-.02em' }}>ANYOSTORE</a>
          <nav style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <a href="#produk" style={{ fontSize: 'var(--fs-md)', fontWeight: 500, color: T.muted, textDecoration: 'none', padding: '8px 12px', borderRadius: 6, transition: 'color .2s' }} onMouseOver={(e) => e.target.style.color = T.black} onMouseOut={(e) => e.target.style.color = T.muted}>Produk</a>
            {isResellerOrder && (
              <a href={buyerAccount ? '/akun' : '/masuk'} style={{ fontSize: 'var(--fs-md)', fontWeight: 500, color: T.muted, textDecoration: 'none', padding: '8px 12px', borderRadius: 6 }}>{buyerAccount ? 'Akun Saya' : 'Masuk'}</a>
            )}
            {isResellerOrder && (
              <a href="/lacak" style={{ fontSize: 'var(--fs-md)', fontWeight: 500, color: T.muted, textDecoration: 'none', padding: '8px 12px', borderRadius: 6 }}>Lacak</a>
            )}
            <button type="button" onClick={() => pickWa('')} style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: '#fff', background: T.blue, padding: '9px 18px', borderRadius: 6, textDecoration: 'none', transition: 'all .2s', boxShadow: '0 2px 8px rgba(30,58,95,.25)' }} className="hero-btn">Hubungi Admin</button>
          </nav>
        </div>
      </header>

      {/* 4. Feature strip */}
      <div className="feature-strip">
        <div className="feature-item">
          <span className="feature-icon"><I.box style={{ width: 20, height: 20 }} /></span>
          <span><strong>{hasMinimumOrder ? `Min ${minOrderQty} pcs/model` : 'Tanpa minimum'}</strong><span className="feature-desc">{supplierLine}</span></span>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><I.truck style={{ width: 20, height: 20 }} /></span>
          <span><strong>Pengiriman nasional</strong><span className="feature-desc">Kirim ke seluruh Indonesia</span></span>
        </div>
        <div className="feature-item">
          <span className="feature-icon"><I.chat style={{ width: 20, height: 20 }} /></span>
          <span><strong>Konsultasi via WhatsApp</strong><span className="feature-desc">Admin siap membantu Anda</span></span>
        </div>
      </div>

      {/* 5. Category chips */}
      {categories.length > 0 && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '8px 16px 4px', display: 'flex', gap: 8, overflowX: 'auto' }}>
          <button type="button" onClick={() => { setCat(''); setPage(1); }} style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${!cat ? T.black : T.border}`, background: !cat ? T.black : T.card, color: !cat ? T.white : T.muted, fontSize: 'var(--fs-md)', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .2s' }}>Semua</button>
          {categories.map((c) => (
            <button type="button" key={c.id} onClick={() => { setCat(String(c.id)); setPage(1); }} style={{ padding: '8px 16px', borderRadius: 999, border: `1px solid ${String(c.id) === cat ? T.black : T.border}`, background: String(c.id) === cat ? T.black : T.card, color: String(c.id) === cat ? T.white : T.muted, fontSize: 'var(--fs-md)', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all .2s' }}>{c.name}</button>
          ))}
        </div>
      )}

      {/* 6. Katalog */}
      <section id="produk" style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 16px 48px' }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: T.black }}>Produk Kami</h2>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: T.muted }}>{total} produk tersedia</p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <I.search style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: T.muted, pointerEvents: 'none' }} />
            <input aria-label="Cari produk" placeholder="Cari produk…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: '100%', height: 44, paddingLeft: 40, paddingRight: 14, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 14 }} />
          </div>
          <select value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} style={{ height: 44, minWidth: 140, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 'var(--fs-md)', padding: '0 12px' }}>
            <option value="">Semua kategori</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} style={{ height: 44, minWidth: 140, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 'var(--fs-md)', padding: '0 12px' }}>
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="pcard-grid">
          {loading && Array.from({ length: 8 }).map((_, i) => <div key={i} className="pcard-skeleton" />)}
          {!loading && products.map((p) => <ProductCard key={p.id} product={p} onWa={pickWa} onAdd={openPicker} inCart={countInCart(p.id)} marketplace={showMarketplaceOnCards(settings) ? marketplaceLinks(settings, p.name) : null} />)}
        </div>
        {!loading && !products.length && <p style={{ textAlign: 'center', color: T.muted, marginTop: 32, fontSize: 15 }}>Tidak ada produk ditemukan.</p>}
        {!loading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 32 }}>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="page-btn"><I.chevL style={{ width: 14, height: 14 }} /></button>
            {pages.map((p) => <button type="button" key={p} onClick={() => setPage(p)} className={`page-btn${p === page ? ' active' : ''}`}>{p}</button>)}
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="page-btn"><I.chevR style={{ width: 14, height: 14 }} /></button>
          </div>
        )}
      </section>

      {/* 7. CTA */}
      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px 48px' }}>
        <div style={{ borderRadius: 14, padding: '48px 32px', textAlign: 'center', background: T.blue, color: T.white }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: T.white }}>{wholesaleCopy ? 'Siap order grosir?' : 'Siap order?'}</h2>
          <p style={{ margin: '0 auto 20px', maxWidth: 440, color: 'rgba(255,255,255,.82)', fontSize: 15, lineHeight: 1.6 }}>Konsultasi harga, stok, dan warna langsung dengan admin via WhatsApp.</p>
          <button type="button" onClick={() => pickWa('')} className="hero-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 46, padding: '0 30px', borderRadius: 10, background: T.white, color: T.blue, fontWeight: 700, fontSize: 15, textDecoration: 'none', boxShadow: '0 4px 14px rgba(0,0,0,.18)' }}>Hubungi Admin</button>
        </div>
      </section>

      {/* 8. Footer */}
      <footer className="landing-footer" style={{ maxWidth: 1200, margin: '0 auto', borderTop: `1px solid ${T.border}` }}>
        <div className="landing-footer-grid">
          <div className="landing-footer-brand">
            <strong>ANYOSTORE</strong>
            <p>{wholesaleCopy ? 'Supplier baju denim grosir wanita.' : 'Pakaian denim wanita.'} {hasMinimumOrder ? `Minimal ${minOrderQty} pcs per model.` : 'Tanpa minimum order, bisa campur model.'}</p>
          </div>
          <div className="landing-footer-column">
            <strong className="landing-footer-heading">Navigasi</strong>
            <nav className="landing-footer-nav" aria-label="Navigasi footer">
              <a href="#produk">Produk</a>
              <button type="button" onClick={() => pickWa('')} className="landing-footer-link">Hubungi Admin</button>
              {wholesaleCopy && <a href={resellerHref}>Katalog Reseller</a>}
              <a href="/login">Login Pegawai</a>
            </nav>
          </div>
          <div className="landing-footer-column">
            <strong className="landing-footer-heading">Kontak</strong>
            <div className="landing-footer-nav">
              {waPhones.length ? waPhones.map((ph, i) => (
                <a key={i} href={waLink(ph, '')} target="_blank" rel="noopener noreferrer">Admin {i + 1}: {ph}</a>
              )) : <span className="landing-footer-empty">Kontak admin belum tersedia</span>}
            </div>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© {today.slice(0, 4) || new Date().getFullYear()} Anyostore</span>
          <span>{wholesaleCopy ? 'Grosir denim wanita' : 'Denim wanita'}</span>
        </div>
      </footer>

      {/* WA picker modal */}
      {waPicker && (
        <div onClick={() => setWaPicker(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 14, padding: 28, maxWidth: 400, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.black }}>Pilih Admin WhatsApp</h3>
              <button type="button" onClick={() => setWaPicker(false)} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, fontSize: 16, lineHeight: 1, cursor: 'pointer', color: T.muted, display: 'grid', placeItems: 'center' }} aria-label="Tutup">×</button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {waPhones.map((ph, idx) => (
                <a key={idx} href={waLink(ph, waMsg)} target="_blank" rel="noopener noreferrer" onClick={() => setWaPicker(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, borderRadius: 8, background: T.blue, color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', boxShadow: '0 2px 8px rgba(30,58,95,.2)', transition: 'all .2s' }}><I.chat style={{ width: 16, height: 16 }} /> Admin {idx + 1}: {ph}</a>
              ))}
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 'var(--fs-sm)', color: T.muted, textAlign: 'center' }}>{wholesaleCopy ? 'Pilih admin untuk chat harga grosir & stok.' : 'Pilih admin untuk chat harga & stok.'}</p>
          </div>
        </div>
      )}

      {cartPcs > 0 && (
        <button type="button" onClick={() => { setCartStep('cart'); setCartOpen(true); }} className="cart-fab" aria-label="Buka keranjang">
          <I.cart style={{ width: 20, height: 20 }} />
          <span className="cart-fab-badge">{cartPcs}</span>
        </button>
      )}

      {/* Keranjang: 3 langkah (produk -> alamat -> review) */}
      {cartOpen && (
        <div onClick={() => setCartOpen(false)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 120, padding: 12, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 14, maxWidth: 480, width: '100%', maxHeight: 'min(860px, 94vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 18px 8px' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.black }}>Keranjang <span style={{ color: T.muted, fontWeight: 500, fontSize: 'var(--fs-md)' }}>{cartPcs} pcs</span></h3>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Tutup" style={{ width: 34, height: 34, padding: 0, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, cursor: 'pointer', color: T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}><I.close style={{ width: 16, height: 16, display: 'block' }} /></button>
            </div>

            <div style={{ display: 'flex', gap: 6, padding: '0 18px 10px' }}>
              {[['cart', '1. Keranjang'], ['address', '2. Alamat'], ['review', '3. Review']].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setCartStep(key)} disabled={key !== 'cart' && !cart.length} style={{ flex: 1, minHeight: 30, padding: '4px 6px', borderRadius: 99, border: `1px solid ${cartStep === key ? T.blue : T.border}`, background: cartStep === key ? T.blue : T.card, color: cartStep === key ? '#fff' : T.muted, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{label}</button>
              ))}
            </div>

            <div style={{ flex: '1 1 auto', minHeight: 200, overflowY: 'auto', padding: '0 18px 6px', display: 'grid', gap: 8, alignContent: 'start' }}>
              {cartStep === 'cart' && (
                <>
                  {cart.map((it) => (
                    <div key={it.key} style={{ display: 'grid', gridTemplateColumns: '36px minmax(0,1fr) auto', gap: 8, alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
                      {it.photo
                        ? <img src={`${api.replace('/api', '')}${it.photo}`} alt={it.name} style={{ width: 36, height: 46, objectFit: 'cover', borderRadius: 6 }} />
                        : <div style={{ width: 36, height: 46, borderRadius: 6, background: '#f3f4f6' }} />}
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ fontSize: 12.5, display: 'block', color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</strong>
                        {it.variantLabel && <span style={{ fontSize: 10.5, color: T.muted }}>{it.variantLabel}</span>}
                        <div style={{ fontSize: 11.5, color: T.blue, fontWeight: 700 }}>{fmtRp(it.price)}/pcs</div>
                      </div>
                      <div style={{ display: 'grid', gap: 3, justifyItems: 'end' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <button type="button" className="qty-btn small" onClick={() => setItemQty(it.key, it.qty - 1)} aria-label="Kurangi jumlah"><I.minus style={{ width: 12, height: 12, color: '#fff' }} /></button>
                          <input type="number" min="1" value={it.qty} onChange={(e) => setItemQty(it.key, Math.max(1, Number(e.target.value) || 1))} aria-label={`Jumlah ${it.name}`} className="qty-input" />
                          <button type="button" className="qty-btn small" onClick={() => setItemQty(it.key, it.qty + 1)} aria-label="Tambah jumlah"><I.plus style={{ width: 12, height: 12, color: '#fff' }} /></button>
                        </div>
                        <button type="button" onClick={() => removeItem(it.key)} style={{ border: 0, background: 'none', color: '#dc2626', fontSize: 10.5, cursor: 'pointer', padding: 0 }}>Hapus</button>
                      </div>
                    </div>
                  ))}
                  {!cart.length && <p style={{ textAlign: 'center', color: T.muted, padding: '24px 0', fontSize: 14 }}>Keranjang masih kosong.</p>}
                  {cartWarnings.length > 0 && (
                    <div style={{ display: 'grid', gap: 3 }}>
                      {cartWarnings.map((w) => <p key={w.name} style={{ margin: 0, fontSize: 'var(--fs-xs)', color: '#b45309' }}>{w.qty < minOrderQty ? `${w.name} ${w.qty} pcs. Minimum ${minOrderQty} pcs per model.` : `${w.name}: jumlah melebihi stok tersedia (${Number(w.available || 0)} pcs).`}</p>)}
                    </div>
                  )}
                  <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{hasMinimumOrder ? `Minimal pembelian ${minOrderQty} pcs per model.` : 'Tanpa minimum pembelian.'} Varian boleh dicampur.</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.muted }}><span>Subtotal</span><strong style={{ color: T.black }}>{fmtRp(cartTotal)}</strong></div>
                </>
              )}

              {cartStep === 'address' && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.black }}>Alamat pengiriman</span>
                  <input value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} placeholder="Nama penerima" aria-label="Nama penerima" style={{ minHeight: 40, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, font: 'inherit', fontSize: 13 }} />
                  <input value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} placeholder="No HP / WhatsApp" inputMode="tel" aria-label="No HP" style={{ minHeight: 40, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, font: 'inherit', fontSize: 13 }} />
                  <textarea value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} placeholder="Alamat lengkap (jalan, RT/RW, kelurahan, kode pos)" rows={2} aria-label="Alamat" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, font: 'inherit', fontSize: 13, minHeight: 44, resize: 'vertical' }} />
                  {usesCourierApi ? (
                    <div style={{ display: 'grid', gap: 6 }}>
                      <input value={destinationQuery} onChange={(e) => { setDestinationQuery(e.target.value); setDestination(null); }} placeholder="Cari kecamatan tujuan (mis. Metro Pusat)" aria-label="Kecamatan tujuan" style={{ minHeight: 40, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, font: 'inherit', fontSize: 13 }} />
                      {destination && <p style={{ margin: 0, fontSize: 11.5, color: '#15803d', fontWeight: 700 }}>Tujuan: {destination.label}</p>}
                      {!destination && destinations.length > 0 && (
                        <div style={{ display: 'grid', gap: 4, maxHeight: 132, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 8, padding: 6 }}>
                          {destinations.map((item) => (
                            <button key={item.id} type="button" onClick={() => { setDestination(item); setDestinationQuery(item.label); setDestinations([]); }} style={{ textAlign: 'left', border: 0, background: 'transparent', padding: '6px 4px', fontSize: 12, color: T.black, cursor: 'pointer' }}>{item.label}</button>
                          ))}
                        </div>
                      )}
                      {shippingLoading && <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>Menghitung ongkir…</p>}
                      {shippingNotice && <p style={{ margin: 0, fontSize: 11.5, color: '#b45309' }}>{shippingNotice}</p>}
                      {shippingOptions.length > 0 && (
                        <div style={{ display: 'grid', gap: 4 }}>
                          {shippingOptions.map((option) => (
                            <label key={`${option.courier}-${option.service}`} style={{ display: 'grid', gridTemplateColumns: '16px minmax(0, 1fr) auto', alignItems: 'center', gap: 8, padding: '7px 9px', border: `1px solid ${selectedShipping?.courier === option.courier && selectedShipping?.service === option.service ? T.blue : T.border}`, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>
                              <input type="radio" name="shipping-option" style={{ width: 16, height: 16, margin: 0 }} checked={selectedShipping?.courier === option.courier && selectedShipping?.service === option.service} onChange={() => setSelectedShipping(option)} />
                              <span style={{ minWidth: 0, lineHeight: 1.3 }}>
                                <span style={{ display: 'block', fontWeight: 700, color: T.black, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option.courier_name}</span>
                                <span style={{ display: 'block', color: T.muted, fontSize: 11 }}>{option.service}{option.etd ? ` · ${option.etd}` : ''}</span>
                              </span>
                              <strong style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{fmtRp(option.cost)}</strong>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : shippingRates.length > 0 && (
                    <select value={shippingArea} onChange={(e) => setShippingArea(e.target.value)} aria-label="Kota / kecamatan" style={{ minHeight: 40, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, font: 'inherit', fontSize: 13, background: '#fff' }}>
                      <option value="">Pilih kota/kecamatan (cek ongkir)</option>
                      {shippingRates.map((rate) => <option key={rate.area} value={rate.area}>{rate.area}{Number(rate.cost) > 0 ? ` · ${fmtRp(rate.cost)}` : Number(rate.cost_per_kg) > 0 ? ` · ${fmtRp(rate.cost_per_kg)}/kg` : ''}</option>)}
                    </select>
                  )}
                  <input value={buyer.note} onChange={(e) => setBuyer({ ...buyer, note: e.target.value })} placeholder="Catatan untuk admin (opsional)" aria-label="Catatan" style={{ minHeight: 40, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, font: 'inherit', fontSize: 13 }} />
                </div>
              )}

              {cartStep === 'review' && (
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={voucherCode} onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherMessage(''); }} placeholder="Kode voucher" aria-label="Kode voucher" style={{ flex: 1, minHeight: 38, padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`, font: 'inherit', fontSize: 13, textTransform: 'uppercase' }} />
                    <button type="button" onClick={applyVoucher} disabled={!voucherCode.trim() || voucherChecking || !cart.length} className="pcard-btn secondary" style={{ flex: '0 0 auto', padding: '0 14px' }}>{voucherChecking ? 'Cek…' : 'Pakai'}</button>
                  </div>
                  {voucherMessage && <p style={{ margin: 0, fontSize: 11.5, color: voucher ? '#15803d' : '#b45309' }}>{voucherMessage}</p>}

                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: T.muted }}><span>Subtotal</span><span>{fmtRp(cartTotal)}</span></div>
                    {voucher && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: '#15803d', fontWeight: 700 }}><span>Voucher {voucher.code}{voucher.discount_type === 'per_pcs' ? ` (${fmtRp(voucher.discount_value)} × ${cartPcs} pcs)` : ''}</span><span style={{ whiteSpace: 'nowrap' }}>-{fmtRp(voucherDiscount)}</span></div>}
                    {(shippingArea || selectedShipping) && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, color: T.muted }}><span>Ongkir{shippingLabel ? ` (${shippingLabel})` : ''}</span><span style={{ whiteSpace: 'nowrap' }}>{fmtRp(shippingCost)}</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, fontSize: 15, color: T.black, paddingTop: 4, borderTop: `1px solid ${T.border}` }}><span>Total</span><span>{fmtRp(grandTotal)}</span></div>
                  </div>

                  <div style={{ display: 'grid', gap: 2, fontSize: 12, color: T.muted, padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: 8 }}>
                    <strong style={{ color: T.black, fontSize: 12 }}>{buyer.name || '-'} · {buyer.phone || '-'}</strong>
                    <span>{buyer.address || 'Alamat belum diisi'}</span>
                    {(usesCourierApi ? destination?.label : shippingArea) && <span>Tujuan: {usesCourierApi ? destination?.label : shippingArea}</span>}
                    {shippingLabel && <span>Kurir: {shippingLabel}</span>}
                    {buyer.note && <span>Catatan: {buyer.note}</span>}
                  </div>

                  {isResellerOrder && paymentInfo && (
                    <div style={{ display: 'grid', gap: 8, padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: 8 }}>
                      <strong style={{ fontSize: 12.5, color: T.black }}>Pembayaran</strong>
                      {paymentInfo.qris_image && (
                        <img
                          src={`${api.replace('/api', '')}${paymentInfo.qris_image}`}
                          alt="QRIS"
                          style={{ width: '100%', maxWidth: 220, borderRadius: 8, border: `1px solid ${T.border}` }}
                        />
                      )}
                      {(paymentInfo.bank_accounts || []).map((account) => (
                        <div key={`${account.bank}-${account.number}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                          <span>
                            <strong>{account.bank}</strong> {account.number}
                            {account.holder ? <><br /><small style={{ color: T.muted }}>a.n. {account.holder}</small></> : null}
                          </span>
                          <button
                            type="button"
                            className="pcard-btn secondary"
                            style={{ flex: '0 0 auto', minHeight: 32, padding: '4px 10px', fontSize: 11.5 }}
                            onClick={() => navigator.clipboard?.writeText(account.number)}
                          >
                            Salin
                          </button>
                        </div>
                      ))}
                      {paymentInfo.note && <p style={{ margin: 0, fontSize: 11.5, color: T.muted }}>{paymentInfo.note}</p>}
                    </div>
                  )}
                  {isResellerOrder && systemNotice && (
                    <p style={{ margin: 0, fontSize: 11.5, color: '#b45309' }}>{systemNotice}</p>
                  )}
                </div>
              )}
            </div>

            <div style={{ flex: '0 0 auto', borderTop: `1px solid ${T.border}`, padding: '12px 18px 16px', display: 'flex', gap: 10 }}>
              {cartStep === 'cart' && (
                <>
                  <button type="button" onClick={clearCart} disabled={!cart.length} className="pcard-btn secondary" style={{ flex: '0 0 auto', minWidth: 108 }}>Kosongkan</button>
                  <button type="button" onClick={() => setCartStep('address')} disabled={!cart.length || hasMinimumWarning} className="pcard-btn primary" style={{ flex: 1, minHeight: 44 }}>Lanjut ke alamat</button>
                </>
              )}
              {cartStep === 'address' && (
                <>
                  <button type="button" onClick={() => setCartStep('cart')} className="pcard-btn secondary" style={{ flex: '0 0 auto', minWidth: 96 }}>Kembali</button>
                  <button type="button" onClick={() => setCartStep('review')} disabled={!buyerReady || (usesCourierApi && shippingOptions.length > 0 && !selectedShipping)} className="pcard-btn primary" style={{ flex: 1, minHeight: 44 }}>Lanjut ke review</button>
                </>
              )}
              {cartStep === 'review' && (
                <>
                  <button type="button" onClick={() => setCartStep('address')} className="pcard-btn secondary" style={{ flex: '0 0 auto', minWidth: 96 }}>Kembali</button>
                  {isResellerOrder ? (
                    <>
                      <button type="button" onClick={sendOrder} disabled={!cart.length || orderChecking} className="pcard-btn secondary" style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}><I.chat style={{ width: 15, height: 15 }} /> WhatsApp</button>
                      <button type="button" onClick={sendOrderToSystem} disabled={!cart.length || systemBusy} className="pcard-btn primary" style={{ flex: 1, minHeight: 44 }}>
                        {systemBusy ? 'Mengirim…' : 'Kirim Pesanan ke Sistem'}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={sendOrder} disabled={!cart.length || hasMinimumWarning || orderChecking} className="pcard-btn primary" style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44 }}><I.chat style={{ width: 15, height: 15 }} /> {orderChecking ? 'Memeriksa stok…' : 'Chat Pesanan via WhatsApp'}</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hasil pesanan langsung ke sistem (landing reseller) */}
      {orderResult && (
        <div onClick={() => setOrderResult(null)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 140, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 14, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: T.black }}>Pesanan terkirim</h3>
            <p style={{ margin: '0 0 6px', fontSize: 13, color: T.muted }}>Nomor pesanan</p>
            <p style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 800, color: T.black, letterSpacing: '.02em' }}>{orderResult.order_no}</p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: T.black }}>Total {fmtRp(orderResult.total)} · menunggu konfirmasi admin.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <a href={`/pesanan/${orderResult.public_token}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 8, border: `1px solid ${T.blue}`, color: T.blue, fontWeight: 700, textDecoration: 'none', fontSize: 13 }}>Lihat status pesanan</a>
              <button type="button" onClick={() => { pickWa(`Halo Anyostore, saya sudah kirim pesanan ${orderResult.order_no} lewat website. Mohon dikonfirmasi ya.`); setOrderResult(null); }} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, borderRadius: 8, background: T.blue, color: '#fff', fontWeight: 700, fontSize: 13, border: 0, cursor: 'pointer' }}><I.chat style={{ width: 15, height: 15 }} /> Konfirmasi via WhatsApp</button>
              <button type="button" onClick={() => setOrderResult(null)} style={{ minHeight: 40, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.muted, fontSize: 13, cursor: 'pointer' }}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {/* Pilih varian + jumlah */}
      {picker && (
        <div onClick={closePicker} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', zIndex: 130, padding: 16, backdropFilter: 'blur(4px)' }}>
          <div onClick={(e) => e.stopPropagation()} className="wa-modal-in" style={{ background: T.card, borderRadius: 14, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.black }}>{picker.product.name}</h3>
              <button type="button" onClick={closePicker} aria-label="Tutup" style={{ width: 34, height: 34, padding: 0, borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, cursor: 'pointer', color: T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}><I.close style={{ width: 16, height: 16, display: 'block' }} /></button>
            </div>
            {pickerPhoto
              ? <img src={`${api.replace('/api', '')}${pickerPhoto}`} alt={picker.product.name} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 10, display: 'block', marginBottom: 16, background: '#f3f4f6' }} />
              : <div style={{ width: '100%', height: 200, borderRadius: 10, background: '#f3f4f6', display: 'grid', placeItems: 'center', color: T.muted, fontSize: 'var(--fs-md)', marginBottom: 16 }}>Tanpa foto</div>}
            {pickerLoading && <p style={{ color: T.muted, fontSize: 'var(--fs-md)' }}>Memuat varian…</p>}
            {!pickerLoading && picker.variants.length > 0 && (
              <>
                <strong style={{ fontSize: 'var(--fs-sm)', color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Pilih varian</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, margin: '10px 0 18px' }}>
                  {picker.variants.map((v) => {
                    const active = v.id === pickVariantId;
                    const label = [v.color, v.size].filter(Boolean).join(' · ') || 'Varian';
                    const inVariant = cart.filter((item) => item.key === `${picker.product.id}-${v.id}`).reduce((sum, item) => sum + Number(item.qty || 0), 0);
                    const variantRemaining = Math.max(0, Number(v.available_stock || 0) - inVariant);
                    return (
                      <button key={v.id} type="button" disabled={variantRemaining <= 0} onClick={() => { setPickVariantId(v.id); setPickQty((current) => Math.max(1, Math.min(current, variantRemaining, modelStockRemaining))); }} title={variantRemaining <= 0 ? 'Stok varian habis untuk pesanan ini' : `Stok ${variantRemaining} pcs tersedia untuk pesanan ini`} style={{ padding: '9px 10px', borderRadius: 8, border: `1.5px solid ${active ? T.blue : T.border}`, background: active ? T.blue : T.card, color: active ? '#fff' : T.black, fontWeight: 600, fontSize: 'var(--fs-sm)', cursor: variantRemaining <= 0 ? 'not-allowed' : 'pointer', opacity: variantRemaining <= 0 ? .5 : 1, transition: 'all .2s' }}>
                        {label}
                        <span style={{ display: 'block', fontSize: 'var(--fs-xs)', opacity: .75 }}>Stok {variantRemaining}</span>
                        {Number(v.price) > 0 && Number(v.price) !== Number(picker.product.price) && <span style={{ display: 'block', fontSize: 'var(--fs-xs)', opacity: .85 }}>{fmtRp(v.price)}</span>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <strong style={{ fontSize: 'var(--fs-sm)', color: T.muted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Jumlah</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0 18px' }}>
              <button type="button" className="qty-btn" onClick={() => setPickQty((q) => Math.max(1, q - 1))} aria-label="Kurangi jumlah"><I.minus style={{ width: 18, height: 18, color: '#fff' }} /></button>
              <input type="number" min="1" max={pickMax} value={pickQty} onChange={(e) => setPickQty(Math.max(1, Math.min(pickMax, Number(e.target.value) || 1)))} aria-label="Jumlah" className="qty-input" style={{ width: 60, height: 36, fontSize: 16 }} />
              <button type="button" className="qty-btn" disabled={pickQty >= pickMax} onClick={() => setPickQty((q) => Math.min(pickMax, q + 1))} aria-label="Tambah jumlah"><I.plus style={{ width: 18, height: 18, color: '#fff' }} /></button>
            </div>
            <button type="button" onClick={addFromPicker} disabled={!pickMax || pickerLoading} className="pcard-btn primary" style={{ width: '100%', minHeight: 46, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 14 }}><I.cart style={{ width: 16, height: 16 }} /> Tambah ke Keranjang</button>
            <p style={{ margin: '12px 0 0', fontSize: 'var(--fs-sm)', color: T.muted, textAlign: 'center' }}>Minimal 4 pcs per model. Varian boleh dicampur.</p>
          </div>
        </div>
      )}

      <FloatingWA phones={waPhones} message={wholesaleCopy ? "Halo Anyostore, saya ingin order grosir." : "Halo Anyostore, saya ingin order."} />

      <style>{`
        .site-header { background: rgba(255,255,255,.92); border-bottom: 1px solid rgba(229,231,235,.8); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
        .btn-primary { display: inline-flex; align-items: center; gap: 6; min-height: 44px; padding: 0 22px; border-radius: 12px; background: ${T.blue}; color: #fff; font-weight: 700; font-size: 14px; text-decoration: none; border: none; cursor: pointer; box-shadow: 0 4px 16px rgba(30,58,95,.3); transition: all .35s cubic-bezier(.4,0,.2,1); }
        .btn-primary:hover { background: #152d4a; box-shadow: 0 8px 24px rgba(30,58,95,.4); transform: translateY(-2px); }
        .btn-primary:active { transform: scale(.97); }
        .btn-outline { display: inline-flex; align-items: center; gap: 6; min-height: 44px; padding: 0 22px; border-radius: 12px; background: #fff; color: ${T.blue}; font-weight: 700; font-size: 14px; text-decoration: none; border: 1.5px solid rgba(30,58,95,.35); cursor: pointer; transition: all .35s cubic-bezier(.4,0,.2,1); }
        .btn-outline:hover { background: ${T.blue}; color: #fff; border-color: ${T.blue}; transform: translateY(-2px); }
        .btn-outline:active { transform: scale(.97); }
        .hero-btn { transition: all .35s cubic-bezier(.4,0,.2,1); }
        .hero-btn:hover { transform: translateY(-2px); }
        .hero-btn:active { transform: scale(.97); }
        .feature-strip { max-width: 1200px; margin: 0 auto; padding: 20px 16px 6px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .feature-item { display: flex; align-items: center; gap: 12px; background: ${T.card}; border: 1px solid ${T.border}; border-radius: 12px; padding: 14px 16px; }
        .feature-icon { width: 40px; height: 40px; border-radius: 10px; background: rgba(30,58,95,.08); color: ${T.blue}; display: grid; place-items: center; flex-shrink: 0; }
        .feature-item strong { display: block; font-size: 13px; font-weight: 700; color: ${T.black}; }
        .feature-desc { display: block; font-size: 12px; color: ${T.muted}; margin-top: 2px; }
        .pcard-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
        .pcard { position: relative; display: flex; flex-direction: column; border-radius: 14px; overflow: hidden; background: #fff; border: 1px solid #e5e7eb; transition: all .3s cubic-bezier(.4,0,.2,1); box-shadow: 0 1px 3px rgba(0,0,0,.04); }
        .pcard:hover { transform: translateY(-3px); box-shadow: 0 10px 28px rgba(15,23,42,.08); border-color: #d1d5db; }
        .pcard:active { transform: scale(.985); }
        .pcard-add { position: absolute; top: 10px; right: 10px; z-index: 4; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(255,255,255,.35); background: rgba(30,58,95,.94); color: #fff; font-weight: 700; font-size: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(15,23,42,.35); transition: all .2s; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
        .pcard-add:hover { background: #152d4a; transform: translateY(-1px); }
        .pcard-add.has { background: #152d4a; }
        .pcard-add-badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 10px; font-weight: 800; display: grid; place-items: center; padding: 0 4px; }
        .cart-fab { position: fixed; right: 16px; bottom: 82px; z-index: 95; width: 56px; height: 56px; border-radius: 999px; border: 0; background: ${T.blue}; color: #fff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 12px 28px rgba(15,23,42,.25); transition: all .2s; }
        .cart-fab:hover { transform: translateY(-2px); }
        .cart-fab-badge { position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; border-radius: 999px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 800; display: grid; place-items: center; padding: 0 5px; border: 2px solid #fff; }
        .qty-btn { width: 34px; height: 34px; padding: 0; border-radius: 8px; border: 1px solid ${T.blue}; background: ${T.blue}; color: #fff; display: grid; place-items: center; cursor: pointer; transition: all .2s; box-shadow: 0 2px 6px rgba(30,58,95,.22); }
        .qty-btn:hover { background: #152d4a; }
        .qty-btn.small { width: 28px; height: 28px; }
        .qty-btn svg { display: block; }
        .qty-input { width: 52px; height: 28px; text-align: center; border: 1px solid #94a3b8; border-radius: 8px; font-weight: 700; font-size: 13px; color: #1a1a1a; background: #fff; -moz-appearance: textfield; }
        .qty-input::-webkit-outer-spin-button, .qty-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .pcard-img { display: grid; place-items: center; aspect-ratio: 3/4; overflow: hidden; position: relative; background: #f3f4f6; }
        .pcard-img img { animation: photoIn .35s ease; }
        .pcard-dots { position: absolute; left: 0; right: 0; bottom: 8px; display: flex; justify-content: center; gap: 4px; z-index: 2; pointer-events: none; }
        .pcard-dot { width: 5px; height: 5px; border-radius: 999px; background: rgba(255,255,255,.7); box-shadow: 0 0 0 1px rgba(0,0,0,.18); transition: all .25s cubic-bezier(.4,0,.2,1); }
        .pcard-dot.active { width: 14px; background: #fff; }
        @keyframes photoIn { from { opacity: .25; } to { opacity: 1; } }
        .pcard-body { padding: 16px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .pcard-body strong { font-size: 14px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pcard-price { color: ${T.blue}; font-weight: 700; font-size: 16px; }
        .pcard-color { padding: 2px 8px; border-radius: 4px; background: rgba(30,58,95,.08); font-size: 11px; color: #52525b; }
        .pcard-actions { display: flex; gap: 10px; margin-top: auto; padding-top: 12px; }
        .pcard-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; min-height: 42px; padding: 0 10px; border-radius: 8px; font-size: 13px; font-weight: 700; line-height: 1.1; text-align: center; text-decoration: none; cursor: pointer; box-sizing: border-box; transition: all .3s cubic-bezier(.4,0,.2,1); }
        .pcard-btn.primary { background: ${T.blue}; color: #fff; border: none; }
        .pcard-btn.primary:hover { background: #152d4a; transform: translateY(-1px); }
        .pcard-btn.secondary { background: #fff; color: ${T.blue}; border: 1.5px solid rgba(30,58,95,.3); }
        .pcard-btn.secondary:hover { background: ${T.blue}; color: #fff; border-color: ${T.blue}; }
        .pcard-skeleton { height: 380px; border-radius: 16px; background: linear-gradient(135deg, rgba(243,244,246,.8), rgba(243,244,246,.4)); }
        .page-btn { min-width: 42px; min-height: 42px; border-radius: 10px; border: 1.5px solid #cbd5e1; background: #fff; font-weight: 600; font-size: 14px; color: ${T.black}; cursor: pointer; transition: all .3s cubic-bezier(.4,0,.2,1); display: inline-flex; align-items: center; justify-content: center; }
        .page-btn:hover { border-color: ${T.blue}; color: ${T.blue}; background: rgba(255,255,255,.8); }
        .page-btn.active { background: ${T.blue}; color: ${T.white}; border-color: ${T.blue}; box-shadow: 0 2px 8px rgba(30,58,95,.25); }
        .wa-modal-in { animation: modalIn .35s cubic-bezier(.4,0,.2,1); }
        @keyframes modalIn { from { opacity: 0; transform: translateY(10px) scale(.98); } to { opacity: 1; transform: none; } }
        .landing-footer { padding: 52px 20px 28px; }
        .landing-footer-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) repeat(2, minmax(180px, 1fr)); gap: 48px; align-items: start; }
        .landing-footer-brand strong { display: block; color: ${T.black}; font-size: 16px; font-weight: 800; letter-spacing: .02em; }
        .landing-footer-brand p { max-width: 280px; margin: 12px 0 0; color: ${T.muted}; font-size: 13px; line-height: 1.65; }
        .landing-footer-column { min-width: 0; }
        .landing-footer-heading { display: block; color: ${T.black}; font-size: 11px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
        .landing-footer-nav { display: grid; justify-items: start; gap: 5px; margin-top: 14px; }
        .landing-footer-nav a, .landing-footer-link, .landing-footer-empty { display: inline-flex; align-items: center; min-height: 30px; padding: 0; color: ${T.muted}; font-family: inherit; font-size: 13px; font-weight: 600; line-height: 1.4; text-decoration: none; }
        .landing-footer-link { width: auto; border: 0; border-radius: 0; background: transparent; cursor: pointer; }
        .landing-footer-nav a:hover, .landing-footer-link:hover { color: ${T.blue}; }
        .landing-footer-nav a:focus-visible, .landing-footer-link:focus-visible { outline: 2px solid ${T.blue}; outline-offset: 3px; border-radius: 3px; }
        .landing-footer-empty { color: ${T.muted}; font-weight: 500; }
        .landing-footer-bottom { display: flex; justify-content: space-between; gap: 16px; margin-top: 48px; padding-top: 18px; border-top: 1px solid ${T.border}; color: ${T.muted}; font-size: 12px; }
        @media (max-width: 900px) {
          .pcard-grid { grid-template-columns: repeat(3, 1fr); }
          .landing-footer-grid { grid-template-columns: 1.2fr 1fr 1fr; gap: 28px; }
        }
        @media (max-width: 600px) {
          .pcard-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .feature-strip { grid-template-columns: 1fr; gap: 8px; padding: 16px 16px 4px; }
          .landing-footer { padding: 40px 20px 24px; }
          .landing-footer-grid { grid-template-columns: 1fr; gap: 28px; }
          .landing-footer-bottom { align-items: flex-start; flex-direction: column; gap: 6px; margin-top: 36px; }
        }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      `}</style>
    </div>
  );
}
