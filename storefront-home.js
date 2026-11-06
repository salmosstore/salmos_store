/* SALMOS · galerías de productos publicados. */
(() => {
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const collections=[{key:'hombre',name:'Hombre'},{key:'mujer',name:'Mujer'},{key:'kids',name:'Kids'},{key:'gorras',name:'Gorras'},{key:'tazas',name:'Tazas y Vasos'},{key:'libros',name:'Libros'},{key:'agendas',name:'Agendas'},{key:'actividades',name:'Actividades'},{key:'figuritas',name:'Álbum de figuritas'},{key:'colorear',name:'Para colorear'},{key:'animales',name:'Animales por tomos'},{key:'cuadernos',name:'Cuadernos'},{key:'otros-libros',name:'Otros libros'}];
  let context,lastMarkup='',drag=null;
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=p=>normalize([p.category_slug,p.category_name,p.name,p.short_description,p.production_catalog?.bookKind].filter(Boolean).join(' '));
  function isBook(p){const type=normalize(p.production_catalog?.materialType);if(type&&['shirt','chomba','hoodie','cap','gorra','mug','glass','thermos','tumbler','bag'].includes(type))return false;return Boolean(p.is_book||/libro|book|notebook|cuaderno/.test(type)||/libro|cuaderno|album|figurita|colorear|tomo|agenda/.test(text(p)));}
  function isGarment(p){if(isBook(p))return false;const type=normalize(p.production_catalog?.materialType);return type?['shirt','chomba','hoodie','remera','buzo'].includes(type):/remera|camiseta|chomba|buzo|prenda|ropa|kids/.test(normalize(`${p.category_slug||''} ${p.category_name||''}`));}
  function audience(p){const known=[...new Set((p.images||[]).filter(image=>image.presentation_printed!==false).map(image=>image.presentation_audience).filter(value=>['Hombre','Mujer','Kids'].includes(value)))];if(known.length)return known;const saved=window.SalmosAudience.parse(p.audience);if(saved.length)return saved;return isGarment(p)?(/kids|ninos|ninas|infantil/.test(text(p))?['Kids']:['Hombre']):[];}
  function matches(p,key){
    if(!key||key==='all')return true;const category=normalize(`${p.category_slug||''} ${p.category_name||''}`),t=text(p),book=isBook(p);
    if(['hombre','mujer','kids'].includes(key))return isGarment(p)&&audience(p).includes({hombre:'Hombre',mujer:'Mujer',kids:'Kids'}[key]);
    if(key==='gorras')return /gorra|cap\b/.test(category)||['cap','gorra'].includes(p.production_catalog?.materialType);
    if(key==='tazas')return /taza|vaso|termo|mug|glass|tumbler/.test(category)||['mug','glass','thermos','tumbler'].includes(p.production_catalog?.materialType);
    if(key==='agendas')return /agenda|planificador|planner/.test(t);
    if(key==='actividades')return /actividades|actividad|colorear|coloreo|pintar|figurita/.test(t);
    if(key==='libros')return book&&!/agenda|planificador|planner/.test(t);
    if(key==='cuadernos')return /cuaderno/.test(t);
    if(key==='figuritas')return book&&/album|figurita/.test(t);
    if(key==='colorear')return book&&/colorear|coloreo|pintar/.test(t);
    if(key==='animales')return book&&/animal|tomo/.test(t)&&!/colorear|figurita/.test(t);
    if(key==='otros-libros')return book&&!/cuaderno|album|figurita|colorear|animal|tomo|agenda/.test(t);
    return false;
  }
  function isHome(){return !context.state.storefrontCatalog&&!context.state.query&&(!context.state.storeOrderEditor?.enabled||context.state.storeOrderEditor.view==='home');}
  function selectedName(){return collections.find(row=>row.key===context.state.homeCollection)?.name||'';}
  function navigate(key='all',scroll=true){const s=context.state;s.storefrontCatalog=true;s.homeCollection=key==='all'?null:key;s.activeCategory='all';s.query='';if(s.storeOrderEditor?.enabled)s.storeOrderEditor.view='catalog';if($('#searchInput'))$('#searchInput').value='';context.renderCategories();context.renderProducts();if(scroll)$('#catalogHeading')?.scrollIntoView({behavior:'smooth',block:'start'});}
  function goHome(){const s=context.state;s.storefrontCatalog=false;s.homeCollection=null;s.activeCategory='all';s.query='';if(s.storeOrderEditor?.enabled)s.storeOrderEditor.view='home';if($('#searchInput'))$('#searchInput').value='';context.renderCategories();context.renderProducts();$('#storeHome')?.scrollIntoView({behavior:'smooth',block:'start'});}
  function imagesFor(p,key){
    if(!p)return [];
    const photos=context.productCardImages(p).filter(image=>!isGarment(p)||image.presentation_printed!==false),wanted={hombre:'Hombre',mujer:'Mujer',kids:'Kids'}[key];
    const rank=image=>!wanted||image.presentation_audience===wanted?0:image.presentation_audience==='Producto'?1:5;
    return [...photos].filter(image=>rank(image)<5).sort((a,b)=>rank(a)-rank(b)||(a.presentation_pose==='back'?1:0)-(b.presentation_pose==='back'?1:0));
  }
  function imageFor(p,key){return imagesFor(p,key)[0]||null;}
  function ordered(key){const orders=context.state.config?.storefrontHome?.orders||{},ids=context.state.storeOrderEditor?.homeDrafts?.get(key)||orders[key]||[],ranks=new Map(ids.map((id,index)=>[Number(id),index]));return context.state.products.filter(p=>p.status!=='draft'&&p.status!=='hidden'&&matches(p,key)).sort((a,b)=>(ranks.get(Number(a.id))??1e9)-(ranks.get(Number(b.id))??1e9)||(Number(a.display_order??999999)-Number(b.display_order??999999))).map(product=>({product,image:imageFor(product,key)})).filter(row=>row.image);}
  function imageHtml(p,image,label,key=''){const attrs=context.productBackgroundAttrs(p),url=context.apiUrl(['gorras','tazas'].includes(key)&&image.foreground_url?image.foreground_url:image.url),original=context.apiUrl(image.original_url||(p.images||[]).find(row=>Number(row.id)===Number(image.id))?.url||p.primary_image_url||image.url);return `<span class="home-product-photo" data-home-photo-product="${Number(p.id)}" ${attrs}><img src="${esc(url)}" ${['gorras','tazas'].includes(key)?'data-home-object-preview crossorigin="anonymous"':''} data-original-src="${esc(original)}" alt="${esc(label||p.name)}" loading="lazy" decoding="async"></span>`;}
  function card({product:p,image},key,editing){return `<article class="home-product" data-home-product-card="${p.id}" data-home-row="${key}" ${editing?'draggable="true"':''}><button class="home-product-open" type="button" data-home-product="${p.id}" data-home-media="${Number(image.id)||0}">${imageHtml(p,image)}<span class="home-product-info"><span class="home-product-name">${esc(p.name)}</span><strong>${esc(context.money(p.price_cents))}</strong></span></button>${editing?`<button class="home-product-edit" type="button" data-home-edit="${p.id}" data-home-media="${Number(image.id)||0}">Editar</button><div class="home-product-sort"><button type="button" data-home-move="-1" aria-label="Mover ${esc(p.name)} antes">←</button><button type="button" data-home-move="1" aria-label="Mover ${esc(p.name)} después">→</button></div>`:''}</article>`;}
  function gallery(key,editing){const label=collections.find(c=>c.key===key).name,items=ordered(key);return `<section class="home-gallery" aria-label="${label}" data-home-gallery="${key}"><div class="home-gallery-head"><h2>${label}</h2><div class="home-gallery-actions">${editing?`<button type="button" class="home-new-product" data-home-new="${key}">+ Producto</button>`:''}<button type="button" class="home-see-all" data-home-collection="${key}">Ver colección <span aria-hidden="true">→</span></button><button type="button" class="home-scroll" data-home-scroll="${key}" data-home-direction="-1" aria-label="Ver productos anteriores de ${label}">‹</button><button type="button" class="home-scroll" data-home-scroll="${key}" data-home-direction="1" aria-label="Ver más productos de ${label}">›</button></div></div><div class="home-product-strip" data-home-strip="${key}">${items.length?items.map(item=>card(item,key,editing)).join(''):`<div class="home-gallery-empty"><span>${context.state.storeProductsLoaded?'Estamos preparando esta colección.':'Cargando productos…'}</span>${editing?`<button type="button" class="btn btn-ghost" data-home-new="${key}">Armar un producto para ${label}</button>`:`<a href="${esc(whatsapp('Hola SALMOS, quiero consultar por '+label+'.'))}" target="_blank" rel="noopener">Consultar modelos →</a>`}</div>`}</div></section>`;}
  function sideCard(key,editing){const label=collections.find(c=>c.key===key).name,items=ordered(key),selected=context.state.config?.storefrontVisuals?.covers?.[key]?.[document.documentElement.dataset.theme==='light'?'light':'dark']?.productId,first=items.find(item=>Number(item.product.id)===Number(selected))||items[0];return `<section class="home-side-card"><button type="button" class="home-side-link" data-home-collection="${key}" data-home-object-kind="${key}">${first?imageHtml(first.product,first.image,label,key):''}<span><strong>${label}</strong></span><span class="home-side-arrow" aria-hidden="true">↗</span></button>${editing&&first?`<button class="home-side-edit" type="button" data-home-edit="${first.product.id}" data-home-media="${Number(first.image.id)||0}" aria-label="Editar portada de ${label}">Editar producto</button>`:''}</section>`;}
  const objectPreviewBounds=new Map();
  function fitHomeObjectPreview(img){
    if(!img.complete||!img.naturalWidth||!img.isConnected)return;const host=img.parentElement;
    let bounds=objectPreviewBounds.get(img.currentSrc||img.src);
    if(bounds===undefined){bounds=null;try{const canvas=document.createElement('canvas'),ratio=Math.min(1,200/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(right>=left&&(right-left+1<canvas.width*.97||bottom-top+1<canvas.height*.97))bounds={left:left/canvas.width,top:top/canvas.height,width:(right-left+1)/canvas.width,height:(bottom-top+1)/canvas.height};}catch{}objectPreviewBounds.set(img.currentSrc||img.src,bounds);}
    if(!bounds)return;const width=host.clientWidth,height=host.clientHeight,scale=Math.min(width*.93/(bounds.width*img.naturalWidth),height*.93/(bounds.height*img.naturalHeight));if(!(scale>0))return;
    Object.assign(img.style,{width:img.naturalWidth*scale+'px',height:img.naturalHeight*scale+'px',left:(width/2-(bounds.left+bounds.width/2)*img.naturalWidth*scale)+'px',top:(height/2-(bounds.top+bounds.height/2)*img.naturalHeight*scale)+'px',right:'auto',bottom:'auto',maxWidth:'none',maxHeight:'none',padding:'0',objectFit:'contain'});
  }
  function fitHomeObjectPreviews(){document.querySelectorAll('[data-home-object-preview]').forEach(fitHomeObjectPreview);}
  function render(){if(!context)return;const home=isHome(),s=context.state,editing=Boolean(s.storeOrderEditor?.enabled);$('#storeHome')?.classList.toggle('hidden',!home);$('#catalogHeading')?.classList.toggle('hidden',home);document.body.classList.toggle('store-home-view',home);const theme=document.documentElement.dataset.theme==='light'?'light':'dark',background=s.config?.storefrontVisuals?.pageBackgrounds?.[theme];if(background?.url)document.body.style.setProperty('--home-page-background',`url("${context.apiUrl(background.url)}")`);else document.body.style.removeProperty('--home-page-background');
    if(home&&$('#homeCategoryGrid')){const html=`<div class="home-galleries">${['hombre','mujer','kids'].map(key=>gallery(key,editing)).join('')}</div><aside class="home-side-rail" aria-label="Más en SALMOS">${['gorras','tazas','libros','agendas','actividades'].map(key=>sideCard(key,editing)).join('')}</aside>`;if(html!==lastMarkup){const positions=new Map([...document.querySelectorAll('[data-home-strip]')].map(row=>[row.dataset.homeStrip,row.scrollLeft]));$('#homeCategoryGrid').innerHTML=html;for(const row of document.querySelectorAll('[data-home-strip]'))row.scrollLeft=positions.get(row.dataset.homeStrip)||0;lastMarkup=html;}}
    fitHomeObjectPreviews();refreshContactLinks();
  }
  function remember(key){const ids=[...document.querySelectorAll(`[data-home-strip="${key}"] [data-home-product-card]`)].map(card=>Number(card.dataset.homeProductCard));context.onHomeOrder?.(key,ids);lastMarkup='';}
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
  function backgroundAsset(product,chosen){
    if(!chosen)return null;const theme=document.documentElement.dataset.theme==='light'?'light':'dark',visual=context.state.config?.storefrontVisuals,configured=isGarment(product)?visual?.peoplePhotoBackgrounds?.[theme]:visual?.objectPhotoBackgrounds?.[theme];
    const name=normalize(chosen.name||''),family=/alfombra|carpet|shag/.test(name)?/alfombra|carpet|shag/:/marmol|marble|pizarra/.test(name)?/marmol|marble|pizarra/:null;if(!family)return chosen;
    const desired=theme==='light'?/blanc|crema|claro|light|ivory/:/marron|oscuro|dark|brown|negro/;if(desired.test(name)&&(!isGarment(product)||!/tazas?|vasos?|mug|chop/.test(name)))return chosen;
    if(configured?.url)return configured;return (context.state.config?.productBackgroundAssets||[]).find(asset=>family.test(normalize(asset.name))&&desired.test(normalize(asset.name))&&(!isGarment(product)||!/tazas?|vasos?|mug|chop/.test(normalize(asset.name))))||chosen;
  }
  function init(options){context=options;
    document.addEventListener('click',event=>{
      const edit=event.target.closest('[data-home-edit]');if(edit){event.preventDefault();context.editProduct?.(Number(edit.dataset.homeEdit),Number(edit.dataset.homeMedia));return;}
      const add=event.target.closest('[data-home-new]');if(add){event.preventDefault();context.newProduct?.(add.dataset.homeNew);return;}
      const move=event.target.closest('[data-home-move]');if(move){if(context.state.storeOrderEditor?.saving||context.state.storeOrderEditor?.preparing)return;const card=move.closest('[data-home-product-card]'),next=Number(move.dataset.homeMove)>0?card.nextElementSibling:card.previousElementSibling;if(next){card.parentElement.insertBefore(card,Number(move.dataset.homeMove)>0?next.nextSibling:next);remember(card.dataset.homeRow);}return;}
      const scroll=event.target.closest('[data-home-scroll]');if(scroll){const strip=document.querySelector(`[data-home-strip="${scroll.dataset.homeScroll}"]`);strip?.scrollBy({left:Number(scroll.dataset.homeDirection)*strip.clientWidth*.8,behavior:'smooth'});return;}
      const product=event.target.closest('[data-home-product]');if(product){event.preventDefault();context.openProduct(Number(product.dataset.homeProduct),{mediaId:Number(product.dataset.homeMedia)||0});return;}
      const category=event.target.closest('[data-home-collection]');if(category){event.preventDefault();navigate(category.dataset.homeCollection);return;}
      if(event.target.closest('[data-store-home]')){event.preventDefault();goHome();return;}
      if(event.target.closest('[data-home-all]')){event.preventDefault();navigate();return;}
      if(event.target.closest('[data-home-wholesale]')){event.preventDefault();openWholesale();return;}
      if(event.target.closest('[data-home-shipping]')){event.preventDefault();openShipping();return;}
      if(event.target.closest('[data-home-dialog-close]')){event.target.closest('dialog')?.close();return;}
      if(event.target.closest('[data-home-wholesale-cart]')){event.target.closest('dialog')?.close();if(context.state.cart.length)context.openCart();else navigate();return;}
    });
    document.addEventListener('dragstart',event=>{const card=event.target.closest('[data-home-product-card]');if(!context.state.storeOrderEditor?.enabled||context.state.storeOrderEditor.saving||context.state.storeOrderEditor.preparing||!card)return;drag=card;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.homeProductCard);card.classList.add('sorting');});
    document.addEventListener('dragover',event=>{const card=event.target.closest('[data-home-product-card]');if(drag&&card?.dataset.homeRow===drag.dataset.homeRow){event.preventDefault();event.dataTransfer.dropEffect='move';}});
    document.addEventListener('drop',event=>{const card=event.target.closest('[data-home-product-card]');if(!drag||!card||card===drag||card.dataset.homeRow!==drag.dataset.homeRow)return;event.preventDefault();const rect=card.getBoundingClientRect();card.parentElement.insertBefore(drag,event.clientX>rect.x+rect.width/2?card.nextSibling:card);remember(drag.dataset.homeRow);});
    document.addEventListener('dragend',()=>{drag?.classList.remove('sorting');drag=null;});
    const update=event=>{const input=event.target.closest('[data-manual-delivery]');if(!input)return;(context.state.manualDelivery??={})[input.dataset.manualDelivery]=input.value.trim();refreshContactLinks();};
    document.addEventListener('input',update);document.addEventListener('change',update);render();
  }
  document.addEventListener('load',event=>{if(event.target.matches?.('[data-home-object-preview]'))fitHomeObjectPreview(event.target);},true);
  window.addEventListener('resize',fitHomeObjectPreviews);
  window.SalmosHome={init,render,matches,isHome,selectedName,navigate,goHome,openShipping,openWholesale,refreshContactLinks,manualDeliveryForm,backgroundAsset,whatsapp,manualCorreoShipping:true,isGarment,imageFor,imagesFor};
})();
