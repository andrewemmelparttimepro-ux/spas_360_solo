import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  canEditServiceJob,
  canManageServiceSchedule,
  isServiceTechnician,
  technicianCanAccessPath,
} from '../src/lib/serviceTechAccess.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Service Tech portal', () => {
  it('keeps technicians inside scheduled service routes', () => {
    assert.equal(isServiceTechnician('technician'), true);
    assert.equal(isServiceTechnician('service_manager'), false);
    assert.equal(technicianCanAccessPath('/'), true);
    assert.equal(technicianCanAccessPath('/service'), true);
    assert.equal(technicianCanAccessPath('/service/job-123'), true);
    assert.equal(technicianCanAccessPath('/deals'), false);
    assert.equal(technicianCanAccessPath('/inventory'), false);
    assert.equal(canManageServiceSchedule('technician'), false);
    assert.equal(canManageServiceSchedule('service_manager'), true);
    assert.equal(canEditServiceJob('technician'), false);
    assert.equal(canEditServiceJob('service_manager'), true);
  });

  it('renders a mobile field workflow without office chrome or the unscheduled queue', async () => {
    const [app, layout, header, service, detail, storeSwitcher] = await Promise.all([
      read('src/App.tsx'),
      read('src/components/layout/AppLayout.tsx'),
      read('src/components/layout/Header.tsx'),
      read('src/pages/Service.tsx'),
      read('src/pages/JobDetail.tsx'),
      read('src/components/StoreSwitcher.tsx'),
    ]);

    assert.match(app, /RoleRouteGuard/);
    assert.match(app, /technicianCanAccessPath/);
    assert.match(layout, /!technician && <Sidebar/);
    assert.match(layout, /!technician && \(/);
    assert.match(header, /visiblePrimaryNav/);
    assert.match(header, /item\.path === '\/service'/);
    assert.match(header, /technician \? '\/service' : '\/dashboard'/);
    assert.match(service, /<StoreSwitcher countSource="scheduledJobs" \/>/);
    assert.match(service, /\{canManageSchedule && <div className="w-full lg:w-72/);
    assert.match(service, /isDropDisabled=\{!canManageSchedule\}/);
    assert.match(service, /isDragDisabled=\{!canManageSchedule\}/);
    assert.match(storeSwitcher, /\.from\('jobs'\)[\s\S]*\.not\('scheduled_at', 'is', null\)/);
    assert.match(detail, /<TimeClockCard jobId=\{job\.id\} \/>/);
    assert.match(detail, /<PhotoCard jobId=\{job\.id\} allowDelete=\{!technician\} \/>/);
    assert.match(detail, /Mark Completed/);
    assert.match(detail, /mailing_address: property\?\.address \?\? contact\.mailing_address/);
    assert.match(detail, /!technician && <div className="bg-ink-900[^"]*">[\s\S]*Tasks/);
  });

  it('enforces scheduled-job access in RLS and uses one narrow completion RPC', async () => {
    const migration = await read('supabase/migrations/20260831222816_service_tech_portal_rls.sql');

    assert.match(migration, /create policy job_read[\s\S]*'technician'[\s\S]*scheduled_at is not null/i);
    assert.match(migration, /create policy contact_read[\s\S]*job\.contact_id = contacts\.id[\s\S]*scheduled_at is not null/i);
    assert.match(migration, /create policy note_insert[\s\S]*created_by = \(select auth\.uid\(\)\)[\s\S]*job_id is not null/i);
    assert.match(migration, /create policy job_photos_upload[\s\S]*storage\.foldername\(name\)/i);
    assert.match(migration, /owner_id = \(select auth\.uid\(\)\)::text/i);
    assert.match(migration, /create policy te_read[\s\S]*job\.scheduled_at is not null/i);
    assert.match(migration, /create policy te_update[\s\S]*job\.scheduled_at is not null/i);
    assert.match(migration, /create or replace function private\.complete_service_job/i);
    assert.match(migration, /private\.complete_service_job[\s\S]*security definer/i);
    assert.match(migration, /create or replace function public\.complete_service_job[\s\S]*security invoker/i);
    assert.doesNotMatch(migration, /function public\.complete_service_job[\s\S]{0,160}security definer/i);
    assert.match(migration, /and scheduled_at is not null[\s\S]*and status <> 'Cancelled'/i);
    assert.match(migration, /technician_office_block/);
  });
});
