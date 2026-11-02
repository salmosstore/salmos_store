/* SALMOS v27 · portada, colecciones y consultas. */
(() => {
  'use strict';
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const collections = [
    {key:'mujer',name:'Mujer',column:0,row:0},
    {key:'hombre',name:'Hombre',column:1,row:0},
    {key:'kids',name:'Kids',column:2,row:0},
    {key:'gorras',name:'Gorras',column:3,row:0},
    {key:'tazas',name:'Tazas y vasos',column:0,row:1},
    {key:'figuritas',name:'Álbum de figuritas',column:1,row:1},
    {key:'colorear',name:'Para colorear',column:2,row:1},
    {key:'animales',name:'Animales por tomos',column:3,row:1}
  ];
  let context;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function isBook(p) {
    const category=normalize(`${p.category_slug || ''} ${p.category_name || ''}`);
    return /libro|album|figurita|colorear|tomo/.test(category);
  }
  function isKids(p) {
    const text=normalize(`${p.category_slug||''} ${p.category_name||''} ${p.audience||''} ${p.material_class||''} ${p.production_catalog?.materialClass||''}`);
    return /kids|ninos|ninas|infantil/.test(text);
  }
  function matches(p,key) {
    if(!key || key==='all') return true;
    const category=normalize(`${p.category_slug||''} ${p.category_name||''}`);
    const audience=normalize(p.audience||''),book=isBook(p),kids=isKids(p);
    const garment=/remera|camiseta|chomba|buzo|prenda|ropa|kids/.test(category) && !book;
    const text=normalize(`${p.category_slug||''} ${p.category_name||''} ${p.name||''} ${p.short_description||''}`);
    if(key==='mujer') return garment && !kids && (!audience || /mujer|femenin|unisex|adult/.test(audience));
    if(key==='hombre') return garment && !kids && (!audience || /hombre|varon|masculin|unisex|adult/.test(audience));
    if(key==='kids') return garment && kids;
    if(key==='gorras') return /gorra|cap\b/.test(category);
    if(key==='tazas') return /taza|vaso|termo|mug|glass|tumbler/.test(category);
    if(key==='figuritas') return book && /album|figurita/.test(text);
    if(key==='colorear') return book && /colorear|coloreo|pintar/.test(text);
    if(key==='animales') return book && /animal|creacion|tomo/.test(text) && !/colorear|coloreo|pintar|figurita|album/.test(text);
    return true;
  }
  function isHome() {
    return !context.state.storefrontCatalog && !context.state.query && !context.state.storeOrderEditor?.enabled;
  }
  function selectedName() {
    return collections.find(c=>c.key===context.state.homeCollection)?.name || '';
  }
  function navigate(key='all',scroll=true) {
    const s=context.state;
    s.storefrontCatalog=true;s.homeCollection=key==='all'?null:key;s.activeCategory='all';s.query='';
    if($('#searchInput')) $('#searchInput').value='';
    context.renderCategories();context.renderProducts();
    if(scroll) $('#catalogHeading')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function goHome() {
    const s=context.state;
    s.storefrontCatalog=false;s.homeCollection=null;s.activeCategory='all';s.query='';
    if($('#searchInput')) $('#searchInput').value='';
    context.renderCategories();context.renderProducts();
    $('#storeHome')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function categoryPhoto(collection) {
    let candidates=context.state.products.filter(p=>matches(p,collection.key));
    // Una foto masculina unisex no representa la entrada Mujer.
    if(collection.key==='mujer') candidates=candidates.filter(p=>/mujer|femenin/.test(normalize(p.audience)));
    const product=candidates.find(p=>context.productCardImages(p).length);
    if(!product) return '';
    const image=context.productCardImages(product)[0];
    return `<span class="home-live-photo" ${context.productBackgroundAttrs(product)}><img src="${esc(image.url)}" alt="" loading="lazy" decoding="async"></span>`;
  }
  function illustration(collection) {
    const left=[29,212,392,573][collection.column],right=[793,975,1157,1338][collection.column];
    const top=collection.row===0?230:491;
    return `<span class="home-category-illustration" aria-hidden="true" style="--category-x-dark:${left/1366*100}%;--category-x-light:${right/1366*100}%;--category-y:${top/814*100}%"></span>`;
  }
  function render() {
    if(!context) return;
    const home=isHome(),section=$('#storeHome'),heading=$('#catalogHeading');
    section?.classList.toggle('hidden',!home);heading?.classList.toggle('hidden',home);
    document.body.classList.toggle('store-home-view',home);
    if(home && $('#homeCategoryGrid')) $('#homeCategoryGrid').innerHTML=collections.map(c=>`<button type="button" class="home-category" data-home-collection="${c.key}"><span class="home-category-media">${illustration(c)}${categoryPhoto(c)}</span><span class="home-category-label">${esc(c.name)}<span aria-hidden="true">→</span></span></button>`).join('');
    refreshContactLinks();
  }
  function whatsapp(message) {
    const phone=String(context.state.config?.whatsapp || context.cfg.STORE_WHATSAPP || '5491162691341').replace(/\D/g,'');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }
  function cartSummary() {
    const lines=context.state.cart.map(item=>`${item.qty} × ${item.name}${[item.color,item.size].filter(Boolean).length?' · '+[item.color,item.size].filter(Boolean).join(' · '):''}`);
    return lines.length?'\n\nMi carrito:\n'+lines.join('\n'):'';
  }
  function shippingUrl() {
    const s=context.state,d=s.manualDelivery||{};
    const location=[d.locality,d.province,d.postalCode?`CP ${d.postalCode}`:''].filter(Boolean).join(', ');
    const delivery=d.type==='agency'?'A sucursal':d.type==='home'?'A domicilio':'';
    return whatsapp(`Hola SALMOS, quisiera consultar el costo de envío.${s.customer?.name?'\nMi nombre es '+s.customer.name+'.':''}${location?'\nDestino: '+location:''}${delivery?'\nEntrega: '+delivery:''}${cartSummary()}`);
  }
  function wholesaleUrl() {
    return whatsapp('Hola SALMOS, quisiera confirmar las condiciones y el precio por mayor de mi pedido.'+cartSummary());
  }
  function refreshContactLinks() {
    if(!context) return;
    document.querySelectorAll('[data-shipping-whatsapp]').forEach(a=>a.href=shippingUrl());
    document.querySelectorAll('[data-wholesale-whatsapp]').forEach(a=>a.href=wholesaleUrl());
  }
  function dialog(id,label,body) {
    let el=document.getElementById(id);
    if(!el){el=document.createElement('dialog');el.id=id;el.className='home-info-dialog';document.body.appendChild(el);}
    el.setAttribute('aria-label',label);
    el.innerHTML=`<div class="home-dialog-head"><h2>${esc(label)}</h2><button type="button" class="icon-btn" data-home-dialog-close aria-label="Cerrar">×</button></div>${body}`;
    if(!el.open) el.showModal();
    refreshContactLinks();
  }
  function openWholesale() {
    dialog('wholesaleDialog','Cómo comprar por mayor',`<ol class="wholesale-steps"><li><strong>Armá tu pedido en el carrito.</strong> Elegí los productos y agregá las cantidades que necesitás.</li><li><strong>Remeras por curva de talles.</strong> Agregá la curva correspondiente al modelo. Si tenés dudas sobre qué talles incluir, consultanos.</li><li><strong>Gorras y tazas: desde 6 unidades.</strong> Completá la cantidad del tipo de producto que querés comprar por mayor.</li><li><strong>Confirmá el precio y las condiciones con SALMOS antes de pagar.</strong></li></ol><div class="home-dialog-actions"><button class="btn btn-primary" type="button" data-home-wholesale-cart>Armar pedido en el carrito</button><a class="btn btn-secondary" data-wholesale-whatsapp target="_blank" rel="noopener">Consultar mi pedido por WhatsApp</a></div>`);
  }
  function manualDeliveryForm() {
    const d=context.state.manualDelivery||{};
    return `<div class="manual-shipping"><p>Te cotizamos el envío personalmente. Envianos el destino y tu carrito por WhatsApp para confirmar el costo antes de pagar.</p><div class="form-grid"><label class="field">Localidad<input class="input" data-manual-delivery="locality" value="${esc(d.locality||'')}" autocomplete="address-level2"></label><label class="field">Provincia<input class="input" data-manual-delivery="province" value="${esc(d.province||'')}" autocomplete="address-level1"></label><label class="field">Código postal<input class="input" data-manual-delivery="postalCode" value="${esc(d.postalCode||'')}" autocomplete="postal-code" maxlength="12"></label><label class="field">Preferencia de entrega<select class="select" data-manual-delivery="type"><option value="">A coordinar</option><option value="home" ${d.type==='home'?'selected':''}>A domicilio</option><option value="agency" ${d.type==='agency'?'selected':''}>A sucursal</option></select></label></div><a class="btn btn-primary full" data-shipping-whatsapp href="${esc(shippingUrl())}" target="_blank" rel="noopener">Consultar envío por WhatsApp</a><p class="field-help">El costo del envío todavía no está incluido. Esta consulta no confirma ni cobra el pedido.</p></div>`;
  }
  function openShipping() {
    context.closeCart();
    dialog('manualShippingDialog','Consultar envío',manualDeliveryForm());
  }
  function backgroundAsset(product,chosen) {
    if(!chosen) return null;
    const theme=document.documentElement.dataset.theme||'dark';
    const assets=context.state.config?.productBackgroundAssets||[];
    const name=normalize(chosen.name||chosen.label||'');
    const family=/alfombra|shag|carpet/.test(name)?'carpet':/marmol|marble/.test(name)?'marble':'';
    if(!family) return chosen;
    const desired=theme==='light'?/blanc|crema|claro|light|ivory/:/marron|oscuro|dark|brown|negro/;
    if(desired.test(name)) return chosen;
    const sameFamily=asset=>family==='carpet'?/alfombra|shag|carpet/.test(normalize(asset.name||asset.label)):/marmol|marble/.test(normalize(asset.name||asset.label));
    return assets.find(asset=>sameFamily(asset)&&desired.test(normalize(asset.name||asset.label)))||chosen;
  }
  function init(options) {
    context=options;
    document.addEventListener('click',event=>{
      const category=event.target.closest('[data-home-collection]');
      if(category){event.preventDefault();navigate(category.dataset.homeCollection);return;}
      if(event.target.closest('[data-store-home]')){event.preventDefault();goHome();return;}
      if(event.target.closest('[data-home-all]')){event.preventDefault();navigate();return;}
      if(event.target.closest('[data-home-wholesale]')){event.preventDefault();openWholesale();return;}
      if(event.target.closest('[data-home-shipping]')){event.preventDefault();openShipping();return;}
      if(event.target.closest('[data-home-dialog-close]')){event.target.closest('dialog')?.close();return;}
      if(event.target.closest('[data-home-wholesale-cart]')){event.target.closest('dialog')?.close();if(context.state.cart.length)context.openCart();else navigate();return;}
    });
    const update=event=>{
      const input=event.target.closest('[data-manual-delivery]');if(!input)return;
      const draft=context.state.manualDelivery??={};draft[input.dataset.manualDelivery]=input.value.trim();refreshContactLinks();
    };
    document.addEventListener('input',update);document.addEventListener('change',update);
    const previous=history.state?.salmosCollection;
    if(previous)navigate(previous,false);
    render();
  }
  window.SalmosHome={init,render,matches,isHome,selectedName,navigate,goHome,openShipping,openWholesale,refreshContactLinks,manualDeliveryForm,backgroundAsset,whatsapp,manualCorreoShipping:true};
})();
