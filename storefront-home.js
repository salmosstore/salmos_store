/* SALMOS · galerías de productos publicados. */
(() => {
  'use strict';
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const collections=[{key:'hombre',name:'Hombre'},{key:'mujer',name:'Mujer'},{key:'kids',name:'Kids'},{key:'gorras',name:'Gorras'},{key:'tazas',name:'Tazas y Vasos'},{key:'libros',name:'Libros'},{key:'agendas',name:'Agendas'},{key:'actividades',name:'Actividades'},{key:'figuritas',name:'Álbum de figuritas'},{key:'colorear',name:'Para colorear'},{key:'animales',name:'Animales por tomos'},{key:'cuadernos',name:'Cuadernos'},{key:'otros-libros',name:'Otros libros'}];
  const audiences = {hombre:'Hombre',mujer:'Mujer',kids:'Kids'};
  const catalogAudiences = [{key:'all',name:'Todo'}, ...collections.slice(0,3)];
  const catalogTypes = [{key:'ropa',name:'Ropa'}, ...collections.slice(3,8), collections.find(row=>row.key==='cuadernos')];
  const defaultSideGalleries=['gorras','tazas','libros','agendas','actividades'].map(key=>({id:key,key,title:collections.find(row=>row.key===key).name}));
  let context,lastMarkup='',drag=null;
  const sideGalleries=()=>context.state.storeOrderEditor?.sideGalleryDraft??context.state.config?.storefrontHome?.sideGalleries??defaultSideGalleries;
  const canSort=()=>context.state.storeOrderEditor?.enabled&&!context.state.storeOrderEditor.saving&&!context.state.storeOrderEditor.preparing;
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text=p=>normalize([p.category_slug,p.category_name,p.name,p.short_description,p.production_catalog?.bookKind||p.production_catalog?.book?.kind].filter(Boolean).join(' '));
  function isBook(p){const type=normalize(p.production_catalog?.materialType);if(type&&['shirt','chomba','hoodie','cap','gorra','mug','glass','thermos','tumbler','bag'].includes(type))return false;return Boolean(p.is_book||/libro|book|notebook|cuaderno/.test(type)||/libro|cuaderno|album|figurita|colorear|tomo|agenda/.test(text(p)));}
  function isGarment(product) {
    if (isBook(product)) return false;
    const type=normalize(product.production_catalog?.materialType);
    if (type) return ['shirt','chomba','hoodie','remera','buzo'].includes(type);
    return [product.category_slug,product.category_name].map(normalize).some(category=>
      /remera|camiseta|chomba|buzo|prenda|ropa/.test(category) || /^(salmos[ -]+)?kids$/.test(category.trim()));
  }
  function audience(p){const known=[...new Set((p.images||[]).filter(image=>image.presentation_printed!==false).map(image=>image.presentation_audience).filter(value=>['Hombre','Mujer','Kids'].includes(value)))];if(known.length)return known;const saved=window.SalmosAudience.parse(p.audience);if(saved.length)return saved;return isGarment(p)?(/kids|ninos|ninas|infantil/.test(text(p))?['Kids']:['Hombre']):[];}
  function matches(p,key){
    if(!key||key==='all')return true;
    if(key.startsWith('category:'))return p.category_slug===key.slice('category:'.length);
    const category=normalize(`${p.category_slug||''} ${p.category_name||''}`),t=text(p),book=isBook(p);
    if(Object.hasOwn(audiences,key))return isGarment(p)&&audience(p).includes(audiences[key]);
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
  function matchesCatalogAudience(product,key) {
    const wanted = audiences[key];
    if (!wanted) return true;
    const declared = window.SalmosAudience.parse(product.audience).includes(wanted);
    return isGarment(product) ? matches(product,key) && (declared || Boolean(imageFor(product,key))) : declared;
  }
  function matchesCatalogType(product,key) {
    if (key==='all') return true;
    if (key.startsWith('category:')) return matches(product,key);
    if (isGarment(product)) return key==='ropa';
    if (matches(product,'gorras')) return key==='gorras';
    if (matches(product,'tazas')) return key==='tazas';
    const kind = normalize(product.production_catalog?.bookKind);
    const category = normalize(product.category_slug || product.category_name);
    const name = normalize(product.name);
    const label = kind || `${category} ${name}`;
    const agenda = /agenda|planificador|planner/.test(label);
    if (key==='agendas') return agenda;
    if (key==='actividades') return /actividades|actividad|colorear|coloreo|pintar|figurita/.test(label);
    if (key==='libros') return isBook(product) && !agenda;
    if (key==='cuadernos') {
      return isBook(product) && /cuaderno|notebook/.test(kind || (/^(cuadernos?|notebooks?)\b/.test(category) ? category : name));
    }
    return matches(product,key);
  }
  function catalogTypesFor(products) {
    const available = new Set();
    const additional = new Map();
    for (const product of products) {
      const types = catalogTypes.filter(type=>matchesCatalogType(product,type.key));
      for (const type of types) available.add(type.key);
      if (!types.length && product.category_slug && product.category_name) {
        const key = `category:${product.category_slug}`;
        additional.set(key,{key,name:product.category_name});
      }
    }
    return [...catalogTypes.filter(type=>available.has(type.key)), ...additional.values()];
  }
  function isHome(){return !context.state.wholesaleMode&&!context.state.storefrontCatalog&&!context.state.query&&(!context.state.storeOrderEditor?.enabled||context.state.storeOrderEditor.view==='home');}
  function selectedName(){return collections.find(row=>row.key===context.state.homeCollection)?.name||'';}
  function navigate(key='all',scroll=true,sideGallery=null){
    const s=context.state,editing=s.storeOrderEditor?.enabled,isAudience=Object.hasOwn(audiences,key);
    Object.assign(s,{wholesaleMode:false,storefrontCatalog:true,query:'',
      homeCollection:isAudience?key:null,activeSideGallery:sideGallery,
      catalogType:isAudience?'all':key});
    if(editing)s.storeOrderEditor.view='catalog';
    window.SalmosWholesale?.render();
    if($('#searchInput'))$('#searchInput').value='';
    context.renderCategories();context.renderProducts();
    if(scroll)$('#catalogHeading')?.scrollIntoView({behavior:editing?'instant':'smooth',block:'start'});
  }
  function goHome(instant=false){const s=context.state;s.wholesaleMode=false;window.SalmosWholesale?.render();s.storefrontCatalog=false;s.homeCollection=null;s.activeSideGallery=null;s.catalogType='all';s.query='';if(s.storeOrderEditor?.enabled)s.storeOrderEditor.view='home';if($('#searchInput'))$('#searchInput').value='';context.renderCategories();context.renderProducts();if(instant)window.scrollTo({top:0,behavior:'instant'});else $('#storeHome')?.scrollIntoView({behavior:'smooth',block:'start'});}
  function imagesFor(p,key,scope='catalog'){
    if(!p)return [];
    const garment=isGarment(p),photos=context.productCardImages(p,scope,key).filter(image=>!garment||image.presentation_printed!==false),wanted=garment?audiences[key]:null;
    const rank=image=>!wanted||image.presentation_audience===wanted?0:image.presentation_audience==='Producto'?1:5;
    return [...photos].filter(image=>rank(image)<5).sort((a,b)=>rank(a)-rank(b)||(a.presentation_pose==='back'?1:0)-(b.presentation_pose==='back'?1:0));
  }
  function imageFor(p,key,scope='catalog'){return imagesFor(p,key,scope)[0]||null;}
  function ordered(key,orderKey=key,includeWithoutImages=false){
    const orders=context.state.config?.storefrontHome?.orders||{};
    const ids=context.state.storeOrderEditor?.homeDrafts?.get(orderKey)||orders[orderKey]||[];
    const ranks=new Map(ids.map((id,index)=>[Number(id),index]));
    const matchesGroup=Object.hasOwn(audiences,key)?matches:matchesCatalogType;
    return context.state.products.filter(product=>product.status!=='draft'&&product.status!=='hidden'&&matchesGroup(product,key))
      .sort((a,b)=>(ranks.get(Number(a.id))??1e9)-(ranks.get(Number(b.id))??1e9)||(Number(a.display_order??999999)-Number(b.display_order??999999)))
      .map(product=>({product,image:imageFor(product,key,'home')})).filter(row=>includeWithoutImages||row.image);
  }
  function imageHtml(p,image,label,key=''){const attrs=context.productBackgroundAttrs(p,'home',key),url=context.apiUrl(['gorras','tazas'].includes(key)&&image.foreground_url?image.foreground_url:image.url),original=context.apiUrl(image.original_url||(p.images||[]).find(row=>Number(row.id)===Number(image.id))?.url||p.primary_image_url||image.url);return `<span class="home-product-photo" data-home-photo-product="${Number(p.id)}" ${attrs}><img src="${esc(url)}" ${['gorras','tazas'].includes(key)?'data-home-object-preview crossorigin="anonymous"':''} data-original-src="${esc(original)}" alt="${esc(label||p.name)}" loading="lazy" decoding="async"></span>`;}
  function card({product,image},key,editing,orderKey=key){
    const name=esc(product.name),mediaId=Number(image?.id)||0;
    return `<article class="home-product" data-home-product-card="${product.id}" data-home-row="${esc(orderKey)}">
      <button class="home-product-open" type="button" data-home-product="${product.id}" data-home-media="${mediaId}" data-home-photo-group="${esc(key)}">
        ${image?imageHtml(product,image,null,key):'<span class="home-product-photo home-photo-missing">Sin foto</span>'}
        <span class="home-product-info"><span class="home-product-name">${name}</span><strong>${esc((context.priceLabel?.(product)??(Number(product.price_cents)>0?context.money(product.price_cents):'Consultar precio')))}</strong></span>
      </button>
      ${editing?`<button class="home-product-edit" type="button" data-home-edit="${product.id}" data-home-media="${mediaId}">Editar</button>
      <div class="home-product-sort">
        <button type="button" data-home-move="-1" aria-label="Mover ${name} antes">←</button>
        <button type="button" class="home-sort-handle" data-home-sort-handle title="Arrastrar ${name}" aria-label="Arrastrar ${name}">⠿</button>
        <button type="button" data-home-move="1" aria-label="Mover ${name} después">→</button>
      </div>`:context.quickCartButton(product)}
    </article>`;
  }
  function gallery(key,editing){const label=collections.find(c=>c.key===key).name,items=ordered(key);return `<section class="home-gallery" aria-label="${label}" data-home-gallery="${key}"><div class="home-gallery-head"><h2>${label}</h2><div class="home-gallery-actions">${editing?`<button type="button" class="home-new-product" data-home-new="${key}">+ Producto</button>`:''}<button type="button" class="home-see-all" data-home-collection="${key}">Ver colección <span aria-hidden="true">→</span></button><button type="button" class="home-scroll" data-home-scroll="${key}" data-home-direction="-1" aria-label="Ver productos anteriores de ${label}">‹</button><button type="button" class="home-scroll" data-home-scroll="${key}" data-home-direction="1" aria-label="Ver más productos de ${label}">›</button></div></div><div class="home-product-strip" data-home-strip="${key}">${items.length?items.map(item=>card(item,key,editing)).join(''):`<div class="home-gallery-empty"><span>${context.state.storeProductsLoaded?'Estamos preparando esta colección.':'Cargando productos…'}</span>${editing?`<button type="button" class="btn btn-ghost" data-home-new="${key}">Armar un producto para ${label}</button>`:`<a href="${esc(whatsapp('Hola SALMOS, quiero consultar por '+label+'.'))}" target="_blank" rel="noopener">Consultar modelos →</a>`}</div>`}</div></section>`;}
  function sideCard(gallery,editing,index,total){
    const {id,key,title}=gallery,items=ordered(key,id);
    const theme=document.documentElement.dataset.theme==='light'?'light':'dark';
    const selected=context.state.config?.storefrontVisuals?.covers?.[key]?.[theme]?.productId;
    const first=items.find(item=>Number(item.product.id)===Number(selected))||items[0];
    const label=esc(title),galleryId=esc(id);
    return `<section class="home-side-card" data-home-side-card="${galleryId}">
      <button type="button" class="home-side-link" data-home-collection="${esc(key)}" data-home-side-open="${galleryId}" data-home-object-kind="${esc(key)}">
        ${first?imageHtml(first.product,first.image,title,key):''}<span><strong>${label}</strong></span>
      </button>
      ${!editing&&first?context.quickCartButton(first.product):''}
      ${editing?`<div class="home-side-controls">
        <button type="button" data-home-side-move="-1" aria-label="Mover ${label} antes" ${index===0?'disabled':''}>↑</button>
        <button type="button" class="home-sort-handle" data-home-sort-handle title="Arrastrar ${label}" aria-label="Arrastrar ${label}">⠿</button>
        <button type="button" data-home-side-move="1" aria-label="Mover ${label} después" ${index===total-1?'disabled':''}>↓</button>
      </div>
      <button class="home-side-edit" type="button" data-edit-side-gallery="${galleryId}">Editar galería</button>
      <button class="home-side-edit" type="button" data-sort-side-products="${galleryId}">Ordenar productos</button>
      ${first?`<button class="home-side-edit" type="button" data-home-edit="${first.product.id}" data-home-media="${Number(first.image.id)||0}">Editar producto</button>`:''}`:''}
    </section>`;
  }
  function updateSideGalleries(galleries){
    context.state.storeOrderEditor.sideGalleryDraft=galleries;
    render();
    context.onSideGalleryChange?.();
  }
  function editSideGallery(id){
    if(!canSort())return;
    const galleries=sideGalleries(),current=galleries.find(row=>row.id===id);
    if(!current&&galleries.length>=30)return;
    const sources=new Map(collections.slice(3).map(row=>[row.key,row.name]));
    for(const row of context.state.categories||[])if(row.slug&&row.name)sources.set('category:'+row.slug,row.name);
    for(const row of context.state.products)if(row.category_slug&&row.category_name)sources.set('category:'+row.category_slug,row.category_name);
    if(current&&!sources.has(current.key))sources.set(current.key,current.key.replace('category:',''));
    const choices=Array.from(sources,([key,name])=>`<option value="${esc(key)}" ${current?.key===key?'selected':''}>${esc(name)}</option>`).join('');
    dialog('homeSideGalleryDialog',current?'Editar galería':'Agregar galería',`<form class="home-side-gallery-form">
      <label>Colección<select name="collection" required>${choices}</select></label>
      <label>Título<input name="title" maxlength="80" required value="${esc(current?.title||'')}"></label>
      <div class="home-dialog-actions"><button class="btn btn-primary" type="submit">Aplicar</button></div>
    </form>`);
    const el=$('#homeSideGalleryDialog'),form=el.querySelector('form'),title=form.elements.title,collection=form.elements.collection;
    let suggested=sources.get(collection.value)||'';
    if(!current)title.value=suggested;
    collection.onchange=()=>{
      const next=sources.get(collection.value)||'';
      if(!current&&title.value===suggested)title.value=next;
      suggested=next;
    };
    form.onsubmit=event=>{
      event.preventDefault();
      if(!canSort())return;
      const name=title.value.trim();
      if(!name){title.setCustomValidity('Escribí el título de la galería.');title.reportValidity();return;}
      const updated={id:current?.id||'side-'+crypto.randomUUID(),key:collection.value,title:name};
      if(current&&current.key!==updated.key)context.onHomeOrder?.(current.id,[]);
      updateSideGalleries(current?galleries.map(row=>row.id===current.id?updated:row):[...galleries,updated]);
      el.close();
    };
    title.oninput=()=>title.setCustomValidity('');
  }
  function sortSideProducts(id){
    if(!canSort())return;
    const gallery=sideGalleries().find(row=>row.id===id);
    if(!gallery)return;
    const items=ordered(gallery.key,id,true);
    dialog('homeSideGalleryProductsDialog',`Ordenar · ${gallery.title}`,`<div class="home-product-strip" data-home-strip="${esc(id)}">${items.map(item=>card(item,gallery.key,true,id)).join('')||'<p>Todavía no hay productos publicados en esta colección.</p>'}</div><div class="home-dialog-actions"><button class="btn btn-primary" type="button" data-home-dialog-close>Listo</button></div>`);
  }
  function rememberSideOrder(parent){
    const galleries=sideGalleries(),lookup=new Map(galleries.map(row=>[row.id,row]));
    const ordered=Array.from(parent.querySelectorAll(':scope > [data-home-side-card]'),card=>lookup.get(card.dataset.homeSideCard));
    if(ordered.length===galleries.length&&ordered.every(Boolean))updateSideGalleries(ordered);
  }
  const objectPreviewBounds=new Map();
  function fitHomeObjectPreview(img){
    if(!img.complete||!img.naturalWidth||!img.isConnected)return;const host=img.parentElement;
    let bounds=objectPreviewBounds.get(img.currentSrc||img.src);
    if(bounds===undefined){bounds=null;try{const canvas=document.createElement('canvas'),ratio=Math.min(1,200/Math.max(img.naturalWidth,img.naturalHeight));canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;let left=canvas.width,top=canvas.height,right=-1,bottom=-1;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>24){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}if(right>=left&&(right-left+1<canvas.width*.97||bottom-top+1<canvas.height*.97))bounds={left:left/canvas.width,top:top/canvas.height,width:(right-left+1)/canvas.width,height:(bottom-top+1)/canvas.height};}catch{}objectPreviewBounds.set(img.currentSrc||img.src,bounds);}
    if(!bounds)return;const width=host.clientWidth,height=host.clientHeight,scale=Math.min(width*.93/(bounds.width*img.naturalWidth),height*.93/(bounds.height*img.naturalHeight));if(!(scale>0))return;
    Object.assign(img.style,{width:img.naturalWidth*scale+'px',height:img.naturalHeight*scale+'px',left:(width/2-(bounds.left+bounds.width/2)*img.naturalWidth*scale)+'px',top:(height/2-(bounds.top+bounds.height/2)*img.naturalHeight*scale)+'px',right:'auto',bottom:'auto',maxWidth:'none',maxHeight:'none',padding:'0',objectFit:'contain'});
  }
  function fitHomeObjectPreviews(){document.querySelectorAll('[data-home-object-preview]').forEach(fitHomeObjectPreview);}
  function render(){if(!context)return;const home=isHome(),s=context.state,editing=Boolean(s.storeOrderEditor?.enabled);$('#storeHome')?.classList.toggle('hidden',!home);$('#catalogHeading')?.classList.toggle('hidden',home);document.body.classList.toggle('store-home-view',home);const background=context.storefrontPageBackground(home?'home':'catalog');if(background)document.body.style.setProperty('--home-page-background',background);else document.body.style.removeProperty('--home-page-background');
    if(home&&$('#homeCategoryGrid')){
      const side=sideGalleries();
      const html=`<div class="home-galleries">${['hombre','mujer','kids'].map(key=>gallery(key,editing)).join('')}</div>
        <aside class="home-side-rail" aria-label="Más en SALMOS">
          ${side.map((row,index)=>sideCard(row,editing,index,side.length)).join('')}
          ${editing?`<button type="button" class="btn btn-ghost home-side-add" data-add-side-gallery ${side.length>=30?'disabled':''}>+ Galería</button>`:''}
        </aside>`;
      if(html!==lastMarkup){
        const positions=new Map(Array.from($('#homeCategoryGrid').querySelectorAll('[data-home-strip]'),row=>[row.dataset.homeStrip,row.scrollLeft]));
        const sideScroll=$('.home-side-rail')?.scrollLeft||0;
        $('#homeCategoryGrid').innerHTML=html;
        $('.home-side-rail').scrollLeft=sideScroll;
        for(const row of $('#homeCategoryGrid').querySelectorAll('[data-home-strip]'))row.scrollLeft=positions.get(row.dataset.homeStrip)||0;
        lastMarkup=html;
      }
    }
    fitHomeObjectPreviews();refreshContactLinks();
  }
  function remember(strip){
    const key=strip.dataset.homeStrip,ids=Array.from(strip.querySelectorAll('[data-home-product-card]'),card=>Number(card.dataset.homeProductCard));
    context.onHomeOrder?.(key,ids);
    lastMarkup='';
    if(sideGalleries().some(row=>row.id===key))render();
  }
  function whatsapp(message) {
    const phone=String(context.state.config?.whatsapp || context.cfg.STORE_WHATSAPP || '5491162691341').replace(/\D/g,'');
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  }
  function cartSummary() {
    const lines=context.state.cart.map(item=>`${item.qty} × ${item.name}${[item.color,item.size].filter(Boolean).length?' · '+[item.color,item.size].filter(Boolean).join(' · '):''}`);
    return lines.length?'\n\nMi carrito:\n'+lines.join('\n'):'';
  }
  function wholesaleUrl() {
    return whatsapp('Hola SALMOS, quisiera confirmar las condiciones y el precio por mayor de mi pedido.'+cartSummary());
  }
  function refreshContactLinks() {
    if(!context) return;
    document.querySelectorAll('[data-wholesale-whatsapp]').forEach(a=>a.href=wholesaleUrl());
    document.querySelectorAll('[data-site-offer-whatsapp]').forEach(link=>{
      link.href=whatsapp('Hola, vi la tienda de SALMOS. Me interesa tener una página para mi negocio y quisiera más información.');
    });
  }
  function dialog(id,label,body) {
    let el=document.getElementById(id);
    if(!el){el=document.createElement('dialog');el.id=id;el.className='home-info-dialog';document.body.appendChild(el);}
    el.setAttribute('aria-label',label);
    el.innerHTML=`<div class="home-dialog-head"><h2>${esc(label)}</h2><button type="button" class="icon-btn" data-home-dialog-close aria-label="Cerrar">×</button></div>${body}`;
    if(!el.open) el.showModal();
    refreshContactLinks();
  }
  function openWholesale(){context.closeCart();window.SalmosWholesale?.open();}

  function manualDeliveryForm() {
    return window.SalmosStoreShipping.form();
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
  function installGallerySorting(){
    document.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-home-sort-handle]');
      if(!handle||!canSort()||event.button!==0||!event.isPrimary)return;
      const item=handle.closest('[data-home-product-card],[data-home-side-card]');
      if(!item)return;
      const parent=item.parentElement,side=item.hasAttribute('data-home-side-card');
      drag={item,parent,side,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,original:Array.from(parent.children)};
      parent.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    document.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;
      const {item,parent,side}=drag;
      if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<5)return;
      drag.moved=true;item.classList.add('sorting');
      const horizontal=!side||getComputedStyle(parent).display==='flex';
      const hit=document.elementFromPoint(event.clientX,event.clientY)?.closest(side?'[data-home-side-card]':'[data-home-product-card]');
      if(hit&&hit!==item&&hit.parentElement===parent){
        const rect=hit.getBoundingClientRect(),before=horizontal?event.clientX<rect.left+rect.width/2:event.clientY<rect.top+rect.height/2;
        parent.insertBefore(item,before?hit:hit.nextElementSibling);
      }
      const rect=parent.getBoundingClientRect();
      if(horizontal){
        if(event.clientX>rect.right-32)parent.scrollLeft+=14;
        else if(event.clientX<rect.left+32)parent.scrollLeft-=14;
      }else if(event.clientY>innerHeight-75)window.scrollBy(0,16);
      else if(event.clientY<125)window.scrollBy(0,-16);
    });
    function finish(event){
      if(!drag||event.pointerId!==drag.id)return;
      const {item,parent,side,moved,original}=drag;
      drag=null;item.classList.remove('sorting');
      if(!moved)return;
      if(event.type==='pointercancel'){parent.append(...original);return;}
      if(side)rememberSideOrder(parent);else remember(parent);
    }
    document.addEventListener('pointerup',finish);
    document.addEventListener('pointercancel',finish);
    document.addEventListener('lostpointercapture',finish);
  }
  function installGalleryEditorStyles(){
    const style=document.createElement('style');
    style.textContent=`
      .home-side-controls{display:flex;justify-content:space-around;border-top:1px solid var(--line)}
      .home-side-controls button{min-width:34px;min-height:32px;border:0;background:transparent;color:inherit;cursor:pointer}
      .home-side-controls button:disabled{opacity:.35;cursor:default}
      .home-sort-handle{touch-action:none;cursor:grab!important;font-size:20px}
      .home-product.sorting,.home-side-card.sorting{opacity:.62;outline:2px solid var(--gold)}
      .home-side-add{align-self:start;min-width:115px}
      .home-side-gallery-form{display:grid;gap:12px}
      .home-side-gallery-form label{display:grid;gap:6px}
      .home-side-gallery-form :is(input,select){width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:8px;color:var(--text);background:var(--surface)}
      #homeSideGalleryProductsDialog{width:min(880px,calc(100% - 24px));max-width:none}
      #homeSideGalleryProductsDialog .home-product{flex:0 0 min(200px,64vw)}
      .home-photo-missing{display:grid;place-items:center;min-height:130px}
    `;
    document.head.append(style);
  }
  function init(options){context=options;installGalleryEditorStyles();installGallerySorting();
    document.addEventListener('click',event=>{
      const edit=event.target.closest('[data-home-edit]');if(edit){event.preventDefault();context.editProduct?.(Number(edit.dataset.homeEdit),Number(edit.dataset.homeMedia));return;}
      const add=event.target.closest('[data-home-new]');if(add){event.preventDefault();context.newProduct?.(add.dataset.homeNew);return;}
      if(event.target.closest('[data-add-side-gallery]')){editSideGallery();return;}
      const editGallery=event.target.closest('[data-edit-side-gallery]');if(editGallery){editSideGallery(editGallery.dataset.editSideGallery);return;}
      const sortGallery=event.target.closest('[data-sort-side-products]');if(sortGallery){sortSideProducts(sortGallery.dataset.sortSideProducts);return;}
      const moveGallery=event.target.closest('[data-home-side-move]');
      if(moveGallery){
        if(!canSort())return;
        const card=moveGallery.closest('[data-home-side-card]'),direction=Number(moveGallery.dataset.homeSideMove),next=direction>0?card.nextElementSibling:card.previousElementSibling;
        if(next?.matches('[data-home-side-card]')){const parent=card.parentElement;parent.insertBefore(card,direction>0?next.nextElementSibling:next);rememberSideOrder(parent);}
        return;
      }
      const move=event.target.closest('[data-home-move]');if(move){if(!canSort())return;const card=move.closest('[data-home-product-card]'),next=Number(move.dataset.homeMove)>0?card.nextElementSibling:card.previousElementSibling;if(next){card.parentElement.insertBefore(card,Number(move.dataset.homeMove)>0?next.nextSibling:next);remember(card.parentElement);}return;}
      const scroll=event.target.closest('[data-home-scroll]');if(scroll){const strip=document.querySelector(`[data-home-strip="${scroll.dataset.homeScroll}"]`);strip?.scrollBy({left:Number(scroll.dataset.homeDirection)*strip.clientWidth*.8,behavior:'smooth'});return;}
      const product=event.target.closest('[data-home-product]');if(product){event.preventDefault();context.openProduct(Number(product.dataset.homeProduct),{mediaId:Number(product.dataset.homeMedia)||0,photoGroup:product.dataset.homePhotoGroup});return;}
      const category=event.target.closest('[data-home-collection]');if(category){event.preventDefault();navigate(category.dataset.homeCollection,true,sideGalleries().find(row=>row.id===category.dataset.homeSideOpen)||null);return;}
      if(event.target.closest('[data-store-home]')){event.preventDefault();goHome(Boolean(context.state.wholesaleMode));return;}
      if(event.target.closest('[data-home-all]')){event.preventDefault();navigate();return;}
      if(event.target.closest('[data-home-wholesale]')){event.preventDefault();openWholesale();return;}
      if(event.target.closest('[data-home-shipping]')){event.preventDefault();openShipping();return;}
      if(event.target.closest('[data-home-dialog-close]')){event.target.closest('dialog')?.close();return;}
      if(event.target.closest('[data-home-wholesale-cart]')){event.target.closest('dialog')?.close();if(context.state.cart.length)context.openCart();else navigate();return;}
    });
    render();
  }
  document.addEventListener('load',event=>{if(event.target.matches?.('[data-home-object-preview]'))fitHomeObjectPreview(event.target);},true);
  window.addEventListener('resize',fitHomeObjectPreviews);
  window.SalmosHome={init,render,matches,isHome,selectedName,navigate,goHome,openShipping,openWholesale,refreshContactLinks,manualDeliveryForm,dialog,backgroundAsset,whatsapp,manualCorreoShipping:true,isGarment,audience,imageFor,imagesFor,catalogAudiences,catalogTypesFor,matchesCatalogAudience,matchesCatalogType};
})();
