import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, JobStatus } from '@/types/database';

export const statusColors: Record<JobStatus, string> = {
  'Delivery': 'border-l-red-500 bg-red-50 text-red-900',
  'Parts on Order': 'border-l-slate-800 bg-slate-100 text-slate-900',
  'Warranty': 'border-l-purple-500 bg-purple-50 text-purple-900',
  'Ready for Pickup': 'border-l-emerald-500 bg-emerald-50 text-emerald-900',
  'In Progress': 'border-l-blue-500 bg-blue-50 text-blue-900',
  'Completed': 'border-l-slate-400 bg-slate-50 text-slate-600',
  'Cancelled': 'border-l-slate-300 bg-slate-50 text-slate-400 opacity-60',
};

export const JOB_STATUS_OPTIONS: JobStatus[] = ['In Progress', 'Delivery', 'Parts on Order', 'Warranty', 'Ready for Pickup', 'Completed', 'Cancelled'];
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
      .select('*, job_assignments(user_id, profiles:user_id(first_name, last_name))')
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
      .channel('jobs-realtime')
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
