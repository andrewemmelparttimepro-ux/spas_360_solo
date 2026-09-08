import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summaryHash, reusableNarration } from '../api/_lib/summaryProvenance.ts';
test('summary cache follows facts and expires; old personal narration never survives', () => {
 const hash = summaryHash({ tasks: 2, day: '2026-09-08' });
 assert.equal(hash, summaryHash({ day: '2026-09-08', tasks: 2 }));
 assert.notEqual(hash, summaryHash({ day: '2026-09-08', tasks: 1 }));
 const now = Date.parse('2026-09-08T16:00Z');
 const row = { source_hash: hash, created_at: new Date(now-60_000).toISOString(), narration: 'Alex has two open tasks.' };
 assert.equal(reusableNarration(row,hash,now),true);
 assert.equal(reusableNarration({...row,narration:'Your Mike follow-up is late.'},hash,now),false);
 assert.equal(reusableNarration({...row,source_hash:null},hash,now),false);
 assert.equal(reusableNarration(row,hash,now+16*60_000),false);
});
