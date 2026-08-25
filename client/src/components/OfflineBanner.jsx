import React, { useEffect, useState } from 'react';

/** S16 — offline state. The app keeps working; this is a banner, not a blocker. */
export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  if (online) return null;
  return <div className="offline" role="status">Working offline — changes are kept in this tab and will save when you reconnect.</div>;
}
