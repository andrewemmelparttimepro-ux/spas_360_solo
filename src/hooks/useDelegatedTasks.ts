import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DELEGATED_TASK_TYPE } from '@/lib/delegatedTasks';
import { supabase } from '@/lib/supabase';
import { THRAWN_PROFILE_ID } from '@/lib/upcomingTasks';
import type { Profile, Task, TaskStatus } from '@/types/database';

export interface DelegatedTask extends Task {
  assignee_notes: string | null;
  completed_at: string | null;
  assigned: Pick<Profile, 'id' | 'first_name' | 'last_name'> | null;
}

export type DelegatedTaskDraft = Pick<Task, 'assigned_to' | 'due_at'> & {
  titles: string[];
};

const SELECT = 'id, org_id, assigned_to, deal_id, contact_id, job_id, title, description, due_at, priority, status, task_type, created_by, created_at, updated_at, assignee_notes, completed_at, assigned:assigned_to(id, first_name, last_name)';

function normalizeTask(row: Record<string, unknown>): DelegatedTask {
  const relation = Array.isArray(row.assigned) ? row.assigned[0] : row.assigned;
  return { ...row, assigned: relation ?? null } as unknown as DelegatedTask;
}

export function useDelegatedTasks() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<DelegatedTask[]>([]);
  const [staff, setStaff] = useState<Pick<Profile, 'id' | 'first_name' | 'last_name'>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchSequence = useRef(0);

  const fetchTasks = useCallback(async () => {
    if (!profile) {
      setTasks([]);
      setStaff([]);
      setIsLoading(false);
      return;
    }

    const sequence = ++fetchSequence.current;
    setIsLoading(true);
    const canDelegate = profile.role === 'owner_manager';
    const [tasksRes, staffRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(SELECT)
        .eq('org_id', profile.org_id)
        .eq('task_type', DELEGATED_TASK_TYPE)
        .order('due_at', { ascending: true }),
      canDelegate
        ? supabase
            .from('profiles')
            .select('id, first_name, last_name')
            .eq('org_id', profile.org_id)
            .in('role', ['owner_manager', 'service_manager', 'salesperson', 'technician'])
            .neq('id', THRAWN_PROFILE_ID)
            .order('first_name', { ascending: true })
            .order('last_name', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sequence !== fetchSequence.current) return;

    const firstError = tasksRes.error ?? staffRes.error;
    setError(firstError?.message ?? null);
    if (!tasksRes.error) setTasks((tasksRes.data ?? []).map(row => normalizeTask(row as Record<string, unknown>)));
    if (!staffRes.error) setStaff((staffRes.data ?? []) as Pick<Profile, 'id' | 'first_name' | 'last_name'>[]);
    setIsLoading(false);
  }, [profile]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`delegated-tasks:${profile.org_id}:${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `org_id=eq.${profile.org_id}` },
        () => { void fetchTasks(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile, fetchTasks]);

  const createChecklist = useCallback(async ({ assigned_to, due_at, titles }: DelegatedTaskDraft) => {
    if (!profile || profile.role !== 'owner_manager' || titles.length === 0) {
      return { ok: false, message: 'Owner access, an assignee, a due time, and at least one item are required.' };
    }
    const { error: insertError } = await supabase.from('tasks').insert(titles.map(title => ({
      org_id: profile.org_id,
      assigned_to,
      title,
      description: null,
      due_at,
      priority: 'Medium',
      status: 'Pending',
      task_type: DELEGATED_TASK_TYPE,
      created_by: profile.id,
    })));
    if (insertError) return { ok: false, message: insertError.message };
    await fetchTasks();
    return { ok: true, message: titles.length === 1 ? 'Task assigned.' : `${titles.length} checklist items assigned.` };
  }, [profile, fetchTasks]);

  const updateTask = useCallback(async (
    id: string,
    updates: { status?: TaskStatus; assignee_notes?: string | null },
  ) => {
    if (!profile) return { ok: false, message: 'Sign in to update this task.' };
    const { data, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .eq('task_type', DELEGATED_TASK_TYPE)
      .select(SELECT)
      .single();
    if (updateError) return { ok: false, message: updateError.message };
    const updated = normalizeTask(data as Record<string, unknown>);
    setTasks(current => current.map(task => task.id === id ? updated : task));
    return { ok: true, message: updates.status ? 'Task status updated.' : 'Notes saved.' };
  }, [profile]);

  return { tasks, staff, isLoading, error, createChecklist, updateTask, refresh: fetchTasks };
}
