import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Note } from '@/types/database';

export function useNotes(filters?: { dealId?: string; contactId?: string; jobId?: string }) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<(Note & { author_name?: string })[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error,setError]=useState<string|null>(null);
  const sequence=useRef(0);const loaded=useRef(false);
  const account=useRef(profile?.id);account.current=profile?.id;
  const pending=useRef(new Map<string,string>());
  const scopeKey=`${profile?.id}:${filters?.dealId}:${filters?.contactId}:${filters?.jobId}`;
  const currentScope=useRef(scopeKey);currentScope.current=scopeKey;

  const fetchNotes = useCallback(async () => {
    if (!profile||scopeKey!==currentScope.current) return;
    const request=++sequence.current;
    if(!loaded.current)setIsLoading(true);

    let query = supabase
      .from('notes')
      .select('*, profiles:created_by(first_name, last_name)')
      .order('created_at', { ascending: false });

    if (filters?.dealId) query = query.eq('deal_id', filters.dealId);
    if (filters?.contactId) query = query.eq('contact_id', filters.contactId);
    if (filters?.jobId) query = query.eq('job_id', filters.jobId);

    const { data, error:readError } = await query.abortSignal(AbortSignal.timeout(15000));
    if(request!==sequence.current||scopeKey!==currentScope.current)return;
    if(readError){setError('Notes could not refresh. Previously loaded notes remain visible. Retry loading.');setIsLoading(false);return;}
    setError(null);loaded.current=true;

    const enriched = (data ?? []).map((n: Record<string, unknown>) => {
      const author = n.profiles as { first_name: string; last_name: string } | null;
      return {
        ...n,
        author_name: author ? `${author.first_name} ${author.last_name}` : 'Unknown',
      };
    }) as (Note & { author_name?: string })[];

    setNotes(enriched);
    setIsLoading(false);
  }, [profile?.id, scopeKey, filters?.dealId, filters?.contactId, filters?.jobId]);

  useEffect(() => {loaded.current=false;setNotes([]);void fetchNotes();return()=>{sequence.current++;};}, [fetchNotes]);

  const createNote = useCallback(async (body: string, ids: { dealId?: string; contactId?: string; jobId?: string }) => {
    if (!profile) return null;
    const fingerprint=JSON.stringify({user:profile.id,body,ids});
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint))),b=>b.toString(16).padStart(2,'0')).join('');
    const key=`spas:pending-note:${profile.id}:${digest}`;
    let id=pending.current.get(key);try{id??=sessionStorage.getItem(key)??undefined;}catch{/* optional */}
    if(!id||!/^[-0-9a-f]{36}$/i.test(id))id=crypto.randomUUID();
    pending.current.set(key,id);try{sessionStorage.setItem(key,id);}catch{/* memory remains */}
    const { data, error:writeError } = await supabase
      .from('notes')
      .insert({
        id,body,
        deal_id: ids.dealId ?? null,
        contact_id: ids.contactId ?? null,
        job_id: ids.jobId ?? null,
        created_by: profile.id,
      })
      .select().abortSignal(AbortSignal.timeout(15000))
      .single();
    let saved=data;
    if(writeError){
      const lookup=await supabase.from('notes').select('*').eq('id',id).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
      saved=lookup.data;
      if(lookup.error||!saved||saved.created_by!==profile.id||saved.body!==body||saved.deal_id!==(ids.dealId??null)||saved.contact_id!==(ids.contactId??null)||saved.job_id!==(ids.jobId??null)){if(account.current===profile.id)setError('The note is not confirmed saved. Retry the unchanged draft to recover its original receipt.');return null;}
    }
    pending.current.delete(key);try{sessionStorage.removeItem(key);}catch{/* optional */}
    await fetchNotes();
    return saved;
  }, [profile, fetchNotes]);

  /** Edit a submitted note. RLS allows the author or a manager; the edit is stamped. */
  const updateNote = useCallback(async (id: string, body: string) => {
    if (!profile) return { ok: false, message: 'Sign in first.' };
    const clean = body.trim();
    if (!clean) return { ok: false, message: 'A note cannot be empty.' };
    const { error } = await supabase
      .from('notes')
      .update({ body: clean, edited_at: new Date().toISOString(), edited_by: profile.id })
      .eq('id', id);
    if (error) return { ok: false, message: error.message };
    await fetchNotes();
    return { ok: true, message: 'Note updated.' };
  }, [profile, fetchNotes]);

  return { notes, error, isLoading, createNote, updateNote, refresh: fetchNotes };
}
