import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { jobberClient } from './api-client.mjs';

const stage = process.argv[2];
const account = process.argv[3];
const connectionId = process.argv[4];
const phase = process.argv[5] || 'base';
const RELATION_BATCH = 5;
if (!stage || !['magic_city', 'spas_etc'].includes(account) || !connectionId) throw new Error('Pass private staging directory, account key, connection id, and phase');
const api = await jobberClient(connectionId);
if (api.accountName !== ({ magic_city: 'Magic City Home Leisure', spas_etc: 'Spas Etc' })[account]) throw new Error('Account mismatch');
const schema = JSON.parse(readFileSync(join(stage, 'api-schema.json'), 'utf8')).data.__schema;
const types = Object.fromEntries(schema.types.map(t => [t.name, t]));
const rootFields = Object.fromEntries(types[schema.queryType.name].fields.map(f => [f.name, f]));
const named = t => t.name || named(t.ofType);
const scalar = t => ['SCALAR', 'ENUM'].includes(types[named(t)]?.kind);
const requiredArgs = f => f.args.some(a => a.type.kind === 'NON_NULL' && a.defaultValue == null);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const directory = join(stage, account, process.env.JOBBER_CAPTURE_SET || '');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const save = (path, value) => { const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 }); renameSync(temporary, path); };
const references = new Set(['Account', 'Client', 'Job', 'Quote', 'Invoice', 'Request', 'Property', 'Visit', 'User', 'Expense', 'TimeSheetEntry', 'Task', 'ProductOrService']);
const excluded = new Set(process.env.JOBBER_EXTENDED ? ['MessageInterfaceConnection'] : ['User', 'UserConnection', 'TimeSheetEntryConnection', 'TaskConnection', 'MessageInterfaceConnection', 'NoteCreatedByUnion']);
const skipped = new Set();

function baseSelection(name, depth = 0, seen = []) {
  const type = types[name];
  if (!type || depth > 5 || seen.includes(name)) return '__typename';
  if (depth > 0 && name.endsWith('Note') && type.fields?.some(f => f.name === 'id')) return '__typename id';
  if (type.kind === 'UNION' || type.kind === 'INTERFACE') {
    return `__typename ${type.possibleTypes.map(t => `... on ${t.name} { ${baseSelection(t.name, depth, [...seen, name])} }`).join(' ')}`;
  }
  if (depth > 0 && (references.has(name) || name.startsWith('CustomFieldConfiguration'))) {
    return '__typename ' + type.fields.filter(f => ['id', 'name', 'title', 'jobNumber', 'quoteNumber', 'invoiceNumber', 'jobberWebUri'].includes(f.name) && scalar(f.type)).map(f => f.name).join(' ');
  }
  const result = ['__typename'];
  for (const f of type.fields || []) {
    const target = named(f.type);
    // Jobber's derived staff-address name returns HTTP 500; actual address fields remain readable.
    if (name === 'UserAddress' && f.name === 'name') { skipped.add(`${name}.${f.name}`); continue; }
    if (requiredArgs(f) || f.isDeprecated || target.endsWith('Connection') || excluded.has(target) || f.name === 'franchiseTokenLastFour' || (!process.env.JOBBER_EXTENDED && f.name === 'customFieldConfiguration')) {
      skipped.add(`${name}.${f.name}`); continue;
    }
    if (scalar(f.type)) result.push(f.name);
    else if (types[target]?.kind === 'OBJECT' || ['UNION', 'INTERFACE'].includes(types[target]?.kind)) {
      result.push(`${f.name} { ${baseSelection(target, depth + 1, [...seen, name])} }`);
    }
  }
  return result.join(' ');
}

const collections = ['clients', 'jobs', 'properties', 'quotes', 'requests', 'invoices', 'visits', 'paymentRecords', 'expenses', 'products', 'taxRates', 'customFieldConfigurations', ...(process.env.JOBBER_EXTENDED ? ['users', 'tasks', 'timeSheetEntries', 'vehicles', 'payoutRecords', 'expenseUploadDocuments', 'expenseUploads', 'marketingTasks', 'socialMarketingItems'] : [])];
const single = { clients: 'client', jobs: 'job', properties: 'property', quotes: 'quote', requests: 'request', invoices: 'invoice', visits: 'visit', paymentRecords: 'paymentRecord', expenses: 'expense', products: 'product' };
const relations = {
  clients: ['notes', 'noteAttachments', 'tags', 'clientProperties', 'contacts'],
  jobs: ['notes', 'noteAttachments', 'lineItems', 'visits', 'invoices', 'paymentRecords'],
  properties: ['contacts'],
  quotes: ['notes', 'noteAttachments', 'lineItems', 'jobs', 'depositRecords', 'unallocatedDepositRecords'],
  requests: ['notes', 'noteAttachments', 'lineItems', 'jobs', 'quotes'],
  invoices: ['notes', 'noteAttachments', 'lineItems', 'jobs', 'properties', 'visits', 'paymentRecords'],
  visits: ['lineItems', 'notes'],
  paymentRecords: ['allocations', 'refunds'],
};

