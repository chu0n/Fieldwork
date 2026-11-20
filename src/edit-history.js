import {openTemplate,units} from './core.js';

// Snapshot strings can occupy two bytes per UTF-16 code unit.
const HISTORY_LIMIT=32_000_000;
function trimHistory(preferred, other=[]){
  let bytes=[...preferred,...other].reduce((sum,snapshot)=>sum+snapshot.length*2,0);
  while(preferred.length>35)bytes-=preferred.shift().length*2;
  while(bytes>HISTORY_LIMIT){
    const oldest=(other.length?other:preferred).shift();
    bytes-=oldest.length*2;
  }
}
export function editSnapshot(state){return JSON.stringify({fields:state.fields,pinnedRuleIds:state.pinnedRuleIds,source:state.doc.source,name:state.doc.name,kind:state.doc.kind,bom:state.doc.bom,drafts:[...state.drafts],expanded:state.expanded,selected:state.selected,profileFilter:state.profileFilter});}
export function checkpointEdit(state){state.history.push(editSnapshot(state));state.future=[];trimHistory(state.history);state.dirty=true;state.exported=false;}
export function travelEdit(state,direction){const from=direction==='redo'?(state.future||[]):state.history,to=direction==='redo'?state.history:(state.future??=[]);if(!from.length)return false;to.push(editSnapshot(state));const old=JSON.parse(from.pop());trimHistory(to,from);state.doc=openTemplate((old.bom?'\uFEFF':'')+old.source,old.name,old.kind);state.fields=old.fields;state.pinnedRuleIds=old.pinnedRuleIds||[];state.drafts=new Map(old.drafts||[]);state.expanded=old.expanded||null;state.selected=old.selected||units(state.doc)[0]?.id;state.profileFilter=old.profileFilter??state.profileFilter;state.selectedRuleIds=[];state.dirty=true;state.exported=false;return true;}
