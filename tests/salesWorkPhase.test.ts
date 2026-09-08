import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salesWorkPhase,salesWorkLabel} from '../src/lib/salesWorkPhase.ts';
test('legacy won work needs review without being discarded or called sales neglect',()=>{
 assert.equal(salesWorkPhase(null,true,true),'needs_review');
 assert.equal(salesWorkPhase(null,true,false),'pre_sale');
 assert.equal(salesWorkPhase('post_sale',true,true),'post_sale');
 assert.equal(salesWorkPhase(null,false,false),'other');
 assert.match(salesWorkLabel(salesWorkPhase(null,true,true)),/purpose needs review/);
});
