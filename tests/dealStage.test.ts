import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { activePipelineStages, isActiveDeal, isClosedStage, outcomeStage } from '../src/lib/dealStage.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const stages = [
  { id: 'lead', is_won: false, is_lost: false, name: 'Lead' },
  { id: 'quote', is_won: false, is_lost: false, name: 'Quote' },
  { id: 'won', is_won: true, is_lost: false, name: 'Closed - Won' },
  { id: 'lost', is_won: false, is_lost: true, name: 'Closed - Lost' },
];

describe('deal stage outcomes', () => {
  it('offers only active stages in the inline stage editor', () => {
    assert.deepEqual(activePipelineStages(stages).map(stage => stage.id), ['lead', 'quote']);
  });

  it('resolves explicit Won and Lost destinations from stage semantics', () => {
    assert.equal(outcomeStage(stages, 'won')?.id, 'won');
    assert.equal(outcomeStage(stages, 'lost')?.id, 'lost');
    assert.equal(isClosedStage(stages[0]), false);
    assert.equal(isClosedStage(stages[2]), true);
  });

  it('removes Won and Lost deals from the active-deal read model', () => {
    assert.equal(isActiveDeal({ stage_id: 'lead' }, stages), true);
    assert.equal(isActiveDeal({ stage_id: 'won' }, stages), false);
    assert.equal(isActiveDeal({ stage_id: 'lost' }, stages), false);
  });

  it('wires the active Deals table to the atomic move path and customer reference', async () => {
    const [dealsPage, pipeline, customerDetail] = await Promise.all([
      read('src/pages/Deals.tsx'),
      read('src/hooks/usePipeline.ts'),
      read('src/pages/ContactDetail.tsx'),
    ]);

    assert.match(dealsPage, /aria-label=\{`Stage for \$\{deal\.title\}`\}/);
    assert.match(dealsPage, /aria-label=\{`Mark \$\{deal\.title\} won`\}/);
    assert.match(dealsPage, /aria-label=\{`Mark \$\{deal\.title\} lost`\}/);
    assert.match(dealsPage, /moveDealToStage\(deal\.id, stageId\)/);
    assert.match(dealsPage, /filter\(deal => isActiveDeal\(deal, stages\)\)/);
    assert.match(pipeline, /supabase\.rpc\('move_deal'/);
    assert.match(customerDetail, /from\('deals'\)[\s\S]*eq\('contact_id', id\)/);
    assert.match(customerDetail, /d\.stage\?\.name[\s\S]*\{d\.stage\.name\}/);
  });
});
