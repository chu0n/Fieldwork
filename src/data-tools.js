import {parseRecords} from './bulk-data.js';
import {parseLLMOutput} from './llm-schema.js';
import {transformed} from './core.js';

export const textTools=[['upper','IN HOA'],['ascii-upper','Bỏ dấu, IN HOA'],['lower','viết thường'],['trim','Bỏ khoảng trắng đầu/cuối'],['spaces','Gọn khoảng trắng'],['source','Khôi phục từ nguồn']];
export function formatText(value,tool){
 if(['upper','ascii-upper','trim'].includes(tool))return transformed(value,tool);
 if(tool==='lower')return value.toLocaleLowerCase('vi');
 if(tool==='spaces')return value.trim().replace(/\s+/gu,' ');
 throw new Error('Công cụ định dạng không hợp lệ.');
}
// Read every file before committing anything; align columns by exact names, never by position.
export function combineDataFiles(files,{fields=[],ai=false,format='json'}={}){
 if(!files.length||files.length>50)throw new Error('Chọn từ 1 đến 50 file mỗi lượt.');
 if(files.reduce((n,f)=>n+new TextEncoder().encode(f.text).length,0)>2_000_000)throw new Error('Tổng file dữ liệu tối đa 2 MB.');
 let headers,rows=[];
 for(const file of files){
  let data;try{data=ai?parseLLMOutput(file.text,format,fields):parseRecords(file.text,/\.tsv$/i.test(file.name)?'tsv':'auto');}catch(error){throw new Error(file.name+': '+error.message);}
  headers??=data.headers;
  if(data.headers.length!==headers.length||headers.some(h=>!data.headers.includes(h)))throw new Error(file.name+': bộ cột khác các file trước. Chọn các file dùng cùng bộ trường.');
  const sourceColumns=headers.map(h=>data.headers.indexOf(h));
  rows.push(...data.rows.map(row=>sourceColumns.map(i=>row[i])));
  if(rows.length>500)throw new Error('Tổng cộng tối đa 500 người mỗi lượt.');
 }
 const data={headers,rows};
 if(JSON.stringify(data).length>2_000_000)throw new Error('Dữ liệu gộp vượt 2 MB. Hãy chia nhỏ.');
 return data;
}
