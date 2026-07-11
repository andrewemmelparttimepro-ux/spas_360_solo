import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, JobStatus } from '@/types/database';

// Brandon's color language from the Jobber board:
// red = delivery, orange = warranty, black = parts not received,
// blue = service, green = ready, strikethrough = done.
export const statusColors: Record<JobStatus, string> = {
  'Pending Confirm': 'border-l-amber-500 bg-amber-500/10 text-amber-200',
  'Delivery': 'border-l-red-500 bg-red-500/10 text-red-200',
  'Parts on Order': 'border-l-ink-600 bg-black text-ink-300',
  'Warranty': 'border-l-orange-500 bg-orange-500/10 text-orange-200',
  'Ready for Pickup': 'border-l-emerald-500 bg-emerald-500/10 text-emerald-200',
  'In Progress': 'border-l-brand-400 bg-brand-500/10 text-brand-300',
  'Completed': 'border-l-ink-600 bg-ink-950 text-ink-500 line-through',
  'Cancelled': 'border-l-ink-700 bg-ink-950 text-ink-600 opacity-60 line-through',
};

// Solid Jobber-style calendar chips — white text on the status color
export const statusChipColors: Record<JobStatus, string> = {
  'Pending Confirm': 'bg-amber-500 text-black',
  'Delivery': 'bg-red-600 text-white',
  'Parts on Order': 'bg-black text-white ring-1 ring-inset ring-ink-600',
  'Warranty': 'bg-orange-600 text-white',
  'Ready for Pickup': 'bg-emerald-600 text-white',
  'In Progress': 'bg-brand-500 text-white',
  'Completed': 'bg-ink-800 text-ink-400 line-through',
  'Cancelled': 'bg-ink-800 text-ink-500 line-through opacity-60',
};

// Legend dots (filter chips)
export const statusDotColors: Record<JobStatus, string> = {
  'Pending Confirm': 'bg-amber-500',
  'Delivery': 'bg-red-500',
  'Parts on Order': 'bg-black ring-1 ring-ink-500',
  'Warranty': 'bg-orange-500',
  'Ready for Pickup': 'bg-emerald-500',
  'In Progress': 'bg-brand-400',
  'Completed': 'bg-ink-500',
  'Cancelled': 'bg-ink-600',
};

export const JOB_STATUS_OPTIONS: JobStatus[] = ['Pending Confirm', 'In Progress', 'Delivery', 'Parts on Order', 'Warranty', 'Ready for Pickup', 'Completed', 'Cancelled'];
export const JOB_TYPE_OPTIONS = ['Delivery', 'Repair', 'Installation', 'Warranty', 'Maintenance', 'Pickup'];

export function useServiceJobs() {
  const { profile, activeLocationId } = useAuth();
  const [jobs, setJobs] = useState<(Job & { assigned_techs?: string[] })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let query = supabase
      .from('jobs')
      .select('*, contacts:contact_id(first_name, last_name), job_assignments(user_id, profiles:user_id(first_name, last_name))')
      .eq('org_id', profile.org_id)
      .order('scheduled_at', { ascending: true, nullsFirst: true });

    if (activeLocationId) {
      query = query.eq('location_id', activeLocationId);
    }

    const { data, error } = await query;
    if (error) console.error('Error fetching jobs:', error);
    setJobs(data ?? []);
    setIsLoading(false);
  }, [profile, activeLocationId]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  // Real-time updates
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`jobs-realtime-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, () => {
        fetchJobs();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchJobs]);

  const unscheduledJobs = jobs.filter(j => !j.scheduled_at && j.status !== 'Completed' && j.status !== 'Cancelled');
  const scheduledJobs = jobs.filter(j => j.scheduled_at && j.status !== 'Cancelled');

  const createJob = useCallback(async (job: Partial<Job>) => {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        ...job,
        org_id: profile.org_id,
        created_by: profile.id,
      } as Job)
      .select()
      .single();
    if (error) { console.error('Error creating job:', error); return null; }
    await fetchJobs();
    return data;
  }, [profile, fetchJobs]);

  const updateJob = useCallback(async (id: string, updates: Partial<Job>) => {
    const { error } = await supabase.from('jobs').update(updates).eq('id', id);
    if (error) { console.error('Error updating job:', error); return false; }
    await fetchJobs();
    return true;
  }, [fetchJobs]);

  return {
    jobs,
    unscheduledJobs,
    scheduledJobs,
    statusColors,
    isLoading,
    createJob,
    updateJob,
    refresh: fetchJobs,
  };
}

export function useJob(id: string | undefined) {
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJob = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('jobs')
      .select('*, contacts:contact_id(first_name, last_name, phone), properties:property_id(address), locations:location_id(name)')
      .eq('id', id)
      .single();
    if (error) console.error('Error fetching job:', error);
    setJob(data as Job);
    setIsLoading(false);
  }, [id]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  // Real-time: re-fetch when this job changes
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`job-detail-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `id=eq.${id}`,
      }, () => fetchJob())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchJob]);

  const updateJob = useCallback(async (updates: Partial<Job>) => {
    if (!id) return false;
    const { error } = await supabase.from('jobs').update(updates).eq('id', id);
    if (error) { console.error('Error updating job:', error); return false; }
    await fetchJob();
    return true;
  }, [id, fetchJob]);

  return { job, isLoading, updateJob };
}
