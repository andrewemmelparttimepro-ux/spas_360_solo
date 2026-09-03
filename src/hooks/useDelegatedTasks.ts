import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DELEGATED_TASK_TYPE, parseDelegatedRequest } from '@/lib/delegatedTasks';
import { supabase } from '@/lib/supabase';
import { THRAWN_PROFILE_ID } from '@/lib/upcomingTasks';
import type { Profile, Task, TaskStatus } from '@/types/database';

export type DelegatedPerson = Pick<Profile, 'id' | 'first_name' | 'last_name'> & { role?: Profile['role'] };

export interface DelegatedTask extends Task {
  assignee_notes: string | null;
  completed_at: string | null;
  assigned: DelegatedPerson | null;
  sender: DelegatedPerson | null;
}

export interface DelegatedTaskDraft {
  assigned_to: string;
  due_at: string | null;
  request: string;
  proof_required?: boolean;
}

export interface DelegatedTaskEdit {
  assigned_to?: string;
  due_at?: string | null;
  request?: string;
  status?: TaskStatus;
  assignee_notes?: string | null;
  proof_required?: boolean;
  proof_photo_path?: string | null;
}

const SELECT = [
  'id, org_id, assigned_to, deal_id, contact_id, job_id, title, description, due_at, priority, status,',
  'task_type, created_by, assignee_notes, completed_at, proof_required, proof_photo_path, escalated_at, nudged_at, created_at, updated_at,',
  'assigned:assigned_to(id, first_name, last_name, role),',
  'sender:created_by(id, first_name, last_name, role)',
].join(' ');

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function normalizeTask(row: Record<string, unknown>): DelegatedTask {
  return {
    ...row,
    assigned: one(row.assigned as DelegatedPerson | DelegatedPerson[] | null),
    sender: one(row.sender as DelegatedPerson | DelegatedPerson[] | null),
  } as unknown as DelegatedTask;
}

type Result = { ok: boolean; message: string };

