import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Contact, ContactType } from '@/types/database';

// One aggregated read model per customer — the card is the whole story:
// who they are, what's in the pipeline, what they've bought, what's in service.
export interface CustomerCard extends Contact {
  assigned?: { first_name: string; last_name: string } | null;
  openDealCount: number;
  openDealValue: number;
  wonValue: number; // lifetime closed-won $
  openJobCount: number;
  equipmentCount: number; // inventory units tied to this customer
  hasFollowUp: boolean; // any open task on them or their open deals
  lastActivity: string; // ISO — max(last_activity_at, updated_at)
}

export type CustomerSort = 'recent' | 'name' | 'value';

export function useCustomerCards() {
  const { profile, activeLocationId } = useAuth();
  const [contacts, setContacts] = useState<(Contact & { assigned?: { first_name: string; last_name: string } | null })[]>([]);
  const [dealAgg, setDealAgg] = useState<Map<string, { open: number; openValue: number; won: number }>>(new Map());
  const [jobAgg, setJobAgg] = useState<Map<string, number>>(new Map());
  const [equipAgg, setEquipAgg] = useState<Map<string, number>>(new Map());
  const [followUps, setFollowUps] = useState<Set<string>>(new Set()); // contact ids with an open task
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let contactQuery = supabase
      .from('contacts')
      .select('*, assigned:assigned_to(first_name, last_name)')
      .eq('org_id', profile.org_id)
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (activeLocationId) contactQuery = contactQuery.eq('location_id', activeLocationId);

    const [contactRes, stageRes, dealRes, jobRes, equipRes, taskRes] = await Promise.all([
      contactQuery,
      supabase.from('pipeline_stages').select('id, name').eq('org_id', profile.org_id),
      supabase.from('deals').select('id, contact_id, amount, stage_id').eq('org_id', profile.org_id),
      supabase.from('jobs').select('contact_id, status').eq('org_id', profile.org_id).not('status', 'in', '("Completed","Cancelled")'),
      supabase.from('inventory_items').select('customer_id').eq('org_id', profile.org_id).not('customer_id', 'is', null),
      supabase.from('tasks').select('contact_id, deal_id').eq('org_id', profile.org_id).in('status', ['Pending', 'In Progress']),
    ]);

    if (contactRes.error) console.error('Error fetching customers:', contactRes.error);
    setContacts((contactRes.data as typeof contacts) ?? []);

    const stageName = new Map((stageRes.data ?? []).map(s => [s.id as string, s.name as string]));
    const deals = new Map<string, { open: number; openValue: number; won: number }>();
    const dealContact = new Map<string, string>(); // deal id → contact id (open deals only)
    for (const d of dealRes.data ?? []) {
      const cid = d.contact_id as string;
      const name = stageName.get(d.stage_id as string) ?? '';
      const agg = deals.get(cid) ?? { open: 0, openValue: 0, won: 0 };
      if (name === 'Closed - Won') {
        agg.won += Number(d.amount) || 0;
      } else if (name !== 'Closed - Lost') {
        agg.open += 1;
        agg.openValue += Number(d.amount) || 0;
        dealContact.set(d.id as string, cid);
      }
      deals.set(cid, agg);
    }
    setDealAgg(deals);

    const jobs = new Map<string, number>();
    for (const j of jobRes.data ?? []) {
      const cid = j.contact_id as string;
      jobs.set(cid, (jobs.get(cid) ?? 0) + 1);
    }
    setJobAgg(jobs);

    const equip = new Map<string, number>();
    for (const i of equipRes.data ?? []) {
      const cid = i.customer_id as string;
      equip.set(cid, (equip.get(cid) ?? 0) + 1);
    }
    setEquipAgg(equip);

    const covered = new Set<string>();
    for (const t of taskRes.data ?? []) {
      if (t.contact_id) covered.add(t.contact_id as string);
      if (t.deal_id && dealContact.has(t.deal_id as string)) covered.add(dealContact.get(t.deal_id as string)!);
    }
    setFollowUps(covered);

    setIsLoading(false);
  }, [profile, activeLocationId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Real-time (channel name unique per hook instance — supabase-js reuses
  // channels by topic and a second .on() after subscribe() throws)
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`customer-cards-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchAll]);

  const cards: CustomerCard[] = useMemo(() => contacts.map(c => {
    const d = dealAgg.get(c.id);
    const last = c.last_activity_at && c.last_activity_at > c.updated_at ? c.last_activity_at : c.updated_at;
    return {
      ...c,
      openDealCount: d?.open ?? 0,
      openDealValue: d?.openValue ?? 0,
      wonValue: d?.won ?? 0,
      openJobCount: jobAgg.get(c.id) ?? 0,
      equipmentCount: equipAgg.get(c.id) ?? 0,
      hasFollowUp: followUps.has(c.id),
      lastActivity: last,
    };
  }), [contacts, dealAgg, jobAgg, equipAgg, followUps]);

  const countsByType: Record<ContactType | 'All', number> = useMemo(() => {
    const counts = { All: cards.length, Lead: 0, Prospect: 0, Customer: 0, 'Past Customer': 0 };
    for (const c of cards) counts[c.customer_type] = (counts[c.customer_type] ?? 0) + 1;
    return counts;
  }, [cards]);

  return { cards, countsByType, isLoading, refresh: fetchAll };
}
