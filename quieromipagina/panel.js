(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const {amount,totals,labels,escape:esc,photoForm,photoField,limit,basic,deposit} = window.SalmosWebProjects;
  const sample = {
    name:'Lino & Tierra',
    description:'Objetos para regalar y disfrutar todos los días.',
    accent:'#246453',
    background:'#f7f4ed',
    products:[
      {name:'Vela aromática',group:'Hogar',priceCents:850000},
      {name:'Cuaderno A5',group:'Papelería',priceCents:620000},
      {name:'Taza de cerámica',group:'Hogar',priceCents:970000}
    ]
  };
  const icons = [
    '<path d="M8 12h16v15H8zM12 12v-2a4 4 0 0 1 8 0v2M16 5c-2-2 1-4 1-5 3 3 2 5-1 5z"/>',
    '<path d="M8 5h17v23H8zM11 5v23M6 9h4M6 14h4M6 19h4M6 24h4M14 11h7M14 15h5"/>',
    '<path d="M6 12h17v8a7 7 0 0 1-7 7h-3a7 7 0 0 1-7-7zM23 14h2a3 3 0 0 1 0 6h-2M11 8c-1-1 1-2 0-3m5 3c-1-1 1-2 0-3"/>'
  ];
  const url = new URL(location.href);
  const id = url.searchParams.get('proyecto');
  const hasPaymentReturn = url.searchParams.has('pago');
  const key = new URLSearchParams(url.hash.slice(1)).get('acceso');
  let project;
  let editingId = '';
  let clearPhoto;
  let saving = false;

  const phone = String(window.SALMOS_CONFIG?.STORE_WHATSAPP || '').replace(/\D/g,'');
  const contactMessage = encodeURIComponent('Hola, SALMOS. Me interesa una página para mi negocio y quisiera más información.');
  if (/^[1-9]\d{7,14}$/.test(phone)) {
    document.querySelectorAll('[data-wp-contact]').forEach(link => {link.href = 'https://wa.me/'+phone+'?text='+contactMessage;});
  }

  function message(selector,value) {
    const target = $(selector);
    target.textContent = value || '';
    target.hidden = !value;
  }

  async function api(path = '', options = {}) {
    const response = await fetch('/api/web-projects/'+id+path,{credentials:'same-origin',cache:'no-store',...options});
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || 'No pudimos abrir el proyecto. Volvé a intentar.');
    return data;
  }

  function post(body) {
    return {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
  }

  function ink(hex) {
    const channels = hex.slice(1).match(/../g).map(part => parseInt(part,16)/255)
      .map(value => value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return .2126*channels[0]+.7152*channels[1]+.0722*channels[2] > .179 ? '#191713' : '#fffdf5';
  }

  function renderPreview(host,brand,useSample) {
    const items = useSample ? sample.products : brand.products.slice(0,3);
    host.style.setProperty('--wp-preview-bg',brand.background);
    host.style.setProperty('--wp-preview-ink',ink(brand.background));
    host.style.setProperty('--wp-preview-accent',brand.accent);
    host.style.setProperty('--wp-preview-accent-ink',ink(brand.accent));
    host.innerHTML = '<div class="wp-preview-top"><span>'+ (useSample ? 'Muestra del catálogo' : 'Vista previa de tus productos') +
      '</span><span aria-hidden="true">● ● ●</span></div>'+
      '<div class="wp-preview-site"><div class="wp-preview-brand">'+(brand.logo ? '<img src="'+esc(brand.logo)+'" alt="">' : '')+
      '<div><h2>'+esc(brand.name)+'</h2><p>'+esc(brand.description || 'Catálogo de productos')+'</p></div></div>'+
      '<div class="wp-preview-grid">'+items.map((item,index) => '<article class="wp-preview-card">'+
        '<div class="wp-preview-image">'+(item.photo ? '<img src="'+esc(item.photo)+'" alt="" loading="lazy">' :
          '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.1" aria-hidden="true">'+icons[index]+'</svg>')+
        '</div><div class="wp-preview-card-copy"><small>'+esc(item.group || 'Producto')+'</small><b>'+esc(item.name)+'</b><span>'+amount(item.priceCents/100)+'</span></div></article>'
      ).join('')+'</div><p class="wp-preview-hint">'+(useSample ? 'Productos de ejemplo.' : 'Vista de los primeros '+items.length+' productos.')+'</p></div>';
  }

  function closed() {
    return !['draft','rejected','pending'].includes(project.status);
  }

  function render() {
    const count = project.products.length;
    const estimate = totals(count);
    const isClosed = closed();
    const paid = project.status === 'approved';
    $('#wp-landing').hidden = true;
    $('#wp-project').hidden = false;
    $('#wp-project-name').textContent = project.name;
    $('#wp-status').textContent = labels[project.status];
    $('#wp-status').dataset.state = project.status;
    $('#wp-see-preview').textContent = count ? 'Ver vista previa' : 'Ver muestra';
    $('#wp-count').textContent = count+(count === 1 ? ' producto guardado' : ' productos guardados');
    $('#wp-add').hidden = isClosed;
    $('#wp-add').disabled = count >= limit;
    $('#wp-products-hint').textContent = isClosed ? 'Este es el catálogo que recibió SALMOS.' :
      'Cargá nombre, precio y foto. Podés volver a este enlace para seguir.';
    $('#wp-products').innerHTML = count ? '<ul class="wp-product-list">'+project.products.map(item => '<li>'+
      '<div class="wp-item-photo">'+(item.photo ? '<img src="'+esc(item.photo)+'" alt="" loading="lazy">' : '<span aria-hidden="true">◇</span>')+'</div>'+
      '<div class="wp-item-text"><strong>'+esc(item.name)+'</strong><small>'+esc(item.group || 'Sin categoría')+'</small></div>'+
      '<span class="wp-item-price">'+amount(item.priceCents/100)+'</span>'+
      (isClosed ? '' : '<button type="button" class="wp-button" data-edit="'+item.id+'" aria-label="Editar '+esc(item.name)+'">Editar</button>')+
      '</li>').join('')+'</ul>' : '<div class="wp-empty"><strong>Agregá tu primer producto</strong><p>Los productos de la muestra son de ejemplo. Acá vas a ver los tuyos.</p></div>';
    $('#wp-base').textContent = amount(basic);
    $('#wp-extras-row').hidden = !estimate.blocks;
    $('#wp-extras-label').textContent = 'Productos extra · '+estimate.blocks+(estimate.blocks === 1 ? ' bloque' : ' bloques');
    $('#wp-extras').textContent = amount(estimate.total-basic);
    $('#wp-total').textContent = amount(estimate.total);
    $('#wp-deposit-label').textContent = paid ? 'Anticipo abonado' : 'Anticipo';
    $('#wp-deposit').textContent = amount(deposit);
    $('#wp-balance').textContent = amount(estimate.balance);
    $('#wp-pay-title').textContent = paid ? 'Anticipo confirmado' : 'Tu anticipo';
    $('#wp-pay').hidden = isClosed || project.status === 'pending';
    $('#wp-pay').disabled = !count;
    $('#wp-pay').textContent = (project.checkoutAvailable ? 'Continuar en Mercado Pago · ' : 'Pagar anticipo · ')+amount(deposit);
    $('#wp-verify').hidden = !project.checkoutStarted || isClosed;
    const note = paid ? 'SALMOS recibió tu catálogo. El saldo se abona al aprobar la vista final.' :
      isClosed ? 'Contactá a SALMOS para revisar el estado de tu pago.' :
      project.status === 'pending' ? 'Mercado Pago está procesando el pago. Podés verificarlo desde acá.' :
      count ? 'El anticipo se paga a SALMOS. Cuando se confirme, enviamos este catálogo para preparar tu página.' :
      'Cargá al menos un producto para habilitar el anticipo.';
    $('#wp-pay-note').textContent = note;
    renderPreview($('#wp-private-demo'),project,!count);
  }

  const dialog = $('#wp-product-dialog');
  const form = $('#wp-product-form');

  function openProduct(item) {
    if (closed()) return;
    editingId = item?.id || '';
    form.reset();
    form.elements.name.value = item?.name || '';
    form.elements.price.value = item ? String(item.priceCents/100).replace('.',',') : '';
    form.elements.group.value = item?.group || '';
    form.elements.description.value = item?.description || '';
    form.elements.removePhoto.value = '0';
    form.querySelector('[data-photo-hint]').textContent = '';
    clearPhoto?.();
    clearPhoto = photoField(form,item?.photo);
    $('#wp-product-title').textContent = item ? 'Editar producto' : 'Agregar producto';
    $('#wp-delete-product').hidden = !item;
    message('#wp-product-error','');
    dialog.showModal();
    form.elements.name.focus();
  }

  async function changeProduct(removing) {
    if (saving) return;
    saving = true;
    const submit = form.querySelector('[type="submit"]');
    const remove = $('#wp-delete-product');
    submit.disabled = remove.disabled = true;
    message('#wp-product-error','');
    try {
      const path = '/products'+(editingId ? '/'+editingId : '');
      let options;
      if (removing) {
        options = {...post({revision:project.revision}),method:'DELETE'};
      } else {
        const body = await photoForm(form,900);
        body.set('revision',project.revision);
        options = {method:editingId ? 'PUT' : 'POST',body};
      }
      project = (await api(path,options)).item;
      dialog.close();
      render();
    } catch (error) {
      message('#wp-product-error',error.message);
    } finally {
      saving = false;
      submit.disabled = remove.disabled = false;
    }
  }

  $('#wp-add').onclick = () => openProduct();
  $('#wp-products').onclick = event => {
    const button = event.target.closest('[data-edit]');
    if (button) openProduct(project.products.find(item => item.id === button.dataset.edit));
  };
  $('#wp-close-product').onclick = () => {if (!saving) dialog.close();};
  dialog.addEventListener('cancel',event => {if (saving) event.preventDefault();});
  dialog.addEventListener('close',() => clearPhoto?.());
  $('#wp-delete-product').onclick = () => {if (confirm('¿Eliminar este producto del catálogo?')) changeProduct(true);};
  form.onsubmit = event => {event.preventDefault();changeProduct(false);};

  async function verify() {
    const button = $('#wp-verify');
    button.disabled = true;
    message('#wp-pay-status','Verificando con Mercado Pago…');
    try {
      project = (await api('/verify',post({}))).item;
      render();
      message('#wp-pay-status',project.status === 'draft' ? 'Todavía no hay un pago confirmado.' : labels[project.status]+'.');
    } catch (error) {
      message('#wp-pay-status',error.message);
    } finally {
      button.disabled = false;
    }
  }

  $('#wp-verify').onclick = verify;
  $('#wp-pay').onclick = async event => {
    const button = event.currentTarget;
    button.disabled = true;
    message('#wp-pay-status','Abriendo Mercado Pago…');
    try {
      const {initPoint} = await api('/checkout',post({revision:project.revision}));
      const target = new URL(initPoint);
      if (!['https://www.mercadopago.com','https://www.mercadopago.com.ar'].includes(target.origin)) throw new Error('El enlace de Mercado Pago no es válido.');
      location.assign(target.href);
    } catch (error) {
      try {project = (await api()).item;render();} catch {}
      message('#wp-pay-status',error.message);
      button.disabled = !project.products.length;
    }
  };

  async function start() {
    renderPreview($('#wp-demo'),sample,true);
    if (!id) return;
    message('#wp-message','Abriendo tu catálogo…');
    try {
      if (!/^[a-f\d]{16}$/.test(id)) throw new Error('Abrí el enlace privado que te pasó SALMOS.');
      project = (key ? await api('/access',post({key})) : await api()).item;
      url.hash = '';
      for (const param of [...url.searchParams.keys()]) if (param !== 'proyecto') url.searchParams.delete(param);
      history.replaceState(null,'',url);
      message('#wp-message','');
      render();
      if (hasPaymentReturn && project.checkoutStarted && !closed()) await verify();
    } catch (error) {
      message('#wp-message',error.message);
    }
  }

  start();
})();
