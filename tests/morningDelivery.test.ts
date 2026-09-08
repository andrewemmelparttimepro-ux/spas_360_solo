import assert from 'node:assert/strict';
import { test } from 'node:test';
import { submitMorningEmail, type EmailPayload } from '../api/_lib/morningDelivery.ts';
const payload: EmailPayload = { from:'fixture@example.invalid',to:['fixture@example.invalid'],subject:'Fixture',html:'<p>Fixture</p>',text:'Fixture',tags:[] };
test('provider retries reuse identical payload and key, including after lost response', async () => {
 const requests: { key: string | null; body: unknown }[] = [];
 const mock = (async (_url, init) => {
   requests.push({key: new Headers(init?.headers).get('Idempotency-Key'),body:init?.body});
   if (requests.length === 1) throw new Error('Lost response after acceptance');
   return new Response(JSON.stringify({id:'existing-provider-receipt'}),{status:200});
 }) as typeof fetch;
 assert.ok('error' in await submitMorningEmail('fixture',payload,'stable-operation',mock));
 assert.deepEqual(await submitMorningEmail('fixture',payload,'stable-operation',mock),{id:'existing-provider-receipt'});
 assert.deepEqual(requests[0],requests[1]);
});
