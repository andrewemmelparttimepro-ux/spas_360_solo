import type { SupabaseClient } from '@supabase/supabase-js';
import { errorMessage, recordMigrationEvent, sha256, type MigrationProvider } from './migration-core.js';
import {
  accessTokenFor,
  providerObjectTypes,
  scanHubSpotPage,
  scanJobberPage,
  type ProviderConnection,
  type SourceRecordInput,
} from './migration-providers.js';

type MigrationRun = {
  id: string;
  org_id: string;
  connection_id: string | null;
  source_run_id: string | null;
  run_type: 'scan' | 'import' | 'rollback';
  provider: MigrationProvider;
  status: string;
  phase: string;
  progress: number;
  cursor: Record<string, unknown>;
  totals: Record<string, unknown>;
  started_by: string;
};

type SourceRecord = {
  id: string;
  org_id: string;
  connection_id: string;
  run_id: string;
  provider: MigrationProvider;
  object_type: string;
  source_id: string;
  source_updated_at: string | null;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  disposition: string;
  issues: string[];
};

const IMPORT_BATCH_SIZE = 25;
const ROLLBACK_TABLES = new Set(['contacts', 'properties', 'deals', 'jobs', 'tasks', 'notes']);

function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function dateValue(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateOnly(value: unknown): string | null {
  const full = dateValue(value);
  return full ? full.slice(0, 10) : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function associationIds(record: SourceRecord, type: string): string[] {
  const associations = record.normalized.associations as Record<string, unknown> | undefined;
  const values = associations?.[type];
  return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
}

async function externalDestination(
  service: SupabaseClient,
  orgId: string,
  provider: MigrationProvider,
  objectType: string,
  sourceId: string,
): Promise<{ destination_table: string; destination_id: string } | null> {
  const { data } = await service
    .from('migration_external_links')
    .select('destination_table, destination_id')
    .eq('org_id', orgId)
    .eq('provider', provider)
    .eq('object_type', objectType)
    .eq('source_id', sourceId)
    .maybeSingle();
  return data as { destination_table: string; destination_id: string } | null;
}

async function linkDestination(
  service: SupabaseClient,
  run: MigrationRun,
  record: SourceRecord,
  destinationTable: string,
  destinationId: string,
) {
  const { error } = await service.from('migration_external_links').upsert({
    org_id: run.org_id,
    provider: run.provider,
    object_type: record.object_type,
    source_id: record.source_id,
    destination_table: destinationTable,
    destination_id: destinationId,
    first_run_id: run.id,
    last_run_id: run.id,
    last_source_updated_at: record.source_updated_at,
  }, { onConflict: 'org_id,provider,object_type,source_id' });
  if (error) throw new Error(`Could not save source link: ${error.message}`);
}

async function recordChange(
  service: SupabaseClient,
  run: MigrationRun,
  record: SourceRecord,
  table: string,
  id: string,
  operation: 'insert' | 'update',
  beforeData: Record<string, unknown> | null,
  afterData: Record<string, unknown>,
) {
  const { error } = await service.from('migration_changes').insert({
    org_id: run.org_id,
    run_id: run.id,
    source_record_id: record.id,
    destination_table: table,
    destination_id: id,
    operation,
    before_data: beforeData,
    after_data: afterData,
  });
  if (error) throw new Error(`Could not save rollback evidence: ${error.message}`);
}

async function markSource(service: SupabaseClient, record: SourceRecord, disposition: string, table?: string, id?: string, issue?: string) {
  const issues = issue ? [...(record.issues || []), issue] : record.issues || [];
  await service.from('migration_source_records').update({
    disposition,
    destination_table: table ?? null,
    destination_id: id ?? null,
    issues,
  }).eq('id', record.id);
}

async function importContact(service: SupabaseClient, run: MigrationRun, record: SourceRecord): Promise<'imported'> {
  const source = record.normalized;
  const isHubSpot = run.provider === 'hubspot';
  const firstName = text(isHubSpot ? source.firstname : source.firstName) || (text(source.name).split(/\s+/)[0] ?? '') || 'Unknown';
  const lastName = text(isHubSpot ? source.lastname : source.lastName) || text(source.name).split(/\s+/).slice(1).join(' ');
  const email = text(source.email) || null;
  const phone = text(isHubSpot ? (source.phone || source.mobilephone) : source.phone);
  const addressObject = source.billingAddress as Record<string, unknown> | undefined;
  const address = isHubSpot
    ? [source.address, source.city, source.state, source.zip, source.country].map(text).filter(Boolean).join(', ')
    : addressObject
      ? [addressObject.street1, addressObject.street2, addressObject.city, addressObject.province, addressObject.postalCode, addressObject.country].map(text).filter(Boolean).join(', ')
      : '';
  const lifecycle = text(source.lifecyclestage).toLowerCase();
  const customerType = lifecycle.includes('customer') || source.isLead === false ? 'Customer'
    : lifecycle.includes('opportun') ? 'Prospect' : 'Lead';
  const desired = {
    org_id: run.org_id,
    location_id: null,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    mailing_address: address || null,
    lead_source: 'Other',
    customer_type: customerType,
    assigned_to: run.started_by,
    tags: [run.provider === 'hubspot' ? 'Imported from HubSpot' : 'Imported from Jobber'],
    last_activity_at: record.source_updated_at,
  };

  const linked = await externalDestination(service, run.org_id, run.provider, record.object_type, record.source_id);
  let existing: Record<string, unknown> | null = null;
  if (linked?.destination_table === 'contacts') {
    const { data } = await service.from('contacts').select('*').eq('id', linked.destination_id).maybeSingle();
    existing = data;
  }
  if (!existing && email) {
    const { data } = await service.from('contacts').select('*').eq('org_id', run.org_id).ilike('email', email).limit(1).maybeSingle();
    existing = data;
  }
  if (!existing && phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length >= 7) {
      const { data } = await service.from('contacts').select('*').eq('org_id', run.org_id).eq('phone', phone).limit(1).maybeSingle();
      existing = data;
    }
  }

  let destinationId: string;
  if (existing?.id) {
    destinationId = String(existing.id);
    const existingTags = Array.isArray(existing.tags) ? existing.tags.map(String) : [];
    const merged = {
      first_name: text(existing.first_name) || desired.first_name,
      last_name: text(existing.last_name) || desired.last_name,
      email: text(existing.email) || desired.email,
      phone: text(existing.phone) || desired.phone,
      mailing_address: text(existing.mailing_address) || desired.mailing_address,
      assigned_to: existing.assigned_to || desired.assigned_to,
      tags: Array.from(new Set([...existingTags, ...desired.tags])),
      last_activity_at: desired.last_activity_at || existing.last_activity_at,
    };
    const { data, error } = await service.from('contacts').update(merged).eq('id', destinationId).select('*').single();
    if (error) throw error;
    await recordChange(service, run, record, 'contacts', destinationId, 'update', existing, data as Record<string, unknown>);
  } else {
    const { data, error } = await service.from('contacts').insert(desired).select('*').single();
    if (error || !data?.id) throw error || new Error('Contact insert returned no id');
    destinationId = String(data.id);
    await recordChange(service, run, record, 'contacts', destinationId, 'insert', null, data as Record<string, unknown>);
  }
  await linkDestination(service, run, record, 'contacts', destinationId);
  await markSource(service, record, 'imported', 'contacts', destinationId);
  return 'imported';
}

async function defaultLocation(service: SupabaseClient, run: MigrationRun): Promise<string> {
  const { data: profile } = await service.from('profiles').select('location_id').eq('id', run.started_by).single();
  if (profile?.location_id) return String(profile.location_id);
  const { data } = await service.from('locations').select('id').eq('org_id', run.org_id).order('name').limit(1).single();
  if (!data?.id) throw new Error('No SPAS 360 location exists for imported jobs');
  return String(data.id);
}

async function importDeal(service: SupabaseClient, run: MigrationRun, record: SourceRecord): Promise<'imported' | 'skipped'> {
  const contactSource = associationIds(record, 'contacts')[0];
  if (!contactSource) {
    await markSource(service, record, 'needs_review', undefined, undefined, 'HubSpot deal has no associated contact');
    return 'skipped';
  }
  const contact = await externalDestination(service, run.org_id, run.provider, 'contacts', contactSource);
  if (!contact || contact.destination_table !== 'contacts') {
    await markSource(service, record, 'needs_review', undefined, undefined, 'Associated HubSpot contact was not imported');
    return 'skipped';
  }
  const source = record.normalized;
  const stageKey = text(source.dealstage).toLowerCase();
  const stageName = stageKey.includes('closedwon') || stageKey.includes('closed_won') ? 'Closed - Won'
    : stageKey.includes('closedlost') || stageKey.includes('closed_lost') ? 'Closed - Lost'
    : null;
  let stageQuery = service.from('pipeline_stages').select('id').eq('org_id', run.org_id);
  stageQuery = stageName ? stageQuery.eq('name', stageName) : stageQuery.order('position').limit(1);
  const { data: stage } = await stageQuery.limit(1).single();
  if (!stage?.id) throw new Error('No destination pipeline stage is available');
  const priorityRaw = text(source.hs_priority).toLowerCase();
  const desired = {
    org_id: run.org_id,
    contact_id: contact.destination_id,
    stage_id: stage.id,
    title: text(source.dealname) || `Imported HubSpot deal ${record.source_id}`,
    amount: numberValue(source.amount),
    priority: priorityRaw.includes('high') ? 'High' : priorityRaw.includes('low') ? 'Low' : 'Medium',
    expected_close_date: dateOnly(source.closedate),
    assigned_to: run.started_by,
    product_interest: [],
    lead_source: 'Other',
    location_id: null,
  };
  const linked = await externalDestination(service, run.org_id, run.provider, record.object_type, record.source_id);
  if (linked?.destination_table === 'deals') {
    const { data: before } = await service.from('deals').select('*').eq('id', linked.destination_id).single();
    const { data, error } = await service.from('deals').update(desired).eq('id', linked.destination_id).select('*').single();
    if (error) throw error;
    await recordChange(service, run, record, 'deals', linked.destination_id, 'update', before as Record<string, unknown>, data as Record<string, unknown>);
    await linkDestination(service, run, record, 'deals', linked.destination_id);
    await markSource(service, record, 'imported', 'deals', linked.destination_id);
    return 'imported';
  }
  const { data, error } = await service.from('deals').insert(desired).select('*').single();
  if (error || !data?.id) throw error || new Error('Deal insert returned no id');
  await recordChange(service, run, record, 'deals', String(data.id), 'insert', null, data as Record<string, unknown>);
  await linkDestination(service, run, record, 'deals', String(data.id));
  await markSource(service, record, 'imported', 'deals', String(data.id));
  return 'imported';
}

async function importJob(service: SupabaseClient, run: MigrationRun, record: SourceRecord): Promise<'imported' | 'skipped'> {
  const source = record.normalized;
  const client = source.client as Record<string, unknown> | undefined;
  const clientSourceId = text(client?.id);
  const contact = clientSourceId ? await externalDestination(service, run.org_id, run.provider, 'clients', clientSourceId) : null;
  if (!contact || contact.destination_table !== 'contacts') {
    await markSource(service, record, 'needs_review', undefined, undefined, 'Jobber job has no imported client');
    return 'skipped';
  }
  const rawType = text(source.jobType).toLowerCase();
  const jobType = rawType.includes('deliver') ? 'Delivery'
    : rawType.includes('install') ? 'Installation'
      : rawType.includes('warrant') ? 'Warranty'
        : rawType.includes('maint') ? 'Maintenance'
          : rawType.includes('pickup') ? 'Pickup' : 'Repair';
  const rawStatus = text(source.jobStatus).toLowerCase();
  const status = rawStatus.includes('complete') || rawStatus.includes('closed') ? 'Completed'
    : rawStatus.includes('cancel') || rawStatus.includes('archive') ? 'Cancelled' : 'In Progress';
  const desired = {
    org_id: run.org_id,
    contact_id: contact.destination_id,
    property_id: null,
    location_id: await defaultLocation(service, run),
    title: text(source.title) || `Jobber job ${text(source.jobNumber) || record.source_id}`,
    job_type: jobType,
    status,
    description: text(source.instructions) || null,
    scheduled_at: dateValue(source.startAt),
    estimated_duration: source.startAt && source.endAt
      ? Math.max(0, Math.round((new Date(String(source.endAt)).getTime() - new Date(String(source.startAt)).getTime()) / 60000))
      : null,
    priority: null,
    amount_to_collect: numberValue(source.uninvoicedTotal),
    created_by: run.started_by,
  };
  const linked = await externalDestination(service, run.org_id, run.provider, record.object_type, record.source_id);
  if (linked?.destination_table === 'jobs') {
    const { data: before } = await service.from('jobs').select('*').eq('id', linked.destination_id).single();
    const { data, error } = await service.from('jobs').update(desired).eq('id', linked.destination_id).select('*').single();
    if (error) throw error;
    await recordChange(service, run, record, 'jobs', linked.destination_id, 'update', before as Record<string, unknown>, data as Record<string, unknown>);
    await linkDestination(service, run, record, 'jobs', linked.destination_id);
    await markSource(service, record, 'imported', 'jobs', linked.destination_id);
    return 'imported';
  }
  const { data, error } = await service.from('jobs').insert(desired).select('*').single();
  if (error || !data?.id) throw error || new Error('Job insert returned no id');
  await recordChange(service, run, record, 'jobs', String(data.id), 'insert', null, data as Record<string, unknown>);
  await linkDestination(service, run, record, 'jobs', String(data.id));
  await markSource(service, record, 'imported', 'jobs', String(data.id));
  return 'imported';
}

async function activityDestination(service: SupabaseClient, run: MigrationRun, record: SourceRecord) {
  for (const type of ['contacts', 'deals']) {
    const sourceId = associationIds(record, type)[0];
    if (!sourceId) continue;
    const link = await externalDestination(service, run.org_id, run.provider, type, sourceId);
    if (link) return link;
  }
  return null;
}

async function importHubSpotActivity(service: SupabaseClient, run: MigrationRun, record: SourceRecord): Promise<'imported' | 'skipped'> {
  const source = record.normalized;
  const destination = await activityDestination(service, run, record);
  if (!destination) {
    await markSource(service, record, 'needs_review', undefined, undefined, 'HubSpot activity has no imported contact or deal association');
    return 'skipped';
  }
  if (record.object_type === 'tasks') {
    const due = dateValue(source.hs_timestamp);
    if (!due) {
      await markSource(service, record, 'needs_review', undefined, undefined, 'HubSpot task has no valid due date');
      return 'skipped';
    }
    const rawPriority = text(source.hs_task_priority).toLowerCase();
    const desired = {
      org_id: run.org_id,
      assigned_to: run.started_by,
      deal_id: destination.destination_table === 'deals' ? destination.destination_id : null,
      contact_id: destination.destination_table === 'contacts' ? destination.destination_id : null,
      job_id: null,
      title: text(source.hs_task_subject) || 'Imported HubSpot task',
      description: text(source.hs_task_body) || null,
      due_at: due,
      priority: rawPriority.includes('high') ? 'High' : rawPriority.includes('low') ? 'Low' : 'Medium',
      status: text(source.hs_task_status).toLowerCase().includes('complete') ? 'Completed' : 'Pending',
      task_type: 'HubSpot',
      created_by: run.started_by,
    };
    const { data, error } = await service.from('tasks').insert(desired).select('*').single();
    if (error || !data?.id) throw error || new Error('Task insert returned no id');
    await recordChange(service, run, record, 'tasks', String(data.id), 'insert', null, data as Record<string, unknown>);
    await linkDestination(service, run, record, 'tasks', String(data.id));
    await markSource(service, record, 'imported', 'tasks', String(data.id));
    return 'imported';
  }

  const bodyFields: Record<string, unknown[]> = {
    notes: [source.hs_note_body],
    calls: [source.hs_call_title, source.hs_call_body],
    emails: [source.hs_email_subject, source.hs_email_text || source.hs_email_html],
    meetings: [source.hs_meeting_title, source.hs_meeting_body],
  };
  const body = (bodyFields[record.object_type] || []).map(text).filter(Boolean).join('\n\n');
  if (!body) {
    await markSource(service, record, 'preserved', undefined, undefined, `HubSpot ${record.object_type} had no readable body; raw record preserved`);
    return 'skipped';
  }
  const desired = {
    contact_id: destination.destination_table === 'contacts' ? destination.destination_id : null,
    deal_id: destination.destination_table === 'deals' ? destination.destination_id : null,
    job_id: null,
    body: `[Imported from HubSpot ${record.object_type.slice(0, -1)}]\n${body}`,
    created_by: run.started_by,
    created_at: dateValue(source.hs_timestamp || source.hs_createdate) || new Date().toISOString(),
  };
  const { data, error } = await service.from('notes').insert(desired).select('*').single();
  if (error || !data?.id) throw error || new Error('Note insert returned no id');
  await recordChange(service, run, record, 'notes', String(data.id), 'insert', null, data as Record<string, unknown>);
  await linkDestination(service, run, record, 'notes', String(data.id));
  await markSource(service, record, 'imported', 'notes', String(data.id));
  return 'imported';
}

async function importRecord(service: SupabaseClient, run: MigrationRun, record: SourceRecord): Promise<'imported' | 'skipped'> {
  if (run.provider === 'hubspot' && record.object_type === 'contacts') return importContact(service, run, record);
  if (run.provider === 'jobber' && record.object_type === 'clients') return importContact(service, run, record);
  if (run.provider === 'hubspot' && record.object_type === 'deals') return importDeal(service, run, record);
  if (run.provider === 'jobber' && record.object_type === 'jobs') return importJob(service, run, record);
  if (run.provider === 'hubspot' && ['tasks', 'notes', 'calls', 'emails', 'meetings'].includes(record.object_type)) {
    return importHubSpotActivity(service, run, record);
  }
  await markSource(service, record, 'preserved');
  return 'skipped';
}

async function processScan(service: SupabaseClient, run: MigrationRun) {
  if (!run.connection_id) throw new Error('Scan has no provider connection');
  const { data: rawConnection, error: connectionError } = await service
    .from('migration_connections')
    .select('id, org_id, provider, credentials_ciphertext, token_expires_at')
    .eq('id', run.connection_id)
    .eq('org_id', run.org_id)
    .single();
  if (connectionError || !rawConnection) throw new Error('Provider connection was not found');
  const connection = rawConnection as ProviderConnection;
  const accessToken = await accessTokenFor(service, connection);
  const objectTypes = providerObjectTypes(run.provider);
  const objectIndex = Number(run.cursor.objectIndex || 0);
  const pageCursor = typeof run.cursor.pageCursor === 'string' ? run.cursor.pageCursor : null;
  if (objectIndex >= objectTypes.length) return finishScan(service, run);

  const page = run.provider === 'hubspot'
    ? await scanHubSpotPage(accessToken, objectIndex, pageCursor)
    : await scanJobberPage(accessToken, objectIndex, pageCursor);
  if (page.records.length) {
    const rows = page.records.map(record => sourceRow(run, connection.id, record));
    const { error } = await service.from('migration_source_records').upsert(rows, { onConflict: 'run_id,object_type,source_id' });
    if (error) throw new Error(`Could not stage provider records: ${error.message}`);
  }
  const counts = { ...(run.totals.counts as unknown as Record<string, number> || {}) };
  for (const record of page.records) counts[record.objectType] = (counts[record.objectType] || 0) + 1;
  const nextIndex = page.hasNext ? objectIndex : objectIndex + 1;
  const progress = Math.min(99, Math.floor((nextIndex / objectTypes.length) * 100));
  const totals = { ...run.totals, counts, records: Object.values(counts).reduce((sum, value) => sum + value, 0) };
  const { error } = await service.from('migration_runs').update({
    status: 'running',
    phase: page.hasNext ? `scanning_${objectTypes[objectIndex]}` : `scanned_${objectTypes[objectIndex]}`,
    progress,
    cursor: { objectIndex: nextIndex, pageCursor: page.hasNext ? page.nextCursor : null },
    totals,
    started_at: run.status === 'queued' ? new Date().toISOString() : undefined,
  }).eq('id', run.id);
  if (error) throw error;
  if (nextIndex >= objectTypes.length && !page.hasNext) await finishScan(service, { ...run, totals });
}

function sourceRow(run: MigrationRun, connectionId: string, record: SourceRecordInput) {
  return {
    org_id: run.org_id,
    connection_id: connectionId,
    run_id: run.id,
    provider: run.provider,
    object_type: record.objectType,
    source_id: record.sourceId,
    source_updated_at: dateValue(record.sourceUpdatedAt),
    raw: record.raw,
    normalized: record.normalized ?? {},
    checksum: sha256(JSON.stringify(record.raw)),
    disposition: record.disposition ?? 'staged',
    issues: record.issues ?? [],
  };
}

async function finishScan(service: SupabaseClient, run: MigrationRun) {
  const { count: issueCount } = await service.from('migration_source_records')
    .select('id', { count: 'exact', head: true }).eq('run_id', run.id).eq('disposition', 'needs_review');
  await service.from('migration_runs').update({
    status: 'awaiting_review',
    phase: 'preview_ready',
    progress: 100,
    totals: { ...run.totals, issues: issueCount || 0 },
    completed_at: new Date().toISOString(),
  }).eq('id', run.id);
  if (run.connection_id) await service.from('migration_connections').update({ last_scan_at: new Date().toISOString(), last_error: null }).eq('id', run.connection_id);
  await recordMigrationEvent(service, { orgId: run.org_id, actorId: run.started_by, runId: run.id, connectionId: run.connection_id, type: 'scan_completed', detail: run.totals });
}

async function processImport(service: SupabaseClient, run: MigrationRun) {
  if (!run.source_run_id) throw new Error('Import has no approved scan');
  const { data: records, error } = await service.from('migration_source_records')
    .select('*')
    .eq('run_id', run.source_run_id)
    .eq('disposition', 'ready')
    .order('created_at')
    .limit(IMPORT_BATCH_SIZE);
  if (error) throw error;
  if (!records?.length) {
    const totals = run.totals || {};
    const failed = Number(totals.failed || 0);
    const completion = new Date().toISOString();
    await service.from('migration_runs').update({
      status: 'completed',
      phase: failed > 0 ? 'completed_with_exceptions' : 'verified',
      progress: 100,
      error: failed > 0 ? `${failed} source record${failed === 1 ? '' : 's'} could not be imported; review the migration ledger or roll back this import.` : null,
      completed_at: completion,
    }).eq('id', run.id);
    await service.from('migration_runs').update({
      status: 'completed',
      phase: failed > 0 ? 'imported_with_exceptions' : 'imported',
      completed_at: completion,
    }).eq('id', run.source_run_id).eq('status', 'awaiting_review');
    await recordMigrationEvent(service, { orgId: run.org_id, actorId: run.started_by, runId: run.id, connectionId: run.connection_id, type: 'import_completed', detail: totals });
    return;
  }
  const totals = { imported: 0, skipped: 0, failed: 0, ...run.totals } as Record<string, number>;
  for (const raw of records as SourceRecord[]) {
    try {
      const result = await importRecord(service, run, raw);
      totals[result] = (totals[result] || 0) + 1;
    } catch (recordError) {
      totals.failed = (totals.failed || 0) + 1;
      await markSource(service, raw, 'failed', undefined, undefined, errorMessage(recordError));
    }
  }
  const { count: remaining } = await service.from('migration_source_records')
    .select('id', { count: 'exact', head: true }).eq('run_id', run.source_run_id).eq('disposition', 'ready');
  const processed = (totals.imported || 0) + (totals.skipped || 0) + (totals.failed || 0);
  const progress = remaining ? Math.min(99, Math.max(1, Math.round(processed / (processed + remaining) * 100))) : 99;
  await service.from('migration_runs').update({
    status: 'running',
    phase: remaining ? 'importing' : 'reconciling',
    progress,
    totals,
    started_at: run.status === 'queued' ? new Date().toISOString() : undefined,
  }).eq('id', run.id);
}

async function processRollback(service: SupabaseClient, run: MigrationRun) {
  if (!run.source_run_id) throw new Error('Rollback has no import run');
  const { data: changes, error } = await service.from('migration_changes')
    .select('*')
    .eq('run_id', run.source_run_id)
    .is('rolled_back_at', null)
    .order('created_at', { ascending: false })
    .limit(IMPORT_BATCH_SIZE);
  if (error) throw error;
  if (!changes?.length) {
    await service.from('migration_runs').update({ status: 'completed', phase: 'rolled_back', progress: 100, completed_at: new Date().toISOString() }).eq('id', run.id);
    await recordMigrationEvent(service, { orgId: run.org_id, actorId: run.started_by, runId: run.id, type: 'rollback_completed', detail: run.totals });
    return;
  }
  const totals = { restored: 0, removed: 0, failed: 0, ...run.totals } as Record<string, number>;
  for (const change of changes) {
    try {
      const table = String(change.destination_table);
      if (!ROLLBACK_TABLES.has(table)) throw new Error(`Rollback table ${table} is not allowed`);
      if (change.operation === 'insert') {
        const { error: deleteError } = await service.from(table).delete().eq('id', change.destination_id);
        if (deleteError) throw deleteError;
        totals.removed += 1;
      } else {
        const before = { ...(change.before_data || {}) } as Record<string, unknown>;
        delete before.id;
        const { error: updateError } = await service.from(table).update(before).eq('id', change.destination_id);
        if (updateError) throw updateError;
        totals.restored += 1;
      }
      await service.from('migration_changes').update({ rolled_back_at: new Date().toISOString() }).eq('id', change.id);
    } catch {
      totals.failed += 1;
    }
  }
  await service.from('migration_runs').update({ status: 'running', phase: 'rolling_back', progress: 50, totals }).eq('id', run.id);
}

export async function processMigrationRun(service: SupabaseClient, runId: string, orgId: string): Promise<void> {
  const { data, error } = await service.from('migration_runs').select('*').eq('id', runId).eq('org_id', orgId).single();
  if (error || !data) throw Object.assign(new Error('Migration run not found'), { statusCode: 404 });
  const run = data as MigrationRun;
  if (['completed', 'failed', 'cancelled', 'awaiting_review'].includes(run.status)) return;
  try {
    if (run.run_type === 'scan') await processScan(service, run);
    else if (run.run_type === 'import') await processImport(service, run);
    else await processRollback(service, run);
  } catch (error) {
    await service.from('migration_runs').update({ status: 'failed', phase: 'failed', error: errorMessage(error), completed_at: new Date().toISOString() }).eq('id', run.id);
    if (run.connection_id) await service.from('migration_connections').update({ last_error: errorMessage(error) }).eq('id', run.connection_id);
    await recordMigrationEvent(service, { orgId: run.org_id, actorId: run.started_by, runId: run.id, connectionId: run.connection_id, type: 'run_failed', detail: { error: errorMessage(error) } });
    throw error;
  }
}
