import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { findStaffByPhone, last10Digits, smsReplyText, staffPhoneMatches } from '../api/_lib/staff-sms.ts';
import { centralInstant, matchTeammate } from '../src/agent/toolFactory.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('staff text → Ari', () => {
  it('recognises a teammate by the mobile number on their profile, in any format', () => {
    assert.equal(last10Digits('+1 (701) 555-0142'), '7015550142');
    assert.equal(staffPhoneMatches('701-555-0142', '+17015550142'), true);
    assert.equal(staffPhoneMatches(null, '+17015550142'), false);
    assert.equal(staffPhoneMatches('555-0142', '+17015550142'), false);
    const roster = [{ id: 'a', phone: '(701) 555-0142' }, { id: 'b', phone: null }];
    assert.equal(findStaffByPhone(roster, '+17015550142')?.id, 'a');
    assert.equal(findStaffByPhone(roster, '+17015550199'), null);
  });

  it('turns Ari markdown into a readable, bounded text message', () => {
    assert.equal(smsReplyText('**Done.** Assigned to *Alex*:\n- Email Bob Johnson a quote\n\n\n`due 4pm`'), 'Done. Assigned to *Alex*:\n• Email Bob Johnson a quote\n\ndue 4pm');
    assert.equal(smsReplyText(''), 'Done.');
    assert.equal(smsReplyText('x'.repeat(2000)).length, 1400);
  });

  it('resolves teammates by first or full name without guessing', () => {
    const roster = [
      { id: '1', first_name: 'Alex', last_name: 'Burckhard' },
      { id: '2', first_name: 'Ben', last_name: 'Magnuson' },
      { id: '3', first_name: 'Bryson', last_name: 'Elm' },
      { id: '4', first_name: 'Brandon', last_name: 'Solem' },
    ];
    assert.equal((matchTeammate(roster, 'alex') as { match: { id: string } }).match.id, '1');
    assert.equal((matchTeammate(roster, 'Ben Magnuson') as { match: { id: string } }).match.id, '2');
    assert.equal((matchTeammate(roster, 'bry') as { match: { id: string } }).match.id, '3');
    assert.match((matchTeammate(roster, 'b') as { error: string }).error, /could mean/);
    assert.match((matchTeammate(roster, 'Zed') as { error: string }).error, /No teammate named "Zed"/);
  });

  it('converts dealership wall-clock times to UTC across daylight saving', () => {
    assert.equal(centralInstant('2026-09-03T16:00'), '2026-09-03T21:00:00.000Z'); // CDT
    assert.equal(centralInstant('2026-12-03T16:00'), '2026-12-03T22:00:00.000Z'); // CST
    assert.equal(centralInstant('2026-09-03'), '2026-09-03T14:00:00.000Z'); // 9 AM default
    assert.equal(centralInstant('4pm'), null);
  });

  it('routes a teammate text to Ari before the customer path and answers by text', async () => {
    const [inbound, factory, prompt, settings] = await Promise.all([
      read('api/sms-inbound.ts'),
      read('src/agent/toolFactory.ts'),
      read('api/_lib/system-prompt.ts'),
      read('src/pages/Settings.tsx'),
    ]);
    assert.match(inbound, /validSignature\(params, signature\)/);
    assert.ok(inbound.indexOf('staffForNumber(from)') < inbound.indexOf('Match (or create) the contact'));
    assert.match(inbound, /waitUntil\(handleStaffText\(staff, from, body\)\)/);
    assert.match(inbound, /mintStaffAccessToken\(service, anon, staff\.email\)/);
    assert.match(inbound, /sendText\(from, reply\)/);
    assert.match(factory, /name: 'delegate_task'/);
    assert.match(factory, /name: 'list_delegated_tasks'/);
    assert.match(factory, /name: 'complete_delegated_task'/);
    assert.match(factory, /task_type: 'Delegated'/);
    assert.match(prompt, /DELEGATED STAFF TASKS are different from Fix-It/);
    assert.match(settings, /Mobile for Ari texts/);
  });
});
