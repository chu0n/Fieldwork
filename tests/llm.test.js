import test from 'node:test';
import assert from 'node:assert/strict';
import {fieldSpecification,outputSchema,buildPrompt,serializeRecords,parseLLMOutput,emptyOutput} from '../src/llm-schema.js';
import {openTemplate,renderTemplate,saveProject,loadProject} from '../src/core.js';
import {suggestMapping} from '../src/bulk-data.js';
import {createWorkflow,commitWorkflowData,workflowRecord,checkWorkflow} from '../src/fill-model.js';
const fields=[{id:'a',key:'custom:id',label:'Mã khách',type:'text',required:true,transform:'none',value:'PRIVATE_CURRENT_VALUE',bindings:[],aliases:['Mã cũ'],description:'Số định danh',instructions:'Giữ số 0',example:'0000123',allowedValues:[]},{id:'b',key:'custom:bank',label:'Ngân hàng',type:'text',required:false,transform:'upper',value:'SECRET_BANK',bindings:[],allowedValues:['ABC','XYZ']}];
const data={headers:fields.map(f=>f.key),rows:[['00001234567890123456','ABC'],['Một, "hai"\n三','XYZ']]};
test('prompt exports only schema metadata, exact keys and format contract, never current values or bindings',()=>{
 for(const format of ['json','csv','tsv']){const prompt=buildPrompt(fields,format);assert.ok(prompt.includes('custom:id'));assert.ok(prompt.includes(format.toUpperCase()));assert.ok(prompt.includes('Giữ số 0'));assert.ok(prompt.includes('Mã cũ'));assert.ok(!prompt.includes('PRIVATE_CURRENT_VALUE'));assert.ok(!prompt.includes('SECRET_BANK'));assert.ok(!prompt.includes('bindings'));}
 assert.equal(fieldSpecification(fields)[0].example,'0000123');assert.throws(()=>buildPrompt([]));assert.throws(()=>buildPrompt(fields,'xml'));
});
test('JSON/CSV/TSV serialize and parse quotes, Unicode, multiline and zero-prefixed IDs without coercion',()=>{
 for(const format of ['json','csv','tsv'])assert.deepEqual(parseLLMOutput(serializeRecords(data,format),format,fields),data);
 const reversed=[fields[1],fields[0]],result=parseLLMOutput(serializeRecords(data),'json',reversed);assert.deepEqual(result.headers,['custom:bank','custom:id']);assert.equal(result.rows[0][1],data.rows[0][0]);assert.ok(emptyOutput(fields,'csv').startsWith('"custom:id","custom:bank"'));
});
test('LLM output rejects numeric IDs, nulls, missing/extra keys, wrappers, prose and Markdown',()=>{
 for(const source of ['[{"custom:id":123,"custom:bank":"ABC"}]','[{"custom:id":null,"custom:bank":"ABC"}]','[{"custom:id":"0001"}]','[{"custom:id":"1","custom:bank":"ABC","extra":"x"}]','{"records":[]}','[]','```json\n[]\n```','Here you go: []'])assert.throws(()=>parseLLMOutput(source,'json',fields));
 assert.throws(()=>parseLLMOutput('"custom:bank","custom:id"\n"ABC","0001"','csv',fields));
 assert.throws(()=>parseLLMOutput('custom:id;custom:bank\n0001;ABC','csv',fields));
 assert.throws(()=>parseLLMOutput('custom:id,custom:bank\n0001,ABC','tsv',fields));
});
test('single-column contracts work for all output formats',()=>{
 const one={headers:['custom:id'],rows:[['0001']]};for(const format of ['json','csv','tsv'])assert.deepEqual(parseLLMOutput(serializeRecords(one,format),format,[fields[0]]),one);
});
test('schema disallows extra keys and keeps every value a string, optional enums permit missing data',()=>{
 const schema=outputSchema(fields);assert.equal(schema.items.additionalProperties,false);assert.deepEqual(schema.items.required,data.headers);assert.equal(schema.items.properties['custom:id'].type,'string');assert.deepEqual(schema.items.properties['custom:bank'].enum,['','ABC','XYZ']);
});
test('custom aliases map inputs and enum validation checks transformed values even without template bindings',()=>{
 assert.equal(suggestMapping(fields,['Mã cũ','Ngân hàng']).a,'Mã cũ');const doc=openTemplate('untouched','test.txt');
 assert.deepEqual(renderTemplate(doc,[{...fields[1],value:'abc'}]).problems,[]);
 assert.ok(renderTemplate(doc,[{...fields[1],value:'Other'}]).problems.length);
 const flow=createWorkflow();commitWorkflowData(flow,{headers:data.headers,rows:[['0001','abc'],['','BAD']]},fields,'test');const reviews=checkWorkflow(doc,fields,flow);assert.equal(reviews[0].problems.length,0);assert.ok(reviews[1].problems.length>=2);assert.equal(workflowRecord(doc,fields,flow,0).values[1],'ABC');
});
test('custom definitions and their order survive saved configurations, with metadata bounds enforced',async()=>{
 const doc=openTemplate('ORIGINAL_SOURCE','test.txt'),saved=await saveProject(doc,[fields[1],fields[0]]),loaded=await loadProject(saved);
 assert.deepEqual(loaded.fields.map(f=>f.key),['custom:bank','custom:id']);assert.deepEqual(loaded.fields[1].aliases,['Mã cũ']);assert.equal(loaded.fields[1].instructions,'Giữ số 0');assert.equal(loaded.fields[1].value,'');assert.equal(loaded.doc.source,'ORIGINAL_SOURCE');
 await assert.rejects(()=>loadProject({...saved,fields:[{...saved.fields[0],aliases:[1]}]}));
 await assert.rejects(()=>loadProject({...saved,fields:[{...saved.fields[0],instructions:'x'.repeat(4001)}]}));
 const old={...saved,fields:saved.fields.map(({instructions,description,aliases,allowedValues,example,...f})=>f)};assert.deepEqual((await loadProject(old)).fields[0].allowedValues,[]);
});
test('prompt resolves roles and conflicting source values without fabricating or mixing turns',()=>{const prompt=buildPrompt(fields);assert.match(prompt,/người đăng ký hộ/);assert.match(prompt,/mâu thuẫn/);assert.match(prompt,/không lặp lại dữ liệu từ lượt trước/);assert.match(prompt,/không suy ra từ họ tên hay tự tạo tên tệp/);assert.match(prompt,/transform=none/);});

