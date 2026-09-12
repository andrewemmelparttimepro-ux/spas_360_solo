import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { jobberClient } from './api-client.mjs';

const [stage, account, connectionId] = process.argv.slice(2);
const api = await jobberClient(connectionId);
if (api.accountName !== ({ magic_city: 'Magic City Home Leisure', spas_etc: 'Spas Etc' })[account]) throw new Error('Source account differs');
const folder = join(stage, account, 'staff-associations');
mkdirSync(folder, { recursive: true, mode: 0o700 });
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (path, value) => { const tmp = `${path}.${process.pid}.tmp`; writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 }); renameSync(tmp, path); };
const user = 'id name { first full last }';
const report = { account, startedAt: new Date().toISOString(), collections: {} };
async function checked(query, variables = {}) {
  const result = await api.query(query, variables);
  if (result.errors?.length) { save(join(folder, `error-${Date.now()}.json`), { query, variables, result }); throw new Error(JSON.stringify(result.errors)); }
  const cost = result.extensions?.cost;
  if (cost && cost.throttleStatus.currentlyAvailable < cost.requestedQueryCost + 100) await new Promise(resolve => setTimeout(resolve, Math.min(30000, (cost.requestedQueryCost + 100 - cost.throttleStatus.currentlyAvailable) / cost.throttleStatus.restoreRate * 1000)));
  return result;
}
const selections = {
  jobs: `id updatedAt salesperson { ${user} }`,
  quotes: `id updatedAt salesperson { ${user} }`,
  requests: `id updatedAt salesperson { ${user} }`,
  visits: `id createdAt createdBy { ${user} } assignedUsers(first:20) { nodes { ${user} } pageInfo { hasNextPage endCursor } }`,
  tasks: `id createdBy { ${user} } assignedUsers(first:20) { nodes { ${user} } pageInfo { hasNextPage endCursor } }`,
};
for (const [collection, fields] of Object.entries(selections)) {
  let cursor = null, page = 0, expected;
  const rows = [];
  do {
    const path = join(folder, `${collection}-${String(page++).padStart(4, '0')}.json`);
    let capture;
    if (existsSync(path)) { capture = read(path); if (capture.cursor !== cursor) throw new Error('Association checkpoint cursor differs'); }
    else {
      const result = await checked(`query Staff($cursor:String) { ${collection}(first:50,after:$cursor) { nodes { ${fields} } totalCount pageInfo { hasNextPage endCursor } } }`, { cursor });
      capture = { capturedAt: new Date().toISOString(), cursor, result }; save(path, capture);
    }
    const data = capture.result.data[collection]; expected ??= data.totalCount;
    for (const row of data.nodes) if (row.assignedUsers?.pageInfo.hasNextPage) throw new Error('Assigned staff pagination needs another page');
    rows.push(...data.nodes);
    if (data.pageInfo.hasNextPage && (!data.pageInfo.endCursor || data.pageInfo.endCursor === cursor)) throw new Error('Association pagination did not advance');
    cursor = data.pageInfo.hasNextPage ? data.pageInfo.endCursor : null;
    if (page % 20 === 0) console.log(account, collection, rows.length, '/', expected, 'staff associations');
  } while (cursor);
  if (rows.length !== expected || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Association source count differs');
  save(join(folder, `${collection}.json`), rows); report.collections[collection] = { complete: true, count: rows.length };
  save(join(folder, 'report.json'), report);
}

const schema = read(join(stage, 'api-schema.json')).data.__schema;
const types = Object.fromEntries(schema.types.map(type => [type.name, type]));
const named = type => type.name || named(type.ofType);
const singular = { clients: 'client', jobs: 'job', quotes: 'quote', requests: 'request', invoices: 'invoice' };
const noteFields = `id message createdAt lastEditedAt pinned linkedTo { invoices jobs quotes requests } createdBy { __typename ... on User { ${user} } ... on Client { id name } ... on Application { id name } } lastEditedBy { ${user} }`;
for (const [collection, single] of Object.entries(singular)) {
  const parents = read(join(stage, account, `${collection}-details.json`)).filter(row => row.notes?.nodes?.length);
  const parentType = single[0].toUpperCase() + single.slice(1);
  const connectionType = named(types[parentType].fields.find(field => field.name === 'notes').type);
  const noteType = types[named(types[connectionType].fields.find(field => field.name === 'nodes').type)];
  const selection = '__typename ' + (noteType.possibleTypes ? noteType.possibleTypes.map(type => `... on ${type.name} { ${noteFields} }`).join(' ') : noteFields);
  const rows = [];
  for (let offset = 0; offset < parents.length; offset += 10) {
    const path = join(folder, `${collection}-authors-${String(offset).padStart(6, '0')}.json`);
    let capture;
    if (existsSync(path)) capture = read(path);
    else {
      const group = parents.slice(offset, offset + 10);
      const query = 'query Authors { ' + group.map((row, i) => `r${i}:${single}(id:${JSON.stringify(row.id)}) { id notes(first:20) { nodes { ${selection} } pageInfo { hasNextPage endCursor } } }`).join(' ') + ' }';
      const result = await checked(query);
      const records = [];
      for (let i = 0; i < group.length; i++) {
        const row = result.data[`r${i}`];
        if (row?.id !== group[i].id) throw new Error('Note parent identity changed');
        const cursors = new Set();
        while (row.notes.pageInfo.hasNextPage) {
          const cursor = row.notes.pageInfo.endCursor;
          if (!cursor || cursors.has(cursor)) throw new Error('Note pagination did not advance');
          cursors.add(cursor);
          const more = await checked(`query { record:${single}(id:${JSON.stringify(row.id)}) { notes(first:100,after:${JSON.stringify(cursor)}) { nodes { ${selection} } pageInfo { hasNextPage endCursor } } } }`);
          row.notes.nodes.push(...more.data.record.notes.nodes); row.notes.pageInfo = more.data.record.notes.pageInfo;
        }
        if (new Set(row.notes.nodes.map(note => note.id)).size !== row.notes.nodes.length) throw new Error('Duplicate note identities');
        records.push(row);
      }
      capture = { capturedAt: new Date().toISOString(), records }; save(path, capture);
    }
    const expectedIds = parents.slice(offset, offset + 10).map(row => row.id);
    if (JSON.stringify(capture.records.map(row => row.id)) !== JSON.stringify(expectedIds)) throw new Error('Saved note parents differ');
    rows.push(...capture.records);
    if (offset % 200 === 0) console.log(account, collection, rows.length, '/', parents.length, 'note authors');
  }
  save(join(folder, `${collection}-authors.json`), rows);
  report.collections[`${collection}-authors`] = { complete: true, parents: rows.length, notes: rows.reduce((sum, row) => sum + row.notes.nodes.length, 0) };
  report.updatedAt = new Date().toISOString(); save(join(folder, 'report.json'), report);
}
