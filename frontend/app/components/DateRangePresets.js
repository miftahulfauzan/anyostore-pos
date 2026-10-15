'use client';

import { getWarehousePeriodRange, WAREHOUSE_PERIOD_OPTIONS } from '../dashboard/warehouse-periods.mjs';

export default function DateRangePresets({ active, onPick, label = 'Pilih rentang tanggal' }) {
  return (
    <div className="warehouse-dashboard-periods date-range-presets" role="group" aria-label={label}>
      {WAREHOUSE_PERIOD_OPTIONS.map(({ key, label: optionLabel }) => (
        <button
          key={key}
          type="button"
          aria-pressed={active === key}
          onClick={() => onPick(key, getWarehousePeriodRange(key))}
        >
          {optionLabel}
        </button>
      ))}
    </div>
  );
}
