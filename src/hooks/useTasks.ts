import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Task } from '@/types/database';

export function useTasks(filters?: { dealId?: string; contactId?: string; jobId?: string }) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let query = supabase
      .from('tasks')
      .select('*')
      .order('due_at', { ascending: true });

    if (filters?.dealId) query = query.eq('deal_id', filters.dealId);
    if (filters?.contactId) query = query.eq('contact_id', filters.contactId);
    if (filters?.jobId) query = query.eq('job_id', filters.jobId);

    const { data, error } = await query;
    if (error) console.error('Error fetching tasks:', error);
    setTasks(data ?? []);
    setIsLoading(false);
  }, [profile, filters?.dealId, filters?.contactId, filters?.jobId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const createTask = useCallback(async (task: Partial<Task>) => {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        ...task,
        org_id: profile.org_id,
        assigned_to: task.assigned_to ?? profile.id,
        created_by: profile.id,
      } as Task)
      .select()
      .single();
    if (error) { console.error('Error creating task:', error); return null; }
    await fetchTasks();
    return data;
  }, [profile, fetchTasks]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    const { error } = await supabase.from('tasks').update(updates).eq('id', id);
    if (error) { console.error('Error updating task:', error); return false; }
    await fetchTasks();
    return true;
  }, [fetchTasks]);

  const completeTask = useCallback(async (id: string) => {
    return updateTask(id, { status: 'Completed' });
  }, [updateTask]);

  return { tasks, isLoading, createTask, updateTask, completeTask, refresh: fetchTasks };
}
