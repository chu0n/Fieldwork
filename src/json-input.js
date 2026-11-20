import {parseExpressionAt} from 'acorn';
function parseJSON(source){
 try{return JSON.parse(source);}catch(error){
  const line=error.message.match(/line (\d+) column (\d+)/i),position=error.message.match(/position (\d+)/i);
  const location=line?` (dòng ${line[1]}, cột ${line[2]})`:position?` (vị trí ${Number(position[1])+1})`:'';
  if(/after JSON|non-whitespace/i.test(error.message))throw new Error('JSON có nội dung thừa sau phần dữ liệu đã kết thúc'+location+'. Có thể bạn đã dán nhiều kết quả liền nhau. Cần một danh sách duy nhất dạng [{…}, {…}], không kèm lời giải thích.');
  throw new Error('JSON chưa đúng cú pháp'+location+'. Kiểm tra dấu nháy kép, dấu phẩy và ngoặc đóng. Chỉ dán phần dữ liệu, không kèm lời giải thích hoặc khung ``` của AI.');
 }
}
function decimalValue(raw){
 const [,sign,whole,fraction='',exponent='0']=raw.match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i);
 const digits=(whole+fraction).replace(/^0+/,'');if(!digits)return '0';
 const power=Number(exponent);if(!Number.isSafeInteger(power))return null;
 const significant=digits.replace(/0+$/,'');
 return sign+significant+'e'+(power-fraction.length+digits.length-significant.length);
}
export function readJSON(source,{exactNumbers=false}={}){
 const text=source.trimStart(),value=parseJSON(source),syntax=parseExpressionAt(text,0,{ecmaVersion:'latest'});
 const visit=node=>{
  if(node?.type==='ObjectExpression'){
   const keys=node.properties.map(p=>p.key.value);if(new Set(keys).size!==keys.length)throw new Error('key JSON bị lặp. Không tự chọn giá trị cuối.');
   node.properties.forEach(p=>visit(p.value));
  }else if(node?.type==='ArrayExpression')node.elements.forEach(visit);
  else if(exactNumbers&&(node?.type==='Literal'&&typeof node.value==='number'||node?.type==='UnaryExpression'&&typeof node.argument.value==='number')){
   const number=node.type==='Literal'?node.value:-node.argument.value,raw=text.slice(node.start,node.end);
   if(!Number.isFinite(number)||decimalValue(raw)!==decimalValue(String(number)))throw new Error('Giá trị số JSON mất độ chính xác khi đọc. Đặt giá trị trong dấu nháy kép để giữ nguyên dữ liệu.');
  }
 };
 visit(syntax);return value;
}
// Explicit repair only: preserve raw object text, including duplicate keys for later validation.
export function prepareJSONList(source){
 if(typeof source!=='string'||source.length>2_000_000)throw new Error('Dữ liệu tối đa 2 MB.');
 const text=source.trim(),parts=[];let offset=0;
 while(offset<text.length){
  while(/\s/.test(text[offset]||'')&&offset<text.length)offset++;
  if(offset===text.length)break;
  const start=offset;if(!['[','{'].includes(text[start]))throw new Error('Chỉ gộp được các object hoặc danh sách JSON, không kèm văn bản.');
  const stack=[];let quoted=false,escaped=false;
  for(;offset<text.length;offset++){
   const c=text[offset];
   if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
   if(c==='"'){quoted=true;continue;}
   if(c==='{'||c==='[')stack.push(c);
   if(c==='}'||c===']'){if(stack.pop()!==(c==='}'?'{':'['))throw new Error('Ngoặc JSON chưa khớp.');if(!stack.length){offset++;break;}}
  }
  const raw=text.slice(start,offset),value=parseJSON(raw);
  const records=Array.isArray(value)?value:[value];
  if(records.some(record=>!record||Array.isArray(record)||typeof record!=='object'))throw new Error('Mỗi người phải là một object JSON.');
  if(records.length)parts.push(Array.isArray(value)?raw.slice(1,-1):raw);
 }
 const candidate='[\n'+parts.join(',\n')+'\n]',records=parseJSON(candidate);
 if(!records.length||records.length>500)throw new Error('Cần từ 1 đến 500 người.');
 if(candidate.length>2_000_000)throw new Error('Dữ liệu sau gộp vượt 2 MB.');
 return {source:candidate,count:records.length};
}
