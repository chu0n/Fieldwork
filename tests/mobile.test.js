import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fingerprint,saveProject,loadProject,openTemplate} from '../src/core.js';
import {createAppServer} from '../tools/serve-iphone.mjs';
test('LAN fingerprint fallback matches WebCrypto and existing SHA-256 backups',async()=>{
 for(const source of ['', 'abc', '\uFEFFHọ tên "quoted"\r\n第二行', 'repeat'.repeat(15000)]){
   const expected=createHash('sha256').update(source).digest('hex');
   assert.equal(await fingerprint(source,null),expected);
   assert.equal(await fingerprint(source),expected);
 }
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 try{
   Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto)}});
   const d=openTemplate('local source','template.txt'),project=await saveProject(d,[],false);
   assert.equal((await loadProject(project)).doc.source,d.source);
 }finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('iPhone launcher serves only the packaged HTML and rejects uploads / filesystem routes',async t=>{
 const html='<!doctype html><title>Fieldwork QA</title>',server=createAppServer(html);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>{server.closeAllConnections();server.close();});
 const origin=`http://127.0.0.1:${server.address().port}`;
 for(const path of ['/','/index.html']){const r=await fetch(origin+path);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'text/html; charset=utf-8');assert.equal(await r.text(),html);}
 for(const path of ['/src/core.js','/data/samples/private.txt','/../package.json','/%2e%2e%2fpackage.json','/serve-iphone.mjs'])assert.equal((await fetch(origin+path)).status,404);
 assert.equal((await fetch(origin+'/',{method:'POST',body:'candidate data'})).status,405);
 const head=await fetch(origin+'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});
