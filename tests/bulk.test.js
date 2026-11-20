import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {openTemplate,renderTemplate,makeBinding,saveProject,loadProject,parseJS} from '../src/core.js';
import {discoverFields,resolveFields,standardizeTemplate} from '../src/data-fields.js';
import {parseRecords,suggestMapping,safeFileName} from '../src/bulk-data.js';
import {createWorkflow,commitWorkflowData,workflowRecord,checkWorkflow} from '../src/fill-model.js';
import {filterRules} from '../src/rule-filter.js';
import {lightningRules} from '../src/lightning.js';
const source=Papa.unparse([
 ['### AUTOFILL PROFILES ###'],['Profile ID','Name','Site','Hotkey'],['c1','Test','',''],['c2','Keep profile','',''],
 ['### AUTOFILL RULES ###'],['Rule ID','Type','Name','Value','Site','Mode','Profile'],
 ['r1','0','Name','{{hsk:full_name}}','','1','c1'],['r2','0','Email','{{hsk:email}}','','1','c1'],
 ['r3','4','','const EMAIL = "{{hsk:email}}"; const TARGET_FILE_NAME = \'{{hsk:file_name}}\';','','0','c1'],
 ['r4','0','Identity','{{hsk:id_number}}','','0','c1'],['r5','0','DOB','{{hsk:birth_date}}','','0','c1'],
 ['r6','0','Static','KEEP "QUOTES"','','0','c2'],['### AUTOFILL SETTINGS ###'],['activecat','c1'],['untouched','"KEEP" \'quotes\'']
],{newline:'\r\n'});
test('placeholder discovery binds repeated keys across text and JS without executing code',()=>{
 const d=openTemplate(source,'rules.csv'),result=discoverFields(d);
 assert.equal(result.fields.length,5);assert.deepEqual(result.issues,[]);
 assert.equal(result.fields.find(f=>f.key==='hsk:email').bindings.length,2);
 assert.ok(result.fields.every(f=>f.value===''&&f.required));
 assert.equal(result.fields.find(f=>f.key==='hsk:birth_date').type,'date');
 assert.ok(renderTemplate(d,result.fields).problems.length);
 assert.equal(d.source,source);
});
test('normalization preserves zero prefixes, quotes, Unicode and trailing empty TSV fields',()=>{
 const data=parseRecords('Họ tên\tCCCD\tEmail\nNguyễn An\t000001234567\t', 'tsv');
 assert.deepEqual(data.rows,[['Nguyễn An','000001234567','']]);
 const csv=parseRecords('Name,Note\r\nA,"one, \'two\' and ""three"""');
 assert.equal(csv.rows[0][1],'one, \'two\' and "three"');
 assert.deepEqual(parseRecords('[{"CCCD":"0001","Number":0},{"CCCD":"0002","Number":false}]').rows,[['0001','0'],['0002','false']]);
});
test('labeled blocks support people separated by blank lines and reject unmatched or duplicate lines',()=>{
 const data=parseRecords('Họ tên: AN\nEmail: a@example.test\n\nEmail: b@example.test\nHọ tên: BINH','labels');
 assert.deepEqual(data.rows,[['AN','a@example.test'],['BINH','b@example.test']]);
 assert.throws(()=>parseRecords('free text','labels'));
 assert.throws(()=>parseRecords('Name: A\nName: B','labels'));
});
test('ambiguous headers are not guessed, duplicate headers and huge JSON IDs are rejected',()=>{
 const field={id:'f',label:'Email',key:'hsk:email'},data={headers:['Email','Gmail']};
 assert.equal(suggestMapping([field],data.headers).f,'');
 assert.equal(suggestMapping([field],['hsk:email','Email']).f,'hsk:email');
 assert.throws(()=>parseRecords('Name,Name\nA,B'));
 assert.equal(suggestMapping([{id:'f',label:'Name',key:'field:name'}],['Name','name']).f,'');
 assert.throws(()=>parseRecords('A,B\n1,2,3'));
 assert.throws(()=>parseRecords('[{"id":99999999999999999}]'));
 assert.throws(()=>parseRecords('[{"nested":{"x":1}}]'));
});
test('bulk records use independent bindings; explicit DMY dates, JS quotes and all profiles survive',()=>{
 const d=openTemplate(source,'rules.csv'),fields=discoverFields(d).fields;
 const data=parseRecords('Họ tên,Email,Tên ảnh,CCCD,Ngày sinh\r\nNGUYEN AN,a@example.test,"ảnh \'a\' .jpg",000001234567,25/07/2000\r\nTRAN BINH,b@example.test,binh.jpg,000000000002,29/02/2004');
 const flow=createWorkflow();commitWorkflowData(flow,data,fields,'test');flow.dateFormat='dmy';const reviews=checkWorkflow(d,fields,flow);
 assert.ok(reviews.every(r=>r.problems.length===0));
 const a=workflowRecord(d,fields,flow,0),b=workflowRecord(d,fields,flow,1);
 const rulesA=lightningRules(openTemplate(a.output,'a.csv')),rulesB=lightningRules(openTemplate(b.output,'b.csv'));
 assert.equal(rulesA[0].value,'NGUYEN AN');assert.equal(rulesB[0].value,'TRAN BINH');
 assert.ok(rulesA[2].value.includes('a@example.test'));parseJS(rulesA[2].value);
 assert.equal(rulesA[3].value,'000001234567');assert.equal(rulesA[4].value,'2000-07-25');
 assert.ok(a.output.endsWith(d.source.slice(d.source.indexOf('r6,'))));
 assert.equal(fields[0].value,'');assert.equal(d.source,source);
 const files=unzipSync(zipSync({'001.csv':strToU8(a.output),'002.csv':strToU8(b.output)}));
 assert.equal(strFromU8(files['001.csv']),a.output);assert.equal(strFromU8(files['002.csv']),b.output);
});
test('missing mappings, bad emails, invalid dates and missing required data block batch validity',()=>{
 const d=openTemplate(source,'rules.csv'),fields=discoverFields(d).fields;
 const data=parseRecords('hsk:full_name,hsk:email,hsk:file_name,hsk:id_number,hsk:birth_date\nA,invalid,a.jpg,0001,31/02/2000\n,b@example.test,b.jpg,0002,2000-01-01');
 const flow=createWorkflow();commitWorkflowData(flow,data,fields,'test');flow.dateFormat='dmy';const reviews=checkWorkflow(d,fields,flow);
 assert.ok(reviews[0].problems.some(p=>p.includes('email')));assert.ok(reviews[0].problems.some(p=>p.includes('ngày')));
 assert.ok(reviews[1].problems.some(p=>p.includes('chưa có')));
 flow.mapping={};const missing=workflowRecord(d,fields,flow,0);assert.ok(missing.problems.some(p=>p.includes('Chưa ghép')));
});
test('standardizing a populated template touches only bound positions and rediscovers metadata',()=>{
 const d=openTemplate('Name=OLD; Email=old@example.test\nKeep "quotes"','template.txt');
 const fields=[{id:'f',key:'hsk:full_name',label:'Họ tên',value:'NEW',type:'text',transform:'ascii-upper',required:true,bindings:[makeBinding(d,'text',5,8)]}];
 const standardized=standardizeTemplate(d,fields);
 assert.equal(standardized.doc.source,'Name={{hsk:full_name}}; Email=old@example.test\nKeep "quotes"');
 assert.equal(standardized.fields[0].key,'hsk:full_name');assert.equal(standardized.fields[0].transform,'ascii-upper');
 assert.equal(d.source,'Name=OLD; Email=old@example.test\nKeep "quotes"');
});
test('generic namespace works inside JSON; comment markers in JS are not unsafely bound',()=>{
 const d=openTemplate('{"name":"{{staff:name}}"}','data.json'),fields=discoverFields(d).fields;
 const result=renderTemplate(d,fields.map(f=>({...f,value:'a"b'})));
 assert.deepEqual(result.problems,[]);assert.equal(JSON.parse(result.output).name,'a"b');
 const js=discoverFields(openTemplate('// {{hsk:email}}\nconst x="ok";','script.js'));
 assert.equal(js.fields.length,0);assert.equal(js.issues.length,1);
});
test('field keys and pins survive backup/new entries; older fields get distinct suggested keys',async()=>{
 const d=openTemplate(source,'rules.csv'),fields=discoverFields(d).fields;
 const loaded=await loadProject(await saveProject(d,fields,false,{pinnedRuleIds:['r1','r3']}));
 assert.deepEqual(loaded.options.pinnedRuleIds,['r1','r3']);assert.equal(loaded.fields[0].key,fields[0].key);
 assert.deepEqual(filterRules(lightningRules(d),{ruleGroup:'pinned',pinnedRuleIds:['r3']},r=>r.value,()=>false).map(r=>r.id),['r3']);
 assert.deepEqual(resolveFields([{label:'Email'},{label:'Email'}]).map(f=>f.key),['field:email','field:email_2']);
 assert.throws(()=>resolveFields([{label:'A',key:'hsk:email'},{label:'B',key:'hsk:email'}]));
 assert.equal(safeFileName('../bad/name:*'), '.._bad_name__');
});
test('oversized repeated replacements are rejected before building huge output strings',()=>{
 const doc=openTemplate('{{field:content}}'.repeat(20),'text.txt'),fields=discoverFields(doc).fields;
 const data={headers:['Content'],rows:[['x'.repeat(600_000)]]},mapping={[fields[0].id]:'Content'};
 const flow=createWorkflow();commitWorkflowData(flow,data,fields,'test');flow.mapping=mapping;
 assert.throws(()=>checkWorkflow(doc,fields,flow),/8 MB/);
 assert.throws(()=>workflowRecord(doc,fields,flow,0),/8 MB/);
});

