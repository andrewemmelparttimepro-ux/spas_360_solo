import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Note } from '@/types/database';

export function useNotes(filters?: { dealId?: string; contactId?: string; jobId?: string }) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<(Note & { author_name?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let query = supabase
      .from('notes')
      .select('*, profiles:created_by(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (filters?.dealId) query = query.eq('deal_id', filters.dealId);
    if (filters?.contactId) query = query.eq('contact_id', filters.contactId);
    if (filters?.jobId) query = query.eq('job_id', filters.jobId);

    const { data, error } = await query;
    if (error) console.error('Error fetching notes:', error);

    const enriched = (data ?? []).map((n: Record<string, unknown>) => {
      const author = n.profiles as { first_name: string; last_name: string } | null;
      return {
        ...n,
        author_name: author ? `${author.first_name} ${author.last_name}` : 'Unknown',
      };
    }) as (Note & { author_name?: string })[];

    setNotes(enriched);
    setIsLoading(false);
  }, [profile, filters?.dealId, filters?.contactId, filters?.jobId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const createNote = useCallback(async (body: string, ids: { dealId?: string; contactId?: string; jobId?: string }) => {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('notes')
      .insert({
        body,
        deal_id: ids.dealId ?? null,
        contact_id: ids.contactId ?? null,
        job_id: ids.jobId ?? null,
        created_by: profile.id,
      })
      .select()
      .single();
    if (error) { console.error('Error creating note:', error); return null; }
    await fetchNotes();
    return data;
  }, [profile, fetchNotes]);

  return { notes, isLoading, createNote, refresh: fetchNotes };
}
