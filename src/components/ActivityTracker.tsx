import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { ActivityQueue } from '@/lib/activityQueue';
import { RELEASE_ID } from '@/lib/releaseSafety';

const queue = new ActivityQueue();
const sessions = new Map<string, string>();

const areaNames: Record<string, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  contacts: 'Customers',
  deals: 'Deals',
  crm: 'Deals',
  inventory: 'Inventory',
  communication: 'Communications',
  reports: 'Reports',
  settings: 'Settings',
  'owners-corner': 'Owners Corner',
  citadel: 'Citadel',
  parts: 'Parts',
  media: 'Media',
  documents: 'Documents',
  knowledge: 'Knowledge',
  service: 'Service',
};

/** Owner-visible route ledger. Regular staff can create these events through a
 * tightly scoped RPC, but RLS never lets them read the owner audit log. */
export default function ActivityTracker() {
  const { profile } = useAuth();
  const location = useLocation();
  const lastRecorded = useRef('');

  useEffect(() => {
    if (!profile) return;
    let disposed = false;
    const flush = async () => {
      if (!navigator.onLine || disposed) return;
      await queue.flush(profile.id, async event => {
        if (disposed) return false;
        const { data } = await supabase.auth.getSession();
        if (data.session?.user.id !== event.userId) return false;
        const { error } = await supabase.rpc('record_app_activity_v2', {
          p_event_id: event.id, p_session_id: event.sessionId, p_route: event.route,
          p_label: event.label, p_release: event.release, p_channel: 'web',
        }).abortSignal(AbortSignal.timeout(8_000));
        return !error;
      });
    };
    window.addEventListener('spas:activity-queued', flush);
    window.addEventListener('online', flush);
    const timer = setInterval(flush, 10_000);
    void flush();
    return () => { disposed = true; clearInterval(timer); window.removeEventListener('online', flush); window.removeEventListener('spas:activity-queued', flush); };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const parts = location.pathname.split('/').filter(Boolean);
    const area = areaNames[parts[0] ?? 'dashboard'] ?? 'SPAS 360';
    const label = parts.length > 1 ? `${area} detail` : area;
    const key = `${profile.id}:${location.pathname}`;
    if (lastRecorded.current === key) return;
    lastRecorded.current = key;

    let sessionId = sessions.get(profile.id);
    if (!sessionId) { sessionId = crypto.randomUUID(); sessions.set(profile.id, sessionId); }
    const route = `/${areaNames[parts[0]] ? parts[0] : 'other'}${parts.length > 1 ? '/detail' : ''}`;
    queue.enqueue({ id: crypto.randomUUID(), userId: profile.id, sessionId, route, label, release: RELEASE_ID, attempts: 0 });
    window.dispatchEvent(new Event('spas:activity-queued'));
  }, [location.pathname, profile]);

  return null;
}
