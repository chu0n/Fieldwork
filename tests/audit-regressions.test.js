import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parse} from 'acorn';
import {createHash} from 'node:crypto';
import Papa from 'papaparse';
import {openTemplate,units,makeBinding,renderTemplate} from '../src/core.js';
import {applyDirectEdit} from '../src/direct-edit.js';
import {jsConstants,lightningRules,profileDefinitions,TYPE_INFO,MODE_NAMES,updateRuleMetadata} from '../src/lightning.js';
import {updateProfile} from '../src/profile-tools.js';
import {compareDocuments} from '../src/document-model.js';
import {SessionStore} from '../src/session-store.js';
import {restoreTextareaValue,decodeTemplateFile} from '../src/file-text.js';
import {parseRecords} from '../src/bulk-data.js';
import {parseLLMOutput} from '../src/llm-schema.js';
import {discoverFields,resolveFields} from '../src/data-fields.js';
import {createWorkflow,commitWorkflowData,changeWorkflowValue,checkWorkflow,workflowRecord} from '../src/fill-model.js';
import {bindFillWorkspace} from '../src/fill-workspace.js';
import {searchText} from '../src/usability.js';

// Exercise private event handlers without adding production exports for tests.
function functionFrom(file,name,env){
 if(['bindAutoInput','bindFieldInput'].includes(name))env.assertNoDraft=functionFrom('main.js','assertNoDraft',env);
 const source=readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);
 vm.runInNewContext(source.slice(node.start,node.end)+';globalThis.result='+name,env);return env.result;
}
function editInputs(doc){
 const constants=jsConstants(doc.source),inputs=constants.length?constants.map(c=>({value:c.value,dataset:{literal:['text',c.start,c.end].join('|')},addEventListener(name,fn){this[name]=fn;}})):[{value:doc.source,dataset:{unitEdit:'text'},addEventListener(name,fn){this[name]=fn;}}];
 const state={doc,fields:[]},messages=[],env={state,units,makeBinding,restoreTextareaValue,applyDirectEdit,document:{querySelectorAll:()=>inputs},checkpoint(){},updateLivePreview(){},refreshValueEditor(){},toast:m=>messages.push(m)};
 const bind=functionFrom('main.js','bindAutoInput',env);inputs.forEach(el=>bind(el,constants.length>0));return{state,inputs,messages};
}
test('editing two sibling JS inputs updates the intended variables, including repeated edits',()=>{
 const {state,inputs}=editInputs(openTemplate("const EMAIL='a'; const TARGET_FILE_NAME='old.jpg';",'demo.js'));
 inputs[0].value='a'.repeat(80)+'@example.test';inputs[0].input();inputs[1].value='new.jpg';inputs[1].input();
 assert.equal(jsConstants(state.doc.source)[0].value,'a'.repeat(80)+'@example.test');assert.equal(jsConstants(state.doc.source)[1].value,'new.jpg');
 inputs[0].value="O'Neil@example.test";inputs[0].input();inputs[1].value='last.jpg';inputs[1].input();assert.deepEqual(jsConstants(state.doc.source).map(c=>c.value),["O'Neil@example.test",'last.jpg']);
});
test('JSON input commits valid documents and restores the saved value after rejected edits',()=>{
 const {state,inputs,messages}=editInputs(openTemplate('{"name":"AN"}','demo.json')),input=inputs[0];
 input.value='{"name":"BINH"}';input.input();assert.equal(state.doc.source,input.value);
 input.value='{"name":';input.input();assert.equal(input.value,'{"name":"BINH"}');assert.equal(renderTemplate(state.doc,[]).output,input.value);assert.equal(messages.length,1);
});
test('each Undo or Redo shortcut dispatches exactly one history action',()=>{
 const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),handlers=[],calls=[];
 const nodes=ast.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.object?.name==='document'&&n.expression.callee.property?.name==='addEventListener'&&n.expression.arguments[0]?.value==='keydown');
 vm.runInNewContext(nodes.map(n=>source.slice(n.start,n.end)).join('\n'),{document:{addEventListener:(type,fn)=>handlers.push(fn),querySelector:()=>({open:false})},isTextEditing:()=>false,undo:()=>calls.push('undo'),redo:()=>calls.push('redo')});
 for(const [key,shift,expected]of [['z',false,'undo'],['z',true,'redo'],['y',false,'redo']]){calls.length=0;handlers.forEach(fn=>fn({key,ctrlKey:true,shiftKey:shift,preventDefault(){}}));assert.deepEqual(calls,[expected]);}
});
test('editing a pending replacement source cannot commit the stale batch',async()=>{
 const doc=openTemplate('Name: {{field:name}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,{headers:['field:name'],rows:[['OLD']]},fields,JSON.stringify(['table','auto','old']));flow.stage='input';flow.source='[{"field:name":"A"}]';changeWorkflowValue(doc,fields,flow,0,fields[0].id,'MANUAL');
 const source={},primary={dataset:{}},controls=[{dataset:{flow:'import'}},{dataset:{flow:'confirm-replace'}}];const previous=globalThis.document;globalThis.document={querySelector:s=>s==='#wf-source'?source:s==='.wf-footer .primary'?primary:null,querySelectorAll:s=>s==='[data-flow]'?controls:[]};
 try{bindFillWorkspace({page:'fill',doc,fields,workflow:flow},{render(){}});await controls[0].onclick();assert.equal(flow.pending.data.rows[0][0],'A');source.oninput({target:{value:'[{"field:name":"B"}]'}});assert.equal(flow.pending,null);await controls[1].onclick();assert.equal(flow.data.rows[0][0],'OLD');assert.match(flow.error,/Nguồn đã thay đổi/);await controls[0].onclick();await controls[1].onclick();checkWorkflow(doc,fields,flow);assert.equal(workflowRecord(doc,fields,flow,0).output,'Name: B');}finally{globalThis.document=previous;}
});
test('ordinary and AI JSON imports both reject repeated keys, including escaped spelling',()=>{
 const fields=[{id:'id',key:'field:id',label:'ID'}];for(const source of ['[{"field:id":"001","field:id":"002"}]','[{"field:id":"001","field:\\u0069d":"002"}]']){assert.throws(()=>parseRecords(source,'json'),/key JSON bị lặp/);assert.throws(()=>parseLLMOutput(source,'json',fields),/key JSON bị lặp/);}
 assert.equal(parseRecords('[{"field:id":"001"},{"field:id":"002"}]','json').rows.length,2);
});
test('record search builds rule lookups once and never searches password columns',()=>{
 let calls=0;const indices=functionFrom('fill-workspace.js','indices',{searchText,lightningRules:()=>{calls++;return[{type:'1',unitId:'secret'},{type:'0',unitId:'name'}];}}),state={fields:[{id:'n',bindings:[{unitId:'name'}]},{id:'s',bindings:[{unitId:'secret'}]}]},flow={data:{headers:['Name','Secret'],rows:Array.from({length:500},()=>['AN','hidden-password'])},mapping:{n:'Name',s:'Secret'},overrides:{},query:'hidden-password'};
 assert.equal(indices(state,flow).length,0);assert.equal(calls,1);calls=0;flow.query='an';assert.equal(indices(state,flow).length,500);assert.equal(calls,1);
});
const lightningRows=[['### AUTOFILL PROFILES ###'],['Profile ID','Name','Site','Hotkey'],['c1','A','https://example.test/',''],['### AUTOFILL RULES ###'],['Rule ID','Type','Name','Value','Site','Mode','Profile'],['r1','0','NAME','AN','','0','c1']];
test('Lightning TXT detection accepts fully quoted or single-cell section headers',()=>{
 for(const quotes of [true,false]){const doc=openTemplate('\uFEFF'+Papa.unparse(lightningRows,{quotes,newline:'\r\n'}),'template.txt');assert.equal(doc.kind,'csv');assert.deepEqual(renderTemplate(doc,[]).problems,[]);}
 assert.equal(openTemplate('const NAME="### AUTOFILL RULES ###";','template.js').kind,'javascript');
});
test('duplicate profile IDs block export validation',()=>{
 const rows=[...lightningRows.slice(0,3),['c1','B','https://other.test/',''],...lightningRows.slice(3)],doc=openTemplate(Papa.unparse(rows),'template.csv');assert.ok(renderTemplate(doc,[]).problems.some(p=>p.includes('Profile ID trùng: c1')));
});
test('standalone packager includes source examples in a fresh release',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'fieldwork-package-test-'));t.after(async()=>{assert.ok(root.startsWith(join(tmpdir(),'fieldwork-package-test-')));await fs.rm(root,{recursive:true,force:true});});
 const put=async(path,text)=>{const full=join(root,path);await fs.mkdir(join(full,'..'),{recursive:true});await fs.writeFile(full,text);};
 await fs.mkdir(join(root,'tools'));await fs.copyFile(new URL('../tools/package-static.mjs',import.meta.url),join(root,'tools/package-static.mjs'));
 await put('dist/index.html','<html><head><link href="./assets/main.css" rel="stylesheet"><script src="./assets/main.js"></script></head><body></body></html>');await put('dist/assets/main.css','body{margin:0}');await put('dist/assets/main.js','console.log("fixture")');
 for(const name of ['serve-iphone.mjs','OPEN-ON-IPHONE.cmd','build-qa.mjs','build-bulk-example.mjs'])await put('tools/'+name,'');
 for(const name of ['QUICKSTART.md','BULK-FILL.md','LLM.md','SESSION-RESTORE.md','IPHONE.md','MAINTENANCE.md'])await put('docs/'+name,'fixture');
 for(const name of ['papaparse','acorn','lucide','diff','@noble/hashes','fflate'])await put('node_modules/'+name+'/LICENSE','fixture');
 await put('assets/guides/manifest.json','{}');const example=await fs.readFile(new URL('../examples/partial-fields.fieldwork.json',import.meta.url));await put('examples/partial-fields.fieldwork.json',example);
 execFileSync(process.execPath,[join(root,'tools/package-static.mjs')],{cwd:root});assert.deepEqual(await fs.readFile(join(root,'release/examples/partial-fields.fieldwork.json')),example);
 for(const name of ['MAINTENANCE.md','SESSION-RESTORE.md'])assert.equal(await fs.readFile(join(root,'release',name),'utf8'),'fixture');
 const html=await fs.readFile(join(root,'release/index.html'),'utf8');assert.match(html,/console.log/);const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1],hash=createHash('sha256').update(script).digest('base64');assert.ok(html.includes("script-src 'sha256-"+hash+"'"));assert.ok(html.includes("connect-src 'none'"));assert.ok(!html.includes("script-src 'unsafe-inline'"));
});
import {normalizeCell} from '../src/bulk-data.js';
import {saveProject,loadProject} from '../src/core.js';
import {canExportWorkflow,syncWorkflow} from '../src/fill-model.js';

