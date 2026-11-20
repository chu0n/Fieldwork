import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import fs from 'node:fs';
import { openTemplate, units, makeBinding, assertNoOverlap, renderTemplate, saveProject, loadProject, parseJS } from '../src/core.js';
import { decodeTemplateFile } from '../src/file-text.js';

const field = (bindings, value, extra = {}) => ({ id: 'f1', label: 'Tên tệp', type: 'text', value, required: true, transform: 'none', bindings, ...extra });
test('file decoding keeps UTF-8 BOM and rejects lossy replacement of invalid input',()=>{
 const original='\uFEFF"name","Nguyễn Ánh"\r\n',bytes=new TextEncoder().encode(original);
 const doc=openTemplate(decodeTemplateFile(bytes),'bom.csv');
 assert.equal(doc.bom,true);assert.deepEqual(new TextEncoder().encode(renderTemplate(doc,[]).output),bytes);
 assert.throws(()=>decodeTemplateFile(new Uint8Array([0xff,0xfe,0,0])),/UTF-8/);
});
test('multiline CSV remains seven columns and preserves leading zeroes', () => {
  const rows = [['r1','4','','const FILE = "old.jpg";\nconsole.log(FILE);','',1,'c1'],['r2','0','ID','001234','','1','c1']];
  const doc = openTemplate(Papa.unparse(rows), 'sample.csv');
  const u = units(doc).find(u => u.id === '0:3');
  const start = u.value.indexOf('old.jpg');
  const b = makeBinding(doc,u.id,start,start+7,'js');
  const r = renderTemplate(doc,[field([b],'ảnh "mới" \\ test\n2026.jpg')]);
  assert.deepEqual(r.problems,[]);
  const parsed = Papa.parse(r.output).data;
  assert.equal(parsed[0].length,7);assert.equal(parsed[1][3],'001234');
  parseJS(parsed[0][3]);
  assert.ok(parsed[0][3].includes('\\n2026.jpg'));
});
test('multiple bindings within one JS literal are applied together without execution', () => {
  const doc = openTemplate('const x = "NAME / EMAIL";', 'sample.js');
  const a=makeBinding(doc,'text',11,15),b=makeBinding(doc,'text',18,23);
  const result=renderTemplate(doc,[field([a],'Đặng "Anh"'),field([b],'a@example.com')]);
  assert.deepEqual(result.problems,[]); assert.ok(result.output.includes('Đặng \\"Anh\\"'.replace(/\\\\/g,'\\')));
});
test('untouched CSV is byte-identical including optional quotes, empty cells, BOM and embedded newlines',()=>{
 const source='\uFEFF"id","value",empty\r\n"r1","plain",""\r\n"r2","const x = \'a\'; const y = ""b"";",\r\n';
 const doc=openTemplate(source,'quoted.csv'),result=renderTemplate(doc,[]);
 assert.deepEqual(result.problems,[]);assert.equal(result.output,source);assert.equal(result.changed.length,0);
});
test('editing one CSV cell preserves every other raw character and its original quoted style',()=>{
 const source='"id","value","empty"\r\n"r1","old",""\r\n"r2","const x = \'a\'; const y = ""b"";",\r\n';
 const doc=openTemplate(source,'quoted.csv'),binding=makeBinding(doc,'1:1',0,3);
 const result=renderTemplate(doc,[field([binding],'new "quoted", value')]);
 assert.deepEqual(result.problems,[]);
 assert.equal(result.output,source.replace('"r1","old"','"r1","new ""quoted"", value"'));
 assert.deepEqual(result.changed.map(c=>c.id),['1:1']);
});
test('unchanged JS bindings keep single and double quote spelling exactly',()=>{
 const source="const a = 'old'; const b = \"keep\\nline\";",doc=openTemplate(source,'literal.js');
 const binding=makeBinding(doc,'text',11,14);
 const result=renderTemplate(doc,[field([binding],'old')]);
 assert.equal(result.output,source);assert.deepEqual(result.changed,[]);
});
test('edited single-quoted JS keeps its delimiter and safely escapes new content',()=>{
 const source="const a = 'old'; const untouched = \"keep\";",doc=openTemplate(source,'literal.js');
 const result=renderTemplate(doc,[field([makeBinding(doc,'text',11,14)],"O'Brien \\ \"ảnh\"\nline")]);
 assert.deepEqual(result.problems,[]);parseJS(result.output);
 assert.equal(parseJS(result.output).body[0].declarations[0].init.value,"O'Brien \\ \"ảnh\"\nline");
 assert.ok(result.output.startsWith("const a = 'O\\'Brien"));assert.ok(result.output.endsWith('const untouched = "keep";'));
});
test('unsafe JS binding is rejected', () => {
  const doc=openTemplate('const x = `old ${1}`;', 'sample.js');
  assert.throws(()=>makeBinding(doc,'text',11,14),/string literal/);
});
test('escaped original literal supports whole content but rejects partial content', () => {
  const doc=openTemplate('const x = "old\\nname";', 'sample.js');
  assert.throws(()=>makeBinding(doc,'text',11,14),/escape/);
  const binding=makeBinding(doc,'text',11,20);
  assert.deepEqual(renderTemplate(doc,[field([binding],'fresh')]).problems,[]);
  assert.equal(renderTemplate(doc,[field([binding],'fresh')]).output,'const x = "fresh";');
});
test('JSON string escape, Unicode and replacements are valid', () => {
  const doc=openTemplate('{"name":"OLD"}', 'data.json');
  const result=renderTemplate(doc,[field([makeBinding(doc,'text',9,12)],'a"b\nc\\d')]);
  assert.deepEqual(result.problems,[]);assert.equal(JSON.parse(result.output).name,'a"b\nc\\d');
});
test('overlapping bindings are rejected',()=>{
  const doc=openTemplate('abcdef','sample.txt');
  assert.throws(()=>assertNoOverlap([field([makeBinding(doc,'text',1,4)],'')],makeBinding(doc,'text',2,5)),/đã thuộc/);
});
test('required, date and email validation prevent invalid exports',()=>{
  const doc=openTemplate('OLD','sample.txt'),b=makeBinding(doc,'text',0,3);
  assert.ok(renderTemplate(doc,[field([b],'')]).problems.length);
  assert.ok(renderTemplate(doc,[field([b],'2026-02-30',{type:'date'})]).problems.length);
  assert.ok(renderTemplate(doc,[field([b],'not-an-email',{type:'email'})]).problems.length);
});
test('stale mappings are detected',()=>{
  const doc=openTemplate('OLD','sample.txt'),b=makeBinding(doc,'text',0,3);
  const changed=openTemplate('NEW','sample.txt');
  assert.ok(renderTemplate(changed,[field([b],'value')]).problems.some(p=>p.includes('không còn khớp')));
});
test('project roundtrip verifies source hash and defaults to excluding values',async()=>{
  const doc=openTemplate('\uFEFFNAME','template.txt'),f=field([makeBinding(doc,'text',0,4)],'secret');
  const saved=await saveProject(doc,[f]);assert.equal(saved.fields[0].value,'');
  const loaded=await loadProject(saved);assert.equal(loaded.doc.bom,true);assert.equal(loaded.fields[0].bindings[0].expected,'NAME');
  saved.source='CHANGED';await assert.rejects(loadProject(saved),/thay đổi/);
});
test('malformed imported project cannot inject binding metadata',async()=>{
  const doc=openTemplate('NAME','template.txt');
  const saved=await saveProject(doc,[field([makeBinding(doc,'text',0,4)],'ok')],true);
  saved.fields[0].bindings[0].literalStart=-5;saved.fields[0].bindings[0].literalValue='malicious';
  const loaded=await loadProject(saved);
  assert.equal(loaded.fields[0].bindings[0].literalStart,undefined);
});
test('replacement text is never recursively interpreted as a placeholder',()=>{
  const doc=openTemplate('{{field:name}}','template.txt');
  const result=renderTemplate(doc,[field([makeBinding(doc,'text',0,14)],'{{field:other}}')]);
  assert.deepEqual(result.problems,[]);assert.equal(result.output,'{{field:other}}');
});
test('unbound namespaced placeholder is reported',()=>{
  assert.ok(renderTemplate(openTemplate('{{field:email}}','template.txt'),[]).problems.length);
});
test('generic variable width CSV, quotes, CRLF and BOM survive',()=>{
  const doc=openTemplate('\uFEFFname,value\r\na,"b,b"\r\nz', 'template.csv');
  const result=renderTemplate(doc,[]);assert.deepEqual(result.problems,[]);assert.ok(result.output.startsWith('\uFEFF'));assert.ok(result.output.includes('\r\n'));
  assert.deepEqual(Papa.parse(result.output.slice(1)).data,doc.rows);
});
test('malformed CSV is rejected',()=>assert.throws(()=>openTemplate('a,"unterminated','bad.csv'),/CSV/));
test('synthetic Lightning sample round-trips without changing bytes or cells',()=>{
  const path=new URL('../examples/lightning-demo.txt',import.meta.url);
  const doc=openTemplate(fs.readFileSync(path,'utf8'),'sample.txt');
  const result=renderTemplate(doc,[]);
  assert.deepEqual(result.problems,[]);assert.equal(result.output,fs.readFileSync(path,'utf8'));
  assert.deepEqual(Papa.parse(result.output.replace(/^\uFEFF/,'')).data,doc.rows);
});
test('empty CSV value can become a required field without moving neighboring cells',()=>{
  const doc=openTemplate('key,value\nname,\nother,001','template.csv');
  const b=makeBinding(doc,'1:1',0,0);
  const result=renderTemplate(doc,[field([b],'New name')]);
  assert.deepEqual(result.problems,[]);assert.deepEqual(Papa.parse(result.output).data,[['key','value'],['name','New name'],['other','001']]);
  assert.throws(()=>assertNoOverlap([field([b],'')],b),/đã thuộc/);
});
test('script line separator characters are serialized without breaking syntax',()=>{
  const doc=openTemplate('const x="OLD";', 'script.js');
  const result=renderTemplate(doc,[field([makeBinding(doc,'text',9,12)],'a\u2028b\u2029c')]);
  assert.deepEqual(result.problems,[]);assert.ok(result.output.includes('\\u2028'));parseJS(result.output);
});
test('invalid original embedded JavaScript is reported even with no fields',()=>{
  const doc=openTemplate(Papa.unparse([['### AUTOFILL PROFILES ###'],['c1','Fixture','',''],['### AUTOFILL RULES ###'],['r1','4','','const x = ;','','0','c1']]),'script.csv');
  assert.ok(renderTemplate(doc,[]).problems.some(p=>p.includes('Unexpected token')));
});
test('Lightning rules must refer to existing profiles',()=>{
  const doc=openTemplate(Papa.unparse([['### AUTOFILL PROFILES ###','','','','','',''],['Profile ID','Name','Site','Hotkey','','',''],['c1','Demo','','','','',''],['### AUTOFILL RULES ###','','','','','',''],['Rule ID','Type','Name','Value','Site','Mode','Profile'],['r1','0','field','value','','1','missing']]),'rules.csv');
  assert.ok(renderTemplate(doc,[]).problems.some(p=>p.includes('profile không tồn tại')));
});

test('TSV templates expose cells and preserve tabs, quoted data and CRLF when editing',()=>{
 const source='\uFEFFID\tNote\r\n0001\t"first\tline"\r\n',doc=openTemplate(source,'template.TSV');
 assert.equal(doc.delimiter,'\t');
 assert.equal(renderTemplate(doc,[]).output,source);
 const result=renderTemplate(doc,[field([makeBinding(doc,'1:0',0,4)],'0002')]);
 assert.deepEqual(result.problems,[]);
 assert.equal(result.output,source.replace('0001','0002'));
});
