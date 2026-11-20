import {diffChars} from 'diff';
function textareaOffsets(source){
 const offsets=[0];for(let i=0;i<source.length;i++){if(source[i]==='\r'&&source[i+1]==='\n')i++;offsets.push(i+1);}return offsets;
}
// Browser textareas normalize line endings; keep original offsets and unchanged bytes.
export function sourceSelectionRange(source,start,end){
 const offsets=textareaOffsets(source);
 if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=offsets.length)throw new Error('Phạm vi bôi đen không hợp lệ.');
 return{start:offsets[start],end:offsets[end]};
}
export function restoreTextareaValue(source,value){
 const normalized=source.replace(/\r\n?/g,'\n');if(value===normalized)return source;if(!source.includes('\r'))return value;
 const changes=diffChars(normalized,value,{timeout:100});if(!changes)throw new Error('Không thể giữ nguyên xuống dòng khi sửa đoạn lớn. Hãy sửa từng phần nhỏ hơn.');
 const offsets=textareaOffsets(source),newline=source.match(/\r\n|\r|\n/)?.[0]||'\n';let position=0,output='';
 for(const part of changes){if(part.added)output+=part.value.replace(/\n/g,newline);else{if(!part.removed)output+=source.slice(offsets[position],offsets[position+part.value.length]);position+=part.value.length;}}
 return output;
}
export function decodeTemplateFile(bytes){
  try{
    // File.text() strips the UTF-8 BOM. Keep it so a no-edit download matches the file.
    return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  }catch{
    throw new Error('File không phải UTF-8 hợp lệ. Hãy chuyển encoding sang UTF-8 trước khi mở để tránh mất ký tự.');
  }
}
