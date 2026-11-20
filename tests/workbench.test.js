import test from 'node:test';
import assert from 'node:assert/strict';
import { filterRules } from '../src/rule-filter.js';
import { openTemplate, makeBinding, renderTemplate, units, saveProject, loadProject } from '../src/core.js';
import { lightningRules, updateRuleMetadata } from '../src/lightning.js';
import { DEMO_SOURCE } from '../src/demo.js';
import { inlineComparison, comparison, ruleDiff, changesForRule, workspace, welcome, credit } from '../src/workbench.js';
import { valueEditor, editorHighlight } from '../src/value-editor.js';
import { rulePresentation } from '../src/rule-presentation.js';

const doc=openTemplate(DEMO_SOURCE,'demo.txt');
test('fill-first filters combine type, status and profile without excluding checkbox values',()=>{
 const rules=lightningRules(doc);
 assert.equal(filterRules(rules,{ruleGroup:'data'},r=>r.value,()=>false).length,22);
 const bank=rules.find(r=>r.type==='3');
 const filtered=filterRules(rules,{ruleGroup:'data',typeFilter:'3',statusFilter:'changed',profileFilter:bank.profileId},r=>r.value,r=>r.id===bank.id);
 assert.deepEqual(filtered.map(r=>r.id),[bank.id]);
 assert.equal(filterRules(rules,{ruleGroup:'data',typeFilter:'3',statusFilter:'changed',profileFilter:'missing'},r=>r.value,()=>true).length,0);
});
test('search accepts unaccented Vietnamese and finds generated values',()=>{
 const rules=lightningRules(doc);
 assert.ok(filterRules(rules,{ruleGroup:'data',query:'dien thoai'},r=>r.value,()=>false).some(r=>r.target==='ĐIỆN THOẠI'));
 assert.deepEqual(filterRules(rules,{query:'new.person@example.org'},r=>r.id==='r2'?'new.person@example.org':r.value,()=>true).map(r=>r.id),['r2']);
});
test('empty and linked filters inspect new values and real bindings',()=>{
 const rules=lightningRules(doc,[{id:'field',label:'Email',bindings:[{unitId:'6:3'}]}]);
 assert.deepEqual(filterRules(rules,{ruleGroup:'data',statusFilter:'empty'},r=>r.id==='r1'?'':r.value,()=>false).map(r=>r.id),['r1']);
 assert.deepEqual(filterRules(rules,{ruleGroup:'data',statusFilter:'linked'},r=>r.value,()=>false).map(r=>r.id),['r2']);
});
test('short values highlight in the paired cells without repeating a separate diff',()=>{
 const rule=lightningRules(doc)[0],field={id:'f',label:'Họ tên',type:'text',transform:'none',required:false,value:'<img src=x onerror=alert(1)>',bindings:[makeBinding(doc,rule.unitId,0,rule.value.length)]};
 const state={doc,originalDoc:doc,fields:[field],drafts:new Map()},result=renderTemplate(doc,state.fields);
 result.changed=result.changed.map(c=>({...units(doc).find(u=>u.id===c.id),...c}));
 const pair=inlineComparison(state,{result},rule);
 assert.ok(pair.original.includes('<del>'));assert.equal(pair.after,'');
 const view=workspace({...state,query:'',ruleGroup:'data',history:[]},{result});
 assert.ok(view.includes('class="value-mirror"'));assert.ok(view.includes('<ins>'));
 assert.ok(!view.includes('<img src=x'));assert.ok(view.includes('&lt;'));
 assert.ok(!view.includes('class="inline-result"'));
 assert.equal(ruleDiff(state,{result},rule),'');
});
test('new fill from saved configuration clears mapped values and is independent of previous fill',async()=>{
 const rule=lightningRules(doc)[0],field={id:'f',label:'Họ tên',type:'text',transform:'none',required:false,value:'PERSON ONE',bindings:[makeBinding(doc,rule.unitId,0,rule.value.length)]};
 const project=await saveProject(doc,[field],false),one=await loadProject(project),two=await loadProject(project);
 assert.equal(one.fields[0].value,'');assert.equal(two.fields[0].value,'');
 one.fields[0].value='PERSON TWO';
 assert.equal(two.fields[0].value,'');assert.equal(project.fields[0].value,'');assert.equal(field.value,'PERSON ONE');
 assert.equal(two.doc.source,doc.source);
});
test('generic CSV tracks each cell independently even when cells share a row',()=>{
 const generic=openTemplate('first,second\nthird,fourth','generic.csv'),rules=lightningRules(generic);
 const state={doc:generic,originalDoc:generic,fields:[],drafts:new Map()};
 const result={changed:[{...units(generic)[1],after:'SECOND'}]};
 assert.equal(changesForRule(state,{result},rules[0]).length,0);
 assert.equal(changesForRule(state,{result},rules[1]).length,1);
 assert.equal(comparison(state,{result},rules[1]).after,'SECOND');
 assert.equal(inlineComparison(state,{result},rules[0]).after,'');
});
test('live diff editor keeps actual text separate from escaped paint and masks passwords',()=>{
 const value='ảnh "mới" <img src=x>\nzero: 0001';
 const html=valueEditor({value,before:'old',id:'f',attributes:'aria-label="Ảnh"'});
 assert.ok(html.includes('<textarea'));assert.ok(html.includes('&lt;img src=x&gt;'));
 assert.ok(!html.includes('<img src=x>'));assert.ok(!html.match(/<textarea[^>]*>[\s\S]*?<ins>/));
 assert.ok(editorHighlight('old','new').includes('<ins>new</ins>'));
 assert.ok(editorHighlight('TENTHISINH','TENTHISINHdsf').includes('TENTHISINH<ins>dsf</ins>'));
 const secret=valueEditor({value:'secret',before:'old secret',id:'p',sensitive:true});
 assert.ok(secret.includes('type="password"'));assert.ok(!secret.includes('value-mirror'));
});
test('ambiguous checkbox/radio Type stays combined unless selector explicitly identifies it',()=>{
 const base={type:'3',selector:'bank-choice'};
 assert.equal(rulePresentation(base).label,'Checkbox / Radio');
 assert.equal(rulePresentation({...base,selector:'//input[@type="radio"]'}).label,'Radio · Chọn một');
 assert.equal(rulePresentation({...base,selector:'[role=checkbox]'}).label,'Checkbox · Ô tích');
 assert.match(rulePresentation({type:'0'}).label,/Text/);
});
test('welcome has no auto-demo and the credit links chu0n to the requested account',()=>{
 assert.ok(welcome().includes('Thêm template của bạn'));assert.ok(!welcome().includes('data-action="demo"'));
 assert.ok(credit().includes('href="https://github.com/chu0n"'));assert.ok(credit().includes('built with'));
});
test('old saved Fieldwork configurations remain readable after rename',async()=>{
 const project=await saveProject(doc,[],false);assert.equal(project.app,'chu0ns-fieldwork');
 project.app='fieldwork';const loaded=await loadProject(project);assert.equal(loaded.doc.source,doc.source);
});
test('Raw toggle announces active state and a clear way back to editing',()=>{
 const state={doc,originalDoc:doc,fields:[],drafts:new Map(),query:'',ruleGroup:'data',history:[]},m={result:renderTemplate(doc,[])};
 const button=html=>html.match(/<button[^>]*data-action="toggle-raw"[^>]*>[\s\S]*?<\/button>/)[0];
 assert.match(button(workspace(state,m)),/aria-pressed="false"/);
 assert.match(button(workspace({...state,rawMode:true},m)),/aria-pressed="true"/);
 assert.match(button(workspace({...state,rawMode:true},m)),/Đóng Raw/);
 assert.ok(workspace({...state,rawMode:true},m).includes('id="raw-view"'));
});
test('obfuscated names never become missing-information headings or extra badges',()=>{
 const rule=lightningRules(doc)[0],updated=updateRuleMetadata(doc,rule.row,{name:'"-. .- -- . *"'}).doc;
 const state={doc:updated,originalDoc:updated,fields:[],drafts:new Map(),query:'',ruleGroup:'data',profileFilter:'c1',history:[]};
 const html=workspace(state,{result:renderTemplate(updated,[])});
 assert.ok(!html.includes('Chưa đặt tên'));assert.ok(!html.includes('Chưa có tên đích'));
 assert.ok(html.includes('class="name-target"'));assert.ok(html.includes('&quot;-. .- -- . *&quot;'));
 assert.equal((html.match(/data-profile-field="profile-site"/g)||[]).length,1);
 assert.equal((html.match(/data-profile-field="profile-hotkey"/g)||[]).length,1);
 assert.ok(!html.includes('Cấu hình profile</button>'));
 assert.ok(!html.includes('class="context-profile"'));
});
