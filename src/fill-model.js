import {assertDataFields} from './data-limits.js';
import {resolveFields} from './data-fields.js';
import {normalizeCell,suggestMapping} from './bulk-data.js';
import {renderTemplate,transformed} from './core.js';
export function createWorkflow(){return {stage:'fields',mode:'table',source:'',format:'auto',aiSource:'',aiFormat:'json',data:null,mapping:{},dateFormat:'iso',overrides:{},selected:0,query:'',onlyErrors:false,raw:false,reviews:null,checked:false,dirty:false,inputChanged:false,pending:null,error:'',notice:'',history:[],future:[],exported:false,listVisible:true};}
export function syncWorkflow(flow,doc,fields){const signature=JSON.stringify(resolveFields(fields).map(({value,...f})=>f));if(flow.boundSource!==undefined&&(flow.boundSource!==doc.source||flow.boundFields!==signature||flow.boundKind!==doc.kind||flow.boundBom!==doc.bom)){flow.checked=false;flow.reviews=null;flow.notice='Template hoặc cấu hình đã thay đổi. Kiểm tra lại danh sách trước khi xuất.';}flow.boundSource=doc.source;flow.boundFields=signature;flow.boundKind=doc.kind;flow.boundBom=doc.bom;}
export function commitWorkflowData(flow,data,fields,token){flow.data=data;flow.mapping=suggestMapping(fields,data.headers);flow.overrides={};flow.selected=0;flow.history=[];flow.future=[];flow.checked=false;flow.reviews=null;flow.inputChanged=false;flow.importedToken=token;flow.pending=null;flow.dirty=true;flow.exported=false;flow.error='';flow.notice='Đã nhập '+data.rows.length+' bản ghi. Ghép cột nếu cần rồi kiểm tra.';}
export function workflowRecord(doc,fields,flow,index){if(!flow.data||!flow.data.rows[index])throw new Error('Chưa có bản ghi để kiểm tra.');const problems=[],overrides=flow.overrides[index]||{},filled=resolveFields(fields).map(f=>{const ci=flow.data.headers.indexOf(flow.mapping[f.id]);if(ci<0)problems.push('Chưa ghép cột cho '+f.label+'.');return {...f,value:Object.hasOwn(overrides,f.id)?normalizeCell(overrides[f.id],f,'iso'):normalizeCell(ci<0?'':flow.data.rows[index][ci],f,flow.dateFormat)};});const projected=doc.source.length+filled.reduce((n,f)=>n+f.value.length*f.bindings.length*6,0);if(projected>8_000_000)throw new Error('Kết quả một bản ghi vượt giới hạn 8 MB.');const result=renderTemplate(doc,filled);return {...result,fields:filled,values:filled.map(f=>transformed(f.value,f.transform)),problems:[...new Set([...problems,...result.problems])]};}
export function checkWorkflow(doc,fields,flow){flow.checked=false;flow.reviews=null;assertDataFields(fields);if(!flow.data)throw new Error('Nhập danh sách trước.');if(flow.inputChanged)throw new Error('Nguồn nhập đã thay đổi. Bấm “Nhập danh sách này” trước khi kiểm tra.');if(!fields.length)throw new Error('Chọn ít nhất một thông tin cần điền.');if(doc.source.length*flow.data.rows.length>30_000_000)throw new Error('Lô dữ liệu vượt 30 MB nguồn. Hãy chia nhỏ.');flow.checked=false;let size=0;const reviews=flow.data.rows.map((_,index)=>{const r=workflowRecord(doc,fields,flow,index);size+=new TextEncoder().encode(r.output).length;if(size>60_000_000)throw new Error('Kết quả cả lô vượt 60 MB. Hãy chia nhỏ.');return {index,problems:r.problems,changes:r.changed.length};});flow.reviews=reviews;flow.checked=true;flow.notice='Đã kiểm tra '+reviews.length+' bản ghi.';return reviews;}
export function changeWorkflowValue(doc,fields,flow,index,fieldId,value){return changeWorkflowValues(doc,fields,flow,[{index,fieldId,value}]);}
export function changeWorkflowValues(doc,fields,flow,edits){
 const next=structuredClone(flow.overrides),changes=[];
 for(const {index,fieldId,value}of edits){if(!Number.isInteger(index)||!flow.data?.rows[index]||!fields.some(f=>f.id===fieldId))throw new Error('Bản ghi hoặc trường không còn tồn tại.');if(typeof value!=='string')throw new Error('Giá trị phải là chuỗi.');const previous=next[index]?.[fieldId];if(previous===value)continue;changes.push({index,fieldId,previous,value});next[index]??={};next[index][fieldId]=value;}
 if(!changes.length)return false;
 if(JSON.stringify(next).length>2_000_000)throw new Error('Các giá trị chỉnh sửa vượt 2 MB. Hãy chia lô.');
 for(const index of new Set(changes.map(edit=>edit.index)))workflowRecord(doc,fields,{...flow,overrides:next},index);
 flow.history.push({changes,selected:flow.selected});if(flow.history.length>100)flow.history.shift();flow.future=[];flow.overrides=next;flow.checked=false;flow.reviews=null;flow.dirty=true;flow.exported=false;return true;
}
export function travelWorkflow(flow,direction){const from=direction==='redo'?flow.future:flow.history,to=direction==='redo'?flow.history:flow.future;if(!from.length)return false;const item=from.pop();to.push(item);const next=structuredClone(flow.overrides);for(const edit of item.changes||[item]){const value=direction==='redo'?edit.value:edit.previous,row={...(next[edit.index]||{})};if(value===undefined)delete row[edit.fieldId];else row[edit.fieldId]=value;next[edit.index]=row;}flow.overrides=next;flow.selected=item.selected??item.index;flow.checked=false;flow.reviews=null;flow.dirty=true;flow.exported=false;return true;}
export function canExportWorkflow(flow,index=null){return !!(flow.data&&flow.checked&&!flow.inputChanged&&flow.reviews&&(index==null?flow.reviews.every(r=>!r.problems.length):flow.reviews[index]&&!flow.reviews[index].problems.length));}

export function workflowFileLabel(flow,result,index){
 const choice=flow.filename;if(!choice)return '';
 if(Array.isArray(choice)&&choice[0]==='field'){
  const at=result.fields.findIndex(field=>field.id===choice[1]);if(at<0)throw new Error('Trường dùng đặt tên file đã bị xoá. Chọn lại trước khi xuất.');return result.values[at];
 }
 const header=Array.isArray(choice)&&choice[0]==='column'?choice[1]:choice,at=flow.data.headers.indexOf(header);
 if(at<0)throw new Error('Cột dùng đặt tên file không còn tồn tại. Chọn lại trước khi xuất.');
 const mapped=result.fields.flatMap((field,i)=>flow.mapping[field.id]===header?[i]:[]);
 if(mapped.length>1)throw new Error('Cột đặt tên file được dùng bởi nhiều trường. Chọn rõ trường đã kiểm tra trong mục tên file.');
 return mapped.length?result.values[mapped[0]]:flow.data.rows[index][at];
}
