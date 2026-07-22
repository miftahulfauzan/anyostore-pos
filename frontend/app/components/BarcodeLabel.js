'use client';

import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function BarcodeLabel({ item }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !item?.barcode_value) return;
    try {
      JsBarcode(svgRef.current, String(item.barcode_value), {
        format: 'CODE128',
        displayValue: true,
        fontSize: 10,
        height: 42,
        margin: 0,
        lineColor: '#111827',
        background: '#ffffff',
      });
    } catch {
      svgRef.current.replaceChildren();
    }
  }, [item?.barcode_value]);

  return (
    <article className="barcode-label">
      <strong>{item.name}</strong>
      <span>{item.variant_color ? 'Warna: ' + item.variant_color : 'Produk standar'}</span>
      <svg ref={svgRef} role="img" aria-label={'Barcode ' + item.barcode_value} />
      <small>{item.barcode_value}</small>
      <b>Rp{Number(item.price || 0).toLocaleString('id-ID')}</b>
    </article>
  );
}
