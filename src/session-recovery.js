import {uid,fingerprint,saveProject,loadProject,openTemplate,units} from './core.js';
import {createWorkflow} from './fill-model.js';
import {validateRecords} from './bulk-data.js';

const SESSION_LIMIT=32_000_000;
const viewTypes={selected:'string',query:'string',ruleGroup:'string',profileFilter:'string',sortBy:'string',sortDirection:'string',groupBy:'string',typeFilter:'string',statusFilter:'string',templateId:'string',catalogQuery:'string',dirty:'boolean',exported:'boolean',page:'string',rawMode:'boolean',rawVersion:'string',expanded:'string',scroll:'number',entryLabel:'string'};
const workflowKeys=['stage','mode','source','format','aiSource','aiFormat','data','mapping','dateFormat','overrides','selected','query','onlyErrors','raw','dirty','exported','listVisible','filename','outputFormat','importedToken'];
const take=(value,keys)=>Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]]));
function checkSize(value){if(new TextEncoder().encode(JSON.stringify(value)).length>SESSION_LIMIT)throw new Error('Phiên làm việc vượt 32 MB. Hãy bớt tab; bản khôi phục trước vẫn được giữ.');}
function validId(id){return typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(id);}
function documentSource(doc){return {source:(doc.bom?'\uFEFF':'')+doc.source,name:doc.name,kind:doc.kind};}
export async function encodeSession(sessions,entrySequence=0){
 // Freeze before hashing: edits may continue while WebCrypto is awaiting a digest.
 const frozen=structuredClone({activeId:sessions.activeId,entrySequence,tabs:sessions.items.map(({id,snapshot:s})=>({id,doc:documentSource(s.doc),original:documentSource(s.originalDoc),fields:s.fields,pinnedRuleIds:s.pinnedRuleIds,drafts:[...s.drafts],view:take(s,Object.keys(viewTypes)),workflow:s.workflow?take(s.workflow,workflowKeys):null}))});
 checkSize(frozen);
 const tabs=await Promise.all(frozen.tabs.map(async tab=>{const doc=openTemplate(tab.doc.source,tab.doc.name,tab.doc.kind),project=await saveProject(doc,tab.fields,true,{pinnedRuleIds:tab.pinnedRuleIds});return {id:tab.id,project,original:tab.original,drafts:tab.drafts,view:tab.view,workflow:tab.workflow};}));
 const result={version:1,activeId:frozen.activeId,entrySequence:frozen.entrySequence,tabs};// Use the reader's validation before replacing the last recoverable session.
 await decodeSession(result, (_doc, fields) => ({fields, page:'workspace'}));
 return result;
}
function restoreWorkflow(raw,fields){
 if(raw==null)return null;
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Tiến trình hàng loạt không hợp lệ.');
 const flow=createWorkflow(),ids=new Set(fields.map(f=>f.id));
 for(const key of ['source','aiSource','query']){if(raw[key]!=null&&(typeof raw[key]!=='string'||raw[key].length>2_000_000))throw new Error('Nguồn hàng loạt không hợp lệ.');flow[key]=raw[key]??flow[key];}
 for(const [key,allowed]of Object.entries({stage:['fields','input','review','export'],mode:['table','ai'],format:['auto','json','tsv','labels'],aiFormat:['json','csv','tsv'],dateFormat:['iso','dmy','mdy'],outputFormat:['json','csv','tsv']})){if(raw[key]!=null&&!allowed.includes(raw[key]))throw new Error('Cấu hình hàng loạt không hợp lệ.');if(raw[key]!=null)flow[key]=raw[key];}
 for(const key of ['onlyErrors','raw','dirty','exported','listVisible']){if(raw[key]!=null&&typeof raw[key]!=='boolean')throw new Error('Trạng thái hàng loạt không hợp lệ.');if(raw[key]!=null)flow[key]=raw[key];}
 flow.data=raw.data==null?null:validateRecords(raw.data);
 if(!raw.mapping||typeof raw.mapping!=='object'||Array.isArray(raw.mapping)||!raw.overrides||typeof raw.overrides!=='object'||Array.isArray(raw.overrides))throw new Error('Cột nguồn hoặc dữ liệu chỉnh sửa không hợp lệ.');
 flow.mapping=Object.fromEntries(Object.entries(raw.mapping).filter(([id])=>ids.has(id)).map(([id,value])=>{if(typeof value!=='string')throw new Error('Cột nguồn không hợp lệ.');return [id,value];}));
 if(JSON.stringify(raw.overrides).length>2_000_000)throw new Error('Các giá trị chỉnh sửa vượt 2 MB.');
 flow.overrides=Object.fromEntries(Object.entries(raw.overrides).map(([index,row])=>{if(!/^(0|[1-9]\d*)$/.test(index)||!flow.data?.rows[Number(index)]||!row||typeof row!=='object'||Array.isArray(row))throw new Error('Bản ghi chỉnh sửa không hợp lệ.');return [index,Object.fromEntries(Object.entries(row).filter(([id])=>ids.has(id)).map(([id,value])=>{if(typeof value!=='string')throw new Error('Giá trị chỉnh sửa phải là chuỗi.');return [id,value];}))];}));
 if(raw.importedToken!=null){const token=JSON.parse(raw.importedToken);if(!Array.isArray(token)||token.length!==3||token.some(v=>typeof v!=='string'))throw new Error('Nguồn nhập đã lưu không hợp lệ.');flow.importedToken=raw.importedToken;}
 flow.inputChanged=!!flow.data&&flow.importedToken!==JSON.stringify([flow.mode,flow.mode==='ai'?flow.aiFormat:flow.format,flow.mode==='ai'?flow.aiSource:flow.source]);
 flow.selected=Number.isInteger(raw.selected)?Math.max(0,Math.min(raw.selected,(flow.data?.rows.length||1)-1)):0;
 if(raw.filename){if(!(typeof raw.filename==='string'||Array.isArray(raw.filename)&&raw.filename.length===2&&['field','column'].includes(raw.filename[0])&&typeof raw.filename[1]==='string'))throw new Error('Cách đặt tên file không hợp lệ.');flow.filename=raw.filename;}
 flow.notice='Đã khôi phục dữ liệu. Kiểm tra lại danh sách trước khi xuất.';
 return flow;
}
export async function decodeSession(payload,fresh,limit=20){
 checkSize(payload);
 if(!payload||payload.version!==1||!Array.isArray(payload.tabs)||payload.tabs.length>limit||new Set(payload.tabs.map(t=>t.id)).size!==payload.tabs.length||payload.tabs.some(t=>!validId(t.id))||!Number.isSafeInteger(payload.entrySequence)||payload.entrySequence<0)throw new Error('Phiên đã lưu không hợp lệ hoặc không được hỗ trợ.');
 const items=await Promise.all(payload.tabs.map(async tab=>{
  const loaded=await loadProject(tab.project),fieldIds=tab.project.fields.map(f=>f.id);
  if(fieldIds.some(id=>!validId(id))||new Set(fieldIds).size!==fieldIds.length)throw new Error('ID trường đã lưu không hợp lệ.');
  loaded.fields.forEach((field,i)=>field.id=fieldIds[i]);
  const original=tab.original,originalDoc=openTemplate(original.source,original.name,original.kind),snapshot=fresh(loaded.doc,loaded.fields,false,loaded.options);
  if(!tab.view||typeof tab.view!=='object'||Array.isArray(tab.view))throw new Error('Cách xem đã lưu không hợp lệ.');
  for(const [key,type]of Object.entries(viewTypes)){const value=tab.view[key];if(value==null)continue;if(typeof value!==type||type==='number'&&(!Number.isFinite(value)||value<0))throw new Error('Cách xem đã lưu không hợp lệ.');snapshot[key]=value;}
  if(!['workspace','fill','guide','library'].includes(snapshot.page))throw new Error('Trang đã lưu không hợp lệ.');
  const sourceUnits=new Map(units(loaded.doc).map(u=>[u.id,u]));
  if(!Array.isArray(tab.drafts)||tab.drafts.length>sourceUnits.size||new Set(tab.drafts.map(d=>d[0])).size!==tab.drafts.length||tab.drafts.some(d=>!Array.isArray(d)||d.length!==2||!sourceUnits.has(d[0])||typeof d[1]!=='string'||d[1].length>8_000_000))throw new Error('Bản nháp mã/nguồn không hợp lệ.');
  snapshot.fields=loaded.fields;snapshot.originalDoc=originalDoc;snapshot.drafts=new Map(tab.drafts);snapshot.workflow=restoreWorkflow(tab.workflow,loaded.fields);
  return {id:tab.id,snapshot};
 }));
 if(items.length?!items.some(item=>item.id===payload.activeId):payload.activeId!==null)throw new Error('Tab đang mở không còn khớp phiên đã lưu.');
 return {items,activeId:payload.activeId,entrySequence:payload.entrySequence};
}

