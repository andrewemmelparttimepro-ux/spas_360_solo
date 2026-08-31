import { MapPin, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  googleMapsSearchUrl,
  jobContactAddress,
  jobContactPhone,
  type JobContact,
} from '@/lib/jobContact';

export default function JobContactDetails({
  contact,
  compact = false,
  className,
}: {
  contact: JobContact | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const phone = jobContactPhone(contact);
  const address = jobContactAddress(contact);
  if (!phone && !address) return null;

  return (
    <div
      data-job-contact-details
      className={cn('mt-1.5 space-y-1', compact ? 'text-[10px] leading-tight' : 'text-sm', className)}
    >
      {phone && contact?.phone && (
        <a
          href={`tel:${contact.phone}`}
          onClick={event => event.stopPropagation()}
          className="flex items-start gap-1.5 break-words opacity-90 hover:underline"
        >
          <Phone className={cn('mt-px shrink-0', compact ? 'h-3 w-3' : 'h-4 w-4')} />
          <span>{phone}</span>
        </a>
      )}
      {address && (
        <a
          href={googleMapsSearchUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={event => event.stopPropagation()}
          className="flex items-start gap-1.5 break-words opacity-90 hover:underline"
          title={`Open ${address} in Google Maps`}
        >
          <MapPin className={cn('mt-px shrink-0', compact ? 'h-3 w-3' : 'h-4 w-4')} />
          <span>{address}</span>
        </a>
      )}
    </div>
  );
}