test('bulk import enforces the row and column limits for every format',()=>{
 const cells=Array.from({length:151},(_,i)=>'field'+i);
 assert.throws(()=>parseRecords(JSON.stringify(cells.map(key=>({[key]:'value'})))),/150/);
 assert.throws(()=>parseRecords(cells.join(',')+'\n'+cells.join(',')),/150/);
 assert.throws(()=>parseRecords('Name\n'+'value\n'.repeat(501)),/500/);
 assert.throws(()=>parseRecords('Key: value\n\n'.repeat(501),'labels'),/500/);
 assert.equal(parseRecords('Name\n'+'value\n'.repeat(500)).rows.length,500);
});
test('labeled records preserve values across old Mac and Windows line endings',()=>{
 const expected={headers:['Name','ID'],rows:[['An','001'],['Bình','002']]};
 for(const eol of ['\r','\r\n','\n']){
  const source=['Name: An','ID: 001','','Name: Bình','ID: 002',''].join(eol);
  assert.deepEqual(parseRecords(source,'labels'),expected);
 }
});

test('bulk JSON rejects unpaired surrogates before UTF-8 export and keeps valid Unicode',()=>{
 assert.throws(()=>parseRecords('{"Note":"\\ud800"}'),/Unicode/);
 assert.throws(()=>parseRecords('{"\\udc00":"value"}'),/Unicode/);
 assert.deepEqual(parseRecords('{"Note":"\\ud83d\\ude00"}').rows,[['😀']]);
});
