import test from 'node:test';import assert from 'node:assert/strict';
import {openTemplate,units,makeBinding,renderTemplate} from '../src/core.js';
import {fieldSelectionBinding,fieldSelectionPreview,unlinkFieldBindings} from '../src/selection-fields.js';
test('dialog creates several independent fields in one sentence and rejects overlap with a saved segment',()=>{
 const doc=openTemplate('Tên AN; ảnh AN.jpg; mã 001','x.txt'),u=units(doc)[0];
 const a=fieldSelectionBinding(doc,[],{unitId:u.id,start:4,end:6}),first={id:'one',key:'field:name',label:'Tên',value:'BINH',bindings:[a.binding]};
 const start=u.value.indexOf('AN.jpg'),b=fieldSelectionBinding(doc,[first],{unitId:u.id,start,end:start+2}),second={id:'two',key:'field:photo',label:'Ảnh',value:'PHOTO',bindings:[b.binding]};
 assert.equal(renderTemplate(doc,[first,second]).output,'Tên BINH; ảnh PHOTO.jpg; mã 001');
 assert.throws(()=>fieldSelectionBinding(doc,[first],{unitId:u.id,start:4,end:5}),/thuộc trường/);
 assert.throws(()=>fieldSelectionBinding(doc,[first],{unitId:u.id,whole:true}),/thuộc trường/);
});
test('dialog constant scope supports partial text and whole escaped literals without losing quote syntax',()=>{
 const code='const PHOTO = "prefix_AN.jpg";',doc=openTemplate(code,'x.js'),u=units(doc)[0],scopeStart=code.indexOf('"')+1,scopeEnd=code.lastIndexOf('"');
 const {binding,value}=fieldSelectionBinding(doc,[],{unitId:u.id,scopeStart,scopeEnd,start:7,end:9});assert.equal(value,'AN');
 assert.equal(renderTemplate(doc,[{id:'f',value:"B'INH",bindings:[binding]}]).output,'const PHOTO = "prefix_B\'INH.jpg";');
 assert.throws(()=>fieldSelectionBinding(doc,[],{unitId:u.id,scopeStart,scopeEnd,start:0,end:200}),/Bôi đen/);
});
test('assigned segment preview distinguishes identical occurrences and escapes source and labels',()=>{
 const value='<AN> + AN',doc=openTemplate(value,'x.txt'),u=units(doc)[0],{binding}=fieldSelectionBinding(doc,[],{unitId:u.id,start:1,end:3});
 const html=fieldSelectionPreview(value,[{label:'<Tên>',key:'field:name',bindings:[binding]}],u.id);
 assert.equal((html.match(/data-picker-unlink=/g)||[]).length,1);assert.match(html,/&lt;Tên&gt;/);assert.ok(!html.includes(' + AN'));assert.ok(!html.includes('<Tên>'));
});

test('quick unlink restores only one occurrence and leaves a shared field linked elsewhere',()=>{
 const doc=openTemplate('AN + AN','x.txt'),u=units(doc)[0],f={id:'f',label:'Tên',value:'BINH',bindings:[makeBinding(doc,u.id,0,2),makeBinding(doc,u.id,5,7)]},before=structuredClone([f]);
 const next=unlinkFieldBindings([f],'f',u.id,{start:0,end:2});assert.equal(next[0].bindings.length,1);assert.equal(renderTemplate(doc,next).output,'AN + BINH');assert.deepEqual([f],before);
 assert.equal(renderTemplate(doc,before).output,'BINH + BINH');
});
test('unlinking a field from one CSV cell keeps another cell and unrelated schema fields',()=>{
 const doc=openTemplate('AN,AN\n','x.csv','csv'),[a,b]=units(doc),f={id:'f',label:'Tên',value:'BINH',bindings:[makeBinding(doc,a.id,0,2),makeBinding(doc,b.id,0,2)]},schema={id:'schema',bindings:[]};
 const next=unlinkFieldBindings([f,schema],'f',a.id);assert.equal(next.length,2);assert.equal(renderTemplate(doc,next).output,'AN,BINH\n');assert.equal(next[1],schema);
 const last=unlinkFieldBindings(next,'f',b.id);assert.deepEqual(last,[schema]);assert.equal(renderTemplate(doc,last).output,'AN,AN\n');
});
test('stale unlink requests are rejected instead of deleting a different range',()=>{
 const doc=openTemplate('AN + AN','x.txt'),u=units(doc)[0],fields=[{id:'f',bindings:[makeBinding(doc,u.id,0,2)]}];
 assert.throws(()=>unlinkFieldBindings(fields,'missing',u.id),/được xoá/);assert.throws(()=>unlinkFieldBindings(fields,'f',u.id,{start:5,end:7}),/không còn/);
});

test('active picker keeps repeated occurrences independent and supports Unicode replacements',()=>{
 const doc=openTemplate('Ảnh AN.jpg + AN.jpg','x.txt'),u=units(doc)[0],start=u.value.lastIndexOf('AN'),{binding}=fieldSelectionBinding(doc,[],{unitId:u.id,start,end:start+2});
 assert.equal(renderTemplate(doc,[{id:'f',value:'BÌNH',bindings:[binding]}]).output,'Ảnh AN.jpg + BÌNH.jpg');
 assert.throws(()=>fieldSelectionBinding(doc,[],{unitId:u.id,start:0,end:0}),/Bôi đen/);
});
test('active picker accepts a whole escaped literal but refuses partial escaped offsets',()=>{
 const code='const EMAIL = "a\\nb@example.test";',doc=openTemplate(code,'x.js'),scopeStart=code.indexOf('"')+1,scopeEnd=code.lastIndexOf('"');
 assert.throws(()=>fieldSelectionBinding(doc,[],{unitId:'text',scopeStart,scopeEnd,start:0,end:1}),/escape/);
 const {binding,value}=fieldSelectionBinding(doc,[],{unitId:'text',scopeStart,scopeEnd,whole:true});assert.equal(value,'a\nb@example.test');assert.equal(renderTemplate(doc,[{id:'f',value,bindings:[binding]}]).output,code);
});
