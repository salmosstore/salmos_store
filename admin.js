(() => {
  'use strict';

  const cfg = window.SALMOS_CONFIG || {};
  const API = (cfg.API_BASE_URL || '').replace(/\/$/, '');
  const apiUrl = path => `${API}${path}`;
  const qs = (s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s]));
  const money=(c=0)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format((Number(c)||0)/100);
  const pesosToCents=v=>Math.round((Number(v)||0)*100);
  const centsToPesos=v=>((Number(v)||0)/100).toFixed(0);
  const today=()=>new Date().toISOString().slice(0,10);

  const state={view:'dashboard',categories:[],products:[],orders:[],customOrders:[],coupons:[],flyers:[],settings:{},correoStatus:null,editingProduct:null,editingCouponId:null,editingMovementId:null,newFiles:[],mediaItems:[],mediaDragKey:null,reportRange:'month',customFrom:'',customTo:'',stockItems:[],stockFilters:{category:'',stage:'',size:'',color:'',fit:'',audience:'',sort:'product'},designAssets:[],activeDesignId:null,activeFlyerId:null,investmentItems:[]};

  async function api(path, options={}){
    const headers=new Headers(options.headers||{});
    if(options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const res=await fetch(apiUrl(path),{...options,headers,credentials:'same-origin'});
    const text=await res.text(); let data=null; try{data=text?JSON.parse(text):null}catch{data={message:text}};
    if(!res.ok){
      const err=new Error(data?.error||data?.message||`Error ${res.status}`); err.status=res.status; throw err;
    }
    return data;
  }
  async function downloadAdminFile(path,fallbackName='archivo.pdf'){
    const res=await fetch(apiUrl(path),{credentials:'same-origin'});if(!res.ok){let msg=`Error ${res.status}`;try{const d=await res.json();msg=d.error||d.message||msg}catch{}throw new Error(msg);}const blob=await res.blob();const disp=res.headers.get('content-disposition')||'';const m=disp.match(/filename="?([^";]+)"?/i);const name=m?.[1]||fallbackName;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  function toast(msg,type=''){const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;qs('#toastStack').appendChild(el);setTimeout(()=>el.remove(),3500)}
  function setTheme(t){document.documentElement.dataset.theme=t==='light'?'light':'dark';localStorage.setItem('salmos_theme',document.documentElement.dataset.theme)}
  function initTheme(){const s=localStorage.getItem('salmos_theme');setTheme(s|| (matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'))}

  function mediaTypeFromName(name=''){return /\.(mp4|webm|mov|m4v|ogv)(?:$|\?)/i.test(String(name))?'video':'image'}
  function mediaPreviewHtml(item){
    if(item.mediaType==='video') return `<video src="${escapeHtml(item.url)}" muted playsinline preload="metadata"></video><span class="salmos-media-kind">VIDEO</span>`;
    return `<img src="${escapeHtml(item.url)}" alt=""><span class="salmos-media-kind">FOTO</span>`;
  }
  function ensureMediaAdminStyles(){
    if(document.getElementById('salmosMediaAdminStyles'))return;
    const style=document.createElement('style');style.id='salmosMediaAdminStyles';style.textContent=`
      .salmos-media-help{margin:6px 0 12px;color:var(--muted);font-size:.84rem;line-height:1.45}
      .salmos-media-list{display:grid;gap:10px;margin-top:12px}
      .salmos-media-item{display:grid;grid-template-columns:44px 86px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:16px;background:var(--surface);cursor:grab}
      .salmos-media-item.dragging{opacity:.45}.salmos-media-order{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--surface-2);font-weight:900;color:var(--gold-2)}
      .salmos-media-preview{width:86px;height:86px;border-radius:12px;overflow:hidden;background:var(--surface-2);display:grid;place-items:center;position:relative}
      .salmos-media-preview img,.salmos-media-preview video{width:100%;height:100%;object-fit:contain;background:#0b0b0c}
      .salmos-media-kind{position:absolute;left:5px;bottom:5px;font-size:.58rem;font-weight:900;letter-spacing:.08em;padding:3px 5px;border-radius:6px;background:rgba(0,0,0,.72);color:#fff}
      .salmos-media-copy{min-width:0}.salmos-media-copy strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.salmos-media-copy small{display:block;color:var(--muted);margin-top:4px}
      .salmos-media-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.salmos-media-actions .btn{min-width:42px;padding:0 12px}
      @media(max-width:700px){.salmos-media-item{grid-template-columns:38px 68px 1fr}.salmos-media-preview{width:68px;height:68px}.salmos-media-actions{grid-column:2/-1;justify-content:flex-start}}
    `;document.head.appendChild(style);
  }
  function renderMediaManager(){
    const host=qs('#mediaOrderList');if(!host)return;
    host.innerHTML=state.mediaItems.length?state.mediaItems.map((item,i)=>`<div class="salmos-media-item" draggable="true" data-media-key="${escapeHtml(item.key)}"><div class="salmos-media-order">${i+1}</div><div class="salmos-media-preview">${mediaPreviewHtml(item)}</div><div class="salmos-media-copy"><strong>${escapeHtml(item.name||`Archivo ${i+1}`)}</strong><small>${item.existing?'Ya guardado':'Nuevo · se sube al guardar'} · posición ${i+1}</small></div><div class="salmos-media-actions"><button type="button" class="btn btn-ghost" data-move-media="-1" data-media-key="${escapeHtml(item.key)}" ${i===0?'disabled':''} aria-label="Subir">↑</button><button type="button" class="btn btn-ghost" data-move-media="1" data-media-key="${escapeHtml(item.key)}" ${i===state.mediaItems.length-1?'disabled':''} aria-label="Bajar">↓</button><button type="button" class="btn btn-danger" data-remove-media="${escapeHtml(item.key)}" aria-label="Eliminar">×</button></div></div>`).join(''):`<div class="notice">Todavía no cargaste fotos ni videos.</div>`;
  }
  function moveMedia(key,delta){const i=state.mediaItems.findIndex(x=>x.key===key);if(i<0)return;const j=i+delta;if(j<0||j>=state.mediaItems.length)return;[state.mediaItems[i],state.mediaItems[j]]=[state.mediaItems[j],state.mediaItems[i]];renderMediaManager()}
  function addSelectedMedia(files){
    for(const file of files){const mediaType=file.type?.startsWith('video/')||mediaTypeFromName(file.name)==='video'?'video':'image';const key=`new-${Date.now()}-${Math.random().toString(36).slice(2)}`;state.mediaItems.push({key,existing:false,file,url:URL.createObjectURL(file),name:file.name,mediaType})}
    state.newFiles=state.mediaItems.filter(x=>!x.existing).map(x=>x.file);renderMediaManager();
  }
  function resetProductDialogState(){
    for(const item of state.mediaItems||[]){if(!item.existing&&item.url?.startsWith('blob:')){try{URL.revokeObjectURL(item.url)}catch{}}}
    state.newFiles=[];state.mediaItems=[];state.mediaDragKey=null;state.editingProduct=null;
    const saveBtn=qs('#saveProductBtn');if(saveBtn)saveBtn.disabled=false;
  }
  function closeProductDialog(){const dialog=qs('#productDialog');if(dialog?.open)dialog.close();}

  const titles={dashboard:'Dashboard',products:'Productos',orders:'Órdenes',customOrders:'Pedidos',stock:'Stock',coupons:'Cupones',categories:'Categorías',expenses:'Caja',flyers:'Flyers',designs:'Diseños',settings:'Configuración'};

  async function navigate(view){state.view=view;qs('#viewTitle').textContent=titles[view]||view;qsa('.admin-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));qs('#adminSidebar').classList.remove('open');const host=qs('#adminContent');host.innerHTML='<div class="empty-state"><strong>Cargando...</strong></div>';try{if(view==='dashboard')await renderDashboard();if(view==='products')await renderProducts();if(view==='orders')await renderOrders();if(view==='customOrders')await renderCustomOrders();if(view==='stock')await renderStock();if(view==='coupons')await renderCoupons();if(view==='categories')await renderCategories();if(view==='expenses')await renderExpenses();if(view==='flyers')await renderFlyers();if(view==='designs')await renderDesigns();if(view==='settings')await renderSettings()}catch(e){renderAccessError(e)}}

  function renderAccessError(e){
    const msg=e.status===503?'El panel administrativo está preparado, pero todavía falta activar Cloudflare Access cuando el dominio quede activo.':e.status===401?'Tu sesión de Cloudflare Access no está autorizada para este panel.':e.message;
    qs('#adminContent').innerHTML=`<div class="empty-state"><strong>Panel protegido</strong>${escapeHtml(msg)}</div>`;
  }

  async function ensureCategories(){if(state.categories.length)return;const d=await api('/api/admin/categories');state.categories=d.items||[]}

  function reportRangeDates(){
    const now=new Date();
    if(state.reportRange==='total')return {from:'1970-01-01T00:00:00.000Z',to:now.toISOString()};
    if(state.reportRange==='year')return {from:new Date(now.getFullYear(),0,1).toISOString(),to:now.toISOString()};
    if(state.reportRange==='custom'){
      const from=state.customFrom?new Date(`${state.customFrom}T00:00:00-03:00`).toISOString():'1970-01-01T00:00:00.000Z';
      const to=state.customTo?new Date(`${state.customTo}T23:59:59-03:00`).toISOString():now.toISOString();
      return {from,to};
    }
    return {from:new Date(now.getFullYear(),now.getMonth(),1).toISOString(),to:now.toISOString()};
  }
  function reportFiltersHtml(){
    return `<div class="report-filter-wrap"><div class="finance-filters">${[['month','Mes'],['year','Año'],['total','Total'],['custom','Fechas']].map(([v,l])=>`<button type="button" class="btn btn-ghost ${state.reportRange===v?'active':''}" data-report-range="${v}">${l}</button>`).join('')}</div>${state.reportRange==='custom'?`<div class="custom-date-filter"><label>Desde <input class="input" id="reportFrom" type="date" value="${escapeHtml(state.customFrom)}"></label><label>Hasta <input class="input" id="reportTo" type="date" value="${escapeHtml(state.customTo)}"></label><button type="button" class="btn btn-primary" id="applyReportDates">Aplicar</button></div>`:''}</div>`;
  }
  function miniStockSummary(summary={}){
    const total=Number(summary.total)||0;
    const categories=Array.isArray(summary.categories)?summary.categories:[];
    const products=Array.isArray(summary.products)?summary.products:[];
    const productCards=products.map(p=>{
      const variants=Array.isArray(p.variants)?p.variants:[];
      const sizeMap=new Map(),colorMap=new Map();
      variants.forEach(v=>{const n=Number(v.units)||0;if(v.size)sizeMap.set(v.size,(sizeMap.get(v.size)||0)+n);if(v.color)colorMap.set(v.color,(colorMap.get(v.color)||0)+n)});
      const sizes=[...sizeMap.entries()].sort((a,b)=>stockSizeRank(a[0])-stockSizeRank(b[0])||String(a[0]).localeCompare(String(b[0])));
      const colors=[...colorMap.entries()];
      const counts=sizes.length?sizes.map(([k,n])=>`${escapeHtml(k)}: ${n}`).join(' · '):colors.length?colors.map(([k,n])=>`${escapeHtml(k)}: ${n}`).join(' · '):`Unidades: ${Number(p.units)||0}`;
      return `<article class="dashboard-stock-product" data-stock-product-card data-stock-category="${escapeHtml(String(p.category||''))}"><div class="dashboard-stock-product-media">${p.imageUrl?`<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name||'Producto')}" loading="lazy">`:'<span>SALMOS</span>'}</div><div class="dashboard-stock-product-copy"><strong>${escapeHtml(p.name||'Producto')}</strong><small>${escapeHtml(p.category||'Sin categoría')}</small><div>${counts}</div></div></article>`;
    }).join('');
    return `<div class="admin-card dashboard-stock-summary"><div class="stock-size-summary"><button type="button" class="stock-count-chip total active" data-stock-filter=""><span>Todo</span><strong>${total}</strong></button>${categories.map(x=>`<button type="button" class="stock-count-chip" data-stock-filter="${escapeHtml(String(x.name||''))}"><span>${escapeHtml(x.name||'Sin categoría')}</span><strong>${Number(x.units)||0}</strong></button>`).join('')}</div><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="dashboardStockGallery" data-scroll-dir="-1" aria-label="Anterior">‹</button><div class="dashboard-stock-products" id="dashboardStockGallery">${productCards||'<div class="empty-state"><strong>Sin productos con stock.</strong></div>'}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="dashboardStockGallery" data-scroll-dir="1" aria-label="Siguiente">›</button></div></div>`
  }

  function miniCouponsTable(items=[]){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Código</th><th>Beneficio</th><th>Estado</th></tr></thead><tbody>${items.length?items.map(c=>`<tr><td><strong>${escapeHtml(c.code)}</strong></td><td>${escapeHtml(couponBenefitText(c))}</td><td><span class="status ${Number(c.active)?'success':'warning'}">${Number(c.active)?'Activo':'Pausado'}</span></td></tr>`).join(''):'<tr><td colspan="3">Sin cupones.</td></tr>'}</tbody></table></div>`}
  function miniCategoriesTable(items=[]){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Categoría</th><th>Estado</th></tr></thead><tbody>${items.length?items.map(c=>`<tr><td><strong>${escapeHtml(c.name)}</strong></td><td><span class="status ${Number(c.active)?'success':'warning'}">${Number(c.active)?'Activa':'Oculta'}</span></td></tr>`).join(''):'<tr><td colspan="2">Sin categorías.</td></tr>'}</tbody></table></div>`}

  async function renderDashboard(){
    const r=reportRangeDates();
    const d=await api(`/api/admin/dashboard?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const k=d.kpis||{};
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head dashboard-filter-head"><div><h2 style="margin:0">Resumen financiero</h2><small class="muted">Por defecto ves el mes actual.</small></div>${reportFiltersHtml()}</div>
      <div class="kpi-grid finance-kpis-v4">
        <div class="kpi"><small>Ventas</small><strong>${money(k.productSalesCents)}</strong><em>Productos vendidos</em></div>
        <div class="kpi"><small>Envíos</small><strong>${money(k.shippingRevenueCents)}</strong><em>Cobrado por envíos</em></div>
        <div class="kpi expense-kpi"><small>Egresos</small><strong>− ${money(k.expensesCents)}</strong><em>Egresos cargados</em></div>
        <div class="kpi ${Number(k.balanceCents)<0?'negative-kpi':''}"><small>Balance</small><strong>${money(k.balanceCents)}</strong><em>Ingresos − egresos${Number(k.extraIncomeCents)?` · incluye ${money(k.extraIncomeCents)} de otros ingresos`:''}</em></div>
      </div>
      <div class="dashboard-quick-grid">
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Órdenes recientes</h2><button class="btn btn-ghost" data-go="orders">Abrir</button></div>${ordersTable(d.recentOrders||[])}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Stock</h2><button class="btn btn-ghost" data-go="stock">Abrir</button></div>${miniStockSummary(d.stockSummary||{})}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Cupones</h2><button class="btn btn-ghost" data-go="coupons">Abrir</button></div>${miniCouponsTable(d.coupons||[])}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Categorías</h2><button class="btn btn-ghost" data-go="categories">Abrir</button></div>${miniCategoriesTable(d.categories||[])}</section>
      </div>`;
  }

  async function renderProducts(){
    await ensureCategories();
    const d=await api('/api/admin/products');state.products=d.items||[];
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div class="admin-toolbar"><input class="input" id="adminProductSearch" placeholder="Buscar producto..."></div><div class="admin-actions"><button class="btn btn-ghost" type="button" id="toggleBulkPriceBtn">Ajustes masivos</button><button class="btn btn-primary" id="newProductBtn">+ Nuevo producto</button></div></div>
      <section class="settings-card bulk-price-card hidden" id="bulkPricePanel">
        <div class="admin-section-head"><div><h3 style="margin:0">Actualización masiva de precios</h3><small class="muted">Abrí este panel solo cuando lo necesites.</small></div><button class="btn btn-ghost" type="button" id="closeBulkPriceBtn">Cerrar</button></div>
        <div class="form-grid">
          <div class="field"><label>Aplicar a</label><select class="select" id="bulkCategory"><option value="">Todos los productos</option>${state.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Acción</label><select class="select" id="bulkDirection"><option value="increase">Aumentar</option><option value="decrease">Bajar</option></select></div>
          <div class="field"><label>Tipo</label><select class="select" id="bulkMode"><option value="percent">Porcentaje (%)</option><option value="fixed">Monto fijo ($)</option></select></div>
          <div class="field"><label>Valor</label><input class="input" id="bulkValue" type="number" min="0" step="1"></div>
          <div class="field"><label>Precio desde ($)</label><input class="input" id="bulkMinPrice" type="number" min="0" placeholder="Opcional"></div><div class="field"><label>Precio hasta ($)</label><input class="input" id="bulkMaxPrice" type="number" min="0" placeholder="Opcional"></div><div class="field"><label>Redondear a</label><select class="select" id="bulkRound"><option value="100">$100</option><option value="500">$500</option><option value="1000">$1.000</option></select></div>
          <div class="field" style="align-self:end"><button class="btn btn-primary" type="button" id="applyBulkPriceBtn">Aplicar cambio</button></div>
        </div>
        <small class="field-help">Se aplica sobre los productos marcados ✓. Si no marcás ninguno, usa categoría y rango de precio. Siempre redondea al importe elegido.</small>
      </section>
      <div id="adminProductsTable">${groupedProductsHtml(state.products)}</div>`;
  }
  function internalPrepLabel(p){
    if(p.inventory_stage==='outlet')return '<span class="status warning">Outlet</span>';
    if(p.inventory_stage!=='to_print')return '<span class="status success">Terminado</span>';
    const missing=[];if(!Number(p.garment_ready))missing.push('falta producto base');if(!Number(p.print_ready))missing.push('falta estampa');
    return `<span class="status warning">En producción</span>${missing.length?`<small class="internal-stock-note">${escapeHtml(missing.join(' · '))}</small>`:'<small class="internal-stock-note">producto base y estampa disponibles</small>'}`;
  }
  function publicationLabel(p){return `<span class="status ${p.status==='published'?'success':'warning'}">${p.status==='published'?'Publicado':p.status==='draft'?'Borrador':'Oculto'}</span>`}
  function productsTable(items){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th style="width:38px">✓</th><th>Producto</th><th>Precio</th><th>Stock</th><th>Estado de la publicación</th><th></th></tr></thead><tbody>${items.length?items.map(p=>`<tr><td><input type="checkbox" data-bulk-product="${p.id}" aria-label="Seleccionar ${escapeHtml(p.name)}"></td><td><div style="display:flex;align-items:center;gap:10px">${p.primary_image_url?`<img class="mini-image" src="${escapeHtml(p.primary_image_url)}" alt="">`:'<div class="mini-image product-placeholder">S</div>'}<strong>${escapeHtml(p.name)}</strong></div></td><td>${money(p.price_cents)}</td><td>${p.available_stock}</td><td>${publicationLabel(p)}</td><td><div class="admin-actions"><button class="btn btn-ghost" data-edit-product="${p.id}">Editar</button><button class="btn btn-ghost" data-duplicate-product="${p.id}">Duplicar</button></div></td></tr>`).join(''):`<tr><td colspan="6"><div class="empty-state"><strong>Todavía no hay productos.</strong>Creá el primero desde este panel.</div></td></tr>`}</tbody></table></div>`}
  function productStageKey(p){return p.inventory_stage==='outlet'?'outlet':p.inventory_stage==='to_print'?'to_print':'finished'}
  function stageTitle(k){return k==='outlet'?'Outlet':k==='to_print'?'En producción':'Terminado'}
  function groupedProductsHtml(items){if(!items.length)return productsTable([]);const catOrder=new Map(state.categories.map((c,i)=>[String(c.name),i]));const groups=new Map();for(const p of items){const cat=p.category_name||'Sin categoría';const stage=productStageKey(p);const key=`${cat}|||${stage}`;if(!groups.has(key))groups.set(key,{cat,stage,items:[]});groups.get(key).items.push(p)}return [...groups.values()].sort((a,b)=>(catOrder.get(a.cat)??999)-(catOrder.get(b.cat)??999)||a.cat.localeCompare(b.cat,'es')||['finished','to_print','outlet'].indexOf(a.stage)-['finished','to_print','outlet'].indexOf(b.stage)).map(g=>`<section class="inventory-group"><div class="inventory-group-head"><h3>${escapeHtml(g.cat)}</h3><span>${stageTitle(g.stage)} · ${g.items.length}</span></div>${productsTable(g.items)}</section>`).join('')}

  function bindProductSort(){
    const body=qs('#sortableProducts');if(!body)return;let dragging=null;
    body.querySelectorAll('.drag-handle').forEach(handle=>handle.addEventListener('pointerdown',e=>{const row=handle.closest('[data-sort-product]');if(!row)return;dragging=row;row.classList.add('sorting');handle.setPointerCapture?.(e.pointerId);e.preventDefault()}));
    body.addEventListener('pointermove',e=>{if(!dragging)return;const el=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-sort-product]');if(!el||el===dragging||el.parentElement!==body)return;const rect=el.getBoundingClientRect();body.insertBefore(dragging,e.clientY<rect.top+rect.height/2?el:el.nextSibling)});
    const finish=async()=>{if(!dragging)return;dragging.classList.remove('sorting');dragging=null;const ids=qsa('[data-sort-product]',body).map(r=>Number(r.dataset.sortProduct));try{await api('/api/admin/products/order',{method:'PATCH',body:JSON.stringify({ids})});toast('Orden guardado','success')}catch(err){toast(err.message,'error')}};
    body.addEventListener('pointerup',finish);body.addEventListener('pointercancel',finish);
  }

  function normalizeCategoryKey(value=''){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
  function productCategoryById(id){return state.categories.find(c=>Number(c.id)===Number(id))||null}
  function productCategoryMode(categoryId){
    const c=productCategoryById(categoryId);if(!c)return '';
    const key=normalizeCategoryKey(`${c.slug||''} ${c.name||''}`);
    return /(remera|camiseta|chomba|buzo|prenda)/.test(key)?'sized':'simple';
  }
  function defaultVariantsForMode(mode,color='Negro'){
    if(mode==='sized')return ['S','M','L','XL','XXL'].map(size=>({id:null,color,size,stock:1,sku:''}));
    if(mode==='simple')return [{id:null,color:'',size:'',stock:1,sku:''}];
    return [];
  }
  function collectVariantRows(){
    const builder=qs('#variantBuilder');if(!builder)return [];
    return qsa('.variant-row',builder).map(r=>({
      id:Number(qs('[data-v="id"]',r)?.value)||null,
      color:String(qs('[data-v="color"]',r)?.value||'').trim(),
      size:String(qs('[data-v="size"]',r)?.value||'').trim(),
      stock:Math.max(0,Math.trunc(Number(qs('[data-v="stock"]',r)?.value)||0)),
      sku:String(qs('[data-v="sku"]',r)?.value||'').trim()
    }));
  }
  function convertVariantsForMode(items,fromMode,toMode){
    const rows=Array.isArray(items)?items:[];
    if(toMode==='simple'){
      if(!rows.length)return defaultVariantsForMode('simple');
      const groups=new Map();
      for(const row of rows){
        const key=String(row.color||'').trim();
        const current=groups.get(key)||{id:null,color:key,size:'',stock:0,sku:''};
        if(!current.id&&row.id)current.id=row.id;
        current.stock+=Math.max(0,Number(row.stock)||0);
        if(!current.sku&&row.sku)current.sku=row.sku;
        groups.set(key,current);
      }
      return [...groups.values()];
    }
    if(toMode==='sized'){
      if(fromMode==='sized'&&rows.length)return rows;
      const source=rows.length?rows:[{color:'Negro',stock:1}];
      const out=[];
      for(const row of source){
        ['S','M','L','XL','XXL'].forEach((size,i)=>out.push({id:i===0?(row.id||null):null,color:row.color||'Negro',size,stock:i===0?(Number(row.stock)||0):0,sku:i===0?(row.sku||''):''}));
      }
      return out;
    }
    return rows;
  }
  function stockStepper(value=0){
    const n=Math.max(0,Math.trunc(Number(value)||0));
    return `<div class="variant-stock-control" aria-label="Stock"><button type="button" class="variant-stock-btn" data-stock-step="-1" aria-label="Restar una unidad">−</button><input class="input variant-stock-number" data-v="stock" type="number" min="0" inputmode="numeric" value="${n}" aria-label="Cantidad en stock"><button type="button" class="variant-stock-btn" data-stock-step="1" aria-label="Sumar una unidad">+</button></div>`;
  }
  function variantRow(v={id:null,color:'',size:'',stock:0,sku:''},mode='sized'){
    const sized=mode==='sized';
    return `<div class="variant-row ${sized?'variant-row-sized':'variant-row-simple'}"><input type="hidden" data-v="id" value="${v.id||''}"><input class="input" data-v="color" placeholder="${sized?'Color':'Color (opcional)'}" value="${escapeHtml(v.color||'')}">${sized?`<input class="input variant-size-input" data-v="size" placeholder="Talle" value="${escapeHtml(v.size||'')}">`:`<input type="hidden" data-v="size" value="">`}${stockStepper(v.stock)}<button type="button" class="btn btn-danger remove-variant" aria-label="Quitar variante">×</button><input type="hidden" data-v="sku" value="${escapeHtml(v.sku||'')}"></div>`;
  }
  function renderVariantBuilder(mode,items=[]){
    const builder=qs('#variantBuilder');if(!builder)return;
    const rows=(items&&items.length)?items:defaultVariantsForMode(mode);
    builder.dataset.mode=mode||'';
    builder.innerHTML=mode?rows.map(v=>variantRow(v,mode)).join(''):'<div class="variant-empty-note">Elegí una categoría para configurar el stock.</div>';
  }
  function syncProductCategoryForm(options={}){
    const form=qs('#productForm');if(!form)return;
    const categoryId=form.elements.category_id?.value||'';
    const mode=productCategoryMode(categoryId);
    const builder=qs('#variantBuilder');
    const previousMode=builder?.dataset.mode||'';
    const current=collectVariantRows();
    const next=(mode&&mode!==previousMode)?convertVariantsForMode(current,previousMode,mode):(current.length?current:defaultVariantsForMode(mode));
    renderVariantBuilder(mode,next);
    qs('#productFitField')?.classList.toggle('hidden',mode!=='sized');
    qs('#productAudienceField')?.classList.toggle('hidden',mode!=='sized');
    const title=qs('#variantSectionTitle');if(title)title.textContent=mode==='sized'?'Talles y stock':mode==='simple'?'Opciones y stock':'Variantes y stock';
    const help=qs('#variantSectionHelp');if(help)help.textContent=mode==='sized'?'Indicá el stock real de cada talle. Usá − y + para ajustar rápido cada cantidad.':mode==='simple'?'Este producto no usa talle. Podés cargar un stock general o separar por color.':'Elegí una categoría para configurar el stock.';
    const add=qs('#addVariantBtn');if(add){add.classList.toggle('hidden',!mode);add.textContent=mode==='sized'?'+ Agregar talle / variante':'+ Agregar color / variante';}
    const ready=qs('#productBaseReadyLabel');if(ready)ready.textContent=mode==='sized'?'Prenda disponible':'Producto base disponible';
  }

  async function openProductDialog(id=null, duplicate=false){
    await ensureCategories();
    ensureMediaAdminStyles();
    state.newFiles=[];state.mediaItems=[];state.mediaDragKey=null;
    if(id){
      const d=await api(`/api/admin/products/${id}`);
      state.editingProduct=duplicate?{...d.item,id:null,name:`${d.item.name} copia`,slug:'',variants:(d.item.variants||[]).map(v=>({...v,id:null})),images:[]}:d.item;
    }else state.editingProduct=null;
    const isNewProduct=!state.editingProduct;const p=state.editingProduct||{status:'draft',price_cents:null,compare_at_cents:null,cost_cents:null,weight_grams:0,height_cm:0,width_cm:0,depth_cm:0,is_featured:0,is_new:0,is_bestseller:0,fit:'',audience:'',sale_mode:'stock',inventory_stage:'finished',garment_ready:1,print_ready:1,variants:[],images:[]};
    const initialVariantMode=productCategoryMode(p.category_id);
    const initialVariants=(p.variants||[]).length?(p.variants||[]):defaultVariantsForMode(initialVariantMode);
    state.mediaItems=(p.images||[]).map(im=>({key:`existing-${im.id}`,id:Number(im.id),existing:true,url:im.url,name:(im.r2_key||'').split('/').pop()||`Archivo ${im.id}`,mediaType:im.media_type||mediaTypeFromName(im.r2_key||im.url)}));
    qs('#productDialogTitle').textContent=p.id?'Editar producto':'Nuevo producto';
    const saveBtn=qs('#saveProductBtn');if(saveBtn)saveBtn.disabled=false;
    qs('#productFormBody').innerHTML=`
      <section class="form-section"><h3>Fotos y videos</h3><p class="salmos-media-help">Cargalos primero y acomodalos en el orden exacto en que querés que se vean. Podés arrastrar cada archivo o usar ↑ y ↓. Las fotos se muestran completas, sin recortes. Videos cortos: MP4/WebM/MOV, hasta 30 MB.</p><input class="input" id="productImagesInput" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v" multiple><div class="salmos-media-list" id="mediaOrderList"></div></section>
      <section class="form-section"><h3>Información</h3><div class="form-grid">
        <div class="field full"><label>Nombre</label><input class="input" name="name" required value="${escapeHtml(p.name||'')}"></div>
        <div class="field"><label>Categoría</label><select class="select" name="category_id" required><option value="">Elegir...</option>${state.categories.map(c=>`<option value="${c.id}" ${Number(p.category_id)===Number(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Estado de la publicación</label><select class="select" name="status"><option value="draft" ${p.status==='draft'?'selected':''}>Borrador</option><option value="published" ${p.status==='published'?'selected':''}>Publicado</option><option value="hidden" ${p.status==='hidden'?'selected':''}>Oculto</option></select></div>
        <div class="field ${initialVariantMode==='sized'?'':'hidden'}" id="productFitField"><label>Corte / fit</label><input class="input" name="fit" list="salmosFitOptions" placeholder="Elegí o escribí otro" value="${escapeHtml(p.fit||'')}"><datalist id="salmosFitOptions"><option value="Clásico"><option value="Oversize"><option value="Boxy fit"></datalist></div>
        <div class="field ${initialVariantMode==='sized'?'':'hidden'}" id="productAudienceField"><label>Hombre / Mujer / Unisex</label><input class="input" name="audience" list="salmosAudienceOptions" placeholder="Elegí o escribí otro" value="${escapeHtml(p.audience||'')}"><datalist id="salmosAudienceOptions"><option value="Hombre"><option value="Mujer"><option value="Unisex"></datalist></div>
        <div class="field"><label>Estado del producto</label><select class="select" name="inventory_stage" id="inventoryStage"><option value="finished" ${p.inventory_stage==='finished'||!p.inventory_stage?'selected':''}>Terminado</option><option value="to_print" ${p.inventory_stage==='to_print'?'selected':''}>En producción</option><option value="outlet" ${p.inventory_stage==='outlet'?'selected':''}>Outlet</option></select></div>
        <div class="field full internal-prep-box ${p.inventory_stage==='to_print'?'':'hidden'}" id="internalPrepBox"><div class="internal-prep-title">Solo administración · control de producción</div><div class="toggle-row"><label class="toggle-label"><input type="checkbox" name="garment_ready" ${Number(p.garment_ready)!==0?'checked':''}><span id="productBaseReadyLabel">${initialVariantMode==='sized'?'Prenda disponible':'Producto base disponible'}</span></label><label class="toggle-label"><input type="checkbox" name="print_ready" ${Number(p.print_ready)!==0?'checked':''}> Estampa disponible</label></div><small class="field-help">En producción podés indicar si ya está disponible el producto base y la estampa.</small></div>
        <div class="field"><label>Precio</label><input class="input" name="price" type="number" min="0" value="${isNewProduct?'':centsToPesos(p.price_cents)}"></div>
        <div class="field"><label>Precio anterior</label><input class="input" name="compare" type="number" min="0" value="${centsToPesos(p.compare_at_cents)}"></div>
        <div class="field"><label>Costo del producto</label><input class="input" name="cost" type="number" min="0" value="${centsToPesos(p.cost_cents)}"></div>
        <div class="field full"><label>Descripción corta</label><textarea class="textarea" name="short_description">${escapeHtml(p.short_description||'')}</textarea></div>
        <div class="field full"><label>Significado del diseño</label><textarea class="textarea" name="meaning_text">${escapeHtml(p.meaning_text||'')}</textarea></div>
        <div class="field full"><label>Versículo (opcional)</label><textarea class="textarea" name="verse_text" style="min-height:82px">${escapeHtml(p.verse_text||'')}</textarea></div>
        <div class="field full"><label>Cita / referencia del versículo</label><input class="input" name="verse_reference" placeholder="Ej.: Marcos 14:36" value="${escapeHtml(p.verse_reference||'')}"></div>
      </div><div class="toggle-row" style="margin-top:14px"><label class="toggle-label"><input type="checkbox" name="is_new" ${p.is_new?'checked':''}> Novedad</label><label class="toggle-label"><input type="checkbox" name="is_featured" ${p.is_featured?'checked':''}> Destacado</label><label class="toggle-label"><input type="checkbox" name="is_bestseller" ${p.is_bestseller?'checked':''}> Más vendido</label></div></section>
      <section class="form-section"><div class="admin-section-head"><h3 id="variantSectionTitle">${initialVariantMode==='sized'?'Talles y stock':initialVariantMode==='simple'?'Opciones y stock':'Variantes y stock'}</h3><button type="button" class="btn btn-ghost ${initialVariantMode?'':'hidden'}" id="addVariantBtn">${initialVariantMode==='sized'?'+ Agregar talle / variante':'+ Agregar color / variante'}</button></div><p class="field-help variant-section-help" id="variantSectionHelp">${initialVariantMode==='sized'?'Indicá el stock real de cada talle. Usá − y + para ajustar rápido cada cantidad.':initialVariantMode==='simple'?'Este producto no usa talle. Podés cargar un stock general o separar por color.':'Elegí una categoría para configurar el stock.'}</p><div class="variant-builder" id="variantBuilder" data-mode="${initialVariantMode}">${initialVariantMode?initialVariants.map(v=>variantRow(v,initialVariantMode)).join(''):'<div class="variant-empty-note">Elegí una categoría para configurar el stock.</div>'}</div></section>
      <section class="form-section"><h3>Datos para envío</h3><p class="field-help">Cargá el peso y las medidas reales de este producto. Correo Argentino arma el paquete final según las unidades que compre el cliente; no se usa un paquete fijo para todos.</p><div class="form-grid"><div class="field"><label>Peso (g)</label><input class="input" name="weight_grams" type="number" min="0" value="${p.weight_grams||0}"></div><div class="field"><label>Alto (cm)</label><input class="input" name="height_cm" type="number" min="0" step=".1" value="${p.height_cm||0}"></div><div class="field"><label>Ancho (cm)</label><input class="input" name="width_cm" type="number" min="0" step=".1" value="${p.width_cm||0}"></div><div class="field"><label>Largo (cm)</label><input class="input" name="depth_cm" type="number" min="0" step=".1" value="${p.depth_cm||0}"></div></div></section>`;
    renderMediaManager();
    qs('#productDialog').showModal();
  }
  async function saveProduct(){
    const form=qs('#productForm');const fd=new FormData(form);
    if(!fd.get('name')?.trim()||!fd.get('category_id')) throw new Error('Completá nombre y categoría.');
    const variantMode=productCategoryMode(fd.get('category_id'));
    let variants=collectVariantRows().map(v=>({...v,size:variantMode==='sized'?v.size:''})).filter(v=>v.id||v.color||v.size||v.stock>0);
    if(variantMode==='sized'&&variants.some(v=>!v.size))throw new Error('Completá el talle de cada variante de remera.');
    if(!variants.length)variants=defaultVariantsForMode(variantMode);
    const payload={name:fd.get('name').trim(),category_id:Number(fd.get('category_id')),status:fd.get('status'),price_cents:pesosToCents(fd.get('price')),compare_at_cents:pesosToCents(fd.get('compare')),cost_cents:pesosToCents(fd.get('cost')),short_description:fd.get('short_description')||'',meaning_text:fd.get('meaning_text')||'',verse_text:fd.get('verse_text')||'',verse_reference:fd.get('verse_reference')||'',fit:variantMode==='sized'?(fd.get('fit')||''):'',audience:variantMode==='sized'?(fd.get('audience')||''):'',sale_mode:'stock',inventory_stage:fd.get('inventory_stage')||'finished',garment_ready:fd.get('garment_ready')?1:0,print_ready:fd.get('print_ready')?1:0,is_new:fd.get('is_new')?1:0,is_featured:fd.get('is_featured')?1:0,is_bestseller:fd.get('is_bestseller')?1:0,weight_grams:Number(fd.get('weight_grams'))||0,height_cm:Number(fd.get('height_cm'))||0,width_cm:Number(fd.get('width_cm'))||0,depth_cm:Number(fd.get('depth_cm'))||0,variants};
    const id=state.editingProduct?.id;const d=await api(id?`/api/admin/products/${id}`:'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)});const productId=d.item.id;
    const orderedIds=[];
    for(const item of state.mediaItems){
      if(item.existing&&item.id){orderedIds.push(Number(item.id));continue}
      if(!item.file)continue;
      const f=new FormData();f.append('file',item.file);
      const uploaded=await api(`/api/admin/products/${productId}/media`,{method:'POST',body:f});
      item.existing=true;item.id=Number(uploaded.id);item.url=uploaded.url||item.url;item.mediaType=uploaded.media_type||item.mediaType;orderedIds.push(item.id);
    }
    if(orderedIds.length)await api(`/api/admin/products/${productId}/media-order`,{method:'PATCH',body:JSON.stringify({ids:orderedIds})});
    state.newFiles=[];
    qs('#productDialog').close();toast('Producto guardado','success');await renderProducts();
  }

  async function renderCategories(){
    const d=await api('/api/admin/categories');state.categories=d.items||[];
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div><h2 style="margin:0">Categorías</h2><p class="muted" style="margin:4px 0 0">Solo las categorías activas pueden aparecer en la tienda. Mientras solo esté activa Remeras, la barra pública de categorías queda oculta.</p></div><button class="btn btn-primary" id="newCategoryBtn">+ Nueva categoría</button></div>
      <div class="admin-card admin-table-wrap"><table class="admin-table editable-category-table"><thead><tr><th>Nombre</th><th>Slug</th><th>Orden</th><th>Activa</th><th></th></tr></thead><tbody>${state.categories.map(c=>`<tr data-category-row="${c.id}"><td><input class="input" data-category-name value="${escapeHtml(c.name)}"></td><td>${escapeHtml(c.slug)}</td><td><input class="input small-number" data-category-sort type="number" value="${Number(c.sort_order)||0}"></td><td><label class="toggle-label"><input type="checkbox" data-category-active ${Number(c.active)?'checked':''}> Sí</label></td><td><button class="btn btn-ghost" data-save-category="${c.id}">Guardar</button></td></tr>`).join('')}</tbody></table></div>`;
  }

  function stockUnique(field){return [...new Set(state.stockItems.map(x=>String(x[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true,sensitivity:'base'}))}
  function stockSizeRank(v=''){const s=String(v).toUpperCase().replace(/\s+/g,'');const order=['XXXS','XXS','XS','S','M','L','XL','XXL','2XL','XXXL','3XL','4XL','5XL'];const i=order.indexOf(s);return i<0?999:i}
  function stockFilteredItems(){
    const f=state.stockFilters||{};let items=state.stockItems.filter(x=>(!f.category||String(x.category_name||'')===f.category)&&(!f.stage||String(x.inventory_stage||'finished')===f.stage)&&(!f.size||String(x.size||'')===f.size)&&(!f.color||String(x.color||'')===f.color)&&(!f.fit||String(x.fit||'')===f.fit)&&(!f.audience||String(x.audience||'')===f.audience));
    const cmpText=(a,b)=>String(a||'').localeCompare(String(b||''),'es',{numeric:true,sensitivity:'base'});
    items=[...items].sort((a,b)=>{
      if(f.sort==='size'){const r=stockSizeRank(a.size)-stockSizeRank(b.size);return r||cmpText(a.size,b.size)||cmpText(a.product_name,b.product_name)}
      if(f.sort==='color')return cmpText(a.color,b.color)||cmpText(a.product_name,b.product_name);
      if(f.sort==='fit')return cmpText(a.fit,b.fit)||cmpText(a.product_name,b.product_name);
      if(f.sort==='audience')return cmpText(a.audience,b.audience)||cmpText(a.product_name,b.product_name);
      if(f.sort==='stock_desc')return (Number(b.stock)||0)-(Number(a.stock)||0)||cmpText(a.product_name,b.product_name);
      if(f.sort==='stock_asc')return (Number(a.stock)||0)-(Number(b.stock)||0)||cmpText(a.product_name,b.product_name);
      return cmpText(a.product_name,b.product_name)||stockSizeRank(a.size)-stockSizeRank(b.size);
    });
    return items;
  }
  function stockPrepLabel(x){if(x.inventory_stage==='outlet')return '<span class="status warning">Outlet</span>';if(x.inventory_stage!=='to_print')return '<span class="status success">Terminado</span>';const missing=[];if(!Number(x.garment_ready))missing.push('falta producto base');if(!Number(x.print_ready))missing.push('falta estampa');return `<span class="status warning">En producción</span>${missing.length?`<small class="internal-stock-note">${escapeHtml(missing.join(' · '))}</small>`:'<small class="internal-stock-note">todo disponible</small>'}`}
  function stockRowsHtml(items){return items.length?items.map(x=>`<tr data-stock-row="${x.id}"><td><strong>${escapeHtml(x.product_name)}</strong></td><td>${escapeHtml(x.color||'—')}</td><td>${escapeHtml(x.size||'—')}</td><td>${escapeHtml(x.fit||'—')}</td><td>${escapeHtml(x.audience||'—')}</td><td>${stockPrepLabel(x)}</td><td><input class="input small-number" data-stock-value type="number" min="0" value="${Number(x.stock)||0}"></td><td><span class="status ${Number(x.available_stock)<=0?'warning':'success'}">${Number(x.available_stock)||0}</span></td><td><button class="btn btn-ghost" data-save-stock="${x.id}">Guardar</button></td></tr>`).join(''):'<tr><td colspan="9">No hay stock que coincida con esos filtros.</td></tr>'}
  function groupedStockHtml(items){if(!items.length)return '<div class="admin-card"><div class="empty-state"><strong>No hay stock que coincida con esos filtros.</strong></div></div>';const groups=new Map();for(const x of items){const cat=x.category_name||'Sin categoría',stage=x.inventory_stage||'finished',key=`${cat}|||${stage}`;if(!groups.has(key))groups.set(key,{cat,stage,items:[]});groups.get(key).items.push(x)}return [...groups.values()].map(g=>`<section class="inventory-group"><div class="inventory-group-head"><h3>${escapeHtml(g.cat)}</h3><span>${stageTitle(g.stage)} · ${g.items.length}</span></div><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th>Color</th><th>Talle</th><th>Corte</th><th>Género</th><th>Estado del producto</th><th>Stock físico</th><th>Disponible</th><th></th></tr></thead><tbody>${stockRowsHtml(g.items)}</tbody></table></div></section>`).join('')}
  function renderStockFiltered(){const items=stockFilteredItems();const host=qs('#stockGroupedHost');if(host)host.innerHTML=groupedStockHtml(items);const count=qs('#stockFilteredCount');if(count)count.textContent=`${items.length} variante${items.length===1?'':'s'}`}
  async function renderStock(){
    const d=await api('/api/admin/stock');state.stockItems=(d.items||[]).filter(x=>Number(x.stock)>0);
    const sizeTotals={};for(const x of state.stockItems){const size=String(x.size||'').trim();if(size)sizeTotals[size]=(sizeTotals[size]||0)+(Number(x.stock)||0)}
    const total=state.stockItems.reduce((sum,x)=>sum+(Number(x.stock)||0),0);
    const sizes=Object.keys(sizeTotals).sort((a,b)=>stockSizeRank(a)-stockSizeRank(b)||a.localeCompare(b,'es',{numeric:true}));
    const f=state.stockFilters;
    const options=(values,current)=>`<option value="">Todos</option>${values.map(v=>`<option value="${escapeHtml(v)}" ${current===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}`;
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div><h2 style="margin:0">Stock físico</h2><p class="muted" style="margin:4px 0 0">Las variantes con stock físico 0 no se muestran. Podés corregir el stock directamente acá.</p></div></div>
      <div class="stock-size-summary" aria-label="Recuento por talle"><div class="stock-count-chip total"><span>Total</span><strong>${total}</strong></div>${sizes.map(size=>`<div class="stock-count-chip"><span>${escapeHtml(size)}</span><strong>${sizeTotals[size]}</strong></div>`).join('')}</div>
      <div class="admin-card stock-filter-card"><div class="stock-filter-grid stock-filter-grid-wide">
        <label>Categoría<select class="select" id="stockFilterCategory">${options(stockUnique('category_name'),f.category)}</select></label>
        <label>Estado<select class="select" id="stockFilterStage"><option value="">Todos</option><option value="finished" ${f.stage==='finished'?'selected':''}>Terminado</option><option value="to_print" ${f.stage==='to_print'?'selected':''}>En producción</option><option value="outlet" ${f.stage==='outlet'?'selected':''}>Outlet</option></select></label>
        <label>Talle<select class="select" id="stockFilterSize">${options(stockUnique('size'),f.size)}</select></label>
        <label>Color<select class="select" id="stockFilterColor">${options(stockUnique('color'),f.color)}</select></label>
        <label>Corte<select class="select" id="stockFilterFit">${options(stockUnique('fit'),f.fit)}</select></label>
        <label>Género<select class="select" id="stockFilterAudience">${options(stockUnique('audience'),f.audience)}</select></label>
        <label>Ordenar<select class="select" id="stockSort"><option value="product" ${f.sort==='product'?'selected':''}>Producto</option><option value="size" ${f.sort==='size'?'selected':''}>Talle</option><option value="color" ${f.sort==='color'?'selected':''}>Color</option><option value="fit" ${f.sort==='fit'?'selected':''}>Corte</option><option value="audience" ${f.sort==='audience'?'selected':''}>Género</option><option value="stock_desc" ${f.sort==='stock_desc'?'selected':''}>Mayor stock</option><option value="stock_asc" ${f.sort==='stock_asc'?'selected':''}>Menor stock</option></select></label>
      </div><div class="stock-filter-footer"><span class="muted" id="stockFilteredCount"></span><button class="btn btn-ghost" id="clearStockFiltersBtn" type="button">Limpiar filtros</button></div></div>
      <div id="stockGroupedHost"></div>`;
    renderStockFiltered();
  }

  function ordersTable(items){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th></tr></thead><tbody>${items.length?items.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td><span class="status">${escapeHtml(o.fulfillment_status)}</span></td><td>${new Date(o.created_at).toLocaleString('es-AR')}</td></tr>`).join(''):`<tr><td colspan="6">Sin órdenes.</td></tr>`}</tbody></table></div>`}

  function correoOrderActions(o){
    if(o.shipping_method!=='correo')return '—';const tracking=String(o.correo_tracking_number||o.tracking_number||'');const status=String(o.correo_last_status||'');
    return `<div class="correo-order-admin"><div>${tracking?`<strong>${escapeHtml(tracking)}</strong>${status?`<small>${escapeHtml(status)}</small>`:''}`:'<span class="muted">Sin preimposición</span>'}</div><div class="admin-actions correo-actions">${!tracking?`<button class="btn btn-primary" data-correo-create="${o.id}">Crear envío</button>`:`<button class="btn btn-ghost" data-correo-label="${o.id}">Rótulo 10×15</button><button class="btn btn-ghost" data-correo-track="${o.id}">Seguimiento</button><button class="btn btn-danger" data-correo-cancel="${o.id}">Cancelar CA</button>`}</div></div>`;
  }
  async function renderOrders(){
    const d=await api('/api/admin/orders');state.orders=d.items||[];
    qs('#adminContent').innerHTML=`<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th><th>Estado</th><th>Correo Argentino</th><th></th></tr></thead><tbody>${state.orders.length?state.orders.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td>${escapeHtml(o.shipping_method||'')}</td><td>${new Date(o.created_at).toLocaleString('es-AR')}</td><td><select class="select order-status-select" data-order-id="${o.id}" style="min-width:145px"><option value="new" ${o.fulfillment_status==='new'?'selected':''}>Nuevo</option><option value="preparing" ${o.fulfillment_status==='preparing'?'selected':''}>Preparando</option><option value="ready" ${o.fulfillment_status==='ready'?'selected':''}>Listo</option><option value="on_the_way" ${o.fulfillment_status==='on_the_way'?'selected':''}>En camino</option><option value="delivered" ${o.fulfillment_status==='delivered'?'selected':''}>Entregado</option><option value="cancelled" ${o.fulfillment_status==='cancelled'?'selected':''}>Cancelado</option></select></td><td>${correoOrderActions(o)}</td><td>${o.fulfillment_status==='cancelled'&&o.payment_status!=='paid'?`<button class="btn btn-danger" data-delete-order="${o.id}">Borrar prueba</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="9">Sin órdenes.</td></tr>'}</tbody></table></div><div class="admin-section"><div class="notice"><strong>Correo Argentino:</strong> el botón “Crear envío” genera la preimposición y guarda el Tracking Number. En TEST podés usarlo para validar el flujo. El rótulo se descarga en PDF 10×15.</div><div class="notice">Las órdenes canceladas de prueba que no estén pagadas se pueden borrar. Una orden pagada no se elimina desde acá.</div></div>`;
  }

  function couponBenefitText(c){
    if(c.applies_to==='shipping'&&c.discount_type==='free')return 'Envío gratis';
    if(c.discount_type==='percent')return `${Number(c.value)||0}% en ${c.applies_to==='shipping'?'envío':'prendas'}`;
    return `${money(Number(c.value)||0)} en ${c.applies_to==='shipping'?'envío':'prendas'}`;
  }
  function renderCouponEditor(c=null){
    state.editingCouponId=c?.id?Number(c.id):null;
    const title=qs('#couponEditorTitle');if(title)title.textContent=c?'Editar cupón':'Nuevo cupón';
    const value=c?.discount_type==='fixed'?((Number(c.value)||0)/100):(Number(c?.value)||0);
    const expires=c?.expires_at?String(c.expires_at).slice(0,10):'';
    const form=qs('#couponForm');if(!form)return;
    form.innerHTML=`
      <div class="form-grid">
        <div class="field"><label>Código</label><input class="input" name="code" required placeholder="SALMOS10" value="${escapeHtml(c?.code||'')}"></div>
        <div class="field"><label>Aplica a</label><select class="select" name="applies_to"><option value="products" ${c?.applies_to!=='shipping'?'selected':''}>Prendas / productos</option><option value="shipping" ${c?.applies_to==='shipping'?'selected':''}>Envío</option></select></div>
        <div class="field"><label>Tipo de descuento</label><select class="select" name="discount_type"><option value="percent" ${c?.discount_type==='percent'||!c?'selected':''}>Porcentaje (%)</option><option value="fixed" ${c?.discount_type==='fixed'?'selected':''}>Importe fijo ($)</option><option value="free" ${c?.discount_type==='free'?'selected':''}>Envío gratis</option></select></div>
        <div class="field"><label>Valor</label><input class="input" name="value" type="number" min="0" step="1" value="${escapeHtml(value||'')}"><small class="field-help">Ej.: 10 para 10% o 2000 para $2.000.</small></div>
        <div class="field"><label>Compra mínima (opcional)</label><input class="input" name="min_subtotal" type="number" min="0" step="1" value="${c?Math.round((Number(c.min_subtotal_cents)||0)/100):0}"></div>
        <div class="field"><label>Vence (opcional)</label><input class="input" name="expires" type="date" value="${escapeHtml(expires)}"></div>
        <div class="field full"><label class="toggle-label"><input type="checkbox" name="active" ${!c||Number(c.active)?'checked':''}> Cupón activo</label></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        ${c?'<button type="button" class="btn btn-ghost" id="cancelCouponEditBtn">Cancelar edición</button>':''}
        <button type="button" class="btn btn-primary" id="saveCouponBtn">${c?'Guardar cambios':'Crear cupón'}</button>
      </div>`;
  }
  async function renderCoupons(){
    const d=await api('/api/admin/coupons');state.coupons=d.items||[];
    qs('#adminContent').innerHTML=`
      <section class="settings-card">
        <h3>Crear varios cupones</h3>
        <div class="form-grid"><div class="field"><label>Cantidad</label><input class="input" id="batchCouponCount" type="number" min="1" max="100" value="5"></div><div class="field"><label>Prefijo</label><input class="input" id="batchCouponPrefix" value="SALMOS"></div><div class="field"><label>Aplica a</label><select class="select" id="batchCouponApplies"><option value="products">Productos</option><option value="shipping">Envío</option></select></div><div class="field"><label>Tipo</label><select class="select" id="batchCouponType"><option value="percent">Porcentaje</option><option value="fixed">Monto fijo</option><option value="free">Envío gratis</option></select></div><div class="field"><label>Valor</label><input class="input" id="batchCouponValue" type="number" min="0" value="10"></div><div class="field" style="align-self:end"><button class="btn btn-primary" type="button" id="createCouponBatchBtn">Generar cupones</button></div></div>
        <small class="field-help">Genera códigos únicos con el mismo descuento para que los clientes los carguen en el carrito.</small>
      </section>
      <section class="settings-card">
        <h3 id="couponEditorTitle">${state.editingCouponId?'Editar cupón':'Nuevo cupón'}</h3>
        <p style="margin:0 0 14px;color:var(--muted)">Podés crear códigos para redes: envío gratis, descuento en el envío o descuento en las prendas.</p>
        <form id="couponForm"></form>
      </section>
      <section class="admin-section">
        <div class="admin-section-head"><h2>Cupones creados</h2></div>
        <div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Código</th><th>Beneficio</th><th>Compra mínima</th><th>Vence</th><th>Estado</th><th></th></tr></thead><tbody>
        ${state.coupons.length?state.coupons.map(c=>`<tr><td><strong>${escapeHtml(c.code)}</strong></td><td>${escapeHtml(couponBenefitText(c))}</td><td>${Number(c.min_subtotal_cents)?money(c.min_subtotal_cents):'—'}</td><td>${c.expires_at?new Date(c.expires_at).toLocaleDateString('es-AR'):'Sin vencimiento'}</td><td><span class="status ${Number(c.active)?'success':'warning'}">${Number(c.active)?'Activo':'Pausado'}</span></td><td><div class="admin-actions"><button class="btn btn-ghost" data-edit-coupon="${c.id}">Editar</button><button class="btn btn-danger" data-delete-coupon="${c.id}">Eliminar</button></div></td></tr>`).join(''):`<tr><td colspan="6">Todavía no creaste cupones.</td></tr>`}
        </tbody></table></div>
      </section>`;
    const current=state.editingCouponId?state.coupons.find(x=>Number(x.id)===Number(state.editingCouponId)):null;
    renderCouponEditor(current||null);
  }
  async function saveCouponFromForm(){
    const form=qs('#couponForm');if(!form)return;
    const fd=new FormData(form);
    const appliesTo=fd.get('applies_to');
    const discountType=fd.get('discount_type');
    if(appliesTo==='products'&&discountType==='free')throw new Error('Envío gratis solo puede aplicarse al envío.');
    let value=Number(fd.get('value'))||0;
    if(discountType==='fixed')value=pesosToCents(value);
    if(discountType==='free')value=0;
    const expiresDate=String(fd.get('expires')||'').trim();
    const payload={
      code:String(fd.get('code')||'').trim(),
      appliesTo,
      discountType,
      value,
      minSubtotalCents:pesosToCents(fd.get('min_subtotal')),
      expiresAt:expiresDate?`${expiresDate}T23:59:59-03:00`:null,
      active:Boolean(fd.get('active'))
    };
    const id=state.editingCouponId;
    await api(id?`/api/admin/coupons/${id}`:'/api/admin/coupons',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
    state.editingCouponId=null;
    toast(id?'Cupón actualizado':'Cupón creado','success');
    await renderCoupons();
  }

  function investmentItemRow(item={},i=0){
    const type=escapeHtml(item.productType||'Remeras'),qty=Math.max(1,Number(item.quantity)||1),color=escapeHtml(item.color||''),variant=escapeHtml(item.variant||'');
    return `<div class="investment-item" data-investment-row="${i}"><div class="field"><label>Producto</label><input class="input" data-investment-field="productType" list="investmentProductTypes" value="${type}" placeholder="Remeras, Gorras, Tazas..."></div><div class="field investment-qty"><label>Cantidad</label><input class="input" data-investment-field="quantity" type="number" min="1" value="${qty}"></div><div class="field"><label>Color</label><input class="input" data-investment-field="color" value="${color}" placeholder="Opcional"></div><div class="field"><label>Talle / variante</label><input class="input" data-investment-field="variant" value="${variant}" placeholder="Ej.: L, 500 ml, único"></div><button type="button" class="icon-btn investment-remove" data-remove-investment="${i}" aria-label="Quitar">×</button></div>`;
  }
  function renderInvestmentItems(){const host=qs('#investmentItems');if(!host)return;host.innerHTML=state.investmentItems.map(investmentItemRow).join('')||'<div class="notice">Agregá al menos un producto.</div>';}
  function syncMovementType(){const form=qs('#movementForm');if(!form)return;const investment=form.elements.type.value==='investment';qs('#investmentItemsField')?.classList.toggle('hidden',!investment);const desc=form.elements.description;if(desc){desc.required=!investment;if(investment&&!desc.value)desc.value='Ingreso de mercadería a producción';}if(investment&&!state.investmentItems.length){state.investmentItems=[{productType:'Remeras',quantity:1,color:'',variant:''}];renderInvestmentItems();}}
  async function renderExpenses(){
    const r=reportRangeDates();const d=await api(`/api/admin/finance?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const s=d.summary||{};
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head expenses-head"><div>${reportFiltersHtml()}</div><button class="btn btn-primary" id="newMovementBtn">+ Ingreso / egreso</button></div>
      <div class="kpi-grid"><div class="kpi"><small>Egresos</small><strong>− ${money(s.expensesCents)}</strong></div><div class="kpi"><small>Otros ingresos</small><strong>${money(s.extraIncomeCents)}</strong></div><div class="kpi"><small>Ventas</small><strong>${money(s.productSalesCents)}</strong></div><div class="kpi"><small>Balance</small><strong>${money(s.balanceCents)}</strong></div></div>
      <section class="admin-section"><div class="admin-section-head"><h2>Movimientos cargados</h2></div><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Detalle</th><th>Origen</th><th>Destino</th><th>Importe</th><th>Adjuntos</th><th></th></tr></thead><tbody>${(d.movements||[]).length?(d.movements||[]).map(m=>`<tr><td>${new Date(m.occurred_at).toLocaleDateString('es-AR')}</td><td><span class="status ${m.type==='income'?'success':'warning'}">${m.type==='income'?'Ingreso':m.type==='investment'?'Inversión':'Egreso'}</span></td><td>${escapeHtml(m.category||'—')}</td><td>${escapeHtml(m.description||'')}</td><td>${escapeHtml(m.origin||'—')}</td><td>${escapeHtml(m.destination||'—')}</td><td class="${m.type==='expense'||m.type==='investment'?'money-negative':''}">${m.type==='expense'||m.type==='investment'?'− ':''}${money(m.amount_cents)}</td><td><div class="finance-attachments">${(m.attachments||[]).map(a=>`<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="Comprobante"></a>`).join('')||'—'}</div></td><td><div class="admin-actions"><button class="btn btn-ghost" data-edit-movement="${m.id}">Editar</button><button class="btn btn-danger" data-delete-movement="${m.id}">Eliminar</button></div></td></tr>`).join(''):'<tr><td colspan="9">Todavía no cargaste movimientos.</td></tr>'}</tbody></table></div></section>`;
  }


  function customOrderDesignSummary(o){
    let selected=[];try{selected=JSON.parse(o.selected_designs_json||'[]')}catch{}
    const selectedHtml=(Array.isArray(selected)&&selected.length)?`<div class="notice"><b>Diseños SALMOS elegidos:</b><br>${selected.map(d=>escapeHtml(d.name||`#${d.id}`)).join(' · ')}</div>`:'';
    if(o.kind!=='dtf')return selectedHtml;
    let designs=[];try{designs=JSON.parse(o.designs_json||'[]')}catch{}
    const list=(Array.isArray(designs)?designs:[]).map(d=>`${escapeHtml(d.label||'Diseño')}: ${Number(d.widthCm)||30}×${Number(d.heightCm)||30} cm × ${Number(d.quantity)||1}`).join('<br>');
    const mode=o.design_mode==='different'?'Diseños diferentes':o.design_mode==='same_sizes'?'Mismo diseño · diferentes medidas':'Mismo diseño';
    const sheets=o.subtype==='sheet'?`<br><b>Metros/planchas:</b> solicitados ${Number(o.requested_sheets)||0} · estimados ${Number(o.estimated_sheets)||Number(o.sheets)||0}`:'';
    return `${selectedHtml}<div class="notice"><b>${mode}</b>${list?`<br>${list}`:''}${sheets}${o.subtype==='sheet'?'<br><small>El metraje final queda sujeto al acomodo real de los diseños.</small>':''}</div>`;
  }

  async function renderCustomOrders(){
    const d=await api('/api/admin/custom-orders');state.customOrders=d.items||[];
    const statusLabel={new:'Nuevo',quoted:'Cotizado',deposit_pending:'Esperando seña',confirmed:'Confirmado',preparing:'Preparando',ready:'Listo',delivered:'Entregado',cancelled:'Cancelado'};
    qs('#adminContent').innerHTML=`<div class="admin-section-head"><div><h2>Pedidos</h2><small class="muted">Por encargo y personalizados · archivos en calidad original.</small></div></div>
      <div class="custom-orders-admin">${state.customOrders.length?state.customOrders.map(o=>`<article class="settings-card custom-admin-card" data-custom-order="${o.id}">
        <div class="admin-section-head"><div><strong>${escapeHtml(o.code)}</strong><div class="muted">${escapeHtml(o.customer_name)} · ${escapeHtml(o.customer_phone)}</div></div><span class="status warning">${escapeHtml(statusLabel[o.status]||o.status)}</span></div>
        <div class="custom-admin-grid"><div><b>Tipo</b><br>${o.kind==='dtf'?'DTF':'Ropa'} · ${escapeHtml(o.subtype||'')}</div><div><b>Diseño</b><br>${escapeHtml(o.design_source||'—')}</div><div><b>Modo archivo</b><br>${escapeHtml(o.file_mode||'—')}</div><div><b>Cantidad</b><br>${Number(o.quantity)||1}</div><div><b>Total cotizado</b><br>${Number(o.quoted_total_cents)?money(o.quoted_total_cents):'Pendiente'}</div><div><b>Seña 50%</b><br>${Number(o.deposit_cents)?money(o.deposit_cents):'Pendiente'}</div></div>
        ${customOrderDesignSummary(o)}
        ${o.notes?`<div class="notice">${escapeHtml(o.notes)}</div>`:''}
        <div class="admin-actions">${(o.files||[]).map(f=>`<a class="btn btn-ghost" href="${apiUrl(`/api/admin/custom-orders/${o.id}/files/${f.id}`)}" target="_blank" rel="noopener">Descargar ${escapeHtml(f.file_name)}</a>`).join('')||'<span class="muted">Sin archivos</span>'}</div>
        <div class="form-grid" style="margin-top:12px"><div class="field"><label>Total acordado ($)</label><input class="input" data-custom-total type="number" min="0" value="${Math.round((Number(o.quoted_total_cents)||0)/100)}"></div><div class="field"><label>Estado</label><select class="select" data-custom-status>${Object.entries(statusLabel).map(([v,l])=>`<option value="${v}" ${o.status===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field" style="align-self:end"><button class="btn btn-primary" data-save-custom="${o.id}">Guardar</button></div></div>
      </article>`).join(''):'<div class="empty-state"><strong>Todavía no hay pedidos.</strong></div>'}</div>`;
  }
  function flyerGalleryCard(f){
    const mime=String(f.mime_type||'');
    const media=mime.startsWith('image/')?`<img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.title||'Flyer')}" loading="lazy">`:mime.startsWith('video/')?`<video src="${escapeHtml(f.url)}" muted playsinline preload="metadata"></video>`:`<div class="flyer-file-icon">PDF</div>`;
    return `<button type="button" class="flyer-gallery-card" data-open-flyer="${f.id}" title="${escapeHtml(f.title||f.file_name||'Flyer')}"><div class="flyer-gallery-media">${media}</div>${Number(f.public)?'<span class="flyer-public-dot" title="Público"></span>':''}</button>`;
  }
  async function renderFlyers(){
    const d=await api('/api/admin/flyers');state.flyers=d.items||[];
    qs('#adminContent').innerHTML=`<div class="admin-section-head"><div><h2 style="margin:0">Flyers</h2><p class="muted" style="margin:4px 0 0">Tocá un flyer para ver sus detalles o editarlo.</p></div><button class="btn btn-primary" type="button" id="openFlyerUploadBtn">+ Subir flyer</button></div><section class="admin-section"><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="flyerAdminGallery" data-scroll-dir="-1" aria-label="Anterior">‹</button><div class="flyer-gallery-horizontal" id="flyerAdminGallery">${state.flyers.length?state.flyers.map(flyerGalleryCard).join(''):'<div class="empty-state"><strong>Sin flyers todavía.</strong></div>'}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="flyerAdminGallery" data-scroll-dir="1" aria-label="Siguiente">›</button></div></section>`;
  }
  function openFlyerDetail(id){
    const f=state.flyers.find(x=>Number(x.id)===Number(id));if(!f)return;state.activeFlyerId=Number(f.id);
    const mime=String(f.mime_type||''),stage=qs('#flyerDetailPreview');
    stage.innerHTML=mime.startsWith('image/')?`<img src="${escapeHtml(f.url)}" alt="">`:mime.startsWith('video/')?`<video src="${escapeHtml(f.url)}" controls playsinline></video>`:`<a class="btn btn-ghost" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">Abrir PDF</a>`;
    qs('#flyerDetailHeading').textContent=f.title||f.file_name||'Flyer';qs('#flyerDetailTitle').value=f.title||'';qs('#flyerDetailSort').value=Number(f.sort_order)||0;qs('#flyerDetailPublic').checked=Boolean(Number(f.public));qs('#flyerDetailDialog')?.showModal();
  }

  const DESIGN_USES=['Remeras','Tazas','Gorras','Chombas','Buzos','Vasos / termos','Bolsos','Otros'];
  function designKindLabel(a){return a.kind==='sheet'?'Plancha':'Individual'}
  function designScopeLabel(a){return a.scope==='clients'?'Clientes':a.scope==='salmos'?'SALMOS':'Planchas mixtas'}
  function parseDesignUses(a){try{return Array.isArray(a.uses)?a.uses:JSON.parse(a.uses_json||'[]')}catch{return []}}
  function designCard(a){const preview=`/api/admin/design-assets/${a.id}/file`;return `<article class="design-gallery-card" data-design-card="${a.id}">${a.kind==='sheet'?`<label class="design-sheet-check" title="Seleccionar plancha"><input type="checkbox" data-design-sheet="${a.id}"><span>✓</span></label>`:''}<button type="button" class="design-gallery-thumb checkerboard" data-preview-design="${a.id}" title="${escapeHtml(a.name||a.file_name)}">${String(a.mime_type||'').startsWith('image/')?`<img src="${preview}" alt="${escapeHtml(a.name||a.file_name)}" loading="lazy">`:`<div class="design-file-placeholder">${escapeHtml((a.file_name||'ARCHIVO').split('.').pop().toUpperCase())}</div>`}</button></article>`}
  function designSection(title,items){const gid=`designGallery${Math.random().toString(36).slice(2,8)}`;return `<section class="design-library-section"><div class="admin-section-head"><h3>${title}</h3><span class="muted">${items.length} archivo${items.length===1?'':'s'}</span></div><div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="${gid}" data-scroll-dir="-1" aria-label="Anterior">‹</button><div class="design-grid" id="${gid}">${items.length?items.map(designCard).join(''):'<div class="empty-state"><strong>Sin diseños en esta sección.</strong></div>'}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="${gid}" data-scroll-dir="1" aria-label="Siguiente">›</button></div></section>`}
  async function renderDesigns(){const d=await api('/api/admin/design-assets');state.designAssets=d.items||[];const clients=state.designAssets.filter(x=>x.scope==='clients'),salmos=state.designAssets.filter(x=>x.scope==='salmos'),mixed=state.designAssets.filter(x=>x.scope==='mixed');qs('#adminContent').innerHTML=`
    <div class="admin-section-head"><div><h2 style="margin:0">Biblioteca de diseños</h2><p class="muted" style="margin:4px 0 0">Los archivos se guardan originales, sin recomprimir ni quitar transparencias.</p></div><div class="admin-actions"><button class="btn btn-primary" type="button" id="openDesignUploadBtn">+ Subir diseño</button><button class="btn btn-ghost" type="button" id="openDesignEmailBtn">Enviar planchas por mail</button></div></div>
    ${designSection('Clientes · Individuales',clients.filter(x=>x.kind==='individual'))}${designSection('Clientes · Planchas',clients.filter(x=>x.kind==='sheet'))}${designSection('SALMOS · Individuales',salmos.filter(x=>x.kind==='individual'))}${designSection('SALMOS · Planchas',salmos.filter(x=>x.kind==='sheet'))}${designSection('Planchas mixtas',mixed)} `;}

  function designDialogPayload(){const root=qs('#designDetailEditor');return {name:qs('[data-design-name]',root)?.value||'',note:qs('[data-design-note]',root)?.value||'',widthCm:Number(qs('[data-design-width]',root)?.value)||0,heightCm:Number(qs('[data-design-height]',root)?.value)||0,printed:Boolean(qs('[data-design-printed]',root)?.checked),uses:qsa('[data-design-use]:checked',root).map(x=>x.value)}}
  function openDesignPreview(id){
    const a=state.designAssets.find(x=>Number(x.id)===Number(id));if(!a)return;state.activeDesignId=Number(a.id);const uses=parseDesignUses(a),stage=qs('#designPreviewStage'),url=`/api/admin/design-assets/${a.id}/file`;qs('#designPreviewTitle').textContent=a.name||a.file_name;
    stage.innerHTML=String(a.mime_type||'').startsWith('image/')?`<div class="zoomable-design checkerboard fit" data-toggle-design-zoom><img src="${url}" alt=""></div>`:`<iframe src="${url}" title="Vista previa"></iframe>`;
    qs('#designPreviewMeta').innerHTML=`<div class="design-detail-summary"><div><strong>${escapeHtml(designScopeLabel(a))} · ${escapeHtml(designKindLabel(a))}</strong><small>${escapeHtml(a.file_name||'')} · ${Math.max(1,Math.round((Number(a.size_bytes)||0)/1024/1024*10)/10)} MB</small>${Number(a.width_cm)||Number(a.height_cm)?`<small>${Number(a.width_cm)||'—'} × ${Number(a.height_cm)||'—'} cm</small>`:''}${a.note?`<p>${escapeHtml(a.note)}</p>`:''}${uses.length?`<small><b>Uso:</b> ${uses.map(escapeHtml).join(' · ')}</small>`:''}${Number(a.printed)?'<span class="status success">Impreso</span>':''}</div><div class="admin-actions"><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">Abrir original</a><button class="btn btn-primary" type="button" id="editDesignDetailBtn">Editar</button></div></div><div class="design-detail-editor hidden" id="designDetailEditor"><div class="form-grid design-edit-grid"><div class="field"><label>Nombre</label><input class="input" data-design-name value="${escapeHtml(a.name||'')}"></div><div class="field"><label>Medidas</label><div class="design-measures"><input class="input" data-design-width type="number" min="0" step=".1" value="${Number(a.width_cm)||''}" placeholder="Ancho cm"><span>×</span><input class="input" data-design-height type="number" min="0" step=".1" value="${Number(a.height_cm)||''}" placeholder="Alto cm"></div></div><div class="field full"><label>Nota</label><textarea class="textarea" data-design-note rows="3">${escapeHtml(a.note||'')}</textarea></div></div><div class="design-use-row"><span>Uso:</span><label><input type="checkbox" data-design-use-all ${uses.length===DESIGN_USES.length?'checked':''}> Todo</label>${DESIGN_USES.map(u=>`<label><input type="checkbox" data-design-use value="${escapeHtml(u)}" ${uses.includes(u)?'checked':''}> ${escapeHtml(u)}</label>`).join('')}</div><div class="design-card-actions"><label class="toggle-label"><input type="checkbox" data-design-printed ${Number(a.printed)?'checked':''}> Impreso</label><span class="dialog-spacer"></span><button class="btn btn-ghost" type="button" id="cancelDesignEditBtn">Cancelar</button><button class="btn btn-danger" type="button" id="deleteDesignDetailBtn">Eliminar</button><button class="btn btn-primary" type="button" id="saveDesignDetailBtn">Guardar cambios</button></div></div>`;
    qs('#designPreviewDialog').showModal();
  }

  async function renderSettings(){
    const [d,rulesData,correoStatus]=await Promise.all([api('/api/admin/settings'),api('/api/admin/shipping/rules'),api('/api/admin/correo/status').catch(e=>({configured:false,authOk:false,message:e.message,environment:'test'}))]);state.settings=d.settings||{};state.correoStatus=correoStatus;
    const s=state.settings;const shippingRules=rulesData.items||[];const cs=state.correoStatus||{};
    qs('#adminContent').innerHTML=`<form id="settingsForm">
      <div class="settings-grid">
        <section class="settings-card"><h3>Datos de SALMOS</h3><div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${escapeHtml(s.whatsapp||'5491162691341')}"></div><div class="field" style="margin-top:10px"><label>Instagram</label><input class="input" name="instagram" value="${escapeHtml(s.instagram||'')}"></div><div class="field" style="margin-top:10px"><label>Facebook</label><input class="input" name="facebook" value="${escapeHtml(s.facebook||'')}"></div></section>
        <section class="settings-card"><h3>Motomensajería</h3><div class="field"><label>Precio por km</label><input class="input" type="number" name="moto_rate_per_km" value="${escapeHtml(s.moto_rate_per_km||'800')}"></div><div class="field" style="margin-top:10px"><label>Envío mínimo</label><input class="input" type="number" name="moto_min_charge" value="${escapeHtml(s.moto_min_charge||'2000')}"><small class="field-help">Aunque la distancia dé menos, nunca se cobrará menos de este importe.</small></div><div class="field" style="margin-top:10px"><label>Máximo de km</label><input class="input" type="number" name="moto_max_km" value="${escapeHtml(s.moto_max_km||'50')}"></div><div class="field" style="margin-top:10px"><label>Demora mínima / máxima (horas)</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="input" type="number" name="moto_min_hours" value="${escapeHtml(s.moto_min_hours||'1')}"><input class="input" type="number" name="moto_max_hours" value="${escapeHtml(s.moto_max_hours||'4')}"></div></div></section>
        <section class="settings-card"><h3>Retiro</h3><label class="toggle-label"><input type="checkbox" name="pickup_enabled" ${s.pickup_enabled==='true'?'checked':''}> Habilitar retiro</label><div class="field" style="margin-top:10px"><label>Dirección</label><input class="input" name="pickup_address" value="${escapeHtml(s.pickup_address||'')}"></div><div class="field" style="margin-top:10px"><label>Instrucciones / horarios</label><textarea class="textarea" name="pickup_instructions">${escapeHtml(s.pickup_instructions||'')}</textarea></div></section>
        <section class="settings-card"><h3>Tramos de motomensajería</h3><div class="field"><label>Tramos (JSON simple)</label><textarea class="textarea" name="moto_distance_bands" rows="5" placeholder='[{"maxKm":3,"pricePesos":2500},{"maxKm":6,"pricePesos":3500}]'>${escapeHtml(s.moto_distance_bands||'')}</textarea><small class="field-help">Si lo dejás vacío sigue usando precio por km. Ejemplo: hasta 3 km un precio, hasta 6 km otro, etc.</small></div></section>
        <section class="settings-card"><h3>Reglas por zona / calle</h3><p class="muted">Sirven para sumar o descontar según texto de la dirección. Ej.: “Barrio X” +$800 o “Zona Y” −$500.</p><div class="form-grid"><div class="field"><label>Nombre</label><input class="input" id="shippingRuleName" placeholder="Ej.: Calle de tierra conocida"></div><div class="field"><label>Texto que debe contener la dirección</label><input class="input" id="shippingRuleMatch" placeholder="Ej.: Barrio Uno"></div><div class="field"><label>Ajuste ($)</label><input class="input" id="shippingRuleAdjustment" type="number" step="100" placeholder="800 o -500"></div><div class="field" style="align-self:end"><button class="btn btn-primary" type="button" id="addShippingRuleBtn">Agregar regla</button></div></div><div style="display:grid;gap:8px;margin-top:12px">${shippingRules.length?shippingRules.map(r=>`<div class="notice" style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span><strong>${escapeHtml(r.name)}</strong> · “${escapeHtml(r.match_text)}” · ${Number(r.adjustment_cents)>=0?'+':''}${money(r.adjustment_cents)}</span><button type="button" class="btn btn-danger" data-delete-shipping-rule="${r.id}">Eliminar</button></div>`).join(''):'<div class="muted">Todavía no hay reglas especiales.</div>'}</div></section>
        <section class="settings-card correo-settings-card"><div class="admin-section-head"><div><h3>Correo Argentino · PAQ.AR 2.0</h3><small class="muted">${cs.environment==='production'?'PRODUCCIÓN':'TEST'} · ${escapeHtml(cs.message||'Sin probar')}</small></div><span class="status ${cs.authOk?'success':cs.configured?'warning':'danger'}">${cs.authOk?'Credenciales OK':cs.configured?'Revisar':'Sin secretos'}</span></div>
          <div class="notice"><strong>Importante:</strong> Correo Argentino no entrega la tarifa por esta API. Hasta recibir la matriz comercial, en TEST se usa una tarifa técnica de $1 si dejás los importes vacíos. Para TEST, cargá exactamente como te indicó Correo Argentino: <strong>Usuario → CORREO_AGREEMENT</strong> y <strong>Clave → CORREO_API_KEY</strong>. Si responde 401, el rechazo viene del ambiente de prueba de Correo y el panel te lo mostrará claramente.</div>
          <label class="toggle-label"><input type="checkbox" name="correo_enabled" ${s.correo_enabled==='false'?'':(s.correo_enabled==='true'||cs.configured?'checked':'')}> Mostrar Correo Argentino en el checkout</label>
          <label class="toggle-label" style="margin-top:8px"><input type="checkbox" name="correo_auto_create_paid" ${s.correo_auto_create_paid==='true'?'checked':''}> Crear preimposición automáticamente al aprobarse Mercado Pago</label>
          <div class="form-grid" style="margin-top:12px"><div class="field"><label>Tarifa provisoria domicilio ($)</label><input class="input" type="number" min="0" step="1" name="correo_home_rate_pesos" value="${escapeHtml(s.correo_home_rate_pesos||'')}"></div><div class="field"><label>Tarifa provisoria sucursal ($)</label><input class="input" type="number" min="0" step="1" name="correo_agency_rate_pesos" value="${escapeHtml(s.correo_agency_rate_pesos||'')}"></div><div class="field"><label>Service type</label><input class="input" maxlength="2" name="correo_service_type" value="${escapeHtml(s.correo_service_type||'CP')}"></div><div class="field"><label>Rótulo</label><select class="select" name="correo_label_format"><option value="10x15" ${s.correo_label_format!=='label'?'selected':''}>10×15</option><option value="label" ${s.correo_label_format==='label'?'selected':''}>Label</option></select></div></div>
          <hr style="border:0;border-top:1px solid var(--line);margin:16px 0"><strong>Remitente</strong><div class="form-grid" style="margin-top:10px"><div class="field"><label>Nombre / razón social</label><input class="input" name="correo_sender_business_name" value="${escapeHtml(s.correo_sender_business_name||'SALMOS')}"></div><div class="field"><label>Email</label><input class="input" name="correo_sender_email" type="email" value="${escapeHtml(s.correo_sender_email||'')}"></div><div class="field"><label>Teléfono</label><input class="input" name="correo_sender_phone" value="${escapeHtml(s.correo_sender_phone||'')}"></div><div class="field"><label>Calle</label><input class="input" name="correo_sender_street" value="${escapeHtml(s.correo_sender_street||'')}"></div><div class="field"><label>Altura</label><input class="input" name="correo_sender_number" value="${escapeHtml(s.correo_sender_number||'')}"></div><div class="field"><label>Localidad</label><input class="input" name="correo_sender_city" value="${escapeHtml(s.correo_sender_city||'')}"></div><div class="field"><label>Código provincia</label><input class="input" maxlength="1" name="correo_sender_state" placeholder="B" value="${escapeHtml(s.correo_sender_state||'')}"><small class="field-help">B = Provincia de Buenos Aires.</small></div><div class="field"><label>Código postal</label><input class="input" name="correo_sender_zip" value="${escapeHtml(s.correo_sender_zip||'')}"></div></div>
          <details style="margin-top:12px"><summary>Valores de respaldo para peso y paquete</summary><div class="form-grid" style="margin-top:10px"><div class="field"><label>Peso (g)</label><input class="input" type="number" name="correo_fallback_weight_grams" value="${escapeHtml(s.correo_fallback_weight_grams||'500')}"></div><div class="field"><label>Alto (cm)</label><input class="input" type="number" name="correo_fallback_height_cm" value="${escapeHtml(s.correo_fallback_height_cm||'10')}"></div><div class="field"><label>Ancho (cm)</label><input class="input" type="number" name="correo_fallback_width_cm" value="${escapeHtml(s.correo_fallback_width_cm||'20')}"></div><div class="field"><label>Largo (cm)</label><input class="input" type="number" name="correo_fallback_depth_cm" value="${escapeHtml(s.correo_fallback_depth_cm||'30')}"></div></div></details>
          <div class="admin-actions" style="margin-top:12px"><button type="button" class="btn btn-ghost" id="testCorreoBtn">Probar credenciales ahora</button></div>
        </section>
        <section class="settings-card"><h3>Integraciones</h3><div class="notice">Las credenciales sensibles no se guardan acá: se cargan como secretos en Cloudflare. Este panel solo configura comportamiento, remitente y tarifas provisorias.</div></section>
      </div><div style="margin-top:16px;text-align:right"><button class="btn btn-primary" id="saveSettingsBtn">Guardar configuración</button></div>
    </form>`;
  }

  async function saveSettings(){const f=new FormData(qs('#settingsForm'));const settings={};for(const [k,v] of f.entries())settings[k]=String(v);settings.pickup_enabled=f.get('pickup_enabled')?'true':'false';settings.correo_enabled=f.get('correo_enabled')?'true':'false';settings.correo_auto_create_paid=f.get('correo_auto_create_paid')?'true':'false';await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings})});toast('Configuración guardada','success');await renderSettings();}

  function bind(){
    qsa('.admin-nav-btn').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
    qs('#adminMenuBtn').addEventListener('click',()=>qs('#adminSidebar').classList.toggle('open'));
    qs('#adminThemeBtn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
    qs('#collapseAdminListsBtn')?.addEventListener('click',()=>{const content=qs('#adminContent');qsa('.admin-table-wrap',content).forEach(w=>{if(!w.closest('.inventory-group')&&w.querySelectorAll('tbody tr').length>=5)w.classList.add('admin-list-collapsed')});qsa('.inventory-group,.design-library-section',content).forEach(g=>g.classList.add('list-collapsed'));qs('#collapseAdminListsBtn')?.classList.add('hidden');qs('#expandAdminListsBtn')?.classList.remove('hidden')});
    qs('#expandAdminListsBtn')?.addEventListener('click',()=>{const content=qs('#adminContent');qsa('.admin-list-collapsed',content).forEach(w=>w.classList.remove('admin-list-collapsed'));qsa('.inventory-group.list-collapsed,.design-library-section.list-collapsed',content).forEach(g=>g.classList.remove('list-collapsed'));qs('#expandAdminListsBtn')?.classList.add('hidden');qs('#collapseAdminListsBtn')?.classList.remove('hidden')});
    const productDialog=qs('#productDialog');
    const productCancelBtn=qs('#productDialog button[value="cancel"]');
    if(productCancelBtn){productCancelBtn.type='button';productCancelBtn.setAttribute('formnovalidate','');productCancelBtn.addEventListener('click',e=>{e.preventDefault();closeProductDialog();});}
    productDialog?.addEventListener('cancel',e=>{e.preventDefault();closeProductDialog();});
    productDialog?.addEventListener('close',resetProductDialogState);
    qs('#movementForm')?.addEventListener('change',e=>{if(e.target.name==='type')syncMovementType();});
    qs('#movementForm')?.addEventListener('input',e=>{const row=e.target.closest('[data-investment-row]');const field=e.target.dataset.investmentField;if(row&&field){const i=Number(row.dataset.investmentRow);if(state.investmentItems[i])state.investmentItems[i][field]=field==='quantity'?Math.max(1,Number(e.target.value)||1):e.target.value;}});
    qs('#movementDialog')?.addEventListener('close',()=>{state.editingMovementId=null;qs('#movementDialogTitle').textContent='Nuevo gasto / ingreso';});
    qs('#productImagesInput')?.addEventListener?.('change',()=>{});
    document.addEventListener('change',async e=>{
      if(e.target.closest?.('#couponForm') && (e.target.name==='applies_to'||e.target.name==='discount_type')){
        const form=qs('#couponForm');if(form){
          const applies=form.elements.applies_to?.value;
          const type=form.elements.discount_type?.value;
          if(applies==='products'&&type==='free')form.elements.discount_type.value='percent';
          const free=form.elements.discount_type?.value==='free';
          if(form.elements.value){form.elements.value.disabled=free;if(free)form.elements.value.value='0';}
        }
      }
      if(e.target.id==='productImagesInput'){addSelectedMedia([...e.target.files]);e.target.value=''}
      if(e.target.id==='designUploadScope'){const kind=qs('#designUploadKind');if(kind){if(e.target.value==='mixed'){kind.value='sheet';kind.disabled=true}else kind.disabled=false}}
      if(e.target.matches('[data-design-use-all]')){const root=e.target.closest('#designDetailEditor')||e.target.closest('[data-design-card]')||document;qsa('[data-design-use]',root).forEach(x=>x.checked=e.target.checked)}
      if(e.target.id==='inventoryStage'){qs('#internalPrepBox')?.classList.toggle('hidden',e.target.value!=='to_print')}
      if(e.target.matches('#productForm [name="category_id"]'))syncProductCategoryForm();
      if(e.target.matches('.order-status-select')){try{await api(`/api/admin/orders/${e.target.dataset.orderId}/status`,{method:'PATCH',body:JSON.stringify({fulfillment_status:e.target.value})});toast('Estado actualizado','success')}catch(err){toast(err.message,'error')}}
    });
    document.addEventListener('click',async e=>{
      const groupHead=e.target.closest('.inventory-group-head');if(groupHead){const g=groupHead.closest('.inventory-group');if(g){g.classList.toggle('list-collapsed');return;}}
      const designHead=e.target.closest('.design-library-section > .admin-section-head');if(designHead){const g=designHead.closest('.design-library-section');if(g){g.classList.toggle('list-collapsed');return;}}
      const go=e.target.closest('[data-go]');if(go){navigate(go.dataset.go);return}
      if(e.target.id==='openDesignUploadBtn'){qs('#designUploadDialog')?.showModal();return}
      if(e.target.id==='openDesignEmailBtn'){qs('#designEmailDialog')?.showModal();return}
      if(e.target.id==='closeDesignUploadBtn'||e.target.id==='cancelDesignUploadBtn'){qs('#designUploadDialog')?.close();return}
      if(e.target.id==='closeDesignEmailBtn'||e.target.id==='cancelDesignEmailBtn'){qs('#designEmailDialog')?.close();return}
      if(e.target.id==='closeDesignPreviewBtn'){qs('#designPreviewDialog')?.close();return}
      if(e.target.id==='openFlyerUploadBtn'){const form=qs('#flyerUploadForm');form?.reset();qs('#flyerUploadDialog')?.showModal();return}
      if(e.target.id==='closeFlyerUploadBtn'||e.target.id==='cancelFlyerUploadBtn'){qs('#flyerUploadDialog')?.close();return}
      if(e.target.id==='closeFlyerDetailBtn'||e.target.id==='cancelFlyerDetailBtn'){qs('#flyerDetailDialog')?.close();return}
      const of=e.target.closest('[data-open-flyer]');if(of){openFlyerDetail(Number(of.dataset.openFlyer));return}
      if(e.target.id==='editDesignDetailBtn'){qs('#designDetailEditor')?.classList.remove('hidden');e.target.closest('.design-detail-summary')?.classList.add('editing');return}
      if(e.target.id==='cancelDesignEditBtn'){if(state.activeDesignId){qs('#designPreviewDialog')?.close();openDesignPreview(state.activeDesignId)}return}
      if(e.target.id==='saveDesignDetailBtn'){if(!state.activeDesignId)return;try{e.target.disabled=true;await api(`/api/admin/design-assets/${state.activeDesignId}`,{method:'PATCH',body:JSON.stringify(designDialogPayload())});toast('Diseño actualizado','success');await renderDesigns();qs('#designPreviewDialog')?.close();openDesignPreview(state.activeDesignId)}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='deleteDesignDetailBtn'){if(!state.activeDesignId)return;if(confirm('¿Eliminar este diseño de la biblioteca?')){try{await api(`/api/admin/design-assets/${state.activeDesignId}`,{method:'DELETE'});qs('#designPreviewDialog')?.close();state.activeDesignId=null;toast('Diseño eliminado','success');await renderDesigns()}catch(err){toast(err.message,'error')}}return}
      if(e.target.id==='saveFlyerDetailBtn'){if(!state.activeFlyerId)return;try{e.target.disabled=true;await api(`/api/admin/flyers/${state.activeFlyerId}`,{method:'PUT',body:JSON.stringify({title:qs('#flyerDetailTitle')?.value||'',public:Boolean(qs('#flyerDetailPublic')?.checked),sort_order:Number(qs('#flyerDetailSort')?.value)||0})});qs('#flyerDetailDialog')?.close();toast('Flyer actualizado','success');await renderFlyers()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='deleteFlyerDetailBtn'){if(!state.activeFlyerId)return;if(confirm('¿Eliminar este flyer?')){try{await api(`/api/admin/flyers/${state.activeFlyerId}`,{method:'DELETE'});qs('#flyerDetailDialog')?.close();state.activeFlyerId=null;toast('Flyer eliminado','success');await renderFlyers()}catch(err){toast(err.message,'error')}}return}
      const pd=e.target.closest('[data-preview-design]');if(pd){openDesignPreview(Number(pd.dataset.previewDesign));return}
      const zd=e.target.closest('[data-toggle-design-zoom]');if(zd){zd.classList.toggle('fit');return}
      if(e.target.id==='uploadDesignBtn'){const files=[...(qs('#designUploadFiles')?.files||[])];if(!files.length){toast('Elegí al menos un archivo.','error');return}const scope=qs('#designUploadScope')?.value||'clients';const kind=scope==='mixed'?'sheet':(qs('#designUploadKind')?.value||'individual');try{e.target.disabled=true;for(const file of files){const fd=new FormData();fd.append('file',file);fd.append('scope',scope);fd.append('kind',kind);fd.append('name',(qs('#designUploadName')?.value||'').trim()||(files.length===1?file.name.replace(/\.[^.]+$/,''):'') );fd.append('note',qs('#designUploadNote')?.value||'');fd.append('widthCm',qs('#designUploadWidth')?.value||'');fd.append('heightCm',qs('#designUploadHeight')?.value||'');await api('/api/admin/design-assets',{method:'POST',body:fd})}toast('Diseño/s guardado/s sin modificar','success');qs('#designUploadDialog')?.close();await renderDesigns()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='emailDesignSheetsBtn'){const ids=qsa('[data-design-sheet]:checked').map(x=>Number(x.dataset.designSheet));const to=qs('#designEmailTo')?.value.trim();if(!ids.length){toast('Marcá al menos una plancha.','error');return}if(!to){toast('Ingresá el email destinatario.','error');return}try{e.target.disabled=true;e.target.textContent='Enviando...';await api('/api/admin/design-assets/email',{method:'POST',body:JSON.stringify({ids,to,message:qs('#designEmailMessage')?.value||''})});toast('Mail enviado con enlaces a los originales','success');qs('#designEmailDialog')?.close()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;e.target.textContent='Enviar planchas seleccionadas'}return}
      if(e.target.id==='newProductBtn'){await openProductDialog();return}
      const edit=e.target.closest('[data-edit-product]');if(edit){await openProductDialog(Number(edit.dataset.editProduct));return}
      const dup=e.target.closest('[data-duplicate-product]');if(dup){await openProductDialog(Number(dup.dataset.duplicateProduct),true);return}
      const move=e.target.closest('[data-move-media]');if(move){moveMedia(move.dataset.mediaKey,Number(move.dataset.moveMedia));return}
      const rm=e.target.closest('[data-remove-media]');if(rm){const key=rm.dataset.removeMedia;const item=state.mediaItems.find(x=>x.key===key);if(!item)return;if(item.existing&&item.id){if(!confirm('¿Eliminar este archivo del producto?'))return;await api(`/api/admin/media/${item.id}`,{method:'DELETE'});}else if(item.url?.startsWith('blob:')){URL.revokeObjectURL(item.url);}state.mediaItems=state.mediaItems.filter(x=>x.key!==key);state.newFiles=state.mediaItems.filter(x=>!x.existing).map(x=>x.file);renderMediaManager();return}
      const stockStep=e.target.closest('[data-stock-step]');if(stockStep){const row=stockStep.closest('.variant-row');const input=qs('[data-v="stock"]',row);if(input){const delta=Number(stockStep.dataset.stockStep)||0;input.value=String(Math.max(0,Math.trunc(Number(input.value)||0)+delta));input.dispatchEvent(new Event('input',{bubbles:true}));}return}
      if(e.target.id==='addVariantBtn'){const builder=qs('#variantBuilder');const mode=builder?.dataset.mode||'';if(mode)builder.insertAdjacentHTML('beforeend',variantRow({color:mode==='sized'?'Negro':'',size:'',stock:1,sku:''},mode));return}
      const rv=e.target.closest('.remove-variant');if(rv){rv.closest('.variant-row').remove();return}
      const rn=e.target.closest('[data-remove-new-image]');if(rn){state.newFiles.splice(Number(rn.dataset.removeNewImage),1);qs('#newImages').innerHTML=state.newFiles.map((f,i)=>`<div class="image-preview"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-remove-new-image="${i}">×</button></div>`).join('');return}
      const di=e.target.closest('[data-delete-image]');if(di){if(confirm('¿Eliminar esta foto?')){await api(`/api/admin/images/${di.dataset.deleteImage}`,{method:'DELETE'});di.closest('.image-preview').remove();toast('Foto eliminada','success')}return}
      if(e.target.id==='saveProductBtn'){e.preventDefault();const btn=e.target;try{btn.disabled=true;await saveProduct()}catch(err){toast(err.message,'error')}finally{btn.disabled=false}return}
      if(e.target.id==='newCategoryBtn'){const name=prompt('Nombre de la categoría:');if(name){try{await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name})});state.categories=[];await renderCategories();toast('Categoría creada','success')}catch(err){toast(err.message,'error')}}return}
      const sc=e.target.closest('[data-save-category]');if(sc){const row=sc.closest('[data-category-row]');try{await api(`/api/admin/categories/${sc.dataset.saveCategory}`,{method:'PUT',body:JSON.stringify({name:qs('[data-category-name]',row).value,sort_order:Number(qs('[data-category-sort]',row).value)||0,active:qs('[data-category-active]',row).checked})});state.categories=[];toast('Categoría guardada','success');await renderCategories()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='clearStockFiltersBtn'){state.stockFilters={category:'',stage:'',size:'',color:'',fit:'',audience:'',sort:'product'};await renderStock();return}
      const ss=e.target.closest('[data-save-stock]');if(ss){const row=ss.closest('[data-stock-row]');try{await api(`/api/admin/stock/${ss.dataset.saveStock}`,{method:'PATCH',body:JSON.stringify({stock:Number(qs('[data-stock-value]',row).value)||0})});toast('Stock actualizado','success');await renderStock()}catch(err){toast(err.message,'error')}return}
      const delOrder=e.target.closest('[data-delete-order]');if(delOrder){if(confirm('¿Borrar esta orden cancelada de prueba? Esta acción no se puede deshacer.')){try{await api(`/api/admin/orders/${delOrder.dataset.deleteOrder}`,{method:'DELETE'});toast('Orden de prueba eliminada','success');await renderOrders()}catch(err){toast(err.message,'error')}}return}
      const cc=e.target.closest('[data-correo-create]');if(cc){if(!confirm('¿Crear la preimposición de este pedido en Correo Argentino?'))return;try{cc.disabled=true;cc.textContent='Creando...';const d=await api(`/api/admin/orders/${cc.dataset.correoCreate}/correo/create`,{method:'POST'});toast(`Envío creado · ${d.trackingNumber}`,'success');await renderOrders()}catch(err){toast(err.message,'error');cc.disabled=false;cc.textContent='Crear envío'}return}
      const cl=e.target.closest('[data-correo-label]');if(cl){try{cl.disabled=true;await downloadAdminFile(`/api/admin/orders/${cl.dataset.correoLabel}/correo/label`,'rotulo-correo.pdf');toast('Rótulo descargado','success')}catch(err){toast(err.message,'error')}finally{cl.disabled=false}return}
      const ct=e.target.closest('[data-correo-track]');if(ct){try{ct.disabled=true;const d=await api(`/api/admin/orders/${ct.dataset.correoTrack}/correo/tracking`);toast(d.status?`Correo: ${d.status}`:'Seguimiento actualizado','success');await renderOrders()}catch(err){toast(err.message,'error');ct.disabled=false}return}
      const cx=e.target.closest('[data-correo-cancel]');if(cx){if(!confirm('¿Cancelar esta preimposición en Correo Argentino?'))return;try{cx.disabled=true;await api(`/api/admin/orders/${cx.dataset.correoCancel}/correo/cancel`,{method:'PATCH'});toast('Preimposición cancelada en Correo Argentino','success');await renderOrders()}catch(err){toast(err.message,'error');cx.disabled=false}return}
      if(e.target.id==='testCorreoBtn'){try{e.target.disabled=true;e.target.textContent='Probando...';const d=await api('/api/admin/correo/status');toast(d.authOk?'Credenciales de Correo válidas':d.message,d.authOk?'success':'error');await renderSettings()}catch(err){toast(err.message,'error');e.target.disabled=false;e.target.textContent='Probar credenciales ahora'}return}
      if(e.target.id==='uploadFlyersBtn'){const form=qs('#flyerUploadForm');const fd=new FormData(form);const files=[...(form.elements.files?.files||[])];if(!files.length){toast('Elegí al menos un archivo.','error');return}const up=new FormData();up.append('title',fd.get('title')||'');up.append('public',fd.get('public')?'1':'0');files.forEach(file=>up.append('files',file));try{e.target.disabled=true;await api('/api/admin/flyers',{method:'POST',body:up});toast('Flyer/s subido/s','success');qs('#flyerUploadDialog')?.close();await renderFlyers()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const ec=e.target.closest('[data-edit-coupon]');if(ec){state.editingCouponId=Number(ec.dataset.editCoupon);const c=state.coupons.find(x=>Number(x.id)===state.editingCouponId);renderCouponEditor(c||null);qs('#couponForm')?.scrollIntoView({behavior:'smooth',block:'start'});return}
      const dc=e.target.closest('[data-delete-coupon]');if(dc){if(confirm('¿Eliminar este cupón?')){await api(`/api/admin/coupons/${dc.dataset.deleteCoupon}`,{method:'DELETE'});if(Number(state.editingCouponId)===Number(dc.dataset.deleteCoupon))state.editingCouponId=null;toast('Cupón eliminado','success');await renderCoupons()}return}
      if(e.target.id==='saveCouponBtn'){try{e.target.disabled=true;await saveCouponFromForm()}catch(err){toast(err.message,'error');e.target.disabled=false}return}
      if(e.target.id==='cancelCouponEditBtn'){state.editingCouponId=null;renderCouponEditor(null);return}
            const rr=e.target.closest('[data-report-range]');if(rr){state.reportRange=rr.dataset.reportRange;if(state.view==='dashboard')await renderDashboard();else if(state.view==='expenses')await renderExpenses();return}
      if(e.target.id==='applyReportDates'){state.customFrom=qs('#reportFrom')?.value||'';state.customTo=qs('#reportTo')?.value||'';if(state.view==='dashboard')await renderDashboard();else await renderExpenses();return}
      const sf=e.target.closest('[data-stock-filter]');if(sf){const wanted=sf.dataset.stockFilter||'';qsa('[data-stock-filter]').forEach(b=>b.classList.toggle('active',b===sf));qsa('[data-stock-product-card]').forEach(card=>card.classList.toggle('hidden',Boolean(wanted)&&card.dataset.stockCategory!==wanted));qs('#dashboardStockGallery')?.scrollTo({left:0,behavior:'smooth'});return}
      const arrow=e.target.closest('[data-scroll-target]');if(arrow){const host=document.getElementById(arrow.dataset.scrollTarget);if(host)host.scrollBy({left:(Number(arrow.dataset.scrollDir)||1)*Math.max(260,host.clientWidth*.78),behavior:'smooth'});return}
      if(e.target.id==='addInvestmentItemBtn'){state.investmentItems.push({productType:'',quantity:1,color:'',variant:''});renderInvestmentItems();return}
      const remInv=e.target.closest('[data-remove-investment]');if(remInv){state.investmentItems.splice(Number(remInv.dataset.removeInvestment),1);renderInvestmentItems();return}
      if(e.target.id==='newMovementBtn'){state.editingMovementId=null;state.investmentItems=[];const f=qs('#movementForm');f.reset();f.elements.date.value=today();qs('#movementDialogTitle').textContent='Nuevo ingreso / egreso';qs('#movementDialog').showModal();syncMovementType();return}
      if(e.target.id==='saveMovementBtn'){e.preventDefault();const form=qs('#movementForm');const f=new FormData(form);try{e.target.disabled=true;const type=String(f.get('type')||'expense');const items=type==='investment'?state.investmentItems.map(x=>({productType:String(x.productType||'').trim(),quantity:Math.max(1,Number(x.quantity)||1),color:String(x.color||'').trim(),variant:String(x.variant||'').trim()})).filter(x=>x.productType):[];if(type==='investment'&&!items.length)throw new Error('Agregá al menos un producto a la inversión.');const payload={type,category:type==='investment'?(String(f.get('category')||'Inversión').trim()||'Inversión'):f.get('category'),description:type==='investment'?(String(f.get('description')||'Ingreso de mercadería a producción').trim()||'Ingreso de mercadería a producción'):f.get('description'),origin:f.get('origin'),destination:f.get('destination'),amount_cents:pesosToCents(f.get('amount')),occurred_at:new Date(`${f.get('date')}T12:00:00-03:00`).toISOString(),items};const editingId=state.editingMovementId;const saved=await api(editingId?`/api/admin/finance/${editingId}`:'/api/admin/finance',{method:editingId?'PUT':'POST',body:JSON.stringify(payload)});const id=saved?.item?.id||editingId;const files=[...(form.elements.attachments?.files||[])];if(id&&files.length){const up=new FormData();files.forEach(file=>up.append('files',file));await api(`/api/admin/finance/${id}/attachments`,{method:'POST',body:up});}state.editingMovementId=null;state.investmentItems=[];qs('#movementDialog').close();toast(editingId?'Movimiento actualizado':'Movimiento guardado','success');await renderExpenses()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const em=e.target.closest('[data-edit-movement]');if(em){const r=reportRangeDates();const d=await api(`/api/admin/finance?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const m=(d.movements||[]).find(x=>Number(x.id)===Number(em.dataset.editMovement));if(m){state.editingMovementId=Number(m.id);const form=qs('#movementForm');form.reset();form.elements.type.value=m.type;state.investmentItems=Array.isArray(m.investmentItems)?m.investmentItems.map(x=>({productType:x.product_type||x.productType||'',quantity:Number(x.quantity)||1,color:x.color||'',variant:x.variant||''})):[];form.elements.category.value=m.category||'';form.elements.description.value=m.description||'';form.elements.origin.value=m.origin||'';form.elements.destination.value=m.destination||'';form.elements.amount.value=centsToPesos(m.amount_cents);form.elements.date.value=String(m.occurred_at||'').slice(0,10);qs('#movementDialogTitle').textContent='Editar ingreso / egreso';qs('#movementDialog').showModal();renderInvestmentItems();syncMovementType();}return}
      const dm=e.target.closest('[data-delete-movement]');if(dm){if(confirm('¿Eliminar este movimiento y sus adjuntos?')){await api(`/api/admin/finance/${dm.dataset.deleteMovement}`,{method:'DELETE'});await renderExpenses()}return}
      if(e.target.id==='createCouponBatchBtn'){try{const count=Number(qs('#batchCouponCount')?.value)||5,prefix=qs('#batchCouponPrefix')?.value||'SALMOS',appliesTo=qs('#batchCouponApplies')?.value||'products',discountType=qs('#batchCouponType')?.value||'percent';let value=Number(qs('#batchCouponValue')?.value)||0;if(discountType==='fixed')value=pesosToCents(value);if(discountType==='free')value=0;await api('/api/admin/coupons/batch',{method:'POST',body:JSON.stringify({count,prefix,appliesTo,discountType,value,minSubtotalCents:0,active:true})});toast(`${count} cupones creados`,'success');await renderCoupons()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='toggleBulkPriceBtn'){qs('#bulkPricePanel')?.classList.toggle('hidden');return}
      if(e.target.id==='closeBulkPriceBtn'){qs('#bulkPricePanel')?.classList.add('hidden');return}
      if(e.target.id==='applyBulkPriceBtn'){const value=Number(qs('#bulkValue')?.value)||0;if(!value){toast('Ingresá un valor.','error');return}const ids=qsa('[data-bulk-product]:checked').map(x=>Number(x.dataset.bulkProduct));if(!confirm(`¿Aplicar este cambio a ${ids.length?ids.length+' producto(s) marcados':'los productos del filtro'}?`))return;try{const d=await api('/api/admin/products/bulk-price',{method:'POST',body:JSON.stringify({ids,categoryId:ids.length?null:(qs('#bulkCategory')?.value||null),minPriceCents:ids.length?null:(qs('#bulkMinPrice')?.value?pesosToCents(qs('#bulkMinPrice').value):null),maxPriceCents:ids.length?null:(qs('#bulkMaxPrice')?.value?pesosToCents(qs('#bulkMaxPrice').value):null),direction:qs('#bulkDirection')?.value,mode:qs('#bulkMode')?.value,value,roundToPesos:Number(qs('#bulkRound')?.value)||100})});toast(`${d.count} precios actualizados`,'success');await renderProducts()}catch(err){toast(err.message,'error')}return}
      const saveCustom=e.target.closest('[data-save-custom]');if(saveCustom){const card=saveCustom.closest('[data-custom-order]');try{await api(`/api/admin/custom-orders/${saveCustom.dataset.saveCustom}`,{method:'PATCH',body:JSON.stringify({quotedTotalCents:pesosToCents(qs('[data-custom-total]',card)?.value),status:qs('[data-custom-status]',card)?.value})});toast('Pedido actualizado','success');await renderCustomOrders()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='addShippingRuleBtn'){try{const name=qs('#shippingRuleName')?.value.trim(),matchText=qs('#shippingRuleMatch')?.value.trim(),adjustmentCents=pesosToCents(qs('#shippingRuleAdjustment')?.value);await api('/api/admin/shipping/rules',{method:'POST',body:JSON.stringify({name,matchText,adjustmentCents,active:true})});toast('Regla agregada','success');await renderSettings()}catch(err){toast(err.message,'error')}return}
      const dsr=e.target.closest('[data-delete-shipping-rule]');if(dsr){if(confirm('¿Eliminar esta regla de envío?')){await api(`/api/admin/shipping/rules/${dsr.dataset.deleteShippingRule}`,{method:'DELETE'});await renderSettings();toast('Regla eliminada','success')}return}
      if(e.target.id==='saveSettingsBtn'){e.preventDefault();try{await saveSettings()}catch(err){toast(err.message,'error')}return}
    });
    document.addEventListener('dragstart',e=>{const row=e.target.closest?.('[data-media-key]');if(!row)return;state.mediaDragKey=row.dataset.mediaKey;row.classList.add('dragging');if(e.dataTransfer)e.dataTransfer.effectAllowed='move'});
    document.addEventListener('dragend',e=>{e.target.closest?.('[data-media-key]')?.classList.remove('dragging');state.mediaDragKey=null});
    document.addEventListener('dragover',e=>{if(e.target.closest?.('[data-media-key]'))e.preventDefault()});
    document.addEventListener('drop',e=>{const target=e.target.closest?.('[data-media-key]');if(!target||!state.mediaDragKey)return;e.preventDefault();const from=state.mediaItems.findIndex(x=>x.key===state.mediaDragKey),to=state.mediaItems.findIndex(x=>x.key===target.dataset.mediaKey);if(from<0||to<0||from===to)return;const [item]=state.mediaItems.splice(from,1);state.mediaItems.splice(to,0,item);renderMediaManager()});
    qs('#adminContent').addEventListener('input',e=>{if(e.target.id==='adminProductSearch'){const q=e.target.value.toLowerCase();const items=state.products.filter(p=>p.name.toLowerCase().includes(q)||String(p.category_name||'').toLowerCase().includes(q));qs('#adminProductsTable').innerHTML=groupedProductsHtml(items)}});
    qs('#adminContent').addEventListener('change',e=>{
      const map={stockFilterCategory:'category',stockFilterStage:'stage',stockFilterSize:'size',stockFilterColor:'color',stockFilterFit:'fit',stockFilterAudience:'audience',stockSort:'sort'};
      const key=map[e.target.id];if(!key)return;state.stockFilters[key]=e.target.value;renderStockFiltered();
    });
  }

  initTheme();bind();navigate('dashboard');
})();