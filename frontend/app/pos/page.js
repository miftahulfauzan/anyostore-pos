'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, ChevronDown, Edit3, FileText, LayoutDashboard, LogOut, MoreVertical, PauseCircle, Share2, ShoppingCart, StickyNote, Tag, Trash2, UserRound, X } from 'lucide-react';
import { useAppSession, useUnsavedWork } from '../components/AppStateProvider';
import BranchSwitcher from '../components/BranchSwitcher';
import { createRequestSequence } from '../components/app-state.cjs';
import { localDateString } from '../lib/local-date';
import { defaultPaymentMethod } from '../lib/payment-defaults';
import { defaultCartQuantity } from './cart-defaults.cjs';
import { shareInvoiceImage, storePhones, instagramFor, customerTierLabel, invoiceDate, storeLogoUrl } from '../lib/invoice-image';

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const rupiah = (amount) => `Rp${Number(amount || 0).toLocaleString('id-ID')}`;

export default function PosPage() {
  const router = useRouter();
  const { user, activeBranchId, requestActiveBranchChange } = useAppSession();
  const [products, setProducts] = useState([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [cart, setCart] = useState([]);
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState(['cash']);
  const [dualPayment, setDualPayment] = useState(false);
  const [cash, setCash] = useState('');
  const [paymentAmounts, setPaymentAmounts] = useState({});
  const [paymentSheetOpen, setPaymentSheetOpen] = useState(false);
  const [compactViewport, setCompactViewport] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [manualDiscount, setManualDiscount] = useState('');
  const [preview, setPreview] = useState(null);
  const [printPrompt, setPrintPrompt] = useState(null);
  const [loadingStore, setLoadingStore] = useState(true);
  const [storesLoaded, setStoresLoaded] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [showCartActions, setShowCartActions] = useState(false);
  const [showCartOptions, setShowCartOptions] = useState(false);
  const [notes, setNotes] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsError, setDraftsError] = useState('');
  const [priceEditItem, setPriceEditItem] = useState(null);
  const [priceEditValue, setPriceEditValue] = useState('');
  const [openItemMenuId, setOpenItemMenuId] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [sharingInvoice, setSharingInvoice] = useState(false);
  const [priceTier, setPriceTier] = useState('retail');
  const [transactionDate, setTransactionDate] = useState('');
  const [search, setSearch] = useState('');
  const headers = () => ({ 'Content-Type': 'application/json'});
  const mediaUrl = (photoPath) => photoPath ? `${apiUrl.replace('/api', '')}${photoPath}` : '';
  const pendingTransactionId = useRef(null);
  const storeLoadSequence = useRef(createRequestSequence());
  const productSearchSequence = useRef(createRequestSequence());
  const customerSearchSequence = useRef(createRequestSequence());
  useUnsavedWork('pos-cart', cart.length > 0 || Boolean(notes.trim()));
  const newClientTransactionId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

  useEffect(() => {
    /* sesi via httpOnly cookie */
    fetch(`${apiUrl}/settings/branches`, { headers: headers() })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Gagal memuat daftar toko');
        const availableStores = (body.data || []).filter((store) => store.is_active !== false && store.type !== 'gudang');
        setStores(availableStores);
        setStoresLoaded(true);
      }).catch((error) => { setMessage(error.message); setLoadingStore(false); });
  }, []);

  // Metode pembayaran default mengikuti toko: BASIK -> Transfer, Blok B -> QRIS.
  useEffect(() => {
    if (!storeId) return;
    const store = stores.find((item) => String(item.id) === String(storeId));
    if (!store) return;
    setSelectedPaymentMethods([defaultPaymentMethod(store.name, store.address)]);
    setDualPayment(false);
    setCash('');
    setPaymentAmounts({});
  }, [storeId, stores]);

  useEffect(() => {
    if (!storesLoaded) return;
    storeLoadSequence.current.next();
    const selected = activeBranchId && activeBranchId !== 'all'
      ? stores.find((store) => String(store.id) === String(activeBranchId))
      : null;
    if (!selected) {
      setTransactionDate(localDateString());
      setStoreId('');
      setProducts([]);
      setProductsTotal(0);
      setProductsLoading(false);
      setProductPage(1);
      setWarehouses([]);
      setWarehouseId('');
      setCustomers([]);
      setSelectedCustomer(null);
      setCustomerSearch('');
      setCustomersLoading(false);
      setCart([]);
      setSelectedPaymentMethods(['cash']);
      setDualPayment(false);
      setPaymentAmounts({});
      setPaymentSheetOpen(false);
      setCash('');
      setManualDiscount('');
      setCustomerId('');
      setNotes('');
      setShowCartActions(false);
      setShowCartOptions(false);
      setLoadingStore(false);
      setMessage(activeBranchId === 'all' ? 'Pilih satu toko dari pemilih di header untuk memulai transaksi POS.' : 'Toko aktif tidak tersedia untuk POS. Pilih toko, bukan gudang.');
      return;
    }
    setCart([]);
    setSearch('');
    setTransactionDate(localDateString());
    setManualDiscount('');
    setNotes('');
    setShowCartActions(false);
    setShowCartOptions(false);
    setSelectedPaymentMethods([defaultPaymentMethod(activeStore?.name, activeStore?.address)]);
    setDualPayment(false);
    setCash('');
    setPaymentAmounts({});
    setPaymentSheetOpen(false);
    setCustomerId('');
    setSelectedCustomer(null);
    setCustomerSearch('');
    setPriceTier('retail');
    pendingTransactionId.current = null;
    setStoreId(String(selected.id));
    setProducts([]);
    setProductsTotal(0);
    setProductPage(1);
    try { localStorage.setItem('pos_branch_id', String(selected.id)); } catch { /* Compatibility preference only. */ }
    loadStore(selected.id);
  }, [storesLoaded, stores, activeBranchId]);
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

  useEffect(() => {
    const updateViewport = () => setCompactViewport(window.matchMedia('(max-width: 820px)').matches);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (!paymentSheetOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setPaymentSheetOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [paymentSheetOpen]);

  useEffect(() => {
    if (!draftsOpen && !priceEditItem && !openItemMenuId) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      if (priceEditItem) setPriceEditItem(null);
      else if (draftsOpen) setDraftsOpen(false);
      else setOpenItemMenuId(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [draftsOpen, priceEditItem, openItemMenuId]);

  useEffect(() => {
    if (!cart.length) setManualDiscount('');
  }, [cart.length]);

  // Preview harga dari server: tier pelanggan dan harga grosir
  // dihitung dengan logika yang sama persis dengan checkout, jadi harga yang
  // tampil = harga yang akan tersimpan (tidak ada duplikasi aturan di klien).
  useEffect(() => {
    if (!cart.length || !storeId) { setPreview(null); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const items = cart.map((item) => ({ product_id: item.id, variant_id: item.variant_id || undefined, quantity: item.quantity, price_override: item.price_override || undefined }));
        const response = await fetch(`${apiUrl}/transactions/preview`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ branch_id: Number(storeId), customer_id: customerId ? Number(customerId) : undefined, items }),
        });
        const body = await response.json();
        if (!cancelled) setPreview(response.ok ? body.data : null);
      } catch {
        if (!cancelled) setPreview(null);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cart, storeId, customerId]);

  const selectedStore = stores.find((store) => String(store.id) === String(storeId));
  const filteredProducts = products;
  const customerOptions = selectedCustomer && !customers.some((customer) => String(customer.id) === String(selectedCustomer.id))
    ? [selectedCustomer, ...customers]
    : customers;

  useEffect(() => {
    if (!storeId || loadingStore) return undefined;
    const requestId = productSearchSequence.current.next();
    const queryText = search.trim();
    setProductsLoading(true);
    setProducts([]);
    setProductsTotal(0);
    setProductPage(1);
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({ branch_id: String(storeId), limit: '60', page: '1', include_wholesale: '1' });
        if (queryText) query.set('search', queryText);
        const response = await fetch(`${apiUrl}/products?${query}`, { headers: headers() });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Produk gagal dimuat');
        if (!productSearchSequence.current.isCurrent(requestId)) return;
        setProducts(body.data || []);
        setProductsTotal(Number(body.total) || 0);
      } catch (error) {
        if (productSearchSequence.current.isCurrent(requestId)) setMessage(error.message);
      } finally {
        if (productSearchSequence.current.isCurrent(requestId)) setProductsLoading(false);
      }
    }, queryText ? 250 : 0);
    return () => {
      clearTimeout(timer);
      productSearchSequence.current.next();
    };
  }, [storeId, loadingStore, search]);

  useEffect(() => {
    if (!storeId || loadingStore) return undefined;
    const requestId = customerSearchSequence.current.next();
    const queryText = customerSearch.trim();
    const controller = new AbortController();
    setCustomersLoading(true);
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({ branch_id: String(storeId), limit: '50' });
        if (queryText) query.set('search', queryText);
        const response = await fetch(`${apiUrl}/customers?${query}`, { headers: headers(), signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || 'Pelanggan gagal dimuat');
        if (customerSearchSequence.current.isCurrent(requestId)) setCustomers(Array.isArray(body.data) ? body.data : []);
      } catch (error) {
        if (customerSearchSequence.current.isCurrent(requestId) && error.name !== 'AbortError') setMessage(error.message);
      } finally {
        if (customerSearchSequence.current.isCurrent(requestId)) setCustomersLoading(false);
      }
    }, queryText ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
      customerSearchSequence.current.next();
    };
  }, [storeId, loadingStore, customerSearch]);

  async function loadStore(branchId) {
    const requestId = storeLoadSequence.current.next();
    setLoadingStore(true);
    setProductsLoading(false);
    try {
      const query = new URLSearchParams({ branch_id: String(branchId) });
      setProducts([]);
      setProductsTotal(0);
      setProductPage(1);
      setCustomers([]);
      setCustomersLoading(false);
      const warehousesResponse = await fetch(`${apiUrl}/inventory/warehouses?${query}`, { headers: headers() });
      const warehousesBody = await warehousesResponse.json();
      if (!warehousesResponse.ok) throw new Error(warehousesBody.message || 'Gagal memuat data toko');
      if (!storeLoadSequence.current.isCurrent(requestId)) return false;
      setWarehouses(warehousesBody.data || []);
      setWarehouseId(warehousesBody.data?.[0] ? String(warehousesBody.data[0].id) : '');
      setMessage('');
      return true;
    } catch (error) {
      if (storeLoadSequence.current.isCurrent(requestId)) setMessage(error.message);
      return false;
    } finally {
      if (storeLoadSequence.current.isCurrent(requestId)) setLoadingStore(false);
    }
  }

  async function loadMoreProducts() {
    if (productsLoading || loadingStore || products.length >= productsTotal) return;
    const requestId = productSearchSequence.current.next();
    const nextPage = productPage + 1;
    setProductsLoading(true);
    try {
      const query = new URLSearchParams({ branch_id: String(storeId), limit: '60', page: String(nextPage), include_wholesale: '1' });
      if (search.trim()) query.set('search', search.trim());
      const response = await fetch(`${apiUrl}/products?${query}`, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Produk berikutnya gagal dimuat');
      if (!productSearchSequence.current.isCurrent(requestId)) return;
      setProducts((current) => [...current, ...(body.data || [])]);
      setProductsTotal(Number(body.total) || 0);
      setProductPage(nextPage);
    } catch (error) {
      if (productSearchSequence.current.isCurrent(requestId)) setMessage(error.message);
    } finally {
      if (productSearchSequence.current.isCurrent(requestId)) setProductsLoading(false);
    }
  }

  async function changeStore(event) {
    const nextId = event.target.value;
    if (!nextId || nextId === storeId) return;
    if (user?.role === 'owner') requestActiveBranchChange(nextId);
    else {
      const nextStore = stores.find((store) => String(store.id) === nextId);
      setCustomerId('');
      setSelectedCustomer(null);
      setCustomerSearch('');
      setPriceTier('retail');
      try {
        const loaded = await loadStore(nextId);
        if (!loaded) return;
        setStoreId(nextId);
        setMessage(`POS aktif untuk ${nextStore?.name || 'toko terpilih'}.`);
      } catch (error) { setMessage(error.message); }
    }
  }

  function addToCart(product) {
    // POS menjual produk, bukan varian: warna tidak dipilih di kasir.
    const cartId = String(product.id);
    const price = product.price;
    const wholesalePrices = product.wholesale_prices || [];
    setCart((current) => {
      const found = current.find((item) => item.cart_id === cartId);
      if (found) return current.map((item) => item.cart_id === cartId ? { ...item, quantity: item.quantity + 1 } : item);
      return [...current, { ...product, cart_id: cartId, variant_id: null, variant_color: '', price, quantity: defaultCartQuantity(selectedStore?.name), wholesale_prices: wholesalePrices, stock_available: Number(product.stock ?? 0) }];
    });
  }
  function quantity(cartId, next) { setCart((current) => current.flatMap((item) => item.cart_id === cartId ? (next > 0 ? [{ ...item, quantity: next }] : []) : [item])); }
  function changeCustomer(event) {
    const nextId = event.target.value;
    setCustomerId(nextId);
    const selected = customerOptions.find((c) => String(c.id) === nextId) || null;
    setSelectedCustomer(selected);
    const tier = selected?.price_tier === 'semi_grosir' ? 'semi_grosir' : selected?.price_tier === 'grosir_seri' ? 'grosir_seri' : 'retail';
    setPriceTier(tiersEnabled ? tier : 'retail');
  }
  async function openDrafts() {
    if (!storeId) return setMessage('Pilih toko terlebih dahulu untuk melihat Draft.');
    setDraftsOpen(true);
    setDraftsLoading(true);
    setDraftsError('');
    try {
      const response = await fetch(`${apiUrl}/transactions/pending?branch_id=${encodeURIComponent(storeId)}`, { headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Draft tidak dapat dimuat');
      setDrafts(body.data || []);
    } catch (error) {
      setDraftsError(error.message);
    } finally {
      setDraftsLoading(false);
    }
  }
  async function resumeDraft(draftId) {
    if (cart.length && !window.confirm('Keranjang saat ini akan diganti dengan Draft yang dipilih. Lanjutkan?')) return;
    setDraftsLoading(true);
    setDraftsError('');
    try {
      const response = await fetch(`${apiUrl}/transactions/pending/${draftId}/resume?branch_id=${encodeURIComponent(storeId)}`, { method: 'POST', headers: headers() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Draft tidak dapat dilanjutkan');
      const resumed = body.data || {};
      const resumedItems = Array.isArray(resumed.items) ? resumed.items : [];
      setCart(resumedItems.map((raw) => {
        const product = products.find((item) => Number(item.id) === Number(raw.product_id)) || {};
        const variantId = raw.variant_id == null ? null : Number(raw.variant_id);
        const price = Number(raw.price ?? raw.price_override ?? product.price ?? 0);
        return {
          ...product,
          id: Number(raw.product_id),
          cart_id: `${raw.product_id}:${variantId || 'utama'}`,
          variant_id: variantId,
          variant_color: raw.variant_label || raw.variant_color || '',
          price,
          price_override: raw.price_override == null ? undefined : Number(raw.price_override),
          quantity: Math.max(1, Number(raw.quantity) || 1),
          stock_available: Number(raw.stock_available ?? product.stock ?? 0),
          photo_path: raw.photo || product.photo_path || '',
        };
      }));
      setCustomerId(resumed.customer_id == null ? '' : String(resumed.customer_id));
      setManualDiscount(resumed.discount_value ? String(resumed.discount_value) : '');
      setNotes(resumed.notes || '');
      setPreview(null);
      setDraftsOpen(false);
      setMobileCartOpen(true);
      setMessage('Draft dimuat ke keranjang.');
    } catch (error) {
      setDraftsError(error.message);
    } finally {
      setDraftsLoading(false);
    }
  }
  async function holdCart() {
    if (!cart.length || !storeId) return;
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`${apiUrl}/transactions/hold`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          branch_id: Number(storeId),
          customer_id: customerId ? Number(customerId) : null,
          items: cart.map((item) => ({
            product_id: item.id,
            variant_id: item.variant_id || undefined,
            quantity: item.quantity,
            price: cartPrice(item),
            price_override: item.price_override || undefined,
            name: item.name,
            variant_label: item.variant_color || undefined,
            photo: item.photo_path || undefined,
          })),
          subtotal,
          discount_type: discount > 0 ? 'nominal' : 'none',
          discount_value: discount,
          notes: notes.trim() || undefined,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Draft tidak dapat disimpan');
      setCart([]);
      setPreview(null);
      setManualDiscount('');
      setCustomerId('');
      setNotes('');
      setShowCartActions(false);
      setShowCartOptions(false);
      setMobileCartOpen(false);
      setMessage('Draft disimpan. Bisa dilanjutkan kapan saja.');
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }
  function openPriceEditor(item) {
    setPriceEditItem(item);
    setPriceEditValue(String(Math.round(cartPrice(item))));
  }
  function savePriceEditor() {
    const nextPrice = Number(priceEditValue);
    if (!priceEditItem || !Number.isFinite(nextPrice) || nextPrice < 0) return;
    setPriceOverride(priceEditItem.cart_id, String(Math.round(nextPrice)));
    setPriceEditItem(null);
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
  const tiersEnabled = selectedStore?.pricing_tier_enabled == null || Boolean(Number(selectedStore.pricing_tier_enabled));
  // Harga final dari preview server; fallback sementara: harga dasar produk
  // (atau override manual) selama preview belum selesai dihitung.
  const cartPrice = (item) => {
    const line = (preview?.lines || []).find((l) => Number(l.product_id) === item.id && (l.variant_id || null) === (item.variant_id || null));
    return line ? Number(line.price) : Number(item.price_override ?? item.price);
  };
  const cartSubtotal = (item) => cartPrice(item) * item.quantity;
  const subtotal = Number(preview?.subtotal ?? cart.reduce((sum, item) => sum + cartSubtotal(item), 0));
  const effectiveTier = preview?.price_tier || 'retail';
  const requestedDiscount = Math.max(0, Number(manualDiscount) || 0);
  const discountExceedsSubtotal = cart.length > 0 && requestedDiscount > subtotal;
  const discount = discountExceedsSubtotal ? 0 : requestedDiscount;
  const total = Math.max(0, subtotal - discount);
  const activeStore = stores.find((store) => String(store.id) === String(storeId));
  const storeDefaultMethod = defaultPaymentMethod(activeStore?.name, activeStore?.address);
  const isSplitPayment = dualPayment && selectedPaymentMethods.length > 1;
  const paymentMethod = isSplitPayment ? 'split' : selectedPaymentMethods[0] || 'cash';
  const splitTotal = selectedPaymentMethods.reduce((sum, method) => sum + (Number(paymentAmounts[method]) || 0), 0);
  const splitAmountsValid = isSplitPayment
    && selectedPaymentMethods.every((method) => /^\d+$/.test(paymentAmounts[method] || '') && Number.isSafeInteger(Number(paymentAmounts[method])) && Number(paymentAmounts[method]) > 0);
  const splitPaymentsValid = splitAmountsValid && splitTotal === total;
  const splitPaymentStatus = !splitAmountsValid ? 'Isi nominal untuk setiap metode.'
    : splitTotal === total ? `Total pembayaran pas: ${rupiah(splitTotal)}`
      : splitTotal < total ? `Kurang ${rupiah(total - splitTotal)} dari total ${rupiah(total)}`
        : `Kelebihan ${rupiah(splitTotal - total)} dari total ${rupiah(total)}`;
  const amountPaid = paymentMethod === 'cash' ? Number(cash || 0) : isSplitPayment ? splitTotal : total;
  const change = paymentMethod === 'cash' ? Math.max(0, amountPaid - total) : 0;
  function togglePaymentMethod(method) {
    if (!dualPayment) {
      // Tanpa mode bayar terpisah, menekan metode lain berarti PINDAH metode.
      setSelectedPaymentMethods([method]);
      setCash('');
      setPaymentAmounts({});
      return;
    }
    const nextMethods = selectedPaymentMethods.includes(method)
      ? selectedPaymentMethods.filter((selected) => selected !== method)
      : [...selectedPaymentMethods, method];
    if (!nextMethods.length) return;
    setSelectedPaymentMethods(nextMethods);
    setCash('');
    setPaymentAmounts((current) => {
      const nextAmounts = { ...current };
      if (selectedPaymentMethods.includes(method)) delete nextAmounts[method];
      else nextAmounts[method] = '';
      return nextAmounts;
    });
  }
  // Bagikan invoice gambar (tagihan) sebelum pembayaran. Nomor invoice
  // direservasi di server agar sama dengan nomor transaksi nanti.
  async function shareInvoiceDraft() {
    if (!cart.length || sharingInvoice) return;
    setSharingInvoice(true);
    setMessage('');
    try {
      if (!pendingTransactionId.current) pendingTransactionId.current = newClientTransactionId();
      const reservationResponse = await fetch(`${apiUrl}/transactions/invoice-preview`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          client_transaction_id: pendingTransactionId.current,
          branch_id: Number(storeId),
          ...(user?.role === 'owner' ? { transaction_date: transactionDate } : {}),
        }),
      });
      const reservationBody = await reservationResponse.json();
      if (!reservationResponse.ok) throw new Error(reservationBody.message || 'Nomor invoice gagal dibuat');
      const invoiceNo = reservationBody.data?.invoice_no;
      const settingsResponse = await fetch(`${apiUrl}/settings?branch_id=${Number(storeId)}`, { headers: headers() });
      const settingsBody = await settingsResponse.json();
      const settings = settingsResponse.ok ? (settingsBody.data || {}) : {};
      const store = stores.find((item) => String(item.id) === String(storeId)) || {};
      const storeName = String(settings.store_name || store.name || 'Anyostore').trim();
      let customer = customerOptions.find((item) => String(item.id) === String(customerId));
      // Ekspedisi/alamat pelanggan bisa baru diubah di CRM. Ambil ulang supaya
      // invoice yang dibagikan memakai data terbaru, bukan salinan saat POS dibuka.
      if (customerId) {
        try {
          const customerResponse = await fetch(`${apiUrl}/customers?limit=500&branch_id=${Number(storeId)}`, { headers: headers() });
          const customerBody = await customerResponse.json();
          const rows = customerResponse.ok && Array.isArray(customerBody.data) ? customerBody.data : [];
          const fresh = rows.find((item) => String(item.id) === String(customerId));
          if (fresh) customer = fresh;
        } catch (_) {
          // Offline: tetap pakai data pelanggan yang sudah dimuat.
        }
      }
      const result = await shareInvoiceImage({
        storeName,
        storeAddress: settings.store_address || store.address || '',
        phones: storePhones(settings).length ? storePhones(settings) : [store.phone].filter(Boolean),
        instagram: instagramFor(storeName),
        logoUrl: storeLogoUrl(settings, apiUrl),
        invoiceNo,
        dateText: invoiceDate(new Date()),
        cashier: user?.name || '-',
        customerLabel: customer ? `${customer.name} · ${customerTierLabel(customer.price_tier)}` : 'Umum',
        customerName: customer?.name || '',
        customerPhone: customer?.phone || '',
        customerAddress: customer?.address || '',
        expedition: customer?.expedition || '',
        items: cart.map((item) => ({
          name: item.name,
          variant: item.variant_label || '',
          qty: item.quantity,
          price: item.price_override ?? item.price,
          subtotal: (item.price_override ?? item.price) * item.quantity,
        })),
        subtotal,
        discount,
        total,
        notes: notes.trim(),
      });
      if (result === 'downloaded') setMessage('Browser tidak mendukung berbagi file. Gambar invoice sudah diunduh.');
    } catch (error) {
      setMessage(error.message || 'Gagal membagikan invoice');
    } finally {
      setSharingInvoice(false);
    }
  }

  function openPaymentFlow() {
    if (!compactViewport) return checkout();
    if (!cart.length) return setMessage('Tambahkan produk ke keranjang terlebih dahulu.');
    if (!cash) setCash(String(Math.ceil(total)));
    setMessage('');
    setPaymentSheetOpen(true);
  }
  function toggleCartActions() {
    const next = !showCartActions;
    setShowCartActions(next);
    setShowCartOptions(next);
  }
  async function checkout() {
    if (!storeId || !warehouseId || !cart.length) return setMessage('Pilih toko, gudang, dan tambahkan produk ke keranjang.');
    if (user?.role === 'owner' && !transactionDate) return setMessage('Pilih tanggal transaksi.');
    if (discountExceedsSubtotal) return setMessage('Diskon tidak boleh melebihi subtotal.');
    if (isSplitPayment && !splitPaymentsValid) return setMessage('Jumlah nominal metode pembayaran harus sama dengan total tagihan.');
    setSubmitting(true); setMessage('');
    try {
      const items = cart.map((item) => ({ product_id: item.id, variant_id: item.variant_id || undefined, quantity: item.quantity, price_override: item.price_override || undefined }));
      if (!pendingTransactionId.current) pendingTransactionId.current = newClientTransactionId();
      // Warning stok kurang/kosong: kasir memilih Lanjutkan atau Kembali.
      const lowStock = cart.filter((item) => Number(item.stock_available ?? 0) < Number(item.quantity));
      if (lowStock.length) {
        // Aturan toko: bila transaksi melebihi stok tidak diizinkan, hentikan
        // sebelum meminta konfirmasi kasir.
        const settingsResponse = await fetch(`${apiUrl}/settings?branch_id=${Number(storeId)}`, { headers: headers() });
        const settingsBody = settingsResponse.ok ? await settingsResponse.json() : {};
        const allowOversell = String(settingsBody?.data?.allow_negative_stock ?? 'true').toLowerCase() !== 'false';
        if (!allowOversell) {
          const firstLow = lowStock[0];
          const lowLabel = `${firstLow.name}${firstLow.variant_color ? ` (${firstLow.variant_color})` : ''}`;
          setMessage(`Stok ${lowLabel} kurang (tersedia ${Number(firstLow.stock_available ?? 0)}, diminta ${firstLow.quantity}). Toko ini tidak mengizinkan transaksi melebihi stok.`);
          return;
        }
        const first = lowStock[0];
        const label = `${first.name}${first.variant_color ? ` (${first.variant_color})` : ''}`;
        const extra = lowStock.length > 1 ? ` (total ${lowStock.length} produk kurang)` : '';
        const proceed = window.confirm(`Stok ${label} kurang. Tersedia ${Number(first.stock_available ?? 0)}, diminta ${first.quantity}${extra}. Lanjutkan transaksi?`);
        if (!proceed) return;
      }
      const bodyPayload = { branch_id: Number(storeId), warehouse_id: Number(warehouseId), items, payment_method: paymentMethod, amount_paid: amountPaid, discount_type: discount > 0 ? 'nominal' : 'none', discount_value: discount, client_transaction_id: pendingTransactionId.current, allow_negative_stock: lowStock.length > 0 };
      if (isSplitPayment) bodyPayload.payments = selectedPaymentMethods.map((method) => ({ payment_method: method, amount: Number(paymentAmounts[method]) }));
      if (user?.role === 'owner') bodyPayload.transaction_date = transactionDate;
      if (customerId) bodyPayload.customer_id = Number(customerId);
      if (notes.trim()) bodyPayload.notes = notes.trim();
      let response = await fetch(`${apiUrl}/transactions`, { method: 'POST', headers: headers(), body: JSON.stringify(bodyPayload) });
      let body = await response.json();
      if (!response.ok && /tidak mencukupi/i.test(body.message || '')) {
        const settingsRes = await fetch(`${apiUrl}/settings?branch_id=${Number(storeId)}`, { headers: headers() });
        const settingsBody = settingsRes.ok ? await settingsRes.json() : {};
        const storeAllows = String(settingsBody?.data?.allow_negative_stock ?? 'true').toLowerCase() !== 'false';
        if (storeAllows && window.confirm(`${body.message}. Lanjutkan transaksi dengan stok minus?`)) {
          bodyPayload.allow_negative_stock = true;
          response = await fetch(`${apiUrl}/transactions`, { method: 'POST', headers: headers(), body: JSON.stringify(bodyPayload) });
          body = await response.json();
        }
      }
      if (!response.ok) throw new Error(body.message || 'Transaksi gagal');
      setCart([]); setCash(''); setManualDiscount(''); setSelectedPaymentMethods(['cash']); setPaymentAmounts({}); setPaymentSheetOpen(false); setMobileCartOpen(false); setCustomerId(''); setNotes(''); setShowCartActions(false); setShowCartOptions(false); setPriceTier('retail'); setTransactionDate(localDateString());
      pendingTransactionId.current = null;
      setPrintPrompt(body.data);
      loadStore(storeId).catch(() => setMessage('Transaksi berhasil, tetapi stok terbaru belum dapat dimuat. Muat ulang halaman untuk memperbarui stok.'));
  } catch (error) { setMessage(error.message); } finally { setSubmitting(false); }
  }
  function finishPayment(printReceipt) {
    const completed = printPrompt;
    setPrintPrompt(null);
    if (!completed) return;
    if (printReceipt) {
      router.push('/receipt/' + completed.id + '?print=1');
      return;
    }
    setMessage('Berhasil: ' + completed.invoice_no + '. Kembalian ' + rupiah(completed.change) + '.');
  }
  function logout() {
    localStorage.removeItem('pos_access_token');
    localStorage.removeItem('pos_refresh_token');
    router.replace('/');
  }

  function renderPaymentControls(className) {
    return <div className={className}>
      <fieldset className="payment-methods">
        <legend>Metode pembayaran</legend>
        <small className="payment-method-hint">{dualPayment ? 'Pilih 2 metode atau lebih, lalu isi nominalnya.' : 'Tekan Bayar terpisah bila ingin membagi ke dua metode.'}</small>
        { [['cash', 'Tunai'], ['qris', 'QRIS'], ['debit', 'Debit'], ['transfer', 'Transfer']].map(([value, label]) => <button type="button" className={selectedPaymentMethods.includes(value) ? 'payment-option selected' : 'payment-option'} key={value} onClick={() => togglePaymentMethod(value)} aria-pressed={selectedPaymentMethods.includes(value)}>{label}</button>)}
        <button type="button" className={`payment-option payment-dual${dualPayment ? ' selected' : ''}`} onClick={() => setDualPayment((current) => { const next = !current; if (!next) setSelectedPaymentMethods([selectedPaymentMethods[0] || storeDefaultMethod]); return next; })} aria-pressed={dualPayment}>Bayar terpisah</button>
      </fieldset>
      {isSplitPayment ? <div className="payment-breakdown" aria-label="Nominal per metode pembayaran"><div className="payment-breakdown-fields">{selectedPaymentMethods.map((method) => <label key={method} htmlFor={`payment-amount-${method}`}>{method === 'cash' ? 'Tunai' : method.toUpperCase()} (Rp)<input id={`payment-amount-${method}`} type="number" inputMode="numeric" min="1" step="1" value={paymentAmounts[method] || ''} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [method]: event.target.value }))} placeholder="0" disabled={submitting} /></label>)}</div><p className={`payment-breakdown-status${splitPaymentsValid ? ' is-valid' : ''}`} role="status" aria-live="polite">{splitPaymentStatus}</p></div> : paymentMethod === 'cash' ? <label>Tunai diterima<input type="number" min="0" value={cash} onChange={(event) => setCash(event.target.value)} placeholder="0" /></label> : <p>Pembayaran {paymentMethod.toUpperCase()}: <strong>{rupiah(total)}</strong></p>}
      {paymentMethod === 'cash' && <p>Kembalian: <strong>{rupiah(change)}</strong></p>}
    </div>;
  }

  return (
    <div className="pos-standalone">
      <header className="pos-standalone-header"><div className="pos-standalone-brand-wrap"><a className="pos-standalone-brand" href="/dashboard"><span>A</span><div><strong>Anyostore POS</strong><small>Kasir toko</small></div></a>{user?.role !== 'gudang' && <button type="button" className="pos-draft-button" onClick={openDrafts} aria-label="Buka Draft" title="Buka Draft"><FileText aria-hidden="true" size={18} /><span>Draft</span></button>}</div><nav><BranchSwitcher /><a href="/dashboard"><LayoutDashboard aria-hidden="true" size={15} /> Dasbor</a><a href="/history">Riwayat <ArrowUpRight aria-hidden="true" size={15} /></a><a href="/" target="_blank" rel="noopener noreferrer">Landing Page</a><button type="button" onClick={logout}><LogOut aria-hidden="true" size={15} /> Keluar</button></nav></header>
      <div className="pos-workspace">
        {/* Info toko hanya ditampilkan sekali di header (pemilih toko).
            Baris ini hanya dipakai role non-owner yang butuh memilih toko
            transaksi karena header tidak menampilkan pemilih toko. */}
        {user?.role !== 'owner' && (
          <section className="pos-store-bar" aria-label="Toko aktif untuk transaksi">
            <label htmlFor="pos-store-select"><span>Toko transaksi</span><select id="pos-store-select" value={storeId} onChange={changeStore} disabled={loadingStore || stores.length <= 1}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
          </section>
        )}
        <button type="button" className="mobile-cart-toggle" onClick={() => setMobileCartOpen(true)} aria-expanded={mobileCartOpen}>
          <ShoppingCart aria-hidden="true" size={19} />
          <span>Keranjang</span>
          <strong>{cart.reduce((sum, item) => sum + item.quantity, 0)} item · {rupiah(total)}</strong>
        </button>
        <button type="button" className={`pos-mobile-cart-backdrop ${mobileCartOpen ? 'visible' : ''}`} onClick={() => setMobileCartOpen(false)} aria-label="Tutup keranjang" tabIndex={mobileCartOpen ? 0 : -1} />
        <section className="pos-layout">
        <section className="panel catalog" aria-busy={loadingStore || productsLoading}>
          <div className="pos-catalog-toolbar">
            <div className="pos-catalog-title">
              <h2>Pilih Produk</h2>
              <span className="pos-catalog-count">{productsLoading ? 'Memuat…' : `${products.length}/${productsTotal} produk`}</span>
              <span className="pos-catalog-warehouse">
                <span aria-hidden="true">•</span>
                {loadingStore ? 'Memuat gudang…' : warehouses.find((warehouse) => String(warehouse.id) === String(warehouseId))?.name || 'Gudang belum tersedia'}
              </span>
            </div>
            <div className="pos-catalog-search">
              <input aria-label="Cari nama, SKU, atau barcode" placeholder="Cari nama/SKU/barcode" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button type="button" className="pos-pos-catalog-search-clear" onClick={() => setSearch('')} aria-label="Hapus pencarian">×</button>}
            </div>
          </div>
          <div className="catalog-grid">{filteredProducts.map((product) => { const availableStock = Number(product.stock || 0); return <button type="button" className="product-tile" key={product.id} onClick={() => addToCart(product)} disabled={loadingStore} aria-label={`${product.name}, ${rupiah(product.price)}, stok ${availableStock}`}>{product.photo_path ? <img src={mediaUrl(product.photo_path)} alt="" loading="lazy" /> : <span className="pos-photo-placeholder">Tanpa foto</span>}<strong>{product.name}</strong><span>{rupiah(product.price)}</span><small>Stok: {availableStock}</small></button>; })}{!filteredProducts.length && <p className="muted">{productsLoading ? 'Memuat produk…' : search.trim() ? `Tidak ada produk cocok "${search}"` : 'Belum ada produk'}</p>}</div>
          {products.length < productsTotal && <button type="button" className="pos-load-more secondary" onClick={loadMoreProducts} disabled={productsLoading || loadingStore}>{productsLoading ? 'Memuat produk…' : `Muat produk berikutnya (${productsTotal - products.length} tersisa)`}</button>}
        </section>
        <aside className={`panel cart ${mobileCartOpen ? 'mobile-cart-open' : ''}`}>
          <div className="cart-mobile-header">
            <button type="button" className="cart-back-button" onClick={() => setMobileCartOpen(false)} aria-label="Tutup keranjang"><ArrowLeft aria-hidden="true" size={21} /></button>
            <h2>Keranjang</h2>
            <button type="button" className="cart-actions-toggle" onClick={toggleCartActions} aria-label="Tampilkan aksi keranjang" aria-expanded={showCartActions}><MoreVertical aria-hidden="true" size={21} /></button>
          </div>
          <div className="pos-cart-scroll">
          {/* Pelanggan selalu terlihat; tidak lagi tersembunyi di panel Opsi. */}
          <div className="pos-customer-row">
            <label className="pos-customer-select">
              <span><UserRound aria-hidden="true" size={16} /> Pelanggan</span>
              <input type="search" aria-label="Cari pelanggan berdasarkan nama atau nomor telepon" placeholder="Cari nama / nomor telepon" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} disabled={loadingStore} />
              <select value={customerId} onChange={changeCustomer} disabled={loadingStore || customersLoading}>
                <option value="">{customersLoading ? 'Memuat pelanggan…' : customerOptions.length ? 'Umum (tanpa pelanggan)' : 'Belum ada pelanggan di toko ini'}</option>
                {customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} {customer.phone ? `(${customer.phone})` : ''}{tiersEnabled ? ` : ${tierLabel[customer.price_tier || 'retail']}` : ''}</option>)}
                {customerId && !customerOptions.some((customer) => String(customer.id) === String(customerId)) && <option value={customerId}>Pelanggan dari draft #{customerId}</option>}
              </select>
            </label>
            {['owner', 'manager', 'admin'].includes(user?.role) && <a className="pos-customer-add" href="/customers">Tambah</a>}
          </div>
          {cart.length > 0 && tiersEnabled && <div className="pos-tier-badge"><span className={`tier-badge ${effectiveTier}`}>{tierLabel[effectiveTier]}</span><small>{priceTier === 'retail' ? 'Harga mengikuti qty otomatis' : 'Harga mengikuti tipe pelanggan'}</small></div>}
          {cart.length ? <div className="cart-lines"><div className="cart-lines-header" aria-hidden="true"><span>Nama</span><span>Qty</span><span>Total</span><span /></div>{cart.map((item) => (
            <article key={item.cart_id}>
              <div className="cart-item-info">
                <strong>{item.name}</strong>
                <span>{rupiah(cartPrice(item))}{item.variant_color ? ` · ${item.variant_color}` : ''}</span>
              </div>
              <div className="quantity">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  enterKeyHint="done"
                  value={item.quantity}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    quantity(item.cart_id, Number.isSafeInteger(next) && next > 0 ? next : 1);
                  }}
                  onFocus={(event) => {
                    const input = event.currentTarget;
                    input.select();
                    window.requestAnimationFrame(() => {
                      input.scrollIntoView({ block: 'center', inline: 'nearest' });
                    });
                  }}
                  onBlur={(event) => {
                    const next = Number.parseInt(event.currentTarget.value, 10);
                    const normalized = Number.isSafeInteger(next) && next > 0 ? next : 1;
                    if (normalized !== item.quantity) quantity(item.cart_id, normalized);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    event.currentTarget.blur();
                  }}
                  aria-label={`Jumlah ${item.name}${item.variant_color ? ` ${item.variant_color}` : ''}`}
                />
              </div>
              <strong className="cart-line-total">{rupiah(cartSubtotal(item))}</strong>
              <div className="cart-line-actions">
                <button type="button" className="cart-line-menu" onClick={() => setOpenItemMenuId((current) => current === item.cart_id ? null : item.cart_id)} aria-label={`Opsi ${item.name}`} aria-expanded={openItemMenuId === item.cart_id}><MoreVertical aria-hidden="true" size={21} /></button>
                {openItemMenuId === item.cart_id && <div className="cart-line-menu-popover" role="menu">
                  <button type="button" role="menuitem" onClick={() => { openPriceEditor(item); setOpenItemMenuId(null); }}><Edit3 aria-hidden="true" size={17} /> Ubah harga</button>
                  <button type="button" role="menuitem" className="danger" onClick={() => { quantity(item.cart_id, 0); setOpenItemMenuId(null); }}><Trash2 aria-hidden="true" size={17} /> Hapus item</button>
                </div>}
              </div>
            </article>
              ))}</div> : <p className="cart-empty">Keranjang masih kosong.</p>}
              {user?.role === 'owner' && <label className="pos-cart-date pos-transaction-date"><span>Tanggal transaksi</span><input type="date" value={transactionDate} max={localDateString()} onChange={(event) => setTransactionDate(event.target.value)} disabled={loadingStore || submitting} /><small>Tanggal default hari ini.</small></label>}
          {showCartActions && <div className="pos-cart-actions" aria-label="Aksi keranjang">
            <button type="button" onClick={() => setShowCartOptions(true)}><Tag aria-hidden="true" size={18} /> Diskon</button>
            <button type="button" onClick={() => setShowCartOptions(true)}><StickyNote aria-hidden="true" size={18} /> Catatan</button>
            <button type="button" onClick={holdCart} disabled={!cart.length || submitting}><PauseCircle aria-hidden="true" size={18} /> Tahan</button>
            <button type="button" onClick={() => setShowCartOptions((current) => !current)}><ChevronDown aria-hidden="true" size={18} /> Lainnya</button>
          </div>}
          {showCartOptions && <section className="pos-cart-options" aria-label="Opsi transaksi">
            <label className="pos-discount-field" htmlFor="pos-manual-discount"><span>Diskon (Rp)</span><span className="pos-discount-input"><span aria-hidden="true">Rp</span><input id="pos-manual-discount" type="number" inputMode="numeric" min="0" step="1" max={Math.floor(subtotal)} value={manualDiscount} onChange={(event) => { const value = event.target.value; if (value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0)) setManualDiscount(value); }} placeholder="0" disabled={loadingStore || !cart.length} aria-describedby={discountExceedsSubtotal ? 'pos-discount-error' : undefined} /></span>{discountExceedsSubtotal && <small id="pos-discount-error" className="pos-discount-error" role="alert">Diskon melebihi subtotal {rupiah(subtotal)}.</small>}</label>
            <label className="pos-notes-field" htmlFor="pos-transaction-notes"><span>Catatan</span><textarea id="pos-transaction-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Catatan transaksi (opsional)" rows="2" /></label>
          </section>}
              {!compactViewport && renderPaymentControls('pos-inline-payment')}
          </div>
          <div className="pos-cart-footer">
            <div className="pos-cart-footer-meta"><strong>{cart.reduce((sum, item) => sum + item.quantity, 0)} pcs</strong>{discount > 0 && <span>Diskon: -{rupiah(discount)}</span>}{discountExceedsSubtotal && <span className="pos-discount-error">Diskon melebihi subtotal.</span>}{message && <span className="message" role="status">{message}</span>}</div>
                <div className="pos-cart-footer-actions">
                  <button type="button" disabled={loadingStore || submitting || !cart.length || discountExceedsSubtotal} onClick={openPaymentFlow}>{submitting ? 'Memproses…' : `Bayar · ${rupiah(total)}`}</button>
                  <button type="button" className="pos-share-invoice" disabled={loadingStore || submitting || sharingInvoice || !cart.length || discountExceedsSubtotal} onClick={shareInvoiceDraft} title="Bagikan invoice" aria-label="Bagikan invoice">
                    <Share2 aria-hidden="true" size={18} />
                    <span>{sharingInvoice ? '…' : 'Bagikan'}</span>
                  </button>
                </div>
          </div>
        </aside>
        </section>
      </div>
      {draftsOpen && <div className="pos-drafts-backdrop" role="presentation" onMouseDown={() => setDraftsOpen(false)}><section className="pos-drafts-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-drafts-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="pos-drafts-heading"><div><strong id="pos-drafts-title">Draft</strong><span>Pilih transaksi yang ingin dilanjutkan</span></div><button type="button" onClick={() => setDraftsOpen(false)} aria-label="Tutup Draft"><X aria-hidden="true" size={19} /></button></div>
        {draftsLoading && <p className="pos-drafts-state">Memuat Draft…</p>}
        {draftsError && <p className="message" role="alert">{draftsError}</p>}
        {!draftsLoading && !draftsError && !drafts.length && <p className="pos-drafts-state">Belum ada Draft untuk toko ini.</p>}
        {!draftsLoading && drafts.length > 0 && <div className="pos-drafts-list">{drafts.map((draft) => {
          const itemCount = Array.isArray(draft.items) ? draft.items.length : 0;
          const heldLabel = draft.held_at ? new Date(draft.held_at).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }) : 'Waktu tidak tersedia';
          return <button type="button" className="pos-draft-row" key={draft.id} onClick={() => resumeDraft(draft.id)}><span className="pos-draft-count">{itemCount}</span><span><strong>{itemCount} item · {rupiah(draft.subtotal)}</strong><small>Draft {heldLabel}</small></span><ArrowUpRight aria-hidden="true" size={18} /></button>;
        })}</div>}
      </section></div>}
      {priceEditItem && <div className="pos-price-dialog-backdrop" role="presentation" onMouseDown={() => setPriceEditItem(null)}><form className="pos-price-dialog" role="dialog" aria-modal="true" aria-labelledby="pos-price-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); savePriceEditor(); }}><div className="pos-drafts-heading"><div><strong id="pos-price-title">Ubah harga</strong><span>{priceEditItem.name}</span></div><button type="button" onClick={() => setPriceEditItem(null)} aria-label="Tutup ubah harga"><X aria-hidden="true" size={19} /></button></div><label htmlFor="pos-price-editor">Harga satuan<input id="pos-price-editor" type="number" min="0" inputMode="numeric" value={priceEditValue} onChange={(event) => setPriceEditValue(event.target.value)} autoFocus /></label><div className="pos-price-dialog-actions"><button type="button" className="secondary" onClick={() => setPriceEditItem(null)}>Batal</button><button type="submit">Simpan</button></div></form></div>}
          {paymentSheetOpen && <div className="pos-payment-sheet-backdrop" role="presentation" onMouseDown={() => setPaymentSheetOpen(false)}><section className="pos-payment-sheet" role="dialog" aria-modal="true" aria-labelledby="pos-payment-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="pos-payment-sheet-header"><button type="button" onClick={() => setPaymentSheetOpen(false)} aria-label="Kembali ke keranjang"><ArrowLeft aria-hidden="true" size={21} /></button><div><strong id="pos-payment-title">Pembayaran</strong><span>Total pembayaran</span></div><button type="button" onClick={() => setPaymentSheetOpen(false)} aria-label="Tutup pembayaran"><X aria-hidden="true" size={19} /></button></header>
            <div className="pos-payment-sheet-body"><div className="pos-payment-total">{rupiah(total)}</div>{renderPaymentControls('pos-payment-controls')}{message && <p className="message" role="status">{message}</p>}</div>
            <footer className="pos-payment-sheet-footer"><button type="button" disabled={submitting || !cart.length || discountExceedsSubtotal} onClick={checkout}>{submitting ? 'Memproses…' : 'Selesaikan pembayaran'}</button><button type="button" className="secondary" onClick={() => setPaymentSheetOpen(false)}>Kembali ke keranjang</button></footer>
          </section></div>}
      {printPrompt && <div className="pos-variant-modal-backdrop" role="presentation" onMouseDown={() => finishPayment(false)}><section className="pos-print-modal" role="dialog" aria-modal="true" aria-labelledby="print-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="pos-variant-heading"><div><strong id="print-dialog-title">Transaksi berhasil</strong><span>{printPrompt.invoice_no}</span></div><button type="button" onClick={() => finishPayment(false)} aria-label="Tutup tanpa mencetak"><X aria-hidden="true" size={16} /></button></div><p>Transaksi sudah disimpan. Apakah struk ingin dicetak sekarang?</p><strong className="print-prompt-total">{rupiah(printPrompt.grand_total)}</strong><div className="print-prompt-actions"><button type="button" className="secondary" onClick={() => finishPayment(false)}>Tidak, selesai</button><button type="button" onClick={() => finishPayment(true)}>Cetak struk</button></div></section></div>}
    </div>
  );
}
