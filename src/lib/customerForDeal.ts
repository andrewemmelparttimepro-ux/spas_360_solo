import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact } from '../types/database.ts';
import { normalizeCustomerAddress } from './customerAddress.ts';

type DuplicateCustomer = Pick<Contact, 'id' | 'first_name' | 'last_name' | 'phone' | 'customer_type' | 'assigned_to'>;

interface CustomerForDealInput {
  orgId: string;
  userId: string;
  locationId: string;
  first: string;
  last: string;
  phone: string;
  email: string;
  address: string;
  source: string | null;
  existingContactId: string | null;
  createdCustomerId: string | null;
}

/** Contact-only handoff: the parent deal form owns the single deal and its follow-up. */
export async function saveCustomerForDeal(
  client: SupabaseClient,
  input: CustomerForDealInput,
  rememberCreatedCustomer: (id: string) => void,
): Promise<{ contact: Contact } | { duplicates: DuplicateCustomer[] }> {
  let contactId = input.existingContactId ?? input.createdCustomerId;
  let contact: Contact | null = null;
  if (!contactId) {
    const { data, error } = await client.rpc('create_contact_guarded', {
      p_first_name: input.first.trim(), p_last_name: input.last.trim(),
      p_phone: input.phone.trim(), p_email: input.email.trim() || null,
      p_lead_source: input.source, p_location_id: input.locationId,
      p_assigned_to: input.userId, p_customer_type: 'Lead',
    });
    if (error) throw new Error(error.message);
    const result = data as { created?: boolean; contact?: Contact; duplicates?: DuplicateCustomer[] } | null;
    if (!result?.created || !result.contact) return { duplicates: result?.duplicates ?? [] };
    contact = result.contact;
    contactId = contact.id;
    // Remember the successful write before any further request. An address failure
    // or a reload must resume this customer, never insert a replacement.
    rememberCreatedCustomer(contactId);
  }

  const mailingAddress = normalizeCustomerAddress(input.address);
  if (!input.existingContactId && mailingAddress) {
    const { data, error } = await client.from('contacts')
      .update({ mailing_address: mailingAddress })
      .eq('id', contactId).eq('org_id', input.orgId).select('*').single();
    if (error) throw new Error(`Customer saved, but their address could not be saved: ${error.message}`);
    if (data?.mailing_address !== mailingAddress) throw new Error('Customer saved, but their address could not be verified');
    contact = data as Contact;
  }
  if (!contact) {
    const { data, error } = await client.from('contacts').select('*')
      .eq('id', contactId).eq('org_id', input.orgId).single();
    if (error || !data) throw new Error('The customer could not be loaded. Your deal draft is still available.');
    contact = data as Contact;
  }
  return { contact };
}
