import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {openTemplate,makeBinding,renderTemplate} from '../src/core.js';
import {lightningRules,profileDefinitions} from '../src/lightning.js';
import {addProfile,addRule,updateProfile,updateRuleBatch,profilesWithCounts} from '../src/profile-tools.js';
import {baselineValue,compareDocuments,rebaseDocumentState} from '../src/document-model.js';
import {filterRules,sortRules,groupRules} from '../src/rule-filter.js';
import {inline,configureDiff,getDiffOptions} from '../src/diff-view.js';
const source='\uFEFF'+Papa.unparse([
 ['### AUTOFILL PROFILES ###'],['Profile ID','Name','Site','Hotkey'],
 ['c1','First','https://example.test/','Ctrl + Q'],['c2','Second','',''],
 ['### AUTOFILL RULES ###'],['Rule ID','Type','Name','Value','Site','Mode','Profile'],
 ['r1','0','/^.--. .... --- -. ./i','OLD "quoted" \'value\'','','0','c1'],
 ['r2','3','bank','1','','1','c1'],['r10','0','Email','a@example.test','https://override.test/','1','c2'],
 ['r4','4','','const TARGET_FILE_NAME = "old.jpg";','','0',''],
 ['### AUTOFILL SETTINGS ###'],['activecat','c1'],['untouched','"literal" \'quote\'']
 ],{newline:'\r\n'})+'\r\n';
