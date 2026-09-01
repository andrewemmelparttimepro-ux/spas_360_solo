import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Workbook } from 'exceljs';
import { Copy, FileSpreadsheet, FolderOpen, GripVertical, LoaderCircle, PaintBucket, Pencil, Save, Trash2, Upload, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  INVENTORY_PROFITS_FOLDER,
  INVENTORY_PROFITS_SOURCE_SHA,
  MCHL_MAJOR_UNIT_SALES_FOLDER,
  OWNER_WORKBOOK_BUCKET,
  OWNER_WORKBOOK_MIME,
  WORKSHEET_ROW_HEADER_WIDTH_PX,
  cellEditorValue,
  cellStyle,
  columnLabel,
  duplicateWorkbookName,
  duplicateWorksheet,
  inventoryProfitsCellText,
  isXlsxFile,
  markWorkbookForRecalculation,
  normalizeWorkbookName,
  moveWorksheet,
  renameDefaultWorksheetToCovana,
  renameWorksheet,
  resizeWorksheetBoundary,
  setCellEditorValue,
  setWorksheetSelectionBackground,
  sha256Hex,
  sortOwnerWorkbooks,
  storagePath,
  visibleGridSize,
  worksheetFitScale,
  worksheetColumnWidthPx,
  worksheetGridWidth,
  worksheetRowHeightPx,
  type WorkbookSelection,
  type OwnerWorkbookFolder,
  type OwnerWorkbookRecord,
} from '@/lib/ownerWorkbooks';

const LIST_COLUMNS = 'id,org_id,folder_key,display_name,storage_path,mime_type,file_size_bytes,source_sha256,current_sha256,version,created_at,updated_at';
const CELL_BACKGROUND_PRESETS = [
  { label: 'Yellow', value: '#fff2cc' },
  { label: 'Red', value: '#f4cccc' },
  { label: 'Green', value: '#d9ead3' },
  { label: 'Blue', value: '#cfe2f3' },
] as const;

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

