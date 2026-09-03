import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { localDateRange, localDayKey } from '@/lib/staffTimeClock';
import { supabase } from '@/lib/supabase';
import { THRAWN_PROFILE_ID } from '@/lib/upcomingTasks';
import type { Profile, StaffTimeEntry as StaffTimeEntryRow } from '@/types/database';

export interface StaffTimeEntry extends StaffTimeEntryRow {
  employee?: Pick<Profile, 'id' | 'first_name' | 'last_name'> | null;
}

const REPORT_PAGE_SIZE = 1000;

async function fetchStaffTimeEntries(
  orgId: string,
  start: string,
  endExclusive: string,
  employeeId: string,
) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += REPORT_PAGE_SIZE) {
    let query = supabase.from('staff_time_entries')
      .select('*, employee:user_id(id, first_name, last_name)')
      .eq('org_id', orgId)
      .gte('clock_in', start)
      .lt('clock_in', endExclusive)
      .order('clock_in', { ascending: false })
      .range(from, from + REPORT_PAGE_SIZE - 1);
    if (employeeId) query = query.eq('user_id', employeeId);
    const page = await query;
    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < REPORT_PAGE_SIZE) return { data: rows, error: null };
  }
}

export function useStaffTimeClock() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<StaffTimeEntry[]>([]);
  const [activeEntry, setActiveEntry] = useState<StaffTimeEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) {
      setEntries([]);
      setActiveEntry(null);
      setIsLoading(false);
      return;
    }
    const today = localDayKey();
    const range = localDateRange(today, today)!;
    const [todayResult, activeResult] = await Promise.all([
      supabase.from('staff_time_entries').select('*')
        .eq('user_id', profile.id)
        .gte('clock_in', range.start)
        .lt('clock_in', range.endExclusive)
        .order('clock_in', { ascending: false }),
      supabase.from('staff_time_entries').select('*')
        .eq('user_id', profile.id)
        .is('clock_out', null)
        .maybeSingle(),
    ]);
    const firstError = todayResult.error ?? activeResult.error;
    setError(firstError?.message ?? null);
    if (!todayResult.error) setEntries((todayResult.data ?? []) as StaffTimeEntry[]);
    if (!activeResult.error) setActiveEntry((activeResult.data as StaffTimeEntry | null) ?? null);
    setIsLoading(false);
  }, [profile]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!profile) return;
    const channel = supabase.channel(`staff-clock:${profile.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'staff_time_entries', filter: `user_id=eq.${profile.id}`,
      }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [profile, refresh]);

  const runClockAction = useCallback(async (action: 'in' | 'out', reason?: 'lunch' | 'end_day') => {
    setIsSaving(true);
    const result = action === 'in'
      ? await supabase.rpc('staff_clock_in')
      : await supabase.rpc('staff_clock_out', { p_reason: reason });
    setIsSaving(false);
    setError(result.error?.message ?? null);
    if (!result.error) await refresh();
    return { ok: !result.error, message: result.error?.message ?? (action === 'in' ? 'Clocked in.' : 'Clocked out.') };
  }, [refresh]);

  return {
    entries,
    activeEntry,
    isLoading,
    isSaving,
    error,
    clockIn: () => runClockAction('in'),
    clockOut: (reason: 'lunch' | 'end_day') => runClockAction('out', reason),
    refresh,
  };
}

export function useStaffTimeReport(startDate: string, endDate: string, employeeId: string) {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<StaffTimeEntry[]>([]);
  const [employees, setEmployees] = useState<Pick<Profile, 'id' | 'first_name' | 'last_name'>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const range = localDateRange(startDate, endDate);
    if (!profile || profile.role !== 'owner_manager' || !range) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [entriesResult, employeesResult] = await Promise.all([
      fetchStaffTimeEntries(profile.org_id, range.start, range.endExclusive, employeeId),
      supabase.from('profiles').select('id, first_name, last_name')
        .eq('org_id', profile.org_id)
        .neq('id', THRAWN_PROFILE_ID)
        .order('first_name').order('last_name'),
    ]);
    const firstError = entriesResult.error ?? employeesResult.error;
    setError(firstError?.message ?? null);
    if (!entriesResult.error) {
      setEntries((entriesResult.data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        employee: (Array.isArray(row.employee) ? row.employee[0] : row.employee) ?? null,
      })) as unknown as StaffTimeEntry[]);
    }
    if (!employeesResult.error) setEmployees((employeesResult.data ?? []) as Pick<Profile, 'id' | 'first_name' | 'last_name'>[]);
    setIsLoading(false);
  }, [profile, startDate, endDate, employeeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const createEntry = useCallback(async (userId: string, clockIn: string, clockOut: string) => {
    const { error: mutationError } = await supabase.rpc('owner_create_staff_time_entry', {
      p_user_id: userId, p_clock_in: clockIn, p_clock_out: clockOut,
    });
    if (!mutationError) await refresh();
    return { ok: !mutationError, message: mutationError?.message ?? 'Missed hours added.' };
  }, [refresh]);

  const updateEntry = useCallback(async (id: string, clockIn: string, clockOut: string | null) => {
    const { error: mutationError } = await supabase.rpc('owner_update_staff_time_entry', {
      p_entry_id: id, p_clock_in: clockIn, p_clock_out: clockOut,
    });
    if (!mutationError) await refresh();
    return { ok: !mutationError, message: mutationError?.message ?? 'Hours updated.' };
  }, [refresh]);

  return { entries, employees, isLoading, error, refresh, createEntry, updateEntry };
}
