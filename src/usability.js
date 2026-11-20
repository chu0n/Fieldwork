export const profileHeader='### AUTOFILL PROFILES ###';
export function headerRepairCandidate(rows){
 if(!rows?.length||rows.some(r=>r[0]===profileHeader))return null;
 const before=rows[0][0]||'',index=before.indexOf(profileHeader);
 if(index<=0||!before.endsWith(profileHeader)||index!==before.lastIndexOf(profileHeader))return null;
 return {row:0,before,after:profileHeader,prefix:before.slice(0,index)};
}
export function searchText(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();}
export function isTextEditing(target){return !!target?.closest?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]');}
export function hasPendingChanges(state,snapshots=[]){return !!(!state.empty&&(state.dirty||state.drafts?.size||state.workflow?.dirty)||snapshots.some(s=>!s.empty&&(s.dirty||s.drafts?.size||s.workflow?.dirty)));}
