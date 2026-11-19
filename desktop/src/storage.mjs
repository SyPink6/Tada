let dbPromise;
const db=()=>dbPromise ||=new Promise((resolve,reject)=>{
  const req=indexedDB.open('tada-companion-v1',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('snapshots',{keyPath:'id',autoIncrement:true});
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
export async function load(){
  if(window.tada)return window.tada.load();
  const store=(await db()).transaction('snapshots').objectStore('snapshots');
  return new Promise((resolve,reject)=>{const r=store.openCursor(null,'prev');r.onsuccess=()=>resolve(r.result?.value.state??null);r.onerror=()=>reject(r.error);});
}
export async function save(state){
  if(window.tada)return window.tada.save(state);
  const connection=await db();
  return new Promise((resolve,reject)=>{const tx=connection.transaction('snapshots','readwrite');tx.objectStore('snapshots').add({state,at:Date.now()});tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
}
