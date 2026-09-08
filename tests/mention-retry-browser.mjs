// Isolated browser; every command response is local and simulated.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium} from '/Users/andrewemmel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:`import {runAgentTask} from './src/agent/run.ts';window.run=()=>runAgentTask('Prepare the pickup note',{dealId:'10000000-0000-4000-8000-000000000001'});`,resolveDir:process.cwd(),loader:'ts'},plugins:[{name:'session-mock',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},()=>({path:'session',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:"export const supabase={auth:{getSession:async()=>({data:{session:{access_token:'FAKE_LOCAL',user:{id:window.actor||'actor-a'}}},error:null})}};",loader:'js'}));}}],bundle:true,write:false,format:'esm',platform:'browser'});
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:'<script type="module" src="/app.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage();const sent=[];let fail=true;
await page.route('**/api/agent/run',route=>{sent.push(route.request().postDataJSON());return route.fulfill({status:fail?504:200,contentType:'application/json',body:JSON.stringify(fail?{error:'simulated lost response'}:{message:{content:'Saved note'}})});});
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>typeof window.run==='function');
 assert.match(await page.evaluate(()=>window.run().catch(e=>e.message)),/Unfinished Ari request/);
 await page.reload();await page.waitForFunction(()=>typeof window.run==='function');fail=false;
 assert.equal(await page.evaluate(()=>window.run()),'Saved note');assert.equal(sent[0].operation_id,sent[1].operation_id);assert.deepEqual(sent[0].source,{kind:'deal',id:'10000000-0000-4000-8000-000000000001'});
 await page.evaluate(()=>window.run());assert.notEqual(sent[1].operation_id,sent[2].operation_id);
 fail=true;await page.evaluate(()=>window.run().catch(()=>null));await page.evaluate(()=>{window.actor='actor-b';});await page.evaluate(()=>window.run().catch(()=>null));assert.notEqual(sent[3].operation_id,sent[4].operation_id);
 console.log(JSON.stringify({lostReply:'same receipt after reload',intentionalRepeat:'new identity',accountScope:'isolated',transport:'mocked; no production calls'}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
