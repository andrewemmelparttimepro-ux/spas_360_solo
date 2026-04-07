import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Contact } from '@/types/database';

export function useContacts() {
  const { profile, activeLocationId } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchContacts = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let query = supabase
      .from('contacts')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('updated_at', { ascending: false });

    if (activeLocationId) {
      query = query.eq('location_id', activeLocationId);
    }

    if (searchQuery.trim()) {
      query = query.or(`first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query.limit(100);
    if (error) console.error('Error fetching contacts:', error);
    setContacts(data ?? []);
    setIsLoading(false);
  }, [profile, activeLocationId, searchQuery]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Real-time updates
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        fetchContacts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchContacts]);

  const createContact = useCallback(async (contact: Partial<Contact>) => {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('contacts')
      .insert({ ...contact, org_id: profile.org_id } as Contact)
      .select()
      .single();
    if (error) { console.error('Error creating contact:', error); return null; }
    await fetchContacts();
    return data;
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
  const [contact, setContact] = useState<Contact | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContact = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const { data, error } = await supabase.from('contacts').select('*').eq('id', id).single();
    if (error) console.error('Error fetching contact:', error);
    setContact(data);
    setIsLoading(false);
  }, [id]);

  useEffect(() => { fetchContact(); }, [fetchContact]);

  // Real-time: re-fetch when this contact changes
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`contact-detail-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'contacts',
        filter: `id=eq.${id}`,
      }, () => fetchContact())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchContact]);

  const updateContact = useCallback(async (updates: Partial<Contact>) => {
    if (!id) return false;
    const { error } = await supabase.from('contacts').update(updates).eq('id', id);
    if (error) { console.error('Error updating contact:', error); return false; }
    await fetchContact();
    return true;
  }, [id, fetchContact]);

  return { contact, isLoading, updateContact };
}
