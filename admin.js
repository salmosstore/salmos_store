(() => {
  'use strict';

  const cfg = window.SALMOS_CONFIG || {};
  const API = (cfg.API_BASE_URL || '').replace(/\/$/, '');
  const apiUrl = path => `${API}${path}`;
  const qs = (s,r=document)=>r.querySelector(s);
  const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
  const escapeHtml=(v='')=>String(v).replace(/[&<>'"]/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s]));
  const money=(c=0)=>new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:2}).format((Number(c)||0)/100);
  const pesosToCents=v=>Math.round((Number(v)||0)*100);
  const centsToPesos=v=>String(Math.round(Number(v)||0)/100);
  const today=()=>new Date().toISOString().slice(0,10);

  const state={designUploadContext:'designs',editingPurchaseId:null,otherEditor:null,colorEditorRow:null,view:'dashboard',categories:[],products:[],orders:[],customOrders:[],coupons:[],flyers:[],settings:{},correoStatus:null,editingProduct:null,editingCouponId:null,editingMovementId:null,newFiles:[],mediaItems:[],mediaDragKey:null,mediaHostId:'mediaOrderList',reportRange:'month',customFrom:'',customTo:'',stockItems:[],stockFilters:{category:'',stage:'',size:'',color:'',fit:'',audience:'',sort:'product'},designAssets:[],mockupAssets:[],mockupImageCache:new Map(),mockupRenderSeq:0,mockupLayerBoxes:[],mockupSelectedLayer:'',mockupPointer:null,mockupZoom:1,mockupPanX:0,mockupPanY:0,sheetZoom:1,mockupCapDesign:null,mockupUploadFromPurchaseRow:null,activeDesignId:null,activeFlyerId:null,purchases:[],materials:[],productionJobs:[],purchaseItems:[],productRecipeDesigns:[],productRecipeMaterials:[],costingLoaded:false,productionProduct:null,productionMaterialsSelected:[],productionDesignsSelected:[],productionWizardTab:1,productionPriceDirty:false,productionShippingDirty:false,purchaseOptionsLoaded:false,purchaseOptions:{types:[],fits:[],classes:[],sizes:{},materials:{},colors:[],financeReasons:[]},recentFinanceReasons:[]};

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
  function toast(msg,type=''){
    const dialog=qsa('dialog[open]').at(-1);let host=qs('#toastStack');
    if(dialog){host=qs('.dialog-notices',dialog);if(!host){host=document.createElement('div');host.className='dialog-notices';host.setAttribute('role','status');dialog.appendChild(host);}}
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;host.appendChild(el);setTimeout(()=>el.remove(),type==='error'?12000:4500);
  }
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
  function renderMediaManager(hostId=state.mediaHostId||'mediaOrderList'){
    state.mediaHostId=hostId;const host=qs(`#${hostId}`);if(!host)return;
    host.innerHTML=state.mediaItems.length?state.mediaItems.map((item,i)=>`<div class="salmos-media-item" draggable="true" data-media-key="${escapeHtml(item.key)}"><div class="salmos-media-order">${i+1}</div><div class="salmos-media-preview">${mediaPreviewHtml(item)}</div><div class="salmos-media-copy"><strong>${escapeHtml(item.name||`Archivo ${i+1}`)}</strong><small>${item.existing?'Ya guardado':'Nuevo · se sube al guardar'} · posición ${i+1}</small></div><div class="salmos-media-actions"><button type="button" class="btn btn-ghost" data-move-media="-1" data-media-key="${escapeHtml(item.key)}" ${i===0?'disabled':''} aria-label="Subir">↑</button><button type="button" class="btn btn-ghost" data-move-media="1" data-media-key="${escapeHtml(item.key)}" ${i===state.mediaItems.length-1?'disabled':''} aria-label="Bajar">↓</button><button type="button" class="btn btn-danger" data-remove-media="${escapeHtml(item.key)}" aria-label="Eliminar">×</button></div></div>`).join(''):`<div class="notice">Todavía no cargaste fotos ni videos.</div>`;
  }
  function moveMedia(key,delta){const i=state.mediaItems.findIndex(x=>x.key===key);if(i<0)return;const j=i+delta;if(j<0||j>=state.mediaItems.length)return;[state.mediaItems[i],state.mediaItems[j]]=[state.mediaItems[j],state.mediaItems[i]];renderMediaManager()}
  function addSelectedMedia(files,hostId=state.mediaHostId||'mediaOrderList'){
    state.mediaHostId=hostId;for(const file of files){const mediaType=file.type?.startsWith('video/')||mediaTypeFromName(file.name)==='video'?'video':'image';const key=`new-${Date.now()}-${Math.random().toString(36).slice(2)}`;state.mediaItems.push({key,existing:false,file,url:URL.createObjectURL(file),name:file.name,mediaType})}
    state.newFiles=state.mediaItems.filter(x=>!x.existing).map(x=>x.file);renderMediaManager(state.mediaHostId);
  }
  function resetProductDialogState(){
    for(const item of state.mediaItems||[]){if(!item.existing&&item.url?.startsWith('blob:')){try{URL.revokeObjectURL(item.url)}catch{}}}
    state.newFiles=[];state.mediaItems=[];state.mediaDragKey=null;state.mediaHostId='mediaOrderList';state.editingProduct=null;
    const saveBtn=qs('#saveProductBtn');if(saveBtn)saveBtn.disabled=false;
  }
  function closeProductDialog(){const dialog=qs('#productDialog');if(dialog?.open)dialog.close();}

  const titles={dashboard:'Dashboard',products:'Productos',orders:'Órdenes',customOrders:'Pedidos',purchases:'Compras',production:'Producción',stock:'Stock',coupons:'Cupones',categories:'Categorías',expenses:'Caja',flyers:'Flyers',designs:'Diseños',settings:'Configuración'};

  async function navigate(view){state.view=view;qs('#viewTitle').textContent=titles[view]||view;qsa('.admin-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));qs('#adminSidebar').classList.remove('open');const host=qs('#adminContent');host.innerHTML='<div class="empty-state"><strong>Cargando...</strong></div>';try{if(view==='dashboard')await renderDashboard();if(view==='products')await renderProducts();if(view==='orders')await renderOrders();if(view==='customOrders')await renderCustomOrders();if(view==='purchases')await renderPurchases();if(view==='production')await renderProduction();if(view==='stock')await renderStock();if(view==='coupons')await renderCoupons();if(view==='categories')await renderCategories();if(view==='expenses')await renderExpenses();if(view==='flyers')await renderFlyers();if(view==='designs')await renderDesigns();if(view==='settings')await renderSettings()}catch(e){renderAccessError(e)}}

  function renderAccessError(e){
    const msg=e.status===503?'El panel administrativo está preparado, pero todavía falta activar Cloudflare Access cuando el dominio quede activo.':e.status===401?'Tu sesión de Cloudflare Access no está autorizada para este panel.':e.message;
    qs('#adminContent').innerHTML=`<div class="empty-state"><strong>Panel protegido</strong>${escapeHtml(msg)}</div>`;
  }

  async function ensureCategories(force=false){if(state.categories.length&&!force)return;const d=await api('/api/admin/categories');state.categories=d.items||[]}

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


  const MATERIAL_TYPES=[['shirt','Remera'],['chomba','Chomba'],['hoodie','Buzo'],['cap','Gorra'],['mug','Taza'],['glass','Vaso'],['thermos','Termo'],['bag','Bolso'],['dtf_textile','DTF textil'],['dtf_uv','DTF UV'],['packaging','Packaging']];
  const LEGACY_MATERIAL_TYPES={tumbler:'Vaso / termo (anterior)',other:'Otros'};
  const CLOTHING_FEATURES=['Algodón piqué','Algodón peinado 24.1','Cuello en rib','Tapa costuras','Costuras reforzadas'];
  const PURCHASE_BASIC_MATERIALS={shirt:CLOTHING_FEATURES,chomba:CLOTHING_FEATURES,hoodie:CLOTHING_FEATURES,mug:['Cerámica'],cap:['Gabardina','Trucker con red','Ajustable con traba de metal','Ajustable con traba de plástico'],dtf_textile:['DTF textil'],dtf_uv:['DTF UV']};
  const PURCHASE_BASIC_COLORS=['Negro','Blanco','Crudo','Crema','Beige','Gris','Azul marino','Azul','Celeste','Rojo','Bordó','Verde','Rosa','Marrón','Amarillo','Fucsia'];
  const PURCHASE_BASIC_FITS=['Clásico','Oversize','Boxy fit','Crop'];
  const PURCHASE_CLASSES=['ADULTOS','NIÑOS','ESPECIALES'];
  const PURCHASE_GENDERS=['Hombre','Mujer','Unisex'];
  const PURCHASE_SIZES_BY_CLASS={ADULTOS:['S','M','L','XL','XXL'],NIÑOS:Array.from({length:16},(_,i)=>String(i+1)),ESPECIALES:['6','7','8','9','10']};
  const PURCHASE_COLOR_HEX={'Negro':'#151515','Blanco':'#f7f5ef','Crudo':'#eee2cf','Crema':'#f5ead3','Beige':'#d4bd9b','Gris':'#9da0a5','Azul marino':'#18233d','Azul':'#2454ae','Celeste':'#86cbea','Rojo':'#c63b46','Bordó':'#722632','Verde':'#3b824d','Rosa':'#f29bbc','Marrón':'#79513c','Amarillo':'#e4bc32','Fucsia':'#d84691'};
  const FINANCE_BASIC_REASONS=['Venta','Aporte','Publicidad','Servicio','Gasto','Inversión'];

  const normalizeOption=v=>String(v||'').trim().replace(/\s+/g,' ');
  const uniqOptions=(arr=[])=>[...new Set(arr.map(normalizeOption).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  const safeCustomTypeCode=label=>`custom_${normalizeOption(label).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'material'}`;
  function customTypeEntries(){return Array.isArray(state.purchaseOptions?.types)?state.purchaseOptions.types.filter(x=>x&&x.code&&x.label):[]}
  function materialTypeLabel(t){
    const fixed=Object.fromEntries(MATERIAL_TYPES)[t]||LEGACY_MATERIAL_TYPES[t];
    if(fixed)return fixed;
    const custom=customTypeEntries().find(x=>x.code===t);
    if(custom)return custom.label;
    if(String(t||'').startsWith('custom_'))return String(t).slice(7).replace(/_/g,' ').replace(/\b\w/g,m=>m.toUpperCase());
    return 'Otros';
  }
  const materialIsGarment=t=>['shirt','chomba','hoodie'].includes(String(t));
  const materialUsesColor=t=>!['dtf_textile','dtf_uv','packaging'].includes(String(t));
  const materialIsDtf=t=>['dtf_textile','dtf_uv'].includes(String(t));
  const materialUsesCapacity=t=>['mug','glass','thermos'].includes(String(t));
  const PURCHASE_CAPACITY_OPTIONS={mug:[250,300,330,350,400,450,500],glass:[350,500,600,700,750,1000],thermos:[350,500,600,750,1000,1200,1500]};
  function purchaseCapacityField(item,type){
    if(!materialUsesCapacity(type))return '';
    const opts=PURCHASE_CAPACITY_OPTIONS[type]||[];
    const value=Math.max(0,Number(item.capacityMl)||0);
    return `<div class="field purchase-capacity"><label>Capacidad</label><div class="capacity-input-wrap"><input class="input" data-purchase-field="capacityMl" type="number" min="1" step="10" list="capacity-${type}" value="${value||''}" placeholder="ml"><span>ml</span></div><datalist id="capacity-${type}">${opts.map(v=>`<option value="${v}"></option>`).join('')}</datalist></div>`;
  }

  async function ensureAdminOptionSettings(){
    if(state.purchaseOptionsLoaded)return;
    try{
      const d=await api('/api/admin/settings');state.settings={...state.settings,...(d.settings||{})};
      const raw=JSON.parse(state.settings.admin_purchase_options_v2||'{}');
      state.purchaseOptions={
        types:Array.isArray(raw.types)?raw.types:[],
        fits:Array.isArray(raw.fits)?raw.fits:[],
        classes:Array.isArray(raw.classes)?raw.classes:[],
        sizes:raw.sizes&&typeof raw.sizes==='object'?raw.sizes:{},
        materials:raw.materials&&typeof raw.materials==='object'?raw.materials:{},
        featureCatalog:raw.featureCatalog&&typeof raw.featureCatalog==='object'?raw.featureCatalog:{},
        colors:Array.isArray(raw.colors)?raw.colors:[],
        financeReasons:Array.isArray(raw.financeReasons)?raw.financeReasons:[]
      };
    }catch{state.purchaseOptions={types:[],fits:[],classes:[],sizes:{},materials:{},colors:[],financeReasons:[]}}
    state.purchaseOptionsLoaded=true;
  }
  async function persistAdminOptionSettings(){
    const payload=JSON.stringify(state.purchaseOptions||{});
    await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{admin_purchase_options_v2:payload}})});
    state.settings.admin_purchase_options_v2=payload;
  }
  async function ensureCostingData(force=false){await ensureAdminOptionSettings();if(state.costingLoaded&&!force)return;const [m,d]=await Promise.all([api('/api/admin/materials'),api('/api/admin/design-assets')]);state.materials=m.items||[];state.designAssets=d.items||[];state.costingLoaded=true;}
  function materialFamilies(){const seen=new Set(),out=[];for(const m of state.materials){if(!m.name||materialIsDtf(m.material_type))continue;const key=`${m.material_type}|||${m.name}`.toLowerCase();if(seen.has(key))continue;seen.add(key);out.push({type:m.material_type,name:m.name});}return out.sort((a,b)=>materialTypeLabel(a.type).localeCompare(materialTypeLabel(b.type),'es')||a.name.localeCompare(b.name,'es'));}
  function recipeFamilyValue(type='',name=''){return type&&name?`${type}|||${name}`:''}
  function productRecipeDesignRow(row={},i=0){const selected=Number(row.designAssetId??row.design_asset_id)||0,qty=Math.max(.01,Number(row.quantity)||1);const options=state.designAssets.filter(d=>d.kind==='individual').map(d=>`<option value="${d.id}" ${Number(d.id)===selected?'selected':''}>${escapeHtml(d.name||d.file_name)} · ${Number(d.width_cm)||'?'}×${Number(d.height_cm)||'?'} cm · ${d.print_material_type==='dtf_uv'?'DTF UV':d.print_material_type==='none'?'Sin DTF':'DTF textil'}</option>`).join('');return `<div class="recipe-design-row" data-recipe-design-row="${i}"><select class="select" data-recipe-design-id><option value="">Elegir diseño...</option>${options}</select><input class="input" data-recipe-design-qty type="number" min=".01" step="1" value="${qty}" title="Cantidad de estampas"><button type="button" class="icon-btn" data-remove-recipe-design="${i}" aria-label="Quitar">×</button>${row.measureLabel?`<small class="recipe-measure-note">${escapeHtml(row.measureLabel)}</small>`:''}</div>`;}
  function renderProductRecipeDesigns(){const host=qs('#productRecipeDesignRows');if(host)host.innerHTML=state.productRecipeDesigns.length?state.productRecipeDesigns.map(productRecipeDesignRow).join(''):'<div class="muted">Sin diseños vinculados todavía.</div>';updateProductCostEstimate();}
  function productRecipeMaterialRow(row={},i=0){const selected=Number(row.materialId??row.material_id)||0,qty=Math.max(.001,Number(row.quantity)||1);const options=state.materials.filter(m=>!materialIsDtf(m.material_type)).map(m=>{const bits=[materialTypeLabel(m.material_type),m.name,m.color,m.size,m.fit].filter(Boolean).join(' · ');return `<option value="${m.id}" ${Number(m.id)===selected?'selected':''}>${escapeHtml(bits)} · stock ${Number(m.stock_qty||0).toLocaleString('es-AR',{maximumFractionDigits:2})}</option>`}).join('');return `<div class="recipe-design-row recipe-material-row" data-recipe-material-row="${i}"><select class="select" data-recipe-material-id><option value="">Elegir insumo...</option>${options}</select><input class="input" data-recipe-material-qty type="number" min=".001" step=".1" value="${qty}" title="Cantidad por producto"><button type="button" class="icon-btn" data-remove-recipe-material="${i}" aria-label="Quitar">×</button></div>`;}
  function renderProductRecipeMaterials(){const host=qs('#productRecipeMaterialRows');if(host)host.innerHTML=state.productRecipeMaterials.length?state.productRecipeMaterials.map(productRecipeMaterialRow).join(''):'<div class="muted">Sin insumos adicionales. Útil para bolsa, packaging, etiqueta u otros consumibles.</div>';updateProductCostEstimate();}
  function selectedRecipeFamily(){const raw=String(qs('#productBaseMaterialFamily')?.value||'');const [type='',...parts]=raw.split('|||');return {type,name:parts.join('|||')};}
  function collectRecipeDesigns(){return qsa('[data-recipe-design-row]').map((r,i)=>{const id=Number(qs('[data-recipe-design-id]',r)?.value)||0,previous=state.productRecipeDesigns[i],kept=Number(previous?.designAssetId)===id?previous:{};return {...kept,designAssetId:id,quantity:Math.max(.01,Number(qs('[data-recipe-design-qty]',r)?.value)||1)}}).filter(x=>x.designAssetId);}

  function collectRecipeMaterials(){return qsa('[data-recipe-material-row]').map(r=>({materialId:Number(qs('[data-recipe-material-id]',r)?.value)||0,quantity:Math.max(.001,Number(qs('[data-recipe-material-qty]',r)?.value)||0)})).filter(x=>x.materialId&&x.quantity>0);}
  function materialMatchForVariant(type,name,variant,fit){const norm=v=>String(v||'').trim().toLowerCase();return state.materials.filter(m=>m.material_type===type&&norm(m.name)===norm(name)&&( !m.color||norm(m.color)===norm(variant.color))&&( !m.size||norm(m.size)===norm(variant.size))&&( !m.fit||norm(m.fit)===norm(fit))).sort((a,b)=>(Boolean(b.color)-Boolean(a.color))+(Boolean(b.size)-Boolean(a.size))+(Boolean(b.fit)-Boolean(a.fit)))[0]||null;}
  function updateProductCostEstimate(){
    const costInput=qs('#productEstimatedCost');if(!costInput)return;
    const family=selectedRecipeFamily(),variants=collectVariantRows(),variant=variants.find(v=>Number(v.stock)>0)||variants[0]||{color:'',size:''},fit=qs('#productForm [name="fit"]')?.value||'',waste=Math.max(0,Number(qs('#productRecipeWaste')?.value)||0),fixedExtra=pesosToCents(qs('#productRecipeExtra')?.value||0);let base=0,print=0,materialsCost=0;const notes=[];
    if(family.name){const m=materialMatchForVariant(family.type,family.name,variant,fit);if(m){base=Number(m.average_cost_cents)||0;notes.push(`${m.name}: ${money(base)}`)}else notes.push(`Falta materia prima compatible: ${family.name}`)}
    for(const row of collectRecipeDesigns()){const d=state.designAssets.find(x=>Number(x.id)===Number(row.designAssetId));if(!d)continue;const type=d.print_material_type||'dtf_textile';if(type==='none')continue;const mat=state.materials.filter(x=>x.material_type===type&&Number(x.stock_qty)>0)[0]||state.materials.find(x=>x.material_type===type);if(!mat){notes.push(`Falta ${type==='dtf_uv'?'DTF UV':'DTF textil'}`);continue}const width=Math.max(1,Number(mat.width_cm)||58),area=(Number(row.widthCm)||Number(d.width_cm)||0)*(Number(row.heightCm)||Number(d.height_cm)||0)*row.quantity;if(!area){notes.push(`${d.name}: faltan medidas`);continue}const meters=(area/(100*width))*(1+waste/100),line=meters*(Number(mat.average_cost_cents)||0);print+=line;notes.push(`${d.name}: ${meters.toFixed(3)} m · ${money(line)}`)}
    for(const row of collectRecipeMaterials()){const m=state.materials.find(x=>Number(x.id)===Number(row.materialId));if(!m)continue;const line=(Number(m.average_cost_cents)||0)*row.quantity;materialsCost+=line;notes.push(`${m.name}: ${row.quantity.toLocaleString('es-AR',{maximumFractionDigits:3})} ${m.unit==='meter'?'m':'u'} · ${money(line)}`)}
    const total=Math.round(base+print+materialsCost+fixedExtra);costInput.value=(total/100).toFixed(0);const out=qs('#productCostBreakdown');if(out)out.innerHTML=`<strong>Costo estimado: ${money(total)}</strong><small>${notes.length?notes.map(escapeHtml).join(' · '):'Elegí materia prima y/o diseños para calcular automáticamente.'}${fixedExtra?` · Otros costos: ${money(fixedExtra)}`:''}</small>`;
  }
  async function openProductDialog(id=null, duplicate=false){
    await Promise.all([ensureCategories(),ensureCostingData()]);
    ensureMediaAdminStyles();
    state.newFiles=[];state.mediaItems=[];state.mediaDragKey=null;state.mediaHostId='mediaOrderList';
    if(id){
      const d=await api(`/api/admin/products/${id}`);
      state.editingProduct=duplicate?{...d.item,id:null,name:`${d.item.name} copia`,slug:'',variants:(d.item.variants||[]).map(v=>({...v,id:null})),images:[]}:d.item;
    }else state.editingProduct=null;
    const isNewProduct=!state.editingProduct;const p=state.editingProduct||{status:'draft',price_cents:null,compare_at_cents:null,cost_cents:null,weight_grams:0,height_cm:0,width_cm:0,depth_cm:0,is_featured:0,is_new:0,is_bestseller:0,fit:'',audience:'',sale_mode:'stock',inventory_stage:'finished',garment_ready:1,print_ready:1,variants:[],images:[]};
    const recipe=p.recipe||{base_material_type:'',base_material_name:'',waste_percent:10,extra_cost_cents:0,designs:[],materials:[]};state.productRecipeDesigns=(recipe.designs||[]).map(x=>({designAssetId:Number(x.design_asset_id??x.designAssetId),quantity:Number(x.quantity)||1,widthCm:Number(x.width_cm??x.widthCm)||0,heightCm:Number(x.height_cm??x.heightCm)||0,measureOptionId:x.measure_option_id??x.measureOptionId??'',measureLabel:x.measure_label??x.measureLabel??''}));state.productRecipeMaterials=(recipe.materials||[]).map(x=>({materialId:Number(x.material_id??x.materialId),quantity:Number(x.quantity)||1}));
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
        <div class="field"><label>Costo estimado</label><input class="input" id="productEstimatedCost" name="cost" type="number" min="0" value="${centsToPesos(p.cost_cents)}" readonly><small class="field-help">Se calcula desde Compras + receta de producción.</small></div>
        <div class="field full"><label>Descripción corta</label><textarea class="textarea" name="short_description">${escapeHtml(p.short_description||'')}</textarea></div>
        <div class="field full"><label>Significado del diseño</label><textarea class="textarea" name="meaning_text">${escapeHtml(p.meaning_text||'')}</textarea></div>
        <div class="field full"><label>Versículo (opcional)</label><textarea class="textarea" name="verse_text" style="min-height:82px">${escapeHtml(p.verse_text||'')}</textarea></div>
        <div class="field full"><label>Cita / referencia del versículo</label><input class="input" name="verse_reference" placeholder="Ej.: Marcos 14:36" value="${escapeHtml(p.verse_reference||'')}"></div>
      </div><div class="toggle-row" style="margin-top:14px"><label class="toggle-label"><input type="checkbox" name="is_new" ${p.is_new?'checked':''}> Novedad</label><label class="toggle-label"><input type="checkbox" name="is_featured" ${p.is_featured?'checked':''}> Destacado</label><label class="toggle-label"><input type="checkbox" name="is_bestseller" ${p.is_bestseller?'checked':''}> Más vendido</label></div></section>
      <section class="form-section"><div class="admin-section-head"><h3 id="variantSectionTitle">${initialVariantMode==='sized'?'Talles y stock':initialVariantMode==='simple'?'Opciones y stock':'Variantes y stock'}</h3><button type="button" class="btn btn-ghost ${initialVariantMode?'':'hidden'}" id="addVariantBtn">${initialVariantMode==='sized'?'+ Agregar talle / variante':'+ Agregar color / variante'}</button></div><p class="field-help variant-section-help" id="variantSectionHelp">${initialVariantMode==='sized'?'Indicá el stock real de cada talle. Usá − y + para ajustar rápido cada cantidad.':initialVariantMode==='simple'?'Este producto no usa talle. Podés cargar un stock general o separar por color.':'Elegí una categoría para configurar el stock.'}</p><div class="variant-builder" id="variantBuilder" data-mode="${initialVariantMode}">${initialVariantMode?initialVariants.map(v=>variantRow(v,initialVariantMode)).join(''):'<div class="variant-empty-note">Elegí una categoría para configurar el stock.</div>'}</div></section>
      <section class="form-section product-recipe-section"><div class="admin-section-head"><div><h3>Receta de costo / producción</h3><p class="field-help">Vinculá materia prima, insumos y diseños. Los costos vienen de Compras y Producción descuenta el stock automáticamente.</p></div><div class="admin-actions"><button type="button" class="btn btn-ghost" id="addRecipeDesignBtn">+ Diseño / estampa</button><button type="button" class="btn btn-ghost" id="addRecipeMaterialBtn">+ Otro insumo</button></div></div><div class="form-grid"><div class="field full"><label>Producto base / materia prima</label><select class="select" id="productBaseMaterialFamily"><option value="">Sin producto base</option>${materialFamilies().map(f=>`<option value="${escapeHtml(recipeFamilyValue(f.type,f.name))}" ${recipeFamilyValue(recipe.base_material_type,recipe.base_material_name)===recipeFamilyValue(f.type,f.name)?'selected':''}>${escapeHtml(materialTypeLabel(f.type))} · ${escapeHtml(f.name)}</option>`).join('')}</select><small class="field-help">Para una remera terminada elegí, por ejemplo, “Remera · Remera clásica”. El color, talle y corte se buscan según la variante.</small></div><div class="field"><label>Extra DTF por desperdicio (%)</label><input class="input" id="productRecipeWaste" type="number" min="0" step=".01" value="${Number(recipe.waste_percent??10)}"></div><div class="field"><label>Otros costos fijos por unidad ($)</label><input class="input" id="productRecipeExtra" type="number" min="0" step="1" value="${centsToPesos(recipe.extra_cost_cents)}"></div></div><div class="recipe-subtitle">Diseños / estampas</div><div class="recipe-design-list" id="productRecipeDesignRows"></div><div class="recipe-subtitle">Otros insumos que se consumen</div><div class="recipe-design-list" id="productRecipeMaterialRows"></div><div class="product-cost-breakdown" id="productCostBreakdown"></div></section>
      <section class="form-section"><h3>Datos para envío</h3><p class="field-help">Cargá el peso y las medidas reales de este producto. Correo Argentino arma el paquete final según las unidades que compre el cliente; no se usa un paquete fijo para todos.</p><div class="form-grid"><div class="field"><label>Peso (g)</label><input class="input" name="weight_grams" type="number" min="0" value="${p.weight_grams||0}"></div><div class="field"><label>Alto (cm)</label><input class="input" name="height_cm" type="number" min="0" step=".1" value="${p.height_cm||0}"></div><div class="field"><label>Ancho (cm)</label><input class="input" name="width_cm" type="number" min="0" step=".1" value="${p.width_cm||0}"></div><div class="field"><label>Largo (cm)</label><input class="input" name="depth_cm" type="number" min="0" step=".1" value="${p.depth_cm||0}"></div></div></section>`;
    renderMediaManager();renderProductRecipeDesigns();renderProductRecipeMaterials();updateProductCostEstimate();
    qs('#productDialog').showModal();
  }
  async function saveProduct(){
    const form=qs('#productForm');const fd=new FormData(form);
    if(!fd.get('name')?.trim()||!fd.get('category_id')) throw new Error('Completá nombre y categoría.');
    const variantMode=productCategoryMode(fd.get('category_id'));
    let variants=collectVariantRows().map(v=>({...v,size:variantMode==='sized'?v.size:''})).filter(v=>v.id||v.color||v.size||v.stock>0);
    if(variantMode==='sized'&&variants.some(v=>!v.size))throw new Error('Completá el talle de cada variante de remera.');
    if(!variants.length)variants=defaultVariantsForMode(variantMode);
    const family=selectedRecipeFamily(),recipe={baseMaterialType:family.type,baseMaterialName:family.name,wastePercent:Math.max(0,Number(qs('#productRecipeWaste')?.value)||0),extraCostCents:pesosToCents(qs('#productRecipeExtra')?.value||0),designs:collectRecipeDesigns(),materials:collectRecipeMaterials()};const payload={name:fd.get('name').trim(),category_id:Number(fd.get('category_id')),status:fd.get('status'),price_cents:pesosToCents(fd.get('price')),compare_at_cents:pesosToCents(fd.get('compare')),cost_cents:pesosToCents(fd.get('cost')),recipe,short_description:fd.get('short_description')||'',meaning_text:fd.get('meaning_text')||'',verse_text:fd.get('verse_text')||'',verse_reference:fd.get('verse_reference')||'',fit:variantMode==='sized'?(fd.get('fit')||''):'',audience:variantMode==='sized'?(fd.get('audience')||''):'',sale_mode:'stock',inventory_stage:fd.get('inventory_stage')||'finished',garment_ready:fd.get('garment_ready')?1:0,print_ready:fd.get('print_ready')?1:0,is_new:fd.get('is_new')?1:0,is_featured:fd.get('is_featured')?1:0,is_bestseller:fd.get('is_bestseller')?1:0,weight_grams:Number(fd.get('weight_grams'))||0,height_cm:Number(fd.get('height_cm'))||0,width_cm:Number(fd.get('width_cm'))||0,depth_cm:Number(fd.get('depth_cm'))||0,variants};
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
  function stockPrepLabel(x){if(Number(x.prepare_qty)>0)return `<span class="status warning">A preparar: ${Number(x.prepare_qty)} u</span>`;if(x.stock_kind==='to_stock'&&Number(x.stock)===0)return '<span class="status warning">A stockear</span>';if(x.inventory_stage==='outlet')return '<span class="status warning">Outlet</span>';if(x.inventory_stage!=='to_print')return '<span class="status success">Terminado</span>';const missing=[];if(!Number(x.garment_ready))missing.push('falta producto base');if(!Number(x.print_ready))missing.push('falta estampa');return `<span class="status warning">En producción</span>${missing.length?`<small class="internal-stock-note">${escapeHtml(missing.join(' · '))}</small>`:'<small class="internal-stock-note">todo disponible</small>'}`}
  function stockRowsHtml(items){return items.length?items.map(x=>`<tr data-stock-row="${x.id}"><td><div class="stock-product">${x.primary_image_url?`<img src="${escapeHtml(x.primary_image_url)}" alt="" loading="lazy">`:""}<strong>${escapeHtml(x.product_name)}</strong></div></td><td>${escapeHtml(x.color||'—')}</td><td>${escapeHtml(x.size||'—')}</td><td>${escapeHtml(x.fit||'—')}</td><td>${escapeHtml(x.audience||'—')}</td><td>${stockPrepLabel(x)}</td><td><select class="select stock-kind-select" data-stock-kind><option value="physical" ${x.stock_kind!=='to_stock'?'selected':''}>Stock físico</option><option value="to_stock" ${x.stock_kind==='to_stock'?'selected':''}>A stockear</option></select></td><td><input class="input small-number" data-stock-value type="number" min="0" value="${Number(x.stock)||0}"></td><td><span class="status ${Number(x.available_stock)<=0?'warning':'success'}">${Number(x.available_stock)||0}</span></td><td><button class="btn btn-ghost" data-save-stock="${x.id}">Guardar</button></td></tr>`).join(''):'<tr><td colspan="10">No hay stock que coincida con esos filtros.</td></tr>'}
  function groupedStockHtml(items){if(!items.length)return '<div class="admin-card"><div class="empty-state"><strong>No hay stock que coincida con esos filtros.</strong></div></div>';const groups=new Map();for(const x of items){const cat=x.category_name||'Sin categoría',stage=x.inventory_stage||'finished',key=`${cat}|||${stage}`;if(!groups.has(key))groups.set(key,{cat,stage,items:[]});groups.get(key).items.push(x)}return [...groups.values()].map(g=>`<section class="inventory-group"><div class="inventory-group-head"><h3>${escapeHtml(g.cat)}</h3><span>${stageTitle(g.stage)} · ${g.items.length}</span></div><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th>Color</th><th>Talle</th><th>Corte</th><th>Género</th><th>Estado del producto</th><th>Tipo de stock</th><th>Stock interno</th><th>Disponible en tienda</th><th></th></tr></thead><tbody>${stockRowsHtml(g.items)}</tbody></table></div></section>`).join('')}
  function renderStockFiltered(){const items=stockFilteredItems();const host=qs('#stockGroupedHost');if(host)host.innerHTML=groupedStockHtml(items);const count=qs('#stockFilteredCount');if(count)count.textContent=`${items.length} variante${items.length===1?'':'s'}`}
  async function renderStock(){
    const [d,md]=await Promise.all([api('/api/admin/stock'),api('/api/admin/materials')]);state.stockItems=(d.items||[]).filter(x=>Number(x.stock)>0||Number(x.prepare_qty)>0||x.stock_kind==='to_stock');state.materials=md.items||[];
    const sizeTotals={};for(const x of state.stockItems){const size=String(x.size||'').trim();if(size)sizeTotals[size]=(sizeTotals[size]||0)+(Number(x.stock)||0)}
    const total=state.stockItems.reduce((sum,x)=>sum+(Number(x.stock)||0),0);
    const sizes=Object.keys(sizeTotals).sort((a,b)=>stockSizeRank(a)-stockSizeRank(b)||a.localeCompare(b,'es',{numeric:true}));
    const f=state.stockFilters;
    const options=(values,current)=>`<option value="">Todos</option>${values.map(v=>`<option value="${escapeHtml(v)}" ${current===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}`;
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div><h2 style="margin:0">Stock</h2><p class="muted" style="margin:4px 0 0">Materia prima viene de Compras. Los productos terminados se suman desde Producción.</p></div></div>
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
      <section class="admin-section raw-material-section inventory-group"><div class="admin-section-head inventory-group-head" role="button" tabindex="0"><div><h2>Materia prima</h2><small class="muted">Stock comprado y costo promedio actual.</small></div><div class="inventory-head-actions"><span class="status">${state.materials.length} materiales</span><span class="inventory-chevron">⌃</span></div></div><div class="inventory-group-body"><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Material</th><th>Corte</th><th>Talle</th><th>Clase</th><th>Género</th><th>Color</th><th>Disponible</th><th>Costo promedio</th></tr></thead><tbody>${state.materials.filter(m=>Number(m.stock_qty)>0).length?state.materials.filter(m=>Number(m.stock_qty)>0).map(m=>`<tr><td><strong>${escapeHtml(m.name)}</strong><small class="table-sub">${escapeHtml(materialTypeLabel(m.material_type))}</small></td><td>${escapeHtml(m.fit||'—')}</td><td>${escapeHtml(m.size||'—')}</td><td>${escapeHtml(m.material_class||'—')}</td><td>${escapeHtml(m.gender||'—')}</td><td>${colorDetail(m.color)}</td><td><strong>${Number(m.stock_qty).toLocaleString('es-AR',{maximumFractionDigits:3})} ${m.unit==='meter'?'m':'u'}</strong></td><td>${money(m.average_cost_cents)} / ${m.unit==='meter'?'m':'u'}</td></tr>`).join(''):'<tr><td colspan="8">Todavía no hay materia prima. Cargala desde Compras.</td></tr>'}</tbody></table></div></div></section><section class="admin-section"><div class="admin-section-head"><h2>Productos terminados / en producción</h2></div><div id="stockGroupedHost"></div></section>`;
    renderStockFiltered();
  }

  function ordersTable(items){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th></tr></thead><tbody>${items.length?items.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td><span class="status">${escapeHtml(o.fulfillment_status)}</span></td><td>${new Date(o.created_at).toLocaleString('es-AR')}</td></tr>`).join(''):`<tr><td colspan="6">Sin órdenes.</td></tr>`}</tbody></table></div>`}

  function correoOrderActions(o){
    if(o.shipping_method!=='correo')return '—';const tracking=String(o.correo_tracking_number||o.tracking_number||'');const status=String(o.correo_last_status||'');
    return `<div class="correo-order-admin"><div>${tracking?`<strong>${escapeHtml(tracking)}</strong>${status?`<small>${escapeHtml(status)}</small>`:''}`:'<span class="muted">Sin preimposición</span>'}</div><div class="admin-actions correo-actions">${!tracking?`<button class="btn btn-primary" data-correo-create="${o.id}">Crear envío</button>`:`<button class="btn btn-ghost" data-correo-label="${o.id}">Rótulo 10×15</button><button class="btn btn-ghost" data-correo-track="${o.id}">Seguimiento</button><button class="btn btn-danger" data-correo-cancel="${o.id}">Cancelar CA</button>`}</div></div>`;
  }
  function viaCargoOrderSummary(o){let data={};try{data=JSON.parse(o.shipping_address_json||'{}').viaCargo||{}}catch{}return `<strong>Vía Cargo</strong><small class="table-sub">Envío a coordinar · pago separado<br>${escapeHtml(data.destination||'')}${data.agency?`<br>${escapeHtml(data.agency)}`:''}</small>`;}
  async function renderOrders(){
    const d=await api('/api/admin/orders');state.orders=d.items||[];
    qs('#adminContent').innerHTML=`<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th><th>Estado</th><th>Correo Argentino</th><th></th></tr></thead><tbody>${state.orders.length?state.orders.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td>${o.shipping_method==='via_cargo'?viaCargoOrderSummary(o):escapeHtml(o.shipping_method||'')}</td><td>${new Date(o.created_at).toLocaleString('es-AR')}</td><td><select class="select order-status-select" data-order-id="${o.id}" style="min-width:145px"><option value="new" ${o.fulfillment_status==='new'?'selected':''}>Nuevo</option><option value="preparing" ${o.fulfillment_status==='preparing'?'selected':''}>Preparando</option><option value="ready" ${o.fulfillment_status==='ready'?'selected':''}>Listo</option><option value="on_the_way" ${o.fulfillment_status==='on_the_way'?'selected':''}>En camino</option><option value="delivered" ${o.fulfillment_status==='delivered'?'selected':''}>Entregado</option><option value="cancelled" ${o.fulfillment_status==='cancelled'?'selected':''}>Cancelado</option></select></td><td>${correoOrderActions(o)}</td><td>${o.fulfillment_status==='cancelled'&&o.payment_status!=='paid'?`<button class="btn btn-danger" data-delete-order="${o.id}">Borrar prueba</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="9">Sin órdenes.</td></tr>'}</tbody></table></div><div class="admin-section"><div class="notice"><strong>Correo Argentino:</strong> el botón “Crear envío” genera la preimposición y guarda el Tracking Number. En TEST podés usarlo para validar el flujo. El rótulo se descarga en PDF 10×15.</div><div class="notice">Las órdenes canceladas de prueba que no estén pagadas se pueden borrar. Una orden pagada no se elimina desde acá.</div></div>`;
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

  function purchaseDefaultItem(type='shirt'){
    const defaultCapacity=type==='mug'?330:(type==='glass'||type==='thermos'?500:0);
    return {materialType:type,customTypeLabel:'',name:type==='dtf_textile'?'DTF textil':type==='dtf_uv'?'DTF UV':'',quantity:1,color:'',size:'',fit:'',materialClass:materialIsGarment(type)?'ADULTOS':'',gender:materialIsGarment(type)?'Unisex':'',capacityMl:defaultCapacity,widthCm:materialIsDtf(type)?58:0,unitPricePesos:type==='dtf_textile'?10000:type==='dtf_uv'?20000:'',_custom:{}};
  }
  function currentPurchaseTypes(){
    const fixed=[...MATERIAL_TYPES];
    for(const x of customTypeEntries())if(!fixed.some(([v])=>v===x.code))fixed.push([x.code,x.label]);
    return fixed;
  }
  function purchaseHistoricalValues(field,filter=()=>true){return state.materials.filter(filter).map(m=>String(m?.[field]||'').trim()).filter(Boolean)}
  function mergePurchaseOptions(base=[],extra=[]){const out=[],seen=new Set();for(const raw of [...base,...extra]){const v=normalizeOption(raw),k=v.toLocaleLowerCase('es');if(v&&!seen.has(k)){seen.add(k);out.push(v)}}return out}
  function purchaseFitOptions(){return mergePurchaseOptions(PURCHASE_BASIC_FITS,[...(state.purchaseOptions.fits||[]),...purchaseHistoricalValues('fit')])}
  function normalizePurchaseClass(value){const k=normalizeOption(value).toUpperCase();return k==='ADULTO'?'ADULTOS':k==='NIÑO'?'NIÑOS':k;}
  function purchaseClassOptions(){return mergePurchaseOptions(PURCHASE_CLASSES,(state.purchaseOptions.classes||[]).filter(v=>!['ADULTO','NIÑO'].includes(normalizeOption(v).toUpperCase())))}
  function purchaseSizeOptions(item){
    const klass=normalizePurchaseClass(item.materialClass);
    const base=PURCHASE_SIZES_BY_CLASS[klass]||[];
    const custom=Array.isArray(state.purchaseOptions.sizes?.[klass])?state.purchaseOptions.sizes[klass]:[];
    if(PURCHASE_SIZES_BY_CLASS[klass])return [...base,...custom.filter(v=>!base.includes(v))];
    const historical=purchaseHistoricalValues('size',m=>normalizePurchaseClass(m.material_class)===klass);
    return uniqOptions([...custom,...historical]);
  }
  function itemFeatures(item={}) {
    let list=item.features;try{if(!Array.isArray(list))list=JSON.parse(item.features_json||'[]')}catch{}
    return uniqOptions(Array.isArray(list)&&list.length?list:[item.name||item.material_name||'']);
  }
  function purchaseMaterialOptions(type){
    if(Array.isArray(state.purchaseOptions.featureCatalog?.[type]))return state.purchaseOptions.featureCatalog[type];
    return mergePurchaseOptions(PURCHASE_BASIC_MATERIALS[type]||[],[...(state.purchaseOptions.materials?.[type]||[]),...state.materials.filter(m=>m.material_type===type).flatMap(itemFeatures)]);
  }
  function purchaseFeaturesField(item,i){
    const selected=itemFeatures(item),options=uniqOptions([...purchaseMaterialOptions(item.materialType),...selected]);
    return `<div class="field purchase-features"><label>Materiales y características</label><details class="purchase-features-list"><summary>${selected.length?`${selected.length} seleccionada${selected.length===1?'':'s'} · `:''}Elegir características</summary><div class="feature-options">${options.map(v=>`<label><input type="checkbox" data-purchase-feature value="${escapeHtml(v)}" ${selected.includes(v)?'checked':''}><span>${escapeHtml(v)}</span></label>`).join('')||'<small>Agregá una característica.</small>'}</div></details><button type="button" class="link-action" data-manage-features="${i}">Agregar, editar o eliminar características</button></div>`;
  }
  function updatePurchaseFeatureSummary(row,features=[]){const summary=qs('.purchase-features-list>summary',row);if(summary)summary.textContent=`${features.length?`${features.length} seleccionada${features.length===1?'':'s'} · `:''}Elegir características`;}
  function openFeatureManager(row){
    qsa('[data-purchase-row]').forEach(syncPurchaseRowFromDom);
    const item=state.purchaseItems[row];state.featureManager={row,type:item.materialType,original:purchaseMaterialOptions(item.materialType)};
    let d=qs('#featureManagerDialog');if(!d){d=document.createElement('dialog');d.id='featureManagerDialog';d.className='admin-dialog small';document.body.appendChild(d)}
    d.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><h2>Características · ${escapeHtml(materialTypeLabel(item.materialType))}</h2></div><div class="dialog-body"><p>Podés cambiar los nombres o quitar opciones. Las compras anteriores conservan su detalle.</p><div data-feature-manager-rows>${state.featureManager.original.map((v,i)=>featureManagerRow(v,i)).join('')}</div><button type="button" class="btn btn-ghost" data-feature-add>+ Agregar característica</button></div><div class="dialog-foot"><button type="button" class="btn btn-ghost" data-feature-close>Cancelar</button><button type="button" class="btn btn-primary" data-feature-save>Guardar</button></div></div>`;d.showModal();
  }
  function featureManagerRow(value='',index=-1){return `<div class="feature-manager-row"><input class="input" data-feature-value data-original-index="${index}" value="${escapeHtml(value)}" placeholder="Nueva característica" maxlength="120"><button type="button" class="icon-btn" data-feature-remove aria-label="Quitar característica">×</button></div>`}
  async function saveFeatureManager(button){
    const draft=state.featureManager,inputs=qsa('[data-feature-value]',qs('#featureManagerDialog')),catalog=uniqOptions(inputs.map(x=>x.value));
    const previous=state.purchaseOptions.featureCatalog;state.purchaseOptions.featureCatalog={...previous,[draft.type]:catalog};button.disabled=true;
    try{await persistAdminOptionSettings();for(const item of state.purchaseItems.filter(x=>x.materialType===draft.type)){item.features=itemFeatures(item).map(v=>{const i=draft.original.indexOf(v);return i<0?v:normalizeOption(inputs.find(x=>Number(x.dataset.originalIndex)===i)?.value)}).filter(Boolean);item.name=item.features.join(' · ')}qs('#featureManagerDialog').close();renderPurchaseItems();toast('Características guardadas','success')}catch(e){state.purchaseOptions.featureCatalog=previous;toast(e.message,'error')}finally{button.disabled=false}
  }
  function purchaseColorOptions(){return mergePurchaseOptions(PURCHASE_BASIC_COLORS,[...(state.purchaseOptions.colors||[]),...purchaseHistoricalValues('color')])}
  function purchaseChoiceField(item,field,label,options,placeholder='Escribí una opción'){
    const value=normalizeOption(item[field]),known=options.some(v=>v.toLocaleLowerCase('es')===value.toLocaleLowerCase('es'));
    const shown=value||'';
    return `<div class="field purchase-choice-field purchase-${field}"><label>${escapeHtml(label)}</label><select class="select purchase-choice-select" data-purchase-choice="${field}"><option value="">Elegir...</option>${options.map(v=>`<option value="${escapeHtml(v)}" ${shown===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}${shown&&!known?`<option value="${escapeHtml(shown)}" selected>${escapeHtml(shown)}</option>`:''}<option value="__other__">＋ Otro...</option></select></div>`;
  }
  function colorDetail(name){return name?`<span class="material-color"><span class="color-dot" style="--swatch:${escapeHtml(colorSwatch(name))}"></span>${escapeHtml(name)}</span>`:'—'}
  function colorSwatch(name){
    if(PURCHASE_COLOR_HEX[name])return PURCHASE_COLOR_HEX[name];
    let h=0;for(const c of String(name||''))h=(h*31+c.charCodeAt(0))%360;
    return `hsl(${h} 58% 58%)`;
  }
  function purchaseColorField(item,i){
    const value=normalizeOption(item.color),label=value||'Elegí un color';
    return `<div class="field purchase-color-field"><label>Color</label><button class="purchase-color-trigger" type="button" data-open-purchase-color="${i}"><span class="color-dot" style="--swatch:${escapeHtml(colorSwatch(value||'Rosa'))}"></span><span>${escapeHtml(label)}</span><b>⌄</b></button></div>`;
  }
  function purchaseTypeField(item,i){
    const type=item.materialType||'shirt',opts=currentPurchaseTypes(),isKnown=opts.some(([v])=>v===type);
    return `<div class="field purchase-type-field"><label>Tipo</label><select class="select" data-purchase-type-select data-row="${i}">${opts.map(([v,l])=>`<option value="${v}" ${type===v?'selected':''}>${escapeHtml(l)}</option>`).join('')}${!isKnown&&type!=='__other__'?`<option value="${escapeHtml(type)}" selected>${escapeHtml(materialTypeLabel(type))}</option>`:''}<option value="__other__">＋ Otro...</option></select></div>`;
  }
  function purchaseImageField(item,i){
    if(materialIsDtf(item.materialType))return '';
    const type=item.materialType||'shirt',assets=state.mockupAssets.filter(a=>a.asset_type==='base'&&a.product_type===type),selected=assets.find(a=>Number(a.id)===Number(item.imageAssetId));
    const options=assets.map(a=>`<option value="${a.id}" ${Number(a.id)===Number(item.imageAssetId)?'selected':''}>${escapeHtml([a.model_name,a.garment_style,a.color,a.pose==='back'?'Espalda':a.pose==='side'?'Perfil':'Frente',a.name].filter(Boolean).join(' · '))}</option>`).join('');
    return `<div class="field purchase-image-choice"><label>Foto que representa esta materia prima</label><div class="purchase-image-choice-row">${selected?`<img src="${mockupAssetUrl(selected)}" alt="Foto representativa" loading="lazy">`:'<span class="purchase-image-placeholder">Sin foto</span>'}<select class="select" data-purchase-image="${i}"><option value="">Sin asociar</option>${options}</select><button class="btn btn-ghost" type="button" data-upload-material-image="${i}">+ Subir foto</button></div><small class="field-help">Elegí el modelo, pose y color que identifiquen esta variante. Se verá como miniatura en Producción.</small></div>`;
  }
  function purchaseItemRow(x={},i=0){
    const type=x.materialType||'shirt',resolvedType=type==='__other__'?'other':type,garment=materialIsGarment(resolvedType),color=materialUsesColor(resolvedType),dtf=materialIsDtf(resolvedType),qty=Math.max(dtf?.01:1,Number(x.quantity)||1);
    const fitField=garment?purchaseChoiceField(x,'fit','Corte',purchaseFitOptions(),'Nuevo corte'):'';
    const classField=garment?purchaseChoiceField(x,'materialClass','Clase',purchaseClassOptions(),'Nueva clase'):'';
    const sizeField=garment?purchaseChoiceField(x,'size','Talle',purchaseSizeOptions(x),'Nuevo talle'):'';
    const genderField=garment?`<div class="field purchase-gender"><label>Género</label><select class="select" data-purchase-choice="gender">${PURCHASE_GENDERS.map(v=>`<option value="${v}" ${(x.gender||'Unisex')===v?'selected':''}>${v}</option>`).join('')}</select></div>`:'';
    const colorField=color?purchaseColorField(x,i):'';
    const materialOptions=purchaseMaterialOptions(resolvedType);
    const materialField=purchaseFeaturesField(x,i);
    const capacityField=purchaseCapacityField(x,resolvedType);
    return `<div class="purchase-item-row ${garment?'is-garment':''} ${dtf?'is-dtf':''}" data-purchase-row="${i}">
      ${purchaseTypeField(x,i)}
      ${fitField}${classField}${sizeField}${genderField}${colorField}
      ${materialField}${capacityField}${purchaseImageField(x,i)}
      ${dtf?`<div class="field purchase-width"><label>Ancho del rollo (cm)</label><input class="input" data-purchase-field="widthCm" type="number" min="1" step=".1" value="${Number(x.widthCm)||58}"></div>`:''}
      <div class="field purchase-quantity"><label>${dtf?'Metros':'Cantidad'}</label><div class="purchase-stepper"><button type="button" data-purchase-step="-1" data-row="${i}">−</button><input class="input" data-purchase-field="quantity" type="number" min="${dtf?'.01':'1'}" step="${dtf?'.1':'1'}" value="${qty}"><button type="button" data-purchase-step="1" data-row="${i}">+</button></div></div>
      <div class="field purchase-price"><label>Precio por ${dtf?'metro':'unidad'} ($)</label><input class="input" data-purchase-field="unitPricePesos" type="number" min="0" step=".01" value="${escapeHtml(x.unitPricePesos??'')}" placeholder="Precio"><small class="purchase-line-total" data-purchase-line-total="${i}">Total: ${money(purchaseLineCents(x))}</small></div>
      <div class="purchase-row-actions"><button type="button" class="icon-btn" data-duplicate-purchase-item="${i}" aria-label="Duplicar" title="Duplicar">⧉</button><button type="button" class="icon-btn purchase-remove" data-remove-purchase-item="${i}" aria-label="Quitar" title="Quitar">×</button></div>
    </div>`;
  }
  function surchargeData(prefix,baseCents){
    const type=qs(`#${prefix}SurchargeType`)?.value==='percent'?'percent':'fixed',value=Number(qs(`#${prefix}Surcharge`)?.value||0);
    const valid=Number.isFinite(value)&&value>=0;
    const surcharge=valid?Math.round(type==='percent'?baseCents*value/100:value*100):0;
    return {type,value,surcharge,total:baseCents+surcharge,valid};
  }
  function renderSurchargeHelp(prefix,data){const el=qs(`#${prefix}SurchargeHelp`);if(el)el.textContent=data.type==='percent'?`${data.value||0}% sobre el importe base · ${money(data.surcharge)}`:`Importe fijo: ${money(data.surcharge)}`;}
  function paymentSplit(prefix,total){
    const method=qs(`#${prefix}PaymentMethod`)?.value||'cash';
    const cash=method==='transfer'?0:method==='cash'?total:pesosToCents(qs(`#${prefix}CashAmount`)?.value);
    const transfer=method==='cash'?0:method==='transfer'?total:pesosToCents(qs(`#${prefix}TransferAmount`)?.value);
    if(cash<0||transfer<0||cash+transfer!==total)throw new Error(`Efectivo + transferencia debe sumar ${money(total)}.`);
    const origin=String(qs(`#${prefix}TransferOrigin`)?.value||'').trim(),destination=String(qs(`#${prefix}TransferDestination`)?.value||'').trim();
    const payments=[];
    if(cash>0)payments.push({method:'cash',amountCents:cash,origin:'Efectivo',destination:''});
    if(transfer>0)payments.push({method:'transfer',amountCents:transfer,origin,destination,reference:String(qs(`#${prefix}TransferReference`)?.value||'').trim(),details:String(qs(`#${prefix}TransferDetails`)?.value||'').trim()});
    return {method,payments};
  }
  function updateMovementPayment(){
    const form=qs('#movementForm'),method=qs('#movementPaymentMethod').value,base=pesosToCents(form.elements.amount.value),charge=surchargeData('movement',base);
    qs('#movementTotal').textContent=money(charge.total);qs('#movementTotalLabel').textContent=form.elements.type.value==='income'?'Total del ingreso':'Total del egreso';renderSurchargeHelp('movement',charge);
    qsa('.movement-cash-field',form).forEach(x=>x.classList.toggle('hidden',method==='transfer'));
    qsa('.movement-transfer-field',form).forEach(x=>x.classList.toggle('hidden',method==='cash'));
    if(method==='cash')qs('#movementCashAmount').value=centsToPesos(charge.total);
    if(method==='transfer')qs('#movementTransferAmount').value=centsToPesos(charge.total);
    qs('#movementCashAmount').readOnly=method!=='mixed';qs('#movementTransferAmount').readOnly=method!=='mixed';
    qs('#movementPaymentHelp').textContent=method==='mixed'?'Efectivo + transferencia debe coincidir con el total.':'El total incluye el recargo indicado.';
  }
  async function loadMovementSale(m={}){
    const data=await api('/api/admin/stock');state.saleVariants=data.items||[];state.movementSaleItems=(m.saleItems||[]).map(x=>({variantId:Number(x.variantId??x.variant_id),quantity:Number(x.quantity),unitPriceCents:Number(x.unitPriceCents??x.unit_price_cents),name:x.product_name||x.name,label:x.variant_label||x.label}));
    qs('#movementSaleEnabled').checked=state.movementSaleItems.length>0;state.movementRequestKey=crypto.randomUUID();renderMovementSales();
  }
  function renderMovementSales(){
    const income=qs('#movementType').value==='income',enabled=qs('#movementSaleEnabled').checked&&income;qs('#movementSaleSection').classList.toggle('hidden',!income);qs('#movementSaleDetails').classList.toggle('hidden',!enabled);qs('#movementAmount').readOnly=enabled;
    qs('#movementSaleRows').innerHTML=(state.movementSaleItems||[]).map((item,i)=>{const selected=(state.saleVariants||[]).find(x=>Number(x.id)===Number(item.variantId)),options=(state.saleVariants||[]).map(x=>`<option value="${x.id}" ${Number(x.id)===Number(item.variantId)?'selected':''}>${escapeHtml([x.product_name,x.color,x.size].filter(Boolean).join(' · '))}</option>`).join('');return `<div class="movement-sale-row" data-sale-row="${i}">${selected?.primary_image_url?`<img src="${escapeHtml(selected.primary_image_url)}" alt="" class="design-small-image">`:'<span></span>'}<label class="field">Producto / variante<select class="select" data-sale-field="variantId"><option value="">Elegir producto...</option>${options}${!selected&&item.variantId?`<option value="${item.variantId}" selected>${escapeHtml(item.name||'Producto')} · ${escapeHtml(item.label||'')}</option>`:''}</select></label><label class="field">Cantidad<input class="input" type="number" min="1" step="1" data-sale-field="quantity" value="${item.quantity||1}"></label><label class="field">Precio por unidad ($)<input class="input" type="number" min="0" step=".01" data-sale-field="price" value="${(Number(item.unitPriceCents)||0)/100}"></label><button type="button" class="icon-btn" data-remove-sale="${i}" aria-label="Quitar producto">×</button><small class="field-help">${selected?`Stock interno: ${selected.stock_kind==='to_stock'?0:Number(selected.stock)||0} · ${(Number(item.quantity)||0)>(selected.stock_kind==='to_stock'?0:Number(selected.stock)||0)?'Hay unidades a preparar':'Disponible'}`:''}</small></div>`}).join('');
    if(enabled)updateMovementSaleTotal();
    if(state.movementReadOnly)qsa('input,select,button',qs('#movementSaleSection')).forEach(x=>x.disabled=true);
  }
  function movementSalePayload(){if(!qs('#movementSaleEnabled').checked||qs('#movementType').value!=='income')return [];return (state.movementSaleItems||[]).map(x=>({variantId:Number(x.variantId),quantity:Number(x.quantity),unitPriceCents:Number(x.unitPriceCents)}))}
  function updateMovementSaleTotal(){if(!qs('#movementSaleEnabled').checked||qs('#movementType').value!=='income')return;const items=movementSalePayload();qs('#movementAmount').value=centsToPesos(items.reduce((sum,x)=>sum+x.quantity*x.unitPriceCents,0));const detail=qs('#movementForm').elements.description;if(!detail.value)detail.value='Venta de productos';updateMovementPayment();}
  function movementPayload(){
    const f=new FormData(qs('#movementForm')),base=pesosToCents(f.get('amount')),charge=surchargeData('movement',base),split=paymentSplit('movement',charge.total);
    if(base<=0||!charge.valid)throw new Error('Ingresá un importe base mayor a cero y un recargo válido.');
    if(!String(f.get('category')||'').trim()||!String(f.get('description')||'').trim())throw new Error('Completá motivo y detalle.');
    const saleItems=movementSalePayload();if(qs('#movementSaleEnabled').checked&&f.get('type')==='income'&&!saleItems.length)throw new Error('Agregá el producto vendido.');
    return {requestKey:state.movementRequestKey,saleItems,type:f.get('type'),category:f.get('category'),description:f.get('description'),origin:f.get('origin'),destination:f.get('destination'),base_cents:base,amount_cents:charge.total,surchargeType:charge.type,surchargeValue:charge.value,payment_method:split.method,payments:split.payments,occurred_at:new Date(`${f.get('date')}T12:00:00-03:00`).toISOString()};
  }
  function loadMovementPayment(m={}){
    const form=qs('#movementForm');let payments=Array.isArray(m.payments)?m.payments:[];
    if(!payments.length){try{payments=JSON.parse(m.payment_json||'[]')}catch{}}
    const method=m.payment_method||payments[0]?.method||'cash',tp=payments.find(p=>p.method==='transfer');
    qs('#movementPaymentMethod').value=method;form.elements.amount.value=centsToPesos(m.base_cents??m.amount_cents??0);
    qs('#movementSurchargeType').value=m.surcharge_type||'fixed';qs('#movementSurcharge').value=(m.surcharge_value??((Number(m.surcharge_cents)||0)/100))||'';
    for(const [part,label] of [['cash','Cash'],['transfer','Transfer']])qs(`#movement${label}Amount`).value=centsToPesos(payments.filter(p=>p.method===part).reduce((sum,p)=>sum+Number(p.amountCents??p.amount_cents??0),0));
    qs('#movementTransferOrigin').value=tp?.origin||m.transfer_origin||((method==='transfer')?m.origin:'')||'';qs('#movementTransferDestination').value=tp?.destination||m.transfer_destination||((method==='transfer')?m.destination:'')||'';
    qs('#movementTransferReference').value=tp?.reference||m.transfer_reference||'';qs('#movementTransferDetails').value=tp?.details||m.transfer_details||'';updateMovementPayment();
  }

  function purchaseLineCents(x){return Math.round((Number(x.quantity)||0)*pesosToCents(x.unitPricePesos));}
  function purchaseSubtotalCents(){return state.purchaseItems.reduce((sum,x)=>sum+purchaseLineCents(x),0);}
  function updatePurchasePaymentVisibility(){
    const method=qs('#purchasePaymentMethod')?.value||'cash';
    qsa('.payment-cash-field',qs('#purchaseForm')).forEach(x=>x.classList.toggle('hidden',method==='transfer'));
    qsa('.payment-transfer-field',qs('#purchaseForm')).forEach(x=>x.classList.toggle('hidden',method==='cash'));
    const breakdown=qs('#purchasePaidBreakdown');if(breakdown)breakdown.dataset.method=method;
    const subtotal=purchaseSubtotalCents(),surcharge=surchargeData('purchase',subtotal).surcharge,grand=subtotal+surcharge,cash=qs('#purchaseCashAmount'),transfer=qs('#purchaseTransferAmount');
    if(method==='cash'&&cash)cash.value=centsToPesos(grand);
    if(method==='transfer'&&transfer)transfer.value=centsToPesos(grand);
    if(cash)cash.readOnly=method!=='mixed';if(transfer)transfer.readOnly=method!=='mixed';renderSurchargeHelp('purchase',surchargeData('purchase',subtotal));
    const help=qs('#purchasePaymentHelp');
    if(help)help.textContent=method==='mixed'
      ?'Efectivo + transferencia debe coincidir con el total. Al guardar la compra, el pago se registra automáticamente en Caja.'
      :'Al guardar la compra, el pago se registra automáticamente en Caja.';
  }
  function updatePurchaseTotal(){qsa('[data-purchase-line-total]').forEach(el=>{const item=state.purchaseItems[Number(el.dataset.purchaseLineTotal)];if(item)el.textContent=`Total: ${money(purchaseLineCents(item))}`;});const subtotal=purchaseSubtotalCents(),surcharge=surchargeData('purchase',subtotal).surcharge,grand=subtotal+surcharge;const a=qs('#purchaseSubtotal'),b=qs('#purchaseTotal');if(a)a.textContent=money(subtotal);if(b)b.textContent=money(grand);updatePurchasePaymentVisibility();}
  function renderPurchaseItems(){const host=qs('#purchaseItems');if(!host)return;host.innerHTML=`<datalist id="purchaseAccountOptions"><option value="Mercado Pago"><option value="Banco"><option value="Caja SALMOS"></datalist>${state.purchaseItems.map(purchaseItemRow).join('')}`;updatePurchaseTotal();}
  function syncPurchaseRowFromDom(row){const i=Number(row.dataset.purchaseRow),x=state.purchaseItems[i];if(!x)return;qsa('[data-purchase-field]',row).forEach(el=>{const k=el.dataset.purchaseField;x[k]=['quantity','capacityMl','widthCm','unitPricePesos'].includes(k)?Number(el.value)||0:el.value});}
  function addPurchaseOption(bucket,value,subkey=''){
    value=normalizeOption(value);if(!value)return;
    if(subkey){state.purchaseOptions[bucket]??={};state.purchaseOptions[bucket][subkey]??=[];state.purchaseOptions[bucket][subkey]=uniqOptions([...state.purchaseOptions[bucket][subkey],value]);}
    else {state.purchaseOptions[bucket]??=[];state.purchaseOptions[bucket]=uniqOptions([...state.purchaseOptions[bucket],value]);}
  }
  function collectPurchaseCustomOptions(){
    for(const x of state.purchaseItems){
      const type=x.materialType;
      if(type&&type!=='__other__'&&!MATERIAL_TYPES.some(([v])=>v===type)&&!customTypeEntries().some(t=>t.code===type))state.purchaseOptions.types.push({code:type,label:materialTypeLabel(type)});
      if(x.fit&&!PURCHASE_BASIC_FITS.includes(x.fit))addPurchaseOption('fits',x.fit);
      if(x.materialClass&&!PURCHASE_CLASSES.includes(x.materialClass))addPurchaseOption('classes',x.materialClass);
      const klass=normalizePurchaseClass(x.materialClass);if(x.size&&!(PURCHASE_SIZES_BY_CLASS[klass]||[]).includes(x.size))addPurchaseOption('sizes',x.size,klass||'OTROS');
      if(x.color&&!PURCHASE_BASIC_COLORS.includes(x.color))addPurchaseOption('colors',x.color);
      for(const feature of itemFeatures(x))addPurchaseOption('materials',feature,type);
    }
    const seen=new Set();state.purchaseOptions.types=(state.purchaseOptions.types||[]).filter(x=>x?.code&&x?.label&&!seen.has(x.code)&&(seen.add(x.code),true));
  }
  async function openPurchaseDialog(purchase=null){await Promise.all([ensureCostingData(true),loadMockupAssets()]);state.editingPurchaseId=purchase?Number(purchase.id):null;const f=qs('#purchaseForm');f.reset();const title=qs('#purchaseDialogTitle');if(title)title.textContent=purchase?`Editar compra #${purchase.id}`:'Nueva compra';if(purchase){state.purchaseItems=(purchase.items||[]).map(i=>({materialType:i.material_type,name:i.material_name,features:itemFeatures(i),quantity:Number(i.quantity)||1,color:i.color||'',size:i.size||'',fit:i.fit||'',materialClass:i.material_class||'',gender:i.gender||'Unisex',capacityMl:Number(i.capacity_ml)||0,widthCm:Number(i.width_cm)||0,unitPricePesos:(Number(i.unit_price_cents)||0)/100,imageAssetId:Number(state.mockupAssets.find(a=>Number(a.material_id)===Number(i.material_id))?.id)||null,_imageTouched:false,_custom:{}}));f.elements.date.value=String(purchase.occurred_at||'').slice(0,10);f.elements.supplier.value=purchase.supplier||'';f.elements.reference.value=purchase.reference||'';f.elements.notes.value=purchase.notes||'';qs('#purchaseSurchargeType').value=purchase.surcharge_type||'fixed';qs('#purchaseSurcharge').value=purchase.surcharge_value??((Number(purchase.surcharge_cents)||0)/100);const pays=purchase.payments||[],cash=pays.filter(p=>p.method!=='transfer').reduce((s,p)=>s+Number(p.amount_cents??p.amountCents??0),0),tr=pays.filter(p=>p.method==='transfer').reduce((s,p)=>s+Number(p.amount_cents??p.amountCents??0),0);qs('#purchasePaymentMethod').value=cash&&tr?'mixed':tr?'transfer':'cash';qs('#purchaseCashAmount').value=cash/100||'';qs('#purchaseTransferAmount').value=tr/100||'';const tp=pays.find(p=>p.method==='transfer');qs('#purchaseTransferOrigin').value=tp?.origin||'';qs('#purchaseTransferDestination').value=tp?.destination||'';qs('#purchaseTransferReference').value=tp?.reference||'';qs('#purchaseTransferDetails').value=tp?.details||'';}else{state.purchaseItems=[purchaseDefaultItem('shirt')];f.elements.date.value=today();qs('#purchasePaymentMethod').value='cash';qs('#purchaseSurcharge').value='';}renderPurchaseItems();qs('#purchaseDialog')?.showModal();}
  async function savePurchase(){
    const form=qs('#purchaseForm');qsa('[data-purchase-row]',form).forEach(syncPurchaseRowFromDom);const fd=new FormData(form);
    for(const x of state.purchaseItems){if(x.materialType==='__other__'){const label=normalizeOption(x.customTypeLabel);if(!label)throw new Error('Escribí el nombre del nuevo tipo.');const code=safeCustomTypeCode(label);x.materialType=code;if(!customTypeEntries().some(t=>t.code===code))state.purchaseOptions.types.push({code,label});}}
    const items=state.purchaseItems.map(x=>({materialType:x.materialType,name:itemFeatures(x).join(' · '),features:itemFeatures(x),quantity:Number(x.quantity)||0,color:String(x.color||'').trim(),size:String(x.size||'').trim(),fit:String(x.fit||'').trim(),materialClass:String(x.materialClass||'').trim(),gender:String(x.gender||'').trim(),capacityMl:Number(x.capacityMl)||0,widthCm:Number(x.widthCm)||0,unit:materialIsDtf(x.materialType)?'meter':'unit',unitPriceCents:pesosToCents(x.unitPricePesos),...(x._imageTouched?{imageAssetId:Number(x.imageAssetId)||null}:{})}));if(!items.length)throw new Error('Agregá al menos un producto o material.');for(const [i,item] of items.entries()){if(!item.name)throw new Error(`Elegí el material del renglón ${i+1}.`);if(!Number.isFinite(item.quantity)||item.quantity<=0)throw new Error(`Revisá la cantidad del renglón ${i+1}.`);if(!Number.isSafeInteger(item.unitPriceCents)||item.unitPriceCents<=0)throw new Error(`Ingresá un precio mayor a cero en el renglón ${i+1}.`);}
    const subtotal=purchaseSubtotalCents(),charge=surchargeData('purchase',subtotal),surcharge=charge.surcharge,grand=charge.total;
    if(!charge.valid)throw new Error('Ingresá un recargo válido, mayor o igual a cero.');
    const {payments}=paymentSplit('purchase',grand);for(const payment of payments)if(payment.method==='cash')payment.destination=String(fd.get('supplier')||'').trim();
    const purchaseUrl=state.editingPurchaseId?`/api/admin/purchases/${state.editingPurchaseId}`:'/api/admin/purchases';const saved=await api(purchaseUrl,{method:state.editingPurchaseId?'PUT':'POST',body:JSON.stringify({supplier:fd.get('supplier'),reference:fd.get('reference'),notes:fd.get('notes'),surchargeCents:surcharge,surchargeType:charge.type,surchargeValue:charge.value,payments,occurredAt:new Date(`${fd.get('date')}T12:00:00-03:00`).toISOString(),items})});collectPurchaseCustomOptions();try{await persistAdminOptionSettings()}catch{}const files=[...(form.elements.attachments?.files||[])];if(saved?.item?.financeMovementId&&files.length){const up=new FormData();files.forEach(file=>up.append('files',file));await api(`/api/admin/finance/${saved.item.financeMovementId}/attachments`,{method:'POST',body:up});}state.costingLoaded=false;state.mockupAssetsLoaded=false;return saved.item;
  }
  async function renderPurchases(){const r=reportRangeDates(),[d,m]=await Promise.all([api(`/api/admin/purchases?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`),api('/api/admin/materials')]);state.purchases=d.items||[];state.materials=m.items||[];const total=state.purchases.reduce((sum,x)=>sum+(Number(x.total_cents)||0),0);qs('#adminContent').innerHTML=`<div class="admin-section-head"><div><h2 style="margin:0">Compras</h2><p class="muted" style="margin:4px 0 0">Único lugar para ingresar materia prima. Actualiza Stock y genera los pagos en Caja automáticamente.</p></div><button class="btn btn-primary" id="newPurchaseBtn">+ Nueva compra</button></div><div class="kpi-grid"><div class="kpi"><small>Compras del período</small><strong>${state.purchases.length}</strong></div><div class="kpi"><small>Total invertido</small><strong>${money(total)}</strong></div><div class="kpi"><small>Materiales distintos</small><strong>${state.materials.length}</strong></div></div><section class="admin-section"><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Compra</th><th>Proveedor</th><th>Detalle</th><th>Pago</th><th>Total</th><th></th></tr></thead><tbody>${state.purchases.length?state.purchases.map(x=>`<tr><td>${new Date(x.occurred_at).toLocaleDateString('es-AR')}</td><td><strong>Compra #${Number(x.id)}</strong>${x.reference?`<small class="table-sub">${escapeHtml(x.reference)}</small>`:''}</td><td>${escapeHtml(x.supplier||'—')}</td><td><details class="purchase-row-detail"><summary><span class="detail-closed">Descomprimir detalle (${(x.items||[]).length})</span><span class="detail-open">Comprimir detalle</span></summary><div>${(x.items||[]).map(i=>`${escapeHtml(i.material_name)}${i.fit?` · ${escapeHtml(i.fit)}`:''}${i.size?` · ${escapeHtml(i.size)}`:''}${i.material_class?` · ${escapeHtml(i.material_class)}`:''}${i.gender?` · ${escapeHtml(i.gender)}`:''}${i.color?` · ${escapeHtml(i.color)}`:''}${Number(i.capacity_ml)>0?` · ${Number(i.capacity_ml)} ml`:''} × ${Number(i.quantity).toLocaleString('es-AR',{maximumFractionDigits:2})}${i.unit==='meter'?' m':''}`).join('<br>')}</div></details></td><td>${(x.payments||[]).map(p=>`${p.method==='transfer'?'Transferencia':'Efectivo'} ${money(p.amount_cents)}`).join('<br>')||'—'}${Number(x.surcharge_cents)>0?`<small class="table-sub">Recargo ${money(x.surcharge_cents)}</small>`:''}</td><td><strong>${money(x.total_cents)}</strong></td><td><button class="btn btn-ghost" data-edit-purchase="${x.id}">Editar</button></td></tr>`).join(''):'<tr><td colspan="7">Todavía no hay compras cargadas.</td></tr>'}</tbody></table></div></section>`;}

  const PRODUCTION_TYPE_USE={shirt:'Remeras',chomba:'Chombas',hoodie:'Buzos',cap:'Gorras',mug:'Tazas',glass:'Vasos',thermos:'Termos',tumbler:'Vasos / termos',bag:'Bolsos',other:'Otros'};
  const PRODUCTION_CATEGORY_LABEL={shirt:'Remeras',chomba:'Chombas',hoodie:'Buzos',cap:'Gorras',mug:'Tazas',glass:'Vasos',thermos:'Termos',bag:'Bolsos',other:'Otros'};
  function syncProductionCustomTypes(){const select=qs('#productionMaterialType');if(!select)return;for(const type of [...new Set([...state.materials.map(m=>m.material_type),...state.mockupAssets.map(a=>a.product_type)])]){if(!/^custom_[a-z0-9_]{1,56}$/.test(type)||qs(`option[value="${type}"]`,select))continue;select.insertAdjacentHTML('beforeend',`<option value="${type}">${escapeHtml(materialTypeLabel(type))}</option>`);}}
  function productionPrimaryMaterial(){const type=qs('#productionMaterialType')?.value||'shirt';return state.productionMaterialsSelected.map(x=>({...x,material:state.materials.find(m=>Number(m.id)===Number(x.materialId))})).find(x=>x.material?.material_type===type)?.material||null;}
  function productionCategoryGuess(type){const names={shirt:['remera','remeras'],chomba:['chomba','chombas'],hoodie:['buzo','buzos'],cap:['gorra','gorras'],mug:['taza','tazas'],glass:['vaso','vasos'],thermos:['termo','termos'],tumbler:['vaso','vasos','termo','termos'],bag:['bolso','bolsos']};const words=names[type]||[];return state.categories.find(c=>words.some(w=>String(c.name||'').toLowerCase().includes(w)))||null;}
  async function ensureProductionCategory(type){
    let cat=productionCategoryGuess(type);if(cat)return cat;
    const name=PRODUCTION_CATEGORY_LABEL[type]||'Otros';
    try{const d=await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name,active:true,sort_order:100})});cat=d.item||d;await ensureCategories(true);return productionCategoryGuess(type)||cat;}catch{await ensureCategories(true);return productionCategoryGuess(type)||state.categories.find(c=>c.active)||state.categories[0]||null;}
  }
  function productionMaterialLabel(m){return [m.name,m.fit,m.size,m.material_class,m.gender,Number(m.capacity_ml)>0?`${Number(m.capacity_ml)} ml`:'' ].filter(Boolean).join(' · ');}
  function productionMaterialCard(m){const selected=state.productionMaterialsSelected.some(x=>Number(x.materialId)===Number(m.id));const stock=Number(m.stock_qty)||0,preview=state.mockupAssets.find(a=>a.asset_type==='base'&&Number(a.material_id)===Number(m.id));return `<button type="button" class="production-picker-card ${selected?'selected':''} ${stock<=0?'out-of-stock':''}" data-add-production-material="${m.id}">${preview?`<img class="production-material-thumb" src="${apiUrl(`/api/admin/mockup-assets/${preview.id}/file`)}" alt="Vista de ${escapeHtml(m.name)}" loading="lazy">`:''}<strong>${escapeHtml(m.name)}</strong><span>${escapeHtml([m.fit,m.size,m.material_class,m.gender,Number(m.capacity_ml)>0?`${Number(m.capacity_ml)} ml`:'' ].filter(Boolean).join(' · ')||materialTypeLabel(m.material_type))}</span>${m.color?colorDetail(m.color):''}<small>${stock>0?`Disponible: ${stock.toLocaleString('es-AR',{maximumFractionDigits:3})} ${m.unit==='meter'?'m':'u'}`:'Sin stock físico · disponible para A stockear'}</small><b>${money(m.average_cost_cents)} / ${m.unit==='meter'?'m':'u'}</b></button>`;}
  function renderProductionMaterialGallery(){const host=qs('#productionMaterialGallery');if(!host)return;const type=qs('#productionMaterialType')?.value||'shirt',kind=qs('#productionStockKind')?.value||'physical';const mats=state.materials.filter(m=>m.material_type===type&&(kind==='to_stock'||Number(m.stock_qty)>0));host.innerHTML=mats.length?mats.map(productionMaterialCard).join(''):`<div class="notice">No hay ${escapeHtml(materialTypeLabel(type).toLowerCase())} cargadas. Ingresalas desde Compras.</div>`;}
  function renderProductionSelectedMaterials(){const host=qs('#productionSelectedMaterials');if(!host)return;host.innerHTML=state.productionMaterialsSelected.length?`<div class="production-selected-title">Materia prima elegida</div>${state.productionMaterialsSelected.map((x,i)=>{const m=state.materials.find(a=>Number(a.id)===Number(x.materialId));if(!m)return'';return `<div class="production-selected-row"><div><strong>${escapeHtml(productionMaterialLabel(m))}</strong><small>${money(m.average_cost_cents)} por ${m.unit==='meter'?'metro':'unidad'}</small></div><div class="purchase-stepper compact-stepper"><button type="button" data-prod-material-step="-1" data-index="${i}">−</button><input class="input" value="${Number(x.quantity)||1}" readonly><button type="button" data-prod-material-step="1" data-index="${i}">+</button></div><button class="icon-btn" type="button" data-remove-production-material="${i}">×</button></div>`}).join('')}`:'';syncProductionPublicationDefaults();calcProductionBuilderCost();}
  function productionDesignCard(d){const selected=state.productionDesignsSelected.some(x=>Number(x.designAssetId)===Number(d.id)),url=`/api/admin/design-assets/${d.id}/file`,options=productionMeasureOptions(d);return `<button type="button" class="production-design-card ${selected?'selected':''}" data-add-production-design="${d.id}">${String(d.mime_type||'').startsWith('image/')?`<img src="${url}" alt="${escapeHtml(d.name||d.file_name)}" loading="lazy">`:`<span class="design-file-placeholder">${escapeHtml((d.file_name||'ARCHIVO').split('.').pop().toUpperCase())}</span>`}<strong>${escapeHtml(d.name||d.file_name)}</strong><small>${options.length?`${options.length} ${options.length===1?'opción':'opciones'} de medidas`:'Ingresar medidas al elegir'}</small></button>`;}
  function renderProductionDesignGallery(){const host=qs('#productionDesignGallery');if(!host)return;const designs=state.designAssets.filter(d=>d.kind==='individual');const filters=qs('#productionDesignFilters');if(filters)filters.innerHTML=designTagFilterHtml('production',designs);host.innerHTML=designs.length?designs.filter(d=>designVisible('production',d)).map(productionDesignCard).join(''):'<div class="notice">No hay diseños individuales cargados.</div>';}
  async function loadMockupAssets(force=false){if(state.mockupAssetsLoaded&&!force)return;const data=await api('/api/admin/mockup-assets');state.mockupAssets=data.items||[];state.mockupAssetsLoaded=true;}
  function mockupAssetUrl(asset){return apiUrl(`/api/admin/mockup-assets/${Number(asset.id)}/file`)}
  function renderMockupStudioOptions(){
    const genderSelect=qs('#mockupGenderSelect'),modelSelect=qs('#mockupModelSelect'),styleSelect=qs('#mockupGarmentStyleSelect'),sideSelect=qs('#mockupSideSelect'),capSelect=qs('#mockupCapStyleSelect'),baseSelect=qs('#mockupBaseSelect'),backgroundSelect=qs('#mockupBackgroundSelect');if(!baseSelect)return;
    const type=qs('#productionMaterialType')?.value||'shirt',person=['shirt','chomba','hoodie'].includes(type),assets=state.mockupAssets.filter(a=>a.asset_type==='base'&&a.product_type===type),oldBase=baseSelect.value,oldBackground=backgroundSelect.value;
    genderSelect.closest('.field')?.classList.toggle('hidden',!person);if(person&&!['Varón','Mujer'].includes(genderSelect.value))genderSelect.value='Varón';genderSelect.disabled=!person;const modelLabel=qs('#mockupModelSelectLabel');if(modelLabel)modelLabel.textContent=person?'2 · Modelo':'2 · Producto';
    const gender=person?genderSelect.value:'Producto',byGender=assets.filter(a=>person?a.gender===gender:(a.gender==='Producto'||!a.gender));
    const names=[...new Set(byGender.map(a=>a.model_name||a.name).filter(Boolean))],oldName=modelSelect.value;modelSelect.innerHTML='<option value="">Todos los modelos/productos</option>'+names.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');modelSelect.value=names.includes(oldName)?oldName:'';
    const byName=byGender.filter(a=>!modelSelect.value||(a.model_name||a.name)===modelSelect.value),styles=[...new Set(byName.map(a=>a.garment_style).filter(Boolean))],oldStyle=styleSelect.value;styleSelect.closest('.field')?.classList.toggle('hidden',!person);styleSelect.innerHTML='<option value="">Todas las prendas</option>'+styles.map(n=>`<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');styleSelect.value=styles.includes(oldStyle)?oldStyle:'';
    const labelA=person?'Frente':'Lado A',labelB=person?'Espalda':'Lado B',side=sideSelect.value||'front';sideSelect.innerHTML=`<option value="front">${labelA}</option><option value="back">${labelB}</option>`;sideSelect.value=side;
    const capCandidates=byName.filter(a=>!person||!styleSelect.value||a.garment_style===styleSelect.value),caps=[...new Set(capCandidates.map(a=>a.cap_style||'none'))],oldCap=capSelect.value;capSelect.closest('.field')?.classList.toggle('hidden',!person);capSelect.innerHTML='<option value="">Todas las variantes</option>'+caps.map(v=>`<option value="${escapeHtml(v)}">${v==='none'?'Sin gorra':v==='mesh'?'Gorra con red':'Gorra sin red'}</option>`).join('');capSelect.value=caps.includes(oldCap)?oldCap:'';
    const available=byName.filter(a=>(!person||!styleSelect.value||a.garment_style===styleSelect.value)&&a.pose===side&&(!person||!capSelect.value||(a.cap_style||'none')===capSelect.value));
    baseSelect.innerHTML='<option value="">Elegir una variante de la galería</option>'+available.map(a=>`<option value="${a.id}">${escapeHtml([a.model_name,a.garment_style,a.color,a.cap_style&&a.cap_style!=='none'?(a.cap_style==='mesh'?'Gorra con red':'Gorra sin red'):'',a.pose==='back'?labelB:labelA,a.variant_label].filter(Boolean).join(' · '))}</option>`).join('');baseSelect.value=available.some(a=>String(a.id)===oldBase)?oldBase:'';
    const gallery=qs('#mockupVariantGallery');if(gallery)gallery.innerHTML=available.length?available.map(a=>`<button type="button" class="mockup-variant-card ${Number(a.id)===Number(baseSelect.value)?'selected':''}" data-select-mockup-variant="${a.id}" title="Elegir ${escapeHtml(a.name||a.model_name||'variante')}"><img src="${mockupAssetUrl(a)}" alt="${escapeHtml([a.model_name,a.garment_style,a.color,a.pose==='back'?labelB:labelA].filter(Boolean).join(' · '))}" loading="lazy"><strong>${escapeHtml(a.model_name||a.name||'Producto')}</strong><small>${escapeHtml([a.garment_style,a.color,a.cap_style&&a.cap_style!=='none'?(a.cap_style==='mesh'?'Con red':'Sin red'):'',a.pose==='back'?labelB:labelA,a.variant_label].filter(Boolean).join(' · '))}</small></button>`).join(''):'<p class="muted">No hay fotos cargadas que coincidan. Administrá las imágenes y subí esta variante.</p>';
    const backgrounds=state.mockupAssets.filter(a=>a.asset_type==='background');backgroundSelect.innerHTML='<option value="">Sin fondo agregado</option>'+backgrounds.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');backgroundSelect.value=backgrounds.some(a=>String(a.id)===oldBackground)?oldBackground:'';
    const backgroundGallery=qs('#mockupBackgroundGallery');if(backgroundGallery)backgroundGallery.innerHTML=backgrounds.length?`<button type="button" class="mockup-background-card ${!backgroundSelect.value?'selected':''}" data-select-mockup-background=""><span>Sin fondo</span></button>`+backgrounds.map(a=>`<button type="button" class="mockup-background-card ${Number(a.id)===Number(backgroundSelect.value)?'selected':''}" data-select-mockup-background="${a.id}" title="${escapeHtml(a.name)}"><img src="${mockupAssetUrl(a)}" alt="${escapeHtml(a.name)}" loading="lazy"><small>${escapeHtml(a.name)}</small></button>`).join(''):'<p class="muted">Todavía no hay fondos cargados.</p>';
    renderMockupLayerControls();syncMockupActions();applyMockupZoom();syncProductionCapControls();calcProductionBuilderCost();
  }
  function syncProductionCapControls(){const base=state.mockupAssets.find(a=>Number(a.id)===Number(qs('#mockupBaseSelect')?.value)),hasCap=base?.cap_style&&base.cap_style!=='none',box=qs('#productionCapPriceBox'),select=qs('#mockupCapMaterialSelect');if(!box||!select)return;box.classList.toggle('hidden',!hasCap);if(!hasCap)return;const old=select.value,mats=state.materials.filter(m=>m.material_type==='cap');select.innerHTML='<option value="">Elegir gorra para conocer su costo</option>'+mats.map(m=>`<option value="${m.id}">${escapeHtml(m.name)} · ${escapeHtml(m.color||'')} · ${money(m.average_cost_cents)}</option>`).join('');select.value=mats.some(m=>String(m.id)===old)?old:(mats[0]?String(mats[0].id):'');if(select.value&&!qs('#mockupCapSalePrice').value)loadCapPriceSuggestion(select.value);}
  async function loadCapPriceSuggestion(id){try{const d=await api(`/api/admin/production/price-suggestion?materialId=${Number(id)}`);if(Number(d.price_cents)>0&&!qs('#mockupCapSalePrice')?.value){qs('#mockupCapSalePrice').value=centsToPesos(d.price_cents);calcProductionBuilderCost()}}catch{}}
  function renderMockupCapDesignOptions(){
    const designSelect=qs('#mockupCapDesignSelect'),measureSelect=qs('#mockupCapMeasureSelect');if(!designSelect||!measureSelect)return;const designs=state.designAssets.filter(a=>a.kind==='individual'),old=Number(state.mockupCapDesign?.designAssetId)||Number(designSelect.value),design=designs.find(a=>Number(a.id)===old);designSelect.innerHTML='<option value="">Elegir estampa de gorra</option>'+designs.map(a=>`<option value="${a.id}">${escapeHtml(a.name||a.file_name)}</option>`).join('');designSelect.value=design?String(design.id):'';
    const options=design?productionMeasureOptions(design):[],oldMeasure=state.mockupCapDesign?.measureOptionId;measureSelect.innerHTML='<option value="">Elegir medida</option>'+options.map(o=>`<option value="${escapeHtml(o.id)}">${escapeHtml(designMeasureLabel(o))}</option>`).join('');const chosen=options.find(o=>o.id===oldMeasure)||options[0];measureSelect.value=chosen?.id||'';if(chosen){state.mockupCapDesign={...(state.mockupCapDesign||{}),designAssetId:Number(design.id),measureOptionId:chosen.id,widthCm:Number(chosen.widthCm)||0,heightCm:Number(chosen.heightCm)||0,measureLabel:designMeasureLabel(chosen),printSide:'front'};}else state.mockupCapDesign=null;
    qsa('.mockup-cap-field').forEach(el=>el.classList.toggle('hidden',!qs('#mockupAddCap')?.checked));
  }
  function mockupLayers(side=qs('#mockupSideSelect')?.value||'front'){return state.productionDesignsSelected.map((item,index)=>({key:`design-${index}`,item,index,asset:state.designAssets.find(a=>Number(a.id)===Number(item.designAssetId)),cap:false})).filter(x=>x.asset&&(x.item.printSide||'front')===side)}
  function syncMockupActions(){const button=qs('#addMockupToProductBtn'),base=Number(qs('#mockupBaseSelect')?.value),side=qs('#mockupSideSelect')?.value||'front',hasLayer=mockupLayers(side).length>0;if(button)button.disabled=!base||!hasLayer;}
  async function loadMockupImage(asset){const key=`${asset.asset_type}:${asset.id}`;if(state.mockupImageCache.has(key))return state.mockupImageCache.get(key);const image=new Image();image.decoding='async';image.src=mockupAssetUrl(asset);await image.decode();state.mockupImageCache.set(key,image);return image;}
  async function loadDesignMockupImage(asset){const key=`design:${asset.id}`;if(state.mockupImageCache.has(key))return state.mockupImageCache.get(key);const image=new Image();image.decoding='async';image.src=apiUrl(`/api/admin/design-assets/${Number(asset.id)}/file`);await image.decode();state.mockupImageCache.set(key,image);return image;}
  function drawContained(ctx,image,x,y,width,height,cover=false){const scale=cover?Math.max(width/image.width,height/image.height):Math.min(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;ctx.drawImage(image,x+(width-w)/2,y+(height-h)/2,w,h);}
  function containedRect(image,width,height){const scale=Math.min(width/image.width,height/image.height),w=image.width*scale,h=image.height*scale;return{x:(width-w)/2,y:(height-h)/2,w,h};}
  function mockupPlacement(layer,canvas){
    if(!layer.item.mockupPlacement){const ratio=layer.asset&&Number(layer.asset.width_cm)>0&&Number(layer.asset.height_cm)>0?Number(layer.asset.width_cm)/Number(layer.asset.height_cm):1,cm=Math.max(6,Number(layer.item.widthCm)||12),w=Math.max(.09,Math.min(.48,cm/90)),h=w*(canvas.width/canvas.height)/Math.max(.15,ratio),type=qs('#productionMaterialType')?.value||'',centerY=layer.cap ? .15 : ((type==='mug'||type==='glass'||type==='thermos') ? .42 : .34);layer.item.mockupPlacement={x:.5-w/2,y:centerY-h/2,w,h};}
    return layer.item.mockupPlacement;
  }
  function renderMockupLayerControls(){
    const host=qs('#mockupLayerEditor'),canvas=qs('#productionMockupCanvas');if(!host||!canvas)return;const layers=mockupLayers(),selected=layers.find(x=>x.key===state.mockupSelectedLayer)||layers[0];if(selected)state.mockupSelectedLayer=selected.key;
    if(!layers.length){host.innerHTML='<p class="muted">Elegí una estampa para colocarla. Cada diseño tendrá tamaño y posición independientes.</p>';return;}
    const rows=layers.map((layer,i)=>{const place=mockupPlacement(layer,canvas),label=layer.cap?'Gorra · ':'';return `<button type="button" class="mockup-layer-chip ${layer.key===state.mockupSelectedLayer?'selected':''}" data-select-mockup-layer="${escapeHtml(layer.key)}">${designSmallImage(layer.asset)}<span><strong>${escapeHtml(label+(layer.asset.name||layer.asset.file_name))}</strong><small>${escapeHtml(layer.item.measureLabel||`${Number(layer.item.widthCm)||'?'} × ${Number(layer.item.heightCm)||'?'} cm`)} · ancho visual ${Math.round(place.w*100)}%</small></span></button>`}).join('');
    host.innerHTML=`<div class="mockup-layer-list">${rows}</div><small class="mockup-touch-hint">Arrastrá dentro del diseño para moverlo o desde una esquina para cambiarlo proporcionalmente.</small>`;
  }
  function updateMockupLayerScale(key,value){const canvas=qs('#productionMockupCanvas'),layer=mockupLayers().find(x=>x.key===key);if(!canvas||!layer)return;const p=mockupPlacement(layer,canvas),width=Math.max(.06,Math.min(.78,(Number(value)||20)/100)),ratio=p.h/Math.max(.001,p.w);p.w=width;p.h=Math.min(.88,width*ratio);p.x=Math.max(0,Math.min(1-p.w,p.x));p.y=Math.max(0,Math.min(1-p.h,p.y));refreshMockupPreview().catch(()=>{});}
  async function refreshMockupPreview(){
    const canvas=qs('#productionMockupCanvas'),empty=qs('#productionMockupEmpty');if(!canvas)return;const ctx=canvas.getContext('2d'),seq=++state.mockupRenderSeq;ctx.clearRect(0,0,canvas.width,canvas.height);syncMockupActions();
    const base=state.mockupAssets.find(a=>Number(a.id)===Number(qs('#mockupBaseSelect')?.value)),background=state.mockupAssets.find(a=>Number(a.id)===Number(qs('#mockupBackgroundSelect')?.value)),side=qs('#mockupSideSelect')?.value||'front';
    if(!base){empty.textContent='Elegí una miniatura de las variantes cargadas para ver el montaje.';empty.classList.remove('hidden');state.mockupLayerBoxes=[];return;}
    try{
      if(background){const bg=await loadMockupImage(background);if(seq!==state.mockupRenderSeq)return;drawContained(ctx,bg,0,0,canvas.width,canvas.height,true);}
      const model=await loadMockupImage(base);if(seq!==state.mockupRenderSeq)return;ctx.drawImage(model,0,0,canvas.width,canvas.height);
      state.mockupLayerBoxes=[];for(const layer of mockupLayers(side)){
        const image=await loadDesignMockupImage(layer.asset);if(seq!==state.mockupRenderSeq)return;const p=mockupPlacement(layer,canvas),box={x:p.x*canvas.width,y:p.y*canvas.height,w:p.w*canvas.width,h:p.h*canvas.height,key:layer.key,item:layer.item,cap:layer.cap,asset:layer.asset};drawContained(ctx,image,box.x,box.y,box.w,box.h,false);state.mockupLayerBoxes.push(box);
        if(layer.key===state.mockupSelectedLayer){ctx.save();ctx.strokeStyle='#f0ba39';ctx.lineWidth=3;ctx.setLineDash([9,5]);ctx.strokeRect(box.x,box.y,box.w,box.h);ctx.setLineDash([]);ctx.fillStyle='#f0ba39';for(const [x,y] of [[box.x,box.y],[box.x+box.w,box.y],[box.x,box.y+box.h],[box.x+box.w,box.y+box.h]]){ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);ctx.fill()}ctx.fillStyle='#6b142a';ctx.beginPath();ctx.arc(box.x,box.y,13,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText('×',box.x,box.y+6);ctx.restore();}
      }
      if(seq!==state.mockupRenderSeq)return;empty.classList.add('hidden');const hint=qs('#mockupAssetHint');if(hint)hint.textContent=`${base.model_name||base.name} · ${base.gender==='Producto'?(base.pose==='back'?'lado B':'lado A'):(base.pose==='back'?'espalda':'frente')} · ${[base.garment_style,base.color,base.cap_style&&base.cap_style!=='none'?(base.cap_style==='mesh'?'gorra con red':'gorra sin red'):''].filter(Boolean).join(' · ')}. Mové y escalá las estampas directamente en la imagen.`;
    }catch(err){empty.textContent='No pude abrir una de las imágenes. Revisá que el archivo siga disponible.';empty.classList.remove('hidden');throw err;}
  }
  function applyMockupZoom(){
    const canvas=qs('#productionMockupCanvas');if(!canvas)return;
    const zoom=Math.max(1,Math.min(8,Number(state.mockupZoom)||1)),viewport=canvas.parentElement;
    const maxX=Math.max(0,(canvas.clientWidth*zoom-viewport.clientWidth)/2),maxY=Math.max(0,(canvas.clientHeight*zoom-viewport.clientHeight)/2);
    state.mockupZoom=zoom;state.mockupPanX=Math.max(-maxX,Math.min(maxX,Number(state.mockupPanX)||0));state.mockupPanY=Math.max(-maxY,Math.min(maxY,Number(state.mockupPanY)||0));
    canvas.style.transform=`translate(${state.mockupPanX}px,${state.mockupPanY}px) scale(${zoom})`;
    const label=qs('#mockupZoomValue');if(label)label.textContent=`${Math.round(zoom*100)}%`;
  }
  function bindMockupCanvas(){
    const canvas=qs('#productionMockupCanvas');if(!canvas||canvas.dataset.pointerBound)return;canvas.dataset.pointerBound='1';canvas.style.touchAction='none';const pointers=new Map();
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height}};
    canvas.addEventListener('wheel',e=>{e.preventDefault();state.mockupZoom=Math.max(1,Math.min(8,(Number(state.mockupZoom)||1)*(e.deltaY<0?1.12:1/1.12)));applyMockupZoom()},{passive:false});
    canvas.addEventListener('pointerdown',e=>{pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});e.preventDefault();canvas.setPointerCapture?.(e.pointerId);if(pointers.size===2){const [a,b]=[...pointers.values()];state.mockupPointer={mode:'pinch',distance:Math.hypot(a.x-b.x,a.y-b.y),zoom:state.mockupZoom};return}if(pointers.size>2)return;
      const p=point(e),scale=canvas.width/Math.max(1,canvas.getBoundingClientRect().width),boxes=[...state.mockupLayerBoxes].reverse(),hit=boxes.find(b=>p.x>=b.x-10*scale&&p.x<=b.x+b.w+10*scale&&p.y>=b.y-10*scale&&p.y<=b.y+b.h+10*scale);
      if(!hit){state.mockupPointer=state.mockupZoom>1?{mode:'pan',startClient:{x:e.clientX,y:e.clientY},initialPan:{x:state.mockupPanX,y:state.mockupPanY}}:null;return}
      if(Math.hypot(p.x-hit.x,p.y-hit.y)<16*scale){state.productionDesignsSelected.splice(Number(hit.key.split('-')[1]),1);state.mockupSelectedLayer='';state.mockupPointer=null;renderProductionSelectedDesigns();return}
      state.mockupSelectedLayer=hit.key;const corners={tl:[hit.x,hit.y],tr:[hit.x+hit.w,hit.y],bl:[hit.x,hit.y+hit.h],br:[hit.x+hit.w,hit.y+hit.h]},corner=Object.entries(corners).find(([,v])=>Math.hypot(p.x-v[0],p.y-v[1])<=23*scale)?.[0];state.mockupPointer={key:hit.key,mode:corner?'resize':'move',corner,start:p,initial:{...hit.item.mockupPlacement}};renderMockupLayerControls();refreshMockupPreview().catch(()=>{});
    });
    canvas.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const drag=state.mockupPointer;if(!drag)return;if(drag.mode==='pinch'){if(pointers.size<2)return;const [a,b]=[...pointers.values()];state.mockupZoom=Math.max(1,Math.min(8,drag.zoom*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,drag.distance)));applyMockupZoom();return}if(drag.mode==='pan'){state.mockupPanX=drag.initialPan.x+e.clientX-drag.startClient.x;state.mockupPanY=drag.initialPan.y+e.clientY-drag.startClient.y;applyMockupZoom();return}const p=point(e),layer=mockupLayers().find(x=>x.key===drag.key);if(!layer)return;const dx=(p.x-drag.start.x)/canvas.width,dy=(p.y-drag.start.y)/canvas.height,q=layer.item.mockupPlacement;if(drag.mode==='move'){q.x=Math.max(0,Math.min(1-q.w,drag.initial.x+dx));q.y=Math.max(0,Math.min(1-q.h,drag.initial.y+dy))}else{const left=drag.corner.includes('l'),top=drag.corner.includes('t'),ratio=drag.initial.h/Math.max(.001,drag.initial.w),deltaX=(left?-dx:dx),deltaY=(top?-dy:dy)/ratio,delta=Math.abs(deltaX)>Math.abs(deltaY)?deltaX:deltaY,nextW=Math.max(.04,Math.min(.85,.96/Math.max(.01,ratio),drag.initial.w+delta)),nextH=nextW*ratio;q.w=nextW;q.h=nextH;q.x=Math.max(0,Math.min(1-nextW,left?drag.initial.x+drag.initial.w-nextW:drag.initial.x));q.y=Math.max(0,Math.min(1-nextH,top?drag.initial.y+drag.initial.h-nextH:drag.initial.y))}const row=qs(`[data-select-mockup-layer="${drag.key}"]`),small=qs('small',row);if(small)small.textContent=`${layer.item.measureLabel||'Medida seleccionada'} · ancho visual ${Math.round(q.w*100)}%`;refreshMockupPreview().catch(()=>{});
    });
    const stop=e=>{pointers.delete(e.pointerId);state.mockupPointer=null};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);
  }
  function renderMockupAssetList(){const host=qs('#mockupAssetsList');if(!host)return;const assets=state.mockupAssets.filter(a=>a.asset_type!=='cap');host.innerHTML=assets.length?assets.map(a=>`<div class="mockup-asset-row"><img src="${mockupAssetUrl(a)}" alt="" loading="lazy"><div><strong>${escapeHtml(a.name)}</strong><small>${a.asset_type==='background'?'Fondo':a.asset_type==='cap'?'Gorra PNG':`${escapeHtml(a.model_name||'Modelo')} · ${escapeHtml(a.gender||'Producto')} · ${escapeHtml(a.garment_style||'prenda')} · ${a.pose==='back'?'Espalda':a.pose==='side'?'Perfil':'Frente'} · ${escapeHtml(a.color||'sin color')}`}</small></div><button class="btn btn-danger small-delete" type="button" data-delete-mockup-asset="${a.id}">Eliminar</button></div>`).join(''):'<div class="notice">Todavía no hay imágenes reutilizables.</div>';}
  const MOCKUP_CATALOG_DEFAULT={models:['Juan','Pedro','Filemón','Ester','Ruth','Isabel'],garments:['Remera clásica','Remera oversize','Remera crop'],products:['Taza','Vaso','Termo','Mochila','Gorra'],variants:['500 ml','1100 ml','Con asa','Con tapa'],colors:['Negro','Blanco','Rojo','Azul','Celeste','Verde','Amarillo','Rosa','Beige','Gris','Crema']};
  async function ensureMockupCatalog(){if(state.mockupCatalog)return;let stored={};try{const data=await api('/api/admin/settings');stored=JSON.parse(data.settings?.mockup_catalog||'{}')}catch{}state.mockupCatalog=Object.fromEntries(Object.entries(MOCKUP_CATALOG_DEFAULT).map(([key,defaults])=>[key,[...new Set([...defaults,...(Array.isArray(stored[key])?stored[key]:[])])]]));}
  async function persistMockupCatalog(){await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{mockup_catalog:JSON.stringify(state.mockupCatalog)}})});}
  function mockupProductCode(label){const x=String(label||'').toLowerCase();if(x.includes('taza'))return 'mug';if(x.includes('vaso'))return 'glass';if(x.includes('termo'))return 'thermos';if(x.includes('mochila')||x.includes('bolso'))return 'bag';if(x.includes('gorra'))return 'cap';return 'custom_'+x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,56)}
  function mockupCatalogOptions(key){return (state.mockupCatalog?.[key]||[]).map(x=>`<option value="${escapeHtml(x)}"></option>`).join('')}
  function mockupColorChoices(){return [...new Set([...(state.mockupCatalog?.colors||MOCKUP_CATALOG_DEFAULT.colors),...(state.purchaseOptions?.colors||[]),...state.materials.map(m=>m.color).filter(Boolean)])]}
  function renderMockupCatalogEditor(){const host=qs('#mockupCatalogEditor');if(!host)return;const key=state.mockupCatalogKey||'models',labels={models:'Modelos',garments:'Prendas',products:'Productos',variants:'Variantes',colors:'Colores'};host.innerHTML=`<div class="mockup-catalog-add"><select class="select" id="mockupCatalogKind">${Object.entries(labels).map(([v,label])=>`<option value="${v}" ${key===v?'selected':''}>${label}</option>`).join('')}</select><input class="input" id="mockupCatalogNew" placeholder="Nueva opción"><button type="button" class="btn btn-ghost" data-mockup-catalog-add>+ Agregar</button></div><div class="mockup-catalog-rows">${(state.mockupCatalog?.[key]||[]).map((item,i)=>`<div><input class="input" data-mockup-catalog-value="${i}" value="${escapeHtml(item)}"><button type="button" class="btn btn-ghost" data-mockup-catalog-save="${i}">Guardar</button><button type="button" class="icon-btn" data-mockup-catalog-delete="${i}" aria-label="Eliminar ${escapeHtml(item)}">×</button></div>`).join('')}</div>`}
  function renderMockupUploadQueue(){const host=qs('#mockupUploadQueue');if(!host)return;const colors=mockupColorChoices();host.innerHTML=(state.mockupUploadQueue||[]).map(r=>`<div class="mockup-upload-card" data-mockup-upload="${r.id}"><img src="${escapeHtml(r.url)}" alt="Vista previa de ${escapeHtml(r.file.name)}"><div class="mockup-upload-fields"><label class="field">Nombre<input class="input" data-mockup-field="name" value="${escapeHtml(r.file.name.replace(/\.[^.]+$/,''))}"></label><label class="field">Qué es<select class="select" data-mockup-field="category"><option value="Persona">Persona</option><option value="Producto">Producto</option><option value="Fondo">Fondo</option></select></label><label class="field" data-person-field>Género<select class="select" data-mockup-field="gender"><option value="Varón">Varón</option><option value="Mujer">Mujer</option></select></label><label class="field" data-person-field>Nombre del modelo<input class="input" data-mockup-field="modelName" list="mockupModelNames" placeholder="Juan, Ester..."></label><label class="field" data-product-field>Tipo de producto<select class="select" data-mockup-field="productType">${(state.mockupCatalog?.products||[]).map(v=>`<option value="${escapeHtml(mockupProductCode(v))}">${escapeHtml(v)}</option>`).join('')}</select></label><label class="field" data-person-field>Prenda<select class="select" data-mockup-field="garmentStyle">${(state.mockupCatalog?.garments||[]).map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}</select></label><label class="field" data-base-field>Vista<select class="select" data-mockup-field="pose"><option value="front">Frente</option><option value="back">Espalda</option></select></label><label class="field" data-colored-field>Color<select class="select" data-mockup-field="color"><option value="">Sin especificar</option>${colors.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}<option value="__custom__">+ Agregar color…</option></select><input class="input hidden" data-mockup-field="customColor" placeholder="Escribí un color"></label><label class="field" data-person-field>Gorra en la foto<select class="select" data-mockup-field="capStyle"><option value="none">Sin gorra</option><option value="mesh">Gorra con red</option><option value="solid">Gorra sin red</option></select></label><label class="field" data-product-field>Capacidad / formato<input class="input" data-mockup-field="variantLabel" list="mockupVariants" placeholder="500 ml, con tapa..."></label><div class="mockup-upload-actions"><small data-mockup-status>${r.saved?'Guardado ✓':'Pendiente'}</small><button type="button" class="icon-btn" data-mockup-remove="${r.id}" aria-label="Quitar foto">×</button></div></div></div>`).join('')+`<datalist id="mockupModelNames">${mockupCatalogOptions('models')}</datalist><datalist id="mockupVariants">${mockupCatalogOptions('variants')}</datalist>`;
    for(const r of state.mockupUploadQueue||[]){const card=qs(`[data-mockup-upload="${r.id}"]`,host);if(r.values){for(const [key,value] of Object.entries(r.values)){const el=qs(`[data-mockup-field="${key}"]`,card);if(el)el.value=value;}const color=qs('[data-mockup-field="color"]',card),custom=qs('[data-mockup-field="customColor"]',card);if(color&&r.values.color&&!colors.includes(r.values.color)){color.value='__custom__';if(custom)custom.value=r.values.color;}}else{const item=state.mockupUploadFromPurchaseRow!==null?state.purchaseItems[state.mockupUploadFromPurchaseRow]:null,person=item&&['shirt','chomba','hoodie'].includes(item.materialType);qs('[data-mockup-field="category"]',card).value=person?'Persona':item?'Producto':'Persona';if(item){qs('[data-mockup-field="gender"]',card).value=item.gender==='Mujer'?'Mujer':'Varón';qs('[data-mockup-field="productType"]',card).value=item.materialType||'other';qs('[data-mockup-field="color"]',card).value=colors.includes(item.color)?item.color:'';if(person){qs('[data-mockup-field="modelName"]',card).value='Modelo';const fit=String(item.fit||'').toLocaleLowerCase('es-AR'),kind=fit.includes('over')?'over':fit.includes('crop')?'crop':'clásica',garment=(state.mockupCatalog?.garments||[]).find(v=>String(v).toLocaleLowerCase('es-AR').includes(kind));qs('[data-mockup-field="garmentStyle"]',card).value=garment||'';}}}syncMockupUploadCard(card);}
  }
  function syncMockupUploadCard(card){if(!card)return;const category=qs('[data-mockup-field="category"]',card)?.value,person=category==='Persona',pose=qs('[data-mockup-field="pose"]',card);qsa('[data-person-field]',card).forEach(el=>el.classList.toggle('hidden',!person));qsa('[data-product-field]',card).forEach(el=>el.classList.toggle('hidden',category!=='Producto'));qsa('[data-base-field]',card).forEach(el=>el.classList.toggle('hidden',category==='Fondo'));qsa('[data-colored-field]',card).forEach(el=>el.classList.toggle('hidden',category==='Fondo'));if(pose){pose.options[0].textContent=person?'Frente':'Lado A';pose.options[1].textContent=person?'Espalda':'Lado B';}const color=qs('[data-mockup-field="color"]',card),custom=qs('[data-mockup-field="customColor"]',card);custom?.classList.toggle('hidden',color?.value!=='__custom__');}
  function syncMockupAssetForm(){qsa('[data-mockup-upload]').forEach(syncMockupUploadCard)}
  async function openMockupAssetDialog(purchaseRow=null){await Promise.all([loadMockupAssets(),ensureMockupCatalog(),ensureAdminOptionSettings(),state.materials.length?Promise.resolve():api('/api/admin/materials').then(d=>{state.materials=d.items||[]}).catch(()=>{})]);state.mockupUploadFromPurchaseRow=Number.isInteger(purchaseRow)?purchaseRow:null;state.mockupUploadQueue=[];state.mockupUploadId=0;qs('#mockupAssetFile').value='';renderMockupUploadQueue();renderMockupCatalogEditor();renderMockupAssetList();qs('#mockupAssetDialog')?.showModal();}
  async function saveMockupAsset(form,button){const queue=state.mockupUploadQueue||[];if(!queue.length)throw new Error('Elegí una o más fotos.');button.disabled=true;try{for(const r of queue){if(r.saved)continue;const card=qs(`[data-mockup-upload="${r.id}"]`),field=name=>String(qs(`[data-mockup-field="${name}"]`,card)?.value||'').trim(),category=field('category'),name=field('name')||r.file.name.replace(/\.[^.]+$/,''),color=field('color')==='__custom__'?field('customColor'):field('color');if(category!=='Fondo'&&(category==='Producto'?!field('productType'):!field('modelName')))throw new Error(`Completá ${category==='Producto'?'el tipo de producto':'el nombre del modelo'} para ${name}.`);if(field('color')==='__custom__'&&!color)throw new Error(`Escribí el color de ${name}.`);const fd=new FormData();fd.append('file',r.file);fd.append('assetType',category==='Fondo'?'background':'base');fd.append('name',name);fd.append('gender',category==='Fondo'?'':category==='Persona'?field('gender'):'Producto');fd.append('modelName',category==='Producto'?qs(`[data-mockup-field="productType"] option:checked`,card)?.textContent||field('productType'):field('modelName'));fd.append('productType',category==='Producto'?field('productType'):'shirt');fd.append('pose',field('pose')||'front');fd.append('garmentStyle',category==='Producto'?'':field('garmentStyle'));fd.append('capStyle',category==='Producto'?'none':field('capStyle'));fd.append('variantLabel',category==='Producto'?field('variantLabel'):'');fd.append('color',category==='Fondo'?'':color);const saved=await api('/api/admin/mockup-assets',{method:'POST',body:fd});r.saved=saved.item;state.mockupAssets.push(saved.item);qs('[data-mockup-status]',card).textContent='Guardado ✓';if(color&&!state.mockupCatalog.colors.includes(color))state.mockupCatalog.colors.push(color);if(category==='Persona'){const n=field('modelName');if(n&&!state.mockupCatalog.models.includes(n))state.mockupCatalog.models.push(n)}}await persistMockupCatalog().catch(()=>{});
    const purchaseRow=state.mockupUploadFromPurchaseRow;if(Number.isInteger(purchaseRow)&&state.purchaseItems[purchaseRow]){state.purchaseItems[purchaseRow].imageAssetId=Number(queue[0].saved.id);state.purchaseItems[purchaseRow]._imageTouched=true;state.mockupUploadFromPurchaseRow=null;renderPurchaseItems();}
    for(const r of queue)URL.revokeObjectURL(r.url);state.mockupUploadQueue=[];renderMockupUploadQueue();renderMockupAssetList();renderMockupStudioOptions();renderProductionMaterialGallery();await refreshMockupPreview();toast('Fotos guardadas','success');qs('#mockupAssetDialog')?.close();}finally{button.disabled=false;}}
  async function removeMockupAsset(id){if(!confirm('¿Eliminar esta imagen reutilizable?'))return;await api(`/api/admin/mockup-assets/${Number(id)}`,{method:'DELETE'});state.mockupAssets=state.mockupAssets.filter(a=>Number(a.id)!==Number(id));for(const key of [...state.mockupImageCache.keys()])if(key.endsWith(`:${Number(id)}`))state.mockupImageCache.delete(key);renderMockupAssetList();renderMockupStudioOptions();renderProductionMaterialGallery();await refreshMockupPreview();}
  async function addMockupPreviewToProduct(button){const canvas=qs('#productionMockupCanvas'),base=state.mockupAssets.find(a=>Number(a.id)===Number(qs('#mockupBaseSelect')?.value)),side=qs('#mockupSideSelect')?.value||'front';if(!canvas||!base||!mockupLayers(side).length){toast('Elegí una foto base y al menos una estampa para esta vista.','error');return}button.disabled=true;const selected=state.mockupSelectedLayer;try{state.mockupSelectedLayer='';await refreshMockupPreview();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('No pude generar la vista previa.');const filename=`Vista-${String(base.name||'producto').replace(/[^a-z0-9_-]+/gi,'-')}-${side}.png`;addSelectedMedia([new File([blob],filename,{type:'image/png'})],'productionMediaOrderList');setProductionTab(2);toast('Vista agregada a las fotos del producto','success')}finally{state.mockupSelectedLayer=selected;refreshMockupPreview().catch(()=>{});button.disabled=false;}}
  function designPrintMaterial(design){const type=design?.print_material_type||'dtf_textile';if(type==='none')return null;return [...state.materials].filter(m=>m.material_type===type).sort((a,b)=>(Number(b.stock_qty)||0)-(Number(a.stock_qty)||0))[0]||null;}
  function designPrintRollWidth(design){const material=designPrintMaterial(design);return Math.max(1,Number(material?.width_cm)||58);}
  function designPrintCostCents(design,width,height,optionId=''){
    const option=parseDesignMeasureOptions(design).find(o=>o.id===optionId||(!optionId&&Math.abs(Number(o.widthCm)-width)<.02&&Math.abs(Number(o.heightCm)-height)<.02));
    for(const source of option?.sources||[]){const sheet=state.designAssets.find(a=>Number(a.id)===Number(source.sheetAssetId));if(!sheet?.sheet_metrics)continue;const i=(sheet.components||[]).findIndex(c=>Number(c.designAssetId)===Number(design.id)&&String(c.measureOptionId)===String(option.id));if(i>=0)return Math.round((sheet.sheet_metrics.componentCostsCents?.[i]||0)/Math.max(1,Number(sheet.components[i].quantity)||1));}
    const material=designPrintMaterial(design);if(!material)return null;const area=Math.max(0,Number(width)||0)*Math.max(0,Number(height)||0);return Math.round(area/(100*designPrintRollWidth(design))*(Number(material.average_cost_cents)||0));
  }
  function designOriginCostCents(design,option,source){const sheet=state.designAssets.find(a=>Number(a.id)===Number(source?.sheetAssetId));if(!sheet)return null;const i=(sheet.components||[]).findIndex(c=>Number(c.designAssetId)===Number(design.id)&&String(c.measureOptionId)===String(option?.id));if(i<0)return null;return Math.round((sheet.sheet_metrics?.componentCostsCents?.[i]||0)/Math.max(1,Number(sheet.components[i].quantity)||1));}
  function designMeasuresOriginsHtml(design,options){return `<div class="design-origin-costs">${options.map(option=>{const sources=option.sources||[],size=`${Number(option.widthCm)} × ${Number(option.heightCm)} cm`;return `<section><strong>${escapeHtml(designMeasureLabel(option))}</strong>${sources.length?sources.map(source=>{const sheet=state.designAssets.find(a=>Number(a.id)===Number(source.sheetAssetId)),cost=designOriginCostCents(design,option,source);return `<div class="design-origin-cost-row">${designSmallImage(sheet||design)}<span><b>${escapeHtml(source.name||sheet?.name||source.fileName||'Plancha de origen')}</b><small>${sheet?`Plancha ${Number(sheet.width_cm)||'—'} × ${Number(sheet.height_cm)||'—'} cm · `:''}Diseño ${size}</small></span><strong>${cost===null?'Costo pendiente':money(cost)} / diseño</strong></div>`}).join(''):`<small>Sin origen de plancha registrado${designPrintCostCents(design,option.widthCm,option.heightCm,option.id)===null?' · costo DTF pendiente':` · costo estimado ${money(designPrintCostCents(design,option.widthCm,option.heightCm,option.id))}`}</small>`}</section>`}).join('')}</div>`}
  function designOriginHtml(option){const sources=(option?.sources||[]).slice(0,4);return sources.length?`<span class="design-origin-thumbs">${sources.map(s=>`<a href="${apiUrl(`/api/admin/design-assets/${Number(s.sheetAssetId)}/file`)}" target="_blank" rel="noopener" title="Plancha de origen: ${escapeHtml(s.name||s.fileName||'Abrir plancha')}"><img src="${apiUrl(`/api/admin/design-assets/${Number(s.sheetAssetId)}/file`)}" alt="Plancha de origen" loading="lazy"><small>${escapeHtml(s.name||s.fileName||'Origen')}</small></a>`).join('')}</span>`:''}
  function renderProductionSelectedDesigns(){const host=qs('#productionSelectedDesigns');if(!host)return;host.innerHTML=state.productionDesignsSelected.length?`<div class="production-selected-title">Estampas elegidas</div>${state.productionDesignsSelected.map((x,i)=>{const d=state.designAssets.find(a=>Number(a.id)===Number(x.designAssetId));if(!d)return'';const option=productionMeasureOptions(d).find(o=>o.id===x.measureOptionId),unitCost=designPrintCostCents(d,x.widthCm,x.heightCm,x.measureOptionId);return `<div class="production-selected-row production-design-selected-row"><div class="production-selected-design-main">${designSmallImage(d)}<div><strong>${escapeHtml(d.name||d.file_name)}</strong><small>${escapeHtml(x.measureLabel||`${Number(x.widthCm)||Number(d.width_cm)||'?'} × ${Number(x.heightCm)||Number(d.height_cm)||'?'} cm`)} · ${d.print_material_type==='dtf_uv'?'DTF UV':d.print_material_type==='none'?'Sin DTF':'DTF textil'}${unitCost===null?'':` · DTF aprox. ${money(unitCost)} / unidad`}</small>${designOriginHtml(option)}<div class="production-design-row-actions"><button class="btn btn-ghost production-change-measure" type="button" data-change-production-measure="${d.id}" data-index="${i}">Cambiar medida</button><label class="field production-design-side-field">Aplicar en<select class="select" data-production-design-side data-index="${i}"><option value="front" ${(x.printSide||'front')==='front'?'selected':''}>Frente</option><option value="back" ${x.printSide==='back'?'selected':''}>Espalda</option></select></label><button class="link-action" type="button" data-duplicate-production-design="${i}">Agregar a la otra cara</button></div></div></div><div class="purchase-stepper compact-stepper"><button type="button" data-prod-design-step="-1" data-index="${i}">−</button><input class="input" value="${Number(x.quantity)||1}" readonly><button type="button" data-prod-design-step="1" data-index="${i}">+</button></div><button class="icon-btn" type="button" data-remove-production-design="${i}">×</button></div>`}).join('')}`:'';calcProductionBuilderCost();refreshMockupPreview().catch(()=>{});}
  function productionBuilderCostData(){
    const finalQty=Math.max(1,Number(qs('#productionQuantity')?.value)||1),waste=Math.max(0,Number(qs('#productionWaste')?.value)||0),stockKind=qs('#productionStockKind')?.value||'physical';
    let materialCost=0,printCost=0;const lines=[],missing=[],warnings=[];
    for(const x of state.productionMaterialsSelected){const m=state.materials.find(a=>Number(a.id)===Number(x.materialId));if(!m)continue;const q=Math.max(.001,Number(x.quantity)||1),line=q*(Number(m.average_cost_cents)||0);materialCost+=line;const need=q*finalQty;if(Number(m.stock_qty)+1e-9<need){const msg=`No alcanza ${m.name}: necesitás ${need.toLocaleString('es-AR',{maximumFractionDigits:3})} y hay ${Number(m.stock_qty).toLocaleString('es-AR',{maximumFractionDigits:3})}.`;if(stockKind==='physical')missing.push(msg);else warnings.push(msg)}lines.push(`${m.name}: ${money(line)}`)}
    for(const x of state.productionDesignsSelected){const d=state.designAssets.find(a=>Number(a.id)===Number(x.designAssetId));if(!d)continue;const type=d.print_material_type||'dtf_textile';if(type==='none')continue;const area=(Number(x.widthCm)||Number(d.width_cm)||0)*(Number(x.heightCm)||Number(d.height_cm)||0)*Math.max(1,Number(x.quantity)||1);if(!area){missing.push(`Faltan las medidas del diseño ${d.name}.`);continue}
      const unit=designPrintCostCents(d,Number(x.widthCm),Number(x.heightCm),x.measureOptionId),mat=designPrintMaterial(d);if(unit!==null){const line=unit*Math.max(1,Number(x.quantity)||1)*(1+waste/100);printCost+=line;lines.push(`${d.name}: ${money(line)} · ${Number(x.widthCm)} × ${Number(x.heightCm)} cm`);if(!mat)warnings.push(`Costo de ${d.name} tomado de la plancha; sin stock DTF cargado.`);continue;}
      warnings.push(`Costo DTF pendiente para ${d.name}. Podés guardar y completarlo más tarde.`);
    }
    let capCost=0;const capVisible=!qs('#productionCapPriceBox')?.classList.contains('hidden'),capMaterial=state.materials.find(m=>Number(m.id)===Number(qs('#mockupCapMaterialSelect')?.value));if(capVisible){if(capMaterial){capCost=Number(capMaterial.average_cost_cents)||0;lines.push(`Gorra: ${money(capCost)}`);if(Number(capMaterial.stock_qty)<finalQty){const msg='Revisá el stock de gorras antes de iniciar producción.';if(stockKind==='physical')missing.push(msg);else warnings.push(msg)}}else{const msg='Elegí la materia prima de la gorra para estimar su costo.';if(stockKind==='physical')missing.push(msg);else warnings.push(msg)}}materialCost+=capCost;
    const unitCost=Math.round(materialCost+printCost),baseSale=pesosToCents(qs('#productionSalePrice')?.value||0),capSale=capVisible?pesosToCents(qs('#mockupCapSalePrice')?.value||0):0,sale=baseSale+capSale,profit=sale-unitCost,margin=sale>0?(profit/sale)*100:0;return {unitCost,materialCost:Math.round(materialCost),printCost:Math.round(printCost),baseSale,capSale,capCost,sale,profit,margin,lines,missing,warnings,finalQty,stockKind};
  }
  function calcProductionBuilderCost(){const host=qs('#productionBuilderCost');if(!host)return;const c=productionBuilderCostData();host.innerHTML=`<div><span>Precio total de venta</span><strong>${money(c.sale)}</strong><small>${c.capSale?`Prenda ${money(c.baseSale)} + gorra ${money(c.capSale)}`:'Precio que ingresaste arriba'}</small></div><div><span>Costo materia prima${c.capCost?' (incluye gorra)':''}</span><strong>${money(c.materialCost)}</strong></div><div><span>Costo estampas</span><strong>${money(c.printCost)}</strong></div><div class="production-cost-main"><span>Costo unitario estimado</span><strong>${money(c.unitCost)}</strong></div><div><span>Ganancia estimada por unidad</span><strong class="${c.profit>=0?'profit-positive':'profit-negative'}">${money(c.profit)}</strong><small>${c.sale>0?`${c.margin.toFixed(1)}% sobre venta`:'Ingresá un precio de venta'}</small></div><div><span>Ganancia estimada del lote</span><strong class="${c.profit>=0?'profit-positive':'profit-negative'}">${money(c.profit*c.finalQty)}</strong><small>${c.finalQty} unidad${c.finalQty===1?'':'es'}</small></div>${c.lines.length?`<small class="production-cost-lines">${c.lines.map(escapeHtml).join(' · ')}</small>`:''}${c.warnings.length?`<div class="notice">${c.warnings.map(escapeHtml).join('<br>')}</div>`:''}${c.missing.length?`<div class="notice danger">${c.missing.map(escapeHtml).join('<br>')}</div>`:''}`;}
  async function loadProductionPriceSuggestion(materialId){if(state.productionPriceDirty||!materialId)return;try{const d=await api(`/api/admin/production/price-suggestion?materialId=${Number(materialId)}`);if(Number(d.price_cents)>0&&!state.productionPriceDirty){const el=qs('#productionSalePrice');if(el){el.value=centsToPesos(d.price_cents);calcProductionBuilderCost();}}}catch{}}
  function productionShippingDefaults(type,capacity=0){
    const cap=Math.max(0,Number(capacity)||0);
    if(type==='shirt')return {weight:250,height:4,width:25,depth:30,label:'Remera doblada'};
    if(type==='chomba')return {weight:320,height:5,width:28,depth:34,label:'Chomba doblada'};
    if(type==='hoodie')return {weight:650,height:12,width:30,depth:38,label:'Buzo doblado'};
    if(type==='cap')return {weight:180,height:12,width:22,depth:24,label:'Gorra protegida'};
    if(type==='mug'){if(cap>=450)return {weight:550,height:14,width:14,depth:14,label:`Taza ${cap||500} ml`};return {weight:420,height:12,width:12,depth:12,label:`Taza ${cap||330} ml`}}
    if(type==='glass'){if(cap>=900)return {weight:550,height:30,width:12,depth:12,label:`Vaso ${cap} ml`};if(cap>=600)return {weight:450,height:26,width:11,depth:11,label:`Vaso ${cap} ml`};return {weight:350,height:22,width:10,depth:10,label:`Vaso ${cap||500} ml`}}
    if(type==='thermos'){if(cap>=900)return {weight:760,height:35,width:11,depth:11,label:`Termo ${cap} ml`};if(cap>=600)return {weight:600,height:32,width:10,depth:10,label:`Termo ${cap} ml`};return {weight:430,height:28,width:9,depth:9,label:`Termo ${cap||500} ml`}}
    if(type==='bag')return {weight:250,height:5,width:30,depth:35,label:'Bolso plegado'};
    return {weight:500,height:10,width:20,depth:30,label:'Estimación editable'};
  }
  function applyProductionShippingDefaults(force=false){
    if(state.productionShippingDirty&&!force)return;
    const primary=productionPrimaryMaterial(),type=qs('#productionMaterialType')?.value||'shirt',cap=Number(primary?.capacity_ml)||Number(qs('#productionCapacity')?.value)||0,d=productionShippingDefaults(type,cap);
    if(qs('#productionCapacity')&&materialUsesCapacity(type))qs('#productionCapacity').value=cap||d.capacity||'';
    for(const [id,key] of [['productionWeight','weight'],['productionHeight','height'],['productionWidth','width'],['productionDepth','depth']]){const el=qs(`#${id}`);if(el&&(force||!el.value))el.value=d[key]}
    const hint=qs('#productionShippingHint');if(hint)hint.textContent=`Sugerido · ${d.label}`;
  }
  function syncProductionPublicationDefaults(){const primary=productionPrimaryMaterial(),type=qs('#productionMaterialType')?.value||'shirt',cat=productionCategoryGuess(type),catInput=qs('#productionCategory');if(catInput)catInput.value=cat?String(cat.id):'';if(primary&&qs('#productionCapacity')&&Number(primary.capacity_ml)>0&&!qs('#productionCapacity').value)qs('#productionCapacity').value=String(Number(primary.capacity_ml));applyProductionShippingDefaults();}
  function setProductionTab(tab){state.productionWizardTab=Number(tab)||1;qsa('[data-production-tab]').forEach(b=>b.classList.toggle('active',Number(b.dataset.productionTab)===state.productionWizardTab));qsa('[data-production-panel]').forEach(p=>p.classList.toggle('hidden',Number(p.dataset.productionPanel)!==state.productionWizardTab));qs('#productionBackBtn')?.classList.toggle('hidden',state.productionWizardTab!==2);qs('#saveProductionBtn')?.classList.toggle('hidden',state.productionWizardTab!==2);if(state.productionWizardTab===2){syncProductionPublicationDefaults();renderMediaManager('productionMediaOrderList');}}
  async function renderProduction(){const [jobs,products]=await Promise.all([api('/api/admin/production'),api('/api/admin/products')]);state.productionJobs=jobs.items||[];state.products=products.items||[];const active=state.productionJobs.filter(x=>x.status==='in_progress');qs('#adminContent').innerHTML=`<div class="admin-section-head"><div><h2 style="margin:0">Producción</h2><p class="muted" style="margin:4px 0 0">Elegí materia prima y diseños, calculá el costo y completá la publicación en el mismo flujo.</p></div><button class="btn btn-primary" id="newProductionBtn">+ Armar producto</button></div><div class="kpi-grid"><div class="kpi"><small>En producción</small><strong>${active.reduce((s,x)=>s+Number(x.quantity||0),0)}</strong></div><div class="kpi"><small>Lotes abiertos</small><strong>${active.length}</strong></div></div><section class="admin-section"><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Lote</th><th>Producto</th><th>Variante</th><th>Cantidad</th><th>Costo unitario</th><th>Estado</th><th></th></tr></thead><tbody>${state.productionJobs.length?state.productionJobs.map(j=>`<tr><td><strong>${escapeHtml(j.code)}</strong><small class="table-sub">${new Date(j.started_at).toLocaleDateString('es-AR')}</small></td><td>${escapeHtml(j.product_name)}</td><td>${escapeHtml([j.color,j.size,j.fit].filter(Boolean).join(' · ')||'Única')}</td><td>${Number(j.quantity)||0}</td><td>${money(j.unit_cost_cents)}</td><td><span class="status ${j.status==='completed'?'success':j.status==='cancelled'?'danger':'warning'}">${j.status==='completed'?'Terminado':j.status==='cancelled'?'Cancelado':'En producción'}</span></td><td>${j.status==='in_progress'?`<div class="admin-actions"><button class="btn btn-primary" data-complete-production="${j.id}">Marcar terminado</button><button class="btn btn-danger" data-cancel-production="${j.id}">Cancelar</button></div>`:'—'}</td></tr>`).join(''):'<tr><td colspan="7">Todavía no hay lotes de producción.</td></tr>'}</tbody></table></div></section>`;}
  async function openProductionDialog(){await Promise.all([ensureCategories(),ensureCostingData(true),loadMockupAssets()]);syncProductionCustomTypes();if(!state.products.length){const d=await api('/api/admin/products');state.products=d.items||[]}state.productionMaterialsSelected=[];state.productionDesignsSelected=[];state.mockupCapDesign=null;state.mockupSelectedLayer='';state.productionPriceDirty=false;state.productionShippingDirty=false;state.mediaItems=[];state.newFiles=[];state.mediaHostId='productionMediaOrderList';qs('#productionQuantity').value='1';qs('#productionWaste').value='10';renderProductionWasteSheets();qs('#productionSalePrice').value='';qs('#productionNotes').value='';qs('#productionProductName').value='';qs('#productionCategory').value='';qs('#productionStockKind').value='physical';qs('#productionStatus').value='draft';qs('#mockupSideSelect').value='front';qs('#mockupGenderSelect').value='Varón';qs('#mockupModelSelect').value='';qs('#mockupGarmentStyleSelect').value='';qs('#mockupCapStyleSelect').value='';qs('#mockupBaseSelect').value='';qs('#mockupBackgroundSelect').value='';qs('#mockupCapSalePrice').value='';qs('#mockupCapMaterialSelect').value='';state.mockupZoom=1;state.mockupPanX=0;state.mockupPanY=0;applyMockupZoom();['productionDescription','productionMeaning','productionVerse','productionVerseReference','productionCapacity','productionWeight','productionHeight','productionWidth','productionDepth'].forEach(id=>{const el=qs(`#${id}`);if(el)el.value=''});['productionIsNew','productionFeatured','productionBestseller'].forEach(id=>{const el=qs(`#${id}`);if(el)el.checked=false});renderProductionMaterialGallery();renderProductionSelectedMaterials();renderProductionDesignGallery();renderProductionSelectedDesigns();renderMockupStudioOptions();refreshMockupPreview().catch(()=>{});applyProductionShippingDefaults(true);setProductionTab(1);qs('#productionDialog')?.showModal();}
  async function saveProductionBuilder(){
    const primary=productionPrimaryMaterial(),type=qs('#productionMaterialType')?.value||'shirt',stockKind=qs('#productionStockKind')?.value||'physical',qty=Math.max(1,Number(qs('#productionQuantity')?.value)||1),name=String(qs('#productionProductName')?.value||'').trim(),cost=productionBuilderCostData();
    if(!state.productionMaterialsSelected.length)throw new Error('Elegí al menos una materia prima.');if(stockKind==='physical'&&cost.missing.length)throw new Error(cost.missing[0]);if(!name)throw new Error('Completá el nombre del producto.');if(cost.sale<=0)throw new Error('Ingresá el precio de venta.');
    const cat=await ensureProductionCategory(type);if(!cat?.id)throw new Error('No pude determinar la categoría del producto.');
    const capMaterialId=!qs('#productionCapPriceBox')?.classList.contains('hidden')?Number(qs('#mockupCapMaterialSelect')?.value)||0:0,categoryId=Number(cat.id),recipe={baseMaterialType:'',baseMaterialName:'',wastePercent:Math.max(0,Number(qs('#productionWaste')?.value)||0),extraCostCents:0,designs:state.productionDesignsSelected.map(x=>({designAssetId:Number(x.designAssetId),quantity:Number(x.quantity)||1,widthCm:Number(x.widthCm)||0,heightCm:Number(x.heightCm)||0,measureOptionId:x.measureOptionId||'',measureLabel:x.measureLabel||'',printSide:x.printSide||'front'})),materials:[...state.productionMaterialsSelected.map(x=>({materialId:Number(x.materialId),quantity:Number(x.quantity)||1})),...(capMaterialId?[{materialId:capMaterialId,quantity:1}]:[])]};
    const variant={color:primary?.color||'',size:materialIsGarment(type)?(primary?.size||''):'',stock:stockKind==='to_stock'?qty:0,stockKind,sku:''};
    const payload={name,category_id:categoryId,status:qs('#productionStatus')?.value||'draft',price_cents:cost.sale,compare_at_cents:0,cost_cents:cost.unitCost,recipe,short_description:qs('#productionDescription')?.value||'',meaning_text:qs('#productionMeaning')?.value||'',verse_text:qs('#productionVerse')?.value||'',verse_reference:qs('#productionVerseReference')?.value||'',fit:primary?.fit||'',audience:primary?.gender||'',sale_mode:'stock',inventory_stage:'to_print',garment_ready:1,print_ready:state.productionDesignsSelected.length?1:0,capacity_ml:Number(qs('#productionCapacity')?.value)||Number(primary?.capacity_ml)||0,is_new:qs('#productionIsNew')?.checked?1:0,is_featured:qs('#productionFeatured')?.checked?1:0,is_bestseller:qs('#productionBestseller')?.checked?1:0,weight_grams:Number(qs('#productionWeight')?.value)||0,height_cm:Number(qs('#productionHeight')?.value)||0,width_cm:Number(qs('#productionWidth')?.value)||0,depth_cm:Number(qs('#productionDepth')?.value)||0,variants:[variant]};
    const d=await api('/api/admin/products',{method:'POST',body:JSON.stringify(payload)});const productId=Number(d.item.id);const orderedIds=[];for(const item of state.mediaItems){if(!item.file)continue;const f=new FormData();f.append('file',item.file);const uploaded=await api(`/api/admin/products/${productId}/media`,{method:'POST',body:f});orderedIds.push(Number(uploaded.id));}if(orderedIds.length)await api(`/api/admin/products/${productId}/media-order`,{method:'PATCH',body:JSON.stringify({ids:orderedIds})});
    if(stockKind==='physical'){const pd=await api(`/api/admin/products/${productId}`),variantId=Number(pd.item?.variants?.[0]?.id);if(!variantId)throw new Error('No se pudo crear la variante del producto.');await api('/api/admin/production',{method:'POST',body:JSON.stringify({productId,variantId,quantity:qty,notes:qs('#productionNotes')?.value||''})});}
    state.costingLoaded=false;return {productId,stockKind};
  }
  function openPurchaseColorDialog(row){
    state.colorEditorRow=Number(row);
    const d=qs('#purchaseColorDialog'),host=qs('#purchaseColorDialogGrid');if(!d||!host)return;
    const current=normalizeOption(state.purchaseItems[state.colorEditorRow]?.color||'');
    host.innerHTML=purchaseColorOptions().map(v=>`<button type="button" class="purchase-color-dialog-option ${current===v?'active':''}" data-purchase-color-dialog="${escapeHtml(v)}"><span class="color-dot" style="--swatch:${escapeHtml(colorSwatch(v))}"></span><span>${escapeHtml(v)}</span></button>`).join('')+`<button type="button" class="purchase-color-dialog-option color-other" data-purchase-color-dialog="__other__"><span class="color-dot custom-color-dot"></span><span>Otro color…</span></button>`;
    d.showModal();
  }
  function closePurchaseColorDialog(){qs('#purchaseColorDialog')?.close();state.colorEditorRow=null;}
  function openOtherEditor({row,field,label,kind='value'}){state.otherEditor={row:Number(row),field,label,kind};const d=qs('#otherValueDialog');if(!d)return;qs('#otherValueTitle').textContent=`Agregar ${label}`;qs('#otherValueInput').value='';d.showModal();setTimeout(()=>qs('#otherValueInput')?.focus(),30);}
  function saveOtherEditor(){const o=state.otherEditor,v=normalizeOption(qs('#otherValueInput')?.value||'');if(!o||!v)return;if(o.kind==='finance'){qs('#movementCategoryOther').value=v;rememberFinanceReason(v);renderFinanceReasonSelector(v);}else{const x=state.purchaseItems[o.row];if(!x)return;if(o.field==='customTypeLabel'){const code=safeCustomTypeCode(v);x.materialType=code;if(!customTypeEntries().some(t=>t.code===code))state.purchaseOptions.types.push({code,label:v});}else{x[o.field]=v;if(o.field==='fit')addPurchaseOption('fits',v);else if(o.field==='materialClass')addPurchaseOption('classes',v);else if(o.field==='size')addPurchaseOption('sizes',v,normalizePurchaseClass(x.materialClass)||'OTROS');else if(o.field==='color')addPurchaseOption('colors',v);else if(o.field==='name')addPurchaseOption('materials',v,x.materialType);}renderPurchaseItems();persistAdminOptionSettings().catch(()=>{});}qs('#otherValueDialog')?.close();state.otherEditor=null;}

  function financeReasonOptions(current=''){return uniqOptions([...FINANCE_BASIC_REASONS,...(state.purchaseOptions.financeReasons||[]),...(state.recentFinanceReasons||[]),current])}
  function renderFinanceReasonSelector(current=''){
    const select=qs('#movementCategorySelect'),input=qs('#movementCategoryOther');if(!select||!input)return;
    const options=financeReasonOptions(current),known=options.some(v=>v.toLocaleLowerCase('es')===String(current||'').toLocaleLowerCase('es'));
    select.innerHTML='<option value="">Elegir motivo...</option>'+options.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')+'<option value="__other__">＋ Otro...</option>';
    if(current){select.value=known?current:'';input.value=current;}else{select.value='';input.value='';}
    input.classList.add('hidden');
  }
  async function rememberFinanceReason(value){value=normalizeOption(value);if(!value||FINANCE_BASIC_REASONS.includes(value))return;addPurchaseOption('financeReasons',value);try{await persistAdminOptionSettings()}catch{}}

  function financePaymentDetail(m){
    const method=m.payment_method||'',label={cash:'Efectivo',transfer:'Transferencia',mixed:'Efectivo + transferencia'}[method]||'Sin especificar';
    let payments=m.payments||[];if(!payments.length){try{payments=JSON.parse(m.payment_json||'[]')}catch{}}
    const details=payments.map(p=>[p.method==='transfer'?'Transferencia':'Efectivo',money(p.amountCents??p.amount_cents),p.origin,p.destination,p.reference,p.details].filter(Boolean).map(escapeHtml).join(' · ')).join('<br>');
    return `<strong>${label}</strong>${Number(m.surcharge_cents)>0?`<small class="table-sub">Base ${money(m.base_cents)} + recargo ${m.surcharge_type==='percent'?`${Number(m.surcharge_value)}% · `:''}${money(m.surcharge_cents)}</small>`:''}${details?`<details class="finance-row-detail"><summary>Ver pago</summary><div>${details}</div></details>`:''}`;
  }


  function setMovementReadOnly(readOnly){
    const form=qs('#movementForm');state.movementReadOnly=readOnly;
    qsa('.dialog-body input,.dialog-body select,.dialog-body textarea,#movementSaleSection button',form).forEach(el=>el.disabled=readOnly);
    qs('#saveMovementBtn').classList.toggle('hidden',readOnly);qs('#editViewedMovementBtn').classList.toggle('hidden',!readOnly);
    qs('#movementAttachmentUpload').classList.toggle('hidden',readOnly);
    qs('#movementDialogTitle').textContent=readOnly?'Detalle del movimiento':'Editar ingreso / egreso';
    state.editingMovementId=readOnly?null:state.viewingMovementId;
  }
  async function openSourcePurchase(id){
    let purchase=state.purchases.find(x=>Number(x.id)===Number(id));
    if(!purchase){const r=reportRangeDates(),data=await api(`/api/admin/purchases?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);purchase=(data.items||[]).find(x=>Number(x.id)===Number(id));}
    if(!purchase)throw new Error('No encontramos la compra en el período seleccionado.');await openPurchaseDialog(purchase);
  }
  async function openMovementDialog(id,readOnly=false){
    const m=(state.financeMovements||[]).find(x=>Number(x.id)===id);if(!m)return;
    await ensureAdminOptionSettings();const form=qs('#movementForm');setMovementReadOnly(false);form.reset();state.viewingMovementId=id;
    form.elements.type.value=m.type==='income'?'income':'expense';renderFinanceReasonSelector(m.category||'');form.elements.description.value=m.description||'';
    form.elements.origin.value=m.origin||'';form.elements.destination.value=m.destination||'';loadMovementPayment(m);await loadMovementSale(m);form.elements.date.value=String(m.occurred_at||'').slice(0,10);
    qs('#movementExistingAttachments').innerHTML=(m.attachments||[]).map(a=>`<a class="btn btn-ghost" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">Abrir comprobante</a>`).join('');
    setMovementReadOnly(readOnly||m.source_kind==='purchase');qs('#editViewedMovementBtn').textContent='Editar';qs('#movementDialog').showModal();
  }

  async function renderExpenses(){
    const r=reportRangeDates();const d=await api(`/api/admin/finance?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const s=d.summary||{};state.financeMovements=d.movements||[];state.recentFinanceReasons=uniqOptions((d.movements||[]).map(m=>m.category));
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head expenses-head"><div>${reportFiltersHtml()}</div><button class="btn btn-primary" id="newMovementBtn">+ Movimiento manual</button></div>
      <div class="kpi-grid"><div class="kpi"><small>Egresos</small><strong>− ${money(s.expensesCents)}</strong></div><div class="kpi"><small>Otros ingresos</small><strong>${money(s.extraIncomeCents)}</strong></div><div class="kpi"><small>Ventas</small><strong>${money(s.productSalesCents)}</strong></div><div class="kpi"><small>Balance</small><strong>${money(s.balanceCents)}</strong></div></div>
      <section class="admin-section"><div class="admin-section-head"><h2>Movimientos cargados</h2></div><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Editar</th><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Detalle</th><th>Forma</th><th>Origen</th><th>Destino</th><th>Importe</th><th>Adjuntos</th><th></th></tr></thead><tbody>${(d.movements||[]).length?(d.movements||[]).map(m=>`<tr><td>${m.source_kind==='purchase'?`<button class="btn btn-ghost" data-edit-source-purchase="${m.source_id}">Editar</button>`:`<button class="btn btn-ghost" data-edit-movement="${m.id}">Editar</button>`}</td><td>${new Date(m.occurred_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'2-digit'})}</td><td><span class="status ${m.type==='income'?'success':'warning'}">${m.type==='income'?'Ingreso':m.type==='investment'?'Inversión':'Egreso'}</span></td><td>${escapeHtml(m.category||'—')}</td><td><button class="btn btn-ghost" data-open-movement="${m.id}">Abrir</button>${m.description?`<details class="finance-row-detail"><summary>Ver detalle</summary><div>${escapeHtml(m.description)}</div></details>`:'—'}</td><td>${financePaymentDetail(m)}</td><td>${escapeHtml(m.origin||'—')}</td><td>${escapeHtml(m.destination||'—')}</td><td class="${m.type==='expense'||m.type==='investment'?'money-negative':''}">${m.type==='expense'||m.type==='investment'?'− ':''}${money(m.amount_cents)}</td><td><div class="finance-attachments">${(m.attachments||[]).map(a=>`<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="Comprobante"></a>`).join('')||'—'}</div></td><td>${m.source_kind==='purchase'?`<span class="status success">Desde Compras</span>`:`<button class="btn btn-danger" data-delete-movement="${m.id}">Eliminar</button>`}</td></tr>`).join(''):'<tr><td colspan="11">Todavía no cargaste movimientos.</td></tr>'}</tbody></table></div></section>`;
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

  const DESIGN_USES=['Todos','Remeras','Tazas','Mates','Gorras','Chombas','Buzos','Vasos','Termos','Bolsos','Otros'];
  function designKindLabel(a){return a.kind==='sheet'?'Plancha':'Individual'}
  function designScopeLabel(a){return a.scope==='clients'?'Clientes':a.scope==='salmos'?'SALMOS':'Planchas mixtas'}
  function parseDesignUses(a){try{return Array.isArray(a.uses)?a.uses:JSON.parse(a.uses_json||'[]')}catch{return []}}
  function parseDesignUseMeasures(a){try{return a.use_measures&&typeof a.use_measures==='object'?a.use_measures:JSON.parse(a.use_measures_json||'{}')}catch{return {}}}
  function parseDesignMeasureOptions(a={}){
    let options=[];try{options=Array.isArray(a.measure_options)?a.measure_options:JSON.parse(a.measure_options_json||'[]')}catch{}
    if(options.length)return options;
    const legacy=Object.entries(parseDesignUseMeasures(a)).filter(([,m])=>Number(m?.widthCm)>0&&Number(m?.heightCm)>0).map(([destination,m],i)=>({id:`legacy-${i}`,destination,size:'',detail:'',widthCm:Number(m.widthCm),heightCm:Number(m.heightCm)}));
    if(Number(a.width_cm)>0&&Number(a.height_cm)>0)for(const destination of parseDesignUses(a))if(!legacy.some(x=>x.destination===destination))legacy.push({id:`legacy-${legacy.length}`,destination,size:'',detail:'',widthCm:Number(a.width_cm),heightCm:Number(a.height_cm)});
    if(!legacy.length&&a.kind!=='sheet'&&Number(a.width_cm)>0&&Number(a.height_cm)>0)legacy.push({id:'original',destination:'Todos',size:'',detail:'',widthCm:Number(a.width_cm),heightCm:Number(a.height_cm)});
    return legacy;
  }
  function designDestinations(o){const arr=Array.isArray(o.destinations)?o.destinations:[o.destination||'Todos'];return [...new Set(arr.filter(Boolean))];}
  function designMeasureLabel(o){return [designDestinations(o).join(' / '),o.size?`Talle ${o.size}`:'',o.detail,`${Number(o.widthCm)} × ${Number(o.heightCm)} cm`,o.sources?.length?`Origen: ${o.sources.map(s=>s.name||s.fileName||'plancha').join(', ')}`:''].filter(Boolean).join(' · ')}
  function designDestinationPicker(o={}){
    const values=designDestinations(o),choices=[...new Set([...DESIGN_USES,...values])];
    return `<details class="design-destinations"><summary data-destinations-summary>${escapeHtml(values.join(' / '))}</summary><div class="destination-options">${choices.map(v=>`<label><input type="checkbox" data-design-destination value="${escapeHtml(v)}" ${values.includes(v)?'checked':''}>${escapeHtml(v)}</label>`).join('')}<label class="field">Otro destino<input class="input" data-destination-custom placeholder="Ej.: Botellas"></label></div></details>`;
  }
  function designMeasureRow(o={}){
    const id=o.id||crypto.randomUUID();
    return `<div class="design-measure-option-row" data-measure-option data-measure-id="${escapeHtml(id)}" data-measure-sources="${escapeHtml(JSON.stringify(o.sources||[]))}"><div class="field"><label>Destino · podés elegir varios</label>${designDestinationPicker(o)}</div><label class="field">Talle (opcional)<input class="input" data-measure-field="size" value="${escapeHtml(o.size||'')}" placeholder="Ej.: L"></label><label class="field">Ancho / largo (cm)<input class="input" data-measure-field="widthCm" type="number" min=".01" step=".01" value="${Number(o.widthCm)||''}" placeholder="30"></label><label class="field">Alto (cm)<input class="input" data-measure-field="heightCm" type="number" min=".01" step=".01" value="${Number(o.heightCm)||''}" placeholder="40"></label><label class="field measure-detail-field">Detalle (opcional)<input class="input" data-measure-field="detail" value="${escapeHtml(o.detail||'')}" placeholder="Ej.: espalda, pecho o mate de 250 ml"></label>${o.sources?.length?`<div class="field full measure-origin-field"><label>Origen guardado · ${o.sources.reduce((n,s)=>n+Math.max(1,Number(s.quantity)||0),0)} aparición/es</label>${designOriginHtml(o)}</div>`:''}<button class="icon-btn measure-remove" type="button" data-remove-measure-option aria-label="Quitar opción de medidas">×</button></div>`;
  }
  function designMeasureEditor(key,options=[]){return `<div class="design-measure-editor" data-measure-editor="${key}"><div class="admin-section-head"><div><strong>Destinos y medidas</strong><p class="muted">“Todos” deja el uso sin especificar. Podés marcar varios destinos para una misma medida.</p></div><button class="btn btn-ghost" type="button" data-add-measure-option>+ Agregar opción</button></div><div data-measure-rows>${(options.length?options:[{}]).map(designMeasureRow).join('')}</div></div>`}
  function readDesignMeasureOptions(root){
    return qsa('[data-measure-option]',root).flatMap((row,i)=>{
      const field=name=>String(qs(`[data-measure-field="${name}"]`,row)?.value||'').trim();
      const size=field('size'),detail=field('detail'),w=field('widthCm'),h=field('heightCm');if(!size&&!detail&&!w&&!h)return [];
      const custom=String(qs('[data-destination-custom]',row)?.value||'').trim();let destinations=qsa('[data-design-destination]:checked',row).map(x=>x.value);if(custom)destinations=[...destinations.filter(x=>x!=='Todos'),custom];
      if(destinations.includes('Todos'))destinations=['Todos'];if(!destinations.length)destinations=['Todos'];
      const widthCm=Number(w),heightCm=Number(h);if(!Number.isFinite(widthCm)||!Number.isFinite(heightCm)||widthCm<.01||heightCm<.01||widthCm>10000||heightCm>10000)throw new Error(`Completá ancho y alto válidos en la opción ${i+1}.`);
      let sources=[];try{sources=JSON.parse(row.dataset.measureSources||'[]')}catch{}return [{id:row.dataset.measureId,destination:destinations.join(' / '),destinations,size,detail,widthCm,heightCm,sources}];
    });
  }
  function sheetRoot(key){return qs(key==='upload'?'#designUploadDialog':'#designDetailEditor')}
  function sheetKind(key){return qs(key==='upload'?'#designUploadKind':'[data-design-kind]',sheetRoot(key))?.value||'individual'}
  function sheetScope(key){return qs(key==='upload'?'#designUploadScope':'[data-design-scope]',sheetRoot(key))}
  function sheetSize(key){const root=sheetRoot(key);return {width:Number(qs(key==='upload'?'#designUploadWidth':'[data-design-width]',root)?.value)||0,height:Number(qs(key==='upload'?'#designUploadHeight':'[data-design-height]',root)?.value)||0}}
  function sheetComponents(key){return (state.designSheetDrafts?.[key]||[]).map(c=>{const a=state.designAssets.find(x=>Number(x.id)===Number(c.designAssetId)),o=a&&parseDesignMeasureOptions(a).find(x=>x.id===c.measureOptionId)||c.pendingMeasureOption;return {...c,...(o||{}),measureOptionId:c.measureOptionId,name:a?.name||c.name,scope:a?.scope||c.scope}})}
  function sheetMetrics(width,height,components,costCents=1000000){
    const total=width*height,boxes=[];components.forEach((c,i)=>(c.previewBoxes||[]).forEach(b=>boxes.push({x:Number(b.x),y:Number(b.y),x2:Number(b.x)+Number(b.width),y2:Number(b.y)+Number(b.height),i})));
    const marked=components.length>0&&components.every(c=>(c.previewBoxes||[]).length===Number(c.quantity));let used=0;const areas=components.map(()=>0);
    if(marked&&boxes.length){const xs=[...new Set(boxes.flatMap(b=>[b.x,b.x2]))].sort((a,b)=>a-b),ys=[...new Set(boxes.flatMap(b=>[b.y,b.y2]))].sort((a,b)=>a-b);
      for(let x=0;x<xs.length-1;x++)for(let y=0;y<ys.length-1;y++){const cx=(xs[x]+xs[x+1])/2,cy=(ys[y]+ys[y+1])/2,active=boxes.filter(b=>b.x<=cx&&b.x2>=cx&&b.y<=cy&&b.y2>=cy);if(!active.length)continue;const area=(xs[x+1]-xs[x])*(ys[y+1]-ys[y])*total;used+=area;active.forEach(b=>areas[b.i]+=area/active.length)}
    }else components.forEach((c,i)=>{areas[i]=(Number(c.widthCm)||0)*(Number(c.heightCm)||0)*(Number(c.quantity)||0);used+=areas[i]});
    const componentCosts=areas.map(a=>total>0?Math.round(a/total*costCents):0),allocated=componentCosts.reduce((a,b)=>a+b,0);
    return {total,used,waste:Math.max(0,total-used),percent:total>0?Math.max(0,total-used)/total*100:0,valid:total>0&&used>0&&used<=total+.0001,componentCosts,allocated,wasteCost:Math.max(0,costCents-allocated),marked};
  }
  function sheetMetricsHtml(width,height,components,costCents=1000000){
    const m=sheetMetrics(width,height,components,costCents),n=v=>Number(v).toLocaleString('es-AR',{maximumFractionDigits:2});
    if(!width||!height)return '<p class="muted">Ingresá la superficie total para calcular el desperdicio.</p>';
    return `<div class="sheet-surface-summary"><span>Plancha <b>${n(m.total)} cm² · ${money(costCents)}</b></span><span>Diseños <b>${n(m.used)} cm² · ${money(m.allocated)}</b></span><span>Desperdicio <b>${n(m.waste)} cm² · ${n(m.percent)}% · ${money(m.wasteCost)}</b></span></div>${m.used>m.total?'<p class="sheet-area-error" role="alert">Los diseños superan la superficie de la plancha.</p>':''}<small class="field-help">${m.marked?'Costo proporcional a los recuadros marcados. En cruces de recuadros, la superficie compartida se reparte sin cobrarla dos veces.':'Estimación con medidas y cantidades: corregí los recuadros de esta plancha para obtener el cálculo del acomodo.'}</small>`;
  }
  function fitSheetPreview(canvas){
    const viewport=canvas?.closest('.sheet-preview-viewport'),img=qs('img',canvas||document);
    if(!viewport||!img?.naturalWidth||!viewport.clientWidth||!viewport.clientHeight)return;
    const scale=Math.min((viewport.clientWidth-16)/img.naturalWidth,(viewport.clientHeight-16)/img.naturalHeight)*(state.sheetZoom||1);
    canvas.style.width=`${Math.max(1,Math.floor(img.naturalWidth*scale))}px`;
    canvas.style.height=`${Math.max(1,Math.floor(img.naturalHeight*scale))}px`;
  }
  function sheetHasPendingUpload(key){return Boolean(qs('[data-missing-sheet-file]',sheetRoot(key))?.files?.length);}
  function syncSheetUploadGate(key){
    const root=sheetRoot(key),dialog=root?.closest('dialog');if(!dialog)return;
    const pending=sheetHasPendingUpload(key),panel=qs('.sheet-missing-upload',root);
    for(const control of qsa('input,select,textarea,button',dialog)){
      if(panel?.contains(control))continue;
      if(pending){if(control.dataset.sheetUploadBlocked===undefined)control.dataset.sheetUploadBlocked=control.disabled?'1':'0';control.disabled=true;}
      else if(control.dataset.sheetUploadBlocked!==undefined){control.disabled=control.dataset.sheetUploadBlocked==='1';delete control.dataset.sheetUploadBlocked;}
    }
    qsa('.sheet-design-library,[data-sheet-preview],[data-sheet-selected]',root).forEach(el=>el.inert=pending);
    panel?.classList.toggle('sheet-upload-pending',pending);
    const cancel=qs('[data-cancel-missing-sheet-design]',panel||root);if(cancel)cancel.classList.toggle('hidden',!pending);
  }
  function filterSheetGallery(key){
    const root=sheetRoot(key),query=String(qs('[data-sheet-search]',root)?.value||'').trim().toLocaleLowerCase();
    (state.sheetSearch??={})[key]=query;
    qsa('[data-add-sheet-design]',root).forEach(button=>{const a=state.designAssets.find(a=>Number(a.id)===Number(button.dataset.addSheetDesign));button.classList.toggle('hidden',!a||!designVisible('sheet-'+key,a)||Boolean(query)&&!`${a.name||''} ${a.file_name||''}`.toLocaleLowerCase().includes(query));});
  }
  function sheetMarkNumber(rows,rowIndex,boxIndex){return rows.slice(0,rowIndex).reduce((n,c)=>n+(c.previewBoxes?.length||0),0)+boxIndex+1;}
  function sheetCompositionEditor(key){const missingUpload=`<div class="sheet-missing-upload"><label class="field">Diseño individual faltante<input class="input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-missing-sheet-file></label><label class="field">Nombre del diseño<input class="input" maxlength="160" data-missing-sheet-name placeholder="Nombre para la biblioteca"></label><label class="field">Sección<select class="select" data-missing-sheet-scope><option value="salmos">SALMOS</option><option value="clients">Clientes</option></select></label><button type="button" class="btn btn-ghost" data-upload-missing-sheet-design>Subir y agregar</button><button type="button" class="btn btn-ghost hidden" data-cancel-missing-sheet-design>Descartar archivo pendiente</button><small class="sheet-missing-status" data-missing-upload-status role="status" aria-live="polite"></small></div><small class="field-help">Se añade al principio de la galería de su sección. Después marcá sus apariciones en la plancha.</small>`;return `<section class="sheet-composition" data-sheet-editor="${key}"><div class="sheet-composition-heading"><div><h3>Diseños que componen la plancha</h3><p class="muted">Seleccioná todos los diseños, tengan o no medidas. Elegí un diseño y arrastrá un recuadro alrededor de su aparición. Los ajustes quedan abiertos al terminar de marcar. Revisá cada medida antes de guardar.</p></div></div><div class="sheet-detection-status" data-sheet-detection-status aria-live="polite"></div><div class="sheet-design-library"><label class="field">Buscar diseños<input class="input" type="search" data-sheet-search value="${escapeHtml(state.sheetSearch?.[key]||'')}" placeholder="Nombre del diseño"></label>${designTagFilterHtml('sheet-'+key,state.designAssets.filter(a=>a.kind==='individual'))}${['salmos','clients'].map(scope=>`<h4>${scope==='salmos'?'SALMOS':'Clientes'}</h4><div class="sheet-sample-gallery">${state.designAssets.filter(a=>a.kind==='individual'&&a.scope===scope).sort((a,b)=>{const rank=id=>{const n=(state.sheetUploadRecent||[]).indexOf(Number(id));return n<0?Infinity:n};return rank(a.id)-rank(b.id)}).map(a=>`<button type="button" class="sheet-sample" data-add-sheet-design="${a.id}" data-sheet-key="${key}"  title="${escapeHtml(a.name||a.file_name)}"><span>${String(a.mime_type||'').startsWith('image/')?`<img src="${apiUrl(`/api/admin/design-assets/${a.id}/file`)}" alt="${escapeHtml(a.name||a.file_name)}" loading="lazy">`:'Archivo'}</span><small>${escapeHtml(a.name||a.file_name)}</small>${key==='upload'?'':parseDesignMeasureOptions(a).length?'':'<small>Agregar medida</small>'}</button>`).join('')||'<p class="muted">Sin diseños individuales.</p>'}</div>`).join('')}</div><div class="sheet-composition-layout"><aside class="sheet-preview" data-sheet-preview></aside><div>${missingUpload}<div data-sheet-selected></div><div data-sheet-metrics></div>${key==='upload'?'<label class="sheet-confirm-composition"><input type="checkbox" id="designSheetCompositionComplete"><span>Confirmo que marqué cada aparición de todos los diseños de esta plancha y revisé sus medidas.</span></label>':''}</div></div></section>`}
  function sheetCompositionFingerprint(){const file=state.sheetUploadPreview?.file,size=sheetSize('upload');return JSON.stringify({width:size.width,height:size.height,file:file?`${file.name}:${file.size}:${file.lastModified}`:'',components:(state.designSheetDrafts.upload||[]).map(c=>[Number(c.designAssetId),String(c.measureOptionId||c.pendingMeasureOption?.id||''),Number(c.quantity)||0,c.previewBoxes||[],c.previewMarks||[]])});}
  function renderSheetSelected(key){
    const root=sheetRoot(key),host=qs('[data-sheet-selected]',root);if(!host)return;const components=sheetComponents(key);if(key==='upload'){const confirmation=qs('#designSheetCompositionComplete',root);if(confirmation?.checked&&state.sheetCompositionConfirmation!==sheetCompositionFingerprint()){confirmation.checked=false;state.sheetCompositionConfirmation=null;}}
    host.innerHTML=components.map((c,i)=>{const asset=state.designAssets.find(a=>Number(a.id)===Number(c.designAssetId)),options=asset?parseDesignMeasureOptions(asset):[];if(c.pendingMeasureOption&&!options.some(o=>o.id===c.pendingMeasureOption.id))options.push(c.pendingMeasureOption);const chosen=options.find(o=>o.id===c.measureOptionId)||c.pendingMeasureOption,cost=asset&&chosen?designPrintCostCents(asset,chosen.widthCm,chosen.heightCm):null;
      const measure=chosen?`<div class="sheet-exact-measure"><label class="field">Ancho exacto (cm)<input class="input" type="number" min=".01" step=".01" data-sheet-exact="width" value="${Number(chosen.widthCm)}"></label><label class="field">Alto exacto (cm)<input class="input" type="number" min=".01" step=".01" data-sheet-exact="height" value="${Number(chosen.heightCm)}"></label></div>`:'<small class="field-help">Arrastrá un recuadro para medir la primera aparición.</small>';
      const actions=`<button type="button" class="btn btn-ghost" data-sheet-box="${i}" data-sheet-key="${key}">${state.sheetBoxTarget?.key===key&&state.sheetBoxTarget?.index===i?'✓ Marcando':'Marcar este diseño'}</button>${c.previewBoxes?.length?`<button type="button" class="btn btn-ghost" data-sheet-undo="${i}" data-sheet-key="${key}">Anular última marca</button>`:''}<button type="button" class="icon-btn" data-sheet-other-size="${i}" data-sheet-key="${key}" aria-label="Agregar otra aparición del diseño" title="Agregar otra aparición">+</button>`;
      return `<div class="sheet-component-row ${state.sheetBoxTarget?.key===key&&state.sheetBoxTarget?.index===i?'sheet-component-active':''}" data-sheet-component="${i}" data-sheet-key="${key}"><div class="sheet-component-identity">${asset?designSmallImage(asset):''}<strong>${escapeHtml(c.name||asset?.name||'Diseño')}</strong></div>${measure}<div class="sheet-marked-count">${(c.previewBoxes||[]).length} marca${(c.previewBoxes||[]).length===1?'':'s'}<span class="sheet-mark-numbers">${(c.previewBoxes||[]).map((b,j)=>`<button type="button" class="sheet-mark-number" data-sheet-pin="${i}" data-pin-index="${j}" data-sheet-key="${key}" aria-label="Ajustar marca ${sheetMarkNumber(components,i,j)}">${sheetMarkNumber(components,i,j)}</button>`).join('')}</span></div><div class="admin-actions">${actions}<button type="button" class="icon-btn" data-remove-sheet-component="${i}" data-sheet-key="${key}" aria-label="Quitar diseño">×</button></div><small class="field-help">Ajustá los bordes directamente. Los números coinciden con las marcas de la plancha.</small><small class="sheet-component-cost">Costo en esta plancha: ${money(sheetMetrics(sheetSize(key).width,sheetSize(key).height,components,Number(key==='upload'?qs('#designUploadCost')?.value*100:state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId))?.cost_cents)||1000000).componentCosts[i]||0)}</small></div>`}).join('')||'<p class="muted">Todavía no elegiste diseños.</p>';
    qsa('[data-add-sheet-design]',root).forEach(b=>b.classList.toggle('selected',components.some(c=>Number(c.designAssetId)===Number(b.dataset.addSheetDesign))));updateSheetMetrics(key);renderSheetPreview(key);filterSheetGallery(key);if(!state.designUploadBusy)syncSheetUploadGate(key);
  }
  function designSmallImage(asset){return String(asset.mime_type||'').startsWith('image/')?`<img class="design-small-image" src="${apiUrl(`/api/admin/design-assets/${asset.id}/file`)}" alt="${escapeHtml(asset.name||asset.file_name)}" loading="lazy">`:'<span class="design-small-image">Archivo</span>'}
  function sheetPreviewMarks(rows,key){
    let occurrence=0;
    return rows.flatMap((c,i)=>(c.previewBoxes||[]).map((b,j)=>{
      const markNumber=++occurrence;
      const active=state.sheetActiveBox?.key===key&&state.sheetActiveBox.rowIndex===i&&state.sheetActiveBox.boxIndex===j;
      const pin=`<button type="button" class="sheet-preview-pin" style="left:${(Number(b.x)+Number(b.width)/2)*100}%;top:${(Number(b.y)+Number(b.height)/2)*100}%" data-sheet-pin="${i}" data-pin-index="${j}" data-sheet-key="${key}" title="Ajustar recuadro de ${escapeHtml(c.name||'diseño')}">${markNumber}</button>`;
      if(!active)return pin;
      const handles=['n','s','e','w','ne','nw','se','sw'].map(edge=>`<span class="sheet-resize-handle sheet-handle-${edge}" data-sheet-resize="${edge}" title="Ajustar borde"></span>`).join('');
      return `<div class="sheet-preview-box-active" data-sheet-move style="left:${Number(b.x)*100}%;top:${Number(b.y)*100}%;width:${Number(b.width)*100}%;height:${Number(b.height)*100}%" data-sheet-row="${i}" data-sheet-index="${j}" data-sheet-key="${key}">${handles}</div>${pin}`;
    })).join('');
  }
  function renderSheetPreview(key){
    const host=qs('[data-sheet-preview]',sheetRoot(key));if(!host)return;
    const a=key==='upload'?state.sheetUploadPreview:state.designAssets.find(x=>Number(x.id)===state.activeDesignId),url=key==='upload'?a?.url:a?apiUrl(`/api/admin/design-assets/${a.id}/file`):'',mime=a?.mime_type||a?.file?.type||'';
    if(!url){host.innerHTML='<p class="muted">Elegí el archivo de la plancha para verla acá.</p>';return;}
    const image=/^image\/(png|jpeg|webp|svg\+xml)$/.test(mime),rows=state.designSheetDrafts?.[key]||[];
    const previousViewport=qs('.sheet-preview-viewport',host),previousLeft=previousViewport?.scrollLeft||0,previousTop=previousViewport?.scrollTop||0;
    host.innerHTML=`<strong>Vista previa de la plancha</strong>${image?`<div class="sheet-preview-tools"><span>Zoom ${Math.round((state.sheetZoom||1)*100)}%</span><input type="range" min="1" max="5" step=".25" value="${state.sheetZoom||1}" data-sheet-zoom aria-label="Zoom de la plancha"><button type="button" class="btn btn-ghost" data-reset-sheet-zoom>Restablecer</button></div><div class="sheet-preview-viewport"><div class="sheet-preview-canvas ${state.sheetBoxTarget?.key===key?'drawing':''}" data-sheet-canvas="${key}" style="width:1px;height:1px"><img src="${escapeHtml(url)}" alt="Plancha a cargar">${sheetPreviewMarks(rows,key)}</div></div><small>Arrastrá para marcar y ajustá los bordes al soltar. Usá el zoom y las barras de desplazamiento para acercarte.</small>`:mime==='application/pdf'?`<iframe src="${escapeHtml(url)}" title="Plancha"></iframe><small>Usá la lista con miniaturas para revisar los diseños.</small>`:`<a class="btn btn-ghost" href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir archivo original</a><small>Este formato no tiene vista previa en el navegador.</small>`}<p class="sheet-mark-status" role="status">${state.sheetBoxTarget?.key===key?`Arrastrá el contorno de la aparición del diseño ${state.sheetBoxTarget.index+1}`:''}</p>`;
    host._sheetResizeObserver?.disconnect();
    const nextViewport=qs('.sheet-preview-viewport',host),canvas=qs('[data-sheet-canvas]',host),img=canvas&&qs('img',canvas);
    if(nextViewport&&img){
      const fit=()=>fitSheetPreview(canvas),restore=()=>{fit();nextViewport.scrollLeft=previousLeft;nextViewport.scrollTop=previousTop;};
      img.addEventListener('load',restore,{once:true});if(img.complete)restore();
      if(window.ResizeObserver){host._sheetResizeObserver=new ResizeObserver(fit);host._sheetResizeObserver.observe(nextViewport);}
    }
  }
  function sheetBoxCoordinate(canvas,event){
    const rect=canvas.getBoundingClientRect(),clamp=n=>Math.max(0,Math.min(1,n));
    return {x:clamp((event.clientX-rect.left)/rect.width),y:clamp((event.clientY-rect.top)/rect.height)};
  }
  function sheetBoxMeasures(box,size){
    const width=box.width*size.width,height=box.height*size.height;
    return Number(box.rotation)%180?{widthCm:height,heightCm:width}:{widthCm:width,heightCm:height};
  }
  function applySheetBox(index,box,key='upload'){
    const draft=state.designSheetDrafts[key]?.[index],asset=state.designAssets.find(a=>Number(a.id)===Number(draft?.designAssetId)),size=sheetSize(key);
    if(!draft||!asset||!size.width||!size.height||box.width<.005||box.height<.005)throw new Error('Marcá el contorno completo del diseño sobre la imagen.');
    const sheetAsset=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId)),option=detectedMeasureOption(asset,key==='upload'?state.sheetUploadPreview?.file?.name:sheetAsset?.file_name,sheetBoxMeasures(box,size));
    const rows=state.designSheetDrafts[key];
    if(rows.some(c=>Number(c.designAssetId)===Number(asset.id)&&(c.previewBoxes||[]).some(b=>{const overlap=Math.max(0,Math.min(b.x+b.width,box.x+box.width)-Math.max(b.x,box.x))*Math.max(0,Math.min(b.y+b.height,box.y+box.height)-Math.max(b.y,box.y));return overlap/Math.min(b.width*b.height,box.width*box.height)>.85;})))throw new Error('Esa aparición ya está marcada. Quitá su marca si querés corregirla.');
    let target=draft,targetIndex=index;
    const oldOption=draft.pendingMeasureOption||parseDesignMeasureOptions(asset).find(o=>o.id===draft.measureOptionId);
    if(draft.previewBoxes?.length&&oldOption&&(Math.abs(oldOption.widthCm-option.widthCm)>=.2||Math.abs(oldOption.heightCm-option.heightCm)>=.2)){
      target={designAssetId:Number(asset.id),quantity:0,previewBoxes:[],previewMarks:[]};rows.push(target);targetIndex=rows.length-1;
    }
    target.measureOptionId=option.id;target.pendingMeasureOption=option;target.previewBoxes??=[];target.previewMarks??=[];
    target.previewBoxes.push({...box,rotation:box.rotation||0});target.previewMarks.push({x:box.x+box.width/2,y:box.y+box.height/2});
    target.quantity=target.previewBoxes.length;target.sourceMethod='box-selected';
    state.sheetBoxTarget={key,index:targetIndex};state.sheetActiveBox={key,rowIndex:targetIndex,boxIndex:target.previewBoxes.length-1};renderSheetSelected(key);
    const chosen=target.pendingMeasureOption||option;
    qs('[data-sheet-detection-status]',sheetRoot(key))?.replaceChildren(document.createTextNode('Marca '+sheetMarkNumber(rows,targetIndex,target.previewBoxes.length-1)+': '+chosen.widthCm+' × '+chosen.heightCm+' cm. Revisá el contorno. El selector sigue activo para marcar otra aparición.'));
  }
  function resizeSheetBox(key,rowIndex,boxIndex,box){
    const rows=state.designSheetDrafts[key],row=rows?.[rowIndex],previous=row?.previewBoxes?.[boxIndex],asset=state.designAssets.find(a=>Number(a.id)===Number(row?.designAssetId));
    if(!previous||!asset||box.width<.005||box.height<.005)throw new Error('El recuadro debe cubrir toda la estampa.');
    const collision=rows.some((c,i)=>Number(c.designAssetId)===Number(asset.id)&&(c.previewBoxes||[]).some((b,j)=>{
      if(i===rowIndex&&j===boxIndex)return false;
      const overlap=Math.max(0,Math.min(b.x+b.width,box.x+box.width)-Math.max(b.x,box.x))*Math.max(0,Math.min(b.y+b.height,box.y+box.height)-Math.max(b.y,box.y));
      return overlap/Math.min(b.width*b.height,box.width*box.height)>.85;
    }));
    if(collision)throw new Error('Ese diseño ya tiene una marca en ese lugar.');
    const sheet=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId)),option=detectedMeasureOption(asset,key==='upload'?state.sheetUploadPreview?.file?.name:sheet?.file_name,sheetBoxMeasures(box,sheetSize(key)));
    const oldOption=row.pendingMeasureOption||parseDesignMeasureOptions(asset).find(o=>o.id===row.measureOptionId);
    const different=oldOption&&(Math.abs(Number(oldOption.widthCm)-option.widthCm)>=.2||Math.abs(Number(oldOption.heightCm)-option.heightCm)>=.2);
    if(different&&row.previewBoxes.length>1){
      row.previewBoxes.splice(boxIndex,1);row.previewMarks?.splice(boxIndex,1);row.quantity=row.previewBoxes.length;
      rows.unshift({designAssetId:Number(asset.id),measureOptionId:option.id,pendingMeasureOption:option,quantity:1,previewBoxes:[box],previewMarks:[{x:box.x+box.width/2,y:box.y+box.height/2}],sourceMethod:'box-selected'});
      state.sheetActiveBox={key,rowIndex:0,boxIndex:0};
    }else{
      row.previewBoxes[boxIndex]=box;row.previewMarks??=[];row.previewMarks[boxIndex]={x:box.x+box.width/2,y:box.y+box.height/2};row.measureOptionId=option.id;row.pendingMeasureOption=option;row.sourceMethod='box-selected';
      state.sheetActiveBox={key,rowIndex,boxIndex};
    }
    const edited=rows[state.sheetActiveBox.rowIndex],editedBox=edited.previewBoxes[state.sheetActiveBox.boxIndex];
    const matching=rows.find(c=>c!==edited&&Number(c.designAssetId)===Number(edited.designAssetId)&&c.measureOptionId===edited.measureOptionId);
    if(matching){
      const offset=matching.previewBoxes?.length||0;matching.previewBoxes=[...(matching.previewBoxes||[]),...edited.previewBoxes];matching.previewMarks=[...(matching.previewMarks||[]),...(edited.previewMarks||[])];matching.quantity=matching.previewBoxes.length;
      matching.pendingMeasureOption=edited.pendingMeasureOption;matching.sourceMethod='box-selected';rows.splice(rows.indexOf(edited),1);
      state.sheetActiveBox={key,rowIndex:rows.indexOf(matching),boxIndex:offset+edited.previewBoxes.indexOf(editedBox)};
    }
    state.sheetBoxTarget={key,index:state.sheetActiveBox.rowIndex};
    renderSheetSelected(key);
  }
  function updateDrawnSheetSizes(){
    const size=sheetSize('upload');if(!size.width||!size.height)return;
    for(const draft of state.designSheetDrafts?.upload||[]){
      if(draft.sourceMethod!=='box-selected'||!draft.previewBoxes?.[0])continue;
      const asset=state.designAssets.find(a=>Number(a.id)===Number(draft.designAssetId));if(!asset)continue;
      const box=draft.previewBoxes[0];draft.pendingMeasureOption=detectedMeasureOption(asset,state.sheetUploadPreview?.file?.name,sheetBoxMeasures(box,size));draft.measureOptionId=draft.pendingMeasureOption.id;
    }
    renderSheetSelected('upload');
  }
  function detectedMeasureOption(asset,fileName,measurement){
    const options=parseDesignMeasureOptions(asset),widthCm=Number(Number(measurement.widthCm).toFixed(2)),heightCm=Number(Number(measurement.heightCm).toFixed(2)),close=o=>Math.abs(Number(o.widthCm)-widthCm)<.2&&Math.abs(Number(o.heightCm)-heightCm)<.2,metadata=options.find(o=>close(o)&&(o.sources||[]).length)||options.find(close)||{},sourceTag=String(fileName||'plancha').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,36)||'plancha',destinations=Array.isArray(metadata.destinations)&&metadata.destinations.length?metadata.destinations:['Todos'];
    const exact=metadata.id&&Math.abs(Number(metadata.widthCm)-widthCm)<.005&&Math.abs(Number(metadata.heightCm)-heightCm)<.005;
    return {...metadata,id:exact?metadata.id:`scan-${asset.id}-${sourceTag}-${Math.round(widthCm*100)}x${Math.round(heightCm*100)}`,widthCm,heightCm,destination:destinations[0]||'Todos',destinations,size:String(metadata.size||''),detail:String(metadata.detail||`Marcado en ${fileName||'plancha'}`),sources:exact?(metadata.sources||[]):[]};
  }
  async function readDesignImagePixels(blob,maxWidth){
    const bitmap=await createImageBitmap(blob),scale=Math.min(1,maxWidth/bitmap.width),width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale)),canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,width,height);bitmap.close?.();
    return {width,height,data:context.getImageData(0,0,width,height).data};
  }
  function cropMarkedDesign(pixels){
    let left=pixels.width,top=pixels.height,right=-1,bottom=-1;
    for(let y=0;y<pixels.height;y++)for(let x=0;x<pixels.width;x++)if(pixels.data[(y*pixels.width+x)*4+3]>70){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    if(right<left||bottom<top)return null;
    return {left,top,width:right-left+1,height:bottom-top+1,source:pixels};
  }
  function markedDesignSamples(crop,rotation,grid=9){
    const width=rotation%180?crop.height:crop.width,height=rotation%180?crop.width:crop.height,points=[];
    for(let y=0;y<grid;y++)for(let x=0;x<grid;x++){
      const u=(x+.5)/grid,v=(y+.5)/grid,sx=rotation===90?v:rotation===180?1-u:rotation===270?1-v:u,sy=rotation===90?1-u:rotation===180?1-v:rotation===270?u:v;
      const px=crop.left+Math.min(crop.width-1,Math.floor(sx*crop.width)),py=crop.top+Math.min(crop.height-1,Math.floor(sy*crop.height)),offset=(py*crop.source.width+px)*4;
      const alpha=crop.source.data[offset+3];
      if(alpha>160)points.push({u,v,r:crop.source.data[offset],g:crop.source.data[offset+1],b:crop.source.data[offset+2]});
      else if(alpha<30)points.push({u,v,transparent:true});
    }
    const opaque=points.filter(p=>!p.transparent),colors=new Set(opaque.map(p=>[p.r>>5,p.g>>5,p.b>>5].join(':')));
    return opaque.length>=10&&(colors.size>=3||points.length-opaque.length>=4)?{width,height,points}:null;
  }
  function locateMarkedDesign(sheet,crop,point){
    let best=null;const px=point.x*sheet.width,py=point.y*sheet.height;
    const scoreAt=(template,x,y,width,height,cutoff=Infinity)=>{
      if(x<0||y<0||x+width>sheet.width||y+height>sheet.height||px<x||px>x+width||py<y||py>y+height)return Infinity;
      let score=0;
      for(const p of template.points){
        const ix=Math.min(sheet.width-1,Math.floor(x+p.u*width)),iy=Math.min(sheet.height-1,Math.floor(y+p.v*height)),at=(iy*sheet.width+ix)*4;
        score+=p.transparent?(sheet.data[at+3]>100?.24:0):sheet.data[at+3]<65?.55:(Math.abs(sheet.data[at]-p.r)+Math.abs(sheet.data[at+1]-p.g)+Math.abs(sheet.data[at+2]-p.b))/765;
        if(score/template.points.length>cutoff)return Infinity;
      }
      return score/template.points.length;
    };
    for(const rotation of [0,90,180,270]){
      const template=markedDesignSamples(crop,rotation);if(!template)continue;
      const maxWidth=sheet.width;
      for(let width=10;width<=maxWidth;width+=Math.max(1,Math.round(width*.065))){
        const height=Math.max(2,Math.round(width*template.height/template.width));if(height>sheet.height)continue;
        const step=Math.max(2,Math.round(width*.075));
        for(let y=Math.max(0,Math.round(py-height));y<=Math.min(Math.round(py),sheet.height-height);y+=step){
          for(let x=Math.max(0,Math.round(px-width));x<=Math.min(Math.round(px),sheet.width-width);x+=step){
            const score=scoreAt(template,x,y,width,height,best?.score??Infinity);
            if(Number.isFinite(score)&&(!best||score<best.score))best={score,x,y,width,height,rotation};
          }
        }
      }
    }
    if(!best||best.score>.15)return null;
    const template=markedDesignSamples(crop,best.rotation,17);if(!template)return null;
    best.score=scoreAt(template,best.x,best.y,best.width,best.height);
    let step=Math.max(1,Math.round(best.width*.02)),radius=Math.max(3,Math.round(best.width*.1));
    while(true){
      const base={...best};
      for(let width=Math.max(4,base.width-radius);width<=base.width+radius;width+=step){
        const height=Math.max(2,Math.round(width*template.height/template.width));
        for(let y=base.y-radius;y<=base.y+radius;y+=step)for(let x=base.x-radius;x<=base.x+radius;x+=step){
          const score=scoreAt(template,x,y,width,height,best.score);
          if(score<best.score)best={score,x,y,width,height,rotation:base.rotation};
        }
      }
      if(step===1)break;radius=Math.max(2,Math.round(step*1.5));step=Math.max(1,Math.floor(step/4));
    }
    if(best.score>.11)return null;
    return {x:best.x/sheet.width,y:best.y/sheet.height,width:best.width/sheet.width,height:best.height/sheet.height,rotation:best.rotation,score:best.score};
  }
  async function measureMarkedDesignAtPoint(index,point){
    const draft=state.designSheetDrafts.upload?.[index],asset=state.designAssets.find(a=>Number(a.id)===Number(draft?.designAssetId)),file=state.sheetUploadPreview?.file,status=qs('[data-sheet-detection-status]');
    if(!asset||!file)throw new Error('Elegí la plancha y el diseño antes de marcar.');
    if(state.sheetMeasureBusy)return;state.sheetMeasureBusy=true;if(status)status.textContent=`Midiendo ${asset.name||asset.file_name} en el punto señalado…`;
    try{
      const pixels=state.sheetPixels?.file===file?state.sheetPixels.pixels:await readDesignImagePixels(file,1000);
      if(file!==state.sheetUploadPreview?.file)return;state.sheetPixels={file,pixels};
      let crop=state.sheetDesignPixels?.get(Number(asset.id));if(!crop){
        const response=await fetch(apiUrl(`/api/admin/design-assets/${asset.id}/file`),{credentials:'same-origin'});
        if(!response.ok)throw new Error('No se pudo leer el diseño individual.');
        crop=cropMarkedDesign(await readDesignImagePixels(await response.blob(),450));if(!crop)throw new Error('El archivo individual no tiene una imagen reconocible.');
        (state.sheetDesignPixels??=new Map()).set(Number(asset.id),crop);
      }
      await new Promise(resolve=>setTimeout(resolve,0));
      const result=locateMarkedDesign(pixels,crop,point),current=state.designSheetDrafts.upload.indexOf(draft);
      if(file!==state.sheetUploadPreview?.file||current<0)return;
      if(!result)throw new Error('No pude delimitar este diseño con seguridad. Arrastrá un recuadro alrededor de su contorno.');
      applySheetBox(current,result);
    }catch(err){if(status)status.textContent=err.message;}
    finally{state.sheetMeasureBusy=false;}
  }
  function openSheetMeasure(key,id){
    const asset=state.designAssets.find(x=>Number(x.id)===Number(id));if(!asset)return;
    state.sheetMeasureTarget={key,id:Number(id)};let d=qs('#sheetMeasureDialog');if(!d){d=document.createElement('dialog');d.id='sheetMeasureDialog';d.className='admin-dialog';document.body.appendChild(d)}
    d.innerHTML=`<div class="dialog-shell"><div class="dialog-head"><h2>Nueva medida · ${escapeHtml(asset.name||asset.file_name)}</h2></div><div class="dialog-body">${designSmallImage(asset)}${designMeasureEditor('sheet-measure')}</div><div class="dialog-foot"><button type="button" class="btn btn-ghost" data-sheet-measure-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-sheet-measure-save>Guardar y agregar a la plancha</button></div></div>`;d.showModal();
  }
  async function saveSheetMeasure(button){
    const dialog=qs('#sheetMeasureDialog'),options=readDesignMeasureOptions(dialog);if(!options.length)throw new Error('Ingresá las medidas.');button.disabled=true;
    try{const {key,id}=state.sheetMeasureTarget,data=await api(`/api/admin/design-assets/${id}/measures`,{method:'POST',body:JSON.stringify({measureOptions:options})});state.designAssets=state.designAssets.map(a=>Number(a.id)===id?data.item:a);for(const option of options)state.designSheetDrafts[key].push({designAssetId:id,measureOptionId:option.id,quantity:1});dialog.close();syncSheetScope(key);renderSheetSelected(key);toast('Medidas guardadas en el diseño','success')}finally{button.disabled=false}
  }
  function updateSheetMetrics(key){const el=qs('[data-sheet-metrics]',sheetRoot(key)),size=sheetSize(key),sheet=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId)),cost=key==='upload'?pesosToCents(qs('#designUploadCost')?.value||10000):pesosToCents(qs('[data-design-cost]',sheetRoot(key))?.value||0)||Number(sheet?.cost_cents)||1000000;if(el)el.innerHTML=sheetMetricsHtml(size.width,size.height,sheetComponents(key),cost);}
  function syncSheetScope(key){const select=sheetScope(key),scopes=new Set(sheetComponents(key).map(c=>c.scope));if(select&&select.value!=='mixed'&&scopes.size)select.value=scopes.size>1?'mixed':[...scopes][0];if(select?.value==='mixed'){const kind=qs(key==='upload'?'#designUploadKind':'[data-design-kind]',sheetRoot(key));kind.value='sheet';kind.disabled=true;}}
  async function uploadMissingSheetDesign(button){
    if(state.designUploadBusy)return;
    const key=button.closest?.('[data-sheet-editor]')?.dataset.sheetEditor||'upload',editor=qs(`[data-sheet-editor="${key}"]`),file=qs('[data-missing-sheet-file]',editor)?.files?.[0],scope=qs('[data-missing-sheet-scope]',editor)?.value||'salmos';
    const name=String(qs('[data-missing-sheet-name]',editor)?.value||'').trim()||file?.name.replace(/\.[^.]+$/,'');
    if(!file)throw new Error('Elegí la imagen del diseño faltante.');
    if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type))throw new Error('Subí el diseño faltante en PNG, JPG, WEBP o SVG.');
    const fd=new FormData();fd.append('file',file);fd.append('scope',scope);fd.append('kind','individual');fd.append('name',name);fd.append('note','');fd.append('printMaterialType',key==='upload'?qs('#designUploadPrintType')?.value:qs('[data-design-print-type]',sheetRoot('detail'))?.value||'dtf_textile');fd.append('measureOptions','[]');fd.append('widthCm','0');fd.append('heightCm','0');fd.append('components','[]');
    const status=qs('[data-missing-upload-status]',editor),originalLabel=button.textContent;
    const restoreControls=key==='upload'?lockDesignUpload():(state.designUploadBusy=true,()=>{state.designUploadBusy=false;});button.disabled=true;button.textContent='Subiendo diseño…';if(status)status.textContent=`Subiendo ${file.name}…`;
    try{
      const result=await api('/api/admin/design-assets',{method:'POST',body:fd}),asset=result.item;
      if(!asset?.id)throw new Error('No recibí la referencia del diseño.');
      state.designAssets.unshift(asset);state.sheetUploadRecent=[Number(asset.id),...(state.sheetUploadRecent||[]).filter(id=>id!==Number(asset.id))];state.costingLoaded=false;
      (key==='upload'?qs('#designUploadComposition'):qs('[data-sheet-composition-host]',sheetRoot(key))).innerHTML=sheetCompositionEditor(key);if(key==='upload')state.sheetCompositionConfirmation=null;
      addSheetDesign(key,Number(asset.id));qs('[data-sheet-preview]',sheetRoot(key))?.scrollIntoView({block:'nearest'});toast('Diseño subido. Quedó primero; ya podés marcarlo en la plancha.','success');
    }catch(err){if(status)status.textContent=`Error al subir ${file.name}: ${err.message}`;throw err}
    finally{restoreControls();button.disabled=false;button.textContent=originalLabel;syncSheetUploadGate(key);}
  }
  function addSheetDesign(key,id,another=false){
    state.designSheetDrafts??={};const list=state.designSheetDrafts[key]??=[];
    let index=!another?list.findIndex(c=>Number(c.designAssetId)===id):-1;
    if(index<0){const draft={designAssetId:id,measureOptionId:'',quantity:0,previewMarks:[],previewBoxes:[]};if(another){list.push(draft);index=list.length-1;}else{list.unshift(draft);index=0;}}
    if(state.sheetActiveBox?.key!==key||state.sheetActiveBox.rowIndex!==index)state.sheetActiveBox=null;state.sheetBoxTarget={key,index};state.sheetMarkTarget=null;syncSheetScope(key);renderSheetSelected(key);
  }
  function refreshDesignKind(key){
    const root=sheetRoot(key),isSheet=sheetKind(key)==='sheet';qsa('[data-sheet-size]',root).forEach(el=>el.classList.toggle('hidden',!isSheet));
    if(isSheet&&key==='upload'){if(!qs('#designUploadWidth').value)qs('#designUploadWidth').value='100';if(!qs('#designUploadHeight').value)qs('#designUploadHeight').value='58';}
    if(key==='upload'){qsa('[data-upload-sheet-only]',root).forEach(el=>el.classList.toggle('hidden',!isSheet));qs('#designUploadFiles').multiple=!isSheet;qs('#designSheetPurchase')?.classList.toggle('hidden',!isSheet);}
    qs('[data-individual-options]',root)?.classList.toggle('hidden',isSheet);const host=qs('[data-sheet-composition-host]',root);
    if(host){host.classList.toggle('hidden',!isSheet);if(isSheet&&!qs('[data-sheet-editor]',host))host.innerHTML=sheetCompositionEditor(key);if(isSheet)renderSheetSelected(key);}
  }
  function sheetPayload(key){const kind=sheetKind(key),size=sheetSize(key),confirmed=key==='upload'&&Boolean(qs('#designSheetCompositionComplete',sheetRoot(key))?.checked)&&state.sheetCompositionConfirmation===sheetCompositionFingerprint();return {widthCm:kind==='sheet'?size.width:0,heightCm:kind==='sheet'?size.height:0,measureOptions:kind==='sheet'||key==='upload'?[]:readDesignMeasureOptions(sheetRoot(key)),components:kind==='sheet'?(state.designSheetDrafts?.[key]||[]).map(c=>({designAssetId:Number(c.designAssetId),measureOptionId:c.measureOptionId,quantity:Number(c.quantity),previewMarks:c.previewMarks||[],previewBoxes:c.previewBoxes||[]})):[],complete:confirmed};}
  function openDesignUpload(context='designs'){
    syncSheetUploadGate('upload');state.sheetSearch={...state.sheetSearch,upload:''};state.designUploadContext=context;state.designSheetDrafts??={};state.designSheetDrafts.upload=[];state.sheetCompositionConfirmation=null;state.designUploadFiles=[];state.designUploadNextId=0;state.designUploadRenderedIds=new Set();state.sheetUploadRecent=[];for(const url of state.designUploadPreviewUrls||[])URL.revokeObjectURL(url);state.designUploadPreviewUrls=[];if(state.sheetUploadPreview?.url)URL.revokeObjectURL(state.sheetUploadPreview.url);state.sheetUploadPreview=null;state.sheetBoxTarget=null;state.sheetActiveBox=null;state.sheetPixels=null;state.sheetDesignPixels=new Map();state.sheetMeasureBusy=false;
    for(const id of ['designUploadName','designUploadWidth','designUploadHeight','designUploadFiles'])qs('#'+id).value='';qs('#designUploadCost').value='10000';qs('#designUploadBatchMeta').innerHTML='';qs('#designUploadBatchMeta').classList.add('hidden');qs('#designUploadTagPicker').innerHTML=designTagPickerHtml('sheet-upload',[]);state.sheetZoom=1;
    qs('#designUploadScope').value='salmos';qs('#designUploadKind').value='individual';qs('#designUploadKind').disabled=false;qs('#designUploadPrintType').value='dtf_textile';qs('#designSheetPurchase').open=false;for(const id of ['sheetPurchaseSupplier','sheetPurchaseSurcharge','sheetPurchaseCash','sheetPurchaseTransfer','sheetPurchaseOrigin','sheetPurchaseDestination','sheetPurchaseReference','sheetPurchaseDetails'])qs('#'+id).value='';qs('#sheetPurchaseMethod').value='cash';qs('#sheetPurchaseSurchargeType').value='fixed';
    qs('#designUploadComposition').innerHTML='';refreshDesignKind('upload');qs('#designUploadDialog').showModal();
  }
  async function uploadSheetAndAttach(file,scope,detail){
    const name=(qs('#designUploadName').value||'').trim()||file.name.replace(/\.[^.]+$/,''),printMaterialType=qs('#designUploadPrintType').value,drafts=state.designSheetDrafts.upload||[],prepared=[];
    for(const draft of drafts){let asset=state.designAssets.find(a=>Number(a.id)===Number(draft.designAssetId)),measure=asset&&(draft.pendingMeasureOption||parseDesignMeasureOptions(asset).find(o=>o.id===draft.measureOptionId));if(!asset||!measure)throw new Error('Cada diseño de la plancha necesita una medida válida.');if(draft.pendingMeasureOption){const saved=await api(`/api/admin/design-assets/${asset.id}/measures`,{method:'POST',body:JSON.stringify({measureOptions:[measure]})});asset=saved.item;state.designAssets=state.designAssets.map(a=>Number(a.id)===Number(asset.id)?asset:a);measure=parseDesignMeasureOptions(asset).find(o=>o.id===measure.id);draft.measureOptionId=measure?.id;draft.pendingMeasureOption=null;}if(!measure)throw new Error(`No pude guardar la medida de ${asset.name||asset.file_name}.`);prepared.push({draft,asset,measure});}
    const components=prepared.map(({draft,measure,asset})=>({designAssetId:Number(asset.id),measureOptionId:measure.id,quantity:Math.max(1,Number(draft.quantity)||1),previewMarks:draft.previewMarks||[],previewBoxes:draft.previewBoxes||[]}));
    const fd=new FormData();fd.append('file',file);fd.append('scope',scope);fd.append('kind','sheet');fd.append('name',name);fd.append('note','');fd.append('printMaterialType',printMaterialType);fd.append('costCents',String(pesosToCents(qs('#designUploadCost')?.value||10000)));fd.append('tags',JSON.stringify(designPickerSelections(qs('[data-design-tag-picker="sheet-upload"]'))));fd.append('widthCm',String(detail.widthCm));fd.append('heightCm',String(detail.heightCm));fd.append('measureOptions','[]');fd.append('components',JSON.stringify(components));fd.append('compositionComplete','true');
    const created=await api('/api/admin/design-assets',{method:'POST',body:fd}),sheet=created.item;if(!sheet?.id)throw new Error('La imagen se subió pero no recibí su referencia. Actualizá la biblioteca antes de volver a cargarla.');
    for(const {draft,asset,measure} of prepared){const source={sheetAssetId:Number(sheet.id),name:sheet.name||sheet.file_name,fileName:sheet.file_name,box:(draft.previewBoxes||[])[0]||{x:0,y:0,width:0,height:0,rotation:0},boxes:draft.previewBoxes||[],quantity:Math.max(1,Number(draft.quantity)||1),confidence:Number(draft.confidence)||0,method:draft.sourceMethod||'manual'},saved=await api(`/api/admin/design-assets/${asset.id}/measures`,{method:'POST',body:JSON.stringify({measureOptions:[{...measure,sources:[...(measure.sources||[]),source].slice(0,20)}]})});state.designAssets=state.designAssets.map(a=>Number(a.id)===Number(asset.id)?saved.item:a);}
    return sheet;
  }
  async function registerSheetPurchase(sheet){
    const base=Math.max(1,Number(sheet.cost_cents)||1000000),type=qs('#sheetPurchaseSurchargeType').value,value=Number(qs('#sheetPurchaseSurcharge').value)||0,charge=Math.round(type==='percent'?base*value/100:value*100),total=base+charge,method=qs('#sheetPurchaseMethod').value;
    let payments=[];const transfer={method:'transfer',origin:qs('#sheetPurchaseOrigin').value,destination:qs('#sheetPurchaseDestination').value,reference:qs('#sheetPurchaseReference').value,details:qs('#sheetPurchaseDetails').value};
    if(method==='mixed'){const cash=pesosToCents(qs('#sheetPurchaseCash').value),transferred=pesosToCents(qs('#sheetPurchaseTransfer').value);if(cash<=0||transferred<=0||cash+transferred!==total)throw new Error('La suma de efectivo y transferencia debe coincidir con el total de la plancha.');payments=[{method:'cash',amountCents:cash},{...transfer,amountCents:transferred}]}else payments=[method==='cash'?{method:'cash',amountCents:total}:{...transfer,amountCents:total}];
    const quantity=Math.max(.01,Number(sheet.height_cm)/100),unitPriceCents=Math.round(base/quantity),payload={supplier:qs('#sheetPurchaseSupplier').value,reference:`Plancha #${sheet.id} · ${sheet.name}`,notes:'DTF registrado desde Diseños',surchargeType:type,surchargeValue:value,payments,occurredAt:new Date().toISOString(),items:[{materialType:sheet.print_material_type||'dtf_textile',name:`${sheet.print_material_type==='dtf_uv'?'DTF UV':'DTF textil'} ${Number(sheet.width_cm)||58} cm`,features:[sheet.print_material_type==='dtf_uv'?'DTF UV':'DTF textil'],quantity,unit:'meter',widthCm:Number(sheet.width_cm)||58,unitPriceCents}]};
    await api('/api/admin/purchases',{method:'POST',body:JSON.stringify(payload)});state.costingLoaded=false;
  }
  function appendDesignUploadFiles(files){
    state.designUploadFiles??=[];state.designUploadPreviewUrls??=[];state.designUploadNextId??=0;
    for(const file of files){
      const previewUrl=/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)?URL.createObjectURL(file):'';
      if(previewUrl)state.designUploadPreviewUrls.push(previewUrl);
      state.designUploadFiles.push({id:state.designUploadNextId++,file,previewUrl,savedItem:null});
    }
    renderDesignUploadBatchMeta();
  }
  function lockDesignUpload(){
    state.designUploadBusy=true;
    const controls=qsa('input,select,textarea,button',qs('#designUploadDialog')).map(el=>[el,el.disabled]);
    controls.forEach(([el])=>el.disabled=true);
    return ()=>{controls.forEach(([el,disabled])=>el.disabled=disabled);qs('#designUploadKind').disabled=qs('#designUploadScope').value==='mixed';state.designUploadBusy=false;};
  }
  function renderDesignUploadBatchMeta(){
    const host=qs('#designUploadBatchMeta'),files=state.designUploadFiles||[],visible=qs('#designUploadKind')?.value==='individual'&&files.length>0;if(!host)return;
    host.classList.toggle('hidden',!visible);if(!visible)return;
    state.designUploadRenderedIds??=new Set();
    if(!state.designUploadRenderedIds.size)host.innerHTML='<strong>Un diseño por archivo</strong><p class="muted"><span data-batch-count></span> · Podés elegir más archivos sin perder estos. Las medidas son opcionales.</p>';
    for(const {id,file,previewUrl} of files){
      if(state.designUploadRenderedIds.has(id))continue;
      host.insertAdjacentHTML('beforeend',`<div class="design-upload-file-meta" data-design-batch-row="${id}"><div class="design-upload-file-preview">${previewUrl?`<img src="${escapeHtml(previewUrl)}" alt="Vista previa de ${escapeHtml(file.name)}">`:'<span>Sin vista previa</span>'}<small title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</small></div><div class="design-upload-file-fields"><label class="field">Nombre<input class="input" data-design-batch-name="${id}" value="${escapeHtml(file.name.replace(/\.[^.]+$/,''))}" maxlength="160"></label><label class="field">Sección<select class="select" data-design-batch-scope="${id}"><option value="salmos">SALMOS</option><option value="clients">Clientes</option></select></label>${designTagPickerHtml(`batch-${id}`,[])}<details class="design-upload-file-measures"><summary>Destino y medidas (opcional)</summary>${designMeasureEditor('batch-'+id)}</details><div class="design-upload-file-actions"><small data-upload-file-status>Listo para subir</small><button type="button" class="icon-btn" data-remove-upload-file="${id}" aria-label="Quitar ${escapeHtml(file.name)}">×</button></div></div></div>`);
      state.designUploadRenderedIds.add(id);
    }
    const counter=qs('[data-batch-count]',host);if(counter)counter.textContent=`${files.length} archivo${files.length===1?'':'s'} seleccionados`;
  }
  async function uploadDesignFiles(button){
    if(state.designUploadBusy)return;
    const scope=qs('#designUploadScope').value,kind=scope==='mixed'?'sheet':qs('#designUploadKind').value,records=state.designUploadFiles||[],files=kind==='sheet'?[state.sheetUploadPreview?.file].filter(Boolean):records.map(x=>x.file),detail=kind==='sheet'?sheetPayload('upload'):null;
    if(!files.length)throw new Error('Elegí al menos un archivo.');
    if(kind==='sheet'&&files.length!==1)throw new Error('Cargá una plancha por vez para indicar su composición.');
    if(kind==='sheet'){
      if(!/^image\/(png|jpeg|webp)$/.test(files[0].type))throw new Error('Para marcar los diseños, subí la plancha en PNG, JPG o WEBP.');
      const drafts=state.designSheetDrafts.upload||[];
      if(!detail.complete)throw new Error('Confirmá que marcaste cada diseño y cada aparición de la plancha.');
      if(!drafts.length)throw new Error('Elegí y marcá los diseños que componen la plancha.');
      for(let i=0;i<drafts.length;i++){const d=drafts[i],asset=state.designAssets.find(a=>Number(a.id)===Number(d.designAssetId)),measure=d.pendingMeasureOption||parseDesignMeasureOptions(asset||{}).find(o=>o.id===d.measureOptionId);if(!asset||!measure||!d.previewBoxes?.length||Number(d.quantity)!==d.previewBoxes.length)throw new Error(`Falta marcar en la plancha ${asset?.name||'el diseño '+(i+1)}. Dibujá un recuadro sobre cada aparición.`);}
    }
    const uploaded=[],originalLabel=button.textContent,restoreControls=lockDesignUpload();button.disabled=true;
    try{await ensureCostingData();for(let i=0;i<files.length;i++){
      const file=files[i];button.textContent=`Subiendo ${i+1} de ${files.length}…`;
      if(kind==='sheet'){const saved=await uploadSheetAndAttach(file,scope,detail);if(saved){uploaded.push(saved);if(qs('#designSheetPurchase')?.open){try{await registerSheetPurchase(saved);toast('Plancha y compra guardadas','success')}catch(err){toast(`La plancha quedó guardada. La compra no se registró: ${err.message}`,'error')}}}continue;}
      const record=records[i];if(record.savedItem){uploaded.push(record.savedItem);continue;}
      const id=record.id,fileName=String(qs(`[data-design-batch-name="${id}"]`)?.value||'').trim()||file.name.replace(/\.[^.]+$/,''),fileScope=qs(`[data-design-batch-scope="${id}"]`)?.value||'salmos',row=qs(`[data-design-batch-row="${id}"]`),measureOptions=row?readDesignMeasureOptions(row):[],fd=new FormData();
      fd.append('file',file);fd.append('scope',fileScope);fd.append('kind',kind);fd.append('name',fileName);fd.append('note','');fd.append('tags',JSON.stringify(designPickerSelections(qs(`[data-design-tag-picker="batch-${id}"]`))));fd.append('printMaterialType',qs('#designUploadPrintType').value);fd.append('widthCm','0');fd.append('heightCm','0');fd.append('measureOptions',JSON.stringify(measureOptions));fd.append('components','[]');
      const saved=await api('/api/admin/design-assets',{method:'POST',body:fd});if(!saved.item?.id)throw new Error(`No pude confirmar que se guardó ${file.name}.`);
      record.savedItem=saved.item;uploaded.push(saved.item);const status=qs('[data-upload-file-status]',row);if(status)status.textContent='Subido ✓';
    }
      qs('#designUploadDialog').close();state.costingLoaded=false;toast('Diseño/s guardado/s','success');
      if(state.designUploadContext==='production'){const data=await api('/api/admin/design-assets');state.designAssets=data.items||[];renderProductionDesignGallery();renderProductionSelectedDesigns();}else await renderDesigns();
    }finally{restoreControls();button.disabled=false;button.textContent=originalLabel;}
  }
  function designTagFilterHtml(key,items){const allowed=Array.isArray(state.designTagCatalog)?new Set(state.designTagCatalog):null,tags=[...new Set(items.flatMap(a=>a.tags||[]).filter(tag=>!allowed||allowed.has(tag)))].sort((a,b)=>a.localeCompare(b,'es'));if(!tags.length)return '';const selected=state.designTagFilters?.[key]||[];return `<div class="design-tag-filters" aria-label="Filtrar por clasificación">${tags.map(tag=>`<button type="button" class="design-tag-chip ${selected.includes(tag)?'active':''}" data-design-filter="${escapeHtml(key)}" data-tag="${escapeHtml(tag)}" aria-pressed="${selected.includes(tag)}">${escapeHtml(tag)}</button>`).join('')}</div>`}
  function designVisible(key,a){return (state.designTagFilters?.[key]||[]).every(tag=>(a.tags||[]).includes(tag))}
  function updateDesignSelectionUI(){
    const selected=state.selectedDesignAssets??new Set(),button=qs('#deleteSelectedDesignsBtn');
    if(button){button.classList.toggle('hidden',!selected.size);button.textContent=`Eliminar ${selected.size} seleccionado${selected.size===1?'':'s'}`;}
    qsa('[data-design-select]').forEach(el=>{const active=selected.has(Number(el.dataset.designSelect));el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));el.setAttribute('aria-label',(active?'Desmarcar ':'Marcar ')+(el.dataset.designName||'diseño'));});
    const allButton=qs('#selectAllDesignsBtn');if(allButton){allButton.textContent=state.designAssets.length&&state.designAssets.every(a=>selected.has(Number(a.id)))?'Desmarcar todos':'Marcar todos';allButton.disabled=!state.designAssets.length;}
    qsa('[data-select-all-designs]').forEach(el=>{const ids=qsa('[data-design-card]',qs('#'+el.dataset.selectAllDesigns)).map(card=>Number(card.dataset.designCard));el.textContent=ids.length&&ids.every(id=>selected.has(id))?'Desmarcar todos':'Marcar todos';el.disabled=!ids.length;});
  }
  function designCard(a){const preview=`/api/admin/design-assets/${a.id}/file`;return `<article class="design-gallery-card" data-design-card="${a.id}" draggable="true"><button type="button" class="design-bulk-check" data-design-select="${a.id}" data-design-name="${escapeHtml(a.name||a.file_name)}" aria-pressed="${state.selectedDesignAssets?.has(Number(a.id))?'true':'false'}" aria-label="Marcar ${escapeHtml(a.name||a.file_name)}">✓</button>${a.kind==='sheet'?`<label class="design-sheet-check" title="Seleccionar plancha"><input type="checkbox" data-design-sheet="${a.id}" ${state.selectedDesignSheets?.has(Number(a.id))?'checked':''}><span>✓</span></label>`:''}<button type="button" class="design-gallery-thumb checkerboard" data-preview-design="${a.id}" title="${escapeHtml(a.name||a.file_name)}">${String(a.mime_type||'').startsWith('image/')?`<img draggable="false" src="${preview}" alt="${escapeHtml(a.name||a.file_name)}" loading="lazy">`:`<div class="design-file-placeholder">${escapeHtml((a.file_name||'ARCHIVO').split('.').pop().toUpperCase())}</div>`}</button></article>`}
  function designSection(title,items,key){const gid=`designGallery-${key}`;return `<details class="design-library-section" data-design-list="${key}" ${state.designListOpen?.[key]===false?'':'open'}><summary class="admin-section-head"><h3>${title}</h3><span class="muted">${items.length} archivo${items.length===1?'':'s'}</span><span class="design-fold-label"><span class="when-open">Comprimir</span><span class="when-closed">Descomprimir</span></span></summary><div class="design-gallery-actions"><button type="button" class="btn btn-ghost" data-select-all-designs="${gid}">Marcar todos</button><small>Arrastrá las imágenes para ordenarlas; tocá una para ver sus detalles.</small></div>${designTagFilterHtml(key,items)}<div class="horizontal-gallery-shell"><button type="button" class="gallery-arrow gallery-arrow-left" data-scroll-target="${gid}" data-scroll-dir="-1" aria-label="Anterior">‹</button><div class="design-grid" id="${gid}">${items.length?items.filter(a=>designVisible(key,a)).map(designCard).join(''):'<div class="empty-state"><strong>Sin diseños en esta sección.</strong></div>'}</div><button type="button" class="gallery-arrow gallery-arrow-right" data-scroll-target="${gid}" data-scroll-dir="1" aria-label="Siguiente">›</button></div></details>`}
  function designGroup(title,items,key){return `<details class="design-library-group" data-design-list="${key}" ${state.designListOpen?.[key]===false?'':'open'}><summary class="design-group-head"><h2>${title}</h2><span class="design-fold-label"><span class="when-open">Comprimir</span><span class="when-closed">Descomprimir</span></span></summary><div class="design-group-body">${designSection('Diseños individuales',items.filter(x=>x.kind==='individual'),key+'-individual')}${designSection('Planchas',items.filter(x=>x.kind==='sheet'),key+'-sheet')}</div></details>`}
  async function renderDesigns(){
    state.designListOpen??={};state.designTagFilters??={};qsa('[data-design-list]').forEach(d=>state.designListOpen[d.dataset.designList]=d.open);
    const [d,m,settings]=await Promise.all([api('/api/admin/design-assets'),state.materials.length?Promise.resolve(null):api('/api/admin/materials'),api('/api/admin/settings')]);state.designAssets=d.items||[];if(m)state.materials=m.items||[];
    let saved=[];try{saved=JSON.parse(settings.settings?.design_tag_catalog||'[]')}catch{}const hasTagCatalog=Object.prototype.hasOwnProperty.call(settings.settings||{},'design_tag_catalog');state.designTagCatalog=[...new Set((hasTagCatalog?(Array.isArray(saved)?saved:[]):['rosas','salmos','celestes','yeshua','cruz',...state.designAssets.flatMap(a=>a.tags||[])]).map(x=>String(x).trim().toLocaleLowerCase('es-AR')).filter(Boolean))];
    const clients=state.designAssets.filter(x=>x.scope==='clients'),salmos=state.designAssets.filter(x=>x.scope==='salmos'),mixed=state.designAssets.filter(x=>x.scope==='mixed');
    qs('#adminContent').innerHTML=`<div class="admin-section-head design-library-toolbar"><div><h2 style="margin:0">Biblioteca de diseños</h2><p class="muted" style="margin:4px 0 0">Tocá un diseño para ver sus destinos, medidas y origen de cada costo.</p></div><div class="admin-actions"><button class="btn btn-ghost" type="button" id="selectAllDesignsBtn">Marcar todos</button><button class="btn btn-danger hidden" type="button" id="deleteSelectedDesignsBtn">Eliminar seleccionados</button><button class="btn btn-primary" type="button" id="openDesignUploadBtn">+ Subir diseño</button><button class="btn btn-ghost" type="button" id="openDesignEmailBtn">Enviar planchas por mail</button></div></div>${designGroup('SALMOS',salmos,'salmos')}${designGroup('Clientes',clients,'clients')}${designSection('Planchas mixtas',mixed,'mixed')}`;state.selectedDesignAssets=new Set([...(state.selectedDesignAssets||[])].filter(id=>state.designAssets.some(a=>Number(a.id)===id)));updateDesignSelectionUI();
  }
  function designDeleteBlockReason(id){const asset=state.designAssets.find(a=>Number(a.id)===Number(id));if(!asset)return'';if(asset.kind==='individual'){const sheets=state.designAssets.filter(a=>a.kind==='sheet'&&(a.components||[]).some(c=>Number(c.designAssetId)===Number(id)));return sheets.length?`No se puede eliminar “${asset.name||asset.file_name}”: forma parte de ${sheets.map(a=>a.name||a.file_name).join(', ')}. Abrí esa plancha y quitá la referencia primero.`:'';}const owners=state.designAssets.filter(a=>a.kind==='individual'&&parseDesignMeasureOptions(a).some(o=>(o.sources||[]).some(source=>Number(source.sheetAssetId)===Number(id))));return owners.length?`No se puede eliminar la plancha “${asset.name||asset.file_name}”: es origen de medidas en ${owners.map(a=>a.name||a.file_name).join(', ')}. Quitá o actualizá esas referencias primero.`:'';}
  async function refreshDesignAssetsForDelete(){const data=await api('/api/admin/design-assets');state.designAssets=data.items||[];return state.designAssets;}
  function designTags(value){const values=Array.isArray(value)?value:String(value||'').split(',');return [...new Set(values.map(x=>String(x).trim().toLocaleLowerCase('es-AR')).filter(Boolean))]}
  function designPickerSelections(root){return designTags(qsa('[data-design-tag-choice]:checked',root||document).map(el=>el.value))}
  function designTagPickerHtml(key,selected=[]){state.designTagCatalog??=['rosas','salmos','celestes','yeshua','cruz'];const tags=designTags(selected),list=state.designTagCatalog;return `<div class="field full design-tag-picker" data-design-tag-picker="${escapeHtml(key)}"><label>Clasificación interna</label><details><summary>${tags.length?`${tags.length} opción${tags.length===1?'':'es'} seleccionada${tags.length===1?'':'s'}`:'Elegir etiquetas'}</summary><div class="design-tag-picker-options">${list.map(tag=>`<label><input type="checkbox" data-design-tag-choice value="${escapeHtml(tag)}" ${tags.includes(tag)?'checked':''}> ${escapeHtml(tag)}</label>`).join('')||'<small class="muted">Todavía no hay opciones.</small>'}</div><div class="design-tag-picker-add"><input class="input" data-design-tag-new placeholder="Nueva clasificación"><button type="button" class="btn btn-ghost" data-design-tag-add>Agregar</button></div><details class="design-tag-picker-manage"><summary>Editar o quitar opciones</summary><div>${list.map((tag,i)=>`<div class="design-tag-picker-row"><input class="input" data-design-tag-value value="${escapeHtml(tag)}"><button type="button" class="btn btn-ghost" data-design-tag-save data-index="${i}">Guardar</button><button type="button" class="icon-btn" data-design-tag-delete data-index="${i}" aria-label="Eliminar ${escapeHtml(tag)}">×</button></div>`).join('')}</div></details></details></div>`}
  async function persistDesignTagCatalog(){await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings:{design_tag_catalog:JSON.stringify(state.designTagCatalog||[])}})});}
  async function saveDesignTagCatalog(nextCatalog,oldTag=null,replacement=null){const previousCatalog=[...(state.designTagCatalog||[])],changed=[];try{if(oldTag)for(const asset of state.designAssets.filter(a=>(a.tags||[]).includes(oldTag))){const previous=[...(asset.tags||[])],tags=[...new Set(previous.map(tag=>tag===oldTag?replacement:tag).filter(Boolean))];await api(`/api/admin/design-assets/${Number(asset.id)}`,{method:'PATCH',body:JSON.stringify({tags})});changed.push({id:Number(asset.id),previous});asset.tags=tags;}state.designTagCatalog=nextCatalog;await persistDesignTagCatalog();if(oldTag){state.designTagFilters??={};for(const key of Object.keys(state.designTagFilters))state.designTagFilters[key]=[...new Set(state.designTagFilters[key].map(tag=>tag===oldTag?replacement:tag).filter(Boolean))];}}catch(err){state.designTagCatalog=previousCatalog;for(const change of changed.reverse()){try{await api(`/api/admin/design-assets/${change.id}`,{method:'PATCH',body:JSON.stringify({tags:change.previous})});const asset=state.designAssets.find(a=>Number(a.id)===change.id);if(asset)asset.tags=change.previous;}catch{}}throw err;}}
  function refreshDesignTagPicker(picker,selected){const old=qsa('[data-design-tag-picker]').find(el=>el.dataset.designTagPicker===picker);if(old)old.outerHTML=designTagPickerHtml(picker,selected)}
  function designDialogPayload(){const root=qs('#designDetailEditor');return {scope:qs('[data-design-scope]',root)?.value||'salmos',kind:qs('[data-design-kind]',root)?.value||'individual',name:qs('[data-design-name]',root)?.value||'',note:qs('[data-design-note]',root)?.value||'',tags:designPickerSelections(root),costCents:pesosToCents(qs('[data-design-cost]',root)?.value||10000),printMaterialType:qs('[data-design-print-type]',root)?.value||'dtf_textile',printed:Boolean(qs('[data-design-printed]',root)?.checked),...sheetPayload('detail')}}
  function openDesignPreview(id){
    const a=state.designAssets.find(x=>Number(x.id)===Number(id));if(!a)return;qs('#designPreviewDialog')?.classList.remove('sheet-editor-open');state.activeDesignId=Number(a.id);state.designSheetDrafts??={};state.designSheetDrafts.detail=structuredClone(a.components||[]);state.sheetBoxTarget=null;state.sheetActiveBox=null;state.sheetZoom=1;
    const measures=parseDesignMeasureOptions(a),stage=qs('#designPreviewStage'),url=apiUrl(`/api/admin/design-assets/${a.id}/file`);qs('#designPreviewTitle').textContent=a.name||a.file_name;
    stage.innerHTML=String(a.mime_type||'').startsWith('image/')?`<div class="design-preview-fit checkerboard"><img src="${url}" alt="${escapeHtml(a.name||a.file_name||'Diseño')}"></div>`:`<iframe src="${url}" title="Vista previa"></iframe>`;
    const composition=a.kind==='sheet'?`<h3>Superficie: ${Number(a.width_cm)||'—'} × ${Number(a.height_cm)||'—'} cm</h3>${a.components?.length?`<div class="sheet-cost-table">${a.components.map((c,i)=>`<div>${state.designAssets.find(x=>Number(x.id)===Number(c.designAssetId))?designSmallImage(state.designAssets.find(x=>Number(x.id)===Number(c.designAssetId))):''}<span><strong>${escapeHtml(c.name)} × ${c.quantity}</strong><small>${escapeHtml(designMeasureLabel(c))}</small></span><b>${money(a.sheet_metrics?.componentCostsCents?.[i]||0)}</b></div>`).join('')}</div>${sheetMetricsHtml(Number(a.width_cm),Number(a.height_cm),a.components,Number(a.cost_cents)||1000000)}`:'<p class="muted">Agregá la composición para calcular el desperdicio de esta plancha.</p>'}`:measures.length?designMeasuresOriginsHtml(a,measures):'';
    qs('#designPreviewMeta').innerHTML=`<div class="design-detail-summary"><div><strong>${escapeHtml(designScopeLabel(a))} · ${escapeHtml(designKindLabel(a))}</strong><small>${escapeHtml(a.file_name||'')}</small>${composition}${a.note?`<p>${escapeHtml(a.note)}</p>`:''}${Number(a.printed)?'<span class="status success">Impreso</span>':''}</div><div class="admin-actions"><a class="btn btn-ghost" href="${url}" target="_blank" rel="noopener">Abrir original</a><button class="btn btn-primary" type="button" id="editDesignDetailBtn">Editar</button></div></div>
      <div class="design-detail-editor hidden" id="designDetailEditor"><div class="form-grid design-edit-grid"><div class="field"><label>Sección</label><select class="select" data-design-scope><option value="salmos" ${a.scope==='salmos'?'selected':''}>SALMOS</option><option value="clients" ${a.scope==='clients'?'selected':''}>Clientes</option><option value="mixed" ${a.scope==='mixed'?'selected':''}>Planchas mixtas</option></select></div><div class="field"><label>Tipo</label><select class="select" data-design-kind ${a.scope==='mixed'?'disabled':''}><option value="individual" ${a.kind==='individual'?'selected':''}>Individual</option><option value="sheet" ${a.kind==='sheet'?'selected':''}>Plancha</option></select></div><div class="field"><label>Nombre</label><input class="input" data-design-name value="${escapeHtml(a.name||'')}"></div><div class="field" data-sheet-size><label>Superficie total de la plancha (cm)</label><div class="design-measures"><input class="input" data-design-width type="number" min=".01" step=".01" value="${Number(a.width_cm)||''}" placeholder="Ancho"><span>×</span><input class="input" data-design-height type="number" min=".01" step=".01" value="${Number(a.height_cm)||''}" placeholder="Alto"></div></div><div class="field"><label>Impresión / costo</label><select class="select" data-design-print-type><option value="dtf_textile" ${a.print_material_type!=='dtf_uv'&&a.print_material_type!=='none'?'selected':''}>DTF textil</option><option value="dtf_uv" ${a.print_material_type==='dtf_uv'?'selected':''}>DTF UV</option><option value="none" ${a.print_material_type==='none'?'selected':''}>Sin DTF</option></select></div>${designTagPickerHtml('detail',a.tags||[])}<div class="field" data-sheet-size><label>Costo de la plancha ($)</label><input class="input" type="number" min="0" step=".01" data-design-cost value="${centsToPesos(Number(a.cost_cents)||1000000)}"></div><div class="field full"><label>Nota</label><textarea class="textarea" data-design-note rows="2">${escapeHtml(a.note||'')}</textarea></div></div><div data-individual-options>${designMeasureEditor('detail',measures)}</div><div data-sheet-composition-host></div><div class="design-card-actions"><label class="toggle-label"><input type="checkbox" data-design-printed ${Number(a.printed)?'checked':''}> Impreso</label><button class="btn btn-danger small-delete" type="button" id="deleteDesignDetailBtn">Eliminar</button><span class="dialog-spacer"></span><button class="btn btn-ghost" type="button" id="cancelDesignEditBtn">Cancelar</button><button class="btn btn-primary" type="button" id="saveDesignDetailBtn">Guardar cambios</button></div></div>`;
    refreshDesignKind('detail');qs('#designPreviewDialog').showModal();
  }
  async function moveDesignCard(id,direction,targetId=0){
    if(state.designOrderPending)return;const asset=state.designAssets.find(a=>Number(a.id)===Number(id));if(!asset)return;
    const group=state.designAssets.filter(a=>a.scope===asset.scope&&a.kind===asset.kind),from=group.findIndex(a=>Number(a.id)===Number(id)),to=targetId?group.findIndex(a=>Number(a.id)===Number(targetId)):from+direction;
    if(to<0||to>=group.length||to===from)return;const [item]=group.splice(from,1);group.splice(to,0,item);state.designOrderPending=true;
    try{await api('/api/admin/design-assets/order',{method:'PATCH',body:JSON.stringify({scope:asset.scope,kind:asset.kind,ids:group.map(a=>Number(a.id))})});let i=0;state.designAssets=state.designAssets.map(a=>a.scope===asset.scope&&a.kind===asset.kind?group[i++]:a);
      const card=qs(`[data-design-card="${id}"]`),gallery=card?.closest('.design-grid');if(gallery){gallery.innerHTML=group.map(designCard).join('');qs(`[data-design-card="${id}"] [data-preview-design]`,gallery)?.focus({preventScroll:true});updateDesignSelectionUI();}
    }finally{state.designOrderPending=false;}
  }
  function renderProductionWasteSheets(){const select=qs('#productionWasteSheet');if(!select)return;select.innerHTML='<option value="">Usar porcentaje manual</option>'+state.designAssets.filter(a=>a.kind==='sheet'&&a.sheet_metrics?.valid).map(a=>`<option value="${a.id}">${escapeHtml(a.name||a.file_name)} · ${Number(a.sheet_metrics.wastePercent).toLocaleString('es-AR',{maximumFractionDigits:2})}% sin usar</option>`).join('');select.value='';}
  function applyProductionSheetWaste(){const select=qs('#productionWasteSheet'),sheet=state.designAssets.find(a=>Number(a.id)===Number(select.value)),m=sheet?.sheet_metrics;if(!m?.valid)return;qs('#productionWaste').value=Number(m.costExtraPercent).toFixed(6);qs('#productionWasteSheetHelp').textContent=`${sheet.name}: ${Number(m.wastePercent).toLocaleString('es-AR',{maximumFractionDigits:2})}% de la plancha sin usar. Se aplica ${Number(m.costExtraPercent).toLocaleString('es-AR',{maximumFractionDigits:2})}% extra sobre la superficie de las estampas para distribuir ese costo.`;calcProductionBuilderCost();}
  function productionMeasureOptions(d){const options=parseDesignMeasureOptions(d);return options.length?options:Number(d.width_cm)>0&&Number(d.height_cm)>0?[{id:'original',destination:'Medida general',size:'',detail:'',widthCm:Number(d.width_cm),heightCm:Number(d.height_cm)}]:[]}
  function openProductionMeasureDialog(id,side='front'){
    const d=state.designAssets.find(x=>Number(x.id)===Number(id));if(!d)return;
    state.productionMeasureDesignId=Number(id);state.productionMeasureSideTarget=side;const selected=state.productionDesignsSelected.find(x=>Number(x.designAssetId)===Number(id)&&(x.printSide||'front')===side),options=productionMeasureOptions(d),choice=selected?.measureOptionId||(options.length===1?options[0].id:options.length?'':'custom');
    qs('#productionMeasureTitle').textContent=`Medidas · ${d.name||d.file_name}`;
    qs('#productionMeasureOptions').innerHTML=options.map(o=>{const cost=designPrintCostCents(d,o.widthCm,o.heightCm);return `<label class="production-measure-choice"><input type="radio" name="productionMeasureChoice" value="${escapeHtml(o.id)}" ${choice===o.id?'checked':''}><span><strong>${escapeHtml(designMeasureLabel(o))}</strong>${cost===null?'':`<small>DTF estimado por unidad: ${money(cost)} · rollo registrado de ${designPrintRollWidth(d)} cm</small>`}${designOriginHtml(o)}</span></label>`}).join('')+`<label class="production-measure-choice"><input type="radio" name="productionMeasureChoice" value="custom" ${choice==='custom'?'checked':''}><span>Otra medida para esta producción</span></label>`;
    qs('#productionCustomMeasure').classList.toggle('hidden',choice!=='custom');qs('#productionMeasureWidth').value=selected?.widthCm||'';qs('#productionMeasureHeight').value=selected?.heightCm||'';qs('#productionMeasureDetail').value=selected?.measureOptionId==='custom'?(selected.measureLabel||'').replace(/ · [\d.]+ × [\d.]+ cm$/,''):'';
    const dialog=qs('#productionMeasureDialog');if(dialog.open)dialog.close();document.body.appendChild(dialog);dialog.showModal();const body=qs('.dialog-body',dialog);if(body)body.scrollTop=0;qs('input[name="productionMeasureChoice"]',dialog)?.focus({preventScroll:true});
  }
  function applyProductionMeasure(){
    const id=Number(state.productionMeasureDesignId),d=state.designAssets.find(x=>Number(x.id)===id),choice=qs('input[name="productionMeasureChoice"]:checked')?.value;if(!d||!choice)throw new Error('Elegí una opción de medidas.');
    const option=choice==='custom'?{id:'custom',destination:qs('#productionMeasureDetail')?.value?.trim()||'Medida personalizada',widthCm:Number(qs('#productionMeasureWidth').value),heightCm:Number(qs('#productionMeasureHeight').value)}:productionMeasureOptions(d).find(x=>x.id===choice);
    if(!option||!Number.isFinite(option.widthCm)||!Number.isFinite(option.heightCm)||option.widthCm<.01||option.heightCm<.01||option.widthCm>10000||option.heightCm>10000)throw new Error('Ingresá el ancho y el alto en centímetros.');
    const side=state.productionMeasureSideTarget||'front',existing=state.productionDesignsSelected.find(x=>Number(x.designAssetId)===id&&(x.printSide||'front')===side),entry={designAssetId:id,quantity:existing?.quantity||1,widthCm:option.widthCm,heightCm:option.heightCm,measureOptionId:option.id,measureLabel:designMeasureLabel(option),printSide:side};
    if(existing){if(existing.measureOptionId!==entry.measureOptionId)delete existing.mockupPlacement;Object.assign(existing,entry);state.mockupSelectedLayer=`design-${state.productionDesignsSelected.indexOf(existing)}`;}else{state.productionDesignsSelected.push(entry);state.mockupSelectedLayer=`design-${state.productionDesignsSelected.length-1}`;}
    qs('#productionMeasureDialog').close();renderProductionSelectedDesigns();renderProductionDesignGallery();
    if(state.productionMeasureQueue?.length)openProductionMeasureDialog(state.productionMeasureQueue.shift());
  }

function normalizePromotions(value){
  if(typeof value==='string'){try{value=JSON.parse(value)}catch{throw new Error('Revisá las promociones guardadas.')}}
  if(!Array.isArray(value)||value.length>50)throw new Error('Podés guardar hasta 50 promociones.');
  return value.map((r,i)=>{
    const p={id:String(r.id||`promo-${i+1}`).slice(0,80),name:String(r.name||'').trim().slice(0,100),active:r.active!==false,trigger:r.trigger,threshold:Number(r.threshold),triggerProductId:Number(r.triggerProductId)||0,triggerType:String(r.triggerType||'').slice(0,50),target:r.target,targetProductId:Number(r.targetProductId)||0,targetType:String(r.targetType||'').slice(0,50),benefit:r.benefit,value:Number(r.value),basis:r.basis==='unit'?'unit':'total'};
    if(!p.name||!['amount','quantity','combination'].includes(p.trigger)||!['products','shipping','order'].includes(p.target)||!['percent','fixed','unit_price'].includes(p.benefit)||!Number.isSafeInteger(p.threshold)||p.threshold<(p.trigger==='quantity'?1:0)||!Number.isFinite(p.value)||p.value<0||!Number.isSafeInteger(p.triggerProductId)||p.triggerProductId<0||!Number.isSafeInteger(p.targetProductId)||p.targetProductId<0)throw new Error(`Revisá los campos de la promoción ${i+1}.`);
    if(p.trigger==='combination'){
      if(!Array.isArray(r.requirements)||!r.requirements.length||r.requirements.length>20)throw new Error('Agregá los tipos y cantidades de la combinación.');
      p.requirements=r.requirements.map(x=>({type:String(x.type||'').trim().slice(0,50),quantity:Number(x.quantity)}));
      if(p.requirements.some(x=>!x.type||x.type==='__combination__'||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>10000)||new Set(p.requirements.map(x=>x.type)).size!==p.requirements.length)throw new Error('Cada tipo debe aparecer una sola vez, con una cantidad válida.');
    }
    if(p.targetType==='__combination__'&&p.trigger!=='combination')throw new Error('El beneficio sobre la combinación necesita una condición combinada.');
    if(p.benefit==='percent'&&p.value>100)throw new Error('El porcentaje no puede superar 100.');
    if(p.benefit!=='percent'&&!Number.isSafeInteger(p.value))throw new Error('Revisá el importe de la promoción.');
    if(p.benefit==='unit_price'&&p.target!=='products')throw new Error('El precio por unidad solo se aplica a productos.');
    return p;
  });
}
function promotionProductType(category='',fit=''){const c=String(category).toLowerCase(),f=String(fit).toLowerCase();if(c.includes('remera')||c.includes('shirt'))return f.includes('over')?'shirt_oversize':f.includes('crop')?'shirt_crop':'shirt_classic';if(c.includes('gorra')||c.includes('cap'))return 'cap';if(c.includes('taza')||c.includes('mug'))return 'mug';if(c.includes('vaso')||c.includes('glass'))return 'glass';if(c.includes('termo')||c.includes('thermos'))return 'thermos';return c;}
function calculatePromotions(rules,items,shippingCostCents=0){
  const lines=items.map(x=>({productId:Number(x.productId??x.product_id),type:x.promotionType||promotionProductType(x.category_slug||x.category_name,x.fit),quantity:Number(x.quantity??x.qty)||0,price:Number(x.priceCents??x.price_cents)||0})),subtotal=lines.reduce((s,x)=>s+x.quantity*x.price,0),shipping=Math.max(0,Math.round(Number(shippingCostCents)||0));
  const chosen=new Map();
  for(const rule of rules||[]){if(!rule.active)continue;
    const combined=rule.trigger==='combination',requirements=rule.requirements||[];
    if(combined&&(!requirements.length||requirements.some(r=>lines.filter(x=>x.type===r.type).reduce((n,x)=>n+x.quantity,0)<r.quantity)))continue;
    const condition=lines.filter(x=>(!rule.triggerProductId||x.productId===rule.triggerProductId)&&(!rule.triggerType||x.type===rule.triggerType)),threshold=condition.reduce((s,x)=>s+(rule.trigger==='quantity'?x.quantity:x.quantity*x.price),0);
    if(!combined&&(!condition.length||threshold<rule.threshold))continue;
    const targets=lines.filter(x=>(!rule.targetProductId||x.productId===rule.targetProductId)&&(!rule.targetType||(rule.targetType==='__combination__'?requirements.some(r=>r.type===x.type):x.type===rule.targetType))),productBase=targets.reduce((s,x)=>s+x.quantity*x.price,0),quantity=targets.reduce((s,x)=>s+x.quantity,0);
    const base=rule.target==='shipping'?shipping:rule.target==='order'?subtotal+shipping:productBase;
    let discount=rule.benefit==='unit_price'?targets.reduce((s,x)=>s+Math.max(0,x.price-rule.value)*x.quantity,0):rule.benefit==='percent'?Math.round(base*rule.value/100):rule.value*(rule.target==='products'&&rule.basis==='unit'?quantity:1);
    discount=Math.max(0,Math.min(base,Math.round(discount)));const key=combined?(rule.target==='products'?`products:${rule.targetType||'all'}`:rule.target):rule.target==='products'&&rule.targetType?`products:${rule.targetType}`:rule.targetType||rule.triggerType?rule.target:'legacy';const prior=chosen.get(key);if(prior&&prior.discount>=discount)continue;chosen.set(key,{rule,discount,productBase});
  }
  let pd=0,sd=0;const applied=[];for(const {rule,discount,productBase} of chosen.values()){const remainingProducts=Math.max(0,subtotal-pd),remainingShipping=Math.max(0,shipping-sd);const productPart=rule.target==='shipping'?0:Math.min(discount,rule.target==='products'?Math.min(productBase,remainingProducts):remainingProducts),shippingPart=rule.target==='products'?0:Math.min(remainingShipping,Math.max(0,discount-productPart));if(productPart+shippingPart>0){pd+=productPart;sd+=shippingPart;applied.push(rule)}}
  return {id:applied.map(x=>x.id).join(',')||null,label:applied.map(x=>x.name).join(' + '),applied:applied.map(x=>x.id),productDiscountCents:pd,shippingDiscountCents:sd,totalDiscountCents:pd+sd,subtotalCents:subtotal,finalSubtotalCents:subtotal-pd,finalShippingCostCents:shipping-sd,totalCents:subtotal+shipping-pd-sd};
}
  function settingProductTypeOptions(selected='',includeAll=true){
    const choices=[['','Todos los tipos'],['shirt_classic','Remeras clásicas'],['shirt_oversize','Remeras oversize'],['shirt_crop','Remeras crop'],['cap','Gorras'],['mug','Tazas'],['glass','Vasos'],['thermos','Termos'],['bag','Mochilas / bolsos']];
    for(const p of state.products){const type=promotionProductType(p.category_slug||p.category_name,p.fit);if(type&&!choices.some(x=>x[0]===type))choices.push([type,p.category_name||type]);}
    return choices.filter(([value])=>includeAll||value).map(([value,label])=>`<option value="${escapeHtml(value)}" ${selected===value?'selected':''}>${escapeHtml(label)}</option>`).join('');
  }
  function promotionRequirementRow(r={}){return `<div class="promotion-requirement" data-promo-requirement><label class="field">Tipo de producto<select class="select" data-promo-requirement-type>${settingProductTypeOptions(r.type||'shirt_classic',false)}</select></label><label class="field">Cantidad mínima<input class="input" data-promo-requirement-quantity type="number" min="1" max="10000" step="1" value="${Number(r.quantity)||1}" required></label><button type="button" class="icon-btn" data-remove-promo-requirement aria-label="Quitar tipo">×</button></div>`;}
  function promotionEditorRow(p={}){
    const select=(field,options,value)=>`<select class="select" data-promo-field="${field}">${options.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select>`;
    const oldTrigger=state.products.find(x=>Number(x.id)===Number(p.triggerProductId)),oldTarget=state.products.find(x=>Number(x.id)===Number(p.targetProductId));
    const triggerType=p.triggerType||(oldTrigger?promotionProductType(oldTrigger.category_slug||oldTrigger.category_name,oldTrigger.fit):''),targetType=p.targetType??(oldTarget?promotionProductType(oldTarget.category_slug||oldTarget.category_name,oldTarget.fit):triggerType);
    return `<fieldset class="promotion-editor-row" data-promotion-row data-promotion-id="${escapeHtml(p.id||crypto.randomUUID())}" data-trigger-product-id="${Number(p.triggerProductId)||0}" data-target-product-id="${Number(p.targetProductId)||0}"><legend>Promoción</legend><div class="promotion-form-grid">
      <label class="field">Nombre<input class="input" data-promo-field="name" value="${escapeHtml(p.name||'')}" placeholder="Nombre de la promoción" required maxlength="100"></label>
      <label class="toggle-label"><input type="checkbox" data-promo-field="active" ${p.active===false?'':'checked'}> Activa</label>
      <label class="field">Condición${select('trigger',[['amount','Importe ($)'],['quantity','Cantidad de unidades'],['combination','Combinación de tipos']],p.trigger||'quantity')}</label>
      <label class="field" data-promo-simple>Tipo que activa<select class="select" data-promo-field="triggerType">${settingProductTypeOptions(triggerType)}</select></label>
      <label class="field" data-promo-simple>A partir de<input class="input" data-promo-field="threshold" type="number" min="0" step="1" required value="${p.threshold===undefined?'':p.trigger==='amount'?p.threshold/100:p.threshold}"></label>
      <div class="promotion-combination" data-promo-combination><strong>La compra debe incluir todos estos tipos</strong><div data-promo-requirements>${(p.requirements?.length?p.requirements:[{}]).map(promotionRequirementRow).join('')}</div><button type="button" class="btn btn-ghost" data-add-promo-requirement>+ Agregar tipo</button><small>El beneficio se aplica una vez al cumplir todas las cantidades mínimas. Para descontar compra y envío, guardá una promoción para cada beneficio con la misma combinación.</small></div>
      <label class="field">Aplicar a${select('target',[['products','Productos'],['shipping','Envío'],['order','Total de la compra']],p.target||'products')}</label>
      <label class="field">Tipo que recibe el beneficio<select class="select" data-promo-field="targetType"><option value="__combination__" ${targetType==='__combination__'?'selected':''}>Tipos de la combinación</option>${settingProductTypeOptions(targetType)}</select></label>
      <label class="field">Beneficio${select('benefit',[['percent','Porcentaje (%)'],['fixed','Pesos ($)'],['unit_price','Precio final por unidad ($)']],p.benefit||'percent')}</label>
      <label class="field">Valor<input class="input" data-promo-field="value" type="number" min="0" step=".01" required value="${p.value===undefined?'':p.benefit==='percent'?p.value:p.value/100}"></label>
      <label class="field">Descuento en pesos${select('basis',[['total','Una vez sobre el conjunto'],['unit','Por cada unidad']],p.basis||'total')}</label>
      <label class="field" data-promo-simple>Simular cantidad<input class="input" data-promo-preview="quantity" type="number" min="1" step="1" value="${p.trigger==='quantity'?Math.max(1,Number(p.threshold)||1):3}"></label>
      <label class="field">Simular envío ($)<input class="input" data-promo-preview="shipping" type="number" min="0" step="1" value="5000"></label>
    </div><div class="promotion-preview" data-promotion-preview></div><div class="promotion-row-actions"><button class="btn btn-ghost" type="button" data-promo-confirm>Guardar y configurar otra</button><button class="btn btn-danger small-delete" type="button" data-remove-promotion>Quitar promoción</button></div></fieldset>`;
  }
  function readPromotionRow(row){
    const get=k=>qs(`[data-promo-field="${k}"]`,row),trigger=get('trigger').value,benefit=get('benefit').value;
    return {id:row.dataset.promotionId,name:get('name').value.trim(),active:get('active').checked,trigger,threshold:trigger==='combination'?0:trigger==='amount'?pesosToCents(get('threshold').value):Number(get('threshold').value),triggerProductId:trigger==='combination'?0:Number(row.dataset.triggerProductId)||0,triggerType:trigger==='combination'?'':get('triggerType').value,requirements:trigger==='combination'?qsa('[data-promo-requirement]',row).map(r=>({type:qs('[data-promo-requirement-type]',r).value,quantity:Number(qs('[data-promo-requirement-quantity]',r).value)})):[],target:get('target').value,targetProductId:Number(row.dataset.targetProductId)||0,targetType:get('target').value==='products'?get('targetType').value:'',benefit,value:benefit==='percent'?Number(get('value').value):pesosToCents(get('value').value),basis:get('basis').value};
  }
  function promotionPreviewImage(p){return p?.primary_image_url?`<img class="promotion-preview-thumb" src="${escapeHtml(p.primary_image_url)}" alt="${escapeHtml(p.name)}" loading="lazy">`:'<span class="promotion-preview-thumb">Sin foto</span>';}
  function renderPromotionPreview(row){
    const host=qs('[data-promotion-preview]',row);if(!host)return;
    const rule=readPromotionRow(row),shipping=pesosToCents(qs('[data-promo-preview="shipping"]',row)?.value||0),typeOf=p=>promotionProductType(p.category_slug||p.category_name,p.fit),matches=(p,type,id)=>!id||Number(p.id)===Number(id);
    const productsFor=(type,id=0)=>state.products.filter(p=>(!type||typeOf(p)===type)&&matches(p,type,id));
    const summary=result=>`<div class="promotion-preview-total"><strong>Descuento en productos: ${money(result.productDiscountCents)}</strong><strong>Descuento en envío: ${money(result.shippingDiscountCents)}</strong><span>Compra: ${money(result.finalSubtotalCents)} · Envío: ${money(result.finalShippingCostCents)}</span><b>Total con beneficio: ${money(result.totalCents)}</b></div>`;
    if(rule.trigger==='combination'){
      const requirements=rule.requirements;
      if(!requirements.length||requirements.some(x=>!Number.isSafeInteger(x.quantity)||x.quantity<1)||new Set(requirements.map(x=>x.type)).size!==requirements.length){host.innerHTML='<small>Elegí tipos diferentes y sus cantidades para ver la combinación.</small>';return;}
      const groups=requirements.map(r=>({...r}));
      if(rule.target==='products'&&rule.targetType&&rule.targetType!=='__combination__'&&!groups.some(g=>g.type===rule.targetType))groups.push({type:rule.targetType,quantity:1});
      row._promotionPreviewProducts??={};const items=[];let incomplete=false;
      const cards=groups.map((g,i)=>{const choices=productsFor(g.type),product=choices.find(p=>Number(p.id)===Number(row._promotionPreviewProducts[g.type]))||choices[0];
        if(!product){incomplete=true;return `<div><strong>${escapeHtml(g.type)}</strong><small>No hay productos cargados de este tipo.</small></div>`;}
        items.push({...product,productId:product.id,quantity:g.quantity});
        return `<div>${promotionPreviewImage(product)}<label class="field">${g.quantity} × <select class="select" data-promo-preview-product="${escapeHtml(g.type)}" aria-label="Producto ${i+1} de la combinación">${choices.map(p=>`<option value="${p.id}" ${p.id===product.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}</select></label><small>${money(product.price_cents)} / u · ${money(Number(product.price_cents)*g.quantity)}</small></div>`;
      }).join('');
      const result=calculatePromotions([{...rule,active:true}],items,shipping);
      host.innerHTML=`<strong>Vista previa de la combinación completa</strong><div class="promotion-preview-rows">${cards}</div>${incomplete?'<small>Completá los tipos que faltan en el catálogo para calcular esta combinación.</small>':summary(result)}<small>Podés cambiar cada miniatura por otro producto del mismo tipo. Se muestran las cantidades mínimas; no se multiplica el beneficio por repetir la combinación.</small>`;
      return;
    }
    const targetProducts=rule.target==='products',type=targetProducts?rule.targetType:rule.triggerType,id=targetProducts?rule.targetProductId:rule.triggerProductId,qty=Math.max(1,Math.round(Number(qs('[data-promo-preview="quantity"]',row)?.value)||1)),products=productsFor(type,id);
    if(!products.length){host.innerHTML='<small>No hay productos de este tipo para previsualizar.</small>';return;}
    host.innerHTML=`<strong>Vista previa · ${qty} unidad${qty===1?'':'es'} · al cumplir la condición</strong><div class="promotion-preview-rows">${products.map(p=>{
      const result=calculatePromotions([{...rule,active:true,trigger:'quantity',threshold:1,triggerType:'',triggerProductId:0}],[{...p,productId:p.id,quantity:qty}],shipping);
      return `<div>${promotionPreviewImage(p)}<strong>${escapeHtml(p.name)}</strong><small>${money(p.price_cents)} / u</small>${summary(result)}</div>`;
    }).join('')}</div><small>Solo se muestran los tipos que reciben el beneficio; para envío o compra, los tipos que lo activan.</small>`;
  }
  function syncPromotionFields(row){
    const get=k=>qs(`[data-promo-field="${k}"]`,row),product=get('target').value==='products',combined=get('trigger').value==='combination';
    qsa('[data-promo-simple]',row).forEach(el=>{el.classList.toggle('hidden',combined);qsa('input,select',el).forEach(input=>input.disabled=combined);});
    const group=qs('[data-promo-combination]',row);group.classList.toggle('hidden',!combined);qsa('input,select,button',group).forEach(el=>el.disabled=!combined);
    const option=qs('option[value="__combination__"]',get('targetType'));option.disabled=!combined;option.hidden=!combined;
    if(!combined&&get('targetType').value==='__combination__')get('targetType').value=get('triggerType').value;
    get('targetType').disabled=!product;get('basis').disabled=!product||get('benefit').value!=='fixed';
    const unit=qs('option[value="unit_price"]',get('benefit'));unit.disabled=!product;if(!product&&get('benefit').value==='unit_price')get('benefit').value='percent';
    get('threshold').step=get('trigger').value==='quantity'?'1':'.01';get('threshold').min=get('trigger').value==='quantity'?'1':'0';renderPromotionPreview(row);
  }
  function readPromotionSettings(){return normalizePromotions(qsa('[data-promotion-row]').map(readPromotionRow));}
  function motoBandRow(b={}){const mode=['fixed','per_km','discount_fixed','discount_percent'].includes(b.mode)?b.mode:'fixed',value=b.value??b.pricePesos??'';return `<div class="moto-band-row" data-moto-band><label class="field">Hasta (km)<input class="input" data-band-km type="number" min=".1" step=".1" required value="${Number(b.maxKm)||''}"></label><label class="field">Qué aplicar<select class="select" data-band-mode><option value="fixed" ${mode==='fixed'?'selected':''}>Precio final fijo del envío</option><option value="per_km" ${mode==='per_km'?'selected':''}>Precio fijo por km</option><option value="discount_fixed" ${mode==='discount_fixed'?'selected':''}>Descuento fijo sobre el total</option><option value="discount_percent" ${mode==='discount_percent'?'selected':''}>Descuento porcentual sobre el total</option></select></label><label class="field"><span data-band-value-label>${mode==='per_km'?'Pesos por km ($)':mode==='discount_fixed'?'Descuento ($)':mode==='discount_percent'?'Descuento (%)':'Precio final ($)'}</span><input class="input" data-band-value type="number" min="0" step=".01" required value="${value}"></label><button type="button" class="icon-btn" data-remove-band aria-label="Quitar tramo">×</button></div>`}
  function syncMotoBandRow(row){const mode=qs('[data-band-mode]',row)?.value,labels={fixed:'Precio final ($)',per_km:'Pesos por km ($)',discount_fixed:'Descuento ($)',discount_percent:'Descuento (%)'},input=qs('[data-band-value]',row);const label=qs('[data-band-value-label]',row);if(label)label.textContent=labels[mode]||labels.fixed;if(input){input.max=mode==='discount_percent'?'100':'';input.step=mode==='discount_percent'?'.1':'.01';}}
  async function renderSettings(){
    const [d,rulesData,correoStatus,productsData]=await Promise.all([api('/api/admin/settings'),api('/api/admin/shipping/rules'),api('/api/admin/correo/status').catch(e=>({configured:false,authOk:false,message:e.message,environment:'test'})),api('/api/admin/products')]);state.products=productsData.items||[];state.settings=d.settings||{};state.correoStatus=correoStatus;
    const s=state.settings;const shippingRules=rulesData.items||[];const cs=state.correoStatus||{};
    qs('#adminContent').innerHTML=`<form id="settingsForm">
      <div class="settings-grid">
        <section class="settings-card"><h3>Datos de SALMOS</h3><div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${escapeHtml(s.whatsapp||'5491162691341')}"></div><div class="field" style="margin-top:10px"><label>Instagram</label><input class="input" name="instagram" value="${escapeHtml(s.instagram||'')}"></div><div class="field" style="margin-top:10px"><label>Facebook</label><input class="input" name="facebook" value="${escapeHtml(s.facebook||'')}"></div></section>
        <section class="settings-card"><h3>Motomensajería</h3><div class="field"><label>Precio por km</label><input class="input" type="number" name="moto_rate_per_km" value="${escapeHtml(s.moto_rate_per_km||'800')}"></div><div class="field" style="margin-top:10px"><label>Envío mínimo</label><input class="input" type="number" name="moto_min_charge" value="${escapeHtml(s.moto_min_charge||'2000')}"><small class="field-help">Aunque la distancia dé menos, nunca se cobrará menos de este importe.</small></div><div class="field" style="margin-top:10px"><label>Máximo de km</label><input class="input" type="number" name="moto_max_km" value="${escapeHtml(s.moto_max_km||'50')}"></div><div class="field" style="margin-top:10px"><label>Demora mínima / máxima (horas)</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="input" type="number" name="moto_min_hours" value="${escapeHtml(s.moto_min_hours||'1')}"><input class="input" type="number" name="moto_max_hours" value="${escapeHtml(s.moto_max_hours||'4')}"></div></div></section>
        <section class="settings-card"><h3>Vía Cargo</h3><label class="toggle-label"><input type="checkbox" name="via_cargo_enabled" ${s.via_cargo_enabled==='true'?'checked':''}> Habilitar envío a coordinar</label><p class="field-help">El cliente paga los productos y coordina el costo del envío por separado.</p><div class="field"><label>Instrucciones</label><textarea class="textarea" name="via_cargo_instructions">${escapeHtml(s.via_cargo_instructions||'Coordinamos el despacho por WhatsApp. El envío se cotiza y abona por separado.')}</textarea></div></section><section class="settings-card"><h3>Retiro</h3><label class="toggle-label"><input type="checkbox" name="pickup_enabled" ${s.pickup_enabled==='true'?'checked':''}> Habilitar retiro</label><div class="field" style="margin-top:10px"><label>Dirección</label><input class="input" name="pickup_address" value="${escapeHtml(s.pickup_address||'')}"></div><div class="field" style="margin-top:10px"><label>Instrucciones / horarios</label><textarea class="textarea" name="pickup_instructions">${escapeHtml(s.pickup_instructions||'')}</textarea></div></section>
        <section class="settings-card moto-settings"><h3>Precios de motomensajería por distancia</h3><p class="field-help">Cada fila se aplica hasta esos kilómetros. Podés fijar el envío, cobrar por km o dar un descuento que se refleja en el carrito. Sin tramos se usa el precio por km general.</p><div id="motoBandsEditor">${JSON.parse(s.moto_distance_bands||'[]').map(motoBandRow).join('')}</div><button type="button" class="btn btn-ghost" id="addMotoBandBtn">+ Agregar tramo</button></section>
        <section class="settings-card promotions-settings"><h3>Promociones automáticas</h3><p>Se aplican cuando el carrito cumple la condición. Para cada tipo de producto se aplica la promoción que más ahorre. Los descuentos de tipos distintos pueden combinarse; los cupones se calculan después. El envío de Vía Cargo se paga aparte.</p><div id="promotionsEditor">${JSON.parse(s.automatic_promotions||'[]').map(promotionEditorRow).join('')}</div><button type="button" class="btn btn-primary" id="addPromotionBtn">+ Agregar promoción</button></section>
        <section class="settings-card zone-settings"><h3>Reglas por zona / calle</h3><p class="muted">Sirven para sumar o descontar según texto de la dirección. Ej.: “Barrio X” +$800 o “Zona Y” −$500.</p><div class="form-grid"><div class="field"><label>Nombre</label><input class="input" id="shippingRuleName" placeholder="Ej.: Calle de tierra conocida"></div><div class="field"><label>Texto que debe contener la dirección</label><input class="input" id="shippingRuleMatch" placeholder="Ej.: Barrio Uno"></div><div class="field"><label>Ajuste ($)</label><input class="input" id="shippingRuleAdjustment" type="number" step="100" placeholder="800 o -500"></div><div class="field" style="align-self:end"><button class="btn btn-primary" type="button" id="addShippingRuleBtn">Agregar regla</button></div></div><div style="display:grid;gap:8px;margin-top:12px">${shippingRules.length?shippingRules.map(r=>`<div class="notice" style="display:flex;gap:10px;align-items:center;justify-content:space-between"><span><strong>${escapeHtml(r.name)}</strong> · “${escapeHtml(r.match_text)}” · ${Number(r.adjustment_cents)>=0?'+':''}${money(r.adjustment_cents)}</span><button type="button" class="btn btn-danger" data-delete-shipping-rule="${r.id}">Eliminar</button></div>`).join(''):'<div class="muted">Todavía no hay reglas especiales.</div>'}</div></section>
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
    </form>`;qsa('[data-promotion-row]').forEach(syncPromotionFields);qsa('[data-moto-band]').forEach(syncMotoBandRow);
  }

  async function saveSettings(){if(!qs('#settingsForm').reportValidity())return false;const f=new FormData(qs('#settingsForm'));const settings={};for(const [k,v] of f.entries())settings[k]=String(v);settings.pickup_enabled=f.get('pickup_enabled')?'true':'false';settings.via_cargo_enabled=f.get('via_cargo_enabled')?'true':'false';settings.correo_enabled=f.get('correo_enabled')?'true':'false';settings.correo_auto_create_paid=f.get('correo_auto_create_paid')?'true':'false';settings.automatic_promotions=JSON.stringify(readPromotionSettings());settings.moto_distance_bands=JSON.stringify(qsa('[data-moto-band]').map(row=>({maxKm:Number(qs('[data-band-km]',row).value),mode:qs('[data-band-mode]',row).value,value:Number(qs('[data-band-value]',row).value)})));await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings})});toast('Configuración guardada','success');await renderSettings();return true;}

  function bind(){
    bindMockupCanvas();
    qsa('.admin-nav-btn').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
    qs('#adminMenuBtn').addEventListener('click',()=>qs('#adminSidebar').classList.toggle('open'));
    qs('#mockupAssetForm')?.addEventListener('submit',async e=>{e.preventDefault();try{await saveMockupAsset(e.currentTarget,qs('#saveMockupAssetBtn'))}catch(err){toast(err.message,'error')}});

    qs('#resetMockupZoomBtn')?.addEventListener('click',()=>{state.mockupZoom=1;state.mockupPanX=0;state.mockupPanY=0;applyMockupZoom()});

    qs('#adminThemeBtn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
    qs('#collapseAdminListsBtn')?.addEventListener('click',()=>{const content=qs('#adminContent');qsa('.purchase-row-detail,.finance-row-detail',content).forEach(x=>x.open=false);qsa('.admin-table-wrap',content).forEach(w=>{if(!w.closest('.inventory-group')&&w.querySelectorAll('tbody tr').length>=5)w.classList.add('admin-list-collapsed')});qsa('.inventory-group',content).forEach(g=>g.classList.add('list-collapsed'));qsa('[data-design-list]',content).forEach(g=>g.open=false);qs('#collapseAdminListsBtn')?.classList.add('hidden');qs('#expandAdminListsBtn')?.classList.remove('hidden')});
    qs('#expandAdminListsBtn')?.addEventListener('click',()=>{const content=qs('#adminContent');qsa('.purchase-row-detail,.finance-row-detail',content).forEach(x=>x.open=true);qsa('.admin-list-collapsed',content).forEach(w=>w.classList.remove('admin-list-collapsed'));qsa('.inventory-group.list-collapsed',content).forEach(g=>g.classList.remove('list-collapsed'));qsa('[data-design-list]',content).forEach(g=>g.open=true);qs('#expandAdminListsBtn')?.classList.add('hidden');qs('#collapseAdminListsBtn')?.classList.remove('hidden')});
    const productDialog=qs('#productDialog');
    const productCancelBtn=qs('#productDialog button[value="cancel"]');
    if(productCancelBtn){productCancelBtn.type='button';productCancelBtn.setAttribute('formnovalidate','');productCancelBtn.addEventListener('click',e=>{e.preventDefault();closeProductDialog();});}
    productDialog?.addEventListener('cancel',e=>{e.preventDefault();closeProductDialog();});
    productDialog?.addEventListener('close',resetProductDialogState);
    qs('#otherValueInput')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveOtherEditor();}});
    qs('#purchaseColorDialog')?.addEventListener('cancel',e=>{e.preventDefault();closePurchaseColorDialog();});
    qs('#purchaseForm')?.addEventListener('input',e=>{const row=e.target.closest('[data-purchase-row]');if(row)syncPurchaseRowFromDom(row);if(row||['purchaseSurcharge','purchaseCashAmount','purchaseTransferAmount'].includes(e.target.id))updatePurchaseTotal();});
    qs('#purchaseForm')?.addEventListener('focusout',async e=>{
      const input=e.target.closest?.('.purchase-other-input,[data-purchase-field="color"]');if(!input)return;
      const row=input.closest('[data-purchase-row]');if(!row)return;const i=Number(row.dataset.purchaseRow),x=state.purchaseItems[i];if(!x)return;syncPurchaseRowFromDom(row);
      const value=normalizeOption(input.value);if(!value)return;
      if(input.dataset.purchaseField==='customTypeLabel'){const code=safeCustomTypeCode(value);x.materialType=code;x.customTypeLabel='';if(!customTypeEntries().some(t=>t.code===code))state.purchaseOptions.types.push({code,label:value});x._custom={};}
      else{const field=input.dataset.purchaseField;if(field==='fit')addPurchaseOption('fits',value);else if(field==='materialClass')addPurchaseOption('classes',value);else if(field==='size')addPurchaseOption('sizes',value,normalizePurchaseClass(x.materialClass)||'OTROS');else if(field==='name')addPurchaseOption('materials',value,x.materialType);else if(field==='color')addPurchaseOption('colors',value);x._custom??={};x._custom[field]=false;}
      try{await persistAdminOptionSettings()}catch{}renderPurchaseItems();
    });
    qsa('#productionWeight,#productionHeight,#productionWidth,#productionDepth').forEach(el=>el?.addEventListener('input',()=>{state.productionShippingDirty=true;const hint=qs('#productionShippingHint');if(hint)hint.textContent='Editado'}));
    qs('#purchaseForm')?.addEventListener('change',e=>{
      const row=e.target.closest('[data-purchase-row]');
      if(row){
        const i=Number(row.dataset.purchaseRow),x=state.purchaseItems[i];syncPurchaseRowFromDom(row);
        if(e.target.matches('[data-purchase-feature]')){x.features=qsa('[data-purchase-feature]:checked',row).map(el=>el.value);x.name=x.features.join(' · ');updatePurchaseFeatureSummary(row,x.features);return;}
        if(e.target.matches('[data-purchase-type-select]')){
          const type=e.target.value;
          if(type==='__other__'){openOtherEditor({row:i,field:'customTypeLabel',label:'tipo de producto'});e.target.value=x.materialType||'shirt';return;}
          const d=purchaseDefaultItem(type);state.purchaseItems[i]={...state.purchaseItems[i],...d,materialType:type,features:d.name?[d.name]:[],imageAssetId:null,_imageTouched:true,_custom:{}};
          renderPurchaseItems();return;
        }
        const choice=e.target.dataset.purchaseChoice;
        if(choice){
          x._custom??={};
          if(e.target.value==='__other__'){
            const labels={fit:'corte',materialClass:'clase',size:'talle',name:'material'};
            openOtherEditor({row:i,field:choice,label:labels[choice]||choice});
            e.target.value=x[choice]||'';
            return;
          }
          x[choice]=e.target.value;x._custom[choice]=false;
          if(choice==='materialClass'){const allowed=purchaseSizeOptions(x);if(x.size&&!allowed.includes(x.size))x.size='';}
          renderPurchaseItems();return;
        }
        updatePurchaseTotal();
      }
      if(['purchasePaymentMethod','purchaseSurchargeType'].includes(e.target.id))updatePurchaseTotal();

    });
    qs('#movementForm')?.addEventListener('change',e=>{
      if(e.target.id==='movementCategorySelect'){const input=qs('#movementCategoryOther');if(e.target.value==='__other__'){e.target.value=input.value||'';openOtherEditor({row:-1,field:'category',label:'motivo / etiqueta',kind:'finance'});}else input.value=e.target.value;}
      if(['movementPaymentMethod','movementType','movementSurchargeType'].includes(e.target.id))updateMovementPayment();
      if(e.target.id==='movementType')renderMovementSales();
      if(e.target.id==='movementSaleEnabled'){if(e.target.checked&&!(state.movementSaleItems||[]).length)state.movementSaleItems=[{variantId:0,quantity:1,unitPriceCents:0}];if(e.target.checked&&!qs('#movementCategoryOther').value)renderFinanceReasonSelector('Venta');renderMovementSales();}
      const saleField=e.target.dataset.saleField;if(saleField){const item=state.movementSaleItems[Number(e.target.closest('[data-sale-row]').dataset.saleRow)];if(saleField==='variantId'){const v=state.saleVariants.find(x=>Number(x.id)===Number(e.target.value));Object.assign(item,{variantId:Number(e.target.value),unitPriceCents:Number(v?.price_cents)||0});}else if(saleField==='price')item.unitPriceCents=pesosToCents(e.target.value);else item.quantity=Number(e.target.value);renderMovementSales();}
    });
    qs('#movementForm')?.addEventListener('input',e=>{if(['movementAmount','movementSurcharge','movementCashAmount','movementTransferAmount'].includes(e.target.id))updateMovementPayment();});
    qs('#movementDialog')?.addEventListener('close',()=>{state.editingMovementId=null;qs('#movementDialogTitle').textContent='Nuevo gasto / ingreso';});
    qs('#productImagesInput')?.addEventListener?.('change',()=>{});
    for(const [id,key] of [['designUploadDialog','upload'],['designPreviewDialog','detail']]){
      qs('#'+id)?.addEventListener('cancel',e=>{if(state.designUploadBusy||sheetHasPendingUpload(key)){e.preventDefault();toast('Primero subí el diseño o descartá el archivo pendiente.');}});
      qs('#'+id)?.addEventListener('close',()=>{state.sheetActiveBox=null;state.sheetBoxTarget=null;qs('[data-sheet-preview]',sheetRoot(key)||document)?._sheetResizeObserver?.disconnect();});
    }
    document.addEventListener('change',async e=>{
      if(e.target.matches('[data-promo-field],[data-promo-requirement-type],[data-promo-requirement-quantity]')){
        const row=e.target.closest('[data-promotion-row]');
        if(e.target.dataset.promoField==='triggerType')row.dataset.triggerProductId='0';
        if(e.target.dataset.promoField==='targetType')row.dataset.targetProductId='0';
        if(e.target.dataset.promoField==='trigger'&&e.target.value==='combination'){qs('[data-promo-field="targetType"]',row).value='__combination__';row.dataset.targetProductId='0';}
        syncPromotionFields(row);
      }
      if(e.target.matches('[data-promo-preview-product]')){const row=e.target.closest('[data-promotion-row]');row._promotionPreviewProducts??={};row._promotionPreviewProducts[e.target.dataset.promoPreviewProduct]=Number(e.target.value);renderPromotionPreview(row);}
      if(e.target.matches('[data-design-sheet]')){state.selectedDesignSheets??=new Set();const id=Number(e.target.dataset.designSheet);if(e.target.checked)state.selectedDesignSheets.add(id);else state.selectedDesignSheets.delete(id);}
      if(e.target.matches('[data-design-tag-choice]')){const picker=e.target.closest('[data-design-tag-picker]'),tags=designPickerSelections(picker),summary=qs(':scope > details > summary',picker);if(summary)summary.textContent=tags.length?`${tags.length} opción${tags.length===1?'':'es'} seleccionada${tags.length===1?'':'s'}`:'Elegir etiquetas';}
      if(e.target.matches('[data-design-destination]')){const root=e.target.closest('.design-destinations');if(e.target.checked)qsa('[data-design-destination]',root).forEach(x=>{if(x!==e.target&&(e.target.value==='Todos'||x.value==='Todos'))x.checked=false;});qs('[data-destinations-summary]',root).textContent=qsa('[data-design-destination]:checked',root).map(x=>x.value).join(' / ')||'Todos';}
      if(e.target.id==='designUploadFiles'){
        const files=[...(e.target.files||[])];if(!files.length)return;
        if(qs('#designUploadKind').value==='individual')appendDesignUploadFiles(files);
        else{
          if(state.sheetUploadPreview?.url)URL.revokeObjectURL(state.sheetUploadPreview.url);
          const file=files[0];state.sheetUploadPreview=file?{url:URL.createObjectURL(file),mime_type:file.type,file}:null;state.sheetPixels=null;
          state.sheetMarkTarget=null;state.sheetCompositionConfirmation=null;if(qs('#designSheetCompositionComplete'))qs('#designSheetCompositionComplete').checked=false;
          (state.designSheetDrafts.upload||[]).forEach(c=>{c.previewMarks=[];c.previewBoxes=[];delete c.pendingMeasureOption;c.measureOptionId='';c.quantity=1;});
          renderSheetSelected('upload');
        }
        e.target.value='';
      }
      if(e.target.matches('[data-missing-sheet-file]')){
        const file=e.target.files?.[0],editor=e.target.closest('[data-sheet-editor]'),name=qs('[data-missing-sheet-name]',editor);
        if(file&&name)name.value=file.name.replace(/\.[^.]+$/,'');const key=editor.dataset.sheetEditor;syncSheetUploadGate(key);const status=qs('[data-missing-upload-status]',editor);if(status)status.textContent=file?'Primero tocá Subir y agregar para continuar.':'';
      }
      if(e.target.id==='designUploadKind'){refreshDesignKind('upload');renderDesignUploadBatchMeta();}if(e.target.id==='designSheetCompositionComplete')state.sheetCompositionConfirmation=e.target.checked?sheetCompositionFingerprint():null;
      if(e.target.matches('[data-design-kind]'))refreshDesignKind('detail');
      if(e.target.matches('[data-sheet-measure],[data-sheet-quantity]')){const row=e.target.closest('[data-sheet-component]'),key=row.dataset.sheetKey,c=state.designSheetDrafts[key][Number(row.dataset.sheetComponent)];if(e.target.matches('[data-sheet-measure]')){c.measureOptionId=e.target.value;if(c.pendingMeasureOption?.id!==c.measureOptionId)c.pendingMeasureOption=null;}else c.quantity=Number(e.target.value);renderSheetSelected(key);}
      if(e.target.matches('[data-sheet-exact]')){const row=e.target.closest('[data-sheet-component]'),key=row.dataset.sheetKey,c=state.designSheetDrafts[key]?.[Number(row.dataset.sheetComponent)],asset=state.designAssets.find(a=>Number(a.id)===Number(c?.designAssetId)),size=sheetSize(key),old=c?.pendingMeasureOption||parseDesignMeasureOptions(asset||{}).find(o=>o.id===c?.measureOptionId);if(!c?.previewBoxes?.length||!old)return;const w=Number(qs('[data-sheet-exact="width"]',row)?.value),h=Number(qs('[data-sheet-exact="height"]',row)?.value);if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>size.width||h>size.height){toast('Ingresá ancho y alto que entren en la plancha.','error');return;}const resized=c.previewBoxes.map(box=>{const rotated=Number(box.rotation)%180;return {...box,width:(rotated?h:w)/size.width,height:(rotated?w:h)/size.height}});if(resized.some(box=>box.x+box.width>1.001||box.y+box.height>1.001)){toast('La medida exacta se sale de la plancha: corregí el recuadro.','error');return;}c.previewBoxes=resized;const sheet=state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId));c.pendingMeasureOption=detectedMeasureOption(asset,key==='upload'?state.sheetUploadPreview?.file?.name:sheet?.file_name,{widthCm:w,heightCm:h});c.measureOptionId=c.pendingMeasureOption.id;renderSheetSelected(key);return;}
      if(e.target.matches('[data-band-mode]'))syncMotoBandRow(e.target.closest('[data-moto-band]'));
      if(e.target.matches('[data-production-design-side]')){const item=state.productionDesignsSelected[Number(e.target.dataset.index)];if(item){item.printSide=e.target.value;renderProductionSelectedDesigns();}}
      if(e.target.matches('[data-purchase-image]')){const row=e.target.closest('[data-purchase-row]'),i=Number(row?.dataset.purchaseRow),item=state.purchaseItems[i];if(item){item.imageAssetId=Number(e.target.value)||null;item._imageTouched=true;const asset=state.mockupAssets.find(a=>Number(a.id)===Number(item.imageAssetId)),holder=qs('.purchase-image-choice-row',row);if(holder){const old=qs('img,.purchase-image-placeholder',holder);if(asset){const img=document.createElement('img');img.src=mockupAssetUrl(asset);img.alt='Foto representativa';if(old)old.replaceWith(img);else holder.prepend(img);}else if(old?.tagName==='IMG'){const empty=document.createElement('span');empty.className='purchase-image-placeholder';empty.textContent='Sin foto';old.replaceWith(empty);}}}return;}
      if(['mockupBaseSelect','mockupBackgroundSelect','mockupSideSelect','mockupGenderSelect','mockupModelSelect','mockupGarmentStyleSelect','mockupCapStyleSelect'].includes(e.target.id)){renderMockupStudioOptions();renderMockupLayerControls();refreshMockupPreview().catch(err=>toast(err.message,'error'));}
      if(e.target.id==='mockupAddCap'){renderMockupCapDesignOptions();renderMockupLayerControls();refreshMockupPreview().catch(err=>toast(err.message,'error'));}
      if(e.target.id==='mockupCapDesignSelect'){const asset=state.designAssets.find(a=>Number(a.id)===Number(e.target.value)),option=asset&&productionMeasureOptions(asset)[0];state.mockupCapDesign=asset&&option?{designAssetId:Number(asset.id),measureOptionId:option.id,widthCm:Number(option.widthCm)||0,heightCm:Number(option.heightCm)||0,measureLabel:designMeasureLabel(option),printSide:'front'}:null;renderMockupCapDesignOptions();renderMockupLayerControls();refreshMockupPreview().catch(err=>toast(err.message,'error'));}
      if(e.target.id==='mockupCapMeasureSelect'){const asset=state.designAssets.find(a=>Number(a.id)===Number(state.mockupCapDesign?.designAssetId)),option=asset&&productionMeasureOptions(asset).find(o=>o.id===e.target.value);if(option&&state.mockupCapDesign){state.mockupCapDesign={...state.mockupCapDesign,measureOptionId:option.id,widthCm:Number(option.widthCm)||0,heightCm:Number(option.heightCm)||0,measureLabel:designMeasureLabel(option),mockupPlacement:null};delete state.mockupCapDesign.mockupPlacement;renderMockupLayerControls();refreshMockupPreview().catch(err=>toast(err.message,'error'));}}
      if(e.target.id==='mockupAssetType')syncMockupAssetForm();
      if(e.target.id==='mockupAssetFile'){for(const r of state.mockupUploadQueue||[]){const card=qs(`[data-mockup-upload="${r.id}"]`);if(card)r.values=Object.fromEntries(qsa('[data-mockup-field]',card).map(el=>[el.dataset.mockupField,el.value]));}for(const file of e.target.files||[]){if(!['image/png','image/jpeg','image/webp'].includes(file.type)){toast(`${file.name}: usá PNG, JPG o WEBP.`,'error');continue;}state.mockupUploadQueue.push({id:++state.mockupUploadId,file,url:URL.createObjectURL(file),saved:null})}e.target.value='';renderMockupUploadQueue();}
      if(e.target.id==='mockupCapMaterialSelect'){qs('#mockupCapSalePrice').value='';loadCapPriceSuggestion(e.target.value);calcProductionBuilderCost();}
      if(e.target.matches('[data-mockup-field="category"],[data-mockup-field="color"]'))syncMockupUploadCard(e.target.closest('[data-mockup-upload]'));
      if(e.target.id==='mockupCatalogKind'){state.mockupCatalogKey=e.target.value;renderMockupCatalogEditor();}

      if(e.target.closest?.('#couponForm') && (e.target.name==='applies_to'||e.target.name==='discount_type')){
        const form=qs('#couponForm');if(form){
          const applies=form.elements.applies_to?.value;
          const type=form.elements.discount_type?.value;
          if(applies==='products'&&type==='free')form.elements.discount_type.value='percent';
          const free=form.elements.discount_type?.value==='free';
          if(form.elements.value){form.elements.value.disabled=free;if(free)form.elements.value.value='0';}
        }
      }
      if(e.target.id==='productImagesInput'){addSelectedMedia([...e.target.files],'mediaOrderList');e.target.value=''}
      if(e.target.id==='productionImagesInput'){addSelectedMedia([...e.target.files],'productionMediaOrderList');e.target.value=''}
      if(e.target.matches('[data-recipe-design-id]')){qs('.recipe-measure-note',e.target.closest('[data-recipe-design-row]'))?.remove();}
      if(e.target.matches('[data-design-scope]')){const kind=qs('[data-design-kind]',qs('#designDetailEditor'));kind.disabled=e.target.value==='mixed';if(kind.disabled)kind.value='sheet';refreshDesignKind('detail');}
      if(e.target.id==='designUploadScope'){const kind=qs('#designUploadKind');if(kind){if(e.target.value==='mixed'){kind.value='sheet';kind.disabled=true}else kind.disabled=false}refreshDesignKind('upload');renderDesignUploadBatchMeta();}
      if(e.target.name==='productionMeasureChoice')qs('#productionCustomMeasure').classList.toggle('hidden',e.target.value!=='custom');
      if(e.target.id==='inventoryStage'){qs('#internalPrepBox')?.classList.toggle('hidden',e.target.value!=='to_print')}
      if(e.target.matches('#productForm [name="category_id"]'))syncProductCategoryForm();
      if(e.target.matches('#productForm [name="fit"],#productBaseMaterialFamily,#productRecipeWaste,#productRecipeExtra,[data-recipe-design-id],[data-recipe-design-qty],[data-recipe-material-id],[data-recipe-material-qty]'))updateProductCostEstimate();
      if(e.target.id==='productionWasteSheet'){applyProductionSheetWaste();return;}
      if(e.target.id==='productionMaterialType'){state.productionShippingDirty=false;renderProductionMaterialGallery();renderProductionDesignGallery();renderMockupStudioOptions();syncProductionPublicationDefaults();applyProductionShippingDefaults(true);calcProductionBuilderCost();refreshMockupPreview().catch(()=>{});return}
      if(e.target.id==='productionStockKind'){renderProductionMaterialGallery();calcProductionBuilderCost();return}
      if(e.target.id==='productionCapacity'){state.productionShippingDirty=false;applyProductionShippingDefaults(true);return}
      if(e.target.matches('.order-status-select')){try{await api(`/api/admin/orders/${e.target.dataset.orderId}/status`,{method:'PATCH',body:JSON.stringify({fulfillment_status:e.target.value})});toast('Estado actualizado','success')}catch(err){toast(err.message,'error')}}
    });
    document.addEventListener('click',async e=>{
      const zoomStep=e.target.closest('[data-mockup-zoom-step]');if(zoomStep){state.mockupZoom=Math.max(1,Math.min(5,(Number(state.mockupZoom)||1)+Number(zoomStep.dataset.mockupZoomStep)*.25));applyMockupZoom();return;}
      const resetSheetZoom=e.target.closest('[data-reset-sheet-zoom]');if(resetSheetZoom){state.sheetZoom=1;renderSheetPreview(resetSheetZoom.closest('[data-sheet-editor]')?.dataset.sheetEditor||'upload');return;}
      if(e.target.closest('[data-cancel-missing-sheet-design]')){if(state.designUploadBusy)return;const editor=e.target.closest('[data-sheet-editor]');qs('[data-missing-sheet-file]',editor).value='';qs('[data-missing-upload-status]',editor).textContent='';syncSheetUploadGate(editor.dataset.sheetEditor);return;}
      const uploadMissing=e.target.closest('[data-upload-missing-sheet-design]');if(uploadMissing){try{await uploadMissingSheetDesign(uploadMissing)}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='addPromotionBtn'){qs('#promotionsEditor').insertAdjacentHTML('beforeend',promotionEditorRow());syncPromotionFields(qsa('[data-promotion-row]').at(-1));return;}
      if(e.target.closest('[data-promo-confirm]')){try{if(!await saveSettings())return;qs('#promotionsEditor').insertAdjacentHTML('beforeend',promotionEditorRow());const row=qsa('[data-promotion-row]').at(-1);syncPromotionFields(row);row.scrollIntoView({block:'start',behavior:'smooth'})}catch(err){toast(err.message,'error')}return;}
      if(e.target.closest('[data-add-promo-requirement]')){const row=e.target.closest('[data-promotion-row]'),used=qsa('[data-promo-requirement-type]',row).map(x=>x.value),type=[...qs('[data-promo-field="triggerType"]',row).options].map(x=>x.value).find(x=>x&&!used.includes(x));if(!type){toast('Ya agregaste todos los tipos.');return;}qs('[data-promo-requirements]',row).insertAdjacentHTML('beforeend',promotionRequirementRow({type}));syncPromotionFields(row);return;}
      if(e.target.closest('[data-remove-promo-requirement]')){const row=e.target.closest('[data-promotion-row]');e.target.closest('[data-promo-requirement]').remove();syncPromotionFields(row);return;}
      if(e.target.closest('[data-remove-promotion]')){e.target.closest('[data-promotion-row]').remove();return;}
      if(e.target.id==='addMotoBandBtn'){qs('#motoBandsEditor').insertAdjacentHTML('beforeend',motoBandRow());return;}
      if(e.target.closest('[data-remove-band]')){e.target.closest('[data-moto-band]').remove();return;}

      const features=e.target.closest('[data-manage-features]');if(features){openFeatureManager(Number(features.dataset.manageFeatures));return;}
      if(e.target.closest('[data-feature-close]')){qs('#featureManagerDialog').close();return;}
      if(e.target.closest('[data-feature-remove]')){e.target.closest('.feature-manager-row').remove();return;}
      if(e.target.closest('[data-feature-add]')){qs('[data-feature-manager-rows]').insertAdjacentHTML('beforeend',featureManagerRow());qsa('[data-feature-value]').at(-1)?.focus();return;}
      const saveFeatures=e.target.closest('[data-feature-save]');if(saveFeatures){await saveFeatureManager(saveFeatures);return;}

      const filter=e.target.closest('[data-design-filter]');if(filter){const key=filter.dataset.designFilter,selected=new Set(state.designTagFilters?.[key]||[]);selected.has(filter.dataset.tag)?selected.delete(filter.dataset.tag):selected.add(filter.dataset.tag);state.designTagFilters??={};state.designTagFilters[key]=[...selected];
        if(key==='production')renderProductionDesignGallery();else if(key.startsWith('sheet-')){filter.parentElement.querySelectorAll('[data-design-filter]').forEach(b=>{const active=selected.has(b.dataset.tag);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});filterSheetGallery(filter.closest('[data-sheet-editor]').dataset.sheetEditor)}
        else{const section=filter.closest('.design-library-section'),gallery=qs('.design-grid',section),parts=key.split('-'),scope=parts[0],kind=parts.at(-1)==='individual'?'individual':'sheet',items=state.designAssets.filter(a=>a.scope===scope&&a.kind===kind);gallery.innerHTML=items.filter(a=>designVisible(key,a)).map(designCard).join('')||'<div class="empty-state"><strong>Sin diseños con esos filtros.</strong></div>';updateDesignSelectionUI();filter.parentElement.querySelectorAll('[data-design-filter]').forEach(b=>{const active=selected.has(b.dataset.tag);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))})}return;}
      const tagAdd=e.target.closest('[data-design-tag-add]');if(tagAdd){const picker=tagAdd.closest('[data-design-tag-picker]'),key=picker?.dataset.designTagPicker,selected=designPickerSelections(picker),input=qs('[data-design-tag-new]',picker),value=String(input?.value||'').trim().toLocaleLowerCase('es-AR');if(!value)return;const catalog=[...(state.designTagCatalog||[])];if(!catalog.includes(value))catalog.push(value);selected.push(value);try{await saveDesignTagCatalog(catalog);refreshDesignTagPicker(key,selected)}catch(err){toast(err.message,'error')}return;}
      const tagSave=e.target.closest('[data-design-tag-save]');if(tagSave){const picker=tagSave.closest('[data-design-tag-picker]'),key=picker?.dataset.designTagPicker,index=Number(tagSave.dataset.index),selected=designPickerSelections(picker),value=String(qs('[data-design-tag-value]',tagSave.parentElement)?.value||'').trim().toLocaleLowerCase('es-AR');if(!value)return;const old=state.designTagCatalog[index];if(old&&old!==value&&state.designTagCatalog.includes(value)){toast('Esa opción ya existe.','error');return;}const catalog=[...(state.designTagCatalog||[])];catalog[index]=value;const next=selected.map(x=>x===old?value:x);try{await saveDesignTagCatalog(catalog,old&&old!==value?old:null,old&&old!==value?value:null);refreshDesignTagPicker(key,next)}catch(err){toast(err.message,'error')}return;}
      const tagDelete=e.target.closest('[data-design-tag-delete]');if(tagDelete){const picker=tagDelete.closest('[data-design-tag-picker]'),key=picker?.dataset.designTagPicker,index=Number(tagDelete.dataset.index),selected=designPickerSelections(picker),removed=state.designTagCatalog[index],catalog=[...(state.designTagCatalog||[])];catalog.splice(index,1);try{await saveDesignTagCatalog(catalog,removed,null);refreshDesignTagPicker(key,selected.filter(x=>x!==removed))}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='selectAllDesignsBtn'){state.selectedDesignAssets??=new Set();const ids=state.designAssets.map(a=>Number(a.id)),all=ids.every(id=>state.selectedDesignAssets.has(id));ids.forEach(id=>all?state.selectedDesignAssets.delete(id):state.selectedDesignAssets.add(id));updateDesignSelectionUI();return;}
      const designSelect=e.target.closest('[data-design-select]');if(designSelect){state.selectedDesignAssets??=new Set();const id=Number(designSelect.dataset.designSelect);state.selectedDesignAssets.has(id)?state.selectedDesignAssets.delete(id):state.selectedDesignAssets.add(id);updateDesignSelectionUI();return;}
      const selectAll=e.target.closest('[data-select-all-designs]');if(selectAll){state.selectedDesignAssets??=new Set();const ids=qsa('[data-design-card]',qs('#'+selectAll.dataset.selectAllDesigns)).map(card=>Number(card.dataset.designCard)),all=ids.every(id=>state.selectedDesignAssets.has(id));ids.forEach(id=>all?state.selectedDesignAssets.delete(id):state.selectedDesignAssets.add(id));updateDesignSelectionUI();return;}
      const order=e.target.closest('[data-move-design],[data-design-step]');if(order){try{await moveDesignCard(Number(order.dataset.designId),Number(order.dataset.moveDesign||order.dataset.designStep))}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='deleteSelectedDesignsBtn'){const ids=[...(state.selectedDesignAssets||[])];if(!ids.length)return;if(!confirm(`¿Eliminar ${ids.length} diseño${ids.length===1?'':'s'} seleccionado${ids.length===1?'':'s'}? Esta acción no se puede deshacer.`))return;try{await refreshDesignAssetsForDelete()}catch(err){toast(err.message,'error');return}let removed=0;const blocked=[];for(const id of ids){const reason=designDeleteBlockReason(id);if(reason){blocked.push(reason);continue}try{await api(`/api/admin/design-assets/${id}`,{method:'DELETE'});state.selectedDesignAssets.delete(id);removed++}catch(err){blocked.push(`${state.designAssets.find(a=>Number(a.id)===id)?.name||id}: ${err.message}`)}}await renderDesigns();if(removed)toast(`${removed} diseño${removed===1?'':'s'} eliminado${removed===1?'':'s'}`,'success');if(blocked.length)toast(blocked.join(' '),'error');return;}
      const removeUpload=e.target.closest('[data-remove-upload-file]');if(removeUpload){
        const id=Number(removeUpload.dataset.removeUploadFile),record=(state.designUploadFiles||[]).find(x=>x.id===id);if(!record)return;
        if(record.savedItem){toast('Este archivo ya se guardó. Podés continuar con los pendientes.');return;}
        state.designUploadFiles=state.designUploadFiles.filter(x=>x.id!==id);state.designUploadRenderedIds.delete(id);
        if(record.previewUrl){URL.revokeObjectURL(record.previewUrl);state.designUploadPreviewUrls=state.designUploadPreviewUrls.filter(url=>url!==record.previewUrl);}
        removeUpload.closest('[data-design-batch-row]')?.remove();
        if(!state.designUploadFiles.length)qs('#designUploadBatchMeta').innerHTML='';
        renderDesignUploadBatchMeta();return;
      }
      const addSheet=e.target.closest('[data-add-sheet-design]');if(addSheet){addSheetDesign(addSheet.dataset.sheetKey,Number(addSheet.dataset.addSheetDesign));return;}
      const otherSheet=e.target.closest('[data-sheet-other-size]');if(otherSheet){const key=otherSheet.dataset.sheetKey,c=state.designSheetDrafts[key][Number(otherSheet.dataset.sheetOtherSize)];addSheetDesign(key,Number(c.designAssetId),true);return;}
      const removeSheet=e.target.closest('[data-remove-sheet-component]');if(removeSheet){const key=removeSheet.dataset.sheetKey,index=Number(removeSheet.dataset.removeSheetComponent);state.designSheetDrafts[key].splice(index,1);state.sheetActiveBox=null;if(state.sheetBoxTarget?.key===key){const active=state.sheetBoxTarget.index;if(active===index)state.sheetBoxTarget=null;else if(active>index)state.sheetBoxTarget.index--;}renderSheetSelected(key);return;}

      const groupHead=e.target.closest('.inventory-group-head');if(groupHead){const g=groupHead.closest('.inventory-group');if(g){g.classList.toggle('list-collapsed');return;}}
      const newMeasure=e.target.closest('[data-sheet-new-measure]');if(newMeasure){openSheetMeasure(newMeasure.dataset.sheetKey,Number(newMeasure.dataset.sheetNewMeasure));return;}
      if(e.target.closest('[data-sheet-measure-cancel]')){qs('#sheetMeasureDialog').close();return;}
      const saveMeasure=e.target.closest('[data-sheet-measure-save]');if(saveMeasure){try{await saveSheetMeasure(saveMeasure)}catch(err){toast(err.message,'error')}return;}
      const box=e.target.closest('[data-sheet-box]');if(box){const key=box.dataset.sheetKey||'upload';state.sheetBoxTarget={key,index:Number(box.dataset.sheetBox)};state.sheetActiveBox=null;state.sheetMarkTarget=null;renderSheetSelected(key);return;}
      const mark=e.target.closest('[data-sheet-mark]');if(mark){state.sheetMarkTarget={key:mark.dataset.sheetKey,index:Number(mark.dataset.sheetMark)};state.sheetBoxTarget=null;renderSheetPreview(mark.dataset.sheetKey);return;}
      const undoMark=e.target.closest('[data-sheet-undo]');if(undoMark){const key=undoMark.dataset.sheetKey,index=Number(undoMark.dataset.sheetUndo),c=state.designSheetDrafts[key]?.[index];if(!c?.previewBoxes?.length)return;c.previewBoxes.pop();c.previewMarks?.pop();c.quantity=c.previewBoxes.length;if(!c.quantity){c.measureOptionId='';delete c.pendingMeasureOption;}state.sheetActiveBox=null;renderSheetSelected(key);return;}
      const pin=e.target.closest('[data-sheet-pin]');if(pin){const selected={key:pin.dataset.sheetKey,rowIndex:Number(pin.dataset.sheetPin),boxIndex:Number(pin.dataset.pinIndex)};state.sheetActiveBox=selected;state.sheetBoxTarget={key:selected.key,index:selected.rowIndex};renderSheetSelected(selected.key);return;}
      const canvas=e.target.closest('[data-sheet-canvas]');if(canvas){const target=state.sheetMarkTarget,key=canvas.dataset.sheetCanvas;if(target?.key===key){const c=state.designSheetDrafts[key][target.index];if(c){c.previewMarks??=[];if(c.previewMarks.length>=Number(c.quantity)){toast('Ya marcaste todas las unidades de esta fila.','error');return;}const rect=canvas.getBoundingClientRect();c.previewMarks.push({x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))});renderSheetSelected(key)}}return;}
      const addMeasure=e.target.closest('[data-add-measure-option]');if(addMeasure){qs('[data-measure-rows]',addMeasure.closest('[data-measure-editor]')).insertAdjacentHTML('beforeend',designMeasureRow());return;}
      const removeMeasure=e.target.closest('[data-remove-measure-option]');if(removeMeasure){removeMeasure.closest('[data-measure-option]').remove();return;}
      if(e.target.id==='applyProductionMeasureBtn'){try{applyProductionMeasure()}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='cancelProductionMeasureBtn'||e.target.id==='closeProductionMeasureBtn'){state.productionMeasureQueue=[];qs('#productionMeasureDialog').close();return;}
      const duplicateDesign=e.target.closest('[data-duplicate-production-design]');if(duplicateDesign){const source=state.productionDesignsSelected[Number(duplicateDesign.dataset.duplicateProductionDesign)];if(source){const side=(source.printSide||'front')==='front'?'back':'front',exists=state.productionDesignsSelected.some(x=>Number(x.designAssetId)===Number(source.designAssetId)&&(x.printSide||'front')===side);if(exists)toast(`Ese diseño ya está agregado en ${side==='front'?'el frente':'la espalda'}.`,'');else state.productionDesignsSelected.push({...source,printSide:side,quantity:1});renderProductionSelectedDesigns();}return;}
      const changeMeasure=e.target.closest('[data-change-production-measure]');if(changeMeasure){const row=state.productionDesignsSelected[Number(changeMeasure.dataset.index)];openProductionMeasureDialog(Number(changeMeasure.dataset.changeProductionMeasure),row?.printSide||'front');return;}
      const go=e.target.closest('[data-go]');if(go){navigate(go.dataset.go);return}
      if(e.target.id==='openDesignUploadBtn'||e.target.id==='productionUploadDesignBtn'){openDesignUpload(e.target.id==='productionUploadDesignBtn'?'production':'designs');return;}
      if(e.target.id==='openDesignEmailBtn'){const ids=[...(state.selectedDesignSheets||new Set())];if(!ids.length){toast('Marcá al menos una plancha en las galerías.','error');return;}qs('#designEmailSelection').textContent=`${ids.length} plancha${ids.length===1?'':'s'} seleccionada${ids.length===1?'':'s'}`;qs('#designEmailDialog')?.showModal();return;}
      if(e.target.id==='closeDesignUploadBtn'||e.target.id==='cancelDesignUploadBtn'){if(!state.designUploadBusy)qs('#designUploadDialog')?.close();return}
      if(e.target.id==='closeDesignEmailBtn'||e.target.id==='cancelDesignEmailBtn'){qs('#designEmailDialog')?.close();return}
      if(e.target.id==='closeDesignPreviewBtn'){qs('#designPreviewDialog')?.close();return}
      if(e.target.id==='openFlyerUploadBtn'){const form=qs('#flyerUploadForm');form?.reset();qs('#flyerUploadDialog')?.showModal();return}
      if(e.target.id==='closeFlyerUploadBtn'||e.target.id==='cancelFlyerUploadBtn'){qs('#flyerUploadDialog')?.close();return}
      if(e.target.id==='closeFlyerDetailBtn'||e.target.id==='cancelFlyerDetailBtn'){qs('#flyerDetailDialog')?.close();return}
      const of=e.target.closest('[data-open-flyer]');if(of){openFlyerDetail(Number(of.dataset.openFlyer));return}
      if(e.target.id==='editDesignDetailBtn'){if(state.designAssets.find(a=>Number(a.id)===Number(state.activeDesignId))?.kind==='sheet')qs('#designPreviewDialog')?.classList.add('sheet-editor-open');qs('#designDetailEditor')?.classList.remove('hidden');e.target.closest('.design-detail-summary')?.classList.add('editing');return}
      if(e.target.id==='cancelDesignEditBtn'){if(state.activeDesignId){qs('#designPreviewDialog')?.close();openDesignPreview(state.activeDesignId)}return}
      if(e.target.id==='saveDesignDetailBtn'){if(!state.activeDesignId)return;try{e.target.disabled=true;const payload=designDialogPayload();if(payload.kind==='sheet'){
        for(const c of state.designSheetDrafts.detail||[]){if(!c.previewBoxes?.length||c.previewBoxes.length!==c.quantity)throw new Error('Revisá y marcá cada aparición de la plancha. Podés quitar las marcas equivocadas.');if(c.pendingMeasureOption){const saved=await api(`/api/admin/design-assets/${c.designAssetId}/measures`,{method:'POST',body:JSON.stringify({measureOptions:[c.pendingMeasureOption]})});state.designAssets=state.designAssets.map(a=>Number(a.id)===Number(c.designAssetId)?saved.item:a);c.measureOptionId=c.pendingMeasureOption.id;delete c.pendingMeasureOption;}}
        payload.components=sheetPayload('detail').components;
      }await api(`/api/admin/design-assets/${state.activeDesignId}`,{method:'PATCH',body:JSON.stringify(payload)});toast('Diseño actualizado','success');await renderDesigns();qs('#designPreviewDialog')?.close();openDesignPreview(state.activeDesignId)}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='deleteDesignDetailBtn'){if(!state.activeDesignId)return;try{await refreshDesignAssetsForDelete();const block=designDeleteBlockReason(state.activeDesignId);if(block){toast(block,'error');return}if(!confirm('¿Eliminar este diseño de la biblioteca?'))return;await api(`/api/admin/design-assets/${state.activeDesignId}`,{method:'DELETE'});qs('#designPreviewDialog')?.close();state.activeDesignId=null;toast('Diseño eliminado','success');await renderDesigns()}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='saveFlyerDetailBtn'){if(!state.activeFlyerId)return;try{e.target.disabled=true;await api(`/api/admin/flyers/${state.activeFlyerId}`,{method:'PUT',body:JSON.stringify({title:qs('#flyerDetailTitle')?.value||'',public:Boolean(qs('#flyerDetailPublic')?.checked),sort_order:Number(qs('#flyerDetailSort')?.value)||0})});qs('#flyerDetailDialog')?.close();toast('Flyer actualizado','success');await renderFlyers()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='deleteFlyerDetailBtn'){if(!state.activeFlyerId)return;if(confirm('¿Eliminar este flyer?')){try{await api(`/api/admin/flyers/${state.activeFlyerId}`,{method:'DELETE'});qs('#flyerDetailDialog')?.close();state.activeFlyerId=null;toast('Flyer eliminado','success');await renderFlyers()}catch(err){toast(err.message,'error')}}return}
      const pd=e.target.closest('[data-preview-design]');if(pd){openDesignPreview(Number(pd.dataset.previewDesign));return}
      const zd=e.target.closest('[data-toggle-design-zoom]');if(zd){zd.classList.toggle('fit');return}
      if(e.target.id==='uploadDesignBtn'){try{await uploadDesignFiles(e.target)}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='emailDesignSheetsBtn'){const ids=[...(state.selectedDesignSheets||new Set())];const to=qs('#designEmailTo')?.value.trim();if(!ids.length){toast('Marcá al menos una plancha.','error');return}if(!to){toast('Ingresá el email destinatario.','error');return}try{e.target.disabled=true;e.target.textContent='Enviando...';await api('/api/admin/design-assets/email',{method:'POST',body:JSON.stringify({ids,to,message:qs('#designEmailMessage')?.value||''})});qs('#designEmailDialog')?.close();toast('Mail enviado con enlaces a los originales','success')}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;e.target.textContent='Enviar planchas seleccionadas'}return}
      const openColor=e.target.closest('[data-open-purchase-color]');if(openColor){openPurchaseColorDialog(Number(openColor.dataset.openPurchaseColor));return}
      const colorPick=e.target.closest('[data-purchase-color-dialog]');if(colorPick){
        const i=Number(state.colorEditorRow),x=state.purchaseItems[i];if(!x)return;
        const value=colorPick.dataset.purchaseColorDialog;
        if(value==='__other__'){closePurchaseColorDialog();openOtherEditor({row:i,field:'color',label:'color'});return}
        x.color=value;x._custom??={};x._custom.color=false;closePurchaseColorDialog();renderPurchaseItems();return;
      }
      if(e.target.id==='closePurchaseColorBtn'||e.target.id==='cancelPurchaseColorBtn'){closePurchaseColorDialog();return}
      if(e.target.id==='newPurchaseBtn'){openPurchaseDialog();return}const ep=e.target.closest('[data-edit-purchase]');if(ep){const p=state.purchases.find(x=>Number(x.id)===Number(ep.dataset.editPurchase));if(p)openPurchaseDialog(p);return}if(e.target.id==='saveOtherValueBtn'){saveOtherEditor();return}if(e.target.id==='cancelOtherValueBtn'||e.target.id==='closeOtherValueBtn'){qs('#otherValueDialog')?.close();state.otherEditor=null;if(qs('#purchaseDialog')?.open)renderPurchaseItems();return}
      if(e.target.id==='closePurchaseDialogBtn'||e.target.id==='cancelPurchaseBtn'){qs('#purchaseDialog')?.close();return}
      if(e.target.id==='addPurchaseItemBtn'){state.purchaseItems.push(purchaseDefaultItem('shirt'));renderPurchaseItems();return}
      const pstep=e.target.closest('[data-purchase-step]');if(pstep){const i=Number(pstep.dataset.row),x=state.purchaseItems[i];if(x){x.quantity=Math.max(materialIsDtf(x.materialType)?.01:1,(Number(x.quantity)||0)+(Number(pstep.dataset.purchaseStep)||0));renderPurchaseItems();}return}
      const pdup=e.target.closest('[data-duplicate-purchase-item]');if(pdup){const i=Number(pdup.dataset.duplicatePurchaseItem),src=state.purchaseItems[i];if(src){state.purchaseItems.splice(i+1,0,{...src});renderPurchaseItems();}return}
      const prem=e.target.closest('[data-remove-purchase-item]');if(prem){state.purchaseItems.splice(Number(prem.dataset.removePurchaseItem),1);if(!state.purchaseItems.length)state.purchaseItems.push(purchaseDefaultItem('shirt'));renderPurchaseItems();return}
      if(e.target.id==='savePurchaseBtn'){try{e.target.disabled=true;await savePurchase();qs('#purchaseDialog')?.close();toast('Compra guardada · Stock y Caja actualizados','success');if(state.view==='expenses')await renderExpenses();else await renderPurchases()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      if(e.target.id==='newProductionBtn'){await openProductionDialog();return}
      if(e.target.id==='closeProductionDialogBtn'||e.target.id==='cancelProductionBtn'){qs('#productionDialog')?.close();return}
      const uploadMaterialImage=e.target.closest('[data-upload-material-image]');if(uploadMaterialImage){const row=uploadMaterialImage.closest('[data-purchase-row]');if(row)syncPurchaseRowFromDom(row);try{await openMockupAssetDialog(Number(uploadMaterialImage.dataset.uploadMaterialImage))}catch(err){toast(err.message,'error')}return}
      const variant=e.target.closest('[data-select-mockup-variant]');if(variant){const asset=state.mockupAssets.find(a=>Number(a.id)===Number(variant.dataset.selectMockupVariant));if(!asset)return;const person=['shirt','chomba','hoodie'].includes(asset.product_type);if(person)qs('#mockupGenderSelect').value=asset.gender==='Mujer'?'Mujer':'Varón';qs('#mockupModelSelect').value=asset.model_name||asset.name||'';qs('#mockupGarmentStyleSelect').value=asset.garment_style||'';qs('#mockupSideSelect').value=asset.pose||'front';qs('#mockupCapStyleSelect').value=asset.cap_style||'none';qs('#mockupBaseSelect').value=String(asset.id);renderMockupStudioOptions();refreshMockupPreview().catch(err=>toast(err.message,'error'));return;}
      const background=e.target.closest('[data-select-mockup-background]');if(background){qs('#mockupBackgroundSelect').value=background.dataset.selectMockupBackground||'';renderMockupStudioOptions();refreshMockupPreview().catch(err=>toast(err.message,'error'));return;}
      const selectMockupLayer=e.target.closest('[data-select-mockup-layer]');if(selectMockupLayer){state.mockupSelectedLayer=selectMockupLayer.dataset.selectMockupLayer;renderMockupLayerControls();refreshMockupPreview().catch(()=>{});return}
      if(e.target.id==='manageMockupAssetsBtn'){try{await openMockupAssetDialog()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='closeMockupAssetsBtn'||e.target.id==='cancelMockupAssetBtn'){state.mockupUploadFromPurchaseRow=null;qs('#mockupAssetDialog')?.close();return}
      if(e.target.id==='refreshMockupBtn'){try{await refreshMockupPreview()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='addMockupToProductBtn'){addMockupPreviewToProduct(e.target);return}
      const deleteMockup=e.target.closest('[data-delete-mockup-asset]');if(deleteMockup){try{await removeMockupAsset(Number(deleteMockup.dataset.deleteMockupAsset))}catch(err){toast(err.message,'error')}return;}
      const removePhoto=e.target.closest('[data-mockup-remove]');if(removePhoto){const id=Number(removePhoto.dataset.mockupRemove),r=state.mockupUploadQueue?.find(x=>x.id===id);if(r?.saved){toast('Esta foto ya se guardó. Podés eliminarla de la biblioteca.','error');return;}if(r)URL.revokeObjectURL(r.url);state.mockupUploadQueue=state.mockupUploadQueue.filter(x=>x.id!==id);removePhoto.closest('[data-mockup-upload]')?.remove();return;}
      if(e.target.matches('[data-mockup-catalog-add],[data-mockup-catalog-save],[data-mockup-catalog-delete]')){const key=state.mockupCatalogKey||'models',list=state.mockupCatalog[key];if(e.target.hasAttribute('data-mockup-catalog-add')){const value=qs('#mockupCatalogNew').value.trim();if(value&&!list.includes(value))list.push(value)}else if(e.target.hasAttribute('data-mockup-catalog-delete'))list.splice(Number(e.target.dataset.mockupCatalogDelete),1);else{const value=qs(`[data-mockup-catalog-value="${e.target.dataset.mockupCatalogSave}"]`)?.value.trim();if(value)list[Number(e.target.dataset.mockupCatalogSave)]=value}try{for(const r of state.mockupUploadQueue||[]){const card=qs(`[data-mockup-upload="${r.id}"]`);if(card)r.values=Object.fromEntries(qsa('[data-mockup-field]',card).map(el=>[el.dataset.mockupField,el.value]));}await persistMockupCatalog();renderMockupCatalogEditor();renderMockupUploadQueue();toast('Lista actualizada','success')}catch(err){toast(err.message,'error')}return;}
      const prodTab=e.target.closest('[data-production-tab]');if(prodTab){setProductionTab(Number(prodTab.dataset.productionTab));return}
      if(e.target.id==='productionNextBtn'){if(!state.productionMaterialsSelected.length){toast('Elegí la materia prima que usaste.','error');return}setProductionTab(2);return}
      if(e.target.id==='productionBackBtn'){setProductionTab(1);return}
      const prodStep=e.target.closest('[data-production-step]');if(prodStep){const input=qs('#productionQuantity');input.value=String(Math.max(1,(Number(input.value)||1)+(Number(prodStep.dataset.productionStep)||0)));calcProductionBuilderCost();return}
      const addMat=e.target.closest('[data-add-production-material]');if(addMat){const id=Number(addMat.dataset.addProductionMaterial);if(!state.productionMaterialsSelected.some(x=>Number(x.materialId)===id)){state.productionMaterialsSelected.push({materialId:id,quantity:1});renderProductionSelectedMaterials();renderProductionMaterialGallery();const m=state.materials.find(x=>Number(x.id)===id);if(m?.material_type===(qs('#productionMaterialType')?.value||'shirt')){loadProductionPriceSuggestion(id);state.productionShippingDirty=false;syncProductionPublicationDefaults();applyProductionShippingDefaults(true);}}return}
      const rmMat=e.target.closest('[data-remove-production-material]');if(rmMat){state.productionMaterialsSelected.splice(Number(rmMat.dataset.removeProductionMaterial),1);renderProductionSelectedMaterials();renderProductionMaterialGallery();return}
      const matStep=e.target.closest('[data-prod-material-step]');if(matStep){const i=Number(matStep.dataset.index),x=state.productionMaterialsSelected[i];if(x){x.quantity=Math.max(.001,(Number(x.quantity)||1)+Number(matStep.dataset.prodMaterialStep||0));renderProductionSelectedMaterials();}return}
      const addDes=e.target.closest('[data-add-production-design]');if(addDes){state.productionMeasureQueue=[];openProductionMeasureDialog(Number(addDes.dataset.addProductionDesign));return}
      const rmDes=e.target.closest('[data-remove-production-design]');if(rmDes){state.productionDesignsSelected.splice(Number(rmDes.dataset.removeProductionDesign),1);renderProductionSelectedDesigns();renderProductionDesignGallery();return}
      const desStep=e.target.closest('[data-prod-design-step]');if(desStep){const i=Number(desStep.dataset.index),x=state.productionDesignsSelected[i];if(x){x.quantity=Math.max(1,(Number(x.quantity)||1)+Number(desStep.dataset.prodDesignStep||0));renderProductionSelectedDesigns();}return}
      if(e.target.id==='saveProductionBtn'){try{e.target.disabled=true;const result=await saveProductionBuilder();qs('#productionDialog')?.close();toast(result.stockKind==='to_stock'?'Producto publicado como A stockear · receta guardada':'Producto creado y producción iniciada · materia prima descontada','success');await renderProduction()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const pc=e.target.closest('[data-complete-production]');if(pc){if(confirm('¿Marcar este lote como terminado y sumarlo al stock vendible?')){try{await api(`/api/admin/production/${pc.dataset.completeProduction}/complete`,{method:'PATCH',body:'{}'});toast('Producción terminada · stock actualizado','success');await renderProduction()}catch(err){toast(err.message,'error')}}return}
      const px=e.target.closest('[data-cancel-production]');if(px){if(confirm('¿Cancelar este lote? Los materiales descontados vuelven a materia prima.')){try{await api(`/api/admin/production/${px.dataset.cancelProduction}/cancel`,{method:'PATCH',body:'{}'});toast('Producción cancelada · materiales restituidos','success');await renderProduction()}catch(err){toast(err.message,'error')}}return}
      if(e.target.id==='addRecipeDesignBtn'){state.productRecipeDesigns=collectRecipeDesigns();state.productRecipeDesigns.push({designAssetId:0,quantity:1});renderProductRecipeDesigns();return}
      if(e.target.id==='addRecipeMaterialBtn'){state.productRecipeMaterials=collectRecipeMaterials();state.productRecipeMaterials.push({materialId:0,quantity:1});renderProductRecipeMaterials();return}
      const rrd=e.target.closest('[data-remove-recipe-design]');if(rrd){state.productRecipeDesigns=collectRecipeDesigns();state.productRecipeDesigns.splice(Number(rrd.dataset.removeRecipeDesign),1);renderProductRecipeDesigns();return}
      const rrm=e.target.closest('[data-remove-recipe-material]');if(rrm){state.productRecipeMaterials=collectRecipeMaterials();state.productRecipeMaterials.splice(Number(rrm.dataset.removeRecipeMaterial),1);renderProductRecipeMaterials();return}
      if(e.target.id==='newProductBtn'){await openProductionDialog();return}
      const edit=e.target.closest('[data-edit-product]');if(edit){await openProductDialog(Number(edit.dataset.editProduct));return}
      const dup=e.target.closest('[data-duplicate-product]');if(dup){await openProductDialog(Number(dup.dataset.duplicateProduct),true);return}
      const move=e.target.closest('[data-move-media]');if(move){moveMedia(move.dataset.mediaKey,Number(move.dataset.moveMedia));return}
      const rm=e.target.closest('[data-remove-media]');if(rm){const key=rm.dataset.removeMedia;const item=state.mediaItems.find(x=>x.key===key);if(!item)return;if(item.existing&&item.id){if(!confirm('¿Eliminar este archivo del producto?'))return;await api(`/api/admin/media/${item.id}`,{method:'DELETE'});}else if(item.url?.startsWith('blob:')){URL.revokeObjectURL(item.url);}state.mediaItems=state.mediaItems.filter(x=>x.key!==key);state.newFiles=state.mediaItems.filter(x=>!x.existing).map(x=>x.file);renderMediaManager(state.mediaHostId);return}
      const stockStep=e.target.closest('[data-stock-step]');if(stockStep){const row=stockStep.closest('.variant-row');const input=qs('[data-v="stock"]',row);if(input){const delta=Number(stockStep.dataset.stockStep)||0;input.value=String(Math.max(0,Math.trunc(Number(input.value)||0)+delta));input.dispatchEvent(new Event('input',{bubbles:true}));}return}
      if(e.target.id==='addVariantBtn'){const builder=qs('#variantBuilder');const mode=builder?.dataset.mode||'';if(mode)builder.insertAdjacentHTML('beforeend',variantRow({color:mode==='sized'?'Negro':'',size:'',stock:1,sku:''},mode));return}
      const rv=e.target.closest('.remove-variant');if(rv){rv.closest('.variant-row').remove();return}
      const rn=e.target.closest('[data-remove-new-image]');if(rn){state.newFiles.splice(Number(rn.dataset.removeNewImage),1);qs('#newImages').innerHTML=state.newFiles.map((f,i)=>`<div class="image-preview"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-remove-new-image="${i}">×</button></div>`).join('');return}
      const di=e.target.closest('[data-delete-image]');if(di){if(confirm('¿Eliminar esta foto?')){await api(`/api/admin/images/${di.dataset.deleteImage}`,{method:'DELETE'});di.closest('.image-preview').remove();toast('Foto eliminada','success')}return}
      if(e.target.id==='saveProductBtn'){e.preventDefault();const btn=e.target;try{btn.disabled=true;await saveProduct()}catch(err){toast(err.message,'error')}finally{btn.disabled=false}return}
      if(e.target.id==='newCategoryBtn'){const name=prompt('Nombre de la categoría:');if(name){try{await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name})});state.categories=[];await renderCategories();toast('Categoría creada','success')}catch(err){toast(err.message,'error')}}return}
      const sc=e.target.closest('[data-save-category]');if(sc){const row=sc.closest('[data-category-row]');try{await api(`/api/admin/categories/${sc.dataset.saveCategory}`,{method:'PUT',body:JSON.stringify({name:qs('[data-category-name]',row).value,sort_order:Number(qs('[data-category-sort]',row).value)||0,active:qs('[data-category-active]',row).checked})});state.categories=[];toast('Categoría guardada','success');await renderCategories()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='clearStockFiltersBtn'){state.stockFilters={category:'',stage:'',size:'',color:'',fit:'',audience:'',sort:'product'};await renderStock();return}
      const ss=e.target.closest('[data-save-stock]');if(ss){const row=ss.closest('[data-stock-row]');try{await api(`/api/admin/stock/${ss.dataset.saveStock}`,{method:'PATCH',body:JSON.stringify({stock:Number(qs('[data-stock-value]',row).value)||0,stockKind:qs('[data-stock-kind]',row)?.value||'physical'})});toast('Stock actualizado','success');await renderStock()}catch(err){toast(err.message,'error')}return}
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
            const rr=e.target.closest('[data-report-range]');if(rr){state.reportRange=rr.dataset.reportRange;if(state.view==='dashboard')await renderDashboard();else if(state.view==='expenses')await renderExpenses();else if(state.view==='purchases')await renderPurchases();return}
      if(e.target.id==='applyReportDates'){state.customFrom=qs('#reportFrom')?.value||'';state.customTo=qs('#reportTo')?.value||'';if(state.view==='dashboard')await renderDashboard();else if(state.view==='purchases')await renderPurchases();else await renderExpenses();return}
      const sf=e.target.closest('[data-stock-filter]');if(sf){const wanted=sf.dataset.stockFilter||'';qsa('[data-stock-filter]').forEach(b=>b.classList.toggle('active',b===sf));qsa('[data-stock-product-card]').forEach(card=>card.classList.toggle('hidden',Boolean(wanted)&&card.dataset.stockCategory!==wanted));qs('#dashboardStockGallery')?.scrollTo({left:0,behavior:'smooth'});return}
      const arrow=e.target.closest('[data-scroll-target]');if(arrow){const host=document.getElementById(arrow.dataset.scrollTarget);if(host)host.scrollBy({left:(Number(arrow.dataset.scrollDir)||1)*Math.max(260,host.clientWidth*.78),behavior:'smooth'});return}
      if(e.target.id==='addMovementSaleBtn'){state.movementSaleItems.push({variantId:0,quantity:1,unitPriceCents:0});renderMovementSales();return;}
      const removeSale=e.target.closest('[data-remove-sale]');if(removeSale){state.movementSaleItems.splice(Number(removeSale.dataset.removeSale),1);renderMovementSales();return;}
      if(e.target.id==='newMovementBtn'){setMovementReadOnly(false);qs('#movementExistingAttachments').innerHTML='';await ensureAdminOptionSettings();state.editingMovementId=null;const f=qs('#movementForm');f.reset();f.elements.date.value=today();loadMovementPayment();await loadMovementSale();renderFinanceReasonSelector('');qs('#movementDialogTitle').textContent='Nuevo ingreso / egreso';qs('#movementDialog').showModal();return}
      if(e.target.id==='saveMovementBtn'){e.preventDefault();if(state.movementReadOnly)return;const form=qs('#movementForm'),f=new FormData(form);try{e.target.disabled=true;const payload=movementPayload();const editingId=state.editingMovementId,saved=await api(editingId?`/api/admin/finance/${editingId}`:'/api/admin/finance',{method:editingId?'PUT':'POST',body:JSON.stringify(payload)}),id=saved?.item?.id||editingId,files=[...(form.elements.attachments?.files||[])];state.editingMovementId=id;await rememberFinanceReason(payload.category);if(id&&files.length){const up=new FormData();files.forEach(file=>up.append('files',file));await api(`/api/admin/finance/${id}/attachments`,{method:'POST',body:up});}state.editingMovementId=null;qs('#movementDialog').close();toast(editingId?'Movimiento actualizado':'Movimiento guardado','success');await renderExpenses()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const openMovement=e.target.closest('[data-open-movement],[data-edit-movement]');if(openMovement){try{await openMovementDialog(Number(openMovement.dataset.openMovement||openMovement.dataset.editMovement),Boolean(openMovement.dataset.openMovement))}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='editViewedMovementBtn'){const m=(state.financeMovements||[]).find(x=>Number(x.id)===Number(state.viewingMovementId));if(m){if(m.source_kind==='purchase'){qs('#movementDialog').close();await openSourcePurchase(m.source_id);}else setMovementReadOnly(false);}return;}
      const sourcePurchase=e.target.closest('[data-edit-source-purchase]');if(sourcePurchase){try{await openSourcePurchase(Number(sourcePurchase.dataset.editSourcePurchase))}catch(err){toast(err.message,'error')}return;}
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
    document.addEventListener('pointerdown',e=>{
      const canvas=e.target.closest?.('[data-sheet-canvas]');if(!canvas||state.sheetMeasureBusy||state.designUploadBusy||sheetHasPendingUpload(canvas.dataset.sheetCanvas)||e.button!==0)return;
      if(e.target.closest('[data-sheet-pin]'))return;
      const active=e.target.closest('[data-sheet-move]'),edge=e.target.closest('[data-sheet-resize]');
      if(active){
        const rowIndex=Number(active.dataset.sheetRow),boxIndex=Number(active.dataset.sheetIndex),key=active.dataset.sheetKey;
        const box=state.designSheetDrafts[key]?.[rowIndex]?.previewBoxes?.[boxIndex];if(!box)return;
        e.preventDefault();e.stopPropagation();state.sheetResizeDrag={canvas,element:active,pin:canvas.querySelector(`[data-sheet-pin="${rowIndex}"][data-pin-index="${boxIndex}"]`),key,rowIndex,boxIndex,start:sheetBoxCoordinate(canvas,e),original:{...box},box:{...box},edge:edge?.dataset.sheetResize||'move'};
        canvas.setPointerCapture?.(e.pointerId);return;
      }
      if(state.sheetBoxTarget?.key!==canvas.dataset.sheetCanvas)return;
      e.preventDefault();const point=sheetBoxCoordinate(canvas,e),overlay=document.createElement('div');overlay.className='sheet-box-draft';canvas.appendChild(overlay);
      state.sheetDrawStart={canvas,point,overlay,index:state.sheetBoxTarget.index,key:canvas.dataset.sheetCanvas};canvas.setPointerCapture?.(e.pointerId);
    });
    document.addEventListener('pointermove',e=>{
      const resize=state.sheetResizeDrag;
      if(resize){
        const point=sheetBoxCoordinate(resize.canvas,e),dx=point.x-resize.start.x,dy=point.y-resize.start.y,old=resize.original,edge=resize.edge;
        let x=old.x,y=old.y,right=old.x+old.width,bottom=old.y+old.height;
        if(edge==='move'){x=Math.max(0,Math.min(1-old.width,x+dx));y=Math.max(0,Math.min(1-old.height,y+dy));right=x+old.width;bottom=y+old.height}
        else{if(edge.includes('w'))x=Math.max(0,Math.min(right-.005,x+dx));if(edge.includes('e'))right=Math.min(1,Math.max(x+.005,right+dx));if(edge.includes('n'))y=Math.max(0,Math.min(bottom-.005,y+dy));if(edge.includes('s'))bottom=Math.min(1,Math.max(y+.005,bottom+dy))}
        const box={x,y,width:right-x,height:bottom-y,rotation:old.rotation||0};resize.box=box;
        Object.assign(resize.element.style,{left:x*100+'%',top:y*100+'%',width:box.width*100+'%',height:box.height*100+'%'});
        if(resize.pin)Object.assign(resize.pin.style,{left:(x+box.width/2)*100+'%',top:(y+box.height/2)*100+'%'});
        return;
      }
      const drag=state.sheetDrawStart;if(!drag)return;const point=sheetBoxCoordinate(drag.canvas,e),box={x:Math.min(drag.point.x,point.x),y:Math.min(drag.point.y,point.y),width:Math.abs(drag.point.x-point.x),height:Math.abs(drag.point.y-point.y)};
      Object.assign(drag.overlay.style,{left:box.x*100+'%',top:box.y*100+'%',width:box.width*100+'%',height:box.height*100+'%'});
    });
    document.addEventListener('pointerup',e=>{
      const resize=state.sheetResizeDrag;
      if(resize){state.sheetResizeDrag=null;try{resizeSheetBox(resize.key,resize.rowIndex,resize.boxIndex,resize.box)}catch(err){renderSheetPreview(resize.key);toast(err.message,'error')}return}
      const drag=state.sheetDrawStart;if(!drag)return;state.sheetDrawStart=null;drag.overlay.remove();const point=sheetBoxCoordinate(drag.canvas,e),box={x:Math.min(drag.point.x,point.x),y:Math.min(drag.point.y,point.y),width:Math.abs(drag.point.x-point.x),height:Math.abs(drag.point.y-point.y)};
      if(box.width<.005||box.height<.005){toast('Arrastrá desde una esquina hasta la opuesta para medir el diseño.','error');return;}
      try{applySheetBox(drag.index,box,drag.key)}catch(err){toast(err.message,'error')}
    });
    document.addEventListener('pointercancel',()=>{state.sheetDrawStart?.overlay?.remove();state.sheetDrawStart=null;const resize=state.sheetResizeDrag;state.sheetResizeDrag=null;if(resize)renderSheetPreview(resize.key)});
    document.addEventListener('wheel',e=>{
      const viewport=e.target.closest?.('.sheet-preview-viewport');if(!viewport||!e.ctrlKey)return;
      e.preventDefault();const canvas=qs('[data-sheet-canvas]',viewport),old=state.sheetZoom||1,next=Math.max(1,Math.min(5,Math.round((old*(e.deltaY<0?1.12:1/1.12))*100)/100));if(!canvas||next===old)return;
      const before=canvas.getBoundingClientRect(),x=(e.clientX-before.left)/before.width,y=(e.clientY-before.top)/before.height;
      state.sheetZoom=next;fitSheetPreview(canvas);const after=canvas.getBoundingClientRect();viewport.scrollLeft+=after.left+x*after.width-e.clientX;viewport.scrollTop+=after.top+y*after.height-e.clientY;
      const tools=viewport.previousElementSibling,label=tools?.querySelector('span'),slider=tools?.querySelector('[data-sheet-zoom]');if(label)label.textContent=`Zoom ${Math.round(next*100)}%`;if(slider)slider.value=String(next);
    },{passive:false});
    document.addEventListener('input',e=>{if(e.target.matches('[data-sheet-search]'))filterSheetGallery(e.target.closest('[data-sheet-editor]').dataset.sheetEditor);if(e.target.matches('[data-promo-field],[data-promo-preview],[data-promo-requirement-quantity]')){const row=e.target.closest('[data-promotion-row]');if(row)renderPromotionPreview(row)}if(e.target.matches('#designUploadWidth,#designUploadHeight')){updateDrawnSheetSizes();updateSheetMetrics('upload');state.sheetCompositionConfirmation=null;if(qs('#designSheetCompositionComplete'))qs('#designSheetCompositionComplete').checked=false;}if(e.target.matches('#designUploadCost,[data-design-cost]'))updateSheetMetrics(e.target.closest('#designUploadDialog')?'upload':'detail');if(e.target.matches('[data-design-width],[data-design-height]'))updateSheetMetrics('detail');if(e.target.matches('[data-sheet-zoom]')){state.sheetZoom=Number(e.target.value)||1;const canvas=qs(`[data-sheet-canvas="${e.target.closest('[data-sheet-editor]')?.dataset.sheetEditor||'upload'}"]`);if(canvas)fitSheetPreview(canvas);const label=qs('.sheet-preview-tools span',e.target.closest('[data-sheet-editor]'));if(label)label.textContent=`Zoom ${Math.round(state.sheetZoom*100)}%`;}if(e.target.closest?.('#productForm')&&(e.target.matches('[data-v="color"],[data-v="size"],#productRecipeWaste,#productRecipeExtra,[data-recipe-design-qty],[data-recipe-material-qty],#productForm [name="fit"]')))updateProductCostEstimate();if(e.target.id==='productionWaste'){qs('#productionWasteSheet').value='';qs('#productionWasteSheetHelp').textContent='Porcentaje manual aplicado sobre la superficie de las estampas.';}if(['productionQuantity','productionWaste','mockupCapSalePrice'].includes(e.target.id))calcProductionBuilderCost();if(e.target.id==='productionSalePrice'){state.productionPriceDirty=true;calcProductionBuilderCost();}if(e.target.matches('[data-purchase-color-native]')){const i=Number(e.target.dataset.row),x=state.purchaseItems[i];if(x){x.color=e.target.value;x._custom??={};x._custom.color=true;const text=qs('[data-purchase-field="color"]',e.target.closest('[data-purchase-row]'));if(text)text.value=e.target.value;}}});

    document.addEventListener('dragstart',e=>{const card=e.target.closest?.('[data-design-card]');if(!card)return;if(e.target.closest?.('[data-design-select]')){e.preventDefault();return;}state.designDragId=Number(card.dataset.designCard);card.classList.add('dragging');if(e.dataTransfer){e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(state.designDragId));}});
    document.addEventListener('dragend',e=>{e.target.closest?.('[data-design-card]')?.classList.remove('dragging');state.designDragId=null;});
    document.addEventListener('dragover',e=>{if(state.designDragId&&e.target.closest?.('[data-design-card]'))e.preventDefault();});
    document.addEventListener('drop',async e=>{const card=e.target.closest?.('[data-design-card]');if(!card||!state.designDragId)return;e.preventDefault();const id=state.designDragId;state.designDragId=null;try{await moveDesignCard(id,0,Number(card.dataset.designCard))}catch(err){toast(err.message,'error')}});
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

  function syncAdminTopbarHeight(){const bar=qs('.admin-topbar');if(bar)document.documentElement.style.setProperty('--admin-topbar-height',`${bar.getBoundingClientRect().height}px`);}
  initTheme();bind();navigate('dashboard');syncAdminTopbarHeight();if(window.ResizeObserver)new ResizeObserver(syncAdminTopbarHeight).observe(qs('.admin-topbar'));window.addEventListener('resize',syncAdminTopbarHeight);
})();
