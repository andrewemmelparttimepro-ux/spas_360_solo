const PROJECT = 'https://kxyqgkimcdxvfkceoixs.supabase.co';
const ORG = '00000000-0000-0000-0000-000000000001';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function database(path, { method = 'GET', body, headers = {} } = {}) {
  if ((process.env.VITE_SUPABASE_URL || '').trim() !== PROJECT) throw new Error('Unexpected migration destination');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error('Missing server credential');
  const response = await fetch(`${PROJECT}/rest/v1/${path}`, {
    method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Destination ${response.status}: ${(await response.text()).slice(0, 700)}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function jobberClient(connectionId) {
  const rows = await database(`migration_connections?id=eq.${connectionId}&org_id=eq.${ORG}&provider=eq.jobber&select=id,status,external_account_id,external_account_name`);
  if (rows.length !== 1 || rows[0].status !== 'connected') throw new Error('Expected one connected Jobber account');
  return {
    accountId: rows[0].external_account_id,
    accountName: rows[0].external_account_name,
    async query(query, variables = {}) {
      if (!/^\s*(query\b|\{)/.test(query) || /\b(mutation|subscription)\b/.test(query)) throw new Error('Only Jobber read queries are allowed');
      for (let attempt = 0; attempt < 7; attempt++) {
        const response = await fetch('https://spas360solo.vercel.app/api/migrations/jobber-read', {
          method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY.trim()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ org_id: ORG, connection_id: connectionId, query, variables }), signal: AbortSignal.timeout(60000),
        });
        if (response.status === 429 || response.status >= 500) { await pause(Math.min(30000, 1000 * 2 ** attempt)); continue; }
        if (!response.ok) throw new Error(`Jobber extraction HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
        const result = await response.json();
        if (result.errors?.some(e => /throttl/i.test(e.message))) {
          if (result.extensions?.cost?.requestedQueryCost > result.extensions?.cost?.throttleStatus?.maximumAvailable) return result;
          await pause(10000); continue;
        }
        return result;
      }
      throw new Error('Jobber query retry limit reached');
    },
  };
}
