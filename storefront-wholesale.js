(() => {
  'use strict';
  let context;
  const $ = selector => document.querySelector(selector);
  const departments = [
    ['hombre','Hombre'], ['mujer','Mujer'], ['kids','Niños'], ['tazas','Tazas y Vasos'],
    ['gorras','Gorras'], ['agendas','Agendas'], ['libros','Libros']
  ];

  function groupsFor(products) {
    const groups = [], used = new Set();
    for (const [key, label] of departments) {
      const rows = products.filter(product => window.SalmosHome.matches(product, key));
      if (!rows.length) continue;
      groups.push({key,label,rows});
      rows.forEach(product => used.add(Number(product.id)));
    }
    for (const product of products) {
      if (used.has(Number(product.id))) continue;
      const key = 'category-'+(product.category_id || product.category_slug || 'products');
      let group = groups.find(group => group.key === key);
      if (!group) {
        group = {key,label:product.category_name || 'Más productos',rows:[]};
        groups.push(group);
      }
      group.rows.push(product);
    }
    return groups;
  }

  function productCard(product, key) {
    const {apiUrl, money, escapeHtml:esc, quickCartButton, productCardImages, productBackgroundAttrs} = context;
    const image = window.SalmosHome.imageFor(product,key) || productCardImages(product)[0];
    const url = image?.url;
    return `<article class="wholesale-product">
      <button class="wholesale-product-open" type="button" data-wholesale-product="${Number(product.id)}" data-wholesale-media="${Number(image?.id)||0}">
        <span class="wholesale-product-image ${window.SalmosHome.isGarment(product)?'garment':'object'}"
              data-wholesale-photo-product="${Number(product.id)}" data-wholesale-photo-collection="${esc(key)}" ${productBackgroundAttrs(product)}>
          ${url?`<img src="${esc(apiUrl(url))}" data-original-src="${esc(image.original_url||'')}" alt="" loading="lazy" decoding="async">`:''}
        </span>
        <span class="wholesale-product-info"><span class="wholesale-product-name">${esc(product.name)}</span>
          <strong>${esc(money(product.price_cents))}<small> / u</small></strong></span>
      </button>
      ${quickCartButton(product)}
    </article>`;
  }

  function syncPage(active) {
    const {apiUrl, state} = context;
    document.body.classList.toggle('wholesale-view', active);
    const nav = $('.home-header-nav');
    nav?.querySelector('[aria-current]')?.removeAttribute('aria-current');
    nav?.querySelector(active ? '[data-home-wholesale]' : '[data-store-home]')?.setAttribute('aria-current','page');
    const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    const background = state.config?.storefrontVisuals?.wholesalePageBackgrounds?.[theme];
    if (active && background?.url) {
      document.body.style.setProperty('--wholesale-page-background', `url("${apiUrl(background.url)}")`);
    } else document.body.style.removeProperty('--wholesale-page-background');
  }

  let lastMarkup = '';
  function render() {
    if (!context) return;
    const {state,money,escapeHtml:esc} = context, active = Boolean(state.wholesaleMode);
    syncPage(active);
    let host = $('#wholesaleCatalog');
    if (!host) {
      host = document.createElement('section');
      host.id = 'wholesaleCatalog';
      host.className = 'wholesale-catalog hidden';
      $('#storeHome').before(host);
    }
    host.classList.toggle('hidden', !active);
    if (!active) return;
    const products = state.products.filter(p => p.status === 'published' || (!p.status && p.sale_mode !== 'order'));
    const groups = groupsFor(products), promotion = context.cartPromotion(0);
    const count = state.cart.reduce((n,x) => n + x.qty,0);
    const clothes = state.cart.filter(item => window.SalmosHome.isGarment(products.find(p=>Number(p.id)===Number(item.productId)) || {}))
      .reduce((n,item)=>n+item.qty,0);
    const hint = promotion.totalDiscountCents ? `${promotion.label} · Ahorrás ${money(promotion.totalDiscountCents)}` :
      clothes > 0 && clothes < 5 ? `Te faltan ${5-clothes} prendas para el mínimo del surtido.` :
      'Los descuentos se aplican al alcanzar las cantidades de cada promoción.';
    const html = `<div class="wholesale-heading"><div><span class="eyebrow">SALMOS</span><h1>Compras por mayor</h1></div>
      <button class="btn btn-ghost" type="button" data-wholesale-back>Volver a la tienda</button></div>
      <p class="wholesale-instructions">Elegí por sección. <strong>Tazas y gorras se agregan de a 6.</strong>
        En prendas podés llevar una curva del mismo diseño y color o armar un surtido desde <strong>5 unidades</strong>.
        El carrito aplica los descuentos vigentes.</p>
      <nav class="wholesale-sections" aria-label="Secciones mayoristas">${groups.map(g=>`<a href="#wholesale-${esc(g.key)}">${esc(g.label)}</a>`).join('')}</nav>
      ${groups.map(g=>`<section class="wholesale-group" id="wholesale-${esc(g.key)}"><h2>${esc(g.label)}</h2>
        <div class="wholesale-grid">${g.rows.map(p=>productCard(p,g.key)).join('')}</div></section>`).join('')||'<p>Cargando productos…</p>'}
      <div class="wholesale-cart-bar"><div><strong>${count} ${count===1?'unidad':'unidades'} · ${money(promotion.finalSubtotalCents)}</strong>
        <small>${esc(hint)}</small></div><button type="button" class="btn btn-primary" data-wholesale-cart>Ver carrito</button></div>`;
    if (lastMarkup !== html) {
      host.innerHTML = html;
      lastMarkup = html;
    }
  }

  function open() {
    Object.assign(context.state, {wholesaleMode:true,storefrontCatalog:true,query:'',homeCollection:null});
    context.renderCategories();
    context.renderProducts();
    render();
    window.scrollTo({top:0,behavior:'instant'});
  }

  function init(value) {
    context = value;
    document.addEventListener('click', event => {
      const product = event.target.closest('[data-wholesale-product]');
      if (product) {
        context.openProduct(Number(product.dataset.wholesaleProduct), {mediaId:Number(product.dataset.wholesaleMedia)||0});
        return;
      }
      if (event.target.closest('[data-wholesale-back]')) window.SalmosHome.goHome(true);
      if (event.target.closest('[data-wholesale-cart]')) context.openCart();
    });
  }

  window.SalmosWholesale = {init,render,open};
})();
