import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { enablePush, pushEnabledHere, pushPermission, pushSupported } from '@/lib/push';
import { useToast } from '@/components/ui/Toast';

const KEY = 'spas360.pushNudge.dismissedOn';
const dayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Delegated tasks, clock-out flags, and the Morning Summary only reach a phone
 * that has push enabled. Until this device has it, ask once a day, in the app,
 * with the one-tap enable button. Installed-to-Home-Screen is required on iPhone.
 */
export default function PushNudgeBanner() {
  const { toast } = useToast();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!pushSupported()) return;
      try { if (window.localStorage.getItem(KEY) === dayKey()) return; } catch { /* ignore */ }
      if (pushPermission() === 'denied') return;
      const enabled = await pushEnabledHere();
      if (!cancelled && !enabled) setShow(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try { window.localStorage.setItem(KEY, dayKey()); } catch { /* ignore */ }
    setShow(false);
  };

  const enable = async () => {
    setBusy(true);
    const ok = await enablePush();
    setBusy(false);
    if (ok) { toast('Alerts are on for this device.', 'success'); setShow(false); }
    else toast('Could not turn on alerts here. On iPhone, add SPAS 360 to your Home Screen first, then try again.', 'warning');
  };

  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);

  return (
    <div role="status" className="mb-4 flex flex-col gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3 text-sm text-ink-100 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
        <div>
          <p className="font-semibold">Get task alerts on this device</p>
          <p className="text-xs text-ink-400">
            Delegated tasks, clock-out flags, and the Morning Summary arrive here only when alerts are on.
            {isIos && !standalone ? ' On iPhone: Share → Add to Home Screen, open SPAS 360 from the icon, then tap Enable.' : ''}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button type="button" disabled={busy} onClick={() => void enable()} className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50">{busy ? 'Enabling…' : 'Enable alerts'}</button>
        <button type="button" onClick={dismiss} aria-label="Not now" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
