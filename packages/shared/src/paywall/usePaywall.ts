import { useCallback, useEffect, useState } from 'react';

const SESSION_KEY = 'micro-apps-session-count';
const PAYWALL_THRESHOLD = 3;

function getSessionCount(): number {
  return parseInt(localStorage.getItem(SESSION_KEY) || '0', 10);
}

export function usePaywall() {
  const [sessionCount, setSessionCount] = useState(getSessionCount);
  const [showPaywall, setShowPaywall] = useState(false);

  useEffect(() => {
    const count = getSessionCount() + 1;
    localStorage.setItem(SESSION_KEY, String(count));
    setSessionCount(count);
    if (count >= PAYWALL_THRESHOLD) {
      setShowPaywall(true);
    }
  }, []);

  const dismissPaywall = useCallback(() => {
    setShowPaywall(false);
  }, []);

  return { showPaywall, dismissPaywall, sessionCount };
}
