import { t, getLanguage, setLanguage } from './locale.js';
import {SessionAutosave,encodeSession,decodeSession} from './session-recovery.js';
import {assertDataFields} from './data-limits.js';
import {readJSON} from './json-input.js';
import {fieldSelectionBinding,fieldSelectionPreview,unlinkFieldBindings,sourceSelectionRange} from './selection-fields.js';
import {sharedFieldSelect} from './shared-field-ui.js';
import {fillWorkspace,bindFillWorkspace,captureFillPosition} from './fill-workspace.js';
import {createWorkflow,travelWorkflow,checkWorkflow} from './fill-model.js';
import {quickWalkthrough,installWalkthroughs} from './quick-walkthrough.js';
import {headerRepairCandidate,isTextEditing,hasPendingChanges} from './usability.js';
import {applyDirectEdit} from './direct-edit.js';
import {checkpointEdit,travelEdit} from './edit-history.js';
import './style.css';
import './workspace.css';
import './bulk.css';
import './layout.css';
import './appearance.css';
import './responsive-workspace.css';
import {resolveFields,fieldKey,keyPattern,suggestedKey,discoverFields} from './data-fields.js';
import { topbar, workspace, fileTabs, ruleDiff, changesForRule, inlineComparison, visibleRules, libraryView, credit, welcome, esc } from './workbench.js';
import { configureDiff, getDiffOptions, inline } from './diff-view.js';
import { updateProfile,updateRuleBatch,addProfile,addRule } from './profile-tools.js';
import { compareDocuments,rebaseDocumentState } from './document-model.js';
import { groupRules } from './rule-filter.js';
import { TemplateLibrary } from './template-library.js';
import { lightningRules, isLightning, TYPE_INFO, MODE_NAMES, updateRuleMetadata, profileDefinitions } from './lightning.js';
import { SessionStore } from './session-store.js';
import { refreshValueEditor } from './value-editor.js';
import { createIcons, ArrowUpRight, ArrowDownToLine, ArrowLeft, ArrowRight, Upload, Plus, Search, SlidersHorizontal, FileCode2, Braces, LayoutGrid, CircleHelp, Sun, Moon, Monitor, X, Check, CheckCheck, ShieldCheck, ChevronRight, ChevronDown, Link2, Undo2, Redo2, Trash2, Pencil, FolderOpen, Copy, FileText, Settings2, AlertCircle, Command, MoreHorizontal, PanelRightClose, ExternalLink, CheckCircle2, RotateCcw, TextCursorInput, KeyRound, ListFilter, SquareCheck, Layers3, MousePointer2, Clock3, Globe2, Pin, TableProperties, Sparkles, Wrench, ArrowUp, ArrowDown } from 'lucide';
import { serializeCSV } from './csv-preserve.js';
import { decodeTemplateFile,restoreTextareaValue } from './file-text.js';
import {PROJECT_FILE_LIMIT,uid,openTemplate,units,occurrences,makeBinding,assertNoOverlap,renderTemplate,serializeProject,saveProject,loadProject,parseJS} from "./core.js";
installWalkthroughs();
const iconSet={ArrowUpRight,ArrowDownToLine,ArrowLeft,ArrowRight,Upload,Plus,Search,SlidersHorizontal,FileCode2,Braces,LayoutGrid,CircleHelp,Sun,Moon,Monitor,X,Check,CheckCheck,ShieldCheck,ChevronRight,ChevronDown,Link2,Undo2,Redo2,Trash2,Pencil,FolderOpen,Copy,FileText,Settings2,AlertCircle,Command,MoreHorizontal,PanelRightClose,ExternalLink,CheckCircle2,RotateCcw,TextCursorInput,KeyRound,ListFilter,SquareCheck,Layers3,MousePointer2,Clock3,Globe2,Pin,TableProperties,Sparkles,Wrench,ArrowUp,ArrowDown};
const i=name=>`<i data-lucide="${name}"></i>`;
const state={};const sessions=new SessionStore();
try{const saved=localStorage.getItem('fieldwork.diff');if(saved)configureDiff(JSON.parse(saved));}catch{}
const library=new TemplateLibrary();let templates=[],libraryError='',entrySequence=0;
const autosave=new SessionAutosave(()=>{captureActive();return encodeSession(sessions,entrySequence);},updateSessionStatus);
function updateSessionStatus(status=autosave.status){
 const button=document.querySelector('#session-save-status');if(button){button.textContent=status.label;button.dataset.mode=status.mode;button.title=[status.label,status.detail,t("Bấm để quản lý tự lưu và khôi phục","Manage autosave and recovery")].filter(Boolean).join(' · ');}
}
let theme='light',accent='#7c3aed';try{theme=localStorage.getItem('fieldwork.theme')||'light';const saved=localStorage.getItem('fieldwork.accent');if(/^#[0-9a-f]{6}$/i.test(saved||''))accent=saved;}catch{}
function applyTheme(){
 document.documentElement.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;
 document.documentElement.style.setProperty('--accent-base',accent);
 const rgb=accent.slice(1).match(/../g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),lum=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 document.documentElement.style.setProperty('--accent-ink',lum>.179?'#101827':'#ffffff');
 try{localStorage.setItem('fieldwork.theme',theme);localStorage.setItem('fieldwork.accent',accent);}catch{}
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(theme==='system')applyTheme();});
applyTheme();
function fresh(doc,fields, demo=false,options){fields=resolveFields(fields??discoverFields(doc).fields);const pins=options?.pinnedRuleIds??lightningRules(doc).filter(r=>fields.some(f=>f.bindings.some(b=>b.unitId===r.unitId||b.unitId===`${r.row}:2`||b.unitId===`${r.row}:3`))).map(r=>r.id);return{pinnedRuleIds:[...pins],doc,originalDoc:doc,fields,demo,drafts:new Map(),selected:units(doc)[0]?.id,query:'',ruleGroup:pins.length?'pinned':'data',profileFilter:profileDefinitions(doc)[0]?.id||'',sortBy:'source',sortDirection:'asc',groupBy:'type',selectedRuleIds:[],typeFilter:'',statusFilter:'',templateId:null,history:[],future:[],llmDraft:null,bulkDraft:null,workflow:null,catalogQuery:'',dirty:false,exported:false,page:'workspace',rawMode:false,rawVersion:'original',expanded:null,scroll:0,empty:false};}
function captureActive(){if(state.page==='fill')captureFillPosition(state);state.scroll=document.querySelector('.rule-scroll')?.scrollTop??state.scroll??0;sessions.capture({...state});}
function openDocument(doc,fields,demo=false,entry=false,options){if(state.doc)captureActive();const snapshot=fresh(doc,fields,demo,options);snapshot.entryLabel=entry?`Lượt ${++entrySequence}`:null;sessions.add(snapshot);Object.assign(state,snapshot,{restoreScroll:0});}
function switchDocument(id){captureActive();const snapshot=sessions.select(id);Object.assign(state,snapshot,{restoreScroll:snapshot.scroll||0,page:snapshot.page==='fill'?'fill':'workspace'});render();}
function closeDocument(id){captureActive();const item=sessions.items.find(d=>d.id===id);if(!item)return;const close=()=>{const wasActive=id===sessions.activeId;const next=sessions.remove(id);if(wasActive){Object.assign(state,next||fresh(openTemplate('','Chưa mở file.txt')),{restoreScroll:next?.scroll||0,empty:!next});}document.querySelector('#modal').close();render();};if(!item.snapshot.dirty&&!item.snapshot.workflow?.dirty)return close();modal(t("Đóng file đang chỉnh?","Close this file?"),esc(item.snapshot.doc.name),t("<p>File này có thay đổi chưa tải. Đóng tab chỉ gỡ phiên trong trình duyệt, không xóa file trên máy. Các file khác vẫn giữ nguyên.</p>","<p>File này có thay đổi chưa tải. Close tab chỉ gỡ phiên trong trình duyệt, không xóa file trên máy. Các file khác vẫn giữ nguyên.</p>"),t("<button id=\"confirm-close-file\" class=\"button primary\">Đóng file này</button>","<button id=\"confirm-close-file\" class=\"button primary\">Close this file</button>"));document.querySelector('#confirm-close-file').onclick=close;}
function checkpoint(){checkpointEdit(state);}
function undo(){if(state.page==='fill'){if(travelWorkflow(state.workflow,'undo')){try{checkWorkflow(state.doc,state.fields,state.workflow);}catch{}render();}return;}if(travelEdit(state,'undo')){render();toast(t("Đã hoàn tác.","Undone."));}}
function redo(){if(state.page==='fill'){if(travelWorkflow(state.workflow,'redo')){try{checkWorkflow(state.doc,state.fields,state.workflow);}catch{}render();}return;}if(travelEdit(state,'redo')){render();toast(t("Đã làm lại.","Redone."));}}
function toast(message){const box=document.querySelector('#toast');box.textContent=message;box.classList.add('visible');clearTimeout(window.toastTimeout);window.toastTimeout=setTimeout(()=>box.classList.remove('visible'),5000);}
function metrics(){
 const result=renderTemplate(state.doc,state.fields.filter(f=>f.bindings.length));
 try{const final=openTemplate(result.output,state.doc.name,state.doc.kind);result.changed=compareDocuments(state.originalDoc,final);}catch{}
 if(state.drafts.size)result.problems.push('Có mã/nguồn đang sửa chưa áp dụng. Mở phần chỉnh nâng cao và bấm Áp dụng.');
 return{result,bindings:state.fields.reduce((sum,f)=>sum+f.bindings.length,0)};
}
function render(saveSession=true){
 document.documentElement.lang=getLanguage();
 const scroll=state.restoreScroll??document.querySelector('.rule-scroll')?.scrollTop??state.scroll??0;delete state.restoreScroll;
 captureActive();
 const m=metrics();
 document.querySelector('#app').innerHTML=`${topbar(state,theme)}${fileTabs(sessions.items,sessions.activeId,templates)}${state.page==='library'?libraryView(templates,libraryError):state.page==='guide'?guide():state.empty?welcome():state.page==='fill'?fillWorkspace(state):workspace(state,m)}${credit()}<input id="file-input" type="file" multiple hidden accept=".txt,.csv,.tsv,.json,.js,.mjs,.cjs,.html,.css,.md,.xml,.yaml,.yml"><input id="project-input" type="file" hidden accept=".json"><div id="toast" class="toast" role="status"></div><dialog id="modal"></dialog>`;
 bindEvents();bindFillWorkspace(state,{render,removeField:id=>{checkpoint();state.fields=state.fields.filter(f=>f.id!==id);render();},moveField:(id,step)=>{const i=state.fields.findIndex(f=>f.id===id);if(i+step<0||i+step>=state.fields.length)return;checkpoint();[state.fields[i],state.fields[i+step]]=[state.fields[i+step],state.fields[i]];render();},editField:id=>fieldSettings(id,true),saveLibrary:()=>saveTemplateDialog(true),backup:async()=>{try{const project=await saveProject(state.doc,resolveFields(state.fields),false,{pinnedRuleIds:state.pinnedRuleIds});download(serializeProject(project),'bo-thiet-lap.fieldwork.json','application/json');}catch(error){toast(error.message);}},download,readFile:async file=>decodeTemplateFile(await file.arrayBuffer())});refreshIcons();const list=document.querySelector('.rule-scroll');if(list)list.scrollTop=scroll;if(saveSession!==false)autosave.schedule();updateSessionStatus();
}
function updateLivePreview(){
 const m=metrics(),rules=lightningRules(state.doc,state.fields);
 for(const r of rules){const card=document.querySelector(`[data-rule-unit="${r.unitId}"]`);if(!card)continue;const changed=changesForRule(state,m,r).length>0;card.classList.toggle('is-changed',changed);card.querySelector('.row-change-label').textContent=changed?t("Đã sửa","Edited"):'';card.querySelector('.rule-diff').innerHTML=ruleDiff(state,m,r);const pair=inlineComparison(state,m,r),original=card.querySelector('[data-original-value]');if(original){original.innerHTML=pair.original;original.classList.toggle('has-removal',pair.original.includes('<del>'));}}
 for(const el of document.querySelectorAll('[data-field]')){const f=state.fields.find(f=>f.id===el.dataset.field);if(f&&el!==document.activeElement)el.value=f.value;}
 for(const input of document.querySelectorAll('.live-diff-input'))refreshValueEditor(input);
 const validation=document.querySelector('#validation-title');if(validation){validation.classList.toggle('has-error',!!m.result.problems.length);validation.textContent=m.result.problems.length?`${m.result.problems.length} mục cần xử lý`:t("Cấu trúc đã kiểm tra · chưa kiểm chứng trên extension thật","File structure checked");}
 const errors=document.querySelector('#validation-errors');if(errors){errors.hidden=!m.result.problems.length;errors.innerHTML=`<summary>${t("Xem lỗi (","Review issues (")}${m.result.problems.length})</summary>`+m.result.problems.map(p=>`<p>${esc(p)}</p>`).join('');}
 const count=document.querySelector('#count-changed');if(count)count.textContent=rules.filter(r=>changesForRule(state,m,r).length).length;
 const status=document.querySelector('.document-state');if(status)status.textContent=state.dirty?t("Có thay đổi chưa tải","Undownloaded changes"):state.exported?t("Đã tải file","File downloaded"):t("Nguồn được giữ nguyên","Source file unchanged");
 const undo=document.querySelector('[data-action="undo"]');if(undo)undo.disabled=!state.history.length;const redo=document.querySelector('[data-action="redo"]');if(redo)redo.disabled=!state.future?.length;
 captureActive();autosave.schedule();refreshIcons();
}
function refreshIcons(){createIcons({icons:iconSet,attrs:{'stroke-width':1.7}});}
function assertNoDraft(unitIds){
 if(unitIds.some(id=>state.drafts?.has(id)))throw new Error('Áp dụng hoặc hoàn tác bản sửa mã/nguồn trước khi sửa giá trị trong cùng ô.');
}
function bindFieldInput(el){
 let captured=false;
 el.addEventListener('input',()=>{const field=state.fields.find(f=>f.id===el.dataset.field);try{assertNoDraft(field.bindings.map(b=>b.unitId));const value=restoreTextareaValue(field.value,el.value);if(!captured){checkpoint();captured=true;}field.value=value;state.dirty=true;state.exported=false;updateLivePreview();}catch(error){el.value=field.value;refreshValueEditor(el);toast(error.message);}});
}
function bindAutoInput(el,literal=false){
 let captured=false,committed=el.value;
 el.addEventListener('input',()=>{try{
   const [unitId,a,b]=literal?el.dataset.literal.split('|'):[el.dataset.unitEdit];
   assertNoDraft([unitId]);
   const unit=units(state.doc).find(u=>u.id===unitId);if(!unit)throw new Error('Không còn tìm thấy vị trí cần sửa.');
   const start=literal?Number(a):0,end=literal?Number(b):unit.value.length;
   const field=state.fields.find(f=>f.bindings.some(x=>x.unitId===unitId&&x.start===start&&x.end===end));
   if(field)assertNoDraft(field.bindings.map(b=>b.unitId));
   const oldValue=field?.value??(literal?makeBinding(state.doc,unitId,start,end).literalValue:unit.value),value=restoreTextareaValue(oldValue,el.value);
   const next=field?null:applyDirectEdit(state.doc,state.fields,{unitId,start,end,value});
   if(!captured){checkpoint();captured=true;}
   if(field)field.value=value;
   else{
    state.doc=next.doc;state.fields=next.fields;
    if(literal)for(const sibling of document.querySelectorAll('[data-literal]')){
     const [id,from,to]=sibling.dataset.literal.split('|');if(id!==unitId)continue;
     if(sibling===el)sibling.dataset.literal=[unitId,next.range.start,next.range.end].join('|');
     else if(Number(from)>=next.edit.end)sibling.dataset.literal=[id,Number(from)+next.edit.delta,Number(to)+next.edit.delta].join('|');
    }
   }
   committed=el.value;state.dirty=true;state.exported=false;updateLivePreview();
 }catch(error){el.value=committed;refreshValueEditor(el);toast(error.message);}});
}
async function importFiles(files){
 if(files.length+sessions.items.length>sessions.limit)return toast(`Tối đa ${sessions.limit} file đang mở.`);
 if(files.reduce((n,f)=>n+f.size,0)>50_000_000)return toast('Tổng file chọn vượt 50 MB. Hãy mở ít file hơn mỗi lần.');
 const results=await Promise.allSettled(files.map(async file=>{if(file.size>8_000_000)throw new Error(`${file.name}: vượt giới hạn 8 MB`);return openTemplate(decodeTemplateFile(await file.arrayBuffer()),file.name);}));
 if(results.filter(r=>r.status==='fulfilled').length+sessions.items.length>sessions.limit)return toast(`Không đủ tab trống sau khi đọc file. Tối đa ${sessions.limit} file; hãy đóng bớt tab rồi mở lại.`);
 const errors=[];let count=0;
 results.forEach((r,index)=>{try{if(r.status==='rejected')throw r.reason;openDocument(r.value);count++;}catch(error){errors.push(`${files[index].name}: ${error.message}`);}});
 render();if(errors.length){modal('Kết quả mở file',`Đã mở ${count} file; ${errors.length} file cần kiểm tra.`,errors.map(e=>`<p>${esc(e)}</p>`).join(''),'<button id="dismiss-import-report" class="button primary">Đã hiểu</button>');document.querySelector('#dismiss-import-report').onclick=()=>document.querySelector('#modal').close();}else toast(`Đã mở ${count} file. Chuyển tab để chỉnh từng file; nội dung không bị trộn.`);
}
function bindEvents(){
 document.querySelector('#language-picker').onchange=event=>{
   setLanguage(event.target.value);
   render();
   document.querySelector('#language-picker').focus();
 };
 const tabMenu=document.querySelector('.tab-create');if(tabMenu)tabMenu.addEventListener('toggle',()=>{if(!tabMenu.open)return;const r=tabMenu.querySelector('summary').getBoundingClientRect(),menu=tabMenu.querySelector(':scope > div');menu.style.left=Math.max(12,Math.min(r.left,innerWidth-312))+'px';menu.style.top=(r.bottom+5)+'px';menu.style.maxHeight=Math.max(120,innerHeight-r.bottom-20)+'px';});
 document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',e=>{e.preventDefault();action(el.dataset.action,el);}));
 document.querySelectorAll('[data-use-template]').forEach(el=>el.onclick=()=>useTemplate(el.dataset.useTemplate,el.dataset.entryProfile));
 document.querySelectorAll('[data-backup-template]').forEach(el=>el.onclick=()=>{const item=templates.find(t=>t.id===el.dataset.backupTemplate);try{download(serializeProject(item.project),item.name+'.fieldwork.json','application/json');}catch(error){toast(error.message);}});
 document.querySelectorAll('[data-delete-template]').forEach(el=>el.onclick=()=>deleteTemplateDialog(el.dataset.deleteTemplate));
 document.querySelectorAll('[data-rename-template]').forEach(el=>el.onclick=()=>renameTemplateDialog(el.dataset.renameTemplate));
 document.querySelectorAll('[data-document]').forEach(el=>el.onclick=()=>switchDocument(el.dataset.document));
 document.querySelectorAll('[data-close-document]').forEach(el=>el.onclick=()=>closeDocument(el.dataset.closeDocument));
 document.querySelectorAll('[data-rule-group]').forEach(el=>el.onclick=()=>{state.ruleGroup=el.dataset.ruleGroup;state.typeFilter='';state.restoreScroll=0;render();});
 document.querySelectorAll('[data-raw-version]').forEach(el=>el.onclick=()=>{state.rawVersion=el.dataset.rawVersion;render();});
 document.querySelector('#profile-filter')?.addEventListener('change',e=>{state.profileFilter=e.target.value;state.typeFilter='';state.selectedRuleIds=[];state.restoreScroll=0;render();});
 for(const [selector,key]of [['#type-filter','typeFilter'],['#status-filter','statusFilter'],['#sort-by','sortBy'],['#group-by','groupBy']])document.querySelector(selector)?.addEventListener('change',e=>{state[key]=e.target.value;state.restoreScroll=0;render();});
 document.querySelectorAll('[data-edit-unit]').forEach(el=>el.onclick=()=>{state.selected=el.dataset.editUnit;state.expanded=state.expanded===state.selected?null:state.selected;render();});
 for(const input of document.querySelectorAll('.live-diff-input')){
   const paint=()=>refreshValueEditor(input);input.addEventListener('scroll',()=>{const mirror=input.parentElement.querySelector('.value-mirror');mirror.scrollTop=input.scrollTop;mirror.scrollLeft=input.scrollLeft;});
   input.addEventListener('input',()=>requestAnimationFrame(paint));
   input.addEventListener('compositionstart',()=>input.parentElement.classList.add('is-composing'));
   input.addEventListener('compositionend',()=>{input.parentElement.classList.remove('is-composing');paint();});
 }
 const editor=document.querySelector('#content-editor');if(editor)editor.value=state.drafts.get(state.selected)??units(state.doc).find(u=>u.id===state.selected)?.value??'';
 let codeCheckpoint=false;editor?.addEventListener('input',()=>{const original=units(state.doc).find(u=>u.id===state.selected)?.value;try{const value=restoreTextareaValue(original,editor.value);if(!codeCheckpoint){checkpoint();codeCheckpoint=true;}if(value===original)state.drafts.delete(state.selected);else state.drafts.set(state.selected,value);}catch(error){editor.value=state.drafts.get(state.selected)??original;toast(error.message);return;}state.dirty=true;state.exported=false;updateLivePreview();});
 document.querySelectorAll('[data-field]').forEach(bindFieldInput);
 document.querySelectorAll('[data-unit-edit]').forEach(el=>bindAutoInput(el));
 document.querySelectorAll('[data-literal]').forEach(el=>bindAutoInput(el,true));

 document.querySelectorAll('[data-pin-rule]').forEach(el=>el.onclick=()=>{checkpoint();const pins=new Set(state.pinnedRuleIds);if(pins.has(el.dataset.pinRule))pins.delete(el.dataset.pinRule);else pins.add(el.dataset.pinRule);state.pinnedRuleIds=[...pins];render();});
 document.querySelectorAll('[data-configure-field]').forEach(button=>button.onclick=()=>configureFieldDialog(button.dataset.configureField,button.dataset.pieceIndex==null?undefined:Number(button.dataset.pieceIndex)));
 document.querySelectorAll('[data-select-rule]').forEach(el=>el.onchange=()=>{const ids=new Set(state.selectedRuleIds);if(el.checked)ids.add(el.dataset.selectRule);else ids.delete(el.dataset.selectRule);state.selectedRuleIds=[...ids];render();});
 document.querySelectorAll('[data-select-group]').forEach(el=>el.onclick=()=>{const group=groupRules(visibleRules(state,metrics()),state).find(g=>g.key===el.dataset.selectGroup);state.selectedRuleIds=[...new Set([...state.selectedRuleIds,...group.rules.map(r=>r.id)])];render();});
 document.querySelectorAll('[data-rule-settings]').forEach(el=>el.onclick=()=>ruleSettings(Number(el.dataset.ruleSettings)));
 document.querySelectorAll('[data-edit-field]').forEach(el=>el.onclick=()=>fieldSettings(el.dataset.editField));
 document.querySelectorAll('[data-unlink-field]').forEach(button=>button.onclick=()=>{try{const next=unlinkFieldBindings(state.fields,button.dataset.unlinkField,button.dataset.unlinkUnit);checkpoint();state.fields=next;render();toast('Đã xoá trường khỏi ô này. Bấm Hoàn tác để khôi phục.');}catch(error){toast(error.message);}});
 document.querySelectorAll('[data-remove-field]').forEach(el=>el.onclick=()=>{checkpoint();state.fields=state.fields.filter(f=>f.id!==el.dataset.removeField);render();});
 const search=document.querySelector('#search');search?.addEventListener('input',()=>{const pos=search.selectionStart;state.query=search.value;state.restoreScroll=0;render();const next=document.querySelector('#search');next.focus();next.setSelectionRange(pos,pos);});
 document.querySelector('#file-input').onchange=e=>{const files=Array.from(e.target.files);if(files.length)importFiles(files);};
 document.querySelector('#project-input').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>PROJECT_FILE_LIMIT)throw new Error('File cách điền vượt 12 MB.');const loaded=await loadProject(readJSON(decodeTemplateFile(await f.arrayBuffer()).replace(/^\uFEFF/,'')));openDocument(loaded.doc,loaded.fields,false,false,loaded.options);render();toast('Đã mở cách điền trong tab mới.');}catch(error){toast(error.message);}};
}
function action(key,element){
 document.querySelectorAll('.app-menu[open],.view-options[open]').forEach(menu=>menu.open=false);
 if(key==='repair-header')repairHeaderDialog();
 if(key==='theme')themeDialog();
 if(key==='session-settings')sessionDialog();
 if(key==='open-fill')openFill();
 if(key==='bulk-fill')openFill();
 if(key==='field-list')fieldListDialog();
 if(key==='llm-normalize')llmDialog();
 if(key==='diff-settings')diffDialog();
 if(key==='profile-settings')profileDialog(element?.dataset.profileField);
 if(key==='add-profile')newProfileDialog();
 if(key==='add-rule')newRuleDialog();
 if(key==='move-rules')batchDialog('profile');
 if(key==='batch-mode')batchDialog('mode');
 if(key==='clear-selection'){state.selectedRuleIds=[];render();}
 if(key==='reverse-sort'){state.sortDirection=state.sortDirection==='desc'?'asc':'desc';state.restoreScroll=0;render();}
 if(key==='library'){state.page='library';render();refreshLibrary();}
 if(key==='save-template')saveTemplateDialog();
 if(key==='new-entry')newEntry();
 if(key==='workspace'||key==='guide'){state.page=key;render();}
 if(key==='import')document.querySelector('#file-input').click();
 if(key==='load-project')document.querySelector('#project-input').click();
 if(key==='save-project')projectDialog();
 if(key==='undo')undo();
 if(key==='redo')redo();
 if(key==='clear-search'){state.query='';state.typeFilter='';state.statusFilter='';state.restoreScroll=0;render();}
 if(key==='toggle-raw'){state.rawMode=!state.rawMode;render();}
 if(key==='download-raw'){const original=state.rawVersion!=='output';download(original?(state.originalDoc.bom?'\uFEFF':'')+state.originalDoc.source:metrics().result.output,`${original?'original':'edited'}-${state.doc.name}`,'text/plain;charset=utf-8');}
 if(key==='reopen-format')openImportDialog(state.doc.name,(state.doc.bom?'\uFEFF':'')+state.doc.source);
 if(key==='create-field')createField(false);
 if(key==='bind-whole')createField(true);
 if(key==='edit-source')editSource();
 if(key==='discard-draft'&&state.drafts.has(state.selected)){checkpoint();state.drafts.delete(state.selected);render();toast('Đã bỏ bản nháp; nguồn và giá trị đang điền được giữ nguyên. Có thể Hoàn tác.');}
 if(key==='export')exportDialog();

}
function pinFieldRules(field){state.pinnedRuleIds=[...new Set([...state.pinnedRuleIds,...lightningRules(state.doc).filter(r=>field.bindings.some(b=>b.unitId===r.unitId||b.unitId===`${r.row}:2`||b.unitId===`${r.row}:3`)).map(r=>r.id)])];}
function configureFieldDialog(ruleId,pieceIndex,keepPartial=false){
 const rule=lightningRules(state.doc,state.fields).find(r=>r.id===ruleId);if(!rule)return;
 if(state.drafts.has(rule.unitId))return toast('Áp dụng bản sửa nội dung trước khi chọn trường.');
 const code=rule.type==='4'||rule.constants.length,rawCode=code&&!rule.constants.length;
 const piece=code?rule.constants[pieceIndex??0]:null;
 const scopeStart=piece?.start??0,scopeEnd=piece?.end??rule.value.length,source=rule.value.slice(scopeStart,scopeEnd);
 let assigned=state.fields.flatMap(f=>f.bindings.filter(b=>b.unitId===rule.unitId&&b.start<scopeEnd&&b.end>scopeStart));
 let partial=keepPartial||rawCode||assigned.length>0,range={start:0,end:0};
 const label=piece?piece.name:assigned.length?'':rule.title.startsWith('Chưa')?'':rule.title;
 modal('Chọn trường dữ liệu','Bôi đen một đoạn hoặc dùng cả ô, đặt tên rồi lưu.',`${code&&rule.constants.length?`<label class="label" for="field-piece">Chuỗi trong code cần thay</label><select id="field-piece">${rule.constants.map((c,i)=>`<option value="${i}" ${i===(pieceIndex??0)?'selected':''}>${esc(c.name)} = ${esc(c.value.slice(0,80))}</option>`).join('')}</select>`:''}<div class="field-pick-modes" role="group" aria-label="Phạm vi tạo trường"><button type="button" id="pick-whole" ${rawCode||assigned.length?'disabled':''} aria-pressed="${!partial}">Toàn bộ nội dung</button><button type="button" id="pick-part" aria-pressed="${partial}">Chỉ đoạn bôi đen</button></div><label class="label" for="field-pick-source">Nội dung gốc · ${esc(rule.id)}</label><textarea id="field-pick-source" class="field-pick-source" rows="${Math.min(7,Math.max(2,source.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/76)),0)))}" readonly spellcheck="false" aria-describedby="field-pick-status">${esc(source)}</textarea><p id="field-pick-status" class="helper" role="status"></p><div id="picker-assigned">${fieldSelectionPreview(rule.value,state.fields,rule.unitId,scopeStart,scopeEnd)}</div><div class="field-pick-details"><label class="label" for="quick-label">Tên trường</label><input id="quick-label" value="${esc(label)}" placeholder="Ví dụ: Tên thí sinh"><details class="field-pick-options"><summary>Mã cột & tuỳ chọn <code id="picker-key-summary">${esc(label?suggestedKey(label):'tự tạo từ tên')}</code></summary><label class="label" for="quick-key">Mã cột trong bảng</label><input id="quick-key" value="${esc(label?suggestedKey(label):'')}" placeholder="field:full_name"><label class="label" for="key-preset">Mã HSK thông dụng</label><select id="key-preset"><option value="">Tự đặt mã ở trên</option>${[['full_name','Họ và tên'],['email','Email'],['phone','Số điện thoại'],['id_number','CCCD / giấy tờ'],['birth_date','Ngày sinh'],['file_name','Tên ảnh'],['bank','Ngân hàng'],['account_number','Số tài khoản']].map(([k,l])=>`<option value="hsk:${k}">${l} · hsk:${k}</option>`).join('')}</select>${sharedFieldSelect(resolveFields(state.fields))}</details></div>`, t("<button class=\"button secondary\" id=\"save-next-field\">Lưu & thêm tiếp</button><button class=\"button primary\" id=\"save-quick-field\">Lưu trường</button>","<button class=\"button secondary\" id=\"save-next-field\">Save & thêm tiếp</button><button class=\"button primary\" id=\"save-quick-field\">Save trường</button>"));
 document.querySelector('#modal').classList.add('field-picker-modal');
 const dialog=document.querySelector('#modal');document.querySelector('#cancel-modal').textContent=t("Đóng","Close");
 dialog.onclose=()=>{if(dialog.dataset.fieldPickerDirty&&dialog.isConnected)render();};
 const input=document.querySelector('#field-pick-source'),status=document.querySelector('#field-pick-status');
 input.value=source;
 const keySummary=()=>{document.querySelector('#picker-key-summary').textContent=document.querySelector('#quick-key').value||'tự tạo từ tên';};
 const bindUnlink=()=>document.querySelectorAll('[data-picker-unlink]').forEach(button=>button.onclick=()=>{try{
  const next=unlinkFieldBindings(state.fields,button.dataset.pickerUnlink,rule.unitId,{start:Number(button.dataset.bindingStart),end:Number(button.dataset.bindingEnd)});checkpoint();state.fields=next;dialog.dataset.fieldPickerDirty='1';
  assigned=state.fields.flatMap(f=>f.bindings.filter(b=>b.unitId===rule.unitId&&b.start<scopeEnd&&b.end>scopeStart));
  document.querySelector('#picker-assigned').innerHTML=fieldSelectionPreview(rule.value,state.fields,rule.unitId,scopeStart,scopeEnd);document.querySelector('#pick-whole').disabled=!!rawCode||assigned.length>0;
  const existing=document.querySelector('#quick-existing'),selected=existing.value;existing.innerHTML=t("<option value=\"\">Tạo trường riêng cho ô này</option>","<option value=\"\">Create a separate field</option>")+state.fields.map(f=>`<option value="${esc(f.id)}">${esc(f.label)} · ${esc(f.key)}</option>`).join('');existing.disabled=!state.fields.length;existing.value=state.fields.some(f=>f.id===selected)?selected:'';existing.dispatchEvent(new Event('change'));bindUnlink();update();toast('Đã xoá đoạn đã gán. Có thể Hoàn tác sau khi đóng.');
 }catch(error){modalError(error);}});

 const update=()=>{document.querySelector('#pick-whole').setAttribute('aria-pressed',String(!partial));document.querySelector('#pick-part').setAttribute('aria-pressed',String(partial));document.querySelector('#save-quick-field').textContent='Lưu trường';document.querySelector('#save-next-field').hidden=!partial;
  if(!partial){status.textContent='Sẽ dùng toàn bộ nội dung.';return;}
  try{const selected=fieldSelectionBinding(state.doc,state.fields,{unitId:rule.unitId,scopeStart,scopeEnd,...range});status.textContent=`Đã chọn ${range.end-range.start} ký tự: ${selected.value.slice(0,140)}${selected.value.length>140?'…':''}`;status.classList.remove('is-error');}catch(error){status.textContent=error.message;status.classList.toggle('is-error',range.end>range.start);}
 };
 for(const event of ['select','keyup','pointerup'])input.addEventListener(event,()=>{range=sourceSelectionRange(source,input.selectionStart,input.selectionEnd);if(range.end>range.start)partial=true;update();});
 document.querySelector('#pick-whole').onclick=()=>{partial=false;update();};document.querySelector('#pick-part').onclick=()=>{partial=true;update();input.focus();};
 document.querySelector('#field-piece')?.addEventListener('change',e=>configureFieldDialog(ruleId,Number(e.target.value)));
 document.querySelector('#key-preset').onchange=e=>{if(e.target.value){document.querySelector('#quick-key').value=e.target.value;document.querySelector('#quick-label').value=e.target.selectedOptions[0].textContent.split(' · ')[0];keySummary();}};
 let keyEdited=false;document.querySelector('#quick-key').oninput=()=>{keyEdited=true;keySummary();};document.querySelector('#quick-label').oninput=e=>{if(!keyEdited&&!document.querySelector('#key-preset').value)document.querySelector('#quick-key').value=suggestedKey(e.target.value);keySummary();};
 document.querySelector('#quick-existing').onchange=e=>{for(const id of ['#quick-label','#quick-key','#key-preset'])document.querySelector(id).disabled=!!e.target.value;};
 const save=again=>{try{
  const label=document.querySelector('#quick-label').value.trim(),key=fieldKey(document.querySelector('#quick-key').value),existing=state.fields.find(f=>f.id===document.querySelector('#quick-existing').value);
  if(!existing&&(!label||!keyPattern.test(key)))throw new Error('Nhập tên dễ đọc và mã dạng hsk:email hoặc field:email.');
  const {binding,value}=fieldSelectionBinding(state.doc,state.fields,{unitId:rule.unitId,scopeStart,scopeEnd,...range,whole:!partial});
  const field=existing?{...existing,bindings:[...existing.bindings,binding]}:{id:uid(),key,label,value,type:/:email$/.test(key)?'email':/:birth_date$/.test(key)?'date':'text',transform:'none',required:true,bindings:[binding]};
  if(!existing)assertDataFields([...state.fields,field]);
  const next=resolveFields(existing?state.fields.map(f=>f.id===existing.id?field:f):[...state.fields,field]);
  checkpoint();state.fields=next;pinFieldRules(field);document.querySelector('#modal').close();render();
  if(again)configureFieldDialog(ruleId,pieceIndex,true);
  toast(`${field.label}: đã gán đúng ${partial?'đoạn đã chọn':'toàn bộ ô'}.`);
 }catch(error){modalError(error);}};
 document.querySelector('#save-quick-field').onclick=()=>save(false);document.querySelector('#save-next-field').onclick=()=>save(true);bindUnlink();update();
}
function repairHeaderDialog(){
 const issue=headerRepairCandidate(state.doc.rows);if(!issue)return;
 modal('Sửa khai báo profile','Chỉ bỏ phần thừa trước khai báo profile ở ô đầu tiên. Xem lại trước khi áp dụng.',`<div class="repair-comparison"><label>Hiện tại<pre>${esc(issue.before)}</pre></label><label>Sau khi sửa<pre>${esc(issue.after)}</pre></label></div><p>Không ghi đè file trên máy. Có thể ${t("Hoàn tác","Undo")} sau khi áp dụng.</p>`,t("<button class=\"button primary\" id=\"apply-header-repair\">Áp dụng sửa đầu file</button>","<button class=\"button primary\" id=\"apply-header-repair\">Apply sửa đầu file</button>"));
 document.querySelector('#apply-header-repair').onclick=()=>{try{const rows=state.doc.rows.map(row=>[...row]);rows[0][0]=issue.after;const next=openTemplate((state.doc.bom?'\uFEFF':'')+serializeCSV(state.doc,rows),state.doc.name,'csv');checkpoint();const rebased=rebaseDocumentState(state.doc,next,state.fields,state.drafts);state.doc=next;state.fields=rebased.fields;state.drafts=rebased.drafts;state.profileFilter=profileDefinitions(next)[0]?.id||'';document.querySelector('#modal').close();render();toast('Đã sửa khai báo profile. Rule và dữ liệu được giữ nguyên.');}catch(error){modalError(error);}};
}
function openFill(stage){if(state.drafts.size)return toast('Áp dụng bản nháp code trước khi điền danh sách.');state.workflow??=createWorkflow();if(stage)state.workflow.stage=stage;else if(state.workflow.stage==='fields'&&state.fields.length&&!state.workflow.data)state.workflow.stage='input';state.page='fill';document.querySelector('#modal')?.close();render();const body=document.querySelector('#wf-body');if(body)body.scrollTop=state.workflow.scroll||0;}
function fieldListDialog(){openFill('fields');}
function llmDialog(){state.workflow??=createWorkflow();state.workflow.mode='ai';openFill('input');}

