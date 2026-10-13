import { useMemo } from 'react';
import { buildMovementChart } from './chart-data.mjs';

const formatQty = (value) => Number(value || 0).toLocaleString('id-ID');
const shortDate = (value) => {
  const [year, month, day] = String(value || '').split('-');
  return `${day}/${month}`;
};

export default function MutationReportInsights({ type, summary, daily, topProducts, start, end, loading, error }) {
  const direction = type === 'out' ? 'keluar' : 'masuk';
  const chart = useMemo(() => buildMovementChart(daily, start, end), [daily, start, end]);
  const hasMovements = chart.points.some((point) => point.total_qty > 0);
  const maxQty = Math.max(1, ...chart.points.map((point) => point.total_qty));
  const chartCoordinates = chart.points.map((point, index) => ({
    x: chart.points.length === 1 ? 320 : 16 + (index * 608) / (chart.points.length - 1),
    y: 170 - (point.total_qty / maxQty) * 146,
  }));
  const chartPath = chartCoordinates.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const tickCount = Math.min(chart.points.length, 5);
  const tickIndexes = Array.from({ length: tickCount }, (_, index) =>
    Math.round(index * (chart.points.length - 1) / Math.max(1, tickCount - 1)));
  const largestProduct = Math.max(1, ...(topProducts || []).map((product) => Number(product.total_qty) || 0));

  return (
    <section className="mutation-insights no-print" aria-label={`Ringkasan barang ${direction}`}>
      <div className="mutation-insights-heading">
        <h2>Ringkasan Barang {type === 'out' ? 'Keluar' : 'Masuk'}</h2>
        <p>Mengikuti toko, periode, dan deskripsi yang dipilih.</p>
      </div>
      <div className="mutation-insights-grid">
        <div className="mutation-insights-metrics" aria-label="Total laporan">
          <div><span>Jumlah Produk</span><strong>{formatQty(summary.product_count)}</strong></div>
          <div><span>Total Qty</span><strong>{formatQty(summary.total_qty)}</strong></div>
        </div>
        <article className="mutation-insights-panel mutation-insights-chart">
          <div className="mutation-insights-panel-heading">
            <h3>Pergerakan barang {direction} per {chart.intervalDays === 1 ? 'hari' : `${chart.intervalDays} hari`}</h3>
            <p>Jumlah unit pada periode yang dipilih</p>
          </div>
          {loading ? <p className="mutation-insights-state" role="status">Memuat pergerakan stok…</p>
            : error ? <p className="mutation-insights-state" role="alert">Grafik belum dapat dimuat. Terapkan filter untuk mencoba lagi.</p>
              : !hasMovements ? <p className="mutation-insights-state">Belum ada barang {direction} pada periode ini. Coba pilih rentang lain.</p>
                : <div className="mutation-chart-plot">
                  <svg viewBox="0 0 640 190" role="img" aria-label={`Grafik jumlah barang ${direction} berdasarkan tanggal, total ${formatQty(summary.total_qty)} unit`}>
                    <line x1="16" y1="170" x2="624" y2="170" className="mutation-chart-gridline" />
                    <line x1="16" y1="97" x2="624" y2="97" className="mutation-chart-gridline" />
                    <line x1="16" y1="24" x2="624" y2="24" className="mutation-chart-gridline" />
                    <path d={chartPath} className="mutation-chart-line" />
                    {chartCoordinates.length <= 14 && chartCoordinates.map((point, index) =>
                      <circle key={chart.points[index].date} cx={point.x} cy={point.y} r="3.5" className="mutation-chart-point" />)}
                  </svg>
                  <div className="mutation-chart-labels" aria-hidden="true">
                    {tickIndexes.map((index) => <span key={chart.points[index].date}>{shortDate(chart.points[index].date)}</span>)}
                  </div>
                </div>}
        </article>
        <article className="mutation-insights-panel mutation-insights-top">
          <div className="mutation-insights-panel-heading">
            <h3>Produk {direction} terbanyak</h3>
            <p>Berdasarkan total unit, semua batch terfilter</p>
          </div>
          {loading ? <p className="mutation-insights-state" role="status">Memuat peringkat produk…</p>
            : error ? <p className="mutation-insights-state" role="alert">Peringkat belum dapat dimuat. Terapkan filter untuk mencoba lagi.</p>
              : !topProducts?.length ? <p className="mutation-insights-state">Belum ada produk {direction} pada periode ini.</p>
                : <ol className="mutation-top-products">
                  {topProducts.map((product, index) => <li key={product.product_id}>
                    <span className="mutation-top-rank">{index + 1}</span>
                    <div className="mutation-top-detail">
                      <div><strong title={product.name}>{product.name || 'Produk tidak bernama'}</strong><b>{formatQty(product.total_qty)} pcs</b></div>
                      {product.sku && <small>{product.sku}</small>}
                      <span className="mutation-top-bar"><i style={{ width: `${Math.max(3, Number(product.total_qty) / largestProduct * 100)}%` }} /></span>
                    </div>
                  </li>)}
                </ol>}
        </article>
      </div>
    </section>
  );
}