test('bulk keeps exact whitespace unless an explicit transform requests a change',()=>{
 const doc=openTemplate('{{field:note}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();
 commitWorkflowData(flow,parseRecords('[{"field:note":"  001\\n  line  "}]'),fields,'token');
 assert.equal(workflowRecord(doc,fields,flow,0).output,'  001\n  line  ');
 assert.equal(workflowRecord(doc,fields.map(f=>({...f,transform:'trim'})),flow,0).output,'001\n  line');
 assert.equal(normalizeCell('  value  ',{type:'text'}),'  value  ');assert.equal(normalizeCell(' 25/07/2000 ',{type:'date',transform:'trim'},'dmy'),'2000-07-25');
});
test('an emptied JS constant can be filled again and saved as an empty literal binding',async()=>{
 let doc=openTemplate("const EMAIL='old'; const NAME='keep';",'x.js'),range=jsConstants(doc.source)[0];
 let next=applyDirectEdit(doc,[],{unitId:'text',start:range.start,end:range.end,value:''});doc=next.doc;
 const binding=makeBinding(doc,'text',next.range.start,next.range.end),field={id:'email',key:'field:email',label:'Email',value:'new',type:'text',transform:'none',required:false,bindings:[binding]};
 assert.equal(renderTemplate(doc,[field]).output,"const EMAIL='new'; const NAME='keep';");
 assert.equal((await loadProject(await saveProject(doc,[field],true))).fields[0].bindings[0].expected,'');
 next=applyDirectEdit(doc,[],{unitId:'text',...next.range,value:'again'});assert.equal(jsConstants(next.doc.source)[0].value,'again');
 assert.throws(()=>makeBinding(openTemplate('abc','x.txt'),'text',1,1));
});
test('JSON templates reject duplicate input keys and duplicate keys created by edits',()=>{
 assert.throws(()=>openTemplate('{"a":"one","a":"two"}','x.json'),/key JSON bị lặp/);
 const doc=openTemplate('{"a":"one","b":"two"}','x.json'),binding=makeBinding(doc,'text',12,13);
 const result=renderTemplate(doc,[{id:'key',label:'Key',value:'a',type:'text',transform:'none',required:false,bindings:[binding]}]);
 assert.ok(result.problems.some(p=>p.includes('key JSON bị lặp')));
});
test('validation uses the value that will actually be exported',()=>{
 const doc=openTemplate('OLD','x.txt'),binding=makeBinding(doc,'text',0,3),field={id:'email',label:'Email',value:'  an@example.test  ',type:'email',transform:'trim',required:true,bindings:[binding]};
 const result=renderTemplate(doc,[field]);assert.deepEqual(result.problems,[]);assert.equal(result.output,'an@example.test');
});
test('a single record edit invalidates prior export permission even without the UI',()=>{
 const doc=openTemplate('{{field:email}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,parseRecords('[{"field:email":"a@example.test"}]'),fields,'token');checkWorkflow(doc,fields,flow);assert.equal(canExportWorkflow(flow),true);
 changeWorkflowValue(doc,fields,flow,0,fields[0].id,'bad');assert.equal(canExportWorkflow(flow),false);
});
test('saving freezes fields before the asynchronous fingerprint completes',async()=>{
 const doc=openTemplate('OLD','x.txt'),fields=[{id:'id',label:'First',key:'field:name',value:'A',type:'text',transform:'none',bindings:[makeBinding(doc,'text',0,3)],aliases:['original']}];
 const pending=saveProject(doc,fields,true);fields[0].value='B';fields[0].label='Second';fields[0].bindings[0].expected='bad';fields[0].aliases.push('changed');
 const saved=await pending;assert.equal(saved.fields[0].value,'A');assert.equal(saved.fields[0].label,'First');assert.equal(saved.fields[0].bindings[0].expected,'OLD');assert.deepEqual(saved.fields[0].aliases,['original']);await loadProject(saved);
});
test('non-finite JSON numeric data cannot silently become an Infinity string',()=>assert.throws(()=>parseRecords('[{"amount":1e400}]'),/số|hữu hạn/));
test('changing template format or BOM invalidates batch review',()=>{
 const doc=openTemplate('text','x.txt'),flow=createWorkflow();syncWorkflow(flow,doc,[]);flow.checked=true;syncWorkflow(flow,{...doc,bom:true},[]);assert.equal(flow.checked,false);
 flow.checked=true;syncWorkflow(flow,{...doc,bom:true,kind:'javascript'},[]);assert.equal(flow.checked,false);
});

test('late file reads cannot overwrite typed data, a newer file, or a different tab',async()=>{
 const previous=globalThis.document;
 try{for(const scenario of ['typed','newer','tab']){
  const doc=openTemplate('{{field:name}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow(),state={page:'fill',doc,fields,workflow:flow},fileInput={},source={};let resolveFirst;
  const first=new Promise(resolve=>{resolveFirst=resolve;});
  globalThis.document={querySelector:s=>s==='#wf-file'?fileInput:s==='#wf-source'?source:null,querySelectorAll:()=>[]};
  bindFillWorkspace(state,{render(){},readFile:file=>file.name==='first.json'?first:Promise.resolve('[{"field:name":"NEW FILE"}]')});
  const pending=fileInput.onchange({target:{files:[{name:'first.json',size:30}]}});
  if(scenario==='typed')source.oninput({target:{value:'USER TYPED'}});
  if(scenario==='newer')await fileInput.onchange({target:{files:[{name:'second.json',size:30}]}});
  if(scenario==='tab')state.workflow=createWorkflow();
  const savedSource=flow.source;resolveFirst('[{"field:name":"STALE"}]');await pending;assert.equal(flow.source,savedSource,scenario);assert.equal(flow.error,'');
 }}finally{globalThis.document=previous;}
});
test('rejected oversized record edits restore the displayed value and block stale export',()=>{
 const previous=globalThis.document,doc=openTemplate('{{field:name}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,{headers:['field:name'],rows:[['ORIGINAL']]},fields,'token');checkWorkflow(doc,fields,flow);
 const input={value:'ORIGINAL',dataset:{recordField:fields[0].id}},errors={},download={disabled:false};
 globalThis.document={querySelector:s=>s==='#wf-row-errors'?errors:null,querySelectorAll:s=>s==='[data-record-field]'?[input]:s==='[data-flow="download-person"]'?[download]:[]};
 try{bindFillWorkspace({page:'fill',doc,fields,workflow:flow},{render(){}});input.value='x'.repeat(2_000_001);input.oninput();assert.equal(input.value,'ORIGINAL');assert.equal(workflowRecord(doc,fields,flow,0).output,'ORIGINAL');assert.equal(canExportWorkflow(flow),false);assert.equal(download.disabled,true);}finally{globalThis.document=previous;}
});

test('library save keeps its original name, data and tab when the user switches tabs mid-save',async()=>{
 const firstDoc=openTemplate('FIRST','first.txt'),secondDoc=openTemplate('SECOND','second.txt'),state={doc:firstDoc,fields:[],pinnedRuleIds:[],empty:false,drafts:new Map(),templateId:null},sessions={activeId:'a',items:[{id:'a',snapshot:{}},{id:'b',snapshot:{}}]},button={},dialog={isConnected:true,close(){}},controls={'#confirm-save-template':button,'#modal':dialog,'#template-name':{value:'First saved'},'#template-defaults':{checked:false}};
 let release,saved;const pending=new Promise(r=>{release=r;});
 const env={state,sessions,templates:[],esc:x=>x,i:()=>'',modal(){},document:{querySelector:s=>controls[s]||null},resolveFields:x=>x,saveProject:async doc=>{await pending;return{source:doc.source};},library:{save:async(name,project)=>{saved={name,project};return{id:'saved-a'};}},refreshLibrary:async()=>{},render(){},toast(){},modalError:assert.fail,fieldListDialog:assert.fail};
 const open=functionFrom('main.js','saveTemplateDialog',env);open();const saving=button.onclick();sessions.activeId='b';state.doc=secondDoc;controls['#template-name']=null;dialog.isConnected=false;release();await saving;
 assert.equal(saved.name,'First saved');assert.equal(saved.project.source,'FIRST');assert.equal(sessions.items[0].snapshot.templateId,'saved-a');assert.equal(state.templateId,null);
});

import {sourceSelectionRange,fieldSelectionBinding} from '../src/selection-fields.js';

test('textarea selections target the exact original fragment after CRLF and leading newlines',()=>{
 const source='\nTitle\r\nNAME\r\nID: 0001',doc=openTemplate(source,'x.txt'),shown=source.replace(/\r\n?/g,'\n'),at=shown.indexOf('0001'),range=sourceSelectionRange(source,at,at+4),selected=fieldSelectionBinding(doc,[],{unitId:'text',...range});
 assert.equal(selected.value,'0001');const result=renderTemplate(doc,[{id:'id',label:'ID',value:'0002',type:'text',transform:'none',required:false,bindings:[selected.binding]}]);assert.equal(result.output,'\nTitle\r\nNAME\r\nID: 0002');
 assert.throws(()=>sourceSelectionRange(source,0,999));
});
test('multiline batch values use a textarea so editing cannot strip their line breaks',()=>{
 const doc=openTemplate('{{field:note}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,{headers:['field:note'],rows:[['\nFirst\nSecond']]},fields,'token');flow.stage='review';
 const html=fillWorkspace({doc,fields,workflow:flow});assert.match(html,/<textarea rows="3" data-record-field=/);assert.ok(html.includes('spellcheck="false">\n\nFirst\nSecond</textarea>'));
});

test('textarea round trips preserve leading and mixed line endings outside the actual edit',()=>{
 const source='\r\nFirst\r\nSecond\nThird\rLast';assert.equal(restoreTextareaValue(source,source.replace(/\r\n?/g,'\n')),source);
 assert.equal(restoreTextareaValue(source,'\nFirst\nChanged\nThird\nLast'),'\r\nFirst\r\nChanged\nThird\rLast');
 const {state,inputs}=editInputs(openTemplate(source,'x.txt'));inputs[0].value='\nFirst\nChanged\nThird\nLast';inputs[0].input();assert.equal(state.doc.source,'\r\nFirst\r\nChanged\nThird\rLast');
});

test('quoted JS and CSV replacements retain exact punctuation and Unicode across a fixed corpus',()=>{
 const alphabet=["'",'"','\\','\n','\r','\t','\0','\u2028','Đ','🙂',',','{{field:x}}'];
 for(const a of alphabet)for(const b of alphabet){const value=a+'001'+b;for(const quote of ["'",'"']){
  const code=`const NAME=${quote}OLD${quote}; const KEEP='unchanged';`,source=Papa.unparse([['### AUTOFILL PROFILES ###'],['c1','Fixture','',''],['### AUTOFILL RULES ###'],['r1','4','',code,'','0','c1']]),doc=openTemplate(source,'x.csv'),range=jsConstants(code)[0],binding=makeBinding(doc,'3:3',range.start,range.end),result=renderTemplate(doc,[{id:'f',label:'Name',value,type:'text',transform:'none',required:false,bindings:[binding]}]);
  assert.deepEqual(result.problems,[]);const output=openTemplate(result.output,'x.csv');assert.equal(jsConstants(output.rows[3][3])[0].value,value);assert.ok(output.rows[3][3].endsWith("const KEEP='unchanged';"));
 }}
});

test('malformed backup names and formats are rejected before reaching the UI',async()=>{
 const project=await saveProject(openTemplate('SOURCE','x.txt'),[]);
 await assert.rejects(loadProject({...project,name:{bad:true}}),/Tên file|định dạng/);
 await assert.rejects(loadProject({...project,format:'unsupported'}),/Tên file|định dạng/);
});


test('overlapping template imports recheck tab capacity before changing the active document',async()=>{
 const state={doc:openTemplate('ORIGINAL','original.txt'),fields:[],drafts:new Map()},sessions=new SessionStore();
 for(let i=0;i<18;i++)sessions.add({...state});let displayed=state.doc.name,release;const waiting=new Promise(resolve=>{release=resolve;}),messages=[];
 const env={state,sessions,entrySequence:0,openTemplate,decodeTemplateFile,fresh:doc=>({doc,fields:[],drafts:new Map()}),captureActive:()=>sessions.capture({...state}),render:()=>{displayed=state.doc.name;},toast:m=>messages.push(m)};
 env.openDocument=functionFrom('main.js','openDocument',env);const importFiles=functionFrom('main.js','importFiles',env);
 const pending=importFiles(['a.txt','b.txt'].map(name=>({name,size:7,arrayBuffer:async()=>{await waiting;return new TextEncoder().encode('PENDING').buffer;}})));
 env.openDocument(openTemplate('VISIBLE','visible.txt'));env.render();release();await pending;
 assert.equal(sessions.items.length,19);assert.equal(state.doc.name,'visible.txt');assert.equal(displayed,state.doc.name);assert.match(messages[0],/Không đủ tab trống/);
});

test('a template preparation failure cannot prevent rendering successfully opened files',async()=>{
 const state={doc:openTemplate('OLD','old.txt')},sessions=new SessionStore(),messages=[],modals=[];sessions.add({...state});let displayed=state.doc.name;
 const env={state,sessions,entrySequence:0,openTemplate,decodeTemplateFile,fresh:doc=>{if(doc.name==='bad.txt')throw new Error('Rejected setup');return{doc};},captureActive:()=>sessions.capture({...state}),render:()=>{displayed=state.doc.name;},toast:m=>messages.push(m),modal:(...args)=>modals.push(args),esc:x=>x,document:{querySelector:()=>({close(){}})}};
 env.openDocument=functionFrom('main.js','openDocument',env);const run=functionFrom('main.js','importFiles',env);
 await run(['good.txt','bad.txt'].map(name=>({name,size:4,arrayBuffer:async()=>new TextEncoder().encode('DATA').buffer})));
 assert.equal(displayed,'good.txt');assert.equal(state.doc.name,displayed);assert.equal(sessions.items.length,2);assert.match(modals[0][2],/bad.txt: Rejected setup/);
});

test('CSV and TSV preserve explicitly empty people and whitespace, including single-column AI contracts',()=>{
 for(const keys of [['field:name'],['field:name','field:id']])for(const format of ['csv','tsv']){
  const fields=keys.map((key,i)=>({id:String(i),key,label:key})),rows=[keys.map(()=> 'AN'),keys.map(()=> ''),keys.map(()=> '  '),keys.map(()=> 'BINH')];
  const source=Papa.unparse([keys,...rows],{quotes:true,delimiter:format==='tsv'?'\t':',',newline:'\r\n'});
  assert.deepEqual(parseRecords(source,format).rows,rows);assert.deepEqual(parseLLMOutput(source,format,fields).rows,rows);
 }
 assert.deepEqual(parseRecords('a,b\nA,B\n\n,\n"",""\nC,D').rows,[['A','B'],['',''],['',''],['C','D']]);
 const doc=openTemplate('{{field:name}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();
 commitWorkflowData(flow,parseRecords('field:name\n"AN"\n""\n"BINH"'),fields,'test');checkWorkflow(doc,fields,flow);
 assert.equal(flow.reviews.length,3);assert.match(flow.reviews[1].problems.join(' '),/chưa có giá trị/);
});

test('field keys keep exact identity across import, AI contracts and suggested mappings',()=>{
 const fields=resolveFields(['field:full_name','field:fullname','field:ID','field:id'].map((key,i)=>({id:String(i),key,label:'Name'}))),headers=fields.map(f=>f.key),rows=[['AN','BINH','001','002']];
 for(const format of ['json','csv','tsv']){
  const source=format==='json'?JSON.stringify([Object.fromEntries(headers.map((h,i)=>[h,rows[0][i]]))]):Papa.unparse([headers,...rows],{quotes:true,delimiter:format==='tsv'?'\t':','});
  const data=parseLLMOutput(source,format,fields);assert.deepEqual(data,{headers,rows});
  const flow=createWorkflow();commitWorkflowData(flow,data,fields,'test');assert.deepEqual(Object.values(flow.mapping),headers);
 }
 assert.throws(()=>parseRecords('ID,ID\n001,002'),/trùng/);
});

test('only JavaScript rules in the Lightning rules section receive code validation',()=>{
 const source='id,language,description,value\n1,javascript,hello world,a\n2,4,hello world,b';
 const generic=openTemplate(source,'data.csv');assert.deepEqual(renderTemplate(generic,[]).problems,[]);assert.ok(units(generic).every(u=>u.context==='text'));
 assert.equal(applyDirectEdit(generic,[],{unitId:'1:2',value:'other ordinary text'}).doc.rows[1][2],'other ordinary text');
 const doc=openTemplate(Papa.unparse([['### AUTOFILL PROFILES ###'],['c1','4','','Ctrl + .'],['### AUTOFILL RULES ###'],['custom-id','4','','const = broken','','0','c1'],['### AUTOFILL SETTINGS ###'],['setting','javascript','ordinary text']]),'x.txt');
 assert.ok(renderTemplate(doc,[]).problems.some(p=>p.includes('Unexpected token')));assert.equal(units(doc).filter(u=>u.context==='js').length,1);
});

function browserValue(value,multiline=false){let current='';const control={focus(){},get value(){return current;},set value(text){current=String(text).replace(/\r\n?/g,'\n');if(!multiline)current=current.replace(/\n/g,'');}};control.value=value;return control;}

test('rule metadata dialogs preserve untouched line endings, selectors, bindings and missing profile IDs',()=>{
 for(const edit of ['none','mode','name','site']){
  const rows=[['### AUTOFILL PROFILES ###'],['c1','Demo','',''],['### AUTOFILL RULES ###'],['r1','0','\r\nNAME\r\n# comment\nKEEP\rLAST','AN','\r\n# note\r\nexample.test\nKEEP','0','missing']];
  const doc=openTemplate(Papa.unparse(rows,{quotes:true,newline:'\r\n'}),'x.txt'),field={id:'f',label:'Name',value:'NEW',type:'text',transform:'none',bindings:[makeBinding(doc,'3:2',2,6)]},state={doc,fields:[field]};
  const controls=Object.fromEntries(['type','name','site','mode','profile'].map((key,i)=>['#rule-'+key,browserValue(doc.rows[3][[1,2,4,5,6][i]],['name','site'].includes(key))]));
  controls['#save-rule-settings']={};controls['#modal']={close(){}};let checkpoints=0,body='';
  const env={state,isLightning:()=>true,lightningRules,profileDefinitions,TYPE_INFO,MODE_NAMES,esc:x=>x,modal:(title,subtitle,html)=>{body=html;},document:{querySelector:s=>controls[s]},restoreTextareaValue,updateRuleMetadata,checkpoint:()=>checkpoints++,render(){},toast(){},modalError:assert.fail};
  functionFrom('main.js','ruleSettings',env)(3);assert.match(body,/<textarea id="rule-site"/);assert.match(body,/missing · không tồn tại/);assert.equal(controls['#rule-name'].value[0],'\n');
  if(edit==='mode')controls['#rule-mode'].value='1';if(edit==='name')controls['#rule-name'].value=controls['#rule-name'].value.replace('NAME','NEW');if(edit==='site')controls['#rule-site'].value=controls['#rule-site'].value.replace('example.test','new.test');
  controls['#save-rule-settings'].onclick();const changes=compareDocuments(doc,state.doc);
  assert.equal(checkpoints,edit==='none'?0:1);assert.deepEqual(changes.map(c=>c.col),edit==='none'?[]:[{mode:5,name:2,site:4}[edit]]);
  assert.equal(state.fields.length,edit==='name'?0:1);assert.equal(state.doc.rows[3][6],'missing');
  if(edit==='name')assert.equal(state.doc.rows[3][2],doc.rows[3][2].replace('NAME','NEW'));
  if(edit==='site')assert.equal(state.doc.rows[3][4],doc.rows[3][4].replace('example.test','new.test'));
 }
});

test('profile metadata saves only edited cells and preserves multiline Site bytes',()=>{
 for(const edit of ['none','name','site']){
  const doc=openTemplate(Papa.unparse([['### AUTOFILL PROFILES ###'],['c1','Demo\r\nName','\r\nexample.test\r\nKEEP\nEND','Ctrl + Q'],['### AUTOFILL RULES ###'],['r1','0','NAME','AN','','0','c1']],{quotes:true}),'x.txt'),state={doc,profileFilter:'c1'};
  const controls={'#edit-profile-id':browserValue('c1'),'#profile-name':browserValue(''),'#profile-site':browserValue('',true),'#profile-hotkey':browserValue(''),'#apply-profile':{},'#modal':{close(){}}};let body='',writes=0;
  const env={state,profileDefinitions,esc:x=>x,modal:(title,subtitle,html)=>{body=html;},document:{querySelector:s=>controls[s],getElementById:id=>controls['#'+id]},restoreTextareaValue,updateProfile,applyDocument:next=>{state.doc=next;writes++;},render(){},toast(){},modalError:assert.fail};
  functionFrom('main.js','profileDialog',env)();assert.match(body,/<textarea id="profile-site"/);
  if(edit==='name')controls['#profile-name'].value='Renamed';if(edit==='site')controls['#profile-site'].value=controls['#profile-site'].value.replace('example.test','new.test');controls['#apply-profile'].onclick();
  assert.equal(writes,edit==='none'?0:1);assert.deepEqual(compareDocuments(doc,state.doc).map(c=>c.col),edit==='none'?[]:[edit==='name'?1:2]);
  if(edit==='site')assert.equal(state.doc.rows[1][2],doc.rows[1][2].replace('example.test','new.test'));
 }
});

test('a single-line record can accept multiline edits without losing content or validation',()=>{
 const previous=globalThis.document,doc=openTemplate('{{field:note}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,{headers:['field:note'],rows:[['OLD']]},fields,'test');checkWorkflow(doc,fields,flow);flow.stage='review';const state={page:'fill',doc,fields,workflow:flow};
 assert.match(fillWorkspace(state),/<textarea rows="1" data-record-field=/);
 const input={value:'OLD',dataset:{recordField:fields[0].id}},download={disabled:false},controls={'#wf-row-errors':{},'#wf-diff-content':{},'#wf-person-list':{},'[data-flow="undo-row"]':{},'[data-flow="redo-row"]':{}};
 globalThis.document={querySelector:s=>controls[s]||null,querySelectorAll:s=>s==='[data-record-field]'?[input]:s==='[data-flow="download-person"]'?[download]:[]};
 try{bindFillWorkspace(state,{render(){}});input.value='First\nSecond';input.oninput();assert.equal(workflowRecord(doc,fields,flow,0).output,'First\nSecond');assert.equal(input.value,'First\nSecond');assert.equal(flow.checked,true);assert.equal(download.disabled,false);}finally{globalThis.document=previous;}
});


import {PROJECT_FILE_LIMIT,serializeProject} from '../src/core.js';
import {workflowFileLabel,changeWorkflowValues} from '../src/fill-model.js';
import {fillWorkspace} from '../src/fill-workspace.js';
import {buildPrompt,emptyOutput,outputSchema} from '../src/llm-schema.js';
import {dataSheet} from '../src/bulk-data.js';
import {unzipSync,strFromU8} from 'fflate';

test('quick script inputs cannot overwrite an unapplied draft, including linked values',()=>{
 const original='const TARGET_FILE_NAME="old.jpg";',doc=openTemplate(original,'x.js'),{state,inputs,messages}=editInputs(doc);
 state.drafts=new Map([['text',original+' // a new comment']]);inputs[0].value='new.jpg';inputs[0].input();
 assert.equal(state.doc.source,original);assert.equal(inputs[0].value,'old.jpg');assert.equal(state.drafts.get('text'),original+' // a new comment');assert.match(messages[0],/bản sửa/);
 state.drafts.clear();inputs[0].value='new.jpg';inputs[0].input();assert.ok(state.doc.source.includes('new.jpg'));
 const field={id:'name',value:'OLD',bindings:[{unitId:'other'},{unitId:'text'}]},linkedState={fields:[field],drafts:new Map([['other','draft']])},input={dataset:{field:'name'},value:'NEW',addEventListener(event,handler){this[event]=handler;}};
 const env={state:linkedState,restoreTextareaValue,checkpoint:assert.fail,refreshValueEditor(){},toast(){},updateLivePreview:assert.fail};functionFrom('main.js','bindFieldInput',env)(input);input.input();assert.equal(field.value,'OLD');assert.equal(input.value,'OLD');
});

test('ZIP filenames use reviewed overrides and transformations, matching their content',async()=>{
 const previous=globalThis.document,doc=openTemplate('Name={{field:name}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();fields[0].transform='upper';commitWorkflowData(flow,{headers:['field:name'],rows:[['OLD NAME']]},fields,'test');changeWorkflowValue(doc,fields,flow,0,fields[0].id,'New Name');flow.filename='field:name';flow.stage='export';
 const button={dataset:{flow:'download-all'}},downloads=[],state={page:'fill',doc,fields,workflow:flow};globalThis.document={querySelector:()=>null,querySelectorAll:selector=>selector==='[data-flow]'?[button]:[]};
 try{bindFillWorkspace(state,{render(){},download:(bytes,name)=>downloads.push({bytes,name})});await button.onclick();assert.equal(flow.error,'');assert.equal(downloads.length,1);const files=unzipSync(downloads[0].bytes);assert.deepEqual(Object.keys(files),['001-NEW NAME.txt']);assert.equal(strFromU8(files['001-NEW NAME.txt']),'Name=NEW NAME');const html=fillWorkspace(state);assert.match(html,/đã kiểm tra/);assert.match(html,/selected>name · đã kiểm tra/);}finally{globalThis.document=previous;}
});

test('filename selection disambiguates shared source columns and rejects deleted choices',()=>{
 const doc=openTemplate('{{field:a}} {{field:b}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,{headers:['Shared','External'],rows:[['same','0001']]},fields,'test');for(const field of fields)flow.mapping[field.id]='Shared';changeWorkflowValue(doc,fields,flow,0,fields[1].id,'different');const result=workflowRecord(doc,fields,flow,0);
 flow.filename='Shared';assert.throws(()=>workflowFileLabel(flow,result,0),/nhiều trường/);flow.filename=['field',fields[1].id];assert.equal(workflowFileLabel(flow,result,0),'different');flow.filename=['column','External'];assert.equal(workflowFileLabel(flow,result,0),'0001');flow.filename=['field','deleted'];assert.throws(()=>workflowFileLabel(flow,result,0),/bị xoá/);flow.filename=['column','missing'];assert.throws(()=>workflowFileLabel(flow,result,0),/không còn/);
});

test('ordinary JSON rejects lossy number tokens before converting them into strings',()=>{
 for(const number of ['9007199254740991.1','1e-400','-1e-400','1.234567890123456789','0.10000000000000001','1e400'])assert.throws(()=>parseRecords('[{"id":'+number+'}]'),/chính xác/);
 for(const [token,expected]of [['0','0'],['false','false'],['0.1','0.1'],['1.2300','1.23'],['-1.25e2','-125'],['1e-7','1e-7'],['9007199254740991','9007199254740991'],['0e999999999999999999999','0']])assert.equal(parseRecords('[{"id":'+token+'}]').rows[0][0],expected);
 assert.equal(parseRecords('[{"id":"9007199254740991.1"}]').rows[0][0],'9007199254740991.1');assert.equal(openTemplate('{"value":1e-400}','x.json').source,'{"value":1e-400}');
});

test('backup serialization cannot produce a file larger than its shared import limit',async()=>{
 const doc=openTemplate('"'.repeat(5_999_000),'within-limit.txt'),project=await saveProject(doc,[]),text=serializeProject(project);assert.ok(new TextEncoder().encode(text).length<=PROJECT_FILE_LIMIT);assert.equal((await loadProject(JSON.parse(text))).doc.source,doc.source);
 const oversized=openTemplate('"'.repeat(6_000_000),'within-limit.txt');await assert.rejects(saveProject(oversized,[]),/12 MB/);assert.equal(oversized.source.length,6_000_000);assert.throws(()=>serializeProject({...project,source:oversized.source}),/12 MB/);
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.match(main,/f.size>PROJECT_FILE_LIMIT/);assert.ok(main.includes('serializeProject(item.project)'));
});

test('oversized edits fail atomically before changing overrides, undo or reviewed state',()=>{
 const doc=openTemplate('{{field:content}}'.repeat(4),'x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,{headers:['field:content'],rows:[['OLD'],['SECOND']]},fields,'test');checkWorkflow(doc,fields,flow);const before=JSON.stringify(flow);
 assert.throws(()=>changeWorkflowValue(doc,fields,flow,0,fields[0].id,'X'.repeat(400_000)),/8 MB/);assert.equal(JSON.stringify(flow),before);
 assert.throws(()=>changeWorkflowValues(doc,fields,flow,[{index:0,fieldId:fields[0].id,value:'VALID'},{index:1,fieldId:fields[0].id,value:'X'.repeat(400_000)}]),/8 MB/);assert.equal(JSON.stringify(flow),before);
 changeWorkflowValue(doc,fields,flow,0,fields[0].id,'VALID');assert.equal(workflowRecord(doc,fields,flow,0).output,'VALID'.repeat(4));
});

test('rejected oversized UI input restores the previous value and leaves repair controls usable',()=>{
 const previous=globalThis.document,doc=openTemplate('{{field:content}}'.repeat(4),'x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();commitWorkflowData(flow,{headers:['field:content'],rows:[['OLD']]},fields,'test');checkWorkflow(doc,fields,flow);flow.stage='review';const state={page:'fill',doc,fields,workflow:flow},input={value:'OLD',dataset:{recordField:fields[0].id}},controls={'#wf-row-errors':{}};
 globalThis.document={querySelector:s=>controls[s]||null,querySelectorAll:s=>s==='[data-record-field]'?[input]:[]};
 try{bindFillWorkspace(state,{render(){}});input.value='X'.repeat(400_000);input.oninput();assert.equal(input.value,'OLD');assert.deepEqual(flow.overrides,{});assert.equal(flow.history.length,0);assert.match(fillWorkspace(state),/data-record-field=/);assert.match(controls['#wf-row-errors'].innerHTML,/8 MB/);
 flow.overrides[0]={[fields[0].id]:'X'.repeat(400_000)};const errorUI=fillWorkspace(state);assert.match(errorUI,/data-flow="undo-row"/);assert.match(errorUI,/data-flow="go-input"/);}finally{globalThis.document=previous;}
});

test('explicit JavaScript and JSON formats take priority over Lightning header-like data',()=>{
 for(const name of ['x.js','x.mjs','x.cjs']){const source='const HELP = `\n### AUTOFILL RULES ###\n`;';const doc=openTemplate(source,name);assert.equal(doc.kind,'javascript');assert.deepEqual(renderTemplate(doc,[]).problems,[]);assert.equal(renderTemplate(doc,[]).output,source);}
 const source='["### AUTOFILL RULES ###"]';assert.equal(openTemplate(source,'x.json').kind,'json');assert.equal(openTemplate('### AUTOFILL RULES ###\nr1,0,Name,VALUE,,,c1','x.txt').kind,'csv');
});

test('AI, batch and sample contracts share the 150-field limit without rejecting saved templates',async()=>{
 const doc=openTemplate(Array.from({length:151},(_,i)=>'{{field:f'+i+'}}').join('|'),'x.txt'),fields=discoverFields(doc).fields;
 for(const generate of [buildPrompt,emptyOutput,outputSchema,dataSheet])assert.throws(()=>generate(fields,'json'),/150/);
 for(const format of ['json','csv','tsv']){const subset=fields.slice(0,150);assert.equal(parseLLMOutput(emptyOutput(subset,format),format,subset).headers.length,150);assert.throws(()=>parseLLMOutput('[]',format,fields),/150/);}
 const flow=createWorkflow();flow.checked=true;assert.throws(()=>checkWorkflow(doc,fields,flow),/150/);assert.equal(flow.checked,false);
 assert.equal((await loadProject(await saveProject(doc,fields))).fields.length,151);
 const state={doc,fields,workflow:createWorkflow()};state.workflow.stage='input';state.workflow.mode='ai';const html=fillWorkspace(state);assert.match(html,/tối đa 150 trường/);assert.match(html,/data-flow="copy-prompt" disabled/);assert.match(html,/data-flow="prompt-kit" disabled/);
});
