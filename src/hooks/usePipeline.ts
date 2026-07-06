import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { DropResult } from '@hello-pangea/dnd';
import type { Deal, PipelineStage } from '@/types/database';

export interface PipelineView {
  stages: PipelineStage[];
  dealsByStage: Record<string, Deal[]>;
}

export type PipelineDeal = Deal & { contacts?: { first_name: string; last_name: string } | null };

export function usePipeline() {
  const { profile, activeLocationId } = useAuth();
  const { toast } = useToast();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [dealsWithTasks, setDealsWithTasks] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  const fetchPipeline = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const [stageRes, dealRes] = await Promise.all([
      supabase
        .from('pipeline_stages')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('position'),
      supabase
        .from('deals')
        .select('*, contacts:contact_id(first_name, last_name)')
        .eq('org_id', profile.org_id)
        .order('position'),
    ]);

    if (stageRes.data) setStages(stageRes.data);

    // Which deals have an open follow-up task? (a lead with no task is a no-no)
    const { data: openTasks } = await supabase
      .from('tasks')
      .select('deal_id')
      .eq('org_id', profile.org_id)
      .in('status', ['Pending', 'In Progress'])
      .not('deal_id', 'is', null);
    setDealsWithTasks(new Set((openTasks ?? []).map(t => t.deal_id as string)));

    let filteredDeals = dealRes.data ?? [];
    if (activeLocationId) {
      filteredDeals = filteredDeals.filter(d => d.location_id === activeLocationId);
    }
    setDeals(filteredDeals);
    setIsLoading(false);
  }, [profile, activeLocationId]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  // Subscribe to real-time deal changes
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`deals-realtime-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        fetchPipeline();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchPipeline]);

  const getDealsForStage = useCallback((stageId: string): PipelineDeal[] => {
    return deals.filter(d => d.stage_id === stageId);
  }, [deals]);

  // ─── Sales → Service bridge ─────────────────────────────
  // A won deal becomes a Delivery job in the unscheduled queue ("Wyant – Hot Tub – Delivery"),
  // the contact is promoted to Customer, and service managers get notified.
  const handleDealWon = useCallback(async (deal: PipelineDeal) => {
    if (!profile) return;

    // Guard: don't stack delivery jobs if one is already open for this contact
    const { data: existing } = await supabase
      .from('jobs')
      .select('id')
      .eq('contact_id', deal.contact_id)
      .eq('job_type', 'Delivery')
      .not('status', 'in', '("Completed","Cancelled")')
      .limit(1);

    if (!existing || existing.length === 0) {
      // Jobs require a location — deal's, then the user's, then the org's first
      let locationId = deal.location_id ?? profile.location_id ?? null;
      if (!locationId) {
        const { data: loc } = await supabase.from('locations').select('id').eq('org_id', profile.org_id).limit(1).single();
        locationId = loc?.id ?? null;
      }
      if (locationId) {
        await supabase.from('jobs').insert({
          org_id: profile.org_id,
          contact_id: deal.contact_id,
          location_id: locationId,
          title: `${deal.title} – Delivery`,
          job_type: 'Delivery',
          status: 'Delivery',
          priority: deal.priority,
          amount_to_collect: deal.amount,
          description: `Auto-created when the deal was won. Confirm delivery time with the customer, then drag onto the schedule.`,
          created_by: profile.id,
        });
      }
    }

    // Lead becomes a Customer
    await supabase.from('contacts').update({ customer_type: 'Customer' }).eq('id', deal.contact_id);

    // Tell the service side a delivery just landed in their queue
    const { data: managers } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', profile.org_id)
      .in('role', ['service_manager', 'owner_manager']);
    await Promise.all((managers ?? []).filter(m => m.id !== profile.id).map(m =>
      supabase.from('notifications').insert({
        user_id: m.id,
        type: 'job',
        title: `Deal won: ${deal.title}`,
        body: 'A delivery job was added to the unscheduled queue.',
        link: '/service',
      })
    ));
  }, [profile]);

  const moveDeal = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const movedDeal = deals.find(d => d.id === draggableId);

    // Optimistic update
    setDeals(prev => {
      const updated = [...prev];
      const dealIdx = updated.findIndex(d => d.id === draggableId);
      if (dealIdx === -1) return prev;
      updated[dealIdx] = { ...updated[dealIdx], stage_id: destination.droppableId, position: destination.index };
      return updated;
    });

    // Persist to Supabase
    const { error } = await supabase
      .from('deals')
      .update({ stage_id: destination.droppableId, position: destination.index })
      .eq('id', draggableId);

    if (error) {
      console.error('Error moving deal:', error);
      fetchPipeline(); // Revert on error
      return;
    }

    // Crossing into Closed-Won triggers the sales → service handoff
    const wonStage = stages.find(s => s.name === 'Closed - Won');
    if (movedDeal && wonStage && destination.droppableId === wonStage.id && source.droppableId !== wonStage.id) {
      await handleDealWon(movedDeal);
      toast('Deal won 🎉 Delivery job sent to the Service queue', 'success');
    }
  }, [deals, stages, fetchPipeline, handleDealWon, toast]);

  const createDeal = useCallback(async (deal: Partial<Deal>) => {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('deals')
      .insert({
        ...deal,
        org_id: profile.org_id,
        assigned_to: deal.assigned_to ?? profile.id,
      } as Deal)
      .select()
      .single();
    if (error) { console.error('Error creating deal:', error); return null; }
    await fetchPipeline();
    return data;
  }, [profile, fetchPipeline]);

  return {
    stages,
    deals,
    dealsWithTasks,
    isLoading,
    getDealsForStage,
    moveDeal,
    createDeal,
    refresh: fetchPipeline,
  };
}

export function useDeal(id: string | undefined) {
  const [deal, setDeal] = useState<(Deal & { contact?: { first_name: string; last_name: string; phone: string } }) | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDeal = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('deals')
      .select('*, contacts:contact_id(first_name, last_name, phone)')
      .eq('id', id)
      .single();
    if (error) console.error('Error fetching deal:', error);
    setDeal(data as typeof deal);
    setIsLoading(false);
  }, [id]);

  useEffect(() => { fetchDeal(); }, [fetchDeal]);

  // Real-time: re-fetch when this deal changes
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`deal-detail-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'deals',
        filter: `id=eq.${id}`,
      }, () => fetchDeal())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchDeal]);

  const updateDeal = async (updates: Partial<Deal>) => {
    if (!id) return;
    const { error } = await supabase.from('deals').update(updates).eq('id', id);
    if (error) { console.error('Error updating deal:', error); return; }
    await fetchDeal();
  };

  return { deal, isLoading, updateDeal };
}
