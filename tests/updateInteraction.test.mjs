import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/releaseSafety.ts',import.meta.url),'utf8').replace('import.meta.env.VITE_APP_VERSION',"'fixture'");
function harness(editing) {
 const events=[];let reloads=0;
 const context={exports:{},Event,document:{querySelector:()=>editing?{}:null},window:{dispatchEvent:e=>events.push(e.type),location:{reload:()=>reloads++},confirm:()=>{throw Error('Blocking dialog');},alert:()=>{throw Error('Blocking dialog');}}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,context);
 return {update:()=>context.exports.reloadWhenReady(),events,reloads:()=>reloads};
}
test('an explicit update preserves an open form and shows inline feedback',()=>{
 const h=harness(true);h.update();assert.equal(h.reloads(),0);assert.deepEqual(h.events,['spas:update-blocked']);
});
test('an explicit update on an idle page reloads once without a blocking browser dialog',()=>{
 const h=harness(false);h.update();assert.equal(h.reloads(),1);assert.deepEqual(h.events,[]);
});
