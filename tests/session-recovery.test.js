import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parse} from 'acorn';
import {openTemplate,units,makeBinding,renderTemplate} from '../src/core.js';
import {discoverFields,resolveFields} from '../src/data-fields.js';
import {lightningRules,profileDefinitions} from '../src/lightning.js';
import {SessionStore} from '../src/session-store.js';
import {createWorkflow,commitWorkflowData,changeWorkflowValue,workflowRecord,checkWorkflow,canExportWorkflow} from '../src/fill-model.js';
import {encodeSession,decodeSession,SessionAutosave,RecoveryStorage} from '../src/session-recovery.js';
import {topbar,credit} from '../src/workbench.js';
import {hasPendingChanges} from '../src/usability.js';
import {checkpointEdit,travelEdit} from '../src/edit-history.js';

const code=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),syntax=parse(code,{ecmaVersion:'latest',sourceType:'module'});
function mainFunction(name,env){const node=syntax.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return vm.runInNewContext('('+code.slice(node.start,node.end)+')',env);}
const fresh=mainFunction('fresh',{resolveFields,discoverFields,lightningRules,profileDefinitions,units,Map});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){
 const sessions=new SessionStore(),doc=openTemplate('\uFEFFName={{field:name}}\r\nID={{field:id}}','people.txt'),fields=discoverFields(doc).fields;
 fields[0].transform='upper';fields[0].value='Default';fields[1].value='0001';const first=fresh(doc,fields);first.originalDoc=openTemplate('\uFEFFOriginal Name={{field:name}}\r\nID={{field:id}}','people.txt');first.dirty=true;first.query='name';first.sortBy='name';first.rawMode=true;first.scroll=125;first.entryLabel='Lượt 8';
 first.workflow=createWorkflow();first.workflow.source='[{"field:name":"AN","field:id":"0001"},{"field:name":"Bình","field:id":"0002"}]';commitWorkflowData(first.workflow,{headers:['field:name','field:id'],rows:[['AN','0001'],['Bình','0002']]},fields,JSON.stringify(['table','auto',first.workflow.source]));changeWorkflowValue(doc,fields,first.workflow,1,fields[0].id,'Trần\nBình');checkWorkflow(doc,fields,first.workflow);first.workflow.selected=1;first.workflow.stage='review';first.workflow.filename=['field',fields[0].id];first.page='fill';sessions.add(first);
 const script=openTemplate('const PHOTO="old.jpg";','photo.js'),second=fresh(script,[{id:'photo',label:'Photo',key:'field:photo',value:'new.jpg',type:'text',transform:'none',required:true,bindings:[makeBinding(script,'text',13,20)]}]);second.drafts.set('text','const PHOTO="unfinished');second.dirty=true;sessions.add(second);
 return {sessions,first,second};
}

// Transactions run serially, like IndexedDB; aborted writes never replace the committed record.
function memoryDatabase(initial=null){
 let record=structuredClone(initial),queue=Promise.resolve(),failure=false,writes=0;
 const db={transaction(){let request,staged,aborted=false;const tx={objectStore(){return {get(){request={};return request;},put(value){staged=structuredClone(value);}};},abort(){aborted=true;}};
  queue=queue.then(()=>{request.result=structuredClone(record);request.onsuccess?.();if(aborted||failure&&staged){tx.onabort?.();return;}if(staged){record=staged;writes++;}tx.oncomplete?.();});return tx;
 }};
 return {get record(){return record;},get writes(){return writes;},set failure(value){failure=value;},storage(){const storage=new RecoveryStorage({});storage.db=Promise.resolve(db);return storage;}};
}

