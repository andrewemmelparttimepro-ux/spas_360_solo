// Isolated browser fixtures. All remote traffic is intercepted; no live writes.
import { chromium } from '/Users/andrewemmel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';

const root = process.cwd();
let old = true;
let nextVersion = false;
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname.startsWith('/_vercel/') || pathname.startsWith('/api/')) { res.setHeader('content-type', pathname.endsWith('.js') ? 'application/javascript' : 'application/json'); res.end(pathname.endsWith('.js') ? '' : '{}'); return; }
  if (pathname === '/version.json' && nextVersion) { res.setHeader('content-type', 'application/json'); res.end('{"release":"next-test-release"}'); return; }
  let file = pathname.startsWith('/assets/') ? path.join(root, 'dist', pathname) :
    pathname === '/sw.js' ? path.join(root, old ? 'docs/remediation/previous-sw.js' : 'dist/sw.js') :
    pathname === '/version.json' ? path.join(root, 'dist/version.json') :
    /\.(png|svg|ico|webmanifest)$/.test(pathname) ? path.join(root, 'dist', pathname) :
    path.join(root, old ? 'docs/remediation/previous-index.html' : 'dist/index.html');
  try {
    const body = await readFile(file);
    res.setHeader('content-type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : file.endsWith('.png') ? 'image/png' : 'text/html');
    res.setHeader('cache-control', 'no-store'); res.end(body);
  } catch { res.statusCode = 404; res.end('missing'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
const userId = '00000000-0000-0000-0000-000000000011';
const orgId = '00000000-0000-0000-0000-000000000001';
const storeId = '00000000-0000-0000-0000-000000000021';
const profile = { id: userId, org_id: orgId, location_id: storeId, role: 'owner_manager', first_name: 'Test', last_name: 'Owner', email: 'fixture@example.invalid' };
const user = { id: userId, email: profile.email, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: new Date().toISOString() };
await context.addInitScript(({ user }) => {
  const session = { access_token: 'fixture.' + btoa(JSON.stringify({ sub: user.id, exp: 9999999999 })) + '.fixture', refresh_token: 'fixture-only', expires_at: 9999999999, expires_in: 3600, token_type: 'bearer', user };
  localStorage.setItem('sb-kxyqgkimcdxvfkceoixs-auth-token', JSON.stringify(session));
}, { user });
await context.routeWebSocket('**/*', socket => socket.close());
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === base) return route.continue();
  let data = [];
  if (url.pathname.endsWith('/user')) data = { user, ...user };
  if (url.pathname.includes('/profiles')) data = (route.request().headers().accept || '').includes('vnd.pgrst.object') ? profile : [profile];
  if (url.pathname.includes('/locations')) data = [{ id: storeId, org_id: orgId, name: 'Test Store' }];
  if (url.pathname.includes('can_view_') || url.pathname.includes('can_use_')) data = false;
  if (url.pathname.includes('record_app_')) data = '00000000-0000-0000-0000-000000000091';
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: JSON.stringify(data) });
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('dialog', dialog => dialog.accept());
try {
  await page.goto(base + '/customers');
  await page.getByRole('heading', { name: 'Customers', exact: true }).waitFor();
  old = false;
  // Existing document retains its old imports while the server changes beneath it.
  for (const route of ['/deals', '/service', '/inventory', '/customers']) {
    await page.evaluate(route => { history.pushState({}, '', route); dispatchEvent(new PopStateEvent('popstate')); }, route);
    await page.waitForTimeout(350);
    assert.equal(await page.getByText('SPAS 360 hit an unexpected snag').count(), 0);
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'docs/remediation/compatible-assets.json')));
  for (const name of Object.keys(manifest.assets).filter(n => n.endsWith('.js'))) {
    const result = await page.evaluate(async name => {
      const r = await fetch('/assets/' + name); return { ok: r.ok, type: r.headers.get('content-type') };
    }, name);
    assert.equal(result.ok, true); assert.match(result.type, /javascript/);
  }
  await page.reload();
  await page.getByRole('heading', { name: 'Customers', exact: true }).waitFor();
  await page.getByRole('button', { name: /New Customer/i }).first().click();
  await page.getByPlaceholder('First name *', { exact: true }).fill('Retained draft');
  await page.getByPlaceholder('Last name *', { exact: true }).fill('Fixture');
  const before = page.url();
  nextVersion = true;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByRole('button', { name: 'Update when ready', exact: true }).waitFor();
  // Modal prevents update while the staff member is entering customer information.
  await page.getByRole('button', { name: 'Update when ready', exact: true }).click({ force: true });
  assert.equal(page.url(), before);
  assert.equal(await page.getByPlaceholder('First name *', { exact: true }).inputValue(), 'Retained draft');
  await page.reload();
  await page.getByRole('button', { name: /New Customer/i }).first().click();
  assert.equal(await page.getByPlaceholder('First name *', { exact: true }).inputValue(), 'Retained draft');
  assert.equal(await page.getByPlaceholder('Last name *', { exact: true }).inputValue(), 'Fixture');
  await mkdir(path.join(root, 'docs/reports/evidence/remediation'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'docs/reports/evidence/remediation/update-draft.png') });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ oldTabNavigation: 'pass', compatibleChunks: Object.keys(manifest.assets).length, updateWhileEditing: 'blocked', customerDraftAfterReload: 'retained', pageErrors: errors, remoteTraffic: 'all mocked' }));
} finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
