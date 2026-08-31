import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  ALL_DEAL_OWNERS,
  filterDealOwnerOptions,
  matchesDealOwnerFilter,
  UNASSIGNED_DEAL_OWNER,
} from '../src/lib/dealOwnerFilter.ts';
import { THRAWN_PROFILE_ID } from '../src/lib/upcomingTasks.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const stages = [
  { id: 'active', is_won: false, is_lost: false },
  { id: 'won', is_won: true, is_lost: false },
  { id: 'lost', is_won: false, is_lost: true },
];

const owners = [
  { id: 'brandon', first_name: 'Brandon', last_name: 'Solem', role: 'owner_manager' as const },
  { id: THRAWN_PROFILE_ID, first_name: 'NDAI', last_name: 'Thrawn', role: 'owner_manager' as const },
  { id: 'human-called-thrawn', first_name: 'Human', last_name: 'Thrawn', role: 'salesperson' as const },
];

describe('Deals salesperson filter', () => {
  it('excludes only the known Thrawn profile by stable identity', () => {
    assert.deepEqual(filterDealOwnerOptions(owners).map(owner => owner.id), [
      'brandon',
      'human-called-thrawn',
    ]);
  });

  it('keeps All Salespeople as the unrestricted default', () => {
    assert.equal(matchesDealOwnerFilter({ assigned_to: null, stage_id: 'won' }, stages, ALL_DEAL_OWNERS), true);
    assert.equal(matchesDealOwnerFilter({ assigned_to: 'brandon', stage_id: 'active' }, stages, ALL_DEAL_OWNERS), true);
  });

  it('matches Unassigned only for active deals with a null assignment', () => {
    assert.equal(matchesDealOwnerFilter({ assigned_to: null, stage_id: 'active' }, stages, UNASSIGNED_DEAL_OWNER), true);
    assert.equal(matchesDealOwnerFilter({ assigned_to: 'brandon', stage_id: 'active' }, stages, UNASSIGNED_DEAL_OWNER), false);
    assert.equal(matchesDealOwnerFilter({ assigned_to: null, stage_id: 'won' }, stages, UNASSIGNED_DEAL_OWNER), false);
    assert.equal(matchesDealOwnerFilter({ assigned_to: null, stage_id: 'lost' }, stages, UNASSIGNED_DEAL_OWNER), false);
  });

  it('composes the owner match with the existing priority filter', () => {
    const deals = [
      { id: 'high-unassigned', assigned_to: null, stage_id: 'active', priority: 'High' },
      { id: 'low-unassigned', assigned_to: null, stage_id: 'active', priority: 'Low' },
      { id: 'high-assigned', assigned_to: 'brandon', stage_id: 'active', priority: 'High' },
    ];

    const visible = deals.filter(deal =>
      matchesDealOwnerFilter(deal, stages, UNASSIGNED_DEAL_OWNER) && deal.priority === 'High');

    assert.deepEqual(visible.map(deal => deal.id), ['high-unassigned']);
  });

  it('wires the same owner-filtered deal set into List and Board', async () => {
    const [dealsPage, pipeline] = await Promise.all([
      read('src/pages/Deals.tsx'),
      read('src/hooks/usePipeline.ts'),
    ]);

    assert.match(dealsPage, /useState<DealOwnerFilter>\(ALL_DEAL_OWNERS\)/);
    assert.match(dealsPage, /<option value=\{ALL_DEAL_OWNERS\}>All Salespeople<\/option>/);
    assert.match(dealsPage, /<option value=\{UNASSIGNED_DEAL_OWNER\}>Unassigned<\/option>/);
    assert.match(dealsPage, /matchesDealOwnerFilter\(deal, stages, ownerFilter\)/);
    assert.match(dealsPage, /const visibleDeals = deals\.filter\(matchesDealFilters\)/);
    assert.match(dealsPage, /const activeDeals = visibleDeals[\s\S]*?filter\(deal => isActiveDeal\(deal, stages\)\)/);
    assert.match(dealsPage, /<SalesBoard deals=\{visibleDeals\}/);
    assert.match(pipeline, /\.neq\('id', THRAWN_PROFILE_ID\)/);
    assert.match(pipeline, /setSalespeople\(filterDealOwnerOptions\(/);
  });
});
