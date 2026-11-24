import { useEffect, useState } from 'react';

const FIRST_VISIT_KEY = 'aidm-first-visit-typed';

/**
 * True until the welcome typing animation has run once on this device, so the
 * effect is only repeated for a returning visitor after a hard refresh.
 */
export function useFirstVisitTyping() {
  const [first, setFirst] = useState(() => {
    try {
      return localStorage.getItem(FIRST_VISIT_KEY) !== '1';
    } catch {
      // Storage can be unavailable (private mode); assume a first visit.
      return true;
    }
  });
  useEffect(() => {
    if (!first) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(FIRST_VISIT_KEY, '1');
      } catch {
        // Ignore quota/private-mode failures; the flag is only an optimisation.
      }
      setFirst(false);
    }, 15000);
    return () => window.clearTimeout(t);
  }, [first]);
  return first;
}