function nodeType(connectionType) {
  return named(types[connectionType].fields.find(f => f.name === 'nodes').type);
}
function relationSelection(collection, field) {
  const parentType = nodeType(named(rootFields[collection].type));
  const f = types[parentType].fields?.find(f => f.name === field) || types[parentType].possibleTypes?.map(t => types[t.name].fields.find(f => f.name === field)).find(Boolean);
  if (!f) throw new Error(`Missing relation ${parentType}.${field}`);
  const child = nodeType(named(f.type));
  const referenceOnly = ['jobs', 'visits', 'invoices', 'properties', 'clientProperties', 'quotes', 'paymentRecords'].includes(field);
  const select = baseSelection(child, referenceOnly ? 1 : 0);
  return { parentType, select, query: `${field}(first:10) { nodes { ${select} } pageInfo { hasNextPage endCursor } }` };
}

async function checked(query, variables) {
  const result = await api.query(query, variables);
  if (result.errors?.length) {
    const path = join(directory, `error-${Date.now()}.json`);
    save(path, { query, variables, result });
    throw new Error(JSON.stringify(result.errors).slice(0, 1600));
  }
  const cost = result.extensions?.cost;
  if (cost && cost.throttleStatus.currentlyAvailable < cost.requestedQueryCost + 300) {
    const wait = (cost.requestedQueryCost + 300 - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.restoreRate * 1000;
    await new Promise(resolve => setTimeout(resolve, Math.min(30000, wait)));
  }
  return result;
}

const reportPath = join(directory, `${phase}-report.json`);
if (process.env.JOBBER_QUERY_ONLY) { console.log(baseSelection(process.env.JOBBER_QUERY_ONLY)); process.exit(0); }
if (process.env.JOBBER_IDS_FILE) {
  const collection = process.env.JOBBER_COLLECTION;
  if (!single[collection]) throw new Error('Delta capture requires one supported collection');
  const type = nodeType(named(rootFields[collection].type));
  const fields = relations[collection] || [];
  const selections = Object.fromEntries(fields.map(field => [field, relationSelection(collection, field)]));
  const deltaFolder = join(stage, account, 'delta'); mkdirSync(deltaFolder, { recursive: true, mode: 0o700 });
  for (const id of JSON.parse(readFileSync(process.env.JOBBER_IDS_FILE, 'utf8'))) {
    const result = await checked(`query { record:${single[collection]}(id:${JSON.stringify(id)}) { ${baseSelection(type)} ${fields.map(field => selections[field].query).join(' ')} } }`, {});
    const record = result.data.record;
    if (record?.id !== id) throw new Error('Delta identity changed');
    for (const field of fields) {
      const connection = record[field], seen = new Set();
      while (connection?.pageInfo.hasNextPage) {
        const cursor = connection.pageInfo.endCursor;
        if (!cursor || seen.has(cursor)) throw new Error('Delta relation cursor repeated'); seen.add(cursor);
        const more = await checked(`query { record:${single[collection]}(id:${JSON.stringify(id)}) { ${field}(first:100,after:${JSON.stringify(cursor)}) { nodes { ${selections[field].select} } pageInfo { hasNextPage endCursor } } } }`, {});
        connection.nodes.push(...more.data.record[field].nodes); connection.pageInfo = more.data.record[field].pageInfo;
      }
    }
    save(join(deltaFolder, `${collection}-${hash(id)}.json`), { capturedAt: new Date().toISOString(), collection, records: [record] });
    console.log(account, collection, 'delta captured');
  }
  process.exit(0);
}
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : { account, accountId: api.accountId, phase, startedAt: new Date().toISOString(), collections: {} };
collectionsLoop: for (const collection of collections) {
  if (phase === 'relations' && !relations[collection]) continue;
  if (process.env.JOBBER_COLLECTION && !process.env.JOBBER_COLLECTION.split(',').includes(collection)) continue;
  const field = rootFields[collection];
  const type = nodeType(named(field.type));
  const outPath = join(directory, `${collection}.json`);
  if (phase === 'base') {
    if (report.collections[collection]?.complete && existsSync(outPath)) continue;
    const selection = baseSelection(type);
    const rows = []; let cursor = null; let expected; let page = 0; let finished = false;
    for (const saved of readdirSync(directory).filter(name => name.startsWith(`${collection}-base-`)).sort()) {
      const capture = JSON.parse(readFileSync(join(directory, saved), 'utf8'));
      if (capture.variables.cursor !== cursor || capture.result.errors?.length) throw new Error('Invalid extraction checkpoint');
      const data = capture.result.data[collection];
      expected ??= data.totalCount; rows.push(...data.nodes); page++;
      cursor = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
      finished = !data.pageInfo.hasNextPage;
    }
    if (!finished) {
    do {
      const pageSize = collection === 'products' ? 100 : 25;
      const query = `query Extract($cursor:String) { ${collection}(first:${pageSize},after:$cursor) { nodes { ${selection} } pageInfo { hasNextPage endCursor } ${page === 0 ? 'totalCount' : ''} } }`;
      save(join(directory, 'current-query.json'), { query, variables: { cursor } });
      let result;
      try { result = await checked(query, { cursor }); }
      catch (error) {
        if (['expenseUploadDocuments', 'expenseUploads', 'marketingTasks', 'socialMarketingItems'].includes(collection) && /hidden due to permissions/.test(String(error))) {
          report.collections[collection] = { complete: false, unavailable: true, reason: String(error), capturedAt: new Date().toISOString() };
          save(reportPath, report); console.log(account, collection, 'unavailable from this Jobber account'); continue collectionsLoop;
        }
        throw error;
      }
      const data = result.data[collection];
      if (!data) throw new Error(`Missing ${collection}`);
      expected ??= data.totalCount;
      rows.push(...data.nodes);
      save(join(directory, `${collection}-base-${String(page++).padStart(4, '0')}.json`), { capturedAt: new Date().toISOString(), query, variables: { cursor }, result });
      if (data.pageInfo.hasNextPage && (!data.pageInfo.endCursor || data.pageInfo.endCursor === cursor)) throw new Error('Pagination did not advance');
      cursor = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
      if (page % 10 === 0) console.log(account, collection, rows.length, '/', expected);
    } while (cursor);
    }
    const unique = new Map(); let repeatedIdentical = 0;
    for (const row of rows) {
      const prior = unique.get(row.id);
      if (prior && hash(prior) !== hash(row)) throw new Error(`Conflicting duplicate ${collection} source IDs`);
      if (prior) repeatedIdentical++;
      unique.set(row.id, row);
    }
    if (repeatedIdentical) { rows.splice(0, rows.length, ...unique.values()); console.log(account, collection, repeatedIdentical, 'identical pagination repeats preserved in source pages'); }
    if (expected !== rows.length) throw new Error(`${collection} count changed: ${expected} vs ${rows.length}`);
    save(outPath, rows);
    report.collections[collection] = { complete: true, count: rows.length, repeatedIdentical, checksum: hash(rows) };
    console.log(account, collection, rows.length, 'base captured');
  } else {
    const rows = JSON.parse(readFileSync(outPath, 'utf8'));
    const fields = relations[collection];
    const selections = Object.fromEntries(fields.map(f => [f, relationSelection(collection, f)]));
    const batches = join(directory, `${collection}-relations`);
    mkdirSync(batches, { recursive: true, mode: 0o700 });
    for (let offset = 0; offset < rows.length; offset += RELATION_BATCH) {
      const batchPath = join(batches, `${String(offset).padStart(6, '0')}.json`);
      if (existsSync(batchPath)) continue;
      const group = rows.slice(offset, offset + RELATION_BATCH);
      const query = 'query Details { ' + group.map((row, i) => `r${i}:${single[collection]}(id:${JSON.stringify(row.id)}) { id ${fields.map(f => selections[f].query).join(' ')} }`).join(' ') + ' }';
      const result = await checked(query, {});
      const records = [];
      for (let i = 0; i < group.length; i++) {
        const record = result.data[`r${i}`];
        if (!record || record.id !== group[i].id) throw new Error('Detail identity changed');
        for (const f of fields) {
          const connection = record[f];
          if (!connection) continue;
          const seen = new Set();
          while (connection.pageInfo.hasNextPage) {
            const cursor = connection.pageInfo.endCursor;
            if (!cursor || seen.has(cursor)) throw new Error('Nested pagination did not advance');
            seen.add(cursor);
            const more = await checked(`query More { record:${single[collection]}(id:${JSON.stringify(record.id)}) { ${f}(first:100,after:${JSON.stringify(cursor)}) { nodes { ${selections[f].select} } pageInfo { hasNextPage endCursor } } } }`, {});
            if (!more.data.record?.[f]) throw new Error('Missing nested page');
            connection.nodes.push(...more.data.record[f].nodes);
            connection.pageInfo = more.data.record[f].pageInfo;
          }
          if (new Set(connection.nodes.map(n => n.id)).size !== connection.nodes.length) throw new Error(`Duplicate ${collection}.${f} IDs`);
        }
        records.push(record);
      }
      save(batchPath, { capturedAt: new Date().toISOString(), sourceIds: group.map(n => n.id), records });
      if (offset % 200 === 0) console.log(account, collection, offset + group.length, '/', rows.length, 'details');
    }
    const merged = rows.map((row, i) => {
      const batch = JSON.parse(readFileSync(join(batches, `${String(Math.floor(i / RELATION_BATCH) * RELATION_BATCH).padStart(6, '0')}.json`), 'utf8'));
      const detail = batch.records.find(n => n.id === row.id);
      if (!detail) throw new Error('Missing saved detail');
      return { ...row, ...detail };
    });
    save(join(directory, `${collection}-details.json`), merged);
    report.collections[collection] = { complete: true, count: merged.length, checksum: hash(merged), relations: Object.fromEntries(fields.map(f => [f, merged.reduce((n, r) => n + (r[f]?.nodes?.length || 0), 0)])) };
    console.log(account, collection, 'details captured', JSON.stringify(report.collections[collection].relations));
  }
  report.updatedAt = new Date().toISOString();
  report.excludedFields = [...skipped].sort();
  save(reportPath, report);
}