function ownerSheetIndexAtPoint(clientX: number, clientY: number): number | null {
  for (const element of document.querySelectorAll<HTMLElement>('[data-owner-sheet-index]')) {
    const bounds = element.getBoundingClientRect();
    if (clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom) {
      const index = Number(element.dataset.ownerSheetIndex);
      return Number.isInteger(index) ? index : null;
    }
  }
  return null;
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
  const [renamingSheetId, setRenamingSheetId] = useState<number | null>(null);
  const [sheetNameDraft, setSheetNameDraft] = useState('');
  const [draggingSheetId, setDraggingSheetId] = useState<number | null>(null);
  const [selection, setSelection] = useState<WorkbookSelection | null>(null);
  const [workbookPaneWidth, setWorkbookPaneWidth] = useState(0);
  const [renameTarget, setRenameTarget] = useState<OwnerWorkbookRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<OwnerWorkbookRecord | null>(null);
  const [uploadFolder, setUploadFolder] = useState<OwnerWorkbookFolder>(MCHL_MAJOR_UNIT_SALES_FOLDER);
  const uploadRef = useRef<HTMLInputElement>(null);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const activeVersionRef = useRef(1);
  const workbookPaneRef = useRef<HTMLDivElement>(null);
  const resizeGestureRef = useRef<{
    kind: 'column' | 'row';
    index: number;
    pointerId: number;
    startClient: number;
    startValue: number;
    scale: number;
    changed: boolean;
  } | null>(null);
  const sheetDragGestureRef = useRef<{
    sheetId: number;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    reordered: boolean;
    targetIndex: number | null;
  } | null>(null);
  const [, forceResizePreview] = useState(0);

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
  const majorUnitWorkbooks = sortOwnerWorkbooks(
    records.filter(record => record.folder_key === MCHL_MAJOR_UNIT_SALES_FOLDER),
  );

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

  const beginRename = (record: OwnerWorkbookRecord) => {
    setError(null);
    setRenameTarget(record);
    setRenameValue(record.display_name);
  };

  const saveRename = async () => {
    if (!renameTarget || profile?.role !== 'owner_manager' || !profile.id) return;
    const displayName = normalizeWorkbookName(renameValue);
    if (displayName.length < 6 || displayName.length > 200) {
      setError('Workbook names must be between 1 and 195 characters before .xlsx.');
      return;
    }
    if (displayName === renameTarget.display_name) {
      setRenameTarget(null);
      return;
    }
    setBusyId(`rename-${renameTarget.id}`);
    setError(null);
    const { data, error: renameError } = await supabase.from('owner_workbooks').update({
      display_name: displayName,
      updated_by: profile.id,
    }).eq('id', renameTarget.id).select(LIST_COLUMNS).single();
    setBusyId(null);
    if (renameError) {
      setError(renameError.code === '23505' ? 'A workbook with that name already exists in this folder.' : renameError.message);
      return;
    }
    setRecords(current => current.map(record => record.id === renameTarget.id ? data as OwnerWorkbookRecord : record));
    setRenameTarget(null);
  };

  const duplicateWorkbook = async (record: OwnerWorkbookRecord) => {
    if (profile?.role !== 'owner_manager' || !profile.org_id || !profile.id) {
      setError('Owner access is required.');
      return;
    }
    const displayName = duplicateWorkbookName(majorUnitWorkbooks.map(workbookRecord => workbookRecord.display_name), record.display_name);
    const path = storagePath(profile.org_id, record.folder_key);
    setBusyId(`duplicate-${record.id}`);
    setError(null);
    let copiedPathCreated = false;
    let metadataCreated = false;
    try {
      const { error: copyError } = await supabase.storage.from(OWNER_WORKBOOK_BUCKET).copy(record.storage_path, path);
      if (copyError) throw copyError;
      copiedPathCreated = true;
      const { data: signedCopy, error: signedCopyError } = await supabase.storage
        .from(OWNER_WORKBOOK_BUCKET)
        .createSignedUrl(path, 60);
      if (signedCopyError) throw signedCopyError;
      const copiedResponse = await fetch(signedCopy.signedUrl, { cache: 'no-store' });
      if (!copiedResponse.ok) throw new Error('The duplicated workbook could not be verified.');
      const copiedBytes = await copiedResponse.arrayBuffer();
      const copiedSha = await sha256Hex(copiedBytes);
      if (copiedSha !== record.current_sha256 || copiedBytes.byteLength !== record.file_size_bytes) {
        throw new Error('The duplicated workbook did not match the stored original.');
      }
      const { data, error: insertError } = await supabase.from('owner_workbooks').insert({
        org_id: profile.org_id,
        folder_key: record.folder_key,
        display_name: displayName,
        storage_path: path,
        mime_type: OWNER_WORKBOOK_MIME,
        file_size_bytes: copiedBytes.byteLength,
        source_sha256: copiedSha,
        current_sha256: copiedSha,
        created_by: profile.id,
        updated_by: profile.id,
      }).select(LIST_COLUMNS).single();
      if (insertError) throw insertError;
      metadataCreated = true;
      setRecords(current => [data as OwnerWorkbookRecord, ...current]);
    } catch (duplicateError) {
      if (copiedPathCreated && !metadataCreated) await supabase.storage.from(OWNER_WORKBOOK_BUCKET).remove([path]);
      setError(duplicateError instanceof Error ? duplicateError.message : 'The workbook could not be duplicated.');
    } finally {
      setBusyId(null);
    }
  };

  const deleteWorkbook = async () => {
    if (!deleteTarget || profile?.role !== 'owner_manager' || !profile.org_id) return;
    if (deleteTarget.org_id !== profile.org_id) {
      setError('This workbook does not belong to your dealership.');
      setDeleteTarget(null);
      return;
    }
    const target = deleteTarget;
    setBusyId(`delete-${target.id}`);
    setError(null);
    try {
      // Keep exact bytes in memory until the metadata delete succeeds so a
      // database failure cannot leave a workbook row pointing at a missing file.
      const { data: signed, error: signedError } = await supabase.storage
        .from(OWNER_WORKBOOK_BUCKET)
        .createSignedUrl(target.storage_path, 60);
      if (signedError) throw signedError;
      const storedResponse = await fetch(signed.signedUrl, { cache: 'no-store' });
      if (!storedResponse.ok) throw new Error('The workbook file could not be prepared for deletion.');
      const storedBytes = await storedResponse.arrayBuffer();
      if (storedBytes.byteLength !== target.file_size_bytes || await sha256Hex(storedBytes) !== target.current_sha256) {
        throw new Error('The stored workbook changed. Reload the page before deleting it.');
      }

      const { error: storageError } = await supabase.storage
        .from(OWNER_WORKBOOK_BUCKET)
        .remove([target.storage_path]);
      if (storageError) throw storageError;

      const { data: deleted, error: metadataError } = await supabase
        .from('owner_workbooks')
        .delete()
        .eq('id', target.id)
        .eq('org_id', profile.org_id)
        .select('id')
        .single();
      if (metadataError || deleted?.id !== target.id) {
        const { error: restoreError } = await supabase.storage.from(OWNER_WORKBOOK_BUCKET).upload(
          target.storage_path,
          storedBytes,
          { contentType: target.mime_type, upsert: false },
        );
        if (restoreError) {
          throw new Error(`The workbook metadata could not be deleted and its file could not be restored: ${restoreError.message}`);
        }
        throw metadataError ?? new Error('The workbook metadata could not be deleted.');
      }

      setRecords(current => current.filter(record => record.id !== target.id));
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The workbook could not be deleted.');
    } finally {
      setBusyId(null);
    }
  };

  const openWorkbook = async (record: OwnerWorkbookRecord) => {
    setBusyId(record.id);
    setError(null);
    try {
      // Generate a fresh signed URL for every open. Reusing the stable object
      // download URL can return a CDN-cached pre-autosave version immediately
      // after an overwrite, which makes a successful save appear to vanish.
      const { data: signed, error: signedError } = await supabase.storage
        .from(OWNER_WORKBOOK_BUCKET)
        .createSignedUrl(record.storage_path, 60);
      if (signedError) throw signedError;
      const response = await fetch(signed.signedUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('The workbook file could not be loaded.');
      const parsed = await parseWorkbook(await response.arrayBuffer());
      const renamedDefault = record.folder_key === INVENTORY_PROFITS_FOLDER
        ? renameDefaultWorksheetToCovana(parsed)
        : false;
      revisionRef.current = renamedDefault ? 1 : 0;
      savedRevisionRef.current = 0;
      setDirtyRevision(renamedDefault ? 1 : 0);
      setSaveState(renamedDefault ? 'unsaved' : 'saved');
      activeVersionRef.current = record.version;
      setActive(record);
      setWorkbook(parsed);
      setSheetIndex(0);
      setSelection(null);
      setEditingCell(null);
      setRenamingSheetId(null);
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

  useEffect(() => {
    const pane = workbookPaneRef.current;
    if (!pane) return;
    const updateWidth = () => setWorkbookPaneWidth(pane.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [active?.id]);

  const markDirty = () => {
    if (!workbook) return;
    markWorkbookForRecalculation(workbook);
    setDirtyRevision(current => {
      const next = current + 1;
      revisionRef.current = next;
      return next;
    });
  };

  const editCell = (rowNumber: number, columnNumber: number, value: string) => {
    if (!worksheet || !workbook) return;
    setCellEditorValue(worksheet.getCell(rowNumber, columnNumber), value);
    markDirty();
  };

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>, kind: 'column' | 'row', index: number) => {
    if (!worksheet) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeGestureRef.current = {
      kind,
      index,
      pointerId: event.pointerId,
      startClient: kind === 'column' ? event.clientX : event.clientY,
      startValue: kind === 'column'
        ? worksheet.getColumn(index).width ?? 16
        : worksheet.getRow(index).height ?? 24,
      scale: fitScale,
      changed: false,
    };
    setSelection(kind === 'column' ? { kind, column: index } : { kind, row: index });
    setEditingCell(null);
  };

  const continueResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = resizeGestureRef.current;
    if (!worksheet || !gesture || gesture.pointerId !== event.pointerId) return;
    const delta = (gesture.kind === 'column' ? event.clientX : event.clientY) - gesture.startClient;
    resizeWorksheetBoundary(worksheet, gesture.kind, gesture.index, gesture.startValue, delta, gesture.scale);
    gesture.changed = gesture.changed || Math.abs(delta) >= 1;
    forceResizePreview(current => current + 1);
  };

  const finishResize = (event: React.PointerEvent<HTMLButtonElement>) => {
    const gesture = resizeGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    resizeGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.changed) markDirty();
  };

  const beginSheetRename = (sheet: Workbook['worksheets'][number]) => {
    setError(null);
    setRenamingSheetId(sheet.id);
    setSheetNameDraft(sheet.name);
  };

  const commitSheetRename = (sheet: Workbook['worksheets'][number]) => {
    if (!workbook || renamingSheetId !== sheet.id) return;
    try {
      const previous = sheet.name;
      const next = renameWorksheet(workbook, sheet, sheetNameDraft);
      setRenamingSheetId(null);
      if (next !== previous) markDirty();
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'The sheet could not be renamed.');
    }
  };

  const duplicateSelectedSheet = () => {
    if (!workbook || !worksheet) return;
    try {
      const duplicate = duplicateWorksheet(workbook, worksheet);
      setSheetIndex(workbook.worksheets.findIndex(sheet => sheet.id === duplicate.id));
      setSelection(null);
      setEditingCell(null);
      setRenamingSheetId(null);
      markDirty();
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : 'The sheet could not be duplicated.');
    }
  };

  const beginSheetPointerDrag = (event: React.PointerEvent<HTMLElement>, sheetId: number) => {
    event.preventDefault();
    event.stopPropagation();
    sheetDragGestureRef.current = {
      sheetId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      reordered: false,
      targetIndex: null,
    };
    setDraggingSheetId(sheetId);
  };

  const continueSheetPointerDrag = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = sheetDragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.moved = gesture.moved
      || Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) >= 4;
    const targetIndex = ownerSheetIndexAtPoint(event.clientX, event.clientY);
    if (targetIndex != null) {
      gesture.targetIndex = targetIndex;
      const sourceIndex = workbook?.worksheets.findIndex(sheet => sheet.id === gesture.sheetId) ?? -1;
      if (workbook && sourceIndex >= 0 && sourceIndex !== targetIndex) {
        const activeSheetId = worksheet?.id;
        const nextIndex = moveWorksheet(workbook, gesture.sheetId, targetIndex);
        gesture.reordered = true;
        if (activeSheetId === gesture.sheetId) setSheetIndex(nextIndex);
        else setSheetIndex(Math.max(0, workbook.worksheets.findIndex(sheet => sheet.id === activeSheetId)));
        forceResizePreview(current => current + 1);
      }
    }
  };

  const finishSheetPointerDrag = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = sheetDragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    sheetDragGestureRef.current = null;
    setDraggingSheetId(null);
    if (!gesture.moved || !workbook) return;
    if (gesture.reordered) {
      markDirty();
      return;
    }
    const releaseTargetIndex = ownerSheetIndexAtPoint(event.clientX, event.clientY);
    const targetIndex = releaseTargetIndex ?? gesture.targetIndex;
    if (targetIndex == null || !Number.isInteger(targetIndex)) return;
    const activeSheetId = worksheet?.id;
    const nextIndex = moveWorksheet(workbook, gesture.sheetId, targetIndex);
    if (activeSheetId === gesture.sheetId) setSheetIndex(nextIndex);
    else setSheetIndex(Math.max(0, workbook.worksheets.findIndex(sheet => sheet.id === activeSheetId)));
    markDirty();
  };

  const cancelSheetPointerDrag = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = sheetDragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    sheetDragGestureRef.current = null;
    setDraggingSheetId(null);
  };

  const changeSelectedBackground = (color: string | null) => {
    if (!worksheet || !selection) return;
    setWorksheetSelectionBackground(worksheet, selection, color);
    markDirty();
  };

  const selectedCell = selection
    ? {
        row: selection.kind === 'column' ? 1 : selection.row,
        column: selection.kind === 'row' ? 1 : selection.column,
      }
    : null;
  const selectedWorksheetCell = worksheet && selectedCell
    ? worksheet.getCell(selectedCell.row, selectedCell.column)
    : null;
  const selectionLabel = selection?.kind === 'row'
    ? `row ${selection.row}`
    : selection?.kind === 'column'
      ? `column ${columnLabel(selection.column)}`
      : selectedWorksheetCell?.address ?? '';
  const selectionBackgroundLabel = selection?.kind === 'cell' ? 'Cell background' : 'Selection background';
  const selectedFill = selectedWorksheetCell?.fill?.type === 'pattern'
    ? selectedWorksheetCell.fill.fgColor?.argb
    : undefined;
  const selectedFillHex = selectedFill?.length === 8 ? `#${selectedFill.slice(2)}` : '#ffffff';
  const naturalGridWidth = worksheet && grid ? worksheetGridWidth(worksheet, grid.columns) : 0;
  // Keep the current sheet's zoom stable while one boundary changes. The grid
  // can grow into the scrollable pane without visually rescaling every column.
  const fitScale = useMemo(
    () => worksheetFitScale(workbookPaneWidth, naturalGridWidth),
    [active?.id, workbookPaneWidth, worksheet?.id],
  );

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
            onRename={beginRename}
            onDuplicate={record => void duplicateWorkbook(record)}
            onDelete={record => { setError(null); setDeleteTarget(record); }}
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
          <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-700 p-2">
            {workbook.worksheets.map((sheet, index) => (
              <div
                key={sheet.id}
                data-owner-sheet-index={index}
                onPointerMove={continueSheetPointerDrag}
                onPointerUp={finishSheetPointerDrag}
                onPointerCancel={cancelSheetPointerDrag}
                className={`group flex shrink-0 items-center rounded-md ${index === sheetIndex ? 'bg-amber-500 text-white' : 'bg-ink-800 text-ink-400 hover:text-ink-100'} ${draggingSheetId === sheet.id ? 'opacity-50' : ''}`}
                title="Click and hold, then drag to reorder"
              >
                <button
                  type="button"
                  aria-label={`Reorder sheet ${sheet.name}`}
                  title={`Drag to reorder ${sheet.name}`}
                  onPointerDown={event => beginSheetPointerDrag(event, sheet.id)}
                  className="ml-1 inline-flex h-7 w-4 touch-none items-center justify-center cursor-grab opacity-60 active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {renamingSheetId === sheet.id ? (
                  <input
                    autoFocus
                    aria-label={`Sheet name for ${sheet.name}`}
                    value={sheetNameDraft}
                    maxLength={31}
                    onChange={event => setSheetNameDraft(event.target.value)}
                    onBlur={() => commitSheetRename(sheet)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') { event.preventDefault(); commitSheetRename(sheet); }
                      if (event.key === 'Escape') { event.preventDefault(); setRenamingSheetId(null); setError(null); }
                    }}
                    className="mx-1 w-32 rounded bg-white px-2 py-1 text-xs font-bold text-ink-900 outline-none ring-2 ring-amber-300"
                  />
                ) : (
                  <button type="button" onClick={() => { setSheetIndex(index); setSelection(null); setEditingCell(null); }} onDoubleClick={() => beginSheetRename(sheet)} className="whitespace-nowrap px-2 py-1.5 text-xs font-bold">
                    {sheet.name}
                  </button>
                )}
                {renamingSheetId !== sheet.id && (
                  <button type="button" aria-label={`Rename sheet ${sheet.name}`} onClick={() => beginSheetRename(sheet)} className="mr-1 rounded p-1 opacity-60 hover:bg-black/10 hover:opacity-100">
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            <button type="button" onClick={duplicateSelectedSheet} className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-ink-700 px-2.5 py-1.5 text-xs font-bold text-ink-300 hover:border-amber-500" aria-label={`Duplicate sheet ${worksheet.name}`}>
              <Copy className="h-3.5 w-3.5" />Duplicate sheet
            </button>
          </div>
          <div aria-label="Workbook formatting controls" className="flex flex-wrap items-end gap-3 border-b border-ink-700 bg-ink-900 px-3 py-3">
            {selection && selectedCell && selectedWorksheetCell ? (
              <>
                <p className="self-center text-xs font-bold text-ink-300">Selected {selectionLabel}</p>
                <label className="text-[11px] font-semibold text-ink-400">
                  {selectionBackgroundLabel}
                  <span className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      aria-label={`Background color for ${selectionLabel}`}
                      value={selectedFillHex}
                      onChange={event => changeSelectedBackground(event.target.value)}
                      className="h-8 w-11 cursor-pointer rounded-md border border-ink-700 bg-ink-950 p-1"
                    />
                    {CELL_BACKGROUND_PRESETS.map(preset => (
                      <button
                        key={preset.value}
                        type="button"
                        aria-label={`Set background ${preset.label.toLowerCase()} for ${selectionLabel}`}
                        title={preset.label}
                        onClick={() => changeSelectedBackground(preset.value)}
                        style={{ backgroundColor: preset.value }}
                        className="h-8 w-8 rounded-md border border-ink-700"
                      />
                    ))}
                    <button type="button" onClick={() => changeSelectedBackground(null)} className="rounded-md border border-ink-700 px-2 py-1.5 text-xs font-bold text-ink-300 hover:border-amber-500">Clear</button>
                  </span>
                </label>
              </>
            ) : (
              <p className="flex items-center gap-2 text-xs text-ink-500"><PaintBucket className="h-4 w-4" />Select a cell, row number, or column letter to format it. Drag a row or column boundary to resize.</p>
            )}
          </div>
          {grid.clipped && <p className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">This sheet is large. The editor shows the first {grid.rows} rows and {grid.columns} columns.</p>}
          <div ref={workbookPaneRef} className="max-h-[62vh] overflow-auto">
            <div style={{ width: `${naturalGridWidth * fitScale}px` }}>
              <table
                aria-label={`${worksheet.name} worksheet at ${Math.round(fitScale * 100)}% scale`}
                className="table-fixed border-collapse text-xs"
                style={{ zoom: fitScale, width: `${naturalGridWidth}px` }}
              >
                <colgroup>
                  <col style={{ width: `${WORKSHEET_ROW_HEADER_WIDTH_PX}px` }} />
                  {columns.map(column => <col key={column} style={{ width: `${worksheetColumnWidthPx(worksheet, column)}px` }} />)}
                </colgroup>
                <thead className="sticky top-0 z-20 bg-ink-800">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-10 border border-ink-700 bg-ink-800" />
                    {columns.map(column => (
                      <th key={column} className="relative border border-ink-700 p-0 text-center font-bold text-ink-400">
                        <button
                          type="button"
                          aria-label={`Select column ${columnLabel(column)}`}
                          aria-pressed={selection?.kind === 'column' && selection.column === column}
                          onClick={() => { setSelection({ kind: 'column', column }); setEditingCell(null); }}
                          className={`w-full overflow-hidden px-2 py-1 ${selection?.kind === 'column' && selection.column === column ? 'bg-amber-500 text-white' : 'hover:bg-ink-700 hover:text-ink-100'}`}
                        >
                          {columnLabel(column)}
                        </button>
                        <button
                          type="button"
                          aria-label={`Resize column ${columnLabel(column)}`}
                          title={`Drag to resize column ${columnLabel(column)}`}
                          onPointerDown={event => beginResize(event, 'column', column)}
                          onPointerMove={continueResize}
                          onPointerUp={finishResize}
                          onPointerCancel={finishResize}
                          className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none bg-transparent hover:bg-amber-400/60"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row} style={{ height: `${worksheetRowHeightPx(worksheet, row)}px` }}>
                      <th className="sticky left-0 z-10 overflow-hidden border border-ink-700 bg-ink-800 p-0 text-right font-bold text-ink-400">
                        <span className="relative block overflow-hidden" style={{ height: `${worksheetRowHeightPx(worksheet, row)}px` }}>
                          <button
                            type="button"
                            aria-label={`Select row ${row}`}
                            aria-pressed={selection?.kind === 'row' && selection.row === row}
                            onClick={() => { setSelection({ kind: 'row', row }); setEditingCell(null); }}
                            className={`h-full w-full overflow-hidden px-2 leading-none ${selection?.kind === 'row' && selection.row === row ? 'bg-amber-500 text-white' : 'hover:bg-ink-700 hover:text-ink-100'}`}
                          >
                            {row}
                          </button>
                          <button
                            type="button"
                            aria-label={`Resize row ${row}`}
                            title={`Drag to resize row ${row}`}
                            onPointerDown={event => beginResize(event, 'row', row)}
                            onPointerMove={continueResize}
                            onPointerUp={finishResize}
                            onPointerCancel={finishResize}
                            className="absolute -bottom-1 left-0 z-10 h-2 w-full cursor-row-resize touch-none bg-transparent hover:bg-amber-400/60"
                          />
                        </span>
                      </th>
                      {columns.map(column => {
                        const cell = worksheet.getCell(row, column);
                        const editorKey = `${worksheet.id}:${cell.address}`;
                        return (
                          <td key={column} className="overflow-hidden border border-ink-700 p-0">
                            <input
                              aria-label={`${worksheet.name} ${cell.address}`}
                              value={editingCell === editorKey
                                ? cellEditorValue(cell.value)
                                : active.folder_key === INVENTORY_PROFITS_FOLDER
                                  ? inventoryProfitsCellText(worksheet, cell)
                                  : cell.text}
                              onFocus={() => { setEditingCell(editorKey); setSelection({ kind: 'cell', row, column }); }}
                              onBlur={() => setEditingCell(current => current === editorKey ? null : current)}
                              onChange={event => editCell(row, column, event.target.value)}
                              style={{
                                ...cellStyle(cell),
                                height: `${worksheetRowHeightPx(worksheet, row)}px`,
                              }}
                              className="block w-full min-w-0 truncate bg-transparent px-2 text-ink-100 outline-none focus:ring-2 focus:ring-inset focus:ring-amber-500"
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
        </div>
      ) : null}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="rename-workbook-heading">
          <form
            onSubmit={event => { event.preventDefault(); void saveRename(); }}
            className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl"
          >
            <h3 id="rename-workbook-heading" className="text-lg font-bold text-ink-100">Rename workbook</h3>
            <p className="mt-1 text-sm text-ink-500">The stored workbook stays in MCHL Major Unit Sales.</p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
            <label className="mt-4 block text-xs font-bold text-ink-300">
              Workbook name
              <input
                autoFocus
                value={renameValue}
                onChange={event => setRenameValue(event.target.value)}
                maxLength={200}
                className="mt-1.5 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-amber-500"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRenameTarget(null)} className="rounded-lg border border-ink-700 px-3 py-2 text-sm font-bold text-ink-300 hover:border-amber-500">Cancel</button>
              <button type="submit" disabled={busyId === `rename-${renameTarget.id}`} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60">
                {busyId === `rename-${renameTarget.id}` && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Save name
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-workbook-heading">
          <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
            <h3 id="delete-workbook-heading" className="text-lg font-bold text-ink-100">Delete workbook?</h3>
            <p className="mt-2 text-sm text-ink-400">
              Confirm that you want to permanently delete <span className="font-bold text-ink-100">{deleteTarget.display_name}</span> from MCHL Major Unit Sales.
            </p>
            {error && <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-500">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} disabled={busyId === `delete-${deleteTarget.id}`} className="rounded-lg border border-ink-700 px-3 py-2 text-sm font-bold text-ink-300 hover:border-amber-500 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => void deleteWorkbook()} disabled={busyId === `delete-${deleteTarget.id}`} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
                {busyId === `delete-${deleteTarget.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Confirm delete
              </button>
            </div>
          </div>
        </div>
      )}
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
  onRename,
  onDuplicate,
  onDelete,
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
  onRename?: (record: OwnerWorkbookRecord) => void;
  onDuplicate?: (record: OwnerWorkbookRecord) => void;
  onDelete?: (record: OwnerWorkbookRecord) => void;
}) {
  return (
    <article className="rounded-xl border border-ink-700 bg-ink-950/50 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600"><FolderOpen className="h-4 w-4" /></span>
        <div><h3 className="font-bold text-ink-100">{title}</h3><p className="mt-1 text-xs leading-relaxed text-ink-500">{description}</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {records.map(record => {
          const recordBusy = busyId === record.id || busyId === `rename-${record.id}` || busyId === `duplicate-${record.id}` || busyId === `delete-${record.id}`;
          return (
            <div key={record.id} className="flex items-stretch gap-2 rounded-lg border border-ink-700 bg-ink-900 p-1.5">
              <button type="button" onClick={() => onOpen(record)} disabled={recordBusy} className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-2 py-1 text-left hover:bg-ink-800 disabled:opacity-60">
                <span className="min-w-0"><span className="block truncate text-sm font-bold text-ink-100">{record.display_name}</span></span>
                {busyId === record.id ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 shrink-0 text-amber-500" />}
              </button>
              {onRename && onDuplicate && onDelete && (
                <div className="flex items-center gap-1 border-l border-ink-700 pl-1.5">
                  <button type="button" aria-label={`Rename ${record.display_name}`} title="Rename" onClick={() => onRename(record)} disabled={recordBusy} className="rounded-md p-2 text-ink-400 hover:bg-ink-800 hover:text-amber-500 disabled:opacity-50"><Pencil className="h-4 w-4" /></button>
                  <button type="button" aria-label={`Duplicate ${record.display_name}`} title="Duplicate" onClick={() => onDuplicate(record)} disabled={recordBusy} className="rounded-md p-2 text-ink-400 hover:bg-ink-800 hover:text-amber-500 disabled:opacity-50">
                    {busyId === `duplicate-${record.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button type="button" onClick={() => onDelete(record)} disabled={recordBusy} className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-bold text-red-500 hover:bg-red-500/10 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" />Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!records.length && <button type="button" onClick={onEmptyAction} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{emptyAction}</button>}
        {!!records.length && onUpload && <button type="button" onClick={onUpload} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-3 py-2 text-xs font-bold text-ink-300 hover:border-amber-500 disabled:opacity-60"><Upload className="h-3.5 w-3.5" />Add another workbook</button>}
      </div>
    </article>
  );
}
