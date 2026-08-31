import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  googleMapsSearchUrl,
  jobContactAddress,
  jobContactPhone,
} from '../src/lib/jobContact.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Schedule job contact details', () => {
  it('reuses the readable phone formatter and preserves nonstandard stored values', () => {
    assert.equal(jobContactPhone({ phone: '7016410155' }), '(701) 641-0155');
    assert.equal(jobContactPhone({ phone: '701-641-0155 x22' }), '701-641-0155 x22');
    assert.equal(jobContactPhone({ phone: null }), null);
  });

  it('uses only the full stored customer address without fabricating parts', () => {
    assert.equal(
      jobContactAddress({ mailing_address: 'Suite 200\n456 North Ave\nMinot, ND 58701' }),
      'Suite 200, 456 North Ave, Minot, ND 58701',
    );
    assert.equal(jobContactAddress({ mailing_address: '   ' }), null);
    assert.equal(jobContactAddress(null), null);
  });

  it('builds the exact encoded Google Maps search URL', () => {
    assert.equal(
      googleMapsSearchUrl('Suite 200, 456 North Ave, Minot, ND 58701'),
      'https://www.google.com/maps/search/?api=1&query=Suite%20200%2C%20456%20North%20Ave%2C%20Minot%2C%20ND%2058701',
    );
  });

  it('loads phone and address for schedule and detail queries', async () => {
    const hook = await read('src/hooks/useServiceJobs.ts');
    assert.match(hook, /contacts:contact_id\(first_name, last_name, phone, mailing_address\)/);
    assert.equal((hook.match(/contacts:contact_id\(first_name, last_name, phone, mailing_address\)/g) ?? []).length, 2);
  });

  it('shows assigned contact details on calendar cards, Unscheduled cards, and job detail', async () => {
    const [service, detail, component] = await Promise.all([
      read('src/pages/Service.tsx'),
      read('src/pages/JobDetail.tsx'),
      read('src/components/JobContactDetails.tsx'),
    ]);
    const jobCard = service.slice(service.indexOf('function JobCard'), service.indexOf('export default function Service'));
    const queue = service.slice(service.indexOf('{/* ─── Unscheduled queue'));

    assert.match(jobCard, /contact && <JobContactDetails contact=\{contact\} compact \/>/);
    assert.match(queue, /<JobContactDetails contact=\{job\.contacts\} compact \/>/);
    assert.match(detail, /<JobContactDetails contact=\{\{ \.\.\.contact, mailing_address: property\?\.address \?\? contact\.mailing_address \}\} className="text-ink-300" \/>/);
    assert.match(component, /target="_blank"/);
    assert.match(component, /rel="noopener noreferrer"/);
    assert.match(component, /href=\{googleMapsSearchUrl\(address\)\}/);
    assert.match(component, /if \(!phone && !address\) return null/);
  });
});
