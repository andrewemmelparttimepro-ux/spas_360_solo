import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Brandon composite UI contract', () => {
  it('uses the exact requested page canvas, white surfaces, and strong site-wide button hover', async () => {
    const [css, layout] = await Promise.all([
      read('src/index.css'),
      read('src/components/layout/AppLayout.tsx'),
    ]);

    assert.match(css, /--color-app-canvas:\s*#D1D5DB/i);
    assert.match(css, /--color-ink-900:\s*#FFFFFF/i);
    assert.match(css, /button:not\(:disabled\):hover/);
    assert.match(css, /contrast\(1\.06\)/);
    assert.match(layout, /bg-\[var\(--color-app-canvas\)\]/);
  });

  // Updated 2026-08-19 per Brandon: Parts, Media, Documents, and Owners Corner follow Schedule in the
  // top bar. The office destinations remain in the drawer, and every existing
  // destination stays reachable.
  it('keeps the requested primary destinations in order and office links in the drawer', async () => {
    const header = await read('src/components/layout/Header.tsx');
    const primary = ['Dashboard', 'Customers', 'Deals', 'Inventory', 'Schedule', 'Parts', 'Media', 'Documents', 'Owners Corner'];
    const secondary = ['Inbox', 'Citadel', 'Reports'];

    for (const destination of primary) {
      assert.match(header, new RegExp(`name: '${destination}'`));
    }
    assert.match(header, /name: 'Schedule'[\s\S]*name: 'Parts'[\s\S]*name: 'Media'[\s\S]*name: 'Documents'[\s\S]*name: 'Owners Corner'/);
    assert.match(header, /name: 'Parts', path: '\/parts', icon: PackageSearch/);
    assert.match(header, /name: 'Media', path: '\/media', icon: Images/);
    assert.match(header, /name: 'Documents', path: '\/documents', icon: Files/);
    assert.match(header, /name: 'Owners Corner', path: '\/owners-corner', icon: Crown/);
    assert.match(header, /<nav className="hidden min-\[1400px\]:flex items-center gap-1">/);
    const secondaryBlock = header.slice(header.indexOf('SECONDARY_NAV_ITEMS'));
    for (const destination of secondary) {
      assert.match(secondaryBlock, new RegExp(`name: '${destination}'`));
    }
    assert.doesNotMatch(header, /label:\s*'(CRM|Sales|Service)'/);

    const sidebar = await read('src/components/layout/Sidebar.tsx');
    assert.match(sidebar, /SECONDARY_NAV_ITEMS/);
  });

  it('routes Documents and Owners Corner to functional, policy-safe destinations', async () => {
    const [app, knowledge, ownersCorner] = await Promise.all([
      read('src/App.tsx'),
      read('src/pages/Knowledge.tsx'),
      read('src/pages/OwnersCorner.tsx'),
    ]);

    assert.match(app, /path="documents" element=\{<Knowledge key="documents" pageTitle="Documents" \/>\}/);
    assert.match(app, /path="owners-corner" element=\{<OwnersCorner \/>\}/);
    assert.match(knowledge, /pageTitle === 'Documents'/);
    assert.match(knowledge, /Dealership document library/);
    assert.match(ownersCorner, /profile\?\.role === 'owner_manager'/);
    assert.match(ownersCorner, /Owner access required/);
    assert.match(ownersCorner, /to="\/dashboard"/);
    assert.match(ownersCorner, /path: '\/reports'/);
    assert.match(ownersCorner, /path: '\/citadel'/);
    assert.match(ownersCorner, /path: '\/settings'/);
  });

  it('routes Parts to the existing parts-capable knowledge view and Media to the saved library', async () => {
    const [app, media] = await Promise.all([
      read('src/App.tsx'),
      read('src/pages/Media.tsx'),
    ]);

    assert.match(app, /path="parts" element=\{<Knowledge key="parts" defaultType="parts_catalog" \/>\}/);
    assert.match(app, /path="media" element=\{<Media \/>\}/);
    assert.match(media, />\s*Media\s*</);
    assert.match(media, /to="\/service"/);
    assert.match(media, /Saved media library/);
    assert.match(media, /Files stay private/);
  });

  it('keeps requested dashboard, deals, inventory, schedule, and priority wording', async () => {
    const [dashboard, deals, salesBoard, customers, inventory, inventoryEditor, service, serviceJobs, dealDetail] = await Promise.all([
      read('src/pages/Dashboard.tsx'),
      read('src/pages/Deals.tsx'),
      read('src/components/SalesBoard.tsx'),
      read('src/pages/Customers.tsx'),
      read('src/pages/Inventory.tsx'),
      read('src/components/InventoryEditor.tsx'),
      read('src/pages/Service.tsx'),
      read('src/hooks/useServiceJobs.ts'),
      read('src/pages/DealDetail.tsx'),
    ]);

    assert.match(dashboard, /title: 'Parts On Order'/);
    assert.match(customers, /useState<CustomerSort>\('recent'\)/);
    assert.match(customers, /localStorage\.getItem\(VIEW_KEY\) === 'cards' \? 'cards' : 'list'/);
    assert.match(salesBoard, /label: 'Active Deals'/);
    assert.match(salesBoard, /label: 'Overdue Sales Tasks'/);
    assert.match(deals, /value=\{activeDeals\.length\}/);
    assert.match(deals, /\{activeDeals\.map\(\(deal\) =>/);
    assert.match(deals, /mb-5 shrink-0 overflow-hidden/);
    assert.match(deals, /className="max-h-\[60vh\] overflow-auto"/);
    assert.match(deals, /aria-label="Active deals table"/);
    assert.match(deals, />Expected close</);
    assert.match(inventory, /const BRAND_OPTIONS = \['Sundance Spas', 'Master Spas', 'Platinum Spas', 'Eco Spas'\]/);
    assert.match(inventory, />Model</);
    assert.match(inventory, />Serial Number</);
    assert.match(inventory, /Customer:\\s\*\(\.\*\?\)\(\?=\\s\*·\|\$\)/);
    assert.match(inventory, /importedCustomer\.toUpperCase\(\) === 'STOCK' \? 'Stock' : importedCustomer/);
    assert.match(inventory, /\{importedCustomerOrStock\(item\)\}/);
    assert.doesNotMatch(inventory, /â/);
    assert.doesNotMatch(inventoryEditor, />SKU</);
    assert.match(inventoryEditor, />Serial Number \*</);
    assert.match(inventoryEditor, />Model \*</);
    assert.match(service, /const LEGEND_STATUSES: JobStatus\[\] = \['Delivery', 'Warranty', 'Parts on Order'\]/);
    assert.match(service, /Created \{format\(new Date\(job\.created_at\), 'MMM d, yyyy'\)\}/);
    assert.match(serviceJobs, /sort\(\(a, b\) => new Date\(b\.created_at\)\.getTime\(\) - new Date\(a\.created_at\)\.getTime\(\)\)/);
    assert.match(dealDetail, />Priority</);
  });

  it('keeps the calendar as a high-contrast dark surface inside the light canvas', async () => {
    const [css, service] = await Promise.all([
      read('src/index.css'),
      read('src/pages/Service.tsx'),
    ]);

    assert.match(service, /className="schedule-calendar[^\"]*bg-ink-900/);
    assert.match(css, /\.schedule-calendar\s*\{[\s\S]*?--color-ink-900:\s*#0D1726/i);
    assert.match(css, /\.schedule-calendar\s*\{[\s\S]*?--color-ink-100:\s*#F7F9FC/i);
    assert.match(css, /\.app-main \.schedule-calendar \.text-orange-200\s*\{\s*color:\s*var\(--color-orange-200\) !important;/i);
  });

  it('keeps the personalized dashboard welcome and approved-logo lookup', async () => {
    const dashboard = await read('src/pages/Dashboard.tsx');

    assert.match(dashboard, /Welcome back/);
    assert.match(dashboard, /from\('business_profile'\)/);
    assert.match(dashboard, /select\('logo_storage_path'\)/);
    assert.match(dashboard, /dashboard-welcome/);
    assert.match(dashboard, /alt="Spas 360 business logo"/);
  });
});
