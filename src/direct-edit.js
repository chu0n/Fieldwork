import {openTemplate,units,makeBinding,assertNoOverlap,renderTemplate} from './core.js';
// Ordinary edits patch the working document; only explicit user fields remain in fields.
export function applyDirectEdit(doc,fields,{unitId,start=0,end,value}){
 const unit=units(doc).find(u=>u.id===unitId);if(!unit)throw new Error('Không còn tìm thấy ô cần sửa.');
 end??=unit.value.length;
 const binding=makeBinding(doc,unitId,start,end,start===0&&end===unit.value.length&&unit.context==='json'?'text':null);assertNoOverlap(fields,binding);
 const result=renderTemplate(doc,[{id:'direct-edit',label:unit.title,type:'text',transform:'none',required:false,value:String(value),bindings:[binding]}]);
 const next=openTemplate(result.output,doc.name,doc.kind),updated=units(next).find(u=>u.id===unitId);
 const delta=updated.value.length-unit.value.length,from=binding.mode==='literal'?binding.literalStart:start,to=binding.mode==='literal'?binding.literalEnd:end;
 const retained=fields.map(field=>({...field,bindings:field.bindings.map(b=>{
  if(b.unitId!==unitId||b.end<=from)return {...b};
  if(b.start<to)throw new Error('Ô này có thông tin đã thiết lập. Hãy sửa qua trường dùng chung.');
  const shifted={...b,start:b.start+delta,end:b.end+delta};
  if(b.mode==='literal'){shifted.literalStart+=delta;shifted.literalEnd+=delta;}
  if(updated.value.slice(shifted.start,shifted.end)!==shifted.expected)throw new Error('Không thể giữ vị trí trường sau khi sửa.');
  return shifted;
 })}));
 return {doc:next,fields:retained,range:{start,end:end+delta},edit:{start:from,end:to,delta}};
}
