// Local-only React integration: no production sessions or network requests.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium} from '/Users/andrewemmel/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{useDraftState}from'./src/hooks/useDraftState.ts';function App(){const[scope,S]=useState('a:customer1');const[value,V]=useDraftState(scope,'name','');return <><input aria-label="Draft" value={value} onChange={e=>V(e.target.value)}/><button onClick={()=>S('a:customer2')}>Second customer</button><button onClick={()=>S('a:customer1')}>First customer</button><button onClick={()=>S('b:customer1')}>Other account</button></>;}createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',platform:'browser'});
const server=createServer((req,res)=>{res.setHeader('content-type',req.url==='/app.js'?'application/javascript':'text/html');res.end(req.url==='/app.js'?bundle.outputFiles[0].contents:'<div id="root"></div><script type="module" src="/app.js"></script>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.getByLabel('Draft').fill('Customer one draft');
 await page.getByRole('button',{name:'Second customer'}).click();assert.equal(await page.getByLabel('Draft').inputValue(),'');await page.getByLabel('Draft').fill('Customer two draft');
 await page.getByRole('button',{name:'First customer'}).click();assert.equal(await page.getByLabel('Draft').inputValue(),'Customer one draft');
 await page.getByRole('button',{name:'Other account'}).click();assert.equal(await page.getByLabel('Draft').inputValue(),'');
 await page.reload();assert.equal(await page.getByLabel('Draft').inputValue(),'Customer one draft');
 await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw new DOMException('Restricted','SecurityError');};});await page.getByLabel('Draft').fill('Still editable');assert.equal(await page.getByLabel('Draft').inputValue(),'Still editable');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({recordScope:'isolated',accountScope:'isolated',remount:'restored',restrictedStorage:'editable',pageErrors:errors}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
