import Papa from 'papaparse';
// Keep the original CSV spelling. Only replace the raw spans of edited cells.
// Delimiters, optional quotes, mixed line endings, empty rows and other cells stay intact.
const layouts=new WeakMap();
function cellSpans(doc){
  if(layouts.has(doc))return layouts.get(doc);
  const source=doc.source,delimiter=doc.delimiter;const rows=[];let row=[],start=0,index=0,quoted=false;
  while(index<source.length){
    if(quoted){
      if(source[index]==='"'){
        if(source[index+1]==='"'){index+=2;continue;}
        quoted=false;
      }
      index++;continue;
    }
    if(index===start&&source[index]==='"'){quoted=true;index++;continue;}
    if(source.startsWith(delimiter,index)){
      row.push({start,end:index});index+=delimiter.length;start=index;continue;
    }
    if(source[index]==='\r'||source[index]==='\n'){
      row.push({start,end:index});rows.push(row);row=[];
      index+=source[index]==='\r'&&source[index+1]==='\n'?2:1;start=index;continue;
    }
    index++;
  }
  row.push({start,end:source.length});rows.push(row);
  if(quoted||rows.length!==doc.rows.length||rows.some((cells,i)=>cells.length!==doc.rows[i].length))throw new Error('Không xác định được vị trí ô CSV để giữ nguyên nguồn.');
  layouts.set(doc,rows);return rows;
}
export function serializeCSV(doc,rows){
  if(rows.length!==doc.rows.length||rows.some((row,i)=>row.length!==doc.rows[i].length))throw new Error('Không thể thay cấu trúc bảng khi xuất giữ nguyên nguồn.');
  const changed=[];
  rows.forEach((row,ri)=>row.forEach((value,ci)=>{if(String(value)!==doc.rows[ri][ci])changed.push({row:ri,col:ci,value:String(value)});}));
  if(!changed.length)return doc.source;
  const spans=cellSpans(doc);
  const edits=changed.map(change=>{
    const span=spans[change.row][change.col],raw=doc.source.slice(span.start,span.end),value=change.value;
    const quoted=raw.startsWith('"')||value.includes('"')||value.includes(doc.delimiter)||/[\r\n]/.test(value)||/^\s|\s$/.test(value);
    return{...span,value:quoted?'"'+value.replace(/"/g,'""')+'"':value};
  }).sort((a,b)=>b.start-a.start);
  let output=doc.source;
  for(const edit of edits)output=output.slice(0,edit.start)+edit.value+output.slice(edit.end);
  return output;
}
export function insertCSVRows(doc,index,rows){
  if(!rows.length)return doc.source;
  if(!Number.isInteger(index)||index<0||index>doc.rows.length)throw new Error('Vị trí thêm dòng không hợp lệ.');
  const offset=index===doc.rows.length?doc.source.length:cellSpans(doc)[index][0].start;
  const text=Papa.unparse(rows,{delimiter:doc.delimiter,newline:doc.newline});
  const prefix=offset>0&&!/[\r\n]/.test(doc.source[offset-1])?doc.newline:'';
  const suffix=offset<doc.source.length||/[\r\n]$/.test(doc.source)?doc.newline:'';
  return doc.source.slice(0,offset)+prefix+text+suffix+doc.source.slice(offset);
}
