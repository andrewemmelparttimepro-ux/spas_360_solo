import { formatCustomerAddress } from './customerAddress.ts';
import { formatPhone } from './utils.ts';

export type JobContact = {
  first_name: string;
  last_name: string;
  phone: string | null;
  mailing_address: string | null;
};

export function jobContactPhone(contact: Pick<JobContact, 'phone'> | null | undefined): string | null {
  const phone = formatPhone(contact?.phone);
  return phone || null;
}

export function jobContactAddress(
  contact: Pick<JobContact, 'mailing_address'> | null | undefined,
): string | null {
  if (!contact?.mailing_address?.trim()) return null;
  return formatCustomerAddress(contact.mailing_address);
}

export function googleMapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