test('session round trip preserves tab IDs, baseline bytes, bindings, drafts and independent batch edits',async()=>{
 const {sessions,first,second}=fixture(),payload=await encodeSession(sessions,8),restored=await decodeSession(structuredClone(payload),fresh),a=restored.items[0].snapshot,b=restored.items[1].snapshot;
 assert.equal(restored.activeId,sessions.activeId);assert.equal(restored.entrySequence,8);assert.equal(restored.items.length,2);assert.equal(a.doc.source,first.doc.source);assert.equal(a.doc.bom,true);assert.equal(a.originalDoc.source,first.originalDoc.source);assert.equal(renderTemplate(a.doc,a.fields).output,renderTemplate(first.doc,first.fields).output);assert.equal(b.drafts.get('text'),second.drafts.get('text'));
 assert.equal(a.workflow.mapping[a.fields[0].id],'field:name');assert.equal(a.workflow.overrides[1][a.fields[0].id],'Trần\nBình');assert.equal(workflowRecord(a.doc,a.fields,a.workflow,1).output,workflowRecord(first.doc,first.fields,first.workflow,1).output);assert.equal(a.workflow.filename[1],a.fields[0].id);assert.equal(a.workflow.selected,1);assert.equal(a.workflow.stage,'review');assert.equal(a.sortBy,'name');assert.equal(a.scroll,125);assert.equal(a.entryLabel,'Lượt 8');assert.equal(a.rawMode,true);
 assert.equal(a.workflow.checked,false);assert.equal(canExportWorkflow(a.workflow),false);assert.equal(a.workflow.history.length,0);assert.equal(a.history.length,0);assert.equal(a.workflow.inputChanged,false);assert.ok(!JSON.stringify(payload).includes('boundSource'));
 a.fields[0].value='CHANGED';assert.equal(first.fields[0].value,'Default');
});

test('session capture freezes live values before asynchronous fingerprints complete',async()=>{
 const {sessions,first,second}=fixture(),saving=encodeSession(sessions,8);first.fields[0].value='LATE';first.workflow.overrides[1][first.fields[0].id]='LATE';second.drafts.set('text','LATE');sessions.remove(sessions.activeId);const payload=await saving;
 assert.equal(payload.tabs.length,2);assert.equal(payload.tabs[0].project.fields[0].value,'Default');assert.equal(payload.tabs[0].workflow.overrides[1][first.fields[0].id],'Trần\nBình');assert.equal(payload.tabs[1].drafts[0][1],'const PHOTO="unfinished');
});

test('removed placeholder fields stay removed and unapplied input stays separate after restore',async()=>{
 const {sessions,first}=fixture();first.fields=[];first.workflow.source='[{"field:name":"NEW"}]';const restored=await decodeSession(await encodeSession(sessions),fresh),a=restored.items[0].snapshot;assert.equal(a.fields.length,0);assert.equal(a.workflow.data.rows[0][0],'AN');assert.equal(a.workflow.source,'[{"field:name":"NEW"}]');assert.equal(a.workflow.inputChanged,true);
});

test('restore validates corrupted IDs, bindings, drafts, table cells, workflow options and versions atomically',async()=>{
 const {sessions}=fixture(),payload=await encodeSession(sessions),changes=[p=>p.version=99,p=>p.activeId='missing',p=>p.tabs[1].id=p.tabs[0].id,p=>p.tabs[0].project.fields[0].id='__proto__',p=>p.tabs[0].project.fields[0].bindings[0].expected='WRONG',p=>p.tabs[1].drafts=[['missing','source']],p=>p.tabs[0].workflow.data.rows[0][0]=42,p=>p.tabs[0].workflow.aiFormat='html',p=>p.tabs[0].workflow.overrides['01']={},p=>p.tabs[0].view.page='<script>'];
 for(const change of changes){const copy=structuredClone(payload);change(copy);await assert.rejects(decodeSession(copy,fresh));assert.equal(sessions.items.length,2);}
 await assert.rejects(decodeSession({...payload,padding:'x'.repeat(32_000_000)},fresh),/32 MB/);
});

test('an empty workspace and a disabled recovery record do not revive closed tabs',async()=>{
 assert.equal((await decodeSession(await encodeSession(new SessionStore()),fresh)).items.length,0);
 const memory=memoryDatabase({revision:'old',enabled:false,snapshot:{private:'old'},savedAt:1}),autosave=new SessionAutosave(()=>assert.fail('capture while disabled'),()=>{},memory.storage());const restored=await autosave.init(()=>assert.fail('restore while disabled'));assert.equal(restored,null);assert.equal(autosave.enabled,false);assert.equal(await autosave.flush(),false);assert.equal(memory.writes,0);
});

