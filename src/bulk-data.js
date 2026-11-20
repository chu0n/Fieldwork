import Papa from 'papaparse';
import {readJSONRecords} from './json-input.js';
import {resolveFields} from './data-fields.js';
import {MAX_DATA_FIELDS,assertDataFields} from './data-limits.js';
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/^\{\{|\}\}$/g,'').replace(/[^\p{L}\p{N}]/gu,'');
const aliases={full_name:['ho va ten','ho ten','ten thi sinh','fullname','name'],email:['email','gmail','email lien he'],phone:['sdt','so dien thoai','phone','telephone'],birth_date:['ngay sinh','dob','birthdate'],id_number:['cccd','so cccd','so giay to','cmnd','idnumber'],file_name:['ten anh','ten file','anh','targetfilename','filename'],bank:['ngan hang','bank'],account_number:['so tai khoan','stk','accountnumber']};
const MAX_RECORDS=500;
function assertDimensions(rowCount,columnCount){
 if(rowCount>MAX_RECORDS||columnCount>MAX_DATA_FIELDS)throw new Error(`Tối đa ${MAX_RECORDS} người và ${MAX_DATA_FIELDS} cột mỗi lượt.`);
}
function recordHeaders(records){
 assertDimensions(records.length,0);
 const headers=new Set();
 for(const record of records){
  for(const key of Object.keys(record)){
   headers.add(key);
   assertDimensions(records.length,headers.size);
  }
 }
 return [...headers];
}
export function parseRecords(source,format='auto'){
 if(typeof source!=='string'||source.length>2_000_000)throw new Error('Dữ liệu tối đa 2 MB.');
 const text=source.replace(/^\uFEFF/,'').replace(/^(?:\r\n?|\n)+|(?:\r\n?|\n)+$/g,'');if(!text.trim())throw new Error('Dán dữ liệu hoặc chọn file trước.');
 let headers,rows;
 if(format==='json'||format==='auto'&&/^[\[{]/.test(text.trimStart())){
   const records=readJSONRecords(text,{exactNumbers:true});
   headers=recordHeaders(records);rows=records.map((record,i)=>headers.map(key=>{const v=Object.hasOwn(record,key)?record[key]:undefined;if(v!=null&&!['string','number','boolean'].includes(typeof v))throw new Error(`Người ${i+1}: cột ${key} phải là giá trị đơn.`);if(typeof v==='number'&&(!Number.isFinite(v)||Number.isInteger(v)&&!Number.isSafeInteger(v)))throw new Error(`Người ${i+1}: số quá dài; lưu CCCD/STK dưới dạng chuỗi có dấu nháy.`);return v==null?'':String(v);}));
 }else if(format==='labels'){
   const lines=text.replace(/\r\n?/g,'\n');
   const blocks=lines.split(/\n(?:[^\S\n]*\n)+/,MAX_RECORDS+1);
   assertDimensions(blocks.length,0);
   const records=blocks.map((block,i)=>{const record=Object.create(null);for(const line of block.split(/\r?\n/)){const m=line.match(/^\s*([^:：]+)[:：]\s*(.*)$/);if(!m)throw new Error(`Người ${i+1}: dùng mỗi dòng “Tên trường: giá trị”, cách người bằng dòng trống.`);const key=m[1].trim();if(Object.hasOwn(record,key))throw new Error(`Người ${i+1}: trường ${key} bị lặp.`);record[key]=m[2];}return record;});
   headers=recordHeaders(records);rows=records.map(r=>headers.map(h=>r[h]??''));
 }else{
   const records=[];let cursor=0;
   Papa.parse(text,{skipEmptyLines:false,dynamicTyping:false,delimiter:format==='tsv'?'\t':'',step(result){
     if(result.errors.some(e=>e.code!=='UndetectableDelimiter'))throw new Error('Bảng CSV/TSV có dấu nháy hoặc số cột không hợp lệ.');
     const raw=text.slice(cursor,result.meta.cursor);cursor=result.meta.cursor;
     // Only a physically empty line is absent; quoted empty cells still identify a record.
     if(raw.replace(/[\r\n]+$/,'')!==''){
       assertDimensions(records.length,result.data.length);
       records.push(result.data);
     }
   }});
   [headers,...rows]=records;headers=headers?.map(h=>h.trim());
 }
 return validateRecords({headers,rows});
}
export function validateRecords({headers,rows}){
 if(!Array.isArray(headers)||!Array.isArray(rows)||!headers.length||!rows.length)throw new Error('Cần dòng tiêu đề và ít nhất một người.');
 assertDimensions(rows.length,headers.length);
 if(headers.some(h=>typeof h!=='string')||rows.some(row=>!Array.isArray(row)||row.some(v=>typeof v!=='string')))throw new Error('Tên cột và giá trị dữ liệu phải là chuỗi.');
 // In Unicode mode valid surrogate pairs are read as one code point.
 const invalidUnicode=/[\uD800-\uDFFF]/u;
 if(headers.some(h=>invalidUnicode.test(h))||rows.some(row=>row.some(v=>invalidUnicode.test(v))))throw new Error('Dữ liệu chứa ký tự Unicode không hợp lệ. Kiểm tra lại file nguồn.');
 if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('Tên cột trống hoặc trùng. Hãy đổi tiêu đề cột.');
 if(rows.some(r=>r.length!==headers.length))throw new Error('Số ô trong một số dòng không khớp dòng tiêu đề.');
 if(headers.reduce((n,h)=>n+h.length,0)+rows.reduce((n,row)=>n+row.reduce((sum,v)=>sum+v.length,0),0)>2_000_000)throw new Error('Dữ liệu tối đa 2 MB.');
 return{headers,rows};
}
export function suggestMapping(fields,headers){
 const mapping={};for(const field of resolveFields(fields)){
   const suffix=field.key.split(':')[1],names=[field.key,field.label,suffix,...(field.aliases||[]),...(aliases[suffix]||[])].map(normalize);
   const exact=headers.filter(h=>h===field.key);
   const matches=exact.length?exact:headers.filter(h=>names.includes(normalize(h)));
   mapping[field.id]=matches.length===1?matches[0]:'';
 }return mapping;
}
export function normalizeCell(value,field,dateFormat='iso'){
 let text=String(value??'');
 if(field.type==='date'&&text&&dateFormat!=='iso'){
   const match=(field.transform==='trim'?text.trim():text).match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
   if(match){const[_,a,b,y]=match;text=`${y}-${(dateFormat==='dmy'?b:a).padStart(2,'0')}-${(dateFormat==='dmy'?a:b).padStart(2,'0')}`;}
 }
 return text;
}
export function safeFileName(name){return String(name).normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/g,'').slice(0,100)||'record';}
export function dataSheet(fields){assertDataFields(fields);const keyed=resolveFields(fields);return Papa.unparse([keyed.map(f=>f.key),keyed.map(()=> '')],{newline:'\r\n'});}
