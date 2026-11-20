import {units,makeBinding,assertNoOverlap} from './core.js';

export {sourceSelectionRange} from './file-text.js';

const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fieldSelectionPreview(value,fields,unitId,scopeStart=0,scopeEnd=value.length){
 const positions=fields.flatMap(f=>f.bindings.filter(b=>b.unitId===unitId&&b.start>=scopeStart&&b.end<=scopeEnd).map(b=>({...b,fieldId:f.id,label:f.label,key:f.key}))).sort((a,b)=>a.start-b.start);
 if(!positions.length)return '';
 return `<div class="assigned-ranges"><span class="assigned-heading">Trường trong ô · ${positions.length}</span><div class="assigned-chips">${positions.map(b=>`<div class="assigned-chip" title="${escapeHTML(b.key)} · ký tự ${b.start+1}–${b.end}"><strong>${escapeHTML(b.label)}</strong><span>←</span><code title="${escapeHTML(value.slice(b.start,b.end))}">${escapeHTML(value.slice(b.start,b.end)||'(trống)')}</code><button type="button" data-picker-unlink="${escapeHTML(b.fieldId)}" data-binding-start="${b.start}" data-binding-end="${b.end}" aria-label="Xoá ${escapeHTML(b.label)} khỏi đoạn này" title="Xoá trường khỏi đoạn này; có thể Hoàn tác">×</button></div>`).join('')}</div></div>`;
}
export function unlinkFieldBindings(fields,fieldId,unitId,range=null){
 const target=fields.find(f=>f.id===fieldId);if(!target)throw new Error('Trường đã được xoá.');
 const keep=target.bindings.filter(b=>!(b.unitId===unitId&&(!range||(b.start===range.start&&b.end===range.end))));
 if(keep.length===target.bindings.length)throw new Error('Vị trí này không còn gắn với trường.');
 return fields.flatMap(f=>f.id!==fieldId?[f]:keep.length?[{...f,bindings:keep}]:[]);
}
export function fieldSelectionBinding(doc,fields,{unitId,scopeStart=0,scopeEnd,start,end,whole=false}){
 const unit=units(doc).find(u=>u.id===unitId);if(!unit)throw new Error('Không tìm thấy ô nguồn.');scopeEnd??=unit.value.length;
 if(scopeStart<0||scopeEnd>unit.value.length||scopeStart>scopeEnd)throw new Error('Phạm vi nguồn không hợp lệ.');
 const a=whole?scopeStart:scopeStart+start,b=whole?scopeEnd:scopeStart+end;
 if(!whole&&(!Number.isInteger(start)||!Number.isInteger(end)||end<=start||start<0||b>scopeEnd))throw new Error('Bôi đen đoạn cần tạo trường trong khung nội dung.');
 const binding=makeBinding(doc,unitId,a,b);assertNoOverlap(fields,binding);
 return {binding,value:binding.mode==='literal'?binding.literalValue.slice(binding.innerStart,binding.innerEnd):binding.expected};
}
