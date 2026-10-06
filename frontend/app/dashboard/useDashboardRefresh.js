'use client';

import { useEffect, useState } from 'react';
import { subscribeDashboardRefresh } from './stock-movement.cjs';

export default function useDashboardRefresh(enabled) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeDashboardRefresh(() => setVersion((value) => value + 1), window, document);
  }, [enabled]);
  return version;
}
