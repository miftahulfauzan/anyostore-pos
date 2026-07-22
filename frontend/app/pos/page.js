'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, LayoutDashboard, LogOut, ShoppingCart, Store as StoreIcon, X } from 'lucide-react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (amount) => `Rp${Number(amount || 0).toLocaleString('id-ID')}`;

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

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0), [cart]);
  const discount = Number(promo?.discount || 0);
  const total = Math.max(0, subtotal - discount);
  const amountPaid = paymentMethod === 'cash' ? Number(cash || 0) : total;
  const change = paymentMethod === 'cash' ? Math.max(0, amountPaid - total) : 0;
  const selectedStore = stores.find((store) => String(store.id) === String(storeId));

  async function loadStore(branchId) {
    setLoadingStore(true);
    try {
      const query = new URLSearchParams({ branch_id: String(branchId) });
      const [productsResponse, warehousesResponse] = await Promise.all([
        fetch(`${apiUrl}/products?limit=500&${query}`, { headers: headers() }),
        fetch(`${apiUrl}/inventory/warehouses?${query}`, { headers: headers() })
      ]);
      const productsBody = await productsResponse.json();
      const warehousesBody = await warehousesResponse.json();
      if (!productsResponse.ok || !warehousesResponse.ok) throw new Error(productsBody.message || warehousesBody.message || 'Gagal memuat data toko');
      setProducts(productsBody.data || []);
      setWarehouses(warehousesBody.data || []);
      setWarehouseId(warehousesBody.data?.[0] ? String(warehousesBody.data[0].id) : '');
    } finally { setLoadingStore(false); }
  }

  async function changeStore(event) {
    const nextId = event.target.value;
    if (!nextId || nextId === storeId) return;
    const nextStore = stores.find((store) => String(store.id) === nextId);
    setCart([]); setPromo(null); setPromoCode(''); setCash(''); setVariantProduct(null);
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
    setCart((current) => {
      const found = current.find((item) => item.cart_id === cartId);
      if (found) return current.map((item) => item.cart_id === cartId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...product, cart_id: cartId, variant_id: variant?.id || null, variant_color: variant?.color || '', price, quantity: 1 }];
    });
    setVariantProduct(null);
  }
  function quantity(cartId, next) { setCart((current) => current.flatMap((item) => item.cart_id === cartId ? (next > 0 ? [{ ...item, quantity: next }] : []) : [item])); }
  async function applyPromo() { try { const response = await fetch(`${apiUrl}/promotions/validate`, { method: 'POST', headers: headers(), body: JSON.stringify({ branch_id: Number(storeId), code: promoCode, subtotal }) }); const body = await response.json(); if (!response.ok) throw new Error(body.message); setPromo(body.data); setMessage(`Promo ${body.data.code} diterapkan: -${rupiah(body.data.discount)}`); } catch (error) { setPromo(null); setMessage(error.message); } }
  async function checkout() {
    if (!storeId || !warehouseId || !cart.length) return setMessage('Pilih toko, gudang, dan tambahkan produk ke keranjang.');
    setSubmitting(true); setMessage('');
    try {
      const response = await fetch(`${apiUrl}/transactions`, { method: 'POST', headers: headers(), body: JSON.stringify({ branch_id: Number(storeId), warehouse_id: Number(warehouseId), items: cart.map((item) => ({ product_id: item.id, variant_id: item.variant_id || undefined, quantity: item.quantity })), payment_method: paymentMethod, amount_paid: amountPaid, promo_code: promo?.code || undefined }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Transaksi gagal');
      setCart([]); setCash(''); setPromoCode(''); setPromo(null); setPaymentMethod('cash'); setMobileCartOpen(false);
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
        <aside className="panel cart"><div className="cart-mobile-header"><h2>Keranjang</h2><button type="button" className="cart-mobile-close" onClick={() => setMobileCartOpen(false)} aria-label="Tutup panel keranjang">×</button></div>{cart.length ? <div className="cart-lines">{cart.map((item) => <article key={item.cart_id}><div><strong>{item.name}</strong><span>{item.variant_color ? `${item.variant_color} · ` : ''}{rupiah(item.price)}</span></div><div className="quantity"><button onClick={() => quantity(item.cart_id, item.quantity - 1)}>−</button><span>{item.quantity}</span><button onClick={() => quantity(item.cart_id, item.quantity + 1)}>+</button></div><strong>{rupiah(item.price * item.quantity)}</strong></article>)}</div> : <p>Keranjang masih kosong.</p>}<label>Kode promo<div className="promo-entry"><input value={promoCode} onChange={(event) => setPromoCode(event.target.value.toUpperCase())} placeholder="Contoh: HEMAT10" /><button type="button" onClick={applyPromo} disabled={loadingStore || !cart.length || !promoCode}>Pakai</button></div></label>{promo && <p className="muted">{promo.name}: -{rupiah(discount)} <button type="button" onClick={() => setPromo(null)}>Hapus</button></p>}<div className="total"><span>Subtotal</span><strong>{rupiah(subtotal)}</strong></div>{promo && <div className="total"><span>Diskon</span><strong>-{rupiah(discount)}</strong></div>}<div className="total"><span>Total</span><strong>{rupiah(total)}</strong></div><fieldset className="payment-methods"><legend>Metode pembayaran</legend>{[['cash', 'Tunai'], ['qris', 'QRIS'], ['debit', 'Debit'], ['transfer', 'Transfer']].map(([value, label]) => <button type="button" className={paymentMethod === value ? 'payment-option selected' : 'payment-option'} key={value} onClick={() => setPaymentMethod(value)} aria-pressed={paymentMethod === value}>{label}</button>)}</fieldset>{paymentMethod === 'cash' ? <label>Tunai diterima<input type="number" min="0" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="0" /></label> : <p>Pembayaran {paymentMethod.toUpperCase()}: <strong>{rupiah(total)}</strong></p>}<p>Kembalian: <strong>{rupiah(change)}</strong></p><button disabled={loadingStore || submitting || !cart.length} onClick={checkout}>{submitting ? 'Memproses…' : `Bayar ${paymentMethod === 'cash' ? 'Tunai' : paymentMethod.toUpperCase()}`}</button>{message && <p className="message" role="status">{message}</p>}</aside>
        </section>
      </div>
      {variantProduct && <div className="pos-variant-modal-backdrop" role="presentation" onMouseDown={() => setVariantProduct(null)}><section className="pos-variant-modal" role="dialog" aria-modal="true" aria-labelledby="variant-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="pos-variant-heading"><div><strong id="variant-dialog-title">Pilih warna</strong><span>{variantProduct.name}</span></div><button type="button" onClick={() => setVariantProduct(null)} aria-label="Tutup pilihan warna"><X aria-hidden="true" size={16} /></button></div><div className="pos-variant-options">{variantProduct.variants?.map((variant) => <button type="button" key={variant.id} className={Number(variant.stock) <= 0 ? 'out-of-stock' : ''} onClick={() => addToCart(variantProduct, variant)}>{variant.photo_path ? <img src={mediaUrl(variant.photo_path)} alt="" /> : <span className="variant-color-dot" aria-hidden="true" />}<strong>{variant.color}</strong><small>{rupiah(variant.price == null ? variantProduct.price : variant.price)} · Stok {variant.stock}{Number(variant.stock) <= 0 ? ' (habis)' : ''}</small></button>)}</div></section></div>}
      {printPrompt && <div className="pos-variant-modal-backdrop" role="presentation" onMouseDown={() => finishPayment(false)}><section className="pos-print-modal" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="pos-variant-heading"><div><strong id="print-dialog-title">Transaksi berhasil</strong><span>{printPrompt.invoice_no}</span></div><button type="button" onClick={() => finishPayment(false)} aria-label="Tutup tanpa mencetak"><X aria-hidden="true" size={16} /></button></div><p>Transaksi sudah disimpan. Apakah struk ingin dicetak sekarang?</p><strong className="print-prompt-total">{rupiah(printPrompt.grand_total)}</strong><div className="print-prompt-actions"><button type="button" className="secondary" onClick={() => finishPayment(false)}>Tidak, selesai</button><button type="button" onClick={() => finishPayment(true)}>Cetak struk</button></div></section></div>}
    </div>
  );
}
