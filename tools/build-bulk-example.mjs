import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import Papa from 'papaparse';
const dir=resolve('release/examples');await mkdir(dir,{recursive:true});
const rows=[['### AUTOFILL PROFILES ###'],['Profile ID','Name','Site','Hotkey'],['c1','HSK · Ví dụ dữ liệu giả','https://example.test/','Ctrl + Shift + H'],['### AUTOFILL RULES ###'],['Rule ID','Type','Name','Value','Site','Mode','Profile']];
const rule=(id,type,name,value)=>rows.push([id,String(type),name,value,'','0','c1']);
rule('r1',0,'HỌ VÀ TÊN','{{hsk:full_name}}');rule('r2',0,'EMAIL','{{hsk:email}}');rule('r3',0,'SỐ GIẤY TỜ','{{hsk:id_number}}');rule('r4',0,'NGÀY SINH','{{hsk:birth_date}}');rule('r5',0,'ĐIỆN THOẠI','{{hsk:phone}}');rule('r6',4,'',`// Ví dụ cấu hình; không thao tác form.\nconst EMAIL = "{{hsk:email}}";\nconst TARGET_FILE_NAME = '{{hsk:file_name}}';`);rule('r7',2,'GIỚI TÍNH','"Nữ"');rule('r8',3,'ĐỒNG Ý','1');
rows.push(['### AUTOFILL SETTINGS ###'],['activecat','c1']);
await writeFile(resolve(dir,'HSK-template-variables.csv'),Papa.unparse(rows,{newline:'\r\n'}),'utf8');
await writeFile(resolve(dir,'HSK-data-example.csv'),Papa.unparse([
 ['hsk:full_name','hsk:email','hsk:id_number','hsk:birth_date','hsk:phone','hsk:file_name'],
 ['NGUYEN TEST AN','an@example.test','000000000001','2000-01-25','0900000001','an.jpg'],
 ['TRAN TEST BINH','binh@example.test','000000000002','2001-06-02','0900000002','binh.jpg']
],{newline:'\r\n'}),'utf8');
await copyFile('docs/BULK-FILL.md',resolve(dir,'HUONG-DAN-HANG-LOAT.md'));
// Separate AI-shaped records for demonstrating multi-file selection; all values are fictitious.
for(const [n,name,email,id] of [[1,'Nguyễn Test An','an@example.test','000000000001'],[2,'Trần Test Bình','binh@example.test','000000000002']])await writeFile(resolve(dir,'AI-person-'+n+'.json'),JSON.stringify([{'hsk:full_name':name,'hsk:email':email,'hsk:id_number':id,'hsk:birth_date':'2000-01-25','hsk:phone':'090000000'+n,'hsk:file_name':'example-'+n+'.jpg'}],null,2),'utf8');