import {readJSON,prepareJSONList,formatJSONPreview} from '../src/json-input.js';
test('JSON syntax failures explain extra content and punctuation in Vietnamese',()=>{assert.throws(()=>readJSON('[{"x":"1"}]\n[{"x":"2"}]'),/JSON có nội dung thừa/);assert.throws(()=>readJSON('[{"x":}]'),/JSON chưa đúng cú pháp/);});
test('explicit JSON repair combines complete blocks without changing values or dropping people',()=>{const one={id:'0001',text:'a } [ " 三'},two={id:'0002',text:'Hai'};const input=JSON.stringify(one)+'\n'+JSON.stringify([two]);const result=prepareJSONList(input);assert.equal(result.count,2);assert.deepEqual(readJSON(result.source),[one,two]);});

test('JSON repair refuses prose, incomplete blocks, primitive values and preserves duplicate keys for rejection',()=>{for(const source of ['```json\n[]\n```','[{"x":"1"}] explanation','{"x":"1"','[1,2]','[]'])assert.throws(()=>prepareJSONList(source));const result=prepareJSONList('{"custom:id":"001","custom:id":"002","custom:bank":"ABC"}');assert.match(result.source,/"001","custom:id":"002"/);assert.throws(()=>parseLLMOutput(result.source,'json',fields),/key JSON bị lặp/);});

test('JSON import accepts one object or an array with any whitespace',()=>{
 const record={'custom:id':'0007','custom:bank':'ABC'};
 for(const input of [record,[record]]){
  for(const indent of [0,2])assert.deepEqual(parseLLMOutput(JSON.stringify(input,null,indent),'json',fields),{headers:data.headers,rows:[['0007','ABC']]});
 }
});
test('formatted JSON preview changes only whitespace outside tokens',()=>{
 const compact=String.raw`{"x":"a  b\u0020[{}],\\","n":90071992547409931111,"a":[-0,1e+2,{},[],{"b":true}]}`;
 const preview=formatJSONPreview('\uFEFF'+compact);
 assert.ok(preview.startsWith('\uFEFF{\n  "x": '));
 assert.match(preview,/90071992547409931111/);
 assert.match(preview,/-0,\n    1e\+2/);
 assert.match(preview,/"a  b\\u0020/);
 assert.deepEqual(JSON.parse(preview.slice(1)),JSON.parse(compact));
 assert.throws(()=>formatJSONPreview('{"x":}'),/JSON/);
});
