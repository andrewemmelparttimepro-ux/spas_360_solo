import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock3, Download, MapPin, Plus, RefreshCw, Save } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useStaffTimeReport, type StaffTimeEntry } from '@/hooks/useStaffTimeClock';
import {
  formatClockMinutes,
  localDateTimeToIso,
  localDayKey,
  payrollFileName,
  staffHoursCsv,
  timeEntriesMinutes,
  toLocalDateTimeInput,
} from '@/lib/staffTimeClock';

const employeeName = (person: { first_name: string; last_name: string } | null | undefined) =>
  person ? `${person.first_name} ${person.last_name}`.trim() : 'Unknown employee';

interface EntryDraft { clockIn: string; clockOut: string }

export default function StaffTimeReport() {
  const { toast } = useToast();
  const today = localDayKey();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [employeeId, setEmployeeId] = useState('');
  const { entries, employees, isLoading, error, refresh, createEntry, updateEntry } = useStaffTimeReport(startDate, endDate, employeeId);
  const [drafts, setDrafts] = useState<Record<string, EntryDraft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [addEmployee, setAddEmployee] = useState('');
  const [addClockIn, setAddClockIn] = useState('');
  const [addClockOut, setAddClockOut] = useState('');

  useEffect(() => {
    setDrafts(Object.fromEntries(entries.map(entry => [entry.id, {
      clockIn: toLocalDateTimeInput(entry.clock_in),
      clockOut: toLocalDateTimeInput(entry.clock_out),
    }])));
  }, [entries]);

  const totalMinutes = useMemo(() => timeEntriesMinutes(entries), [entries]);

  // Payroll export: the selected range and employee, as a CSV the payroll sheet can ingest.
  const exportCsv = () => {
    if (entries.length === 0) { toast('No hours in this range to export.', 'warning'); return; }
    const employee = employees.find(person => person.id === employeeId);
    const csv = staffHoursCsv(entries, startDate, endDate);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = payrollFileName(startDate, endDate, employee ? employeeName(employee) : undefined);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Payroll CSV downloaded.', 'success');
  };

  const save = async (entry: StaffTimeEntry) => {
    const draft = drafts[entry.id];
    const clockIn = localDateTimeToIso(draft?.clockIn ?? '');
    const clockOut = localDateTimeToIso(draft?.clockOut ?? '');
    if (!clockIn || (draft?.clockOut && !clockOut)) {
      toast('Enter valid clock-in and clock-out times.', 'warning');
      return;
    }
    setSavingId(entry.id);
    const result = await updateEntry(entry.id, clockIn, clockOut);
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'error');
  };

  const addMissedHours = async (event: FormEvent) => {
    event.preventDefault();
    const clockIn = localDateTimeToIso(addClockIn);
    const clockOut = localDateTimeToIso(addClockOut);
    if (!addEmployee || !clockIn || !clockOut || clockOut <= clockIn) {
      toast('Choose an employee and a valid start/end time.', 'warning');
      return;
    }
    setSavingId('new');
    const result = await createEntry(addEmployee, clockIn, clockOut);
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) {
      setAddClockIn('');
      setAddClockOut('');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-900" aria-labelledby="staff-hours-title">
      <header className="flex flex-col gap-3 border-b border-ink-700 bg-ink-850/70 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="staff-hours-title" className="flex items-center gap-2 text-lg font-bold text-ink-100"><Clock3 className="h-5 w-5 text-amber-500" /> Staff Hours</h2>
          <p className="mt-1 text-xs text-ink-500">Review hours and correct missed punches. Only owners can edit.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-500">From
            <input aria-label="Staff hours start date" type="date" value={startDate} max={endDate} onChange={event => setStartDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs font-normal normal-case tracking-normal text-ink-100" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-500">To
            <input aria-label="Staff hours end date" type="date" value={endDate} min={startDate} onChange={event => setEndDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs font-normal normal-case tracking-normal text-ink-100" />
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Employee
            <select aria-label="Filter staff hours by employee" value={employeeId} onChange={event => setEmployeeId(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs font-normal normal-case tracking-normal text-ink-100">
              <option value="">All Employees</option>
              {employees.map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}
            </select>
          </label>
        </div>
      </header>

      <form onSubmit={addMissedHours} className="grid gap-2 border-b border-ink-700 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <label className="text-xs font-semibold text-ink-400">Employee
          <select required value={addEmployee} onChange={event => setAddEmployee(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-100"><option value="">Select employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</select>
        </label>
        <label className="text-xs font-semibold text-ink-400">Clock in
          <input required type="datetime-local" value={addClockIn} onChange={event => setAddClockIn(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-100" />
        </label>
        <label className="text-xs font-semibold text-ink-400">Clock out
          <input required type="datetime-local" value={addClockOut} onChange={event => setAddClockOut(event.target.value)} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm text-ink-100" />
        </label>
        <button type="submit" disabled={savingId === 'new'} className="flex items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"><Plus className="h-4 w-4" /> Add missed hours</button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-5 py-3 text-sm">
        <span className="text-ink-500">{entries.length} time {entries.length === 1 ? 'entry' : 'entries'}</span>
        <div className="flex items-center gap-3">
          <span className="font-bold text-ink-100">Total: {formatClockMinutes(totalMinutes)}</span>
          <button type="button" onClick={exportCsv} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-bold text-ink-200 hover:bg-ink-800"><Download className="h-3.5 w-3.5" /> Export payroll CSV</button>
        </div>
      </div>

      {error && <div className="m-4 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"><span>{error}</span><button type="button" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /></button></div>}
      <div className="max-h-[32rem] space-y-2 overflow-y-auto p-4">
        {isLoading ? <p className="py-5 text-center text-sm text-ink-500">Loading staff hours…</p> : entries.length === 0 ? <p className="py-5 text-center text-sm text-ink-500">No staff hours match this date range.</p> : entries.map(entry => {
          const draft = drafts[entry.id] ?? { clockIn: '', clockOut: '' };
          return (
            <article key={entry.id} className="grid gap-2 rounded-lg border border-ink-700 bg-ink-850/70 p-3 lg:grid-cols-[minmax(10rem,1fr)_1fr_1fr_auto] lg:items-end">
              <div>
                <p className="text-sm font-bold text-ink-100">{employeeName(entry.employee)}</p>
                <p className="mt-1 text-xs text-ink-500">{formatClockMinutes(timeEntriesMinutes([entry]))}{entry.edited_at ? ' · Owner adjusted' : ''}{entry.acknowledged_incomplete_count > 0 ? ` · left ${entry.acknowledged_incomplete_count} task${entry.acknowledged_incomplete_count === 1 ? '' : 's'} open` : ''}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-500">
                  <MapPin className="h-3 w-3" />
                  {entry.clock_in_lat != null && entry.clock_in_lng != null
                    ? <a href={`https://maps.google.com/?q=${entry.clock_in_lat},${entry.clock_in_lng}`} target="_blank" rel="noreferrer" className="hover:text-brand-400">Punched in at {entry.clock_in_lat.toFixed(4)}, {entry.clock_in_lng.toFixed(4)}{entry.clock_in_accuracy_m ? ` (±${entry.clock_in_accuracy_m} m)` : ''}</a>
                    : 'No location shared'}
                  {entry.clock_in_ip ? ` · IP ${entry.clock_in_ip}` : ''}
                </p>
              </div>
              <label className="text-xs font-semibold text-ink-400">Clock in<input type="datetime-local" value={draft.clockIn} onChange={event => setDrafts(current => ({ ...current, [entry.id]: { ...draft, clockIn: event.target.value } }))} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-sm text-ink-100" /></label>
              <label className="text-xs font-semibold text-ink-400">Clock out<input type="datetime-local" value={draft.clockOut} onChange={event => setDrafts(current => ({ ...current, [entry.id]: { ...draft, clockOut: event.target.value } }))} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-sm text-ink-100" /></label>
              <button type="button" disabled={savingId === entry.id} onClick={() => void save(entry)} className="flex items-center justify-center gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs font-bold text-ink-200 hover:bg-ink-800 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
