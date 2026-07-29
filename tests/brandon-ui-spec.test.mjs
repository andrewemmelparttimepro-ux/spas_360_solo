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

  it('keeps the eight independent primary navigation destinations', async () => {
    const header = await read('src/components/layout/Header.tsx');
    const destinations = ['Dashboard', 'Customers', 'Deals', 'Inventory', 'Schedule', 'Inbox', 'Citadel', 'Reports'];

    for (const destination of destinations) {
      assert.match(header, new RegExp(`name: '${destination}'`));
    }
    assert.doesNotMatch(header, /label:\s*'(CRM|Sales|Service)'/);
  });

  it('keeps requested dashboard, deals, inventory, schedule, and priority wording', async () => {
    const [dashboard, salesBoard, customers, inventory, inventoryEditor, service, dealDetail] = await Promise.all([
      read('src/pages/Dashboard.tsx'),
      read('src/components/SalesBoard.tsx'),
      read('src/pages/Customers.tsx'),
      read('src/pages/Inventory.tsx'),
      read('src/components/InventoryEditor.tsx'),
      read('src/pages/Service.tsx'),
      read('src/pages/DealDetail.tsx'),
    ]);

    assert.match(dashboard, /title: 'Parts On Order'/);
    assert.match(customers, /useState<CustomerSort>\('recent'\)/);
    assert.match(customers, /localStorage\.getItem\(VIEW_KEY\) === 'cards' \? 'cards' : 'list'/);
    assert.match(salesBoard, /label: 'Active Deals'/);
    assert.match(salesBoard, /label: 'Overdue Sales Tasks'/);
    assert.match(inventory, /const BRAND_OPTIONS = \['Sundance Spas', 'Master Spas', 'Platinum Spas', 'Eco Spas'\]/);
    assert.match(inventory, />Model</);
    assert.match(inventory, />Serial Number</);
    assert.doesNotMatch(inventoryEditor, />SKU</);
    assert.match(inventoryEditor, />Serial Number \*</);
    assert.match(inventoryEditor, />Model \*</);
    assert.match(service, /const LEGEND_STATUSES: JobStatus\[\] = \['Delivery', 'Warranty', 'Parts on Order'\]/);
    assert.match(dealDetail, />Priority</);
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
