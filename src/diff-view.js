import { diffLines, diffWordsWithSpace, diffChars } from 'diff';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let diffOptions={mode:'smart',minMatch:3,similarity:.55};
export function getDiffOptions(){return{...diffOptions};}
export function configureDiff(options={}){
  diffOptions={mode:['smart','detail','whole'].includes(options.mode)?options.mode:'smart',minMatch:Math.min(12,Math.max(1,Math.round(Number(options.minMatch)||3))),similarity:Math.min(1,Math.max(0,Number.isFinite(Number(options.similarity))?Number(options.similarity):.55))};
  return getDiffOptions();
}
export function inline(a,b,options=diffOptions){
  if(a===b)return[esc(a),esc(b)];
  if(a.length+b.length>20000)return [esc(a),esc(b)];
  const whole=()=>[a?`<del>${esc(a)}</del>`:'',b?`<ins>${esc(b)}</ins>`:''];
  if(options.mode==='whole')return whole();
  const changes=(a.length+b.length<=2400?diffChars:diffWordsWithSpace)(a,b,{timeout:80});
  if(!changes)return[esc(a),esc(b)];
  const pure=a.includes(b)||b.includes(a),common=changes.filter(p=>!p.added&&!p.removed),kept=common.reduce((sum,p)=>sum+p.value.length,0);
  const meaningful=p=>p.value.trim().length>=options.minMatch||pure;
  if(options.mode==='smart'&&!pure&&(kept/Math.max(a.length,b.length)<options.similarity||!common.some(meaningful)))return whole();
  function side(added){
    const groups=[];
    for(const part of changes){
      if(added?part.removed:part.added)continue;
      const changed=!!(part.added||part.removed)||(options.mode==='smart'&&!meaningful(part));
      const last=groups.at(-1);if(last&&last.changed===changed)last.value+=part.value;else groups.push({changed,value:part.value});
    }
    const tag=added?'ins':'del';return groups.map(p=>p.changed?`<${tag}>${esc(p.value)}</${tag}>`:esc(p.value)).join('');
  }
  return[side(false),side(true)];
}
export function diffHTML(before,after,{sensitive=false}={}){
  if(before===after)return '';
  if(sensitive)return '<div class="sensitive-diff">Mật khẩu đã thay đổi. Nội dung được che.</div>';
  if(!before.includes('\n')&&!after.includes('\n')){
    const[a,b]=inline(before,after);
    return `<div class="value-diff"><div class="diff-before"><span>− TRƯỚC</span><pre>${a||'<em>Trống</em>'}</pre></div><div class="diff-after"><span>+ SAU</span><pre>${b||'<em>Xóa giá trị</em>'}</pre></div></div>`;
  }
  const changes=diffLines(before,after,{timeout:100});
  if(!changes)return '<p class="notice">Đoạn thay đổi lớn; mở raw để đối chiếu toàn bộ file.</p>';
  let oldLine=1,newLine=1;const groups=[];
  const split=s=>s.replace(/\n$/,'').split('\n');
  for(let index=0;index<changes.length;index++){
    const p=changes[index];const lines=split(p.value);
    if(!p.added&&!p.removed){
      const render=(arr,offset)=>arr.map((line,j)=>`<div class="diff-line context"><span>${oldLine+offset+j}</span><span>${newLine+offset+j}</span><b> </b><code>${esc(line)||' '}</code></div>`).join('');
      if(lines.length>6)groups.push(render(lines.slice(0,2),0)+`<details class="diff-unchanged"><summary>… ${lines.length-4} dòng giữ nguyên</summary>${render(lines.slice(2,-2),2)}</details>`+render(lines.slice(-2),lines.length-2));
      else groups.push(render(lines,0));
      oldLine+=lines.length;newLine+=lines.length;continue;
    }
    const old= p.removed?lines:[];
    let added=p.added?lines:[];
    if(p.removed&&changes[index+1]?.added){added=split(changes[++index].value);}
    const count=Math.max(old.length,added.length),removed=[],inserted=[];
    for(let j=0;j<count;j++){
      const[a,b]=inline(old[j]??'',added[j]??'');
      if(j<old.length)removed.push(`<div class="diff-line removed"><span>${oldLine++}</span><span></span><b>−</b><code>${a||' '}</code></div>`);
      if(j<added.length)inserted.push(`<div class="diff-line added"><span></span><span>${newLine++}</span><b>+</b><code>${b||' '}</code></div>`);
    }
    groups.push(removed.join('')+inserted.join(''));
  }
  return `<div class="code-diff"><div class="diff-legend"><span>− Xóa / thay nội dung cũ</span><span>+ Nội dung mới</span></div>${groups.join('')}</div>`;
}
