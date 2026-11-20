import {uid,units,makeBinding,assertNoOverlap,renderTemplate,openTemplate} from './core.js';
import {lightningRules,isLightning} from './lightning.js';
export const keyPattern=/^[a-zA-Z][\w-]*:[a-zA-Z][\w.-]*$/;
export const markerPattern=()=>/\{\{([a-zA-Z][\w-]*:[a-zA-Z][\w.-]*)\}\}/g;
export function fieldKey(value){return String(value||'').trim().replace(/^\{\{|\}\}$/g,'');}
export function suggestedKey(label,namespace='field'){
 const slug=String(label).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
 return `${namespace}:${/^[a-z]/.test(slug)?slug:'value_'+(slug||'new')}`;
}
export function resolveFields(fields){
 const used=new Set();return fields.map(f=>{const explicit=fieldKey(f.key);let key=explicit||suggestedKey(f.label);if(!explicit){const base=key;let n=2;while(used.has(key))key=base+'_'+n++;}if(!keyPattern.test(key))throw new Error(`Mã trường không hợp lệ: ${key}. Dùng dạng hsk:email hoặc field:email.`);if(used.has(key))throw new Error(`Mã trường trùng: ${key}. Hãy dùng một trường cho các vị trí cần cùng dữ liệu.`);used.add(key);return{...f,key};});
}
export function discoverFields(doc){
 const fields=[],issues=[],eligible=isLightning(doc)?new Set(lightningRules(doc).flatMap(r=>[`${r.row}:2`,`${r.row}:3`])):null;
 for(const unit of units(doc)){
   if(eligible&&!eligible.has(unit.id))continue;
   for(const match of unit.value.matchAll(markerPattern())){
     try{
       const binding=makeBinding(doc,unit.id,match.index,match.index+match[0].length);assertNoOverlap(fields,binding);
       let field=fields.find(f=>f.key===match[1]);
       if(!field){const tail=match[1].split(':')[1],labels={full_name:'Họ và tên',email:'Email',phone:'Số điện thoại',id_number:'Số giấy tờ',birth_date:'Ngày sinh',file_name:'Tên ảnh / tệp',bank:'Ngân hàng',account_number:'Số tài khoản'};field={id:uid(),key:match[1],label:Object.hasOwn(labels,tail)?labels[tail]:tail.replace(/[_.-]+/g,' '),type:tail==='email'?'email':['birth_date','dob','date'].includes(tail)?'date':'text',transform:'none',required:true,value:'',bindings:[]};fields.push(field);}
       field.bindings.push(binding);
     }catch(error){issues.push(`${unit.title}: ${error.message}`);}
   }
 }
 return{fields,issues};
}
export function standardizeTemplate(doc,fields){
 const keyed=resolveFields(fields);if(!keyed.length)throw new Error('Chọn ít nhất một ô làm trường dữ liệu trước.');
 const result=renderTemplate(doc,keyed.map(f=>({...f,value:`{{${f.key}}}`,type:'text',required:false,transform:'none'})));
 if(result.problems.length)throw new Error(result.problems.join('\n'));
 const next=openTemplate(result.output,doc.name,doc.kind),found=discoverFields(next);
 if(found.issues.length||found.fields.length!==keyed.length)throw new Error('Có vị trí không thể chuẩn hóa tự động. Kiểm tra các chuỗi được chọn trong code.');
 const normalized=found.fields.map(f=>({...f,...Object.fromEntries(['label','type','transform','required','description','instructions','example','aliases','allowedValues'].map(k=>[k,keyed.find(x=>x.key===f.key)[k]]))}));
 return{doc:next,fields:normalized};
}
