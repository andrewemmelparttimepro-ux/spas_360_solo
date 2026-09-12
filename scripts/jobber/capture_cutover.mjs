import { writeFileSync } from 'node:fs';
import { jobberClient } from './api-client.mjs';

const stage = process.argv[2];
if (!stage) throw new Error('A private output directory is required');
const connections = { magic_city: '1409fc16-e5ad-4b92-8d59-e8e26a17abb0', spas_etc: 'fbaa08e4-9ca6-4842-ae25-1dcf22e2b2de' };
const selection = `id title allDay startAt endAt duration isComplete completedAt visitStatus clientConfirmed instructions
  client { id name } property { id } job { id jobNumber title jobStatus completedAt instructions }
  assignedUsers(first:20) { nodes { id name { full } } pageInfo { hasNextPage } }`;
await Promise.all(Object.entries(connections).map(async ([account, connection]) => {
  const client = await jobberClient(connection);
  const visits = [], counts = {};
  for (const status of ['UPCOMING', 'TODAY', 'LATE', 'UNSCHEDULED']) {
    let after = null, total;
    do {
      const result = await client.query(`query Cutover($after:String) { visits(first:50,after:$after,filter:{status:${status}}) { nodes { ${selection} } totalCount pageInfo { hasNextPage endCursor } } }`, { after });
      if (result.errors) throw new Error(JSON.stringify(result.errors));
      const page = result.data.visits;
      if (page.nodes.some(v => v.assignedUsers.pageInfo.hasNextPage)) throw new Error('Assignments require pagination');
      total = page.totalCount;
      visits.push(...page.nodes);
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    counts[status] = total;
    console.log(JSON.stringify({ account, status, count: total }));
  }
  if (new Set(visits.map(v => v.id)).size !== visits.length) throw new Error('Visit statuses overlapped during capture; retry');
  writeFileSync(`${stage}/${account}-open-visits.json`, JSON.stringify({ captured_at: new Date().toISOString(), account_id: client.accountId, counts, visits }), { mode: 0o600 });
}));
