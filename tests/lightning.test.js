import test from 'node:test';
import assert from 'node:assert/strict';
import { openTemplate, renderTemplate, makeBinding, units } from '../src/core.js';
import { lightningRules, jsConstants, selectorKind, updateRuleMetadata } from '../src/lightning.js';
import { DEMO_SOURCE } from '../src/demo.js';
import { diffHTML } from '../src/diff-view.js';
import { SessionStore } from '../src/session-store.js';
import fs from 'node:fs';

test('Lightning demo has all 32 rules including blank-valued CLICK and WAIT',()=>{
 const doc=openTemplate(DEMO_SOURCE,'demo.txt'),rules=lightningRules(doc);
 assert.equal(rules.length,32);assert.equal(rules.filter(r=>r.info.family==='data').length,22);
 const click=rules.find(r=>r.type==='6');assert.equal(click.editColumn,2);assert.ok(click.value.includes('//div'));assert.equal(click.info.family,'automation');
 const waits=rules.filter(r=>r.type==='12');assert.deepEqual(waits.map(r=>r.value),['3000','1000']);assert.ok(waits.every(r=>r.legacyNameParameter));
});
test('site inherits from profile and mode is only interpreted for text/password',()=>{
 const doc=openTemplate(DEMO_SOURCE,'demo.txt');const text=lightningRules(doc).find(r=>r.type==='0');
 assert.equal(text.site,'https://docs.google.com/forms/');assert.equal(text.siteSource,'Profile');assert.equal(text.mode,'Ghi đè nội dung');
 const select=lightningRules(doc).find(r=>r.type==='2');assert.ok(select.mode.startsWith('Không áp dụng'));
 const rows=doc.rows.map(r=>[...r]);rows[text.row][4]='https://example.com/form';
 const changed={...doc,rows};assert.equal(lightningRules(changed)[0].siteSource,'Rule');
});
test('JS constants are parsed from the IIFE without executing it',()=>{
 const code='(()=>{ const TARGET_FILE_NAME="old.jpg"; const ignored=12; throw new Error("must not run"); })();';
 const constants=jsConstants(code);assert.equal(constants.length,1);assert.equal(code.slice(constants[0].start,constants[0].end),'old.jpg');
});
test('JS literal value with quotes remains valid inside a Lightning CSV',()=>{
 const doc=openTemplate(DEMO_SOURCE,'demo.txt');const rule=lightningRules(doc).find(r=>r.constants.some(c=>c.name==='TARGET_FILE_NAME'));const c=rule.constants[0];
 const f={id:'f1',label:'Ảnh',type:'text',value:'ảnh "mới".jpg',required:false,transform:'none',bindings:[makeBinding(doc,rule.unitId,c.start,c.end)]};
 const result=renderTemplate(doc,[f]);assert.deepEqual(result.problems,[]);assert.ok(result.output.includes('ảnh'));
 assert.equal(result.changed.length,1);
});
test('unknown action type is identified as unknown instead of guessing a behavior',()=>{
 const doc=openTemplate(DEMO_SOURCE,'demo.txt');const rows=doc.rows.map(r=>[...r]);rows[5][1]='99';
 const rule=lightningRules({...doc,rows})[0];assert.equal(rule.info.family,'unknown');assert.ok(rule.info.label.includes('99'));
});
test('selectors retain their strategy and obfuscated names are not invented',()=>{
 assert.equal(selectorKind('//div[@role="button"]'),'XPath');assert.equal(selectorKind('/^EMAIL$/i'),'Biểu thức regex');assert.equal(selectorKind('"EMAIL"'),'Khớp chính xác');
 const doc=openTemplate(DEMO_SOURCE,'demo.txt');doc.rows[5][2]='"-. .- -- . *"';assert.equal(lightningRules(doc)[0].title,'Chưa đặt tên · r1');
});
test('malformed prefixed Lightning profile header is not silently treated as plain text',()=>{
 const broken='https://example.com/'+DEMO_SOURCE;const doc=openTemplate(broken,'broken.txt');assert.equal(doc.kind,'csv');
 assert.ok(renderTemplate(doc,[]).problems.some(p=>p.includes('AUTOFILL PROFILES')));
});
test('single-line diff highlights specific changes and escapes markup',()=>{
 const html=diffHTML('old@example.com','<img src=x>@example.com');assert.ok(html.includes('<del>'));assert.ok(html.includes('<ins>'));assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
});
test('code diff collapses unchanged lines and has line numbers',()=>{
 const before=Array.from({length:25},(_,i)=>`const x${i} = ${i};`).join('\n');const after=before.replace('const x12 = 12;','const x12 = 999;');
 const html=diffHTML(before,after);assert.ok(html.includes('dòng giữ nguyên'));assert.ok(html.includes('999'));assert.ok(html.includes('diff-line removed'));assert.ok(html.includes('diff-line added'));
});
test('password diff never discloses either value',()=>{const html=diffHTML('old-secret','new-secret',{sensitive:true});assert.ok(!html.includes('old-secret'));assert.ok(!html.includes('new-secret'));});
test('multiple sessions retain independent fields, drafts and histories',()=>{
 const store=new SessionStore();const a={doc:{name:'a.txt'},fields:[{value:'a'}],drafts:new Map([['text','draft a']]),history:['a']};const b={doc:{name:'b.txt'},fields:[{value:'b'}],drafts:new Map(),history:[]};
 const idA=store.add(a),idB=store.add(b);store.select(idB).fields[0].value='edited b';assert.equal(store.select(idA).fields[0].value,'a');assert.equal(store.select(idA).drafts.get('text'),'draft a');
 store.remove(idB);assert.equal(store.activeId,idA);assert.equal(store.items.length,1);
});
test('closing active session selects a remaining neighbor and enforces session limit',()=>{const store=new SessionStore(2);const a=store.add({doc:{name:'same.txt'}});const b=store.add({doc:{name:'same.txt'}});assert.notEqual(a,b);assert.throws(()=>store.add({}),/Tối đa/);assert.equal(store.remove(b).doc.name,'same.txt');assert.equal(store.activeId,a);store.remove(a);assert.equal(store.activeId,null);});
test('public Lightning fixture exposes data and automation rules',()=>{
 const path=new URL('../examples/lightning-demo.txt',import.meta.url);
 const doc=openTemplate(fs.readFileSync(path,'utf8'),'demo.txt'),rules=lightningRules(doc);
 assert.equal(rules.length,32);
 assert.equal(rules.filter(r=>r.info.family==='automation').length,10);
 assert.ok(rules.find(r=>r.id==='r23').constants.some(c=>c.name==='TARGET_FILE_NAME'));
 assert.equal(units(doc).find(u=>u.id===rules[0].unitId).col,3);
});
test('metadata edits preserve Value, sibling rules and unrelated bindings',()=>{
 const doc=openTemplate(DEMO_SOURCE,'demo.txt'),r=lightningRules(doc)[0];const b=makeBinding(doc,r.unitId,0,r.value.length);
 const field={id:'f',label:'Name',type:'text',value:'NEW',required:false,transform:'none',bindings:[b]};
 const next=updateRuleMetadata(doc,r.row,{site:'https://example.com/form',mode:'0'},[field]);assert.equal(next.removedBindings,0);assert.equal(next.fields.length,1);assert.equal(next.doc.rows[r.row][3],doc.rows[r.row][3]);assert.equal(next.doc.rows[r.row][4],'https://example.com/form');assert.deepEqual(next.doc.rows[r.row+1],doc.rows[r.row+1]);
});
test('changing rule type invalidates only that rule’s bindings',()=>{
 const doc=openTemplate(DEMO_SOURCE,'demo.txt'),rules=lightningRules(doc);const a=rules[0],b=rules[1];
 const field={id:'f',label:'Multi',type:'text',value:'new',required:false,transform:'none',bindings:[makeBinding(doc,a.unitId,0,a.value.length),makeBinding(doc,b.unitId,0,b.value.length)]};
 const next=updateRuleMetadata(doc,a.row,{type:'2'},[field]);assert.equal(next.removedBindings,1);assert.equal(next.fields[0].bindings.length,1);assert.equal(next.fields[0].bindings[0].unitId,b.unitId);
});
