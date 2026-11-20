import { uid } from './core.js';
export class SessionStore {
  constructor(limit=20){this.limit=limit;this.items=[];this.activeId=null;}
  add(snapshot){if(this.items.length>=this.limit)throw new Error(`Tối đa ${this.limit} file đang mở. Hãy đóng bớt file.`);const item={id:uid(),snapshot};this.items.push(item);this.activeId=item.id;return item.id;}
  capture(snapshot){const item=this.items.find(d=>d.id===this.activeId);if(item)item.snapshot=snapshot;}
  select(id){const item=this.items.find(d=>d.id===id);if(!item)throw new Error('File không còn mở.');this.activeId=id;return item.snapshot;}
  remove(id){const index=this.items.findIndex(d=>d.id===id);if(index<0)return null;const active=this.activeId===id;this.items.splice(index,1);if(active)this.activeId=this.items[Math.min(index,this.items.length-1)]?.id??null;return this.items.find(d=>d.id===this.activeId)?.snapshot??null;}
}
