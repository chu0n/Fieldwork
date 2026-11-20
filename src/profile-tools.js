import { openTemplate } from './core.js';
import { lightningRules,profileDefinitions,isLightning } from './lightning.js';
import { serializeCSV,insertCSVRows } from './csv-preserve.js';

export function profilesWithCounts(doc){
  const rules=lightningRules(doc);
  return profileDefinitions(doc).map(profile=>({...profile,count:rules.filter(rule=>rule.profileId===profile.id).length}));
}
export function updateProfile(doc,id,patch){
  if(!isLightning(doc)||!profileDefinitions(doc).some(p=>p.id===id))throw new Error('Profile không tồn tại.');
  let section='',index=-1;
  doc.rows.forEach((row,i)=>{if(row[0]?.startsWith('###'))section=row[0];else if(section==='### AUTOFILL PROFILES ###'&&row[0]===id)index=i;});
  const rows=doc.rows.map(row=>[...row]);
  for(const[key,col]of Object.entries({name:1,site:2,hotkey:3}))if(Object.hasOwn(patch,key))rows[index][col]=String(patch[key]);
  if(!rows[index][1].trim())throw new Error('Tên profile không được để trống.');
  return openTemplate((doc.bom?'\uFEFF':'')+serializeCSV(doc,rows),doc.name,'csv');
}
export function updateRuleBatch(doc,ids,patch){
  if(!isLightning(doc))throw new Error('Chức năng này dùng cho file Lightning Autofill.');
  if(Object.hasOwn(patch,'profile')&&patch.profile&&!profileDefinitions(doc).some(p=>p.id===patch.profile))throw new Error('Profile đích không tồn tại.');
  if(Object.hasOwn(patch,'mode')&&!/^[0-6]$/.test(String(patch.mode)))throw new Error('Mode không hợp lệ.');
  const rules=lightningRules(doc),selected=rules.filter(rule=>ids.includes(rule.id));
  if(selected.length!==new Set(ids).size)throw new Error('Một số rule không còn trong file.');
  const rows=doc.rows.map(row=>[...row]);let affected=0;
  for(const rule of selected){
    let changed=false;
    if(Object.hasOwn(patch,'profile')&&rows[rule.row][6]!==patch.profile){rows[rule.row][6]=patch.profile;changed=true;}
    if(Object.hasOwn(patch,'mode')&&['0','1'].includes(rule.type)&&rows[rule.row][5]!==String(patch.mode)){rows[rule.row][5]=String(patch.mode);changed=true;}
    if(changed)affected++;
  }
  return{doc:openTemplate((doc.bom?'\uFEFF':'')+serializeCSV(doc,rows),doc.name,'csv'),affected};
}
function sectionEnd(doc,header){
  const start=doc.rows.findIndex(row=>row[0]===header);if(start<0)throw new Error('Thiếu section '+header);
  let end=doc.rows.findIndex((row,index)=>index>start&&row[0]?.startsWith('###'));
  if(end<0)end=doc.rows.length;
  while(end>start+1&&doc.rows[end-1].every(value=>value===''))end--;
  return end;
}
function nextId(ids,prefix){let number=1;while(ids.has(prefix+number))number++;return prefix+number;}
export function addProfile(doc,{name,site='',hotkey=''}){
  if(!isLightning(doc))throw new Error('Cần mở file Lightning Autofill.');
  if(!String(name).trim())throw new Error('Hãy đặt tên profile.');
  const id=nextId(new Set(profileDefinitions(doc).map(p=>p.id)),'c');
  const source=insertCSVRows(doc,sectionEnd(doc,'### AUTOFILL PROFILES ###'),[[id,String(name),String(site),String(hotkey)]]);
  return{doc:openTemplate((doc.bom?'\uFEFF':'')+source,doc.name,'csv'),id};
}
export function addRule(doc,{type='0',name='',value='',site='',mode='0',profile=''}){
  if(!isLightning(doc))throw new Error('Cần mở file Lightning Autofill.');
  if(!/^\d+$/.test(String(type)))throw new Error('Type phải là mã số được Lightning hỗ trợ.');
  if(!/^[0-6]$/.test(String(mode)))throw new Error('Mode không hợp lệ.');
  if(profile&&!profileDefinitions(doc).some(p=>p.id===profile))throw new Error('Profile không tồn tại.');
  const id=nextId(new Set(lightningRules(doc).map(r=>r.id)),'r');
  const source=insertCSVRows(doc,sectionEnd(doc,'### AUTOFILL RULES ###'),[[id,String(type),String(name),String(value),String(site),String(mode),String(profile)]]);
  return{doc:openTemplate((doc.bom?'\uFEFF':'')+source,doc.name,'csv'),id};
}
