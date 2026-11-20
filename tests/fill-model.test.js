import test from 'node:test';import assert from 'node:assert/strict';
import {openTemplate,renderTemplate,saveProject,loadProject} from '../src/core.js';import {discoverFields} from '../src/data-fields.js';import {parseRecords} from '../src/bulk-data.js';import {createWorkflow,syncWorkflow,commitWorkflowData,workflowRecord,checkWorkflow,changeWorkflowValue,travelWorkflow,canExportWorkflow} from '../src/fill-model.js';
const make=()=>{const doc=openTemplate('Name: {{field:full_name}}\nEmail: {{field:email}}\nID: {{field:id}}','x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow(),data=parseRecords('[{"field:full_name":"AN","field:email":"an@example.test","field:id":"0001"},{"field:full_name":"BINH","field:email":"bad","field:id":"0002"}]');syncWorkflow(flow,doc,fields);commitWorkflowData(flow,data,fields,'token');return{doc,fields,flow,data};};
test('per-record changes preserve source, other people and zero prefixes',()=>{const {doc,fields,flow,data}=make(),email=fields.find(f=>f.key==='field:email');checkWorkflow(doc,fields,flow);assert.equal(canExportWorkflow(flow),false);assert.equal(canExportWorkflow(flow,0),true);assert.equal(canExportWorkflow(flow,1),false);changeWorkflowValue(doc,fields,flow,1,email.id,'binh@example.test');checkWorkflow(doc,fields,flow);assert.equal(canExportWorkflow(flow),true);assert.ok(workflowRecord(doc,fields,flow,0).output.includes('an@example.test'));assert.ok(workflowRecord(doc,fields,flow,1).output.includes('0002'));assert.equal(data.rows[1][1],'bad');assert.ok(doc.source.includes('{{field:email}}'));assert.ok(fields.every(f=>f.value===''));});
test('per-person undo/redo restores missing override and invalidates checked output',()=>{const {doc,fields,flow}=make(),field=fields[0];changeWorkflowValue(doc,fields,flow,0,field.id,'NEW');assert.equal(workflowRecord(doc,fields,flow,0).fields[0].value,'NEW');assert.equal(travelWorkflow(flow,'undo'),true);assert.equal(workflowRecord(doc,fields,flow,0).fields[0].value,'AN');assert.equal(travelWorkflow(flow,'redo'),true);assert.equal(workflowRecord(doc,fields,flow,0).fields[0].value,'NEW');travelWorkflow(flow,'undo');changeWorkflowValue(doc,fields,flow,0,field.id,'BRANCH');assert.equal(travelWorkflow(flow,'redo'),false);});
test('schema/template changes require revalidation but ordinary configured values do not reset records',()=>{const {doc,fields,flow}=make();checkWorkflow(doc,fields,flow);syncWorkflow(flow,doc,fields.map(f=>({...f,value:'temporary'})));assert.equal(flow.checked,true);syncWorkflow(flow,doc,fields.map(f=>({...f,label:'Renamed '+f.label})));assert.equal(flow.checked,false);assert.equal(flow.data.rows.length,2);checkWorkflow(doc,fields,flow);syncWorkflow(flow,openTemplate(doc.source+'\nextra','x.txt'),fields);assert.equal(flow.checked,false);});
test('changed source cannot export until explicitly committed, replacement clears row edits',()=>{const {doc,fields,flow,data}=make();changeWorkflowValue(doc,fields,flow,0,fields[0].id,'NEW');flow.inputChanged=true;assert.throws(()=>checkWorkflow(doc,fields,flow),/Nguồn nhập/);assert.equal(canExportWorkflow(flow,0),false);commitWorkflowData(flow,data,fields,'replacement');assert.deepEqual(flow.overrides,{});assert.equal(flow.history.length,0);assert.equal(flow.inputChanged,false);assert.equal(flow.checked,false);});
test('two workflows retain independent navigation, inputs, selection and edit history',()=>{const a=make(),b=make();a.flow.stage='review';a.flow.selected=1;a.flow.source='draft';changeWorkflowValue(a.doc,a.fields,a.flow,0,a.fields[0].id,'CHANGED');assert.equal(b.flow.stage,'fields');assert.equal(b.flow.source,'');assert.equal(b.flow.selected,0);assert.equal(b.flow.history.length,0);assert.equal(workflowRecord(b.doc,b.fields,b.flow,0).fields[0].value,'AN');});
test('large per-record output and override collections are bounded',()=>{const {doc,fields,flow}=make();assert.throws(()=>changeWorkflowValue(doc,fields,flow,0,fields[0].id,'x'.repeat(2_000_000)),/2 MB/);flow.overrides[0]={[fields[0].id]:'x'.repeat(1_400_000)};assert.throws(()=>workflowRecord(doc,fields,flow,0),/8 MB/);});

test('the active workflow rejects aggregate output over 60 MB without approving export',()=>{
 const doc=openTemplate('{{field:content}}'.repeat(32),'x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();
 const data=parseRecords(JSON.stringify(Array.from({length:48},()=>({'field:content':'x'.repeat(40_000)}))));commitWorkflowData(flow,data,fields,'test');
 assert.throws(()=>checkWorkflow(doc,fields,flow),/60 MB/);assert.equal(canExportWorkflow(flow),false);
});

test('500 records with 32 fields keep independent outputs and zero-prefixed identifiers',()=>{
 const keys=Array.from({length:32},(_,i)=>'field:value_'+i),doc=openTemplate(keys.map(key=>'{{'+key+'}}').join('|'),'x.txt'),fields=discoverFields(doc).fields,flow=createWorkflow();
 const rows=Array.from({length:500},(_,i)=>keys.map((_,j)=>String(i).padStart(4,'0')+' Đặng '+j));commitWorkflowData(flow,{headers:keys,rows},fields,'test');
 const reviews=checkWorkflow(doc,fields,flow);assert.equal(reviews.length,500);assert.ok(reviews.every(r=>!r.problems.length));
 for(const i of [0,249,499])assert.equal(workflowRecord(doc,fields,flow,i).output,rows[i].join('|'));assert.ok(doc.source.includes('{{field:value_0}}'));
});
test('checking missing field mappings never silently exports original template data',()=>{const {doc,fields,flow}=make();flow.mapping[fields[0].id]='';checkWorkflow(doc,fields,flow);assert.ok(flow.reviews.every(r=>r.problems.some(p=>p.includes('ghép cột'))));assert.equal(canExportWorkflow(flow,0),false);});
import {combineDataFiles,formatText} from '../src/data-tools.js';
import {changeWorkflowValues} from '../src/fill-model.js';
test('multi-file import aligns exact column names and retains strings and file order',()=>{const files=[{name:'a.csv',text:'ID,Name\r\n0001,"An, A"'},{name:'b.json',text:'[{"Name":"Bình","ID":"0002"}]'}];assert.deepEqual(combineDataFiles(files),{headers:['ID','Name'],rows:[['0001','An, A'],['0002','Bình']]});assert.equal(files[0].text,'ID,Name\r\n0001,"An, A"');});
test('multi-file import rejects mismatched schema, oversized batches and malformed later files',()=>{assert.throws(()=>combineDataFiles([{name:'a.csv',text:'ID,Name\n0001,An'},{name:'wrong.json',text:'[{"Other":"x"}]'}]),/wrong.json/);assert.throws(()=>combineDataFiles([{name:'a.json',text:JSON.stringify(Array.from({length:300},()=>({ID:'001'})))},{name:'b.json',text:JSON.stringify(Array.from({length:201},()=>({ID:'002'})))}]),/500/);assert.throws(()=>combineDataFiles([{name:'big.txt',text:'x'.repeat(2_000_001)}]),/2 MB/);});
test('AI multi-file mode strictly validates every file and rejects duplicate JSON keys',()=>{const {fields}=make(),record=Object.fromEntries(fields.map(f=>[f.key,'0001']));const input=JSON.stringify([record]);assert.equal(combineDataFiles([{name:'a.json',text:input},{name:'b.json',text:input}],{ai:true,fields}).rows.length,2);assert.throws(()=>combineDataFiles([{name:'a.json',text:input},{name:'bad.json',text:'[{"field:full_name":"A","field:full_name":"B","field:email":"a@example.test","field:id":"01"}]'}],{ai:true,fields}),/key JSON bị lặp/);});
test('format tools preserve digits, punctuation and meaning unless explicitly changed',()=>{assert.equal(formatText('Đặng Minh 001','ascii-upper'),'DANG MINH 001');assert.equal(formatText('Đặng Minh 001','upper'),'ĐẶNG MINH 001');assert.equal(formatText('  A  B \n C  ','spaces'),'A B C');assert.equal(formatText('  A  B  ','trim'),'A  B');assert.equal(formatText('ĐẶNG 001','lower'),'đặng 001');assert.throws(()=>formatText('x','unknown'));});
test('column text edits are atomic, undoable together and leave source immutable',()=>{const {doc,fields,flow}=make(),original=structuredClone(flow.data),field=fields[0];changeWorkflowValues(doc,fields,flow,[{index:0,fieldId:field.id,value:'NGUYỄN AN'},{index:1,fieldId:field.id,value:'TRẦN BÌNH'}]);assert.equal(flow.history.length,1);checkWorkflow(doc,fields,flow);assert.equal(workflowRecord(doc,fields,flow,1).fields[0].value,'TRẦN BÌNH');travelWorkflow(flow,'undo');assert.equal(workflowRecord(doc,fields,flow,0).fields[0].value,'AN');assert.equal(workflowRecord(doc,fields,flow,1).fields[0].value,'BINH');travelWorkflow(flow,'redo');assert.equal(workflowRecord(doc,fields,flow,0).fields[0].value,'NGUYỄN AN');assert.deepEqual(flow.data,original);const before=structuredClone(flow.overrides);assert.throws(()=>changeWorkflowValues(doc,fields,flow,[{index:0,fieldId:field.id,value:'a'.repeat(2_000_001)}]),/2 MB/);assert.deepEqual(flow.overrides,before);});

test('undo restores the original value when a transaction edits a field twice',()=>{
 const doc=openTemplate('Name {{field:name}}','demo.txt'),fields=discoverFields(doc).fields;
 const flow=createWorkflow(),fieldId=fields[0].id;
 commitWorkflowData(flow,parseRecords('field:name\nOriginal'),fields,'source');
 changeWorkflowValues(doc,fields,flow,[{index:0,fieldId,value:'First'},{index:0,fieldId,value:'Final'}]);
 assert.equal(workflowRecord(doc,fields,flow,0).values[0],'Final');
 assert.equal(travelWorkflow(flow,'undo'),true);
 assert.equal(workflowRecord(doc,fields,flow,0).values[0],'Original');
 assert.equal(travelWorkflow(flow,'redo'),true);
 assert.equal(workflowRecord(doc,fields,flow,0).values[0],'Final');
});

test('batch file extensions resolve ambiguous content and reject mislabeled JSON',()=>{
 const table='[ID],Name\n0001,An';
 assert.deepEqual(combineDataFiles([{name:'records.CSV',text:table}]),{headers:['[ID]','Name'],rows:[['0001','An']]});
 assert.throws(()=>combineDataFiles([{name:'records.json',text:'ID,Name\n0001,An'}]),/records\.json: JSON/);
 assert.deepEqual(combineDataFiles([{name:'records.txt',text:'{"ID":"0001"}'}]).rows,[['0001']]);
});