const doc=()=>openTemplate(source,'profiles.csv');
test('smart diff highlights complete replacement, retains useful suffix edits and escapes markup',()=>{
 assert.deepEqual(inline('TENTHISINHHHHH','Nguyen Thanh Minh'),['<del>TENTHISINHHHHH</del>','<ins>Nguyen Thanh Minh</ins>']);
 assert.deepEqual(inline('TENTHISINH','TENTHISINHdsf'),['TENTHISINH','TENTHISINH<ins>dsf</ins>']);
 assert.deepEqual(inline('old','<img>'),['<del>old</del>','<ins>&lt;img&gt;</ins>']);
 assert.deepEqual(inline('abXYcd','abZZcd',{mode:'smart',minMatch:3,similarity:0}),['<del>abXYcd</del>','<ins>abZZcd</ins>']);
 assert.deepEqual(inline('abXYcd','abZZcd',{mode:'smart',minMatch:2,similarity:0}),['ab<del>XY</del>cd','ab<ins>ZZ</ins>cd']);
});
test('diff preferences clamp values and do not modify output data',()=>{
 const d=doc();configureDiff({mode:'whole',minMatch:50,similarity:2});
 assert.deepEqual(getDiffOptions(),{mode:'whole',minMatch:12,similarity:1});
 assert.deepEqual(inline('abcd','abce'),['<del>abcd</del>','<ins>abce</ins>']);
 assert.equal(renderTemplate(d,[]).output,source);configureDiff();
});
test('profile context includes empty profiles and rule Site overrides inherited Site',()=>{
 const d=addProfile(doc(),{name:'Empty'}).doc;
 assert.deepEqual(profilesWithCounts(d).map(p=>p.count),[2,1,0]);
 const rules=lightningRules(d);assert.equal(rules[0].site,'https://example.test/');
 assert.equal(rules[2].site,'https://override.test/');assert.equal(rules[2].siteSource,'Rule');
});
test('profile update patches only requested record cells and retains all quote spellings',()=>{
 const d=doc(),next=updateProfile(d,'c1',{name:'Renamed',hotkey:'Ctrl + Shift + K'});
 assert.equal(next.bom,true);assert.equal(next.source,d.source.replace('c1,First,https://example.test/,Ctrl + Q','c1,Renamed,https://example.test/,Ctrl + Shift + K'));
 assert.deepEqual(compareDocuments(d,next).map(c=>c.col),[1,3]);
 assert.throws(()=>updateProfile(d,'missing',{name:'x'}));assert.throws(()=>updateProfile(d,'c1',{name:' '}));
});
test('sort and grouping are view-only, numeric, stable and combine with profile filters',()=>{
 const d=doc(),rules=lightningRules(d),original=rules.map(r=>r.id);
 assert.deepEqual(sortRules(rules,{sortBy:'id'}).map(r=>r.id),['r1','r2','r4','r10']);
 assert.deepEqual(sortRules(rules,{sortBy:'changed'},r=>r.id==='r10').map(r=>r.id),['r10','r1','r2','r4']);
 assert.deepEqual(groupRules(rules,{groupBy:'type'}).map(g=>g.key),['0','3','4']);
 assert.deepEqual(groupRules(rules,{groupBy:'profile'}).map(g=>g.key),['c1','c2','__unfiled__']);
 assert.deepEqual(filterRules(rules,{profileFilter:'__unfiled__'},r=>r.value,()=>false).map(r=>r.id),['r4']);
 assert.deepEqual(rules.map(r=>r.id),original);assert.equal(renderTemplate(d,[]).output,source);
});
test('batch profile changes retain IDs, execution order and values; Mode only affects text/password',()=>{
 const d=doc(),next=updateRuleBatch(d,['r1','r2'],{profile:'c2',mode:'3'});
 assert.equal(next.affected,2);const changes=compareDocuments(d,next.doc);
 assert.deepEqual(changes.map(c=>c.col),[5,6,6]);
 assert.deepEqual(lightningRules(next.doc).map(r=>[r.id,r.value]),lightningRules(d).map(r=>[r.id,r.value]));
 assert.equal(lightningRules(next.doc)[1].modeCode,'1');
 assert.throws(()=>updateRuleBatch(d,['gone'],{profile:'c2'}));
 assert.throws(()=>updateRuleBatch(d,['r1'],{profile:'missing'}));
 assert.throws(()=>updateRuleBatch(d,['r1'],{mode:'8'}));
});
test('inserting profile rebases bindings and drafts by ID, avoiding false changes in shifted rows',()=>{
 const d=doc(),rule=lightningRules(d)[0];
 const field={id:'f',label:'Name',value:'NEW VALUE',type:'text',transform:'none',bindings:[makeBinding(d,rule.unitId,0,rule.value.length)]};
 const next=addProfile(d,{name:'New',site:'https://new.test/',hotkey:'Ctrl + Y'});
 const rebased=rebaseDocumentState(d,next.doc,[field],new Map([[rule.unitId,'draft']]));
 const newRule=lightningRules(next.doc)[0];assert.notEqual(newRule.unitId,rule.unitId);
 assert.equal(rebased.fields[0].bindings[0].unitId,newRule.unitId);assert.equal(rebased.drafts.get(newRule.unitId),'draft');
 assert.equal(baselineValue(d,next.doc,newRule.unitId),rule.value);
 const changes=compareDocuments(d,next.doc);assert.ok(changes.every(c=>next.doc.rows[c.row][0]===next.id));
 const rendered=openTemplate(renderTemplate(next.doc,rebased.fields).output,'profiles.csv');
 assert.equal(lightningRules(rendered)[0].value,'NEW VALUE');
 assert.equal(profileDefinitions(rendered).length,3);
});
test('add rule finds unused ID, appends before Settings, preserves original bytes and Safe default',()=>{
 const d=doc(),next=addRule(d,{name:'/^EMAIL$/i',value:'"new" \'quote\'\nline',profile:'c2'}),rules=lightningRules(next.doc);
 assert.equal(next.id,'r3');assert.equal(rules.at(-1).value,'"new" \'quote\'\nline');assert.equal(rules.at(-1).modeCode,'0');
 assert.equal(next.doc.bom,true);assert.ok(next.doc.source.endsWith(d.source.slice(d.source.indexOf('### AUTOFILL SETTINGS ###'))));
 const start=d.source.indexOf('### AUTOFILL SETTINGS ###');assert.ok(next.doc.source.startsWith(d.source.slice(0,start)));
 assert.ok(compareDocuments(d,next.doc).every(c=>next.doc.rows[c.row][0]==='r3'));
 assert.throws(()=>addRule(d,{type:'CLICK'}));assert.throws(()=>addRule(d,{mode:'8'}));
 assert.throws(()=>addRule(d,{profile:'gone'}));
});
test('CSV insertion works with end of file, trailing blanks and preserved BOM',()=>{
 for(const end of ['', '\n', '\n\n']){
 const d=openTemplate('### AUTOFILL PROFILES ###\nProfile ID,Name,Site,Hotkey\nc1,Main,,\n\n### AUTOFILL RULES ###\nRule ID,Type,Name,Value,Site,Mode,Profile'+end,'tiny.csv');
 const next=addRule(d,{name:'text',value:'new',profile:'c1'}).doc;
 assert.equal(lightningRules(next).length,1);assert.equal(lightningRules(next)[0].value,'new');
 }
});
test('generic CSV stable cell identity survives first-column edits without flagging the row',()=>{
 const before=openTemplate('first,second\nthird,fourth','generic.csv'),after=openTemplate('FIRST,second\nthird,fourth','generic.csv');
 assert.deepEqual(compareDocuments(before,after).map(c=>[c.id,c.value,c.after]),[['0:0','first','FIRST']]);
});