function guide(){return `<main class="guide"><h1>Thiết lập một lần, điền cho nhiều người</h1><ol><li><strong>${t("Mở template","Open template")}.</strong> Dùng file export của Lightning Autofill hoặc template của bạn.</li><li><strong>Bấm Thiết lập điền → ${t("Chọn","Select")} thông tin.</strong> Thêm Họ tên, Email… và chọn ô cần thay trong template. Mã cột được gợi ý từ tên; có thể tự sửa. Dùng một thông tin cho nhiều ô nếu nội dung cần giống nhau.</li><li><strong>Chuẩn bị danh sách.</strong> Nếu đã có CSV/TSV/JSON, chuyển thẳng đến Điền danh sách. Nếu dữ liệu lộn xộn, vào Chuẩn hoá với AI, sao chép prompt, gửi dữ liệu cho AI rồi dán kết quả để kiểm tra.</li><li><strong>Điền danh sách.</strong> Ghép cột, kiểm tra từng người rồi tải ZIP. Mỗi người có một file để import vào Lightning Autofill.</li></ol><h2>Ba loại file tải xuống</h2><ul><li><strong>Bảng nhập mẫu (.csv):</strong> các cột thông tin để bạn nhập danh sách người.</li><li><strong>Bộ thiết lập (.json):</strong> template gốc +${t(" vị trí"," locations")} điền + quy tắc. Dùng để sao lưu hoặc chuyển máy, mở lại bằng Mở bộ thiết lập.</li><li><strong>Kết quả (.zip / file template):</strong> dữ liệu đã điền, dùng để import vào Lightning Autofill.</li></ul><p>${t("Lưu vào thư viện","Save to library")} nếu dùng lại trên cùng trình duyệt. Menu + mở lượt mới. ${t("Hoàn tác","Undo")}/${t("Làm lại","Redo")} nằm cạnh tên file; mỗi tab có lịch sử riêng. Các vị trí chưa chọn vẫn giữ dữ liệu trong template.</p><p>AI có thể hiểu sai nguồn; hãy đối chiếu thông tin từng người. Fieldwork kiểm tra cấu trúc, email, ngày và quy tắc có thể kiểm tra được; không tự gửi dữ liệu đến AI hoặc chạy script.</p><button class="button primary" data-action="workspace">Quay lại chỉnh sửa</button></main>`;}

