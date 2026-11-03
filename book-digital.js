(() => {
  'use strict';
  let context,dialog,activeRequest=null,pollTimer,libraryButton=null,librarySequence=0;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusName={paid:'Pago confirmado',pending:'Esperando confirmación del pago',rejected:'Pago rechazado o cancelado',refunded:'Pago reintegrado'};
  function editionHtml(product){return product.digitalBook?.enabled?`<div class="book-editions"><div><strong>Libro impreso</strong><span>${context.money(product.price_cents)}</span><small>Elegilo con los botones de compra de abajo.</small></div><div><strong>PDF descargable</strong><span>${context.money(product.digitalBook.priceCents)}</span><small>Sin envío. Descarga después de confirmar el pago.</small><button class="btn btn-secondary" type="button" data-buy-book-pdf="${Number(product.id)}">Comprar PDF</button></div></div>`:'';}
  async function request(path,options={}){const token=await context.authToken().catch(()=>''),headers=new Headers(options.headers||{});if(token)headers.set('Authorization','Bearer '+token);return context.api(path,{...options,headers,cache:'no-store'});}
  function show(title,body){
    clearTimeout(pollTimer);if(!dialog){dialog=document.createElement('dialog');dialog.className='book-pdf-dialog';document.body.append(dialog);dialog.addEventListener('close',()=>clearTimeout(pollTimer));}
    dialog.innerHTML=`<div class="pdf-dialog-head"><h2>${esc(title)}</h2><button class="icon-btn" type="button" data-close-book-pdf aria-label="Cerrar">×</button></div><div class="pdf-dialog-body">${body}</div>`;
    if(!dialog.open)dialog.showModal();
  }
  async function buy(id){
    const product=context.state.selectedProduct?.id===id?context.state.selectedProduct:(await request('/api/products/'+id)).item;
    if(!product.digitalBook?.enabled)throw Error('Este PDF no está disponible.');
    activeRequest={id:crypto.randomUUID(),productId:id};const customer=context.state.customer||{},email=context.state.auth.user?.email||customer.email||'';
    show('Comprar PDF',`<p><strong>${esc(product.name)}</strong></p><div class="pdf-price">${context.money(product.digitalBook.priceCents)}</div><p>Versión digital, sin envío. La descarga se habilita al confirmar el pago.</p><form id="bookPdfCheckout"><label class="field">Nombre y apellido<input class="input" name="name" required minlength="3" autocomplete="name" value="${esc(customer.name||'')}"></label><label class="field">Email<input class="input" name="email" required type="email" autocomplete="email" value="${esc(email)}"></label><label class="field">WhatsApp<input class="input" name="phone" required minlength="6" autocomplete="tel" value="${esc(customer.phone||'')}"></label><p class="pdf-account-hint">${context.state.auth.user?'La compra quedará vinculada a tu cuenta.':'Podés comprar sin cuenta desde este navegador. Si ingresás con Google, también podrás recuperar tus PDF en otros dispositivos.'}</p>${!context.state.auth.user?'<button class="btn btn-ghost full" type="button" data-pdf-signin>Ingresar con Google</button>':''}<p class="pdf-error" role="alert"></p><button class="btn btn-primary full" type="submit">Pagar PDF con Mercado Pago</button></form>`);
  }
  async function checkout(form){
    const button=form.querySelector('[type="submit"]'),error=form.querySelector('.pdf-error');button.disabled=true;button.textContent='Abriendo Mercado Pago…';error.textContent='';
    try{const fd=new FormData(form),customer={name:fd.get('name'),email:fd.get('email'),phone:fd.get('phone')},result=await request('/api/books-digital/orders',{method:'POST',body:JSON.stringify({productId:activeRequest.productId,requestId:activeRequest.id,customer})});
      localStorage.setItem('salmos_pdf_last_order',result.order.id);
      if(result.order.status==='paid'){await openOrder(result.order.id);return;}
      const target=new URL(result.initPoint);if(target.protocol!=='https:'||!(target.hostname==='mercadopago.com.ar'||target.hostname.endsWith('.mercadopago.com.ar')||target.hostname==='mercadopago.com'||target.hostname.endsWith('.mercadopago.com')))throw Error('No se pudo validar el enlace de pago.');
      location.assign(target.href);
    }catch(err){error.textContent=err.message;button.disabled=false;button.textContent='Intentar nuevamente';}
  }
  function orderHtml(order){return `<article class="pdf-order"><strong>${esc(order.title)}</strong><small>${esc(order.code)} · ${context.money(order.priceCents)}</small><p>${esc(statusName[order.status]||'Pago pendiente')}</p>${order.canDownload?`<button class="btn btn-primary full" type="button" data-download-book-pdf="${esc(order.id)}">Descargar PDF</button>`:`<p>El archivo sigue bloqueado hasta que el servidor confirme el pago.</p>`}<button class="btn btn-ghost full" type="button" data-refresh-book-pdf="${esc(order.id)}">Actualizar estado</button><p class="pdf-error" role="alert"></p></article>`;}
  async function openOrder(id,attempt=0){
    const result=await request('/api/books-digital/orders/'+encodeURIComponent(id));show('Tu PDF',orderHtml(result.order));if(result.order.status==='paid'&&result.order.canDownload)showLibraryButton(true);else if(['refunded','rejected'].includes(result.order.status))refreshPurchases();
    if(result.order.status==='pending'&&attempt<4)pollTimer=setTimeout(()=>{if(dialog?.open)openOrder(id,attempt+1).catch(error=>context.toast(error.message,'error'));},2500);
  }
  function showLibraryButton(visible){if(!libraryButton)return;libraryButton.hidden=!visible;libraryButton.classList.toggle('hidden',!visible);}
  async function refreshPurchases(){
    const sequence=++librarySequence;showLibraryButton(false);
    if(!context.state.auth.user&&!localStorage.getItem('salmos_pdf_last_order'))return false;
    try{const result=await request('/api/books-digital/orders'),visible=(result.items||[]).some(order=>order.status==='paid'&&order.canDownload===true);if(sequence===librarySequence)showLibraryButton(visible);return visible;}
    catch{if(sequence===librarySequence)showLibraryButton(false);return false;}
  }
  async function purchases(){
    const result=await request('/api/books-digital/orders');showLibraryButton((result.items||[]).some(order=>order.status==='paid'&&order.canDownload===true));show('Mis PDF',result.items.length?result.items.map(orderHtml).join(''):'<p>Todavía no hay compras digitales en este navegador o cuenta.</p>');
  }
  async function download(id,button){
    button.disabled=true;const original=button.textContent;button.textContent='Confirmando pago…';
    try{const token=await context.authToken().catch(()=>''),headers=new Headers({'X-Salmos-Checkout-Token':context.state.checkoutToken});if(token)headers.set('Authorization','Bearer '+token);
      const response=await fetch(context.apiUrl('/api/books-digital/orders/'+encodeURIComponent(id)+'/download'),{method:'POST',headers,cache:'no-store'});
      if(!response.ok){let error;try{error=await response.json();}catch{}throw Error(error?.error||'La descarga todavía no está disponible.');}
      const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=document.createElement('a'),name=response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];anchor.href=url;anchor.download=name?decodeURIComponent(name):'salmos-libro.pdf';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(error){const el=button.closest('.pdf-order')?.querySelector('.pdf-error');if(el)el.textContent=error.message;else context.toast(error.message,'error');}
    finally{button.disabled=false;button.textContent=original;}
  }
  async function resume(){const params=new URLSearchParams(location.search),id=params.get('pdf_order');if(!id){await refreshPurchases();return;}history.replaceState({},'',location.pathname+location.hash);try{await openOrder(id);}catch(error){show('Tu PDF',`<p>${esc(error.message)}</p><button class="btn btn-primary full" data-open-my-pdfs>Ver mis PDF</button>`);}}
  function init(options){context=options;
    const account=document.querySelector('#accountBtn');if(account){const button=document.createElement('button');button.className='icon-btn my-pdfs-button hidden';button.hidden=true;button.type='button';button.dataset.openMyPdfs='';button.title='Mis PDF comprados';button.setAttribute('aria-label','Mis PDF comprados');button.innerHTML='<i class="fa-solid fa-file-pdf" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 2h9l5 5v15H5zM14 2v6h5"/><text x="5.7" y="17" fill="currentColor" stroke="none" font-family="Arial,sans-serif" font-size="6.2" font-weight="700">PDF</text></svg></i><span>Mis PDF</span>';libraryButton=button;account.after(button);}
    document.addEventListener('submit',event=>{if(event.target.id==='bookPdfCheckout'){event.preventDefault();checkout(event.target);}});
    document.addEventListener('click',async event=>{
      const button=event.target.closest('[data-buy-book-pdf],[data-open-my-pdfs],[data-close-book-pdf],[data-refresh-book-pdf],[data-download-book-pdf],[data-pdf-signin]');if(!button)return;
      try{if(button.hasAttribute('data-close-book-pdf'))dialog.close();else if(button.hasAttribute('data-buy-book-pdf'))await buy(Number(button.dataset.buyBookPdf));else if(button.hasAttribute('data-open-my-pdfs'))await purchases();else if(button.hasAttribute('data-refresh-book-pdf'))await openOrder(button.dataset.refreshBookPdf);else if(button.hasAttribute('data-download-book-pdf'))await download(button.dataset.downloadBookPdf,button);else if(button.hasAttribute('data-pdf-signin')){const id=activeRequest.productId;await context.signIn();if(context.state.auth.user)await buy(id);}}
      catch(error){context.toast(error.message,'error');}
    });
  }
  window.SalmosDigital={init,editionHtml,resume,refreshPurchases};
})();
