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
        displayValue: false,
        width: 1,
        height: 60,
        margin: 0,
        marginLeft: 10,
        marginRight: 10,
        lineColor: '#111827',
        background: '#ffffff',
      });
    } catch {
      svgRef.current.replaceChildren();
    }
  }, [item?.barcode_value]);

  return (
    <article className="barcode-label">
      <header className="barcode-label__heading">
        <span className="barcode-label__product">
          <strong className="barcode-label__name">{item.name || item.product_name || item.product_sku || item.sku || item.barcode_value}</strong>
          {item.variant_color ? <span className="barcode-label__variant">· {item.variant_color}</span> : null}
        </span>
        <span className="barcode-label__divider" aria-hidden="true" />
        <b className="barcode-label__price">Rp {Number(item.price || 0).toLocaleString('id-ID')}</b>
      </header>
      <svg className="barcode-label__barcode" ref={svgRef} role="img" aria-label={'Barcode ' + item.barcode_value} />
      <small className="barcode-label__value">{item.barcode_value}</small>
    </article>
  );
}