function applyDocument(next){
 const rebased=rebaseDocumentState(state.doc,next,state.fields,state.drafts);
 checkpoint();state.doc=next;state.fields=rebased.fields;state.drafts=rebased.drafts;
 state.selected=rebased.mapping.get(state.selected)||units(next)[0]?.id;
 state.expanded=state.expanded?rebased.mapping.get(state.expanded)||null:null;
}
function profileOptions(selected=''){
 return '<option value="">Unfiled</option>'+profileDefinitions(state.doc).map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)} (${esc(p.id)})</option>`).join('');
}
function profileDialog(focus='profile-name'){
 const profiles=profileDefinitions(state.doc);if(!profiles.length)return newProfileDialog();
 const selected=profiles.some(p=>p.id===state.profileFilter)?state.profileFilter:profiles[0].id;
 modal('Cấu hình profile','Site và phím tắt dùng chung cho các rule thuộc profile. Rule có Site riêng sẽ ưu tiên Site riêng.',`<label class="label" for="edit-profile-id">Profile</label><select id="edit-profile-id">${profiles.map(p=>`<option value="${esc(p.id)}" ${p.id===selected?'selected':''}>${esc(p.name)} (${esc(p.id)})</option>`).join('')}</select><label class="label" for="profile-name">Tên profile</label><input id="profile-name"><label class="label" for="profile-site">Site kích hoạt</label><textarea id="profile-site" class="metadata-textarea" rows="2" placeholder="${t("Trống","Empty")} = mọi trang"></textarea><label class="label" for="profile-hotkey">Phím tắt kích hoạt trong Lightning</label><input id="profile-hotkey" placeholder="Ví dụ: Ctrl + Q"><p class="helper">ID profile được giữ nguyên. Ứng dụng không đăng ký phím tắt hoặc thực thi profile.</p>`,t("<button class=\"button primary\" id=\"apply-profile\">Áp dụng profile</button>","<button class=\"button primary\" id=\"apply-profile\">Apply profile</button>"));
 let initial;const load=()=>{const p=profiles.find(p=>p.id===document.querySelector('#edit-profile-id').value);document.querySelector('#profile-name').value=p.name;document.querySelector('#profile-site').value=p.site;document.querySelector('#profile-hotkey').value=p.hotkey;initial=Object.fromEntries(['name','site','hotkey'].map(key=>[key,document.querySelector('#profile-'+key).value]));};load();document.querySelector('#edit-profile-id').onchange=load;document.getElementById(focus)?.focus();
 document.querySelector('#apply-profile').onclick=()=>{try{const id=document.querySelector('#edit-profile-id').value,profile=profiles.find(p=>p.id===id),patch=Object.fromEntries(['name','site','hotkey'].flatMap(key=>{const value=document.querySelector('#profile-'+key).value;return value===initial[key]?[]:[[key,key==='site'?restoreTextareaValue(profile.site,value):value]];}));if(!Object.keys(patch).length){document.querySelector('#modal').close();return;}const next=updateProfile(state.doc,id,patch);applyDocument(next);state.profileFilter=id;document.querySelector('#modal').close();render();toast('Đã cập nhật cấu hình dùng chung của profile.');}catch(error){modalError(error);}};
}
function newProfileDialog(){
 if(!isLightning(state.doc))return toast('Mở file export Lightning trước khi thêm profile.');
 modal(t("Thêm profile","Add profile"),'Thêm vào file hiện tại; giữ nguyên các profile, rule và Settings khác.',`<label class="label" for="profile-name">Tên profile</label><input id="profile-name" placeholder="Ví dụ: Kỳ thi tháng 12"><label class="label" for="profile-site">Site kích hoạt</label><textarea id="profile-site" class="metadata-textarea" rows="2" placeholder="${t("Trống","Empty")} = mọi trang"></textarea><label class="label" for="profile-hotkey">Phím tắt trong Lightning</label><input id="profile-hotkey" placeholder="Ví dụ: Ctrl + Shift + K">`,t("<button class=\"button primary\" id=\"create-profile\">Thêm profile</button>","<button class=\"button primary\" id=\"create-profile\">Add profile</button>"));
 document.querySelector('#create-profile').onclick=()=>{try{const next=addProfile(state.doc,{name:document.querySelector('#profile-name').value,site:document.querySelector('#profile-site').value,hotkey:document.querySelector('#profile-hotkey').value});applyDocument(next.doc);state.profileFilter=next.id;state.selectedRuleIds=[];state.restoreScroll=0;document.querySelector('#modal').close();render();toast('Đã thêm profile. Chọn Thêm rule để cấu hình.');}catch(error){modalError(error);}};
}
function newRuleDialog(){
 if(!isLightning(state.doc))return toast('Mở file Lightning trước khi thêm rule.');
 const selected=state.profileFilter==='__unfiled__'?'':profileDefinitions(state.doc).some(p=>p.id===state.profileFilter)?state.profileFilter:profileDefinitions(state.doc)[0]?.id||'';
 modal(t("Thêm rule","Add rule"),'ID được tạo tự động, không trùng. Rule mới được thêm cuối vùng Rules, giữ thứ tự thực thi của các rule cũ.',`<div class="form-row"><div><label class="label" for="new-rule-type">Type</label><select id="new-rule-type">${Object.entries(TYPE_INFO).map(([type,info])=>`<option value="${type}">${type} · ${esc(info.label)}</option>`).join('')}</select></div><div><label class="label" for="new-rule-profile">Profile</label><select id="new-rule-profile">${profileOptions(selected)}</select></div></div><label class="label" for="new-rule-name">Name · đích / tham số</label><textarea id="new-rule-name" class="metadata-textarea" placeholder='Ví dụ: /^EMAIL$/i hoặc //input[@name="email"]'></textarea><label class="label" for="new-rule-value">Value · nội dung / code</label><textarea id="new-rule-value" class="metadata-textarea" spellcheck="false"></textarea><div class="form-row"><div><label class="label" for="new-rule-mode">Mode · Text / Password</label><select id="new-rule-mode">${MODE_NAMES.map((name,i)=>`<option value="${i}">${i} · ${esc(name)}</option>`).join('')}</select></div><div><label class="label" for="new-rule-site">Site riêng (tùy chọn)</label><textarea id="new-rule-site" class="metadata-textarea" rows="2" placeholder="${t("Trống","Empty")} = kế thừa profile"></textarea></div></div><p class="helper" id="new-rule-help"></p><details><summary class="helper">Type khác của extension</summary><label class="label" for="new-rule-custom-type">Mã Type từ file export thực tế</label><input id="new-rule-custom-type" inputmode="numeric" placeholder="Chỉ dùng khi đã biết chính xác mã"><p class="helper">Giữ mã nguyên văn; ứng dụng không tự đoán loại action của phiên bản khác.</p></details>`,t("<button class=\"button primary\" id=\"create-rule\">Thêm rule vào file</button>","<button class=\"button primary\" id=\"create-rule\">Add rule vào file</button>"));
 const refresh=()=>{const type=document.querySelector('#new-rule-type').value;document.querySelector('#new-rule-mode').disabled=!['0','1'].includes(type);document.querySelector('#new-rule-help').textContent=TYPE_INFO[type].description+(Number(type)>=5?' Mapping action legacy, cần kiểm tra với phiên bản Lightning đang dùng.':'');};refresh();document.querySelector('#new-rule-type').onchange=refresh;
 document.querySelector('#create-rule').onclick=()=>{try{
   const type=document.querySelector('#new-rule-custom-type').value.trim()||document.querySelector('#new-rule-type').value,name=document.querySelector('#new-rule-name').value,value=document.querySelector('#new-rule-value').value;
   if(['0','1','2','3','6'].includes(type)&&!name.trim())throw new Error('Nhập Name để xác định đúng đích tác động.');
   if(type==='4'){try{parseJS(value);}catch(error){throw new Error('JavaScript chưa hợp lệ: '+error.message);}}
   const next=addRule(state.doc,{type,name,value,profile:document.querySelector('#new-rule-profile').value,site:document.querySelector('#new-rule-site').value,mode:document.querySelector('#new-rule-mode').value});applyDocument(next.doc);
   state.profileFilter=document.querySelector('#new-rule-profile').value||'__unfiled__';state.query='';state.typeFilter='';state.statusFilter='';state.ruleGroup=['0','1','2','3'].includes(type)?'data':'automation';state.selectedRuleIds=[];document.querySelector('#modal').close();render();
   const card=[...document.querySelectorAll('[data-rule-unit]')].find(el=>el.querySelector('[data-select-rule]')?.dataset.selectRule===next.id);card?.scrollIntoView({block:'nearest'});toast(`Đã thêm ${next.id}. Rule nằm cuối vùng Rules trong file.`);
 }catch(error){modalError(error);}};
}
function batchDialog(kind){
 const ids=state.selectedRuleIds||[];if(!ids.length)return;
 const applicable=lightningRules(state.doc).filter(r=>ids.includes(r.id)&&['0','1'].includes(r.type)).length;
 if(kind==='mode'&&!applicable)return toast('Mode chỉ áp dụng Text và Password trong nhóm đã chọn.');
 modal(kind==='profile'?'Chuyển các rule sang profile':'Đổi Mode cho nhóm',kind==='profile'?`${ids.length} rule được chuyển, giữ ID và nội dung. Không sao chép hoặc sắp lại rule.`:`Áp dụng cho ${applicable} Text/Password. Các loại khác giữ nguyên.`,kind==='profile'?`<label class="label" for="batch-target">Profile đích</label><select id="batch-target">${profileOptions()}</select>`:`<label class="label" for="batch-target">Mode</label><select id="batch-target">${MODE_NAMES.map((name,i)=>`<option value="${i}">${i} · ${esc(name)}</option>`).join('')}</select>`,t("<button class=\"button primary\" id=\"apply-batch\">Áp dụng cho nhóm</button>","<button class=\"button primary\" id=\"apply-batch\">Apply cho nhóm</button>"));
 document.querySelector('#apply-batch').onclick=()=>{try{const target=document.querySelector('#batch-target').value,next=updateRuleBatch(state.doc,ids,kind==='profile'?{profile:target}:{mode:target});applyDocument(next.doc);if(kind==='profile')state.profileFilter=target||'__unfiled__';state.selectedRuleIds=[];document.querySelector('#modal').close();render();toast(`Đã cập nhật ${next.affected} rule.`);}catch(error){modalError(error);}};
}
function diffDialog(){
 const options=getDiffOptions();
 modal(t("Cách hiển thị diff","Diff settings"),'Chỉ thay màu đánh dấu, không sửa dữ liệu hoặc file xuất.',`<label class="label" for="diff-mode">Cách so sánh</label><select id="diff-mode">${[['smart','Thông minh · bỏ các ký tự trùng rời rạc'],['detail','Chi tiết từng ký tự'],['whole','Đánh dấu cả giá trị khi khác']].map(([value,label])=>`<option value="${value}" ${options.mode===value?'selected':''}>${label}</option>`).join('')}</select><div class="form-row"><div><label class="label" for="diff-min">Đoạn trùng tối thiểu (ký tự)</label><input id="diff-min" type="number" min="1" max="12" value="${options.minMatch}"></div><div><label class="label" for="diff-similarity">Tỷ lệ giống tối thiểu (%)</label><input id="diff-similarity" type="number" min="0" max="100" value="${Math.round(options.similarity*100)}"></div></div><p class="helper">Mặc định 3${t(" ký tự"," characters")} và 55%. Nếu thay gần như cả giá trị, tô cả ô. Thêm hậu tố vào chuỗi cũ vẫn chỉ tô hậu tố.</p><div id="diff-example" class="diff-example"></div>`,t("<button class=\"button primary\" id=\"apply-diff\">Áp dụng diff</button>","<button class=\"button primary\" id=\"apply-diff\">Apply diff</button>"));
 const read=()=>({mode:document.querySelector('#diff-mode').value,minMatch:Math.min(12,Math.max(1,Number(document.querySelector('#diff-min').value)||3)),similarity:Math.min(1,Math.max(0,Number(document.querySelector('#diff-similarity').value)/100))});
 const preview=()=>{const mode=read();for(const id of ['#diff-min','#diff-similarity'])document.querySelector(id).disabled=mode.mode!=='smart';const[a,b]=inline('TENTHISINHHHHH','Nguyen Thanh Minh',mode);document.querySelector('#diff-example').innerHTML=`<span>Ví dụ</span><div><pre>${a}</pre><pre>${b}</pre></div>`;};preview();for(const id of ['#diff-mode','#diff-min','#diff-similarity'])document.querySelector(id).oninput=preview;
 document.querySelector('#apply-diff').onclick=()=>{const next=configureDiff(read());try{localStorage.setItem('fieldwork.diff',JSON.stringify(next));}catch{}document.querySelector('#modal').close();render();};
}
function themeDialog(){
 const colors=[['#7c3aed','Tím'],['#2563eb','Xanh dương'],['#0d9488','Xanh ngọc'],['#e11d48','Hồng'],['#ea580c','Cam']];
 modal('Theme','Chọn giao diện và màu nhấn. Thay đổi áp dụng ngay trên trình duyệt này.',`<fieldset class="theme-modes"><legend>Giao diện</legend>${[['light',t("Sáng","Light")],['dark',t("Tối","Dark")],['system','Theo máy']].map(([value,label])=>`<label><input type="radio" name="theme-mode" value="${value}" ${theme===value?'checked':''}>${label}</label>`).join('')}</fieldset><label class="label">${t("Màu nhấn","Accent color")}</label><div class="accent-presets">${colors.map(([value,label])=>`<button class="accent-choice" data-accent="${value}" aria-label="Accent ${label}" aria-pressed="${accent===value}" style="--swatch:${value}"><span></span>${label}</button>`).join('')}</div><label class="label" for="custom-accent">Hoặc chọn màu riêng</label><div class="custom-accent"><input id="custom-accent" type="color" value="${accent}"><output id="accent-hex">${accent}</output></div><p class="helper">Màu diff luôn dùng đỏ − và xanh + để phân biệt nội dung cũ/mới.</p>`,'');
 document.querySelector('#cancel-modal').textContent='Xong';
 document.querySelectorAll('[name="theme-mode"]').forEach(el=>el.onchange=()=>{theme=el.value;applyTheme();});
 const changeAccent=value=>{accent=value;applyTheme();document.querySelector('#custom-accent').value=accent;document.querySelector('#accent-hex').textContent=accent;document.querySelectorAll('[data-accent]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.accent===accent)));};
 document.querySelectorAll('[data-accent]').forEach(el=>el.onclick=()=>changeAccent(el.dataset.accent));
 document.querySelector('#custom-accent').oninput=e=>changeAccent(e.target.value);
}
async function refreshLibrary(){
 try{templates=await library.list();libraryError='';}catch(error){libraryError=error.message;}
 if(state.page==='library')render();
}
async function useTemplate(id,profileId=''){
 try{const item=templates.find(t=>t.id===id);if(!item)throw new Error('Template không còn trong thư viện.');const loaded=await loadProject(item.project);openDocument(loaded.doc,loaded.fields,false,true,loaded.options);state.templateId=id;if(profileDefinitions(state.doc).some(p=>p.id===profileId))state.profileFilter=profileId;render();toast('Đã tạo lượt điền độc lập. Template trong thư viện được giữ nguyên.');}catch(error){toast(error.message);}
}
async function newEntry(){
 if(state.drafts.size)return toast('Áp dụng bản nháp trước khi tạo lượt điền mới.');
 try{const currentProfile=state.profileFilter,templateId=state.templateId,project=await saveProject(state.doc,resolveFields(state.fields),false,{pinnedRuleIds:state.pinnedRuleIds}),loaded=await loadProject(project);openDocument(loaded.doc,loaded.fields,false,true,loaded.options);state.templateId=templateId;state.profileFilter=currentProfile;render();toast('Lượt điền mới: trường đã tạo được để trống; phần khác giữ theo template.');}catch(error){toast(error.message);}
}
function saveTemplateDialog(returnToList=false){
 if(state.empty)return toast('Mở một file trước khi lưu template.');
 if(state.drafts.size)return toast('Áp dụng bản nháp trước khi lưu template.');
 const existing=templates.find(t=>t.id===state.templateId);
 modal('Lưu template vào thư viện','Dùng lại nguồn và các trường đã đặt tên mà không cần import mỗi lần.',`<label class="label" for="template-name">Tên template</label><input id="template-name" maxlength="160" value="${esc(existing?.name||state.doc.name.replace(/\.[^.]+$/,''))}"><label class="checkbox-label"><input type="checkbox" id="template-defaults"> Giữ giá trị đang điền làm mặc định cho các trường đã tạo</label>${existing?'<label class="checkbox-label"><input id="template-update" type="checkbox"> Cập nhật template đang dùng (bỏ chọn để lưu thành bản khác)</label>':''}<p class="helper">Nếu bỏ chọn giữ giá trị, các trường đã tạo sẽ trống ở lượt mới. Những phần chưa liên kết vẫn giữ dữ liệu trong nguồn template. Chỉ lưu những giá trị bạn muốn dùng lại.</p><div class="notice">${i('shield-check')} ${t("Lưu","Save")} trên trình duyệt này, không gửi lên mạng. Nguồn template vẫn có thể chứa dữ liệu cá nhân. Có thể tải bản sao từ ${t("Thư viện","Library")}.</div>`,t("<button class=\"button primary\" id=\"confirm-save-template\">Lưu vào thư viện</button>","<button class=\"button primary\" id=\"confirm-save-template\">Save to library</button>"));
 document.querySelector('#confirm-save-template').onclick=async()=>{
   const button=document.querySelector('#confirm-save-template'),dialog=document.querySelector('#modal'),sessionId=sessions.activeId,name=document.querySelector('#template-name').value,updateId=document.querySelector('#template-update')?.checked?existing.id:null;
   button.disabled=true;
   try{const project=await saveProject(state.doc,resolveFields(state.fields),document.querySelector('#template-defaults').checked,{pinnedRuleIds:state.pinnedRuleIds}),item=await library.save(name,project,updateId);const session=sessions.items.find(s=>s.id===sessionId);if(session)session.snapshot.templateId=item.id;if(sessions.activeId===sessionId)state.templateId=item.id;if(dialog.isConnected)dialog.close();await refreshLibrary();render();toast('Đã lưu vào thư viện. Dùng menu + để tạo lượt mới.');if(returnToList&&sessions.activeId===sessionId)fieldListDialog();}catch(error){if(dialog.isConnected)modalError(error);else toast(error.message);button.disabled=false;}
 };
}
function renameTemplateDialog(id){
 const item=templates.find(t=>t.id===id);if(!item)return;
 modal('Đổi tên template','Tên trong thư viện; không thay đổi nguồn file.',`<label class="label" for="template-name">Tên template</label><input id="template-name" maxlength="160" value="${esc(item.name)}">`,t("<button class=\"button primary\" id=\"rename-template\">Lưu tên</button>","<button class=\"button primary\" id=\"rename-template\">Save tên</button>"));
 document.querySelector('#rename-template').onclick=async()=>{try{await library.save(document.querySelector('#template-name').value,item.project,id);document.querySelector('#modal').close();await refreshLibrary();}catch(error){modalError(error);}};
}
function deleteTemplateDialog(id){
 const item=templates.find(t=>t.id===id);if(!item)return;
 modal('Xóa template khỏi thư viện?',esc(item.name),'<p>Các lượt điền đang mở và file trên máy được giữ. Bạn có thể tải bản sao trước khi xóa.</p>',`<button class="button secondary" id="backup-before-delete">${t("Sao lưu","Back up")} trước</button><button class="button danger" id="delete-template">Xóa template này</button>`);
 document.querySelector('#backup-before-delete').onclick=()=>download(JSON.stringify(item.project,null,2),item.name+'.fieldwork.json','application/json');
 document.querySelector('#delete-template').onclick=async()=>{try{await library.remove(id);document.querySelector('#modal').close();await refreshLibrary();toast('Đã xóa khỏi thư viện. Các lượt đang mở vẫn được giữ.');}catch(error){modalError(error);}};
}

function modal(title, subtitle, body, footer) {
  const d = document.querySelector('#modal');
  d.classList.remove('bulk-modal','schema-modal','llm-modal','field-picker-modal');
  d.innerHTML = `<div class="modal-heading"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="icon-button" id="close-modal" aria-label="${t("Đóng","Close")}">${i('x')}</button></div><div class="modal-body">${body}</div><div id="modal-error" class="modal-error" role="alert"></div><div class="modal-footer"><button class="button secondary" id="cancel-modal">${t("Hủy","Cancel")}</button>${footer}</div>`;
  d.querySelector('#close-modal').onclick = () => d.close(); d.querySelector('#cancel-modal').onclick = () => d.close();
  d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } }, { once: true });
  d.showModal(); refreshIcons(); return d;
}
function modalError(e) { document.querySelector('#modal-error').textContent = e.message || String(e); }
function openImportDialog(name, source) {
  modal(t("Mở template","Open template"), t("Chọn cách đọc file. Không cần chuẩn bị placeholder.","Choose how to read this file. Placeholders are optional."), `<div class="import-file">${i('file-code-2')}<strong>${esc(name)}</strong><span>${(source.length/1024).toFixed(1)} KB</span></div><label class="label" for="import-format">${t("Định dạng","Format")}</label><select id="import-format"><option value="auto">${t("Tự nhận diện theo tên file và nội dung","Detect from file name and content")}</option><option value="csv">${t("CSV / bảng phân cách","CSV / delimited table")}</option><option value="text">${t("Văn bản thuần","Plain text")}</option><option value="javascript">JavaScript</option><option value="json">JSON</option></select><p class="helper">${t("TXT export của Lightning Autofill được nhận diện là CSV. Không thực thi code trong file.","Lightning Autofill TXT exports are read as CSV. Scripts are treated as text.")}</p>`, t("<button id=\"confirm-import\" class=\"button primary\">Mở trong Chu0n’s Fieldwork</button>","<button id=\"confirm-import\" class=\"button primary\">Open in Fieldwork</button>"));
  document.querySelector('#confirm-import').onclick = async () => {
    try {
      const doc = openTemplate(source, name, document.querySelector('#import-format').value);
      document.querySelector('#modal').close();
      openDocument(doc); render(); toast('Đã mở trong tab mới.');
    } catch (e) { modalError(e); }
  };
}
function createField(whole, selection=null) {
  const editor = document.querySelector('#content-editor');
  const u = units(state.doc).find(u => u.id === (selection?.unitId||state.selected));
  if (!u || (!selection&&!editor)) return;
  if (!selection&&restoreTextareaValue(u.value,editor.value) !== u.value) return toast('Bấm Áp dụng sửa trước khi tạo liên kết.');
  const {start,end}=selection||(whole?{start:0,end:u.value.length}:sourceSelectionRange(u.value,editor.selectionStart,editor.selectionEnd));
  if (start === end && !(whole && u.value === '')) return toast('Bôi đen nội dung cần thay trong ô giá trị gốc trước.');
  const needle = u.value.slice(start,end);
  let selectedValue;try{const b=makeBinding(state.doc,u.id,start,end);assertNoOverlap(state.fields,b);selectedValue=b.mode==='literal'?b.literalValue.slice(b.innerStart,b.innerEnd):needle;}catch(error){return toast(error.message);}
  modal('Dùng phần đã chọn làm dữ liệu mỗi người', 'Chọn dữ liệu một lần. Khi nhập danh sách, Fieldwork thay đúng phần này và giữ nguyên phần còn lại của chuỗi.', `<label class="label">Nội dung đã chọn</label><pre class="selection-preview">${esc(selectedValue)}</pre><label class="label" for="field-label">Tên trường</label><input id="field-label" maxlength="160" placeholder="Ví dụ: Email liên hệ, Tên tệp đính kèm"><label class="label" for="field-key">Mã cột trong bảng</label><input id="field-key" placeholder="hsk:email"><label class="label" for="existing-field">Dùng cùng dữ liệu với trường đã có</label><select id="existing-field" ${state.fields.length?'':'disabled'}><option value="">Tạo trường mới</option>${state.fields.map(f => `<option value="${f.id}">${esc(f.label)}</option>`).join('')}</select><div class="form-row"><div><label class="label" for="field-context">Cách giữ cú pháp của file</label><select id="field-context"><option value="auto">Tự nhận diện (${u.context === 'js' ? 'chuỗi JavaScript' : u.context === 'json' ? 'chuỗi JSON' : 'văn bản'})</option><option value="text">${t("Văn bản","Text")} trực tiếp</option><option value="js">Chuỗi JavaScript</option></select></div><div><label class="label" for="field-scope">Tìm thêm phần giống hệt ở đâu?</label><select id="field-scope"><option value="selection">Chỉ phần bôi đen trong ô này</option><option value="unit">Mọi lần trùng trong mục này</option><option value="all">Các ô Name / Value khác trong template</option></select></div></div><p class="helper">Ví dụ: email này xuất hiện trong 3 ô. ${t("Chọn","Select")} tìm trong template, kiểm tra 3${t(" vị trí"," locations")}, rồi dùng chung một cột email cho cả 3.</p><div id="binding-preview"></div>`, t("<button id=\"preview-bind\" class=\"button primary\">Kiểm tra vị trí</button>","<button id=\"preview-bind\" class=\"button primary\">Review vị trí</button>"));
  document.querySelector('#field-label').oninput=e=>document.querySelector('#field-key').value=suggestedKey(e.target.value);
  document.querySelector('#existing-field').onchange = e => { document.querySelector('#field-label').disabled = !!e.target.value;document.querySelector('#field-key').disabled=!!e.target.value; };
  document.querySelector('#preview-bind').onclick = () => {
    try {
      const existing = document.querySelector('#existing-field').value;
      const label = document.querySelector('#field-label').value.trim(),key=fieldKey(document.querySelector('#field-key').value);
      if(!existing&&!keyPattern.test(key))throw new Error('Mã cột cần dạng hsk:email hoặc field:email.');
      if (!existing && !label) throw new Error('Hãy nhập tên trường dễ hiểu.');
      const scope = document.querySelector('#field-scope').value, context = document.querySelector('#field-context').value;
      const allowed=isLightning(state.doc)?new Set(lightningRules(state.doc).flatMap(r=>[`${r.row}:2`,`${r.row}:3`])):null;
      const candidates = scope === 'all' ? units(state.doc).filter(unit=>!allowed||allowed.has(unit.id)) : [u];
      const bindings = [], labels = [];
      for (const unit of candidates) {
        const ranges = scope === 'selection' ? [[start,end]] : occurrences(unit.value, needle);
        for (const [a,b] of ranges) {
          const binding = makeBinding(state.doc, unit.id, a,b, context === 'auto' ? null : context);
          assertNoOverlap([...state.fields, { label, bindings }], binding); bindings.push(binding); labels.push(`${unit.title} · ký tự ${a+1}–${b}`);
        }
      }
      if (!bindings.length) throw new Error('Không tìm thấy vị trí phù hợp.');
      document.querySelector('#binding-preview').innerHTML = `<div class="binding-preview"><strong>${bindings.length}${t(" vị trí"," locations")} sẽ nhận cùng một cột dữ liệu</strong>${labels.slice(0,30).map(l => `<p>${esc(l)}</p>`).join('')}${labels.length>30?'<p>… và các vị trí còn lại</p>':''}<button class="button primary" id="confirm-bind">${i('check')} Dùng các vị trí này</button></div>`; refreshIcons();
      const controls = ['#field-label','#field-key','#existing-field','#field-context','#field-scope'];
      controls.forEach(selector => document.querySelector(selector).addEventListener('input', () => { document.querySelector('#binding-preview').innerHTML = ''; }, { once: true }));
      document.querySelector('#confirm-bind').onclick = () => {
        if(!existing)resolveFields([...state.fields,{key,label}]);
        checkpoint();
        if (existing) state.fields.find(f => f.id === existing).bindings.push(...bindings);
        else state.fields.push({ id: uid(), key, label, value: selectedValue, type: 'text', transform: 'none', required: true, bindings });
        const field=existing?state.fields.find(f=>f.id===existing):state.fields.at(-1);pinFieldRules(field);document.querySelector('#modal').close(); render(); toast(`${field.label}: ${bindings.length} vị trí đã sẵn sàng cho hàng loạt.`);
      };
    } catch (e) { document.querySelector('#binding-preview').innerHTML = ''; modalError(e); }
  };
}
function ruleSettings(rowIndex){
 if(!isLightning(state.doc))return;
 const r=lightningRules(state.doc,state.fields).find(r=>r.row===rowIndex);if(!r)return;
 const row=state.doc.rows[rowIndex],profiles=profileDefinitions(state.doc).map(p=>[p.id,p.name]);
 const typeOptions=Object.entries(TYPE_INFO).map(([key,info])=>`<option value="${key}" ${r.type===key?'selected':''}>${key} · ${esc(info.label)}</option>`).join('')+(!TYPE_INFO[r.type]?`<option value="${esc(r.type)}" selected>${esc(r.type)} · loại gốc chưa biết</option>`:'');
 modal(`Thiết lập ${esc(r.id)}`,'Chỉnh đúng các cột của Lightning Autofill. Rule ID và Value được giữ nguyên.',`<label class="label" for="rule-type">Type · loại thao tác</label><select id="rule-type">${typeOptions}</select><label class="label" for="rule-name">Name · selector / đích / tham số</label><textarea id="rule-name" class="metadata-textarea" spellcheck="false">${esc(row[2])}</textarea><label class="label" for="rule-site">Site · phạm vi riêng của rule</label><textarea id="rule-site" class="metadata-textarea" rows="2" placeholder="${t("Trống","Empty")} = kế thừa Site của profile"></textarea><div class="form-row"><div><label class="label" for="rule-mode">Mode · cách điền Text / Password</label><select id="rule-mode">${(!MODE_NAMES[Number(row[5])]||row[5]===''?`<option value="${esc(row[5])}" selected>Giữ mã gốc: ${esc(row[5]||t("(trống)","(empty)"))}</option>`:'')+MODE_NAMES.map((name,index)=>`<option value="${index}" ${String(index)===row[5]?'selected':''}>${index} · ${esc(name)}</option>`).join('')}</select></div><div><label class="label" for="rule-profile">Profile</label><select id="rule-profile"><option value="">Unfiled</option>${r.profileId&&!profiles.some(([id])=>id===r.profileId)?`<option value="${esc(r.profileId)}" selected>${esc(r.profileId)} · không tồn tại</option>`:''}${profiles.map(([id,name])=>`<option value="${esc(id)}" ${id===r.profileId?'selected':''}>${esc(name)} (${esc(id)})</option>`).join('')}</select></div></div><p class="helper">Đổi Type không tự chuyển cú pháp Value. Đổi Type/Name sẽ gỡ những liên kết bị ảnh hưởng trong rule này; các vị trí khác được giữ. Các action 5–12 dùng mapping legacy, cần đối chiếu phiên bản extension.</p>`, t("<button class=\"button primary\" id=\"save-rule-settings\">Áp dụng thiết lập rule</button>","<button class=\"button primary\" id=\"save-rule-settings\">Apply thiết lập rule</button>"));
 const controls=Object.fromEntries(['type','name','site','mode','profile'].map(key=>[key,document.querySelector('#rule-'+key)]));controls.name.value=row[2];controls.site.value=row[4];const initial=Object.fromEntries(Object.entries(controls).map(([key,el])=>[key,el.value]));
 const refreshMode=()=>{document.querySelector('#rule-mode').disabled=!['0','1'].includes(document.querySelector('#rule-type').value);};refreshMode();document.querySelector('#rule-type').onchange=refreshMode;
 document.querySelector('#save-rule-settings').onclick=()=>{try{const patch=Object.fromEntries(Object.entries(controls).filter(([key,el])=>el.value!==initial[key]).map(([key,el])=>[key,key==='name'||key==='site'?restoreTextareaValue(row[key==='name'?2:4],el.value):el.value]));if(!Object.keys(patch).length){document.querySelector('#modal').close();return;}const next=updateRuleMetadata(state.doc,rowIndex,patch,state.fields);checkpoint();state.doc=next.doc;state.fields=next.fields;state.expanded=null;document.querySelector('#modal').close();render();toast(`Đã sửa ${r.id}${next.removedBindings?`; gỡ ${next.removedBindings} liên kết bị ảnh hưởng`:''}. Xem diff ngay tại rule.`);}catch(e){modalError(e);}};
}
function fieldSettings(id,returnToList=false) {
 const returnStage=state.page==='fill'?state.workflow?.stage:null,returnToFlow=()=>returnStage?openFill(returnStage):fieldListDialog();
 const targets=lightningRules(state.doc).flatMap(r=>(r.constants?.length?r.constants.map(c=>({unitId:r.unitId,start:c.start,end:c.end,label:r.id+' · '+c.name,value:c.value})):r.type==='4'?[]:[{unitId:r.unitId,start:0,end:r.value.length,label:r.id+' · '+(r.selector||r.title).slice(0,90),value:r.value}])).filter(t=>{try{assertNoOverlap(state.fields,makeBinding(state.doc,t.unitId,t.start,t.end));return true;}catch{return false;}});
  const existing=state.fields.find(f=>f.id===id),isNew=!existing;const f=existing||{id:uid(),label:'',key:'',value:'',type:'text',transform:'none',required:true,bindings:[]};
  modal(t("Thông tin cần điền","Fields to fill"), 'Đặt tên dễ hiểu, mã cột và quy tắc. Ví dụ: Email liên hệ → hsk:email.', `${!f.bindings.length?`<label class="label" for="field-target">Ô sẽ được điền trong template</label><select id="field-target"><option value="">Chỉ tạo cột dữ liệu — chưa chọn ô điền</option>${targets.map((t,index)=>`<option value="${index}">${esc(t.label)}</option>`).join('')}</select><p class="helper">${t("Chọn ô","Choose a value")} một lần. Mỗi dòng trong danh sách sau này sẽ thay dữ liệu vào đúng ô đó.</p>`:''}<label class="label" for="edit-label">Tên thông tin</label><input id="edit-label" value="${esc(f.label)}" maxlength="160"><label class="label" for="edit-key">Mã cột trong bảng</label><input id="edit-key" value="${esc(f.key||suggestedKey(f.label))}" placeholder="hsk:email"><div class="form-row"><div><label class="label" for="edit-type">Kiểu dữ liệu</label><select id="edit-type">${[['text',t("Văn bản","Text")],['email','Email'],['date','Ngày (YYYY-MM-DD)']].map(([k,v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div><div><label class="label" for="edit-transform">Chuyển đổi khi xuất</label><select id="edit-transform">${[['none','Giữ nguyên'],['trim','Bỏ khoảng trắng đầu/cuối'],['upper','VIẾT HOA'],['ascii-upper','KHÔNG DẤU, VIẾT HOA']].map(([k,v]) => `<option value="${k}" ${f.transform === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div><label class="checkbox-label"><input id="edit-required" type="checkbox" ${f.required ? 'checked' : ''}> ${t("Bắt buộc","Required")} có giá trị khi xuất</label><details class="schema-rules"><summary>Quy tắc nâng cao (tuỳ chọn)</summary><label class="label" for="field-description">Ý nghĩa trường</label><textarea id="field-description" rows="2" maxlength="4000" placeholder="Ví dụ: Tên đầy đủ của thí sinh, không phải tên người đăng ký hộ">${esc(f.description||'')}</textarea><label class="label" for="field-aliases">Tên gọi khác trong dữ liệu nguồn (mỗi dòng một tên)</label><textarea id="field-aliases" rows="2">${esc((f.aliases||[]).join('\n'))}</textarea><label class="label" for="field-instructions">Quy tắc riêng</label><textarea id="field-instructions" rows="3" maxlength="4000" placeholder="Ví dụ: Chỉ lấy tên file có đuôi .jpg; không lấy đường dẫn thư mục.">${esc(f.instructions||'')}</textarea><label class="label" for="field-allowed">Giá trị được phép (mỗi dòng một giá trị; trống = tự do)</label><textarea id="field-allowed" rows="3">${esc((f.allowedValues||[]).join('\n'))}</textarea><label class="label" for="field-example">Ví dụ đúng định dạng (không dùng để điền dữ liệu thiếu)</label><input id="field-example" maxlength="1000" value="${esc(f.example||'')}" placeholder="Ví dụ: portrait_hsk4.jpg"></details><details class="schema-positions"><summary>${f.bindings.length}${t(" vị trí"," locations")} trong template</summary>${f.bindings.length?'':'<p class="helper">Trường này dùng được trong bộ chuẩn hoá LLM; chưa gắn vào ô trong template.</p>'}<div class="binding-locations">${f.bindings.map((b,index) => `<div><span>${esc(units(state.doc).find(u => u.id === b.unitId)?.title)}<small>${esc(b.expected.slice(0,80))}</small></span><button class="icon-button" data-remove-binding="${index}" title="Gỡ vị trí">${i('x')}</button></div>`).join('')}</div></details>`, t("<button class=\"button primary\" id=\"save-field-settings\">Lưu thông tin</button>","<button class=\"button primary\" id=\"save-field-settings\">Save thông tin</button>"));
  document.querySelector('#modal').classList.add('schema-modal');
  if(returnToList){document.querySelector('#cancel-modal').textContent='Quay lại';for(const id of ['#cancel-modal','#close-modal'])document.querySelector(id).onclick=()=>returnToFlow();}
  let keyEdited=false;document.querySelector('#edit-key').oninput=()=>{keyEdited=true;};if(isNew)document.querySelector('#edit-label').oninput=e=>{if(!keyEdited)document.querySelector('#edit-key').value=suggestedKey(e.target.value);};
  document.querySelector('#modal .modal-body').insertAdjacentHTML('afterbegin',quickWalkthrough('fields'));
  const removed = new Set();
  document.querySelectorAll('[data-remove-binding]').forEach(el => el.onclick = () => { removed.add(Number(el.dataset.removeBinding)); el.closest('.binding-locations > div').style.opacity = '.35'; el.disabled = true; });
  document.querySelector('#save-field-settings').onclick = () => {
    const label = document.querySelector('#edit-label').value.trim(); if (!label) return modalError('Tên trường không được để trống.');
    if (f.bindings.length&&removed.size === f.bindings.length) return modalError('Cần giữ ít nhất một vị trí. Để bỏ trường, vào Trường dữ liệu rồi bấm biểu tượng thùng rác.');
    if(isNew){try{assertDataFields([...state.fields,f]);}catch(error){return modalError(error);}}
    const key=fieldKey(document.querySelector('#edit-key').value);if(!keyPattern.test(key))return modalError('Mã cột cần dạng hsk:email hoặc field:email.');try{resolveFields(isNew?[...state.fields,{...f,key}]:state.fields.map(field=>field.id===f.id?{...field,key}:field));}catch(error){return modalError(error);}
    const aliases=document.querySelector('#field-aliases').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean),allowedValues=document.querySelector('#field-allowed').value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(aliases.length>200||allowedValues.length>200||[...aliases,...allowedValues].some(v=>v.length>1000))return modalError('Tối đa 200 mục, 1000 ký tự mỗi mục.');
    let addedBinding=null;const targetIndex=document.querySelector('#field-target')?.value;if(targetIndex){const target=targets[Number(targetIndex)];try{addedBinding=makeBinding(state.doc,target.unitId,target.start,target.end);assertNoOverlap(state.fields,addedBinding);}catch(error){return modalError(error);}}
    checkpoint();if(addedBinding){f.bindings.push(addedBinding);f.value=targets[Number(targetIndex)].value;pinFieldRules(f);}f.aliases=[...new Set(aliases)];f.allowedValues=[...new Set(allowedValues)];f.description=document.querySelector('#field-description').value;f.instructions=document.querySelector('#field-instructions').value;f.example=document.querySelector('#field-example').value; f.key=key; f.label = label; f.type = document.querySelector('#edit-type').value; f.transform = document.querySelector('#edit-transform').value; f.required = document.querySelector('#edit-required').checked; f.bindings = f.bindings.filter((b,index) => !removed.has(index));if(isNew)state.fields.push(f);document.querySelector('#modal').close(); render();if(returnToList)returnToFlow();
  };
}
function editSource() {
  const u = units(state.doc).find(u => u.id === state.selected);let value;try{value=restoreTextareaValue(u.value,document.querySelector('#content-editor').value);}catch(error){return toast(error.message);}
  if (value === u.value) return toast('Nội dung chưa thay đổi.');
  const affected = state.fields.filter(f => f.bindings.some(b => b.unitId === u.id));
  const apply = () => {
    try {
      let next;
      if (state.doc.rows) { const rows = state.doc.rows.map(r => [...r]); rows[u.row][u.col] = value; next = openTemplate((state.doc.bom ? '\uFEFF' : '') + serializeCSV(state.doc,rows), state.doc.name, 'csv'); }
      else next = openTemplate((state.doc.bom ? '\uFEFF' : '') + value, state.doc.name, state.doc.kind);
      checkpoint(); state.doc = next; state.drafts.delete(u.id); state.fields = state.fields.map(f => ({...f,bindings:f.bindings.filter(b => b.unitId !== u.id)})).filter((f,index)=>f.bindings.length||!state.fields[index].bindings.length); state.expanded=null;document.querySelector('#modal').close(); render(); toast('Đã áp dụng. Những liên kết trong mục vừa sửa đã được gỡ để tránh lệch vị trí.');
    } catch(e) { if (document.querySelector('#modal').open) modalError(e); else toast(e.message); }
  };
  if (!affected.length) return apply();
  modal('Cập nhật nội dung gốc?', 'Các vị trí liên kết trong mục này cần được tạo lại.', `<p>Mục này đang liên kết với ${affected.length} trường. ${t("Sửa","Edit")} trực tiếp sẽ gỡ các liên kết nằm trong mục này để tránh thay nhầm vị trí. Các mục khác được giữ nguyên. Có thể hoàn tác.</p>`, t("<button class=\"button primary\" id=\"confirm-edit\">Áp dụng và gỡ liên kết</button>","<button class=\"button primary\" id=\"confirm-edit\">Apply và gỡ liên kết</button>")); document.querySelector('#confirm-edit').onclick = apply;
}

function sessionDialog(){
 const status=autosave.status;
 modal(t("Tự lưu & khôi phục phiên","Autosave & session recovery"),'Lưu trên trình duyệt này; không gửi dữ liệu lên mạng.',
 '<p>Theme, màu nhấn và cách hiện diff được nhớ tự động.</p><p class="notice">'+esc(status.label)+(status.detail?' · '+esc(status.detail):'')+t("</p><p>Phiên gồm các tab, template gốc, trường đã tạo, giá trị đang điền, mã nháp, bộ lọc và dữ liệu hàng loạt. Mở lại trang tại cùng địa chỉ sẽ tự khôi phục.</p><p class=\"helper\">Lịch sử Undo/Redo và hộp thoại đang mở không được giữ. Danh sách khôi phục cần kiểm tra lại trước khi xuất. Trình duyệt có thể xoá bộ nhớ; tải file khi cần giữ bản lâu dài.</p>","</p><p>Phiên gồm các tab, template gốc, configured fields, giá trị đang điền, mã nháp, bộ lọc và dữ liệu hàng loạt. Mở lại trang tại cùng địa chỉ sẽ tự khôi phục.</p><p class=\"helper\">Lịch sử Undo/Redo và hộp thoại đang mở không được giữ. List khôi phục cần kiểm tra lại trước khi xuất. Trình duyệt có thể xoá bộ nhớ; tải file khi cần giữ bản lâu dài.</p>"),
 '<button class="button secondary" id="session-toggle">'+(autosave.enabled?'Tắt tự lưu & xoá phiên':'Bật tự lưu')+'</button><button class="button primary" id="session-now" '+(!autosave.enabled?'disabled':'')+'>'+(autosave.blocked?'Ghi phiên hiện tại':'Lưu phiên ngay')+'</button>');
 document.querySelector('#session-toggle').onclick=()=>confirmSessionChange(!autosave.enabled);
 document.querySelector('#session-now').onclick=async()=>{if(autosave.blocked)return confirmSessionChange(true);captureActive();autosave.schedule();const button=document.querySelector('#session-now');button.disabled=true;if(await autosave.flush()){document.querySelector('#modal').close();toast('Đã lưu phiên trên trình duyệt này.');}else sessionDialog();};
}
function confirmSessionChange(enabled){
 modal(enabled?'Dùng phiên hiện tại để khôi phục?':'Tắt tự lưu và xoá phiên đã lưu?',enabled?'Bản khôi phục trước sẽ được thay bằng các tab hiện đang mở.':'Các tab hiện đang mở vẫn giữ nguyên.',
 '<p>'+ (enabled?'Nếu đang mở Fieldwork trong cửa sổ khác, cửa sổ đó sẽ không tự ghi đè phiên này. Dữ liệu đang mở bên đó vẫn giữ nguyên.':'Ứng dụng sẽ xoá bản khôi phục trong trình duyệt và ngừng tự lưu. Theme, màu nhấn, thiết lập diff và thư viện template vẫn được giữ.')+'</p>',
 '<button class="button primary" id="confirm-session-change">'+(enabled?'Lưu phiên hiện tại':'Tắt & xoá bản khôi phục')+'</button>');
 document.querySelector('#confirm-session-change').onclick=async()=>{const button=document.querySelector('#confirm-session-change');button.disabled=true;captureActive();if(await autosave.configure(enabled)){document.querySelector('#modal').close();render();toast(enabled?'Đã bật tự lưu phiên hiện tại.':'Đã tắt tự lưu và xoá bản khôi phục.');}else{button.disabled=false;modalError(autosave.error);}};
}

function projectDialog() {
  if(state.drafts.size) return toast('Áp dụng các nội dung đang sửa trực tiếp trước khi lưu dự án.');
  modal('Lưu cách điền để dùng lại', 'Tùy chọn của Chu0n’s Fieldwork; không phải file import cho Lightning Autofill.', `<label class="label" for="project-name">Tên file cách điền</label><input id="project-name" value="${esc(state.doc.name.replace(/\.[^.]+$/, '') + '.fieldwork.json')}"><label class="checkbox-label"><input id="include-values" type="checkbox"> ${t("Lưu","Save")} cả giá trị đang điền</label><div class="notice">${i('shield-check')} Template gốc luôn được lưu trong dự án, có thể chứa thông tin cá nhân dù không chọn lưu giá trị. Hãy kiểm tra trước khi chia sẻ.</div>`, '<button id="download-project" class="button primary">Tải bộ thiết lập</button>');
  document.querySelector('#download-project').onclick = async () => { const dialog=document.querySelector('#modal'),name=document.querySelector('#project-name').value||'project.fieldwork.json';try { const data = await saveProject(state.doc,resolveFields(state.fields),document.querySelector('#include-values').checked,{pinnedRuleIds:state.pinnedRuleIds}); download(serializeProject(data),name,'application/json');if(dialog.isConnected)dialog.close();render();toast('Đã tải cách điền. Có thể mở lại từ menu ⋯.'); } catch(e) {if(dialog.isConnected)modalError(e);else toast(e.message);} };
}
function exportDialog() {
  const result = metrics().result;
  if (result.problems.length) { render(); return toast('Cần xử lý các mục được báo trước khi xuất.'); }
  modal('Xuất template', 'File nguồn trên máy của bạn sẽ không bị ghi đè.', `<label class="label" for="export-name">Tên file xuất</label><input id="export-name" value="${esc(state.doc.name.replace(/(\.[^.]+)$/, '-filled$1'))}"><div class="export-summary"><span>${i('check-circle-2')} Đọc lại cấu trúc thành công</span><span>${i('check-circle-2')} ${result.changed.length} mục đã thay đổi</span><span>${i('shield-check')} JavaScript không được thực thi</span></div><p class="helper">Xuất toàn bộ file, gồm tất cả profile và Settings. Lọc/sort/group không đổi thứ tự thực thi hoặc loại bớt dữ liệu. Giữ nguyên các ô không sửa; cần kiểm tra trên extension trước khi dùng thật.</p>`, '<button id="confirm-export" class="button primary">Tải template</button>');
  document.querySelector('#confirm-export').onclick = () => { download(result.output,document.querySelector('#export-name').value || 'template-filled.txt',state.doc.kind==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8'); state.dirty=false;state.exported=true;document.querySelector('#modal').close();render();toast('Đã tải template. Import file này vào Lightning Autofill.'); };
}
function download(content,name,mime) { const url = URL.createObjectURL(new Blob([content],{type:mime})); const a=document.createElement('a'); a.href=url; a.download=name.replace(/[\\/:*?"<>|]/g,'-'); a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000); }

async function boot(){
 Object.assign(state,fresh(openTemplate('','')),{empty:true});render();const app=document.querySelector('#app');app.inert=true;app.setAttribute('aria-busy','true');
 const restored=await autosave.init(payload=>decodeSession(payload,fresh,sessions.limit));
 if(restored){sessions.items=restored.items;sessions.activeId=restored.activeId;entrySequence=restored.entrySequence;const active=sessions.items.find(item=>item.id===sessions.activeId);if(active)Object.assign(state,active.snapshot,{restoreScroll:active.snapshot.scroll||0});}
 render(false);await autosave.prime();
 app.inert=false;app.removeAttribute('aria-busy');if(autosave.error)toast(autosave.error);else if(restored?.items.length)toast('Đã khôi phục '+restored.items.length+' tab. Dữ liệu hàng loạt cần kiểm tra lại trước khi xuất.');
 await refreshLibrary();if(state.empty&&templates.length){state.page='library';render();}
}
boot();



window.addEventListener('beforeunload',event=>{captureActive();autosave.flush();if(!autosave.saved&&hasPendingChanges(state,sessions.items.map(item=>item.snapshot))){event.preventDefault();event.returnValue='';}});
for(const event of ['input','change','scroll'])document.addEventListener(event,()=>autosave.schedule(),true);
document.addEventListener('visibilitychange',()=>{if(document.hidden){captureActive();autosave.flush();}});
window.addEventListener('pagehide',()=>{captureActive();autosave.flush();});

document.addEventListener('click',event=>{const owner=event.target.closest('.app-menu,.view-options');for(const menu of document.querySelectorAll('.app-menu[open],.view-options[open]'))if(menu!==owner)menu.open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){for(const menu of document.querySelectorAll('.app-menu[open],.view-options[open]'))menu.open=false;return;}if(document.querySelector('#modal')?.open||isTextEditing(event.target))return;const mod=event.ctrlKey||event.metaKey;if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();}else if(mod&&event.key.toLowerCase()==='y'){event.preventDefault();redo();}else if(!mod&&!event.altKey&&event.key==='/'){const search=document.querySelector('#search');if(search){event.preventDefault();search.focus();search.select();}}});
