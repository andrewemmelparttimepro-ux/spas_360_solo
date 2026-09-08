import{test}from'node:test';import assert from'node:assert/strict';import{dispatchPush}from'../api/_lib/push-delivery.ts';
test('push service acceptance, revoked registrations and transient failures remain distinct',async()=>{
 const targets=['accepted','expired','forbidden','offline'].map(name=>({endpoint:'https://example.invalid/'+name,keys:{p256dh:'fake',auth:'fake'}}));
 const result=await dispatchPush(targets,async target=>{if(target.endpoint.endsWith('expired'))throw{statusCode:410};if(target.endpoint.endsWith('forbidden'))throw{statusCode:403};if(target.endpoint.endsWith('offline'))throw Error('timeout');});
 assert.equal(result.sent,1);assert.equal(result.failed,2);assert.deepEqual(result.expired,[targets[1].endpoint]);assert.deepEqual(result.outcomes.map(o=>o.state),['accepted','expired','failed','failed']);assert.equal(JSON.stringify(result).includes('fake'),false);
});
