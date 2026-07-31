# 20. Accessibility

## 20.1 WCAG 2.1 Level AA Compliance

Prinsip utama:
1. **Perceivable** - Informasi harus bisa dipersepsi semua user
2. **Operable** - Interface harus bisa dioperasikan semua user
3. **Understandable** - Informasi harus bisa dipahami
4. **Robust** - Content harus robust untuk berbagai assistive technology

---

## 20.2 Keyboard Navigation

### Tab Order

```
Login → Email → Password → Login Button → PIN Button
POS → Search → Product Grid → Cart → Checkout
Modal → Close → Form Fields → Submit → Cancel
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| F1 | Buka bantuan |
| F2 | Fokus ke search |
| F3 | Fokus ke keranjang |
| F4 | Fokus ke produk grid |
| F5 | Refresh data |
| F6 | Buka menu |
| F8 | Buka pos |
| F9 | Bayar |
| F10 | Cetak |
| Escape | Tutup modal |

### Skip Navigation

```jsx
// frontend/src/components/layout/Layout.jsx
export default function Layout({ children }) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
    </>
  );
}
```

```css
/* styles/globals.css */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px;
  z-index: 100;
}

.skip-link:focus {
  top: 0;
}
```

### Focus Trap in Modal

```jsx
// frontend/src/components/ui/Modal.jsx
import { useEffect, useRef } from 'react';

export default function Modal({ isOpen, onClose, children }) {
  const modalRef = useRef(null);
  
  useEffect(() => {
    if (isOpen) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      firstElement?.focus();
      
      const handleTab = (e) => {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      };
      
      modalRef.current.addEventListener('keydown', handleTab);
      return () => modalRef.current?.removeEventListener('keydown', handleTab);
    }
  }, [isOpen]);
  
  return (
    <div 
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {children}
    </div>
  );
}
```

---

## 20.3 Screen Reader Support

### ARIA Labels

```jsx
// Tombol tanpa teks
<button aria-label="Tambah item">
  <PlusIcon />
</button>

// Ikon
<span aria-hidden="true">🔍</span>

// Input
<label htmlFor="search">Cari produk</label>
<input id="search" aria-describedby="search-hint" />
<span id="search-hint">Ketik nama atau SKU produk</span>
```

### ARIA Roles

```jsx
// Komponen custom
<div role="navigation" aria-label="Main navigation">...</div>
<div role="main">...</div>
<div role="complementary" aria-label="Cart">...</div>
<div role="alert">Stok tidak mencukupi</div>
<div role="status" aria-live="polite">Produk ditambahkan ke keranjang</div>
```

### ARIA Live Regions

```jsx
// frontend/src/components/ui/Toast.jsx
function Toast({ message, type }) {
  return (
    <div 
      role="alert" 
      aria-live="assertive"
      className={`toast toast-${type}`}
    >
      {message}
    </div>
  );
}

// Cart update notification
<div aria-live="polite" aria-atomic="true">
  Keranjang: {items.length} item, Total: Rp{total.toLocaleString('id-ID')}
</div>
```

---

## 20.4 Visual Accessibility

### Color Contrast

| Element | Foreground | Background | Ratio |
|---------|------------|------------|-------|
| Body text | #1f2937 | #ffffff | 10.5:1 ✅ |
| Primary button | #ffffff | #2563eb | 8.6:1 ✅ |
| Error text | #dc2626 | #ffffff | 5.9:1 ✅ |
| Link | #2563eb | #ffffff | 8.6:1 ✅ |
| Muted text | #6b7280 | #ffffff | 4.6:1 ✅ |

### Don't Rely Only on Color

```jsx
// ❌ BAD - Only color indicates status
<div className={stock > 0 ? 'text-green' : 'text-red'}>
  {stock}
</div>

// ✅ GOOD - Color + icon + text
<div className={stock > 0 ? 'text-green' : 'text-red'}>
  {stock > 0 ? '✅' : '❌'} {stock} stok
</div>
```

### Font Scaling

```css
/* Use relative units */
body {
  font-size: 16px; /* Base */
}

h1 {
  font-size: 2rem; /* 32px */
}

p {
  font-size: 1rem; /* 16px */
}

/* Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

### High Contrast Mode

```css
@media (prefers-contrast: high) {
  :root {
    --text-primary: #000000;
    --bg-primary: #ffffff;
    --border-color: #000000;
  }
  
  button {
    border: 2px solid #000000;
  }
}
```

### Dark Mode

```css
@media (prefers-color-scheme: dark) {
  :root {
    --text-primary: #f9fafb;
    --bg-primary: #111827;
    --bg-secondary: #1f2937;
    --border-color: #374151;
  }
}
```

---

## 20.5 Touch Accessibility (Mobile)

### Touch Target Size

```css
/* Minimum 44x44px touch target */
button, a, input[type="checkbox"] {
  min-height: 44px;
  min-width: 44px;
}

/* In POS grid */
.product-card {
  min-height: 120px;
  min-width: 120px;
}
```

### Gesture Alternatives

```jsx
// Swipe to delete - also provide delete button
<div className="cart-item">
  <span>Item name</span>
  <button aria-label="Hapus item">🗑️</button>
</div>
```

---

## 20.6 POS-Specific Accessibility

### Large Buttons for Touchscreen

```jsx
// frontend/src/components/pos/CartPanel.jsx
<button 
  className="w-full py-6 text-xl font-bold bg-green-600 text-white rounded-lg"
  aria-label="Bayar Rp 250.000"
>
  💳 BAYAR
</button>
```

### Barcode Scanner Voice Feedback

```javascript
// Use Web Speech API for voice feedback
const speak = (text) => {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.1;
    speechSynthesis.speak(utterance);
  }
};

// On successful scan
speak(`${product.name} ditambahkan`);

// On error
speak('Produk tidak ditemukan');
```

### Receipt Font Readability

```css
/* Thermal printer receipt */
.receipt {
  font-family: 'Courier New', monospace;
  font-size: 14px;
  line-height: 1.5;
}

.receipt-header {
  font-size: 18px;
  font-weight: bold;
  text-align: center;
}

.receipt-total {
  font-size: 16px;
  font-weight: bold;
  border-top: 2px dashed #000;
  padding-top: 8px;
}
```

---

## 20.7 Testing Accessibility

### Automated Testing

```javascript
// Install axe-core
npm install -D @axe-core/react

// React integration
import Axe from '@axe-core/react';

if (process.env.NODE_ENV !== 'production') {
  Axe(React, ReactDOM, 1000);
}
```

### Manual Testing Checklist

- [ ] All pages navigable by keyboard alone
- [ ] Tab order is logical
- [ ] Focus visible on all interactive elements
- [ ] All images have alt text
- [ ] All form fields have labels
- [ ] Error messages announced to screen readers
- [ ] Color contrast meets 4.5:1 ratio
- [ ] Content readable at 200% zoom
- [ ] No content flashes more than 3 times
- [ ] Touch targets at least 44x44px
