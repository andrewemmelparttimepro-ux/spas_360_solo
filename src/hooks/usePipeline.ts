import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import type { DropResult } from '@hello-pangea/dnd';
import type { Deal, PipelineStage, Profile } from '@/types/database';
import {
  summarizeDealFollowUps,
  type DealFollowUp,
  type FollowUpTaskLike,
} from '@/lib/followUp';

export interface PipelineView {
  stages: PipelineStage[];
  dealsByStage: Record<string, Deal[]>;
}

export type PipelineDeal = Deal & {
  contacts?: { first_name: string; last_name: string } | null;
  assigned?: { first_name: string; last_name: string; role: Profile['role'] } | null;
};

export type SalespersonOption = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'role'>;

export function usePipeline() {
  const { profile, activeLocationId } = useAuth();
  const { toast } = useToast();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<PipelineDeal[]>([]);
  const [salespeople, setSalespeople] = useState<SalespersonOption[]>([]);
  const [followUpsByDeal, setFollowUpsByDeal] = useState<Map<string, DealFollowUp>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  const fetchPipeline = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const [stageRes, dealRes, taskRes, peopleRes] = await Promise.all([
      supabase
        .from('pipeline_stages')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('position'),
      supabase
        .from('deals')
        .select('*, contacts:contact_id(first_name, last_name), assigned:assigned_to(first_name, last_name, role)')
        .eq('org_id', profile.org_id)
        .order('position'),
      supabase
        .from('tasks')
        .select('id, deal_id, assigned_to, title, due_at, priority, status')
        .eq('org_id', profile.org_id)
        .in('status', ['Pending', 'In Progress', 'Overdue'])
        .not('deal_id', 'is', null)
        .order('due_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('org_id', profile.org_id)
        .in('role', ['owner_manager', 'service_manager', 'salesperson'])
        .order('first_name'),
    ]);

    if (stageRes.data) setStages(stageRes.data);
    if (peopleRes.data) setSalespeople(peopleRes.data as SalespersonOption[]);
    // Only repaint follow-up chips from a clean read — a transient error must not
    // flip every deal to "No next activity" and lie on the accountability board
    if (!taskRes.error) {
      setFollowUpsByDeal(summarizeDealFollowUps((taskRes.data ?? []) as FollowUpTaskLike[]));
    }

    if (stageRes.error) console.error('Error fetching pipeline stages:', stageRes.error);
    if (dealRes.error) console.error('Error fetching deals:', dealRes.error);
    if (taskRes.error) console.error('Error fetching deal follow-ups:', taskRes.error);
    if (peopleRes.error) console.error('Error fetching salespeople:', peopleRes.error);
    const firstError = stageRes.error ?? dealRes.error ?? taskRes.error ?? peopleRes.error;
    if (firstError) toast(`Pipeline didn't fully load: ${firstError.message}`, 'error');

    if (!dealRes.error) {
      let filteredDeals = (dealRes.data ?? []) as PipelineDeal[];
      if (activeLocationId) {
        filteredDeals = filteredDeals.filter(d => d.location_id === activeLocationId);
      }
      setDeals(filteredDeals);
    }
    setIsLoading(false);
  }, [profile, activeLocationId, toast]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  // Subscribe to real-time deal changes. A single drag lands as a burst of row
  // events (move + sibling renumbers) — coalesce them into one refetch.
  useEffect(() => {
    if (!profile) return;
    const refetch = debounceRefetch(fetchPipeline);
    const channel = supabase
      .channel(`deals-realtime-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals', filter: `org_id=eq.${profile.org_id}` }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `org_id=eq.${profile.org_id}` }, refetch)
      .subscribe();

    return () => { refetch.cancel(); supabase.removeChannel(channel); };
  }, [profile, fetchPipeline]);

  const getDealsForStage = useCallback((stageId: string): PipelineDeal[] => {
    return deals.filter(d => d.stage_id === stageId);
  }, [deals]);

  const moveDealToStage = useCallback(async (dealId: string, stageId: string, position?: number) => {
    const currentDeal = deals.find(deal => deal.id === dealId);
    if (!currentDeal) return false;
    if (currentDeal.stage_id === stageId && position === undefined) return true;

    const targetPosition = position ?? deals.filter(deal => deal.stage_id === stageId && deal.id !== dealId).length;
    const sourceStage = stages.find(stage => stage.id === currentDeal.stage_id);
    const destinationStage = stages.find(stage => stage.id === stageId);

    // Optimistic update
    setDeals(prev => {
      const updated = [...prev];
      const dealIdx = updated.findIndex(d => d.id === dealId);
      if (dealIdx === -1) return prev;
      updated[dealIdx] = { ...updated[dealIdx], stage_id: stageId, position: targetPosition };
      return updated;
    });

    // Atomic server-side move: renumbers both stages, and the DB trigger owns
    // the entire won-deal handoff (delivery job, customer promotion, manager
    // pings) — identical no matter which path wins the deal.
    const { error } = await supabase.rpc('move_deal', {
      p_deal_id: dealId,
      p_stage_id: stageId,
      p_position: targetPosition,
    });

    if (error) {
      console.error('Error moving deal:', error);
      toast(`Couldn't move that deal: ${error.message}`, 'error');
      fetchPipeline(); // Revert on error
      return false;
    }

    // Celebrate the non-won → won crossing (the work already happened in the DB)
    if (destinationStage?.is_won && !sourceStage?.is_won) {
      toast('Deal won 🎉 Delivery job sent to the Service queue', 'success');
    } else if (destinationStage?.is_lost && !sourceStage?.is_lost) {
      toast('Deal marked lost and saved in the customer history', 'success');
    }
    return true;
  }, [deals, stages, fetchPipeline, toast]);

  const moveDeal = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    await moveDealToStage(draggableId, destination.droppableId, destination.index);
  }, [moveDealToStage]);

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
    salespeople,
    followUpsByDeal,
    isLoading,
    getDealsForStage,
    moveDeal,
    moveDealToStage,
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
