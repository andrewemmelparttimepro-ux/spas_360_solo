import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Schedule inventory delivery dates', () => {
  it('keeps Select Dates while exposing start and optional end date inputs', async () => {
    const service = await read('src/pages/Service.tsx');
    const modal = service.slice(service.indexOf('{/* Create Job Modal */}'), service.indexOf('<DragDropContext'));

    assert.match(modal, /<legend[^>]*>Select Dates<\/legend>/);
    assert.match(modal, /<label htmlFor="new-job-scheduled-at"[^>]*>Start date and time<\/label>/);
    assert.match(modal, /<input id="new-job-scheduled-at" type="datetime-local"/);
    assert.match(modal, /<label htmlFor="new-job-scheduled-end-date"[^>]*>End date/);
    assert.match(modal, /<input id="new-job-scheduled-end-date" type="date"/);
  });

  it('copies or clears the date when the exact inventory job link changes', async () => {
    const sql = await read('supabase/migrations/20260826201820_sync_inventory_delivery_dates.sql');
    const linkFunction = sql.slice(
      sql.indexOf('create or replace function private.set_inventory_delivery_date_from_job_link'),
      sql.indexOf('drop trigger if exists set_inventory_delivery_date_from_job_link'),
    );

    assert.match(linkFunction, /where j\.id = new\.job_id[\s\S]*j\.org_id = new\.org_id/);
    assert.match(linkFunction, /new\.date_delivered := timezone\('America\/Chicago', v_scheduled_at\)::date/);
    assert.match(linkFunction, /old\.job_id is not null[\s\S]*new\.date_delivered := null/);
    assert.doesNotMatch(linkFunction, /new\.(status|customer_id|deal_id)\s*:=/);
    assert.match(sql, /before insert or update of job_id on public\.inventory_items/);
  });

  it('syncs schedule, reschedule, and unschedule changes only to rows linked to that job', async () => {
    const sql = await read('supabase/migrations/20260826201820_sync_inventory_delivery_dates.sql');
    const scheduleFunction = sql.slice(
      sql.indexOf('create or replace function private.sync_inventory_delivery_date_from_job_schedule'),
      sql.indexOf('drop trigger if exists sync_inventory_delivery_date_from_job_schedule'),
    );

    assert.match(scheduleFunction, /set date_delivered = timezone\('America\/Chicago', new\.scheduled_at\)::date/);
    assert.match(scheduleFunction, /where org_id = new\.org_id[\s\S]*job_id = new\.id/);
    assert.match(scheduleFunction, /date_delivered is distinct from timezone\('America\/Chicago', new\.scheduled_at\)::date/);
    assert.doesNotMatch(scheduleFunction, /set[\s\S]*(status|customer_id|deal_id)\s*=/);
    assert.match(sql, /after update of scheduled_at on public\.jobs/);
  });

  it('uses the dealership day across the UTC midnight boundary', async () => {
    const sql = await read('supabase/migrations/20260826201820_sync_inventory_delivery_dates.sql');
    const centralConversions = sql.match(/timezone\('America\/Chicago', (?:v_scheduled_at|new\.scheduled_at)\)::date/g) ?? [];

    // 11:30 PM Central is already the following UTC day; every persisted-date
    // expression must explicitly retain the Schedule calendar's Central day.
    assert.equal(new Date('2026-08-26T23:30:00-05:00').toISOString(), '2026-08-27T04:30:00.000Z');
    assert.equal(centralConversions.length, 3);
  });

  it('links a Won deal selected unit to only its newly-created Delivery job', async () => {
    const sql = await read('supabase/migrations/20260826201820_sync_inventory_delivery_dates.sql');
    const bridge = sql.slice(sql.indexOf('create or replace function public.deal_won_bridge'));

    assert.match(bridge, /insert into public\.jobs[\s\S]*returning id into v_job_id/);
    assert.match(bridge, /if new\.inventory_item_id is not null then[\s\S]*set job_id = v_job_id/);
    assert.match(bridge, /where id = new\.inventory_item_id[\s\S]*org_id = new\.org_id[\s\S]*deal_id = new\.id[\s\S]*customer_id = new\.contact_id[\s\S]*job_id is null/);
    assert.match(bridge, /if not found then[\s\S]*raise exception 'The purchased inventory unit could not be linked to its delivery job'/);
  });
});
