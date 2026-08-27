import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, JobStatus, ScheduleJobType } from '@/types/database';
import { JOB_TYPE_OPTIONS } from '@/lib/jobSchedule';

// Brandon's color language from the Jobber board:
// red = delivery, purple = warranty, black = parts not received,
// blue = service, green = ready, strikethrough = done.
export const statusColors: Record<JobStatus, string> = {
  'Pending Confirm': 'border-l-amber-500 bg-amber-500/10 text-amber-200',
  'Delivery': 'border-l-red-500 bg-red-500/10 text-red-200',
  'Parts on Order': 'border-l-ink-600 bg-black text-ink-300',
  'Warranty': 'border-l-purple-500 bg-purple-500/10 text-purple-200',
  'Ready for Pickup': 'border-l-emerald-500 bg-emerald-500/10 text-emerald-200',
  'In Progress': 'border-l-brand-400 bg-brand-500/10 text-brand-300',
  'Completed': 'border-l-ink-600 bg-ink-950 text-ink-500 line-through',
  'Cancelled': 'border-l-ink-700 bg-ink-950 text-ink-600 opacity-60 line-through',
};

// Solid Jobber-style queue chips — white text on the workflow status color
export const statusChipColors: Record<JobStatus, string> = {
  'Pending Confirm': 'bg-amber-500 text-black',
  'Delivery': 'bg-red-600 text-white',
  'Parts on Order': 'bg-black text-white ring-1 ring-inset ring-ink-600',
  'Warranty': 'bg-purple-600 text-white',
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
  'Warranty': 'bg-purple-500',
  'Ready for Pickup': 'bg-emerald-500',
  'In Progress': 'bg-brand-400',
  'Completed': 'bg-ink-500',
  'Cancelled': 'bg-ink-600',
};

// Schedule colors follow the job's business type, not its mutable workflow
// status. That keeps the same visual language when a job is scheduled.
export const jobTypeCardColors: Record<ScheduleJobType, string> = {
  'Service': 'border-l-brand-500 bg-brand-500/10 text-brand-200',
  'Warranty': 'border-l-purple-500 bg-purple-500/10 text-purple-200',
  'Delivery': 'border-l-red-500 bg-red-500/10 text-red-200',
  'On Order': 'border-l-ink-600 bg-black text-white',
  'Customer Pick Up': 'border-l-emerald-500 bg-emerald-500/10 text-emerald-200',
  'To Do': 'border-l-yellow-400 bg-yellow-500/15 text-yellow-100',
};

export const jobTypeChipColors: Record<ScheduleJobType, string> = {
  'Service': 'bg-brand-500 text-white',
  'Warranty': 'bg-purple-600 text-white',
  'Delivery': 'bg-red-600 text-white',
  'On Order': 'bg-black text-white ring-1 ring-inset ring-ink-600',
  'Customer Pick Up': 'bg-emerald-600 text-white',
  'To Do': 'bg-yellow-400 text-black',
};

export const jobTypeDotColors: Record<ScheduleJobType, string> = {
  'Service': 'bg-brand-400',
  'Warranty': 'bg-purple-500',
  'Delivery': 'bg-red-500',
  'On Order': 'bg-black ring-1 ring-ink-500',
  'Customer Pick Up': 'bg-emerald-500',
  'To Do': 'bg-yellow-400',
};

export const JOB_STATUS_OPTIONS: JobStatus[] = ['Pending Confirm', 'In Progress', 'Delivery', 'Parts on Order', 'Warranty', 'Ready for Pickup', 'Completed', 'Cancelled'];
export { JOB_TYPE_OPTIONS };

export function useServiceJobs() {
  const { profile, activeLocationId } = useAuth();
  const [jobs, setJobs] = useState<(Job & { assigned_techs?: string[] })[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchJobs = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let query = supabase
      .from('jobs')
      .select('*, contacts:contact_id(first_name, last_name, mailing_address), job_assignments(user_id, profiles:user_id(first_name, last_name))')
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
    const refetch = debounceRefetch(fetchJobs);
    const channel = supabase
      .channel(`jobs-realtime-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `org_id=eq.${profile.org_id}` }, refetch)
      .subscribe();

    return () => { refetch.cancel(); supabase.removeChannel(channel); };
  }, [profile, fetchJobs]);

  const unscheduledJobs = jobs
    .filter(j => !j.scheduled_at && j.status !== 'Completed' && j.status !== 'Cancelled')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const scheduledJobs = jobs.filter(j => j.scheduled_at && j.status !== 'Cancelled');

  const createJob = useCallback(async (job: Partial<Job>, inventoryItemId: string | null = null) => {
    if (!profile) return { id: null, error: 'Your session is not ready.' };
    try {
      const { data, error } = await supabase.rpc('create_job_with_inventory', {
        p_title: job.title ?? '',
        p_contact_id: job.contact_id,
        p_location_id: job.location_id,
        p_job_type: job.job_type,
        p_description: job.description ?? null,
        p_scheduled_at: job.scheduled_at ?? null,
        p_priority: job.priority ?? 'Medium',
        p_amount_to_collect: job.amount_to_collect ?? null,
        p_inventory_item_id: inventoryItemId || null,
      });
      if (error) {
        console.error('Error creating job:', error);
        return { id: null, error: error.message || 'The job could not be created.' };
      }
      await fetchJobs();
      return { id: data as string, error: null };
    } catch (error) {
      console.error('Error creating job:', error);
      return { id: null, error: (error as Error).message || 'The job could not be created.' };
    }
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

  const deleteJob = useCallback(async () => {
    if (!id) return { ok: false, error: 'Job not found.' };
    const { error } = await supabase.rpc('delete_unscheduled_job', { p_job_id: id });
    if (error) {
      console.error('Error deleting job:', error);
      return { ok: false, error: error.message || 'The job could not be deleted.' };
    }
    return { ok: true, error: null };
  }, [id]);

  return { job, isLoading, updateJob, deleteJob };
}
