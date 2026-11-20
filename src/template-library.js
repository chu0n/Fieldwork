import { uid, loadProject } from './core.js';

// IndexedDB keeps full templates off the network and avoids localStorage's small quota.
export class TemplateLibrary {
  async database() {
    if(this.db)return this.db;
    this.db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('fieldwork-library',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('templates',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(new Error('Không mở được thư viện trên trình duyệt này. Bạn vẫn có thể tải/mở file cách điền.'));
    });
    return this.db;
  }
  async transact(mode,operation) {
    const db=await this.database();
    return new Promise((resolve,reject)=>{
      const transaction=db.transaction('templates',mode),request=operation(transaction.objectStore('templates'));
      transaction.oncomplete=()=>resolve(request.result);
      transaction.onerror=()=>reject(new Error('Không lưu được thư viện (có thể hết dung lượng). Hãy tải file cách điền để giữ bản sao.'));
      transaction.onabort=()=>reject(new Error('Thao tác thư viện chưa hoàn tất. Bản đang chỉnh vẫn được giữ.'));
    });
  }
  async list(){return(await this.transact('readonly',store=>store.getAll())).sort((a,b)=>b.updated-a.updated);}
  async save(name,project,id=null){
    await loadProject(project);
    const item={id:id||uid(),name:String(name).trim().slice(0,160),project,updated:Date.now()};
    if(!item.name)throw new Error('Hãy đặt tên template.');
    await this.transact('readwrite',store=>store.put(item));return item;
  }
  async remove(id){await this.transact('readwrite',store=>store.delete(id));}
}
