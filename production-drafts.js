// SALMOS · Borradores de producción, con sus imágenes, en este navegador.
(() => {
  'use strict';
  let opening;
  const open=()=>opening??=(new Promise((resolve,reject)=>{if(!window.indexedDB){reject(new Error('Este navegador no permite conservar borradores.'));return;}const request=window.indexedDB.open('salmos-production-drafts',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'key'});};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};request.onerror=()=>reject(request.error||new Error('No se pudo abrir el borrador local.'));request.onblocked=()=>reject(new Error('Cerrá la otra pestaña de SALMOS para habilitar los borradores.'));})).catch(error=>{opening=null;throw error;});
  let queue=Promise.resolve();
  const transaction=async(mode,action)=>{const db=await open();return new Promise((resolve,reject)=>{let result;const tx=db.transaction('drafts',mode),request=action(tx.objectStore('drafts'));request.onsuccess=()=>result=request.result;request.onerror=()=>reject(request.error);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('No se pudo conservar el borrador.'));tx.onabort=()=>reject(tx.error||new Error('No se pudo conservar el borrador.'));});};
  const ordered=action=>{const next=queue.catch(()=>{}).then(action);queue=next;return next;};
  window.SalmosProductionDrafts={
    save:record=>ordered(()=>transaction('readwrite',store=>store.put(record))),
    remove:key=>ordered(()=>transaction('readwrite',store=>store.delete(key))),
    find:async(key,productId=0)=>{await queue.catch(()=>{});const exact=await transaction('readonly',store=>store.get(key));if(exact)return exact;if(!productId)return null;const rows=await transaction('readonly',store=>store.getAll());return rows.filter(row=>Number(row.productId)===Number(productId)).sort((a,b)=>b.savedAt-a.savedAt)[0]||null;}
  };
})();