export function useDelegatedTasks(enabled = true) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<DelegatedTask[]>([]);
  const [staff, setStaff] = useState<DelegatedPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchSequence = useRef(0);

  const fetchTasks = useCallback(async () => {
    if (!profile || !enabled) {
      setTasks([]);
      setStaff([]);
      setIsLoading(false);
      return;
    }

    const sequence = ++fetchSequence.current;
    setIsLoading(true);
    const [tasksRes, staffRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(SELECT)
        .eq('org_id', profile.org_id)
        .eq('task_type', DELEGATED_TASK_TYPE)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('profiles')
        .select('id, first_name, last_name, role')
        .eq('org_id', profile.org_id)
        .neq('id', THRAWN_PROFILE_ID)
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true }),
    ]);
    if (sequence !== fetchSequence.current) return;

    const firstError = tasksRes.error ?? staffRes.error;
    setError(firstError?.message ?? null);
    if (!tasksRes.error) setTasks(((tasksRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeTask));
    if (!staffRes.error) setStaff((staffRes.data ?? []) as DelegatedPerson[]);
    setIsLoading(false);
  }, [profile, enabled]);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (!profile || !enabled) return;
    const channel = supabase
      .channel(`delegated-tasks:${profile.org_id}:${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `org_id=eq.${profile.org_id}` },
        () => { void fetchTasks(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile, enabled, fetchTasks]);

  const createTask = useCallback(async ({ assigned_to, due_at, request, proof_required = false }: DelegatedTaskDraft): Promise<Result> => {
    if (!profile) return { ok: false, message: 'Sign in to delegate a task.' };
    const parsed = parseDelegatedRequest(request);
    if (!assigned_to || !parsed) return { ok: false, message: 'Choose who this is for and describe what needs to be done.' };
    const { error: insertError } = await supabase.from('tasks').insert({
      org_id: profile.org_id,
      assigned_to,
      title: parsed.title,
      description: parsed.description,
      due_at,
      priority: 'Medium',
      status: 'Pending',
      task_type: DELEGATED_TASK_TYPE,
      created_by: profile.id,
      proof_required,
    });
    if (insertError) return { ok: false, message: insertError.message };
    await fetchTasks();
    return { ok: true, message: 'Task delegated.' };
  }, [profile, fetchTasks]);

  const updateTask = useCallback(async (id: string, edit: DelegatedTaskEdit): Promise<Result> => {
    if (!profile) return { ok: false, message: 'Sign in to update this task.' };
    const updates: Record<string, unknown> = {};
    if (edit.status) updates.status = edit.status;
    if ('assignee_notes' in edit) updates.assignee_notes = edit.assignee_notes ?? null;
    if (edit.assigned_to) updates.assigned_to = edit.assigned_to;
    if ('due_at' in edit) updates.due_at = edit.due_at ?? null;
    if (typeof edit.proof_required === 'boolean') updates.proof_required = edit.proof_required;
    if ('proof_photo_path' in edit) updates.proof_photo_path = edit.proof_photo_path ?? null;
    if (typeof edit.request === 'string') {
      const parsed = parseDelegatedRequest(edit.request);
      if (!parsed) return { ok: false, message: 'Describe what needs to be done.' };
      updates.title = parsed.title;
      updates.description = parsed.description;
    }
    const { data, error: updateError } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .eq('task_type', DELEGATED_TASK_TYPE)
      .select(SELECT)
      .single();
    if (updateError) return { ok: false, message: updateError.message };
    const updated = normalizeTask(data as unknown as Record<string, unknown>);
    setTasks(current => current.map(task => task.id === id ? updated : task));
    return {
      ok: true,
      message: edit.status === 'Completed' ? 'Marked complete.' : edit.status ? 'Marked incomplete.' : 'assignee_notes' in edit ? 'Notes saved.' : 'Task updated.',
    };
  }, [profile]);

  const deleteTask = useCallback(async (id: string): Promise<Result> => {
    if (!profile) return { ok: false, message: 'Sign in to delete this task.' };
    const { error: deleteError, count } = await supabase
      .from('tasks')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('task_type', DELEGATED_TASK_TYPE);
    if (deleteError) return { ok: false, message: deleteError.message };
    if (!count) return { ok: false, message: 'Only the person who sent this task can delete it.' };
    setTasks(current => current.filter(task => task.id !== id));
    return { ok: true, message: 'Task deleted.' };
  }, [profile]);

  /** Upload the completion photo into the private task-proofs bucket; returns its storage path. */
  const uploadProof = useCallback(async (taskId: string, file: File): Promise<{ ok: true; path: string } | { ok: false; message: string }> => {
    if (!profile) return { ok: false, message: 'Sign in first.' };
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${profile.org_id}/${taskId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(TASK_PROOF_BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (uploadError) return { ok: false, message: uploadError.message };
    return { ok: true, path };
  }, [profile]);

  /** A gentle reminder from the sender or an owner; at most one per hour per task. */
  const nudgeTask = useCallback(async (task: DelegatedTask): Promise<Result> => {
    if (!profile) return { ok: false, message: 'Sign in first.' };
    if (task.nudged_at && Date.now() - new Date(task.nudged_at).getTime() < 60 * 60 * 1000) {
      return { ok: false, message: 'Already nudged in the last hour.' };
    }
    const sender = `${profile.first_name} ${profile.last_name}`.trim();
    const { error: notifyError } = await supabase.from('notifications').insert({
      user_id: task.assigned_to,
      type: 'delegated_task',
      title: `Nudge from ${sender}: ${task.title.slice(0, 110)}`,
      body: task.due_at ? `Still open. ${new Date(task.due_at) < new Date() ? 'It was due' : 'Due'} ${new Date(task.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Still open. Check it complete when it is done.',
      link: task.assigned?.role === 'technician' ? '/service?delegated=open' : '/dashboard?delegated=open',
    });
    if (notifyError) return { ok: false, message: notifyError.message };
    const stamp = new Date().toISOString();
    await supabase.from('tasks').update({ nudged_at: stamp }).eq('id', task.id);
    setTasks(current => current.map(item => item.id === task.id ? { ...item, nudged_at: stamp } : item));
    return { ok: true, message: `Nudged ${task.assigned?.first_name ?? 'them'}.` };
  }, [profile]);

  return { tasks, staff, isLoading, error, createTask, updateTask, deleteTask, uploadProof, nudgeTask, refresh: fetchTasks };
}

export const TASK_PROOF_BUCKET = 'task-proofs';

export async function signedProofUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(TASK_PROOF_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

/** The signed-in person's own incomplete delegated tasks (the clock-out gate). */
export async function fetchMyIncompleteDelegatedTasks(userId: string): Promise<Pick<DelegatedTask, 'id' | 'title' | 'due_at'>[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, due_at')
    .eq('assigned_to', userId)
    .eq('task_type', DELEGATED_TASK_TYPE)
    .neq('status', 'Completed')
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Pick<DelegatedTask, 'id' | 'title' | 'due_at'>[];
}
