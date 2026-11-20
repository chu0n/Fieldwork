import {headerRepairCandidate} from './usability.js';
import Papa from 'papaparse';
import { parse } from 'acorn';
import { serializeCSV } from './csv-preserve.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {readJSON} from './json-input.js';
export const PROJECT_FILE_LIMIT=12_000_000;

export const uid = () => globalThis.crypto?.randomUUID?.() ?? `f-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function parseJS(code) {
  try { return parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }); }
  catch { return parse(code, { ecmaVersion: 'latest', sourceType: 'module' }); }
}
function literals(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'Literal' && typeof node.value === 'string') out.push(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) for (const item of value) literals(item, out);
    else if (value && typeof value === 'object') literals(value, out);
  }
  return out;
}
export function openTemplate(source, name = 'template.txt', format = 'auto') {
  if (typeof source !== 'string' || source.length > 8_000_000) throw new Error('File không hợp lệ hoặc lớn hơn giới hạn 8 MB ký tự.');
  if(typeof name!=='string'||!['auto','text','csv','json','javascript'].includes(format))throw new Error('Tên file hoặc định dạng template không hợp lệ.');
  const bom = source.startsWith('\uFEFF');
  const text = bom ? source.slice(1) : source;
  let kind = format;
  if (kind === 'auto') {
    const lightning=text.includes('### AUTOFILL')&&Papa.parse(text,{skipEmptyLines:false}).data.some(row=>['### AUTOFILL PROFILES ###','### AUTOFILL RULES ###'].includes(row[0]));
    kind = /\.json$/i.test(name) ? 'json' : /\.(m?js|cjs)$/i.test(name) ? 'javascript'
      : /\.csv$/i.test(name) || lightning ? 'csv' : 'text';
  }
  let rows = null, delimiter = ',', newline = text.includes('\r\n') ? '\r\n' : '\n';
  if (kind === 'csv') {
    const result = Papa.parse(text, { skipEmptyLines: false });
    const fatal = result.errors.filter(e => e.code !== 'UndetectableDelimiter');
    if (fatal.length) throw new Error(`CSV không hợp lệ: ${fatal[0].message} (record ${Number(fatal[0].row ?? 0) + 1}).`);
    rows = result.data;
    delimiter = result.meta.delimiter || ',';
  }
  const doc = { name, source: text, kind, bom, rows, delimiter, newline };
  if (kind === 'json') readJSON(text);
  if (kind === 'javascript') parseJS(text);
  return doc;
}
export function units(doc) {
  if (!doc.rows) return [{ id: 'text', row: 0, col: 0, title: doc.name, value: doc.source, context: doc.kind === 'javascript' ? 'js' : doc.kind === 'json' ? 'json' : 'text' }];
  const out = [];
  const lightning = doc.rows.some(r=>r[0]==='### AUTOFILL RULES ###');
  let section='';
  doc.rows.forEach((row, ri) => {
    if(row[0]?.startsWith('###'))section=row[0];
    const rule=lightning&&section==='### AUTOFILL RULES ###'&&row[0]&&row[0]!=='Rule ID';
    row.forEach((value, ci) => {
      if (row.length === 1 && value === '') return;
      out.push({ id: `${ri}:${ci}`, row: ri, col: ci, title: lightning && /^r\d+$/.test(row[0]) ? `${row[0]} · ${['Rule ID', 'Type', 'Name', 'Value', 'Site', 'Mode', 'Profile'][ci]}` : `Hàng ${ri + 1} · Cột ${ci + 1}`, value,
        context: rule && row[1] === '4' && ci === 3 ? 'js' : 'text' });
    });
  });
  return out;
}

export function occurrences(value, needle) {
  if (!needle) return [];
  const out = [];
  let pos = 0;
  while ((pos = value.indexOf(needle, pos)) !== -1) { out.push([pos, pos + needle.length]); pos += needle.length; }
  return out;
}
export function makeBinding(doc, unitId, start, end, context = null) {
  return bindUnit(units(doc).find(u => u.id === unitId), start, end, context);
}
function bindUnit(unit, start, end, context) {
  if (!unit || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > unit.value.length) throw new Error('Hãy chọn chính xác một đoạn nội dung cần thay.');
  const mode = context ?? unit.context;
  const binding = { unitId: unit.id, start, end, expected: unit.value.slice(start, end), mode: 'text' };
  if (mode === 'js' || mode === 'json') {
    // JSON parses as a parenthesized expression, keeping string literal ranges aligned.
    const code = mode === 'json' ? `(${unit.value})` : unit.value;
    const offset = mode === 'json' ? 1 : 0;
    const literal = literals(parseJS(code)).find(l => l.start + 1 <= start + offset && l.end - 1 >= end + offset);
    if (!literal) throw new Error('Vị trí này không nằm trong chuỗi có dấu nháy được hỗ trợ. Hãy chọn nội dung bên trong một string literal.');
    if(start===end&&literal.value!=='')throw new Error('Hãy chọn nội dung cần thay, hoặc một chuỗi rỗng.');
    const literalStart = literal.start - offset, literalEnd = literal.end - offset;
    const rawContent = unit.value.slice(literalStart + 1, literalEnd - 1);
    const escaped = rawContent !== literal.value;
    if (escaped && (start !== literalStart + 1 || end !== literalEnd - 1)) throw new Error('Chuỗi có escape sẵn: hãy chọn toàn bộ nội dung giữa hai dấu nháy để liên kết.');
    binding.mode = 'literal';
    binding.literalStart = literalStart;
    binding.literalEnd = literalEnd;
    binding.literalValue = literal.value;
    binding.innerStart = escaped ? 0 : start - literalStart - 1;
    binding.innerEnd = escaped ? literal.value.length : end - literalStart - 1;
  }else if(start===end&&unit.value!=='')throw new Error('Hãy chọn chính xác một đoạn nội dung cần thay.');
  return binding;
}
export function assertNoOverlap(fields, candidate) {
  for (const f of fields) for (const b of f.bindings) {
    if (b.unitId === candidate.unitId && ((b.start < candidate.end && candidate.start < b.end) || (b.start === b.end && candidate.start === candidate.end && b.start === candidate.start))) throw new Error(`Vị trí này đã thuộc trường “${f.label}”.`);
    if (b.unitId === candidate.unitId && b.mode !== candidate.mode && ((b.literalStart ?? b.start) < (candidate.literalEnd ?? candidate.end)) && ((candidate.literalStart ?? candidate.start) < (b.literalEnd ?? b.end))) throw new Error('Hai kiểu liên kết chồng lên cùng một chuỗi.');
  }
}
function edits(value, changes) {
  const sorted = [...changes].sort((a, b) => b.start - a.start);
  let last = value.length;
  for (const change of sorted) {
    if (change.end > last) throw new Error('Các vị trí thay thế bị chồng lấn.');
    value = value.slice(0, change.start) + change.value + value.slice(change.end);
    last = change.start;
  }
  return value;
}
export function transformed(value, transform) {
  if (transform === 'upper') return value.toLocaleUpperCase('vi');
  if (transform === 'ascii-upper') return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toUpperCase();
  if (transform === 'trim') return value.trim();
  return value;
}
export function renderTemplate(doc, fields) {
  const problems = [], changed = [], sourceUnits = units(doc), rendered = new Map(sourceUnits.map(u => [u.id, u.value]));
  for (const field of fields) {
    const value=transformed(field.value,field.transform);
    if (field.required && !value.trim()) problems.push(`“${field.label}” chưa có giá trị.`);
    if (value && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) problems.push(`“${field.label}” không phải email hợp lệ.`);
    if (value && field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) problems.push(`“${field.label}” cần ngày hợp lệ dạng YYYY-MM-DD.`);
    if(value&&field.allowedValues?.length&&!field.allowedValues.includes(value))problems.push(`“${field.label}” không thuộc danh sách giá trị cho phép.`);
  }
  for (const unit of sourceUnits) {
    const changes = [], groups = new Map();
    for (const field of fields) for (const b of field.bindings.filter(b => b.unitId === unit.id)) {
      if (unit.value.slice(b.start, b.end) !== b.expected) { problems.push(`Liên kết “${field.label}” không còn khớp nguồn.`); continue; }
      const value = transformed(field.value, field.transform);
      if (b.mode === 'literal') {
        const key = `${b.literalStart}:${b.literalEnd}`;
        const group = groups.get(key) ?? { start: b.literalStart, end: b.literalEnd, source: b.literalValue, changes: [] };
        group.changes.push({ start: b.innerStart, end: b.innerEnd, value }); groups.set(key, group);
      } else changes.push({ start: b.start, end: b.end, value });
    }
    try {
      for (const group of groups.values()) {
        const value=edits(group.source,group.changes);
        if(value===group.source)continue;
        const encoded=JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
        const quote=unit.value[group.start];
        const literal=quote==="'"?"'"+encoded.slice(1,-1).replace(/\\"/g,'"').replace(/'/g,"\\'")+"'":encoded;
        changes.push({start:group.start,end:group.end,value:literal});
      }
      const result = edits(unit.value, changes);
      rendered.set(unit.id, result);
      if (result !== unit.value) changed.push({ ...unit, after: result });
      if (unit.context === 'js') parseJS(result);
      if (unit.context === 'json') readJSON(result);
    } catch (e) { problems.push(`${unit.title}: ${e.message}`); }
  }
  const known = new Set(sourceUnits.map(u => u.id));
  for (const f of fields) for (const b of f.bindings) if (!known.has(b.unitId)) problems.push(`Không tìm thấy vị trí của “${f.label}”.`);
  let output;
  if (doc.rows) {
    const rows = doc.rows.map((row, ri) => row.map((v, ci) => rendered.get(`${ri}:${ci}`) ?? v));
    try{output=serializeCSV(doc,rows);}catch(error){problems.push(error.message);output=doc.source;}
    const reparsed = Papa.parse(output, { delimiter: doc.delimiter, skipEmptyLines: false });
    if (reparsed.errors.length || JSON.stringify(reparsed.data) !== JSON.stringify(rows)) problems.push('Kiểm tra đọc lại CSV thất bại.');
    if (doc.rows.some(r=>r[0]==='### AUTOFILL RULES ###')) validateLightning(rows, problems);
  } else output = rendered.get('text') ?? doc.source;
  // Only source markers still unbound count as unresolved: user values are never rendered recursively.
  const marker = /\{\{[a-zA-Z][\w-]*:[a-zA-Z][\w.-]*\}\}/g;
  for (const unit of sourceUnits) for (const match of unit.value.matchAll(marker)) {
    if (!fields.some(f => f.bindings.some(b => b.unitId === unit.id && b.start <= match.index && b.end >= match.index + match[0].length))) problems.push(`Placeholder chưa liên kết: ${match[0]}`);
  }
  return { output: (doc.bom ? '\uFEFF' : '') + output, problems: [...new Set(problems)], changed };
}
function validateLightning(rows, errors) {
  const profiles = new Set(), ids = new Set(),headerIssue=headerRepairCandidate(rows);
  let section = '';
  for (const row of rows) {
    if (row[0]?.startsWith('### ')) { section = row[0]; continue; }
    if (section === '### AUTOFILL PROFILES ###' && row[0] !== 'Profile ID' && row[0]) {if(profiles.has(row[0]))errors.push(`Profile ID trùng: ${row[0]}.`);profiles.add(row[0]);}
  }
  for (const header of ['### AUTOFILL PROFILES ###', '### AUTOFILL RULES ###']) if (!rows.some(r => r[0] === header)) errors.push(headerIssue&&header==='### AUTOFILL PROFILES ###'?'Đầu file có nội dung thừa trước ### AUTOFILL PROFILES ###. Chọn “Sửa đầu file” để xem và xác nhận.':`Thiếu section ${header}.`);
  for (const row of rows) {
    if (row[0]?.startsWith('### ')) { section = row[0]; continue; }
    if (section !== '### AUTOFILL RULES ###' || row[0] === 'Rule ID' || !row[0]) continue;
    if (row.length < 7) errors.push(`Rule ${row[0]} thiếu cột.`);
    if (ids.has(row[0])) errors.push(`Rule ID trùng: ${row[0]}.`);
    ids.add(row[0]);
    if (!headerIssue && row[6] && !profiles.has(row[6])) errors.push(`Rule ${row[0]} tham chiếu profile không tồn tại.`);
  }
}
export async function fingerprint(source, subtle = globalThis.crypto?.subtle) {
  const bytes = new TextEncoder().encode(source);
  const digest = subtle ? new Uint8Array(await subtle.digest('SHA-256', bytes)) : sha256(bytes);
  return [...digest].map(x => x.toString(16).padStart(2, '0')).join('');
}
export function serializeProject(project){
 const text=JSON.stringify(project,null,2);
 if(new TextEncoder().encode(text).length>PROJECT_FILE_LIMIT)throw new Error('Bộ thiết lập sau đóng gói vượt 12 MB. Chia nhỏ template trước khi lưu; dữ liệu hiện tại vẫn được giữ.');
 return text;
}
export async function saveProject(doc, fields, includeValues = false, options = {}) {
  const project={ app: 'chu0ns-fieldwork', version: 1, name: doc.name, format: doc.kind, source: (doc.bom ? '\uFEFF' : '') + doc.source, fields: structuredClone(fields.map(f => ({ ...f, value: includeValues ? f.value : '' }))), options:{pinnedRuleIds:[...new Set(options.pinnedRuleIds||[])].filter(id=>typeof id==='string').slice(0,10000)} };
  project.fingerprint=await fingerprint(doc.source);
  serializeProject(project);
  return project;
}
export async function loadProject(project) {
  if (!project || !['chu0ns-fieldwork','fieldwork'].includes(project.app) || project.version !== 1 || !Array.isArray(project.fields) || project.fields.length > 1000) throw new Error('File dự án không được hỗ trợ.');
  const doc = openTemplate(project.source, project.name, project.format);
  if (await fingerprint(doc.source) !== project.fingerprint) throw new Error('Nguồn template đã thay đổi; cần liên kết lại các trường.');
  const fields = [];
  const unitsById = new Map(units(doc).map(unit => [unit.id, unit]));
  const bindingsByUnit = new Map();
  for (const raw of project.fields) {
    if (typeof raw.label !== 'string' || typeof raw.value !== 'string' || !Array.isArray(raw.bindings) || !['text', 'email', 'date'].includes(raw.type) || !['none','trim','upper','ascii-upper'].includes(raw.transform)) throw new Error('Cấu hình trường không hợp lệ.');
    if(raw.key!=null&&(typeof raw.key!=='string'||!/^[a-zA-Z][\w-]*:[a-zA-Z][\w.-]*$/.test(raw.key)))throw new Error('Mã trường không hợp lệ.');
    const field = { id: uid(), label: raw.label.slice(0, 200), key:raw.key||'', value: raw.value, type: raw.type, transform: raw.transform, required: !!raw.required, bindings: [] };
    for(const key of ['description','instructions','example']){if(raw[key]!=null&&(typeof raw[key]!=='string'||raw[key].length>4000))throw new Error('Mô tả trường quá dài hoặc không hợp lệ.');field[key]=raw[key]||'';}
    for(const key of ['aliases','allowedValues']){if(raw[key]!=null&&(!Array.isArray(raw[key])||raw[key].length>200||raw[key].some(v=>typeof v!=='string'||v.length>1000)))throw new Error('Danh sách của trường không hợp lệ.');field[key]=raw[key]||[];}
    for (const b of raw.bindings) {
      const u = unitsById.get(b.unitId);
      if (!u || !Number.isInteger(b.start) || !Number.isInteger(b.end) || u.value.slice(b.start, b.end) !== b.expected) throw new Error('Liên kết không còn khớp template.');
      const checked = bindUnit(u, b.start, b.end, b.mode === 'literal' ? (u.context === 'json' ? 'json' : 'js') : 'text');
      const onUnit = bindingsByUnit.get(u.id) ?? [];
      assertNoOverlap(onUnit, checked);
      onUnit.push({label: field.label, bindings: [checked]});
      bindingsByUnit.set(u.id, onUnit);
      field.bindings.push(checked);
    }
    fields.push(field);
  }
  if(new Set(fields.filter(f=>f.key).map(f=>f.key)).size!==fields.filter(f=>f.key).length)throw new Error('Mã trường trùng.');
  return { doc, fields, options:{pinnedRuleIds:Array.isArray(project.options?.pinnedRuleIds)?[...new Set(project.options.pinnedRuleIds.filter(id=>typeof id==='string'))].slice(0,10000):[]} };
}