const revisionKey=record=>record==null?'absent':typeof record.revision==='string'?'string:'+record.revision:'invalid';
export class RecoveryStorage{
 constructor(indexedDB=globalThis.indexedDB){this.indexedDB=indexedDB;this.revision='absent';}
 async database(){
  if(!this.indexedDB)throw new Error('Trình duyệt không cho lưu phiên. Hãy tải file để giữ dữ liệu.');
  if(!this.db)this.db=new Promise((resolve,reject)=>{const request=this.indexedDB.open('fieldwork-recovery',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onerror=()=>{this.db=null;reject(new Error('Không mở được bộ nhớ phiên. Hãy tải file để giữ dữ liệu.'));};request.onblocked=()=>{this.db=null;reject(new Error('Bộ nhớ phiên đang bị chặn bởi cửa sổ khác.'));};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();this.db=null;};resolve(db);};});
  return this.db;
 }
 async read(){const db=await this.database();return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readonly'),request=tx.objectStore('workspace').get('current');tx.oncomplete=()=>{this.revision=revisionKey(request.result);resolve(request.result??null);};tx.onerror=tx.onabort=()=>reject(new Error('Không đọc được phiên đã lưu.'));});}
 async write(snapshot,enabled){
  const db=await this.database(),expected=this.revision;
  return new Promise((resolve,reject)=>{const tx=db.transaction('workspace','readwrite'),store=tx.objectStore('workspace'),request=store.get('current'),record={revision:uid(),enabled,snapshot,savedAt:Date.now()};let conflict=false;
   request.onsuccess=()=>{if(revisionKey(request.result)!==expected){conflict=true;tx.abort();return;}store.put(record,'current');};
   tx.oncomplete=()=>{this.revision=revisionKey(record);resolve(record);};tx.onerror=tx.onabort=()=>reject(new Error(conflict?'Cửa sổ khác đã lưu phiên mới hơn. Phiên này chưa ghi đè bản đó.':'Không lưu được phiên (có thể hết dung lượng). Bản khôi phục trước vẫn được giữ.'));
  });
 }
}

