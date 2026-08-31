import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Workbook } from 'exceljs';
import { FileSpreadsheet, FolderOpen, LoaderCircle, Save, Upload, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  INVENTORY_PROFITS_FOLDER,
  INVENTORY_PROFITS_SOURCE_SHA,
  MCHL_MAJOR_UNIT_SALES_FOLDER,
  OWNER_WORKBOOK_BUCKET,
  OWNER_WORKBOOK_MIME,
  cellEditorValue,
  cellStyle,
  columnLabel,
  isXlsxFile,
  markWorkbookForRecalculation,
  setCellEditorValue,
  sha256Hex,
  storagePath,
  visibleGridSize,
  type OwnerWorkbookFolder,
  type OwnerWorkbookRecord,
} from '@/lib/ownerWorkbooks';

const LIST_COLUMNS = 'id,org_id,folder_key,display_name,storage_path,mime_type,file_size_bytes,source_sha256,current_sha256,version,created_at,updated_at';

async function parseWorkbook(bytes: ArrayBuffer): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Buffer);
  if (!workbook.worksheets.length) throw new Error('This workbook does not contain any worksheets.');
  markWorkbookForRecalculation(workbook);
  return workbook;
}

function workbookBytes(buffer: ArrayBuffer | Uint8Array): Uint8Array {
  return buffer instanceof Uint8Array ? new Uint8Array(buffer) : new Uint8Array(buffer);
}

