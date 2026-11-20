import { inline } from './diff-view.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function editorHighlight(before,value){
  // This is only a paint layer. The textarea is the sole editable/value source.
  const html=inline(String(before),String(value))[1];
  return (html||'')+'<span class="mirror-end"> </span>';
}
export function valueEditor({value='',before='',id,attributes='',sensitive=false}){
  if(sensitive)return `<input id="${esc(id)}" class="value-input" type="password" autocomplete="off" value="${esc(value)}" ${attributes}>`;
  const lines=Math.min(5,Math.max(1,String(value).split('\n').length));
  return `<div class="value-editor ${value!==before?'is-edited':''}" style="--editor-lines:${lines}"><pre class="value-mirror" aria-hidden="true">${editorHighlight(before,value)}</pre><textarea id="${esc(id)}" class="value-input live-diff-input" rows="${lines}" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off" data-editor-before="${esc(before)}" ${attributes}>\n${esc(value)}</textarea></div>`;
}
export function refreshValueEditor(input){
  const container=input.closest('.value-editor');if(!container)return;
  const mirror=container.querySelector('.value-mirror');
  mirror.innerHTML=editorHighlight(input.dataset.editorBefore,input.value);
  container.classList.toggle('is-edited',input.value!==input.dataset.editorBefore);
  container.style.setProperty('--editor-lines',Math.min(5,Math.max(1,input.value.split('\n').length)));
  mirror.scrollTop=input.scrollTop;mirror.scrollLeft=input.scrollLeft;
}