test('autosave coalesces changes, flushes once and keeps an already-saved session saved',async()=>{
 const memory=memoryDatabase(),statuses=[],autosave=new SessionAutosave(async()=>({value:'LATEST'}),s=>statuses.push(s),memory.storage());await autosave.init(v=>v);autosave.schedule();autosave.schedule();autosave.schedule();assert.equal(autosave.saved,false);assert.equal(await autosave.flush(),true);assert.equal(memory.writes,1);assert.equal(memory.record.snapshot.value,'LATEST');assert.equal(autosave.saved,true);assert.equal(await autosave.flush(),true);assert.equal(autosave.saved,true);assert.equal(autosave.running,null);assert.equal(memory.writes,1);assert.equal(statuses.at(-1).mode,'saved');
});

test('edits during an in-flight write are saved in order without falsely marking the newer value saved',async()=>{
 const memory=memoryDatabase(),gate=deferred(),started=deferred();let value='FIRST',calls=0;
 const autosave=new SessionAutosave(async()=>{const captured=value;if(++calls===1){started.resolve();await gate.promise;}return {value:captured};},()=>{},memory.storage());await autosave.init(v=>v);autosave.schedule();const saving=autosave.flush();await started.promise;value='SECOND';autosave.schedule();assert.equal(autosave.saved,false);gate.resolve();await saving;assert.equal(memory.record.snapshot.value,'SECOND');assert.equal(memory.writes,2);assert.equal(autosave.saved,true);clearTimeout(autosave.timer);
});

