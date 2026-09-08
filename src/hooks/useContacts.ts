import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeSearchTerm } from '@/lib/utils';
import type { Contact } from '@/types/database';

// `enabled` lets always-mounted chrome (the collapsed admin rail) skip the
// multi-page fetch of thousands of contacts until it's actually visible.
export function useContacts(enabled = true) {
  const { profile, activeLocationId } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  // Typed input updates instantly; the multi-page fetch fires 250ms after the last keystroke
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const fetchSeq = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchContacts = useCallback(async () => {
    if (!profile || !enabled) return;
    setIsLoading(true);
    const seq = ++fetchSeq.current; // out-of-order responses must never overwrite newer ones

    const pageSize = 1000;
    const allContacts: Contact[] = [];
    const needle = sanitizeSearchTerm(debouncedQuery);
    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from('contacts')
        .select('*')
        .eq('org_id', profile.org_id)
        // Bulk-imported contacts share identical updated_at values; without a
        // stable tiebreaker Postgres may order ties differently per page fetch,
        // duplicating some contacts across pages and dropping others entirely.
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);

      if (activeLocationId) {
        query = query.eq('location_id', activeLocationId);
      }

      if (needle) {
        query = query.or(`first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,phone.ilike.%${needle}%,email.ilike.%${needle}%`);
      }

      const { data, error } = await query;
      if (error) {
        // Keep the last good list rather than silently committing a partial one
        console.error('Error fetching contacts:', error);
        if (seq === fetchSeq.current) setIsLoading(false);
        return;
      }
      const page = (data ?? []) as Contact[];
      allContacts.push(...page);
      if (page.length < pageSize) break;
    }
    if (seq !== fetchSeq.current) return;
    // Belt and suspenders: a row that changed mid-fetch can still straddle two
    // pages, and duplicate ids break React keys downstream.
    const seen = new Set<string>();
    setContacts(allContacts.filter(c => !seen.has(c.id) && (seen.add(c.id), true)));
    setIsLoading(false);
  }, [profile, activeLocationId, debouncedQuery, enabled]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Real-time updates (channel name unique per hook instance — supabase-js
  // reuses channels by topic and a second .on() after subscribe() throws)
  useEffect(() => {
    if (!profile || !enabled) return;
    const refetch = debounceRefetch(fetchContacts, 800); // multi-page fetch — coalesce hard
    const channel = supabase
      .channel(`contacts-realtime-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `org_id=eq.${profile.org_id}` }, refetch)
      .subscribe();
    return () => { refetch.cancel(); supabase.removeChannel(channel); };
  }, [profile, enabled, fetchContacts]);

  const createContact = useCallback(async (contact: Partial<Contact>) => {
    if (!profile) return null;
    const { data, error } = await supabase
      .rpc('create_contact_guarded', {
        p_first_name: contact.first_name ?? '',
        p_last_name: contact.last_name ?? '',
        p_phone: contact.phone ?? '',
        p_email: contact.email ?? null,
        p_lead_source: contact.lead_source ?? 'Walk-in',
        p_location_id: contact.location_id ?? profile.location_id ?? null,
        p_assigned_to: contact.assigned_to ?? null,
        p_customer_type: contact.customer_type ?? 'Lead',
      });
    if (error) { console.error('Error creating contact:', error); return null; }
    const result = data as { created?: boolean; contact?: Contact; duplicates?: Contact[] } | null;
    if (!result?.created || !result.contact) {
      console.warn('Contact creation stopped: an exact phone or email match already exists.', result?.duplicates?.map(d => d.id));
      return null;
    }
    await fetchContacts();
    return result.contact;
  }, [profile, fetchContacts]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    const { error } = await supabase.from('contacts').update(updates).eq('id', id);
    if (error) { console.error('Error updating contact:', error); return false; }
    await fetchContacts();
    return true;
  }, [fetchContacts]);

  const deleteContact = useCallback(async (id: string) => {
    const { error } = await supabase.from('contacts').delete().eq('id', id);
    if (error) { console.error('Error deleting contact:', error); return false; }
    await fetchContacts();
    return true;
  }, [fetchContacts]);

  return {
    contacts,
    isLoading,
    searchQuery,
    setSearchQuery,
    createContact,
    updateContact,
    deleteContact,
    refresh: fetchContacts,
  };
}

export function useContact(id: string | undefined) {
  const {profile}=useAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,setError]=useState<string|null>(null);
  const sequence=useRef(0);
  const fetchContact = useCallback(async () => {
    const request=++sequence.current;
    if(!id||!profile){setContact(null);setIsLoading(false);return;}
    try{
      const {data,error}=await supabase.from('contacts').select('*, assigned:assigned_to(id, first_name, last_name)').eq('org_id',profile.org_id).eq('id',id).abortSignal(AbortSignal.timeout(15000)).maybeSingle();
      if(request!==sequence.current)return;
      if(error)throw error;
      setContact(data as Contact|null);setError(null);
    }catch{if(request===sequence.current)setError('Customer details could not refresh. The last loaded details remain visible. Retry before relying on them.');}
    finally{if(request===sequence.current)setIsLoading(false);}
  },[id,profile?.id,profile?.org_id]);
  useEffect(()=>{setContact(null);setError(null);setIsLoading(true);void fetchContact();return()=>{sequence.current++;};},[fetchContact]);
  useEffect(()=>{
    if(!id||!profile)return;
    const channel=supabase.channel(`contact-detail-${id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'contacts',filter:`id=eq.${id}`},()=>void fetchContact()).subscribe();
    return()=>{supabase.removeChannel(channel);};
  },[id,profile?.id,fetchContact]);
  const updateContact=useCallback(async(updates:Partial<Contact>)=>{
    if(!id||!profile)return false;
    try{const{data,error}=await supabase.from('contacts').update(updates).eq('org_id',profile.org_id).eq('id',id).select('id').abortSignal(AbortSignal.timeout(15000));
      if(error||!data?.length)return false;
      await fetchContact();return true;
    }catch{return false;}
  },[id,profile?.id,profile?.org_id,fetchContact]);
  return {contact,isLoading,error,refresh:fetchContact,updateContact};
}
