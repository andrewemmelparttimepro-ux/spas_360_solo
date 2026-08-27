import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Inventory search focus contract', () => {
  it('keeps the mounted search input while query requests are in flight', async () => {
    const hook = await read('src/hooks/useInventory.ts');
    const fetchBody = hook.match(/const fetchItems = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[profile, activeLocationId, searchQuery\]\);/)?.[1];

    assert.ok(fetchBody, 'inventory fetch callback should remain identifiable');
    assert.doesNotMatch(fetchBody, /setIsLoading\(true\)/);
    assert.match(hook, /const \[isLoading, setIsLoading\] = useState\(true\);/);
    assert.match(fetchBody, /const fetchId = \+\+latestFetchId\.current;/);
    assert.match(fetchBody, /if \(fetchId !== latestFetchId\.current\) return;/);
  });

  it('keeps serial, model, and category narrowing together with store and brand filters', async () => {
    const [hook, page] = await Promise.all([
      read('src/hooks/useInventory.ts'),
      read('src/pages/Inventory.tsx'),
    ]);

    assert.match(hook, /query = query\.eq\('location_id', activeLocationId\);/);
    assert.match(hook, /sku\.ilike\.%\$\{needle\}%,product\.ilike\.%\$\{needle\}%,category\.ilike\.%\$\{needle\}%/);
    assert.match(page, /value=\{searchQuery\} onChange=\{e => setSearchQuery\(e\.target\.value\)\}/);
    assert.match(page, /items\.filter\(item => inventoryMatchesBrand\(item, brandFilter\)\)/);
  });
});
