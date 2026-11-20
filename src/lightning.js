import { parseJS, units, openTemplate } from './core.js';
import { serializeCSV } from './csv-preserve.js';

export const TYPE_INFO = {
  '0': { label:'Điền văn bản', family:'data', description:'Điền nội dung vào ô văn bản, email, số hoặc ngày.', field:'Giá trị điền vào ô' },
  '1': { label:'Điền mật khẩu', family:'data', description:'Điền vào ô mật khẩu. Nội dung được che trên giao diện.', field:'Mật khẩu' },
  '2': { label:'Chọn danh sách', family:'data', description:'Chọn option theo nội dung, value hoặc chỉ số. Template không chứa toàn bộ option của form.', field:'Option / chỉ số lựa chọn' },
  '3': { label:'Checkbox / Radio', family:'data', description:'Chọn hoặc bỏ chọn đáp án. Name xác định đích; Value giữ cú pháp lựa chọn của template.', field:'Giá trị chọn ô / đáp án' },
  '4': { label:'JavaScript', family:'automation', description:'Chạy mã khi Lightning Autofill thực thi rule. Chu0n’s Fieldwork chỉ sửa và kiểm tra, không chạy mã.', field:'Mã JavaScript' },
  '5': { label:'AUTOFILL', family:'automation', description:'Nhóm action CSV 5–12: thực thi profile. Cần đối chiếu phiên bản extension.', field:'Profile / tham số' },
  '6': { label:'CLICK · Bấm phần tử', family:'automation', description:'Nhóm action CSV 5–12: bấm phần tử theo Name (selector/XPath).', field:'Đích bấm (Name)' },
  '7': { label:'DISPATCH · Phát sự kiện', family:'automation', description:'Nhóm action CSV 5–12: phát sự kiện đến phần tử.', field:'Tên sự kiện (Value)' },
  '8': { label:'OPEN · Mở trang', family:'automation', description:'Nhóm action CSV 5–12: mở URL.', field:'URL (Value)' },
  '9': { label:'RELOAD · Tải lại', family:'automation', description:'Nhóm action CSV 5–12: tải lại theo đích và tham số gốc.', field:'Tham số gốc' },
  '10': { label:'SCRAPE · Trích nội dung', family:'automation', description:'Nhóm action CSV 5–12: trích nội dung phần tử vào biến.', field:'Tên biến (Value)' },
  '11': { label:'STYLE · Đổi giao diện', family:'automation', description:'Nhóm action CSV 5–12: áp dụng CSS.', field:'CSS (Value)' },
  '12': { label:'WAIT · Chờ', family:'automation', description:'Nhóm action CSV 5–12: chờ. Giữ đúng cột và đơn vị trong file, không tự đổi ms/giây.', field:'Tham số chờ gốc' },
};
export const MODE_NAMES=['Chỉ điền ô trống','Ghi đè nội dung','Thêm vào đầu','Thêm vào cuối','Bọc nội dung','Tăng 1','Giảm 1'];
export function isLightning(doc) { return !!doc.rows?.some(r=>r[0]==='### AUTOFILL RULES ###'); }
export function profileDefinitions(doc){
  const result=[];let section='';
  for(const row of doc.rows||[]){if(row[0]?.startsWith('###')){section=row[0];continue;}if(section==='### AUTOFILL PROFILES ###'&&row[0]&&row[0]!=='Profile ID')result.push({id:row[0],name:row[1]||row[0],site:row[2]||'',hotkey:row[3]||''});}
  return result;
}
export function selectorKind(name) {
  if(!name) return 'Không có đích Name';
  if(name.startsWith('//') || name.startsWith('/html/')) return 'XPath';
  if(/^\/.+\/[a-z]*$/s.test(name)) return 'Biểu thức regex';
  if(/^".*"$/s.test(name)) return 'Khớp chính xác';
  return 'Khớp chuỗi / CSS fallback';
}
function readableTarget(name) {
  if(name.startsWith('//')||name.startsWith('/html/'))return name;
  let text=name.replace(/^"|"$/g,'').replace(/^\/\^?/,'').replace(/\$?\/[a-z]*$/,'').replace(/\\\|/g,'|').replace(/\\\*/g,'*');
  if(!text || /^[.\-\s*]+$/.test(text)) return '';
  return text;
}
export function jsConstants(code) {
  const found=[];
  try {
    const root=parseJS(code);
    function walk(node){
      if(!node||typeof node!=='object')return;
      if(node.type==='VariableDeclarator'&&node.id?.type==='Identifier'&&node.init?.type==='Literal'&&typeof node.init.value==='string'&&node.init.value.length<=500) {
        found.push({name:node.id.name,value:node.init.value,start:node.init.start+1,end:node.init.end-1});
      }
      for(const value of Object.values(node)) {if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
    }
    walk(root);
  }catch{/* Syntax diagnostics are handled by the core. */}
  return found.filter(c=>/FILE|EMAIL|NAME|URL|TARGET|PHONE|ID|TOKEN/i.test(c.name)).slice(0,8);
}
export function scriptSignals(code) {
  const signals=[];
  if(/TARGET_FILE_NAME/.test(code))signals.push('Tên ảnh / tệp');
  if(/\.click\s*\(/.test(code))signals.push('Có lệnh click()');
  if(/Tiếp|Next/.test(code)&&/\.click\s*\(/.test(code))signals.push('Có nhắc nút Tiếp');
  if(/Gửi|Submit/.test(code)&&/\.click\s*\(/.test(code))signals.push('Có nhắc nút Gửi');
  if(/window\.open|location\.(?:href|assign|replace)/.test(code))signals.push('Có mở / chuyển trang');
  if(/setInterval|setTimeout/.test(code))signals.push('Có bộ hẹn giờ');
  return signals;
}
export function lightningRules(doc,fields=[]) {
  if(!isLightning(doc))return units(doc).map(u=>({id:u.id,row:u.row,type:'text',info:{label:u.context==='js'?'JavaScript':'Văn bản',family:'data',field:'Nội dung',description:'File văn bản / CSV thông thường.'},title:u.title,target:u.title,selector:'',unitId:u.id,value:u.value,editColumn:u.col,profile:'',site:'',mode:'',constants:u.context==='js'?jsConstants(u.value):[],signals:[],bindings:fields.filter(f=>f.bindings.some(b=>b.unitId===u.id)),generic:true}));
  let section='';const profiles=new Map();
  for(const row of doc.rows) {
    if(row[0]?.startsWith('###')){section=row[0];continue;}
    if(section==='### AUTOFILL PROFILES ###'&&row[0]&&row[0]!=='Profile ID')profiles.set(row[0],{name:row[1],site:row[2],hotkey:row[3]});
  }
  section='';const result=[];
  doc.rows.forEach((row,index)=>{
    if(row[0]?.startsWith('###')){section=row[0];return;}
    if(section!=='### AUTOFILL RULES ###'||!row[0]||row[0]==='Rule ID')return;
    const type=row[1],info=TYPE_INFO[type]||{label:`Chưa nhận diện · Type ${type}`,family:'unknown',description:'Giữ dữ liệu gốc; cần xác minh loại rule theo phiên bản extension.',field:'Value gốc'};
    const profile=profiles.get(row[6]);
    const legacyNameParameter=(type==='12' && !row[3] && row[2]);
    const editColumn=type==='6'||legacyNameParameter?2:3;
    const unitId=`${index}:${editColumn}`;
    const associated=fields.filter(f=>f.bindings.some(b=>b.unitId===unitId));
    const target=readableTarget(row[2]||'');
    const constants=type==='4'?jsConstants(row[3]||''):[];
    const signals=type==='4'?scriptSignals(row[3]||''):[];
    const actionTitles={'5':'Thực thi profile','6':'Bấm phần tử trên trang','7':'Phát sự kiện tới phần tử','8':'Mở địa chỉ trang','9':'Tải lại trang','10':'Trích nội dung phần tử','11':'Áp dụng CSS','12':'Chờ / timeout'};
    const title=type==='4'?(constants.some(c=>c.name==='TARGET_FILE_NAME')?'Cấu hình ảnh / tệp trong code':`Mã tự động hóa · ${row[0]}`):associated[0]?.label || actionTitles[type] || target || `Chưa đặt tên · ${row[0]}`;
    result.push({id:row[0],row:index,type,info,title,target:target||'Chưa có tên đích dễ đọc',selector:row[2]||'',selectorKind:selectorKind(row[2]||''),unitId,value:row[editColumn]||'',editColumn,profileId:row[6]||'',profile:profile?.name||row[6]||'Unfiled',site:row[4]||profile?.site||'Mọi trang',siteSource:row[4]?'Rule':profile?.site?'Profile':'Không giới hạn',hotkey:profile?.hotkey||'',mode:['0','1'].includes(type)?MODE_NAMES[Number(row[5])]||`Mode ${row[5]}`:'Không áp dụng chế độ điền văn bản',modeCode:row[5]||'',constants,signals,bindings:associated,legacyNameParameter:!!legacyNameParameter,actionVersion:Number(type)>=5?'CSV actions 5–12; cần đối chiếu phiên bản extension':'',generic:false});
  });
  return result;
}
export function updateRuleMetadata(doc,rowIndex,patch,fields=[]) {
  const rule=lightningRules(doc).find(r=>r.row===rowIndex);
  if(!isLightning(doc)||!rule)throw new Error('Không tìm thấy rule Lightning hợp lệ.');
  const columns={type:1,name:2,site:4,mode:5,profile:6};
  const rows=doc.rows.map(r=>[...r]);const invalid=new Set();
  for(const [key,col] of Object.entries(columns)){
    if(!Object.hasOwn(patch,key))continue;
    const value=String(patch[key]);
    if(rows[rowIndex][col]===value)continue;
    rows[rowIndex][col]=value;
    if(key==='name')invalid.add(`${rowIndex}:2`);
    if(key==='type')for(let c=0;c<7;c++)invalid.add(`${rowIndex}:${c}`);
  }
  const next=openTemplate((doc.bom?'\uFEFF':'')+serializeCSV(doc,rows),doc.name,'csv');
  const retained=fields.map(f=>({...f,bindings:f.bindings.filter(b=>!invalid.has(b.unitId))})).filter((f,index)=>f.bindings.length||!fields[index].bindings.length);
  return{doc:next,fields:retained,removedBindings:fields.reduce((n,f)=>n+f.bindings.filter(b=>invalid.has(b.unitId)).length,0)};
}
