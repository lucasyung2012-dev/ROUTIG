import { useEffect, useState } from 'react';
import type { Period } from './HomePlaza';

/** Período do dia para a luz da praça e a saudação. */
export function periodOf(h: number): Period {
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'night';
}

/** Período atual, conferido a cada minuto. */
export function usePeriod(): Period {
  const [period, setPeriod] = useState(() => periodOf(new Date().getHours()));
  useEffect(() => {
    const id = window.setInterval(() => setPeriod(periodOf(new Date().getHours())), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return period;
}

export const reducedMotion = () => typeof window !== 'undefined' && (document.documentElement.dataset.motion === 'reduce' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
