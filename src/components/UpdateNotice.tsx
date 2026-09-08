import { useEffect, useState } from 'react';
import { RELEASE_ID, reloadWhenReady } from '@/lib/releaseSafety';

export default function UpdateNotice() {
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    let disposed = false;
    const check = async () => {
      setOffline(!navigator.onLine);
      if (!navigator.onLine || document.visibilityState === 'hidden') return;
      try {
        const response = await fetch('/version.json', { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
        if (!response.ok) return;
        const version = await response.json();
        if (!disposed && typeof version.release === 'string' && version.release !== RELEASE_ID) setReady(true);
      } catch { /* A failed update check must never interrupt the working app. */ }
    };
    const needed = () => setReady(true);
    const editing = () => { setReady(true); setBlocked(true); };
    window.addEventListener('spas:update-blocked', editing);
    const timer = setInterval(check, 60_000);
    window.addEventListener('spas:update-needed', needed);
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    document.addEventListener('visibilitychange', check);
    void check();
    return () => {
      disposed = true; clearInterval(timer);
      window.removeEventListener('spas:update-needed', needed);
      window.removeEventListener('spas:update-blocked', editing);
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  if (!ready && !offline) return null;
  return <aside role="status" className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-brand-500/30 bg-ink-900 px-4 py-3 text-sm text-ink-100">
    <span>{offline ? 'You are offline. Saved views may be out of date. Reconnect before saving changes.' : blocked ? 'Finish or close the open form before updating. Your current page will stay open.' : 'An update is ready. Save your edits first. Update when ready reloads this tab.'}</span>
    {ready && !offline && <button type="button" onClick={reloadWhenReady} className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white">Update when ready</button>}
  </aside>;
}
