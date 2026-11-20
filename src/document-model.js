import { units } from './core.js';
const indexes=new WeakMap();
export function indexedUnits(doc){
  if(indexes.has(doc))return indexes.get(doc);
  const lightning=doc.rows?.some(row=>row[0]==='### AUTOFILL RULES ###');
  const result=new Map(),byId=new Map(),seen=new Map();let section='',keys=[];
  (doc.rows||[]).forEach((row,index)=>{
    if(row[0]?.startsWith('###'))section=row[0];
    const key=JSON.stringify([section,row[0]]),ordinal=seen.get(key)||0;seen.set(key,ordinal+1);keys[index]=[section,row[0],ordinal];
  });
  for(const unit of units(doc)){const key=doc.rows?(lightning?JSON.stringify([...keys[unit.row],unit.col]):unit.id):'text';const item={...unit,key};result.set(key,item);byId.set(unit.id,item);}
  const index={byKey:result,byId};indexes.set(doc,index);return index;
}
export function baselineValue(original,current,id,fallback=''){
  const unit=indexedUnits(current).byId.get(id);return indexedUnits(original).byKey.get(unit?.key)?.value??fallback;
}
export function compareDocuments(original,current){
  const before=indexedUnits(original),after=indexedUnits(current),changes=[];
  for(const [key,unit]of after.byKey){const old=before.byKey.get(key);if(unit.value!==(old?.value??''))changes.push({...unit,value:old?.value??'',after:unit.value,added:!old});}
  for(const [key,unit]of before.byKey)if(!after.byKey.has(key))changes.push({...unit,id:'removed:'+unit.id,row:-1,after:'',removed:true});
  return changes;
}
export function rebaseDocumentState(before,after,fields,drafts=new Map()){
  const old=indexedUnits(before),next=indexedUnits(after),mapping=new Map();
  for(const [id,unit]of old.byId){const target=next.byKey.get(unit.key);if(target)mapping.set(id,target.id);}
  const retained=fields.map(field=>({...field,bindings:field.bindings.flatMap(binding=>{
    const id=mapping.get(binding.unitId),unit=next.byId.get(id);
    return unit&&unit.value.slice(binding.start,binding.end)===binding.expected?[{...binding,unitId:id}]:[];
  })})).filter((field,index)=>field.bindings.length||!fields[index].bindings.length);
  return{fields:retained,drafts:new Map([...drafts].filter(([id])=>mapping.has(id)).map(([id,value])=>[mapping.get(id),value])),mapping};
}