test('IndexedDB compare-and-swap refuses concurrent window overwrite until explicit takeover',async()=>{
 const memory=memoryDatabase(),a=memory.storage(),b=memory.storage();await Promise.all([a.read(),b.read()]);const results=await Promise.allSettled([a.write({value:'A'},true),b.write({value:'B'},true)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results[1].reason.message,/Cửa sổ khác/);assert.equal(memory.record.snapshot.value,'A');
 const autosave=new SessionAutosave(async()=>({value:'B'}),()=>{},b);autosave.ready=true;autosave.schedule();assert.equal(await autosave.flush(),false);assert.equal(autosave.saved,false);assert.equal(memory.record.snapshot.value,'A');assert.equal(await autosave.configure(true),true);assert.equal(memory.record.snapshot.value,'B');await assert.rejects(a.write({value:'A AGAIN'},true),/Cửa sổ khác/);
});

test('quota failure or corrupt recovery retains the previous committed snapshot and reports unsaved status',async()=>{
 const previous={revision:'old',enabled:true,snapshot:{value:'OLD'},savedAt:1},memory=memoryDatabase(previous),autosave=new SessionAutosave(async()=>({value:'NEW'}),()=>{},memory.storage());await autosave.init(v=>v);memory.failure=true;autosave.schedule();assert.equal(await autosave.flush(),false);assert.equal(autosave.status.mode,'error');assert.equal(autosave.saved,false);assert.deepEqual(memory.record,previous);memory.failure=false;assert.equal(await autosave.configure(true),true);assert.equal(memory.record.snapshot.value,'NEW');
 const corrupt=new SessionAutosave(async()=>assert.fail('do not replace invalid recovery automatically'),()=>{},memory.storage());await corrupt.init(()=>{throw new Error('Invalid recovery');});corrupt.schedule();assert.equal(await corrupt.flush(),false);assert.equal(memory.record.snapshot.value,'NEW');assert.equal(await corrupt.configure(false),true);assert.equal(memory.record.snapshot,null);assert.equal(memory.record.enabled,false);
});

test('disabling autosave waits for an in-flight save then clears recovery without a late write resurrecting it',async()=>{
 const memory=memoryDatabase(),gate=deferred(),started=deferred(),autosave=new SessionAutosave(async()=>{started.resolve();await gate.promise;return {value:'PRIVATE'};},()=>{},memory.storage());await autosave.init(v=>v);autosave.schedule();const saving=autosave.flush();await started.promise;const disabling=autosave.configure(false);gate.resolve();await Promise.all([saving,disabling]);assert.equal(autosave.enabled,false);assert.equal(memory.record.enabled,false);assert.equal(memory.record.snapshot,null);assert.equal(autosave.saved,false);assert.equal(autosave.status.mode,'off');
});

test('missing IndexedDB blocks autosave visibly without blocking the editor',async()=>{
 const autosave=new SessionAutosave(async()=>({}),()=>{},new RecoveryStorage(null));assert.equal(await autosave.init(v=>v),null);assert.equal(autosave.ready,true);assert.equal(autosave.saved,false);assert.match(autosave.error,/không cho lưu phiên/);autosave.schedule();assert.equal(await autosave.flush(),false);
});

test('boot blocks input until restore is applied and restores all tabs before starting library refresh',async()=>{
 const {sessions}=fixture(),payload=await encodeSession(sessions,8),gate=deferred(),app={setAttribute(){},removeAttribute(){}},state={},live=new SessionStore();let libraryRefreshed=false;
 const autosave={async init(restore){await gate.promise;return restore(payload);},async prime(){}},env={state,sessions:live,entrySequence:0,templates:[],fresh,openTemplate,render(){},document:{querySelector:()=>app},autosave,decodeSession,refreshLibrary:async()=>{libraryRefreshed=true;assert.equal(live.items.length,2);},toast(){}};
 const boot=mainFunction('boot',env)();assert.equal(app.inert,true);assert.equal(live.items.length,0);gate.resolve();await boot;assert.equal(app.inert,false);assert.equal(libraryRefreshed,true);assert.equal(state.doc.name,'photo.js');assert.equal(state.drafts.get('text'),'const PHOTO="unfinished');assert.equal(env.entrySequence,8);
});

test('autosave controls are discoverable in the existing menu and footer',()=>{
 assert.match(topbar({empty:true},'light'),/data-action="session-settings"/);assert.match(credit(),/id="session-save-status"/);assert.match(code,/if\(!autosave.saved&&hasPendingChanges/);assert.match(code,/visibilitychange/);assert.match(code,/pagehide/);
});


test('the actual unload handler warns for pending or failed saves but allows a committed dirty session to close',async()=>{
 const node=syntax.body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.object?.name==='window'&&n.expression.arguments[0]?.value==='beforeunload').expression.arguments[1];
 const memory=memoryDatabase(),autosave=new SessionAutosave(async()=>({value:'SAVED'}),()=>{},memory.storage());await autosave.init(v=>v);autosave.schedule();await autosave.flush();
 const state={empty:false,dirty:true,drafts:new Map()},env={captureActive(){},autosave,state,sessions:{items:[]},hasPendingChanges},handler=vm.runInNewContext('('+code.slice(node.start,node.end)+')',env);let warnings=0;
 handler({preventDefault(){warnings++;}});assert.equal(warnings,0);
 autosave.schedule();handler({preventDefault(){warnings++;}});assert.equal(warnings,1);await autosave.flush();handler({preventDefault(){warnings++;}});assert.equal(warnings,1);
 await autosave.configure(false);handler({preventDefault(){warnings++;}});assert.equal(warnings,2);
});


test('invalid recovery metadata blocks automatic replacement but can be explicitly cleared',async()=>{
 for(const bad of [{revision:{broken:true},enabled:true,snapshot:{old:'data'},savedAt:1},{revision:'old',enabled:'false',snapshot:{old:'data'},savedAt:1},{revision:'old',enabled:true,snapshot:0,savedAt:1}]){
  const memory=memoryDatabase(bad),autosave=new SessionAutosave(async()=>assert.fail('do not replace invalid metadata'),()=>{},memory.storage());assert.equal(await autosave.init(v=>v),null);assert.equal(autosave.status.mode,'error');autosave.schedule();assert.equal(await autosave.flush(),false);assert.deepEqual(memory.record,bad);assert.equal(await autosave.configure(false),true);assert.equal(memory.record.snapshot,null);assert.equal(memory.record.enabled,false);
 }
});


test('a restored unfinished script can be discarded and undone without altering template or field values',async()=>{
 const {sessions}=fixture(),restored=await decodeSession(await encodeSession(sessions),fresh),state=restored.items[1].snapshot;state.selected='text';assert.equal(state.history.length,0);const before=renderTemplate(state.doc,state.fields).output;
 const action=mainFunction('action',{state,document:{querySelectorAll:()=>[]},checkpoint:()=>checkpointEdit(state),render(){},toast(){}});action('discard-draft');assert.equal(state.drafts.size,0);assert.equal(state.history.length,1);assert.equal(renderTemplate(state.doc,state.fields).output,before);assert.equal(travelEdit(state,'undo'),true);assert.equal(state.drafts.get('text'),'const PHOTO="unfinished');assert.equal(renderTemplate(state.doc,state.fields).output,before);
});

test('a rejected snapshot keeps the last good session and autosave resumes after correction',async()=>{
 const {sessions,first}=fixture(),initial=await encodeSession(sessions),memory=memoryDatabase({revision:'base',enabled:true,snapshot:initial,savedAt:1});
 const autosave=new SessionAutosave(()=>encodeSession(sessions),()=>{},memory.storage());
 await autosave.init(p=>decodeSession(p,fresh));
 const source=first.workflow.source;
 first.workflow.source='x'.repeat(2_000_001);
 autosave.schedule();
 assert.equal(await autosave.flush(),false);
 assert.equal(autosave.saved,false);
 assert.deepEqual(memory.record.snapshot,initial);
 first.workflow.source=source;
 first.fields[0].value='Corrected';
 autosave.schedule();
 assert.equal(await autosave.flush(),true);
 const restored=await decodeSession(memory.record.snapshot,fresh);
 assert.equal(restored.items[0].snapshot.fields[0].value,'Corrected');
});

test('opening an unchanged second window leaves the first window able to save',async()=>{
 const initial={value:'A'},memory=memoryDatabase({revision:'base',enabled:true,snapshot:initial,savedAt:1});
 let value='A';const first=new SessionAutosave(async()=>({value}),()=>{},memory.storage());
 const second=new SessionAutosave(async()=>structuredClone(initial),()=>{},memory.storage());
 await first.init(x=>x);
 await second.init(x=>x);
 await second.prime();
 second.schedule();
 assert.equal(await second.flush(),true);
 assert.equal(memory.writes,0);
 value='B';first.schedule();
 assert.equal(await first.flush(),true);
 assert.equal(memory.record.snapshot.value,'B');
});

test('inherited property names are normal field keys and explicit empty backups stay empty',async()=>{
 const doc=openTemplate('{{field:constructor}} {{field:toString}}','x.txt');
 assert.deepEqual(discoverFields(doc).fields.map(f=>f.label),['constructor','toString']);
 assert.equal(fresh(doc,[]).fields.length,0);
 assert.equal(fresh(doc).fields.length,2);
});

test('restored only-errors filter shows records until validation runs again',async()=>{
 const {sessions,first}=fixture();
 first.workflow.onlyErrors=true;
 const restored=(await decodeSession(await encodeSession(sessions),fresh)).items[0].snapshot;
 const {fillWorkspace}=await import('../src/fill-workspace.js');
 assert.equal(restored.workflow.checked,false);
 assert.equal((fillWorkspace(restored).match(/data-person="/g)||[]).length,2);
});

test('template undo evicts old large snapshots but keeps recent edits reversible',()=>{
 const doc=openTemplate('a'.repeat(2_000_000),'x.txt'),state=fresh(doc,[]);
 const field={id:'x',value:'0'};state.fields.push(field);
 for(let i=0;i<12;i++){checkpointEdit(state);state.fields[0].value=String(i+1);}
 assert.ok(state.history.length<12);
 assert.ok(state.history.reduce((n,s)=>n+s.length*2,0)<=32_000_000);
 assert.equal(travelEdit(state,'undo'),true);
 assert.equal(state.fields[0].value,'11');
 assert.equal(travelEdit(state,'redo'),true);
 assert.equal(state.fields[0].value,'12');
});
