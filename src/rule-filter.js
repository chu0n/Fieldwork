export const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase();
export function filterRules(rules,state,currentValue,isChanged){
  const query=normalizeSearch(state.query).trim();
  return rules.filter(r=>{
    if(state.ruleGroup==='data'&&r.info.family!=='data')return false;
    if(state.ruleGroup==='automation'&&r.info.family==='data')return false;
    if(state.ruleGroup==='pinned'&&!(state.pinnedRuleIds||[]).includes(r.id))return false;
    if(state.typeFilter&&r.type!==state.typeFilter)return false;
    if(state.profileFilter&&r.profileId!==(state.profileFilter==='__unfiled__'?'':state.profileFilter))return false;
    const value=currentValue(r),changed=isChanged(r);
    if(state.statusFilter==='changed'&&!changed||state.statusFilter==='unchanged'&&changed||state.statusFilter==='empty'&&value.trim()||state.statusFilter==='linked'&&!r.bindings.length)return false;
    return !query||normalizeSearch([r.id,r.title,r.target,r.selector,r.value,value,r.info.label,r.profile,r.site,...r.bindings.map(f=>f.label)].join(' ')).includes(query);
  });
}
export function sortRules(rules,state={},isChanged=()=>false){
  const key=state.sortBy||'source',direction=state.sortDirection==='desc'?-1:1;
  const compare=(a,b)=>String(a??'').localeCompare(String(b??''),'vi',{numeric:true,sensitivity:'base'});
  return rules.map((rule,index)=>({rule,index})).sort((a,b)=>{
    let result=0;
    if(key==='type')result=compare(a.rule.type,b.rule.type);
    else if(key==='name')result=compare(normalizeSearch(a.rule.selector||a.rule.title),normalizeSearch(b.rule.selector||b.rule.title));
    else if(key==='id')result=compare(a.rule.id,b.rule.id);
    else if(key==='changed')result=Number(isChanged(b.rule))-Number(isChanged(a.rule));
    else result=(a.rule.row-b.rule.row)||a.index-b.index;
    return result*direction||a.index-b.index;
  }).map(item=>item.rule);
}
export function groupRules(rules,state={}){
  if(!state.groupBy||state.groupBy==='none')return[{key:'all',label:'',rules}];
  const groups=new Map();
  for(const rule of rules){
    const key=state.groupBy==='profile'?(rule.profileId||'__unfiled__'):rule.type;
    if(!groups.has(key))groups.set(key,{key,label:state.groupBy==='profile'?(rule.profileId?rule.profile:'Unfiled'):rule.info.label,rules:[]});
    groups.get(key).rules.push(rule);
  }
  const list=[...groups.values()];
  if(state.groupBy==='type')list.sort((a,b)=>Number(a.key)-Number(b.key)||a.key.localeCompare(b.key));
  return list;
}
