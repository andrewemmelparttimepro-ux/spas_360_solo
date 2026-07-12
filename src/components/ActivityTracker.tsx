import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

const areaNames: Record<string, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  contacts: 'Customers',
  deals: 'Deals',
  crm: 'Deals',
  service: 'Service',
  inventory: 'Inventory',
  communication: 'Communications',
  reports: 'Reports',
  settings: 'Settings',
};

/** Owner-visible route ledger. Regular staff can create these events through a
 * tightly scoped RPC, but RLS never lets them read the owner audit log. */
export default function ActivityTracker() {
  const { profile } = useAuth();
  const location = useLocation();
  const lastRecorded = useRef('');

  useEffect(() => {
    if (!profile) return;
    const parts = location.pathname.split('/').filter(Boolean);
    const area = areaNames[parts[0] ?? 'dashboard'] ?? 'SPAS 360';
    const label = parts.length > 1 ? `${area} detail` : area;
    const key = `${profile.id}:${location.pathname}`;
    if (lastRecorded.current === key) return;
    lastRecorded.current = key;

    void supabase.rpc('record_app_activity', {
      p_event_type: 'page_view',
      p_label: label,
      p_source: 'SPAS 360',
    });
  }, [location.pathname, profile]);

  return null;
}
