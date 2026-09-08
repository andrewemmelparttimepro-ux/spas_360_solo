import {test} from 'node:test';import assert from 'node:assert/strict';
import {verifyEmailWebhook,receiptReadError} from '../api/_lib/emailReceipts.ts';
const secret='whsec_plJ3nmyCDGBKInavdOK15jsl';const raw=Buffer.from('{"event_type":"ping","data":{"success":true}}');
const headers={id:'msg_loFOjxBNrRLzqYUf',timestamp:'1731705121',signature:'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0='};
test('published Svix vector verifies exact bytes and supports rotated signature lists',()=>{
 assert.equal(verifyEmailWebhook(raw,headers,secret,1731705121000),true);
 assert.equal(verifyEmailWebhook(raw,{...headers,signature:'v1,aW52YWxpZA== '+headers.signature},secret,1731705121000),true);
});
test('changed payload, id, stale/future timestamp and missing secret are rejected',()=>{
 assert.equal(verifyEmailWebhook(Buffer.from(raw+' '),headers,secret,1731705121000),false);
 assert.equal(verifyEmailWebhook(raw,{...headers,id:'another'},secret,1731705121000),false);
 assert.equal(verifyEmailWebhook(raw,headers,secret,1731705521000),false);
 assert.equal(verifyEmailWebhook(raw,headers,secret,1731704721000),false);
 assert.equal(verifyEmailWebhook(raw,headers,'',1731705121000),false);
});
test('receipt permission failure does not imply the send key is invalid',()=>{
 assert.match(receiptReadError(401,'restricted_api_key'),/can send email but cannot read/);
 assert.doesNotMatch(receiptReadError(401,undefined),/invalid|cannot send/);
});