export function OwnerWorkbookLibrary() {
  const { profile, session } = useAuth();
  const [records, setRecords] = useState<OwnerWorkbookRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<OwnerWorkbookRecord | null>(null);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'saving' | 'error'>('saved');
  const [editingCell, setEditingCell] = useState<string | null>(null);
  const [uploadFolder, setUploadFolder] = useState<OwnerWorkbookFolder>(MCHL_MAJOR_UNIT_SALES_FOLDER);
  const uploadRef = useRef<HTMLInputElement>(null);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const activeVersionRef = useRef(1);

  const loadRecords = useCallback(async () => {
    if (profile?.role !== 'owner_manager' || !profile.org_id) return;
    setIsLoading(true);
    const { data, error: loadError } = await supabase
      .from('owner_workbooks')
      .select(LIST_COLUMNS)
      .order('updated_at', { ascending: false });
    setIsLoading(false);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRecords((data ?? []) as OwnerWorkbookRecord[]);
  }, [profile?.org_id, profile?.role]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  const inventoryWorkbook = records.find(record => record.folder_key === INVENTORY_PROFITS_FOLDER);
  const majorUnitWorkbooks = records.filter(record => record.folder_key === MCHL_MAJOR_UNIT_SALES_FOLDER);

  const importBytes = async (folder: OwnerWorkbookFolder, displayName: string, bytes: ArrayBuffer, expectedSha?: string) => {
    if (profile?.role !== 'owner_manager' || !profile.org_id || !profile.id) throw new Error('Owner access is required.');
    if (!bytes.byteLength || bytes.byteLength > 20 * 1024 * 1024) throw new Error('The workbook must be between 1 byte and 20 MB.');
    await parseWorkbook(bytes);
    const sourceSha = await sha256Hex(bytes);
    if (expectedSha && sourceSha !== expectedSha) throw new Error('The source workbook did not match its verified original.');
    const path = storagePath(profile.org_id, folder);
    const { error: uploadError } = await supabase.storage.from(OWNER_WORKBOOK_BUCKET).upload(path, bytes, {
      contentType: OWNER_WORKBOOK_MIME,
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { error: insertError } = await supabase.from('owner_workbooks').insert({
      org_id: profile.org_id,
      folder_key: folder,
      display_name: displayName,
      storage_path: path,
      mime_type: OWNER_WORKBOOK_MIME,
      file_size_bytes: bytes.byteLength,
      source_sha256: sourceSha,
      current_sha256: sourceSha,
      created_by: profile.id,
      updated_by: profile.id,
    });
    if (insertError) {
      await supabase.storage.from(OWNER_WORKBOOK_BUCKET).remove([path]);
      throw insertError;
    }
    await loadRecords();
  };

  const setupInventoryProfits = async () => {
    if (!session?.access_token) {
      setError('Your session expired. Sign in again to set up Inventory Profits.');
      return;
    }
    setBusyId('inventory-seed');
    setError(null);
    try {
      const response = await fetch('/api/owners/inventory-profits', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('Inventory Profits could not be loaded.');
      await importBytes(
        INVENTORY_PROFITS_FOLDER,
        'Inventory Profits.xlsx',
        await response.arrayBuffer(),
        INVENTORY_PROFITS_SOURCE_SHA,
      );
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Inventory Profits could not be set up.');
    } finally {
      setBusyId(null);
    }
  };

  const chooseUpload = (folder: OwnerWorkbookFolder) => {
    setUploadFolder(folder);
    uploadRef.current?.click();
  };

  const uploadSelected = async (file: File | undefined) => {
    if (!file) return;
    if (!isXlsxFile(file)) {
      setError('Choose an .xlsx workbook no larger than 20 MB.');
      return;
    }
    setBusyId('upload');
    setError(null);
    try {
      await importBytes(uploadFolder, file.name, await file.arrayBuffer());
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'The workbook could not be uploaded.');
    } finally {
      setBusyId(null);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const openWorkbook = async (record: OwnerWorkbookRecord) => {
    setBusyId(record.id);
    setError(null);
    try {
      const { data, error: downloadError } = await supabase.storage.from(OWNER_WORKBOOK_BUCKET).download(record.storage_path);
      if (downloadError) throw downloadError;
      const parsed = await parseWorkbook(await data.arrayBuffer());
      revisionRef.current = 0;
      savedRevisionRef.current = 0;
      setDirtyRevision(0);
      setSaveState('saved');
      activeVersionRef.current = record.version;
      setActive(record);
      setWorkbook(parsed);
      setSheetIndex(0);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'The workbook could not be opened.');
    } finally {
      setBusyId(null);
    }
  };

  const saveNow = async (): Promise<void> => {
    if (!active || !workbook || profile?.role !== 'owner_manager' || !profile.id) return;
    if (savePromiseRef.current) {
      await savePromiseRef.current;
      if (savedRevisionRef.current < revisionRef.current) return saveNow();
      return;
    }
    if (savedRevisionRef.current >= revisionRef.current) return;
    const targetRevision = revisionRef.current;
    savePromiseRef.current = (async () => {
      setSaveState('saving');
      markWorkbookForRecalculation(workbook);
      const bytes = workbookBytes(await workbook.xlsx.writeBuffer());
      const currentSha = await sha256Hex(bytes);
      const { error: storageError } = await supabase.storage.from(OWNER_WORKBOOK_BUCKET).update(active.storage_path, bytes, {
        contentType: OWNER_WORKBOOK_MIME,
        upsert: false,
      });
      if (storageError) throw storageError;
      const nextVersion = activeVersionRef.current + 1;
      const { error: metadataError } = await supabase.from('owner_workbooks').update({
        file_size_bytes: bytes.byteLength,
        current_sha256: currentSha,
        version: nextVersion,
        updated_by: profile.id,
      }).eq('id', active.id).select('id').single();
      if (metadataError) throw metadataError;
      activeVersionRef.current = nextVersion;
      savedRevisionRef.current = targetRevision;
      setActive(current => current ? {
        ...current,
        file_size_bytes: bytes.byteLength,
        current_sha256: currentSha,
        version: nextVersion,
      } : current);
      setRecords(current => current.map(record => record.id === active.id ? {
        ...record,
        file_size_bytes: bytes.byteLength,
        current_sha256: currentSha,
        version: nextVersion,
      } : record));
      setSaveState(revisionRef.current === targetRevision ? 'saved' : 'unsaved');
    })();
    try {
      await savePromiseRef.current;
    } catch (saveError) {
      setSaveState('error');
      setError(saveError instanceof Error ? saveError.message : 'Changes could not be saved.');
      throw saveError;
    } finally {
      savePromiseRef.current = null;
    }
  };

  useEffect(() => {
    if (!workbook || !active || dirtyRevision <= savedRevisionRef.current) return;
    setSaveState('unsaved');
    const timer = window.setTimeout(() => { void saveNow().catch(() => undefined); }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirtyRevision, active?.id]);

  const closeEditor = async () => {
    try {
      await saveNow();
      setActive(null);
      setWorkbook(null);
    } catch {
      // Keep the editor open so an owner never mistakes a failed save for a close.
    }
  };

  const worksheet = workbook?.worksheets[sheetIndex] ?? null;
  const grid = worksheet ? visibleGridSize(worksheet) : null;
  const columns = useMemo(() => grid ? Array.from({ length: grid.columns }, (_, index) => index + 1) : [], [grid?.columns]);
  const rows = useMemo(() => grid ? Array.from({ length: grid.rows }, (_, index) => index + 1) : [], [grid?.rows]);

  const editCell = (rowNumber: number, columnNumber: number, value: string) => {
    if (!worksheet || !workbook) return;
    setCellEditorValue(worksheet.getCell(rowNumber, columnNumber), value);
    markWorkbookForRecalculation(workbook);
    setDirtyRevision(current => {
      const next = current + 1;
      revisionRef.current = next;
      return next;
    });
  };

  return (
    <section aria-labelledby="owner-workbooks-heading" className="rounded-2xl border border-amber-500/30 bg-ink-900 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Private workbook library</p>
          <h2 id="owner-workbooks-heading" className="mt-1 text-lg font-bold text-ink-100">Owner Workbooks</h2>
          <p className="mt-1 text-sm text-ink-500">Open, edit, and autosave dealership Excel workbooks without downloading a new copy.</p>
        </div>
        {active && (
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-500">
            {saveState === 'saving' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'error' ? 'Save failed' : 'Unsaved changes'}
          </div>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
      <input
        ref={uploadRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={event => void uploadSelected(event.target.files?.[0])}
      />

      {isLoading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading workbooks…</div>
      ) : !active ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <WorkbookFolder
            title="Inventory Profits"
            description="The verified profitability workbook, kept editable with formulas and formatting intact."
            records={inventoryWorkbook ? [inventoryWorkbook] : []}
            emptyAction="Set up Inventory Profits"
            busy={busyId === 'inventory-seed'}
            onEmptyAction={() => void setupInventoryProfits()}
            onOpen={record => void openWorkbook(record)}
            busyId={busyId}
          />
          <WorkbookFolder
            title="MCHL Major Unit Sales"
            description="Store the 2020 Major Unit Deals workbook and future MCHL major-unit workbooks here."
            records={majorUnitWorkbooks}
            emptyAction="Upload Excel workbook"
            busy={busyId === 'upload'}
            onEmptyAction={() => chooseUpload(MCHL_MAJOR_UNIT_SALES_FOLDER)}
            onOpen={record => void openWorkbook(record)}
            onUpload={() => chooseUpload(MCHL_MAJOR_UNIT_SALES_FOLDER)}
            busyId={busyId}
          />
        </div>
      ) : workbook && worksheet && grid ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-bold text-ink-100"><FileSpreadsheet className="h-4 w-4 text-amber-500" />{active.display_name}</div>
            <button type="button" onClick={() => void closeEditor()} disabled={saveState === 'saving'} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-700 px-3 py-1.5 text-xs font-bold text-ink-300 hover:border-amber-500 disabled:opacity-50">
              <X className="h-3.5 w-3.5" />Close workbook
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto border-b border-ink-700 p-2">
            {workbook.worksheets.map((sheet, index) => (
              <button key={`${sheet.id}-${sheet.name}`} type="button" onClick={() => setSheetIndex(index)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-bold ${index === sheetIndex ? 'bg-amber-500 text-white' : 'bg-ink-800 text-ink-400 hover:text-ink-100'}`}>
                {sheet.name}
              </button>
            ))}
          </div>
          {grid.clipped && <p className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">This sheet is large. The editor shows the first {grid.rows} rows and {grid.columns} columns.</p>}
          <div className="max-h-[62vh] overflow-auto">
            <table className="border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-ink-800">
                <tr><th className="sticky left-0 z-30 min-w-10 border border-ink-700 bg-ink-800" />{columns.map(column => <th key={column} className="min-w-28 border border-ink-700 px-2 py-1 text-center font-bold text-ink-400">{columnLabel(column)}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row}>
                    <th className="sticky left-0 z-10 border border-ink-700 bg-ink-800 px-2 text-right font-bold text-ink-400">{row}</th>
                    {columns.map(column => {
                      const cell = worksheet.getCell(row, column);
                      const editorKey = `${worksheet.id}:${cell.address}`;
                      return (
                        <td key={column} className="border border-ink-700 p-0">
                          <input
                            aria-label={`${worksheet.name} ${cell.address}`}
                            value={editingCell === editorKey ? cellEditorValue(cell.value) : cell.text}
                            onFocus={() => setEditingCell(editorKey)}
                            onBlur={() => setEditingCell(current => current === editorKey ? null : current)}
                            onChange={event => editCell(row, column, event.target.value)}
                            style={{
                              ...cellStyle(cell),
                              minWidth: `${Math.max(8, worksheet.getColumn(column).width ?? 16) * 7}px`,
                              height: `${Math.max(24, worksheet.getRow(row).height ?? 24) * 1.25}px`,
                            }}
                            className="h-8 min-w-28 bg-transparent px-2 text-ink-100 outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function WorkbookFolder({
  title,
  description,
  records,
  emptyAction,
  busy,
  busyId,
  onEmptyAction,
  onOpen,
  onUpload,
}: {
  title: string;
  description: string;
  records: OwnerWorkbookRecord[];
  emptyAction: string;
  busy: boolean;
  busyId: string | null;
  onEmptyAction: () => void;
  onOpen: (record: OwnerWorkbookRecord) => void;
  onUpload?: () => void;
}) {
  return (
    <article className="rounded-xl border border-ink-700 bg-ink-950/50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"><FolderOpen className="h-4 w-4" /></span>
        <div><h3 className="font-bold text-ink-100">{title}</h3><p className="mt-1 text-xs leading-relaxed text-ink-500">{description}</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {records.map(record => (
          <button key={record.id} type="button" onClick={() => onOpen(record)} disabled={busyId === record.id} className="flex w-full items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-left hover:border-amber-500 disabled:opacity-60">
            <span className="min-w-0"><span className="block truncate text-sm font-bold text-ink-100">{record.display_name}</span><span className="block text-[11px] text-ink-500">Autosaved version {record.version}</span></span>
            {busyId === record.id ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 shrink-0 text-amber-500" />}
          </button>
        ))}
        {!records.length && <button type="button" onClick={onEmptyAction} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{emptyAction}</button>}
        {!!records.length && onUpload && <button type="button" onClick={onUpload} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-xs font-bold text-ink-300 hover:border-amber-500 disabled:opacity-60"><Upload className="h-3.5 w-3.5" />Add another workbook</button>}
      </div>
    </article>
  );
}
