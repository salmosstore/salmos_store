(() => {
  'use strict';
  let context,pendingFile=null;
  const $=selector=>document.querySelector(selector);
  function current(){return context.state.productionDigitalBook??={enabled:false,priceCents:0,hasFile:false,fileName:''};}
  function render(){
    if(!context)return;const host=$('#productionDigitalBook'),enabled=window.SalmosBook.isBookType($('#productionMaterialType')?.value);host.hidden=!enabled;if(!enabled)return;
    const data=current();$('#bookPdfEnabled').checked=Boolean(data.enabled);$('#bookPdfPrice').value=data.priceCents?String(data.priceCents/100):'';
    $('#bookPdfFileStatus').textContent=pendingFile?'Para subir: '+pendingFile.name:data.hasFile?'Archivo guardado: '+data.fileName:'Todavía no subiste el PDF.';
    $('#bookPdfSettings').hidden=!data.enabled;
  }
  function load(product){pendingFile=null;context.state.productionDigitalBook={enabled:false,priceCents:0,hasFile:false,fileName:'',...product?.digitalBook};if($('#bookPdfFile'))$('#bookPdfFile').value='';render();}
  function validate(){if(!window.SalmosBook.isBookType($('#productionMaterialType')?.value))return;const d=current();if(d.enabled&&(!(d.priceCents>0)||!Number.isSafeInteger(d.priceCents)))throw Error('Completá un precio válido para el PDF.');if(d.enabled&&!d.hasFile&&!pendingFile)throw Error('Subí el PDF que recibirá el cliente.');}
  async function persist(id){
    if(!window.SalmosBook.isBookType($('#productionMaterialType')?.value))return;
    const d=current();if(!d.enabled&&!d.hasFile&&!pendingFile)return;
    if(pendingFile){const form=new FormData();form.append('file',pendingFile);const saved=await context.api(`/api/admin/products/${id}/book-pdf`,{method:'POST',body:form});Object.assign(d,saved.item,{enabled:d.enabled,priceCents:d.priceCents});pendingFile=null;}
    const saved=await context.api(`/api/admin/products/${id}/book-digital`,{method:'PUT',body:JSON.stringify({enabled:d.enabled,priceCents:d.priceCents})});Object.assign(d,saved.item);$('#bookPdfFile').value='';render();
  }
  async function sales(){
    const result=await context.api('/api/admin/books-digital/orders',{cache:'no-store'}),dialog=document.createElement('dialog');dialog.className='admin-dialog book-digital-sales';
    const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    dialog.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><h2>Ventas de PDF</h2><button type="button" class="icon-btn" data-close-pdf-sales aria-label="Cerrar">×</button></div><div class="dialog-body">${result.items.length?result.items.map(x=>`<article class="pdf-sale-row"><strong>${escape(x.code)} · ${escape(x.title)}</strong><span>${escape(x.customer_name)} · ${escape(x.customer_email)}</span><span>${context.money(x.price_cents)} · ${escape({paid:'Pagado',pending:'Pendiente',refunded:'Reintegrado',rejected:'Rechazado'}[x.status]||x.status)}</span></article>`).join(''):'Todavía no hay compras de PDF.'}</div></div>`;
    document.body.append(dialog);dialog.querySelector('[data-close-pdf-sales]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>dialog.remove());dialog.showModal();
  }
  function init(options){context=options;
    document.addEventListener('input',event=>{if(event.target.id==='bookPdfPrice')current().priceCents=Math.max(0,Math.round(Number(event.target.value||0)*100));});
    document.addEventListener('change',event=>{
      if(event.target.id==='bookPdfEnabled'){current().enabled=event.target.checked;render();}
      if(event.target.id==='bookPdfFile'){const file=event.target.files[0];if(file&&(file.size>20*1024*1024||!file.name.toLowerCase().endsWith('.pdf'))){event.target.value='';context.toast('Elegí un PDF de hasta 20 MB.','error');return;}pendingFile=file||null;render();}
    });
    document.addEventListener('click',event=>{if(event.target.closest('[data-pdf-sales]'))sales().catch(error=>context.toast(error.message,'error'));});
  }
  window.SalmosBookDigitalAdmin={init,current,load,render,validate,persist};
})();
