import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact } from '../src/types/database.ts';
import { saveCustomerForDeal } from '../src/lib/customerForDeal.ts';

const contact = {
  id: 'saved-customer', org_id: 'org', first_name: 'Pat', last_name: 'Sample',
  phone: '2025550193', customer_type: 'Lead', assigned_to: 'owner', location_id: 'store',
} as Contact;
const input = {
  orgId: 'org', userId: 'owner', locationId: 'store',
  first: ' Pat ', last: ' Sample ', phone: ' 2025550193 ', email: '',
  source: 'Walk-in', address: '', existingContactId: null, createdCustomerId: null,
};
function fixture() {
  const calls: { operation: string; table?: string; values?: unknown }[] = [];
  const state = {
    guarded: { data: { created: true, contact, duplicates: [] as Contact[] }, error: null },
    readError: false,
    addressError: false,
  };
  const client = {
    rpc: async (name: string, values: unknown) => {
      calls.push({ operation: name, values });
      return state.guarded;
    },
    from: (table: string) => {
      let address: string | null = null;
      const query = {
        update: (values: { mailing_address: string }) => {
          address = values.mailing_address;
          calls.push({ operation: 'update', table, values });
          return query;
        },
        select: () => query,
        eq: (field: string, value: string) => {
          calls.push({ operation: 'eq', table, values: { [field]: value } });
          return query;
        },
        single: async () => {
          calls.push({ operation: address ? 'save-address' : 'read', table });
          return {
            data: address ? { ...contact, mailing_address: address } : contact,
            error: (address ? state.addressError : state.readError) ? { message: 'temporary failure' } : null,
          };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { calls, state, client };
}

test('customer handoff creates exactly one guarded contact and no deal or task', async () => {
  const { calls, client } = fixture();
  const remembered: string[] = [];
  const result = await saveCustomerForDeal(client, input, id => remembered.push(id));
  assert.deepEqual(result, { contact });
  assert.deepEqual(remembered, [contact.id]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].operation, 'create_contact_guarded');
  assert.deepEqual(calls[0].values, {
    p_first_name: 'Pat', p_last_name: 'Sample', p_phone: '2025550193', p_email: null,
    p_lead_source: 'Walk-in', p_location_id: 'store', p_assigned_to: 'owner', p_customer_type: 'Lead',
  });
});

test('exact duplicates require explicit selection, then reuse the contact without writes', async () => {
  const { calls, state, client } = fixture();
  state.guarded.data = { created: false, contact, duplicates: [contact] };
  const remembered: string[] = [];
  const duplicates = await saveCustomerForDeal(client, input, id => remembered.push(id));
  assert.deepEqual(duplicates, { duplicates: [contact] });
  assert.deepEqual(remembered, []);
  const result = await saveCustomerForDeal(client, {
    ...input, existingContactId: contact.id, address: 'Do not replace an existing address',
  }, id => remembered.push(id));
  assert.deepEqual(result, { contact });
  assert.equal(calls.filter(call => call.operation === 'create_contact_guarded').length, 1);
  assert.equal(calls.filter(call => call.operation === 'update').length, 0);
  assert.ok(calls.some(call => call.operation === 'eq' && JSON.stringify(call.values) === '{"org_id":"org"}'));
});

test('address failure preserves the created ID and retry finishes the same customer', async () => {
  const { calls, state, client } = fixture();
  let remembered: string | null = null;
  state.addressError = true;
  await assert.rejects(saveCustomerForDeal(client, { ...input, address: ' 123 Main St ' }, id => {
    remembered = id;
    assert.equal(calls.some(call => call.operation === 'update'), false, 'remember before the address request');
  }), /Customer saved, but their address could not be saved/);
  assert.equal(remembered, contact.id);
  state.addressError = false;
  const result = await saveCustomerForDeal(client, {
    ...input, address: ' 123 Main St ', createdCustomerId: remembered,
  }, () => assert.fail('retry must not create another customer'));
  assert.deepEqual(result, { contact: { ...contact, mailing_address: '123 Main St' } });
  assert.equal(calls.filter(call => call.operation === 'create_contact_guarded').length, 1);
});

test('recovering a saved customer after a read failure never creates a replacement', async () => {
  const { calls, state, client } = fixture();
  state.readError = true;
  const resume = { ...input, createdCustomerId: contact.id };
  await assert.rejects(saveCustomerForDeal(client, resume, () => assert.fail()), /deal draft is still available/);
  state.readError = false;
  assert.deepEqual(await saveCustomerForDeal(client, resume, () => assert.fail()), { contact });
  assert.equal(calls.some(call => call.operation === 'create_contact_guarded'), false);
});

test('date-free intake preserves server authorization and mandatory atomic follow-up', async () => {
  const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [before, after, wizard, modal] = await Promise.all([
    read('supabase/migrations/20260907174500_atomic_quick_deal.sql'),
    read('supabase/migrations/20260908173000_optional_intake_close_date.sql'),
    read('src/components/NewCustomerWizard.tsx'), read('src/components/QuickDealModal.tsx'),
  ]);
  const definition = (sql: string) => sql.slice(sql.indexOf('create or replace function'));
  assert.equal(definition(after), definition(before)
    .replace('or v_expected_close is null or p_next_activity_date is null', 'or p_next_activity_date is null')
    .replace('Deal title, expected close date and next activity date are required', 'Deal title and next activity date are required'));
  for (const form of [wizard, modal]) {
    assert.doesNotMatch(form, /expectedCloseDate|Expected close date|when could it close/i);
    assert.match(form, /expected_close_date: null/);
  }
  assert.match(modal, /useModal\(close, !addingCustomer\)/);
  assert.match(modal, /onCustomerSelected=\{customer =>[\s\S]*chooseCustomer\(customer\)/);
  assert.match(modal, /useDraftState<string \| null>\(draftScope, 'selectedCustomerId', null\)/);
  assert.match(wizard, /customerOnly \? 'deal-customer' : 'customer'/);
  assert.match(wizard, /onCustomerSelected\(result.contact\);[\s\S]*clearDrafts\(draftScope\);[\s\S]*onClose\(\);[\s\S]*return;/);
});