export class SessionAutosave{
 constructor(capture,notify=()=>{},storage=new RecoveryStorage()){this.capture=capture;this.notify=notify;this.storage=storage;this.enabled=true;this.ready=false;this.blocked=false;this.generation=0;this.savedGeneration=0;this.savedSignature=null;this.error='';}
 get saved(){return this.ready&&this.enabled&&!this.blocked&&!this.error&&!this.running&&this.generation===this.savedGeneration;}
 get status(){return this.error?{mode:'error',label:'Phiên chưa được lưu',detail:this.error}:!this.ready?{mode:'pending',label:'Đang khôi phục phiên…'}:!this.enabled?{mode:'off',label:'Tự lưu đang tắt'}:this.saved?{mode:'saved',label:'Phiên đã lưu',detail:this.savedAt?new Date(this.savedAt).toLocaleString('vi-VN'):''}:{mode:'pending',label:'Đang tự lưu phiên…'};}
 async init(restore){try{const record=await this.storage.read();if(record!=null&&(typeof record!=='object'||Array.isArray(record)||!validId(record.revision)||typeof record.enabled!=='boolean'||!Number.isSafeInteger(record.savedAt)||record.savedAt<0||record.enabled&&record.snapshot!=null&&(typeof record.snapshot!=='object'||Array.isArray(record.snapshot))))throw new Error('Cấu trúc bản khôi phục không hợp lệ.');this.enabled=record?.enabled!==false;this.savedAt=record?.savedAt;return record?.snapshot&&this.enabled?await restore(record.snapshot):null;}catch(error){this.blocked=true;this.error='Không khôi phục được phiên đã lưu. '+error.message;return null;}finally{this.ready=true;this.notify(this.status);}}
 async prime(){
  if(!this.enabled||this.blocked)return;
  try{this.savedSignature=await fingerprint(JSON.stringify(await this.capture()));}
  catch(error){this.error=error.message;this.notify(this.status);}
 }
 schedule(){if(!this.ready)return;this.generation++;clearTimeout(this.timer);if(this.enabled&&!this.blocked)this.timer=setTimeout(()=>this.flush(),600);this.notify(this.status);}
 async flush(){
  clearTimeout(this.timer);if(!this.ready||!this.enabled||this.blocked)return false;if(this.running)return this.running;if(this.savedGeneration===this.generation)return true;
  this.running=Promise.resolve().then(async()=>{
   try{
    while(this.enabled&&!this.blocked&&this.savedGeneration!==this.generation){
     const generation=this.generation;
     let snapshot,signature;
     try{
      snapshot=await this.capture();
      signature=await fingerprint(JSON.stringify(snapshot));
     }catch(error){this.error=error.message;return false;}
     if(signature!==this.savedSignature){
      const record=await this.storage.write(snapshot,true);
      this.savedSignature=signature;
      this.savedAt=record.savedAt;
     }
     this.savedGeneration=generation;
     this.error='';
    }
    return true;
   }catch(error){this.blocked=true;this.error=error.message;return false;}
   finally{this.running=null;this.notify(this.status);}
  });
  return this.running;
 }
 async configure(enabled){
  clearTimeout(this.timer);const wasEnabled=this.enabled;this.enabled=false;if(this.running)await this.running;
  try{await this.storage.read();const generation=this.generation,snapshot=enabled?await this.capture():null,signature=enabled?await fingerprint(JSON.stringify(snapshot)):null,record=await this.storage.write(snapshot,enabled);this.savedSignature=signature;this.enabled=enabled;this.ready=true;this.blocked=false;this.error='';this.savedAt=record.savedAt;this.savedGeneration=generation;if(enabled&&generation!==this.generation)this.timer=setTimeout(()=>this.flush(),600);this.notify(this.status);return true;}catch(error){this.enabled=wasEnabled;this.blocked=true;this.error=error.message;this.notify(this.status);return false;}
 }
}
