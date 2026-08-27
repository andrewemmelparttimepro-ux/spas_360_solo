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
    assert.match(header, /<nav className="hidden min-w-0 flex-1 items-center justify-evenly lg:flex">/);
    assert.match(header, /gap-1\.5 sm:gap-4 lg:gap-2 2xl:gap-4/);
    assert.match(header, /px-1\.5[^"]*text-\[12px\][^"]*2xl:px-2\.5[^"]*2xl:text-\[13px\]/);
    assert.match(header, /<div className="flex-1 lg:hidden" \/>/);
    // Every destination now wears the same icon rule — no per-tab exemptions
    assert.match(header, /<item\.icon className="h-\[15px\] w-\[15px\] shrink-0 hidden 2xl:block" \/>/);
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
    assert.match(deals, /\{filteredActiveDeals\.map\(\(deal\) =>/);
    assert.match(deals, /mb-5 shrink-0 overflow-hidden/);
    assert.match(deals, /className="max-h-\[68vh\] overflow-auto"/);
    assert.match(deals, /aria-label="Active deals table"/);
    assert.match(deals, /className="group\/deal-link px-1\.5 py-2"[\s\S]*group-hover\/deal-link:text-brand-400 focus-visible:text-brand-400/);
    assert.match(deals, />Expected close</);
    assert.match(inventory, /const brandOptions = inventoryBrandOptions\(items\)/);
    assert.match(inventory, /const groupedItems = groupInventoryItems\(visibleItems\)/);
    assert.match(inventory, /className="overflow-x-auto"/);
    assert.doesNotMatch(inventory, /className="flex-1 overflow-auto"/);
    assert.match(inventory, />Model</);
    assert.match(inventory, />Serial Number</);
    assert.match(inventory, /const effectiveCustomer = effectiveInventoryCustomer\(item\)/);
    assert.match(inventory, /inventoryCustomerOrStock\([\s\S]*effectiveCustomer\?\.id \?\? item\.customer_id,[\s\S]*currentCustomerName/);
    assert.match(inventory, /inventoryCustomerStockUpdate\(item\.notes, selection\)/);
    assert.match(inventory, /INVENTORY_STATIONARY_CHOICES\.map\(choice =>/);
    assert.match(inventory, /<CustomerStockCell item=\{item\} onSave=\{updateItem\} \/>/);
    assert.doesNotMatch(inventory, /â/);
    assert.doesNotMatch(inventoryEditor, />SKU</);
    assert.match(inventoryEditor, />Serial Number \*</);
    assert.match(inventoryEditor, />Model \*</);
    assert.match(service, /const LEGEND_JOB_TYPES: ScheduleJobType\[\] = \['Service', 'Delivery', 'Warranty', 'Customer Pick Up', 'On Order', 'To Do'\]/);
    assert.match(serviceJobs, /'Service': 'bg-brand-500 text-white'/);
    assert.match(serviceJobs, /'Warranty': 'bg-purple-600 text-white'/);
    assert.match(serviceJobs, /'Delivery': 'bg-red-600 text-white'/);
    assert.match(serviceJobs, /'On Order': 'bg-black text-white/);
    assert.match(serviceJobs, /'Customer Pick Up': 'bg-emerald-600 text-white'/);
    assert.match(serviceJobs, /'To Do': 'bg-yellow-400 text-black'/);
    assert.match(service, /Created \{format\(new Date\(job\.created_at\), 'MMM d, yyyy'\)\}/);
    assert.match(serviceJobs, /sort\(\(a, b\) => new Date\(b\.created_at\)\.getTime\(\) - new Date\(a\.created_at\)\.getTime\(\)\)/);
    assert.match(dealDetail, />Priority</);
    assert.match(dealDetail, /aria-label="Deal stage"/);
    assert.match(dealDetail, /formatPhone\(contact\.phone\)/);
    assert.match(dealDetail, />\s*Won\s*</);
    assert.match(dealDetail, />\s*Lost\s*</);
  });

  it('fits every active Deals column in the bounded Fix-It side-by-side width', async () => {
    const deals = await read('src/pages/Deals.tsx');

    assert.match(deals, /id="active-deals-table"[\s\S]*<table className="w-full min-w-\[800px\] table-fixed/);
    assert.match(deals, /w-\[12%\][^>]*>Deal<[\s\S]*w-\[12%\][^>]*>Outcome</);
    assert.match(deals, /title=\{deal\.title\}[\s\S]*title=\{contactName\}[\s\S]*title=\{stageName\}[\s\S]*title=\{ownerName\}/);
    assert.match(deals, /className="flex items-center gap-0\.5"[\s\S]*Mark \$\{deal\.title\} won[\s\S]*Mark \$\{deal\.title\} lost/);
    assert.doesNotMatch(deals, /min-w-\[(180|210)px\] px-5 py-3/);
  });

  it('makes a newly created customer immediately visible in the active store', async () => {
    const [customers, customerCards, contacts, wizard, pipeline] = await Promise.all([
      read('src/pages/Customers.tsx'),
      read('src/hooks/useCustomerCards.ts'),
      read('src/hooks/useContacts.ts'),
      read('src/components/NewCustomerWizard.tsx'),
      read('src/hooks/usePipeline.ts'),
    ]);

    assert.match(customerCards, /const fetchSeq = useRef\(0\)/);
    assert.match(customerCards, /const seq = \+\+fetchSeq\.current/);
    assert.match(customerCards, /if \(seq !== fetchSeq\.current\) return;/);
    assert.match(customerCards, /\.order\('updated_at', \{ ascending: false \}\)[\s\S]*\.order\('id', \{ ascending: true \}\)/);
    assert.match(customerCards, /const seen = new Set<string>\(\)/);
    assert.match(contacts, /\.order\('updated_at', \{ ascending: false \}\)[\s\S]*\.order\('id', \{ ascending: true \}\)/);
    assert.match(contacts, /setContacts\(allContacts\.filter/);
    assert.match(customers, /onCreated=\{\(\) => refresh\(\)\}/);
    assert.match(wizard, /const creationLocationId = activeLocationId \?\? profile\.location_id \?\? null/);
    assert.match(wizard, /p_location_id: creationLocationId/);
    assert.match(wizard, /location_id: creationLocationId/);
    assert.match(wizard, /await onCreated\?\.\(deal\.id\);[\s\S]*onClose\(\);/);
    assert.match(pipeline, /contact:contact_id\(first_name, last_name, phone\)/);
  });

  it('keeps the calendar as a high-contrast dark surface inside the light canvas', async () => {
    const [css, service] = await Promise.all([
      read('src/index.css'),
      read('src/pages/Service.tsx'),
    ]);

    assert.match(service, /className="schedule-calendar[^\"]*bg-ink-900/);
    assert.match(css, /\.schedule-calendar\s*\{[\s\S]*?--color-ink-900:\s*#0D1726/i);
    assert.match(css, /\.schedule-calendar\s*\{[\s\S]*?--color-ink-100:\s*#F7F9FC/i);
    assert.match(css, /\.app-main \.schedule-calendar \.text-purple-200\s*\{\s*color:\s*var\(--color-purple-200\) !important;/i);
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
