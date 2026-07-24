'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, LayoutDashboard, LogOut, ShoppingCart, Store as StoreIcon, X } from 'lucide-react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (amount) => `Rp${Number(amount || 0).toLocaleString('id-ID')}`;
const SEMI_GROSIR_DISCOUNT_PER_PCS = 10000;

export default function PosPage() {
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [cash, setCash] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promo, setPromo] = useState(null);
  const [variantProduct, setVariantProduct] = useState(null);
  const [printPrompt, setPrintPrompt] = useState(null);
  const [loadingStore, setLoadingStore] = useState(true);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [priceTier, setPriceTier] = useState('retail');
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pos_access_token')}` });
  const mediaUrl = (photoPath) => photoPath ? `${apiUrl.replace('/api', '')}${photoPath}` : '';

  useEffect(() => {
    if (!localStorage.getItem('pos_access_token')) { window.location.assign('/'); return; }
    fetch(`${apiUrl}/settings/branches`, { headers: headers() })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Gagal memuat daftar toko');
        const availableStores = body.data || [];
        if (!availableStores.length) throw new Error('Tidak ada toko aktif yang dapat dipakai untuk POS');
        setStores(availableStores);
        const remembered = localStorage.getItem('pos_branch_id');
        const selected = availableStores.find((store) => String(store.id) === remembered) || availableStores[0];
        setStoreId(String(selected.id));
        localStorage.setItem('pos_branch_id', String(selected.id));
        await loadStore(selected.id);
      }).catch((error) => setMessage(error.message));
  }, []);
  useEffect(() => {
    if (!variantProduct) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setVariantProduct(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [variantProduct]);
  useEffect(() => {
    if (!printPrompt) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') finishPayment(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [printPrompt]);
  useEffect(() => {
    if (!mobileCartOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setMobileCartOpen(false); };
    document.body.classList.add('mobile-cart-active');
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('mobile-cart-active');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileCartOpen]);

  const selectedStore = stores.find((store) => String(store.id) === String(storeId));

  async function loadStore(branchId) {
    setLoadingStore(true);
    try {
      const query = new URLSearchParams({ branch_id: String(branchId) });
      const [productsResponse, warehousesResponse, customersResponse] = await Promise.all([
        fetch(`${apiUrl}/products?limit=500&include_wholesale=1&${query}`, { headers: headers() }),
        fetch(`${apiUrl}/inventory/warehouses?${query}`, { headers: headers() }),
        fetch(`${apiUrl}/customers?limit=500&${query}`, { headers: headers() })
      ]);
      const productsBody = await productsResponse.json();
      const warehousesBody = await warehousesResponse.json();
      const customersBody = await customersResponse.json();
      if (!productsResponse.ok || !warehousesResponse.ok) throw new Error(productsBody.message || warehousesBody.message || 'Gagal memuat data toko');
      setProducts(productsBody.data || []);
      setWarehouses(warehousesBody.data || []);
      setWarehouseId(warehousesBody.data?.[0] ? String(warehousesBody.data[0].id) : '');
      const activeCustomers = customersResponse.ok ? (customersBody.data || []) : [];
      setCustomers(activeCustomers);
    } finally { setLoadingStore(false); }
  }

  async function changeStore(event) {
    const nextId = event.target.value;
    if (!nextId || nextId === storeId) return;
    const nextStore = stores.find((store) => String(store.id) === nextId);
    setCart([]); setPromo(null); setPromoCode(''); setCash(''); setVariantProduct(null); setCustomerId(''); setPriceTier('retail');
    try {
      await loadStore(nextId);
      setStoreId(nextId);
      localStorage.setItem('pos_branch_id', nextId);
      setMessage(`POS aktif untuk ${nextStore?.name || 'toko terpilih'}. Keranjang telah dikosongkan.`);
    } catch (error) { setMessage(error.message); }
  }

  async function chooseProduct(product) {
    if (Number(product.variant_count) === 0) return addToCart(product);
    try {
      const response = await fetch(`${apiUrl}/products/${product.id}?branch_id=${encodeURIComponent(storeId)}`, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Varian warna tidak dapat dimuat');
      setVariantProduct(body.data);
    } catch (error) { setMessage(error.message); }
  }
  function addToCart(product, variant = null) {
    if (variant && Number(variant.stock) <= 0) {
      setMessage('Stok warna ' + variant.color + ' masih 0. Tambahkan melalui Produk Masuk terlebih dahulu.');
      return;
    }
    const cartId = `${product.id}:${variant?.id || 'utama'}`;
    const price = variant?.price == null ? product.price : variant.price;
    const wholesalePrices = variant?.wholesale_prices || product.wholesale_prices || [];
    setCart((current) => {
      const found = current.find((item) => item.cart_id === cartId);
      if (found) return current.map((item) => item.cart_id === cartId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...product, cart_id: cartId, variant_id: variant?.id || null, variant_color: variant?.color || '', price, quantity: 1, wholesale_prices: wholesalePrices }];
    });
    setVariantProduct(null);
  }
  function quantity(cartId, next) { setCart((current) => current.flatMap((item) => item.cart_id === cartId ? (next > 0 ? [{ ...item, quantity: next }] : []) : [item])); }
  function changeCustomer(event) {
    const nextId = event.target.value;
    setCustomerId(nextId);
    const selected = customers.find((c) => String(c.id) === nextId);
    const tier = selected?.price_tier === 'semi_grosir' ? 'semi_grosir' : selected?.price_tier === 'grosir_seri' ? 'grosir_seri' : 'retail';
    setPriceTier(tiersEnabled ? tier : 'retail');
  }
  function setPriceOverride(cartId, value) {
    const numeric = Number(value);
    setCart((current) => current.map((item) => {
      if (item.cart_id !== cartId) return item;
      if (value === '' || Number.isNaN(numeric) || numeric < 0) {
        const { price_override: _ignored, ...rest } = item;
        return rest;
      }
      return { ...item, price_override: numeric };
    }));
  }
  const tierLabel = { retail: 'Retail', semi_grosir: 'Semi Grosir', grosir_seri: 'Grosir Seri' };
  function resolveWholesalePrice(item, ignoreMinQty = false) {
    const tiers = item.wholesale_prices || [];
    if (!tiers.length) return item.price;
    const match = tiers
      .filter((t) => (ignoreMinQty || item.quantity >= Number(t.min_qty)) && (t.max_qty == null || item.quantity <= Number(t.max_qty)))
      .sort((a, b) => Number(b.min_qty) - Number(a.min_qty))[0];
    if (match) return Number(match.price);
    if (ignoreMinQty) {
      const fallback = tiers.slice().sort((a, b) => Number(a.min_qty) - Number(b.min_qty))[0];
      if (fallback) return Number(fallback.price);
    }
    return item.price;
  }
  const tiersEnabled = selectedStore?.pricing_tier_enabled !== false;
  const effectiveTier = useMemo(() => {
    if (!tiersEnabled) return 'retail';
    if (priceTier !== 'retail') return priceTier;
    for (const item of cart) {
      if (item.quantity >= 6 && resolveWholesalePrice(item) < item.price) return 'grosir_seri';
    }
    const totalQty = cart.reduce((sum, item) => sum + item.quantity, 0);
    const distinctModels = new Set(cart.map((item) => item.id)).size;
    if (totalQty > 3 && distinctModels > 1) return 'semi_grosir';
    return 'retail';
  }, [cart, priceTier, tiersEnabled]);
  const cartPrice = (item) => {
    if (item.price_override != null) return item.price_override;
    if (!tiersEnabled) return item.price;
    if (effectiveTier === 'grosir_seri') return resolveWholesalePrice(item, priceTier === 'grosir_seri');
    if (effectiveTier === 'semi_grosir') return Math.max(0, item.price - SEMI_GROSIR_DISCOUNT_PER_PCS);
    return item.price;
  };
  const cartSubtotal = (item) => cartPrice(item) * item.quantity;
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + cartSubtotal(item), 0), [cart]);
  const discount = Number(promo?.discount || 0);
  const total = Math.max(0, subtotal - discount);
  const amountPaid = paymentMethod === 'cash' ? Number(cash || 0) : total;
  const change = paymentMethod === 'cash' ? Math.max(0, amountPaid - total) : 0;
  async function applyPromo() { try { const response = await fetch(`${apiUrl}/promotions/validate`, { method: 'POST', headers: headers(), body: JSON.stringify({ branch_id: Number(storeId), code: promoCode, subtotal }) }); const body = await response.json(); if (!response.ok) throw new Error(body.message); setPromo(body.data); setMessage(`Promo ${body.data.code} diterapkan: -${rupiah(body.data.discount)}`); } catch (error) { setPromo(null); setMessage(error.message); } }
  async function checkout() {
    if (!storeId || !warehouseId || !cart.length) return setMessage('Pilih toko, gudang, dan tambahkan produk ke keranjang.');
    setSubmitting(true); setMessage('');
    try {
      const items = cart.map((item) => ({ product_id: item.id, variant_id: item.variant_id || undefined, quantity: item.quantity, price_override: item.price_override || undefined }));
      const bodyPayload = { branch_id: Number(storeId), warehouse_id: Number(warehouseId), items, payment_method: paymentMethod, amount_paid: amountPaid, promo_code: promo?.code || undefined };
      if (customerId) bodyPayload.customer_id = Number(customerId);
      const response = await fetch(`${apiUrl}/transactions`, { method: 'POST', headers: headers(), body: JSON.stringify(bodyPayload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Transaksi gagal');
      setCart([]); setCash(''); setPromoCode(''); setPromo(null); setPaymentMethod('cash'); setMobileCartOpen(false); setCustomerId(''); setPriceTier('retail');
      setPrintPrompt(body.data);
      loadStore(storeId).catch(() => setMessage('Transaksi berhasil, tetapi stok terbaru belum dapat dimuat. Muat ulang halaman untuk memperbarui stok.'));
  } catch (error) { setMessage(error.message); } finally { setSubmitting(false); }
  }
  function finishPayment(printReceipt) {
    const completed = printPrompt;
    setPrintPrompt(null);
    if (!completed) return;
    if (printReceipt) {
      window.location.assign('/receipt/' + completed.id + '?print=1');
      return;
    }
    setMessage('Berhasil: ' + completed.invoice_no + '. Kembalian ' + rupiah(completed.change) + '.');
  }
  function logout() {
    localStorage.removeItem('pos_access_token');
    localStorage.removeItem('pos_refresh_token');
    window.location.assign('/');
  }

  return (
    <div className="pos-standalone">
      <header className="pos-standalone-header"><a className="pos-standalone-brand" href="/dashboard"><span>A</span><div><strong>Anyostore POS</strong><small>Kasir toko</small></div></a><nav><a href="/dashboard"><LayoutDashboard aria-hidden="true" size={15} /> Dasbor</a><a href="/history">Riwayat <ArrowUpRight aria-hidden="true" size={15} /></a><button type="button" onClick={logout}><LogOut aria-hidden="true" size={15} /> Keluar</button></nav></header>
      <div className="pos-workspace">
        <section className="pos-store-bar" aria-label="Toko aktif untuk transaksi">
          <div className="pos-store-context"><span><StoreIcon aria-hidden="true" size={18} /></span><div><strong>{selectedStore?.name || 'Memuat toko…'}</strong><small>{stores.length > 1 ? 'Owner dapat memilih toko transaksi' : 'POS mengikuti toko akun ini'}</small></div></div>
          <label htmlFor="pos-store-select"><span>Toko transaksi</span><select id="pos-store-select" value={storeId} onChange={changeStore} disabled={loadingStore || stores.length <= 1}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
        </section>
        <button type="button" className="mobile-cart-toggle" onClick={() => setMobileCartOpen(true)} aria-expanded={mobileCartOpen}>
          <ShoppingCart aria-hidden="true" size={19} />
          <span>Keranjang</span>
          <strong>{cart.reduce((sum, item) => sum + item.quantity, 0)} item · {rupiah(total)}</strong>
        </button>
        <button type="button" className={`pos-mobile-cart-backdrop ${mobileCartOpen ? 'visible' : ''}`} onClick={() => setMobileCartOpen(false)} aria-label="Tutup keranjang" tabIndex={mobileCartOpen ? 0 : -1} />
        <section className="pos-layout">
        <section className="panel catalog" aria-busy={loadingStore}>
          <p className="warehouse-label">Gudang aktif: <strong>{loadingStore ? 'Memuat…' : warehouses.find((warehouse) => String(warehouse.id) === String(warehouseId))?.name || 'Belum tersedia'}</strong></p>
          <div className="section-heading"><div><h2>Pilih Produk</h2><p>{products.length} produk aktif dari database.</p></div></div>
          <div className="catalog-grid">{products.map((product) => { const hasVariants = Number(product.variant_count) > 0; const availableStock = hasVariants ? Number(product.variant_stock_total || 0) : Number(product.stock || 0); return <button className="product-tile" key={product.id} onClick={() => chooseProduct(product)} disabled={loadingStore || (availableStock <= 0 && !hasVariants)} aria-label={`${product.name}, ${rupiah(product.price)}, stok ${availableStock}`}>{product.photo_path ? <img src={mediaUrl(product.photo_path)} alt="" loading="lazy" /> : <span className="pos-photo-placeholder">Tanpa foto</span>}<strong>{product.name}</strong><span>{rupiah(product.price)}</span><small>{hasVariants ? `${product.variant_count} warna · Stok warna: ${availableStock}` : `Stok: ${availableStock}`}</small></button>; })}</div>
        </section>
        <aside className="panel cart"><div className="cart-mobile-header"><h2>Keranjang</h2><button type="button" className="cart-mobile-close" onClick={() => setMobileCartOpen(false)} aria-label="Tutup panel keranjang">×</button></div><label className="pos-customer-select"><span>Pelanggan</span><select value={customerId} onChange={changeCustomer} disabled={loadingStore}><option value="">Umum / Reguler</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} {customer.phone ? `(${customer.phone})` : ''}{tiersEnabled ? ` — ${tierLabel[customer.price_tier || 'retail']}` : ''}</option>)}</select></label>{cart.length > 0 && tiersEnabled && <div className="pos-tier-badge"><span className={`tier-badge ${effectiveTier}`}>{tierLabel[effectiveTier]}</span><small>{priceTier === 'retail' ? 'Harga mengikuti qty otomatis' : 'Harga mengikuti tipe pelanggan'}</small></div>}{cart.length ? <div className="cart-lines">{cart.map((item) => <article key={item.cart_id}><div className="cart-item-info"><strong>{item.name}</strong><span>{item.variant_color ? `${item.variant_color} · ` : ''}{rupiah(cartPrice(item))}</span><label className="price-override"><span>Harga</span><input type="number" min="0" value={item.price_override ?? cartPrice(item)} onChange={(event) => setPriceOverride(item.cart_id, event.target.value)} /></label></div><div className="quantity"><button onClick={() => quantity(item.cart_id, item.quantity - 1)}>−</button><input type="number" min="1" value={item.quantity} onChange={(event) => quantity(item.cart_id, Number(event.target.value) || 1)} aria-label="Jumlah" /><button onClick={() => quantity(item.cart_id, item.quantity + 1)}>+</button></div><strong>{rupiah(cartSubtotal(item))}</strong></article>)}</div> : <p>Keranjang masih kosong.</p>}<label>Kode promo<div className="promo-entry"><input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} placeholder="Contoh: HEMAT10" /><button type="button" onClick={applyPromo} disabled={loadingStore || !cart.length || !promoCode}>Pakai</button></div></label>{promo && <p className="muted">{promo.name}: -{rupiah(discount)} <button type="button" onClick={() => setPromo(null)}>Hapus</button></p>}<div className="total"><span>Subtotal</span><strong>{rupiah(subtotal)}</strong></div>{promo && <div className="total"><span>Diskon</span><strong>-{rupiah(discount)}</strong></div>}<div className="total"><span>Total</span><strong>{rupiah(total)}</strong></div><fieldset className="payment-methods"><legend>Metode pembayaran</legend>{[['cash', 'Tunai'], ['qris', 'QRIS'], ['debit', 'Debit'], ['transfer', 'Transfer']].map(([value, label]) => <button type="button" className={paymentMethod === value ? 'payment-option selected' : 'payment-option'} key={value} onClick={() => setPaymentMethod(value)} aria-pressed={paymentMethod === value}>{label}</button>)}</fieldset>{paymentMethod === 'cash' ? <label>Tunai diterima<input type="number" min="0" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="0" /></label> : <p>Pembayaran {paymentMethod.toUpperCase()}: <strong>{rupiah(total)}</strong></p>}<p>Kembalian: <strong>{rupiah(change)}</strong></p><button disabled={loadingStore || submitting || !cart.length} onClick={checkout}>{submitting ? 'Memproses…' : `Bayar ${paymentMethod === 'cash' ? 'Tunai' : paymentMethod.toUpperCase()}`}</button>{message && <p className="message" role="status">{message}</p>}</aside>
        </section>
      </div>
      {variantProduct && <div className="pos-variant-modal-backdrop" role="presentation" onMouseDown={() => setVariantProduct(null)}><section className="pos-variant-modal" role="dialog" aria-modal="true" aria-labelledby="variant-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="pos-variant-heading"><div><strong id="variant-dialog-title">Pilih warna</strong><span>{variantProduct.name}</span></div><button type="button" onClick={() => setVariantProduct(null)} aria-label="Tutup pilihan warna"><X aria-hidden="true" size={16} /></button></div><div className="pos-variant-options">{variantProduct.variants?.map((variant) => <button type="button" key={variant.id} className={Number(variant.stock) <= 0 ? 'out-of-stock' : ''} onClick={() => addToCart(variantProduct, variant)}>{variant.photo_path ? <img src={mediaUrl(variant.photo_path)} alt="" /> : <span className="variant-color-dot" aria-hidden="true" />}<strong>{variant.color}</strong><small>{rupiah(variant.price == null ? variantProduct.price : variant.price)} · Stok {variant.stock}{Number(variant.stock) <= 0 ? ' (habis)' : ''}</small></button>)}</div></section></div>}
      {printPrompt && <div className="pos-variant-modal-backdrop" role="presentation" onMouseDown={() => finishPayment(false)}><section className="pos-print-modal" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="pos-variant-heading"><div><strong id="print-dialog-title">Transaksi berhasil</strong><span>{printPrompt.invoice_no}</span></div><button type="button" onClick={() => finishPayment(false)} aria-label="Tutup tanpa mencetak"><X aria-hidden="true" size={16} /></button></div><p>Transaksi sudah disimpan. Apakah struk ingin dicetak sekarang?</p><strong className="print-prompt-total">{rupiah(printPrompt.grand_total)}</strong><div className="print-prompt-actions"><button type="button" className="secondary" onClick={() => finishPayment(false)}>Tidak, selesai</button><button type="button" onClick={() => finishPayment(true)}>Cetak struk</button></div></section></div>}
    </div>
  );
}
