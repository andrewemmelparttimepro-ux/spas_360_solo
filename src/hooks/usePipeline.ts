import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { DropResult } from '@hello-pangea/dnd';
import type { Deal, PipelineStage } from '@/types/database';

export interface PipelineView {
  stages: PipelineStage[];
  dealsByStage: Record<string, Deal[]>;
}

export function usePipeline() {
  const { profile, activeLocationId } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
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
        .select('*')
        .eq('org_id', profile.org_id)
        .order('position'),
    ]);

    if (stageRes.data) setStages(stageRes.data);

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
      .channel('deals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals' }, () => {
        fetchPipeline();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchPipeline]);

  const getDealsForStage = useCallback((stageId: string): Deal[] => {
    return deals.filter(d => d.stage_id === stageId);
  }, [deals]);

  const moveDeal = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

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
    }
  }, [fetchPipeline]);

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

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    supabase
      .from('deals')
      .select('*, contacts:contact_id(first_name, last_name, phone)')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error) console.error('Error fetching deal:', error);
        setDeal(data as typeof deal);
        setIsLoading(false);
      });
  }, [id]);

  const updateDeal = async (updates: Partial<Deal>) => {
    if (!id) return;
    const { error } = await supabase.from('deals').update(updates).eq('id', id);
    if (error) { console.error('Error updating deal:', error); return; }
    // Refresh
    const { data } = await supabase
      .from('deals')
      .select('*, contacts:contact_id(first_name, last_name, phone)')
      .eq('id', id)
      .single();
    setDeal(data as typeof deal);
  };

  return { deal, isLoading, updateDeal };
}
