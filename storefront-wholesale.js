(() => {
  'use strict';
  let context;
  const $=selector=>document.querySelector(selector);
  function render(){
    if(!context)return;
    const {state,money,escapeHtml:esc,apiUrl}=context,active=Boolean(state.wholesaleMode);
    document.body.classList.toggle('wholesale-view',active);
    let host=$('#wholesaleCatalog');
    if(!host){host=document.createElement('section');host.id='wholesaleCatalog';host.className='wholesale-catalog hidden';$('#storeHome').before(host);}
    host.classList.toggle('hidden',!active);if(!active)return;
    const products=state.products.filter(p=>p.status==='published'||(!p.status&&p.sale_mode!=='order')),used=new Set(),groups=[];
    for(const [key,label] of [['hombre','Hombre'],['mujer','Mujer'],['kids','Niños'],['tazas','Tazas y Vasos'],['gorras','Gorras'],['agendas','Agendas'],['libros','Libros']]){
      const rows=products.filter(p=>window.SalmosHome.matches(p,key));if(rows.length){groups.push({key,label,rows});rows.forEach(p=>used.add(Number(p.id)));}
    }
    for(const p of products.filter(p=>!used.has(Number(p.id)))){const key='category-'+(p.category_id||p.category_slug||'products');let group=groups.find(g=>g.key===key);if(!group){group={key,label:p.category_name||'Más productos',rows:[]};groups.push(group);}group.rows.push(p);}
    const promotion=context.cartPromotion(0),count=state.cart.reduce((n,x)=>n+x.qty,0),clothes=state.cart.filter(x=>window.SalmosHome.isGarment(state.products.find(p=>Number(p.id)===Number(x.productId))||{})).reduce((n,x)=>n+x.qty,0);
    host.innerHTML=`<div class="wholesale-heading"><div><span class="eyebrow">SALMOS</span><h1>Compras por mayor</h1></div><button class="btn btn-ghost" type="button" data-wholesale-back>Volver a la tienda</button></div><p class="wholesale-instructions">Elegí por sección. <strong>Tazas y gorras: agregamos 6 unidades.</strong> En prendas podés llevar la curva completa del mismo diseño y color, o armar un surtido de <strong>5 unidades como mínimo</strong>. Los descuentos vigentes se calculan automáticamente en el carrito.</p><nav class="wholesale-sections" aria-label="Secciones mayoristas">${groups.map(g=>`<a href="#wholesale-${esc(g.key)}">${esc(g.label)}</a>`).join('')}</nav>${groups.map(g=>`<section class="wholesale-group" id="wholesale-${esc(g.key)}"><h2>${esc(g.label)}</h2><div class="wholesale-grid">${g.rows.map(p=>{const image=window.SalmosHome.imageFor(p,g.key)||p.images?.[0],url=image?.url||p.primary_image_url||'';return `<button class="wholesale-product" type="button" data-wholesale-product="${Number(p.id)}" data-wholesale-media="${Number(image?.id)||0}"><span class="wholesale-product-image ${window.SalmosHome.isGarment(p)?'garment':'object'}">${url?`<img src="${esc(apiUrl(url))}" alt="${esc(p.name)}" loading="lazy" decoding="async">`:''}</span><span class="wholesale-product-name">${esc(p.name)}</span><strong>${esc(money(p.price_cents))}<small> / u</small></strong></button>`;}).join('')}</div></section>`).join('')||'<p>Cargando productos…</p>'}<div class="wholesale-cart-bar"><div><strong>${count} unidades · ${money(promotion.finalSubtotalCents)}</strong><small>${promotion.totalDiscountCents?`${esc(promotion.label)}: ahorrás ${money(promotion.totalDiscountCents)}`:clothes>0&&clothes<5?`Te faltan ${5-clothes} prendas para el mínimo del surtido.`:'Los descuentos se aplican al alcanzar las cantidades de cada promoción.'}</small></div><button type="button" class="btn btn-primary" data-wholesale-cart>Ver carrito</button></div>`;
  }
  function open(){context.state.wholesaleMode=true;context.state.storefrontCatalog=true;context.state.query='';context.state.homeCollection=null;context.renderCategories();context.renderProducts();render();$('#wholesaleCatalog')?.scrollIntoView({block:'start'});}
  function close(){context.state.wholesaleMode=false;render();window.SalmosHome.goHome();}
  function init(value){context=value;document.addEventListener('click',event=>{const product=event.target.closest('[data-wholesale-product]');if(product){context.openProduct(Number(product.dataset.wholesaleProduct),{mediaId:Number(product.dataset.wholesaleMedia)||0});return;}if(event.target.closest('[data-wholesale-back]'))close();if(event.target.closest('[data-wholesale-cart]'))context.openCart();});}
  window.SalmosWholesale={init,render,open,close};
})();
