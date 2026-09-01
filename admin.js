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

  const state={view:'dashboard',categories:[],products:[],orders:[],coupons:[],flyers:[],settings:{},editingProduct:null,editingCouponId:null,editingMovementId:null,newFiles:[],mediaItems:[],mediaDragKey:null,reportRange:'month',customFrom:'',customTo:'',stockItems:[],stockFilters:{size:'',color:'',fit:'',audience:'',sort:'product'}};

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

  const titles={dashboard:'Dashboard',products:'Productos',orders:'Pedidos',stock:'Stock',coupons:'Cupones',categories:'Categorías',expenses:'Gastos',flyers:'Flyers',settings:'Configuración'};

  async function navigate(view){state.view=view;qs('#viewTitle').textContent=titles[view]||view;qsa('.admin-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));qs('#adminSidebar').classList.remove('open');const host=qs('#adminContent');host.innerHTML='<div class="empty-state"><strong>Cargando...</strong></div>';try{if(view==='dashboard')await renderDashboard();if(view==='products')await renderProducts();if(view==='orders')await renderOrders();if(view==='stock')await renderStock();if(view==='coupons')await renderCoupons();if(view==='categories')await renderCategories();if(view==='expenses')await renderExpenses();if(view==='flyers')await renderFlyers();if(view==='settings')await renderSettings()}catch(e){renderAccessError(e)}}

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
  function miniStockTable(items=[]){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th>Color</th><th>Talle</th><th>Físico</th><th>Disponible</th></tr></thead><tbody>${items.length?items.map(x=>`<tr><td><strong>${escapeHtml(x.product_name)}</strong></td><td>${escapeHtml(x.color||'—')}</td><td>${escapeHtml(x.size||'Única')}</td><td>${Number(x.stock)||0}</td><td>${Number(x.available_stock)||0}</td></tr>`).join(''):'<tr><td colspan="5">Sin stock físico para mostrar.</td></tr>'}</tbody></table></div>`}
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
        <div class="kpi expense-kpi"><small>Gastos</small><strong>− ${money(k.expensesCents)}</strong><em>Egresos cargados</em></div>
        <div class="kpi ${Number(k.balanceCents)<0?'negative-kpi':''}"><small>Balance</small><strong>${money(k.balanceCents)}</strong><em>Ingresos − egresos${Number(k.extraIncomeCents)?` · incluye ${money(k.extraIncomeCents)} de otros ingresos`:''}</em></div>
      </div>
      <div class="dashboard-quick-grid">
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Pedidos recientes</h2><button class="btn btn-ghost" data-go="orders">Abrir</button></div>${ordersTable(d.recentOrders||[])}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Stock físico</h2><button class="btn btn-ghost" data-go="stock">Abrir</button></div>${miniStockTable(d.stock||[])}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Cupones</h2><button class="btn btn-ghost" data-go="coupons">Abrir</button></div>${miniCouponsTable(d.coupons||[])}</section>
        <section class="admin-section quick-admin-block"><div class="admin-section-head"><h2>Categorías</h2><button class="btn btn-ghost" data-go="categories">Abrir</button></div>${miniCategoriesTable(d.categories||[])}</section>
      </div>`;
  }

  async function renderProducts(){
    await ensureCategories();
    const d=await api('/api/admin/products');state.products=d.items||[];
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div class="admin-toolbar"><input class="input" id="adminProductSearch" placeholder="Buscar producto..."></div><button class="btn btn-primary" id="newProductBtn">+ Nuevo producto</button></div>
      <div id="adminProductsTable">${productsTable(state.products)}</div>`;
  }
  function productsTable(items){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Stock</th><th>Estado</th><th></th></tr></thead><tbody>${items.length?items.map(p=>`<tr><td><div style="display:flex;align-items:center;gap:10px">${p.primary_image_url?`<img class="mini-image" src="${escapeHtml(p.primary_image_url)}" alt="">`:'<div class="mini-image product-placeholder">S</div>'}<strong>${escapeHtml(p.name)}</strong></div></td><td>${escapeHtml(p.category_name||'')}</td><td>${money(p.price_cents)}</td><td>${p.available_stock}</td><td><span class="status ${p.status==='published'?'success':'warning'}">${p.status==='published'?'Publicado':p.status==='draft'?'Borrador':'Oculto'}</span></td><td><div class="admin-actions"><button class="btn btn-ghost" data-edit-product="${p.id}">Editar</button><button class="btn btn-ghost" data-duplicate-product="${p.id}">Duplicar</button></div></td></tr>`).join(''):`<tr><td colspan="6"><div class="empty-state"><strong>Todavía no hay productos.</strong>Creá el primero desde este panel.</div></td></tr>`}</tbody></table></div>`}

  async function openProductDialog(id=null, duplicate=false){
    await ensureCategories();
    ensureMediaAdminStyles();
    state.newFiles=[];state.mediaItems=[];state.mediaDragKey=null;
    if(id){
      const d=await api(`/api/admin/products/${id}`);
      state.editingProduct=duplicate?{...d.item,id:null,name:`${d.item.name} copia`,slug:'',variants:(d.item.variants||[]).map(v=>({...v,id:null})),images:[]}:d.item;
    }else state.editingProduct=null;
    const p=state.editingProduct||{status:'draft',price_cents:0,compare_at_cents:0,cost_cents:0,weight_grams:400,height_cm:5,width_cm:25,depth_cm:30,is_featured:0,is_new:0,is_bestseller:0,fit:'',audience:'',variants:[{color:'Negro',size:'S',stock:0,sku:''},{color:'Negro',size:'M',stock:0,sku:''},{color:'Negro',size:'L',stock:0,sku:''},{color:'Negro',size:'XL',stock:0,sku:''},{color:'Negro',size:'XXL',stock:0,sku:''}],images:[]};
    state.mediaItems=(p.images||[]).map(im=>({key:`existing-${im.id}`,id:Number(im.id),existing:true,url:im.url,name:(im.r2_key||'').split('/').pop()||`Archivo ${im.id}`,mediaType:im.media_type||mediaTypeFromName(im.r2_key||im.url)}));
    qs('#productDialogTitle').textContent=p.id?'Editar producto':'Nuevo producto';
    const saveBtn=qs('#saveProductBtn');if(saveBtn)saveBtn.disabled=false;
    qs('#productFormBody').innerHTML=`
      <section class="form-section"><h3>Fotos y videos</h3><p class="salmos-media-help">Cargalos primero y acomodalos en el orden exacto en que querés que se vean. Podés arrastrar cada archivo o usar ↑ y ↓. Las fotos se muestran completas, sin recortes. Videos cortos: MP4/WebM/MOV, hasta 30 MB.</p><input class="input" id="productImagesInput" type="file" accept="image/*,video/mp4,video/webm,video/quicktime,video/x-m4v" multiple><div class="salmos-media-list" id="mediaOrderList"></div></section>
      <section class="form-section"><h3>Información</h3><div class="form-grid">
        <div class="field full"><label>Nombre</label><input class="input" name="name" required value="${escapeHtml(p.name||'')}"></div>
        <div class="field"><label>Categoría</label><select class="select" name="category_id" required><option value="">Elegir...</option>${state.categories.map(c=>`<option value="${c.id}" ${Number(p.category_id)===Number(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Estado</label><select class="select" name="status"><option value="draft" ${p.status==='draft'?'selected':''}>Borrador</option><option value="published" ${p.status==='published'?'selected':''}>Publicado</option><option value="hidden" ${p.status==='hidden'?'selected':''}>Oculto</option></select></div>
        <div class="field"><label>Corte / fit</label><input class="input" name="fit" list="salmosFitOptions" placeholder="Elegí o escribí otro" value="${escapeHtml(p.fit||'')}"><datalist id="salmosFitOptions"><option value="Clásico"><option value="Oversize"><option value="Boxy fit"></datalist></div>
        <div class="field"><label>Hombre / Mujer / Unisex</label><input class="input" name="audience" list="salmosAudienceOptions" placeholder="Elegí o escribí otro" value="${escapeHtml(p.audience||'')}"><datalist id="salmosAudienceOptions"><option value="Hombre"><option value="Mujer"><option value="Unisex"></datalist></div>
        <div class="field"><label>Precio</label><input class="input" name="price" type="number" min="0" value="${centsToPesos(p.price_cents)}"></div>
        <div class="field"><label>Precio anterior</label><input class="input" name="compare" type="number" min="0" value="${centsToPesos(p.compare_at_cents)}"></div>
        <div class="field"><label>Costo del producto</label><input class="input" name="cost" type="number" min="0" value="${centsToPesos(p.cost_cents)}"></div>
        <div class="field full"><label>Descripción corta</label><textarea class="textarea" name="short_description">${escapeHtml(p.short_description||'')}</textarea></div>
        <div class="field full"><label>Significado del diseño</label><textarea class="textarea" name="meaning_text">${escapeHtml(p.meaning_text||'')}</textarea></div>
        <div class="field full"><label>Versículo (opcional)</label><textarea class="textarea" name="verse_text" style="min-height:82px">${escapeHtml(p.verse_text||'')}</textarea></div>
        <div class="field full"><label>Cita / referencia del versículo</label><input class="input" name="verse_reference" placeholder="Ej.: Marcos 14:36" value="${escapeHtml(p.verse_reference||'')}"></div>
      </div><div class="toggle-row" style="margin-top:14px"><label class="toggle-label"><input type="checkbox" name="is_new" ${p.is_new?'checked':''}> Novedad</label><label class="toggle-label"><input type="checkbox" name="is_featured" ${p.is_featured?'checked':''}> Destacado</label><label class="toggle-label"><input type="checkbox" name="is_bestseller" ${p.is_bestseller?'checked':''}> Más vendido</label></div></section>
      <section class="form-section"><div class="admin-section-head"><h3>Variantes y stock</h3><button type="button" class="btn btn-ghost" id="addVariantBtn">+ Variante</button></div><div class="variant-builder" id="variantBuilder">${(p.variants||[]).map(variantRow).join('')}</div></section>
      <section class="form-section"><h3>Datos para envío</h3><div class="form-grid"><div class="field"><label>Peso (g)</label><input class="input" name="weight_grams" type="number" min="0" value="${p.weight_grams||0}"></div><div class="field"><label>Alto (cm)</label><input class="input" name="height_cm" type="number" min="0" step=".1" value="${p.height_cm||0}"></div><div class="field"><label>Ancho (cm)</label><input class="input" name="width_cm" type="number" min="0" step=".1" value="${p.width_cm||0}"></div><div class="field"><label>Largo (cm)</label><input class="input" name="depth_cm" type="number" min="0" step=".1" value="${p.depth_cm||0}"></div></div></section>`;
    renderMediaManager();
    qs('#productDialog').showModal();
  }
  function variantRow(v={id:null,color:'',size:'',stock:0,sku:''}){return `<div class="variant-row"><input type="hidden" data-v="id" value="${v.id||''}"><input class="input" data-v="color" placeholder="Color" value="${escapeHtml(v.color||'')}"><input class="input" data-v="size" placeholder="Talle / opción" value="${escapeHtml(v.size||'')}"><input class="input" data-v="stock" type="number" min="0" placeholder="Stock" value="${Number(v.stock)||0}"><button type="button" class="btn btn-danger remove-variant">×</button><input type="hidden" data-v="sku" value="${escapeHtml(v.sku||'')}"></div>`}

  async function saveProduct(){
    const form=qs('#productForm');const fd=new FormData(form);const variants=qsa('.variant-row',qs('#variantBuilder')).map(r=>({id:Number(qs('[data-v="id"]',r)?.value)||null,color:qs('[data-v="color"]',r).value.trim(),size:qs('[data-v="size"]',r).value.trim(),stock:Number(qs('[data-v="stock"]',r).value)||0,sku:qs('[data-v="sku"]',r).value.trim()})).filter(v=>v.color||v.size);
    if(!fd.get('name')?.trim()||!fd.get('category_id')) throw new Error('Completá nombre y categoría.');
    const payload={name:fd.get('name').trim(),category_id:Number(fd.get('category_id')),status:fd.get('status'),price_cents:pesosToCents(fd.get('price')),compare_at_cents:pesosToCents(fd.get('compare')),cost_cents:pesosToCents(fd.get('cost')),short_description:fd.get('short_description')||'',meaning_text:fd.get('meaning_text')||'',verse_text:fd.get('verse_text')||'',verse_reference:fd.get('verse_reference')||'',fit:fd.get('fit')||'',audience:fd.get('audience')||'',is_new:fd.get('is_new')?1:0,is_featured:fd.get('is_featured')?1:0,is_bestseller:fd.get('is_bestseller')?1:0,weight_grams:Number(fd.get('weight_grams'))||0,height_cm:Number(fd.get('height_cm'))||0,width_cm:Number(fd.get('width_cm'))||0,depth_cm:Number(fd.get('depth_cm'))||0,variants};
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
    const f=state.stockFilters||{};let items=state.stockItems.filter(x=>(!f.size||String(x.size||'')===f.size)&&(!f.color||String(x.color||'')===f.color)&&(!f.fit||String(x.fit||'')===f.fit)&&(!f.audience||String(x.audience||'')===f.audience));
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
  function stockRowsHtml(items){return items.length?items.map(x=>`<tr data-stock-row="${x.id}"><td><strong>${escapeHtml(x.product_name)}</strong></td><td>${escapeHtml(x.color||'—')}</td><td>${escapeHtml(x.size||'Única')}</td><td>${escapeHtml(x.fit||'—')}</td><td>${escapeHtml(x.audience||'—')}</td><td><input class="input small-number" data-stock-value type="number" min="0" value="${Number(x.stock)||0}"></td><td><span class="status ${Number(x.available_stock)<=0?'warning':'success'}">${Number(x.available_stock)||0}</span></td><td><button class="btn btn-ghost" data-save-stock="${x.id}">Guardar</button></td></tr>`).join(''):'<tr><td colspan="8">No hay stock que coincida con esos filtros.</td></tr>'}
  function renderStockFiltered(){const body=qs('#stockTableBody');if(body)body.innerHTML=stockRowsHtml(stockFilteredItems());const count=qs('#stockFilteredCount');if(count)count.textContent=`${stockFilteredItems().length} variante${stockFilteredItems().length===1?'':'s'}`}
  async function renderStock(){
    const d=await api('/api/admin/stock');state.stockItems=(d.items||[]).filter(x=>Number(x.stock)>0);
    const sizeTotals={};for(const x of state.stockItems){const size=String(x.size||'Única').trim()||'Única';sizeTotals[size]=(sizeTotals[size]||0)+(Number(x.stock)||0)}
    const total=Object.values(sizeTotals).reduce((a,b)=>a+b,0);
    const sizes=Object.keys(sizeTotals).sort((a,b)=>stockSizeRank(a)-stockSizeRank(b)||a.localeCompare(b,'es',{numeric:true}));
    const f=state.stockFilters;
    const options=(values,current)=>`<option value="">Todos</option>${values.map(v=>`<option value="${escapeHtml(v)}" ${current===v?'selected':''}>${escapeHtml(v)}</option>`).join('')}`;
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div><h2 style="margin:0">Stock físico</h2><p class="muted" style="margin:4px 0 0">Las variantes con stock físico 0 no se muestran. Podés corregir el stock directamente acá.</p></div></div>
      <div class="stock-size-summary" aria-label="Recuento por talle"><div class="stock-count-chip total"><span>Total</span><strong>${total}</strong></div>${sizes.map(size=>`<div class="stock-count-chip"><span>${escapeHtml(size)}</span><strong>${sizeTotals[size]}</strong></div>`).join('')}</div>
      <div class="admin-card stock-filter-card"><div class="stock-filter-grid">
        <label>Talle<select class="select" id="stockFilterSize">${options(stockUnique('size'),f.size)}</select></label>
        <label>Color<select class="select" id="stockFilterColor">${options(stockUnique('color'),f.color)}</select></label>
        <label>Corte<select class="select" id="stockFilterFit">${options(stockUnique('fit'),f.fit)}</select></label>
        <label>Género<select class="select" id="stockFilterAudience">${options(stockUnique('audience'),f.audience)}</select></label>
        <label>Ordenar<select class="select" id="stockSort"><option value="product" ${f.sort==='product'?'selected':''}>Producto</option><option value="size" ${f.sort==='size'?'selected':''}>Talle</option><option value="color" ${f.sort==='color'?'selected':''}>Color</option><option value="fit" ${f.sort==='fit'?'selected':''}>Corte</option><option value="audience" ${f.sort==='audience'?'selected':''}>Género</option><option value="stock_desc" ${f.sort==='stock_desc'?'selected':''}>Mayor stock</option><option value="stock_asc" ${f.sort==='stock_asc'?'selected':''}>Menor stock</option></select></label>
      </div><div class="stock-filter-footer"><span class="muted" id="stockFilteredCount"></span><button class="btn btn-ghost" id="clearStockFiltersBtn" type="button">Limpiar filtros</button></div></div>
      <div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th>Color</th><th>Talle</th><th>Corte</th><th>Género</th><th>Stock físico</th><th>Disponible</th><th></th></tr></thead><tbody id="stockTableBody"></tbody></table></div>`;
    renderStockFiltered();
  }

  function ordersTable(items){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th></tr></thead><tbody>${items.length?items.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td><span class="status">${escapeHtml(o.fulfillment_status)}</span></td><td>${new Date(o.created_at).toLocaleString('es-AR')}</td></tr>`).join(''):`<tr><td colspan="6">Sin pedidos.</td></tr>`}</tbody></table></div>`}

  async function renderOrders(){
    const d=await api('/api/admin/orders');state.orders=d.items||[];
    qs('#adminContent').innerHTML=`<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th><th>Estado</th><th></th></tr></thead><tbody>${state.orders.length?state.orders.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name||'')}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td>${escapeHtml(o.shipping_method||'')}</td><td>${new Date(o.created_at).toLocaleString('es-AR')}</td><td><select class="select order-status-select" data-order-id="${o.id}" style="min-width:145px"><option value="new" ${o.fulfillment_status==='new'?'selected':''}>Nuevo</option><option value="preparing" ${o.fulfillment_status==='preparing'?'selected':''}>Preparando</option><option value="ready" ${o.fulfillment_status==='ready'?'selected':''}>Listo</option><option value="on_the_way" ${o.fulfillment_status==='on_the_way'?'selected':''}>En camino</option><option value="delivered" ${o.fulfillment_status==='delivered'?'selected':''}>Entregado</option><option value="cancelled" ${o.fulfillment_status==='cancelled'?'selected':''}>Cancelado</option></select></td><td>${o.fulfillment_status==='cancelled'&&o.payment_status!=='paid'?`<button class="btn btn-danger" data-delete-order="${o.id}">Borrar prueba</button>`:'—'}</td></tr>`).join(''):'<tr><td colspan="8">Sin pedidos.</td></tr>'}</tbody></table></div><div class="admin-section"><div class="notice">Los pedidos cancelados de prueba que no estén pagados se pueden borrar. Un pedido pagado no se elimina desde acá.</div></div>`;
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

  async function renderExpenses(){
    const r=reportRangeDates();const d=await api(`/api/admin/finance?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const s=d.summary||{};
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head expenses-head"><div>${reportFiltersHtml()}</div><button class="btn btn-primary" id="newMovementBtn">+ Gasto / ingreso</button></div>
      <div class="kpi-grid"><div class="kpi"><small>Gastos</small><strong>− ${money(s.expensesCents)}</strong></div><div class="kpi"><small>Otros ingresos</small><strong>${money(s.extraIncomeCents)}</strong></div><div class="kpi"><small>Ventas</small><strong>${money(s.productSalesCents)}</strong></div><div class="kpi"><small>Balance</small><strong>${money(s.balanceCents)}</strong></div></div>
      <section class="admin-section"><div class="admin-section-head"><h2>Movimientos cargados</h2></div><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Origen</th><th>Destino</th><th>Importe</th><th>Adjuntos</th><th></th></tr></thead><tbody>${(d.movements||[]).length?(d.movements||[]).map(m=>`<tr><td>${new Date(m.occurred_at).toLocaleDateString('es-AR')}</td><td><span class="status ${m.type==='income'?'success':'warning'}">${m.type==='income'?'Ingreso':'Gasto'}</span></td><td>${escapeHtml(m.description||'')}</td><td>${escapeHtml(m.origin||'—')}</td><td>${escapeHtml(m.destination||'—')}</td><td class="${m.type==='expense'?'money-negative':''}">${m.type==='expense'?'− ':''}${money(m.amount_cents)}</td><td><div class="finance-attachments">${(m.attachments||[]).map(a=>`<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(a.url)}" alt="Comprobante"></a>`).join('')||'—'}</div></td><td><div class="admin-actions"><button class="btn btn-ghost" data-edit-movement="${m.id}">Editar</button><button class="btn btn-danger" data-delete-movement="${m.id}">Eliminar</button></div></td></tr>`).join(''):'<tr><td colspan="8">Todavía no cargaste movimientos.</td></tr>'}</tbody></table></div></section>`;
  }

  async function renderFlyers(){
    const d=await api('/api/admin/flyers');state.flyers=d.items||[];
    const cards=state.flyers.map(f=>{const mime=String(f.mime_type||'');const media=mime.startsWith('image/')?`<img src="${escapeHtml(f.url)}" alt="">`:mime.startsWith('video/')?`<video src="${escapeHtml(f.url)}" muted playsinline controls></video>`:`<div class="flyer-file-icon">PDF</div>`;return `<article class="admin-flyer-card" data-flyer-row="${f.id}"><div class="admin-flyer-preview">${media}</div><div class="field"><label>Título</label><input class="input" data-flyer-title value="${escapeHtml(f.title||'')}"></div><div class="flyer-admin-line"><label class="toggle-label"><input type="checkbox" data-flyer-public ${Number(f.public)?'checked':''}> Público</label><label>Orden <input class="input small-number" type="number" data-flyer-sort value="${Number(f.sort_order)||0}"></label></div><div class="admin-actions"><button class="btn btn-ghost" data-save-flyer="${f.id}">Guardar</button><button class="btn btn-danger" data-delete-flyer="${f.id}">Eliminar</button></div></article>`}).join('');
    qs('#adminContent').innerHTML=`<section class="settings-card"><h3>Subir flyers</h3><p class="muted">Podés subir imágenes, videos cortos o PDF. Si marcás Público, aparece en la galería de la tienda; si no, solo lo ves acá.</p><form id="flyerUploadForm" class="form-grid"><div class="field"><label>Título (opcional)</label><input class="input" name="title"></div><div class="field"><label class="toggle-label"><input type="checkbox" name="public"> Publicar ahora</label></div><div class="field full"><label>Archivos</label><input class="input" name="files" type="file" accept="image/*,video/*,application/pdf" multiple required></div><div class="field full"><button type="button" class="btn btn-primary" id="uploadFlyersBtn">Subir archivos</button></div></form></section><section class="admin-section"><div class="admin-section-head"><h2>Galería administrada</h2></div><div class="admin-flyer-grid">${cards||'<div class="empty-state"><strong>Sin flyers todavía.</strong></div>'}</div></section>`;
  }

  async function renderSettings(){
    const d=await api('/api/admin/settings');state.settings=d.settings||{};
    const s=state.settings;
    qs('#adminContent').innerHTML=`<form id="settingsForm">
      <div class="settings-grid">
        <section class="settings-card"><h3>Datos de SALMOS</h3><div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${escapeHtml(s.whatsapp||'5491162691341')}"></div><div class="field" style="margin-top:10px"><label>Instagram</label><input class="input" name="instagram" value="${escapeHtml(s.instagram||'')}"></div><div class="field" style="margin-top:10px"><label>Facebook</label><input class="input" name="facebook" value="${escapeHtml(s.facebook||'')}"></div></section>
        <section class="settings-card"><h3>Motomensajería</h3><div class="field"><label>Precio por km</label><input class="input" type="number" name="moto_rate_per_km" value="${escapeHtml(s.moto_rate_per_km||'800')}"></div><div class="field" style="margin-top:10px"><label>Envío mínimo</label><input class="input" type="number" name="moto_min_charge" value="${escapeHtml(s.moto_min_charge||'2000')}"><small class="field-help">Aunque la distancia dé menos, nunca se cobrará menos de este importe.</small></div><div class="field" style="margin-top:10px"><label>Máximo de km</label><input class="input" type="number" name="moto_max_km" value="${escapeHtml(s.moto_max_km||'50')}"></div><div class="field" style="margin-top:10px"><label>Demora mínima / máxima (horas)</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="input" type="number" name="moto_min_hours" value="${escapeHtml(s.moto_min_hours||'1')}"><input class="input" type="number" name="moto_max_hours" value="${escapeHtml(s.moto_max_hours||'4')}"></div></div></section>
        <section class="settings-card"><h3>Retiro</h3><label class="toggle-label"><input type="checkbox" name="pickup_enabled" ${s.pickup_enabled==='true'?'checked':''}> Habilitar retiro</label><div class="field" style="margin-top:10px"><label>Dirección</label><input class="input" name="pickup_address" value="${escapeHtml(s.pickup_address||'')}"></div><div class="field" style="margin-top:10px"><label>Instrucciones / horarios</label><textarea class="textarea" name="pickup_instructions">${escapeHtml(s.pickup_instructions||'')}</textarea></div></section>
        <section class="settings-card"><h3>Integraciones</h3><div class="notice">Mercado Pago y Correo Argentino se activan automáticamente cuando carguemos sus credenciales en Cloudflare. No hace falta tocar el código.</div></section>
      </div><div style="margin-top:16px;text-align:right"><button class="btn btn-primary" id="saveSettingsBtn">Guardar configuración</button></div>
    </form>`;
  }

  async function saveSettings(){const f=new FormData(qs('#settingsForm'));const settings={};for(const [k,v] of f.entries())settings[k]=String(v);settings.pickup_enabled=f.get('pickup_enabled')?'true':'false';await api('/api/admin/settings',{method:'PUT',body:JSON.stringify({settings})});toast('Configuración guardada','success');}

  function bind(){
    qsa('.admin-nav-btn').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.view)));
    qs('#adminMenuBtn').addEventListener('click',()=>qs('#adminSidebar').classList.toggle('open'));
    qs('#adminThemeBtn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light'));
    const productDialog=qs('#productDialog');
    const productCancelBtn=qs('#productDialog button[value="cancel"]');
    if(productCancelBtn){productCancelBtn.type='button';productCancelBtn.setAttribute('formnovalidate','');productCancelBtn.addEventListener('click',e=>{e.preventDefault();closeProductDialog();});}
    productDialog?.addEventListener('cancel',e=>{e.preventDefault();closeProductDialog();});
    productDialog?.addEventListener('close',resetProductDialogState);
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
      if(e.target.matches('.order-status-select')){try{await api(`/api/admin/orders/${e.target.dataset.orderId}/status`,{method:'PATCH',body:JSON.stringify({fulfillment_status:e.target.value})});toast('Estado actualizado','success')}catch(err){toast(err.message,'error')}}
    });
    document.addEventListener('click',async e=>{
      const go=e.target.closest('[data-go]');if(go){navigate(go.dataset.go);return}
      if(e.target.id==='newProductBtn'){await openProductDialog();return}
      const edit=e.target.closest('[data-edit-product]');if(edit){await openProductDialog(Number(edit.dataset.editProduct));return}
      const dup=e.target.closest('[data-duplicate-product]');if(dup){await openProductDialog(Number(dup.dataset.duplicateProduct),true);return}
      const move=e.target.closest('[data-move-media]');if(move){moveMedia(move.dataset.mediaKey,Number(move.dataset.moveMedia));return}
      const rm=e.target.closest('[data-remove-media]');if(rm){const key=rm.dataset.removeMedia;const item=state.mediaItems.find(x=>x.key===key);if(!item)return;if(item.existing&&item.id){if(!confirm('¿Eliminar este archivo del producto?'))return;await api(`/api/admin/media/${item.id}`,{method:'DELETE'});}else if(item.url?.startsWith('blob:')){URL.revokeObjectURL(item.url);}state.mediaItems=state.mediaItems.filter(x=>x.key!==key);state.newFiles=state.mediaItems.filter(x=>!x.existing).map(x=>x.file);renderMediaManager();return}
      if(e.target.id==='addVariantBtn'){qs('#variantBuilder').insertAdjacentHTML('beforeend',variantRow());return}
      const rv=e.target.closest('.remove-variant');if(rv){rv.closest('.variant-row').remove();return}
      const rn=e.target.closest('[data-remove-new-image]');if(rn){state.newFiles.splice(Number(rn.dataset.removeNewImage),1);qs('#newImages').innerHTML=state.newFiles.map((f,i)=>`<div class="image-preview"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-remove-new-image="${i}">×</button></div>`).join('');return}
      const di=e.target.closest('[data-delete-image]');if(di){if(confirm('¿Eliminar esta foto?')){await api(`/api/admin/images/${di.dataset.deleteImage}`,{method:'DELETE'});di.closest('.image-preview').remove();toast('Foto eliminada','success')}return}
      if(e.target.id==='saveProductBtn'){e.preventDefault();const btn=e.target;try{btn.disabled=true;await saveProduct()}catch(err){toast(err.message,'error')}finally{btn.disabled=false}return}
      if(e.target.id==='newCategoryBtn'){const name=prompt('Nombre de la categoría:');if(name){try{await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name})});state.categories=[];await renderCategories();toast('Categoría creada','success')}catch(err){toast(err.message,'error')}}return}
      const sc=e.target.closest('[data-save-category]');if(sc){const row=sc.closest('[data-category-row]');try{await api(`/api/admin/categories/${sc.dataset.saveCategory}`,{method:'PUT',body:JSON.stringify({name:qs('[data-category-name]',row).value,sort_order:Number(qs('[data-category-sort]',row).value)||0,active:qs('[data-category-active]',row).checked})});state.categories=[];toast('Categoría guardada','success');await renderCategories()}catch(err){toast(err.message,'error')}return}
      if(e.target.id==='clearStockFiltersBtn'){state.stockFilters={size:'',color:'',fit:'',audience:'',sort:'product'};await renderStock();return}
      const ss=e.target.closest('[data-save-stock]');if(ss){const row=ss.closest('[data-stock-row]');try{await api(`/api/admin/stock/${ss.dataset.saveStock}`,{method:'PATCH',body:JSON.stringify({stock:Number(qs('[data-stock-value]',row).value)||0})});toast('Stock actualizado','success');await renderStock()}catch(err){toast(err.message,'error')}return}
      const delOrder=e.target.closest('[data-delete-order]');if(delOrder){if(confirm('¿Borrar este pedido cancelado de prueba? Esta acción no se puede deshacer.')){try{await api(`/api/admin/orders/${delOrder.dataset.deleteOrder}`,{method:'DELETE'});toast('Pedido de prueba eliminado','success');await renderOrders()}catch(err){toast(err.message,'error')}}return}
      if(e.target.id==='uploadFlyersBtn'){const form=qs('#flyerUploadForm');const fd=new FormData(form);const files=[...(form.elements.files?.files||[])];if(!files.length){toast('Elegí al menos un archivo.','error');return}const up=new FormData();up.append('title',fd.get('title')||'');up.append('public',fd.get('public')?'1':'0');files.forEach(file=>up.append('files',file));try{e.target.disabled=true;await api('/api/admin/flyers',{method:'POST',body:up});toast('Flyer/s subido/s','success');await renderFlyers()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const sf=e.target.closest('[data-save-flyer]');if(sf){const row=sf.closest('[data-flyer-row]');try{await api(`/api/admin/flyers/${sf.dataset.saveFlyer}`,{method:'PUT',body:JSON.stringify({title:qs('[data-flyer-title]',row).value,public:qs('[data-flyer-public]',row).checked,sort_order:Number(qs('[data-flyer-sort]',row).value)||0})});toast('Flyer actualizado','success');await renderFlyers()}catch(err){toast(err.message,'error')}return}
      const df=e.target.closest('[data-delete-flyer]');if(df){if(confirm('¿Eliminar este flyer?')){try{await api(`/api/admin/flyers/${df.dataset.deleteFlyer}`,{method:'DELETE'});toast('Flyer eliminado','success');await renderFlyers()}catch(err){toast(err.message,'error')}}return}
      const ec=e.target.closest('[data-edit-coupon]');if(ec){state.editingCouponId=Number(ec.dataset.editCoupon);const c=state.coupons.find(x=>Number(x.id)===state.editingCouponId);renderCouponEditor(c||null);qs('#couponForm')?.scrollIntoView({behavior:'smooth',block:'start'});return}
      const dc=e.target.closest('[data-delete-coupon]');if(dc){if(confirm('¿Eliminar este cupón?')){await api(`/api/admin/coupons/${dc.dataset.deleteCoupon}`,{method:'DELETE'});if(Number(state.editingCouponId)===Number(dc.dataset.deleteCoupon))state.editingCouponId=null;toast('Cupón eliminado','success');await renderCoupons()}return}
      if(e.target.id==='saveCouponBtn'){try{e.target.disabled=true;await saveCouponFromForm()}catch(err){toast(err.message,'error');e.target.disabled=false}return}
      if(e.target.id==='cancelCouponEditBtn'){state.editingCouponId=null;renderCouponEditor(null);return}
            const rr=e.target.closest('[data-report-range]');if(rr){state.reportRange=rr.dataset.reportRange;if(state.view==='dashboard')await renderDashboard();else if(state.view==='expenses')await renderExpenses();return}
      if(e.target.id==='applyReportDates'){state.customFrom=qs('#reportFrom')?.value||'';state.customTo=qs('#reportTo')?.value||'';if(state.view==='dashboard')await renderDashboard();else await renderExpenses();return}
      if(e.target.id==='newMovementBtn'){state.editingMovementId=null;const f=qs('#movementForm');f.reset();f.elements.date.value=today();qs('#movementDialogTitle').textContent='Nuevo gasto / ingreso';qs('#movementDialog').showModal();return}
      if(e.target.id==='saveMovementBtn'){e.preventDefault();const form=qs('#movementForm');const f=new FormData(form);try{e.target.disabled=true;const payload={type:f.get('type'),description:f.get('description'),origin:f.get('origin'),destination:f.get('destination'),amount_cents:pesosToCents(f.get('amount')),occurred_at:new Date(`${f.get('date')}T12:00:00-03:00`).toISOString()};const editingId=state.editingMovementId;const saved=await api(editingId?`/api/admin/finance/${editingId}`:'/api/admin/finance',{method:editingId?'PUT':'POST',body:JSON.stringify(payload)});const id=saved?.item?.id||editingId;const files=[...(form.elements.attachments?.files||[])];if(id&&files.length){const up=new FormData();files.forEach(file=>up.append('files',file));await api(`/api/admin/finance/${id}/attachments`,{method:'POST',body:up});}state.editingMovementId=null;qs('#movementDialog').close();toast(editingId?'Movimiento actualizado':'Movimiento guardado','success');await renderExpenses()}catch(err){toast(err.message,'error')}finally{e.target.disabled=false}return}
      const em=e.target.closest('[data-edit-movement]');if(em){const r=reportRangeDates();const d=await api(`/api/admin/finance?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const m=(d.movements||[]).find(x=>Number(x.id)===Number(em.dataset.editMovement));if(m){state.editingMovementId=Number(m.id);const form=qs('#movementForm');form.reset();form.elements.type.value=m.type;form.elements.description.value=m.description||'';form.elements.origin.value=m.origin||'';form.elements.destination.value=m.destination||'';form.elements.amount.value=centsToPesos(m.amount_cents);form.elements.date.value=String(m.occurred_at||'').slice(0,10);qs('#movementDialogTitle').textContent='Editar gasto / ingreso';qs('#movementDialog').showModal();}return}
      const dm=e.target.closest('[data-delete-movement]');if(dm){if(confirm('¿Eliminar este movimiento y sus adjuntos?')){await api(`/api/admin/finance/${dm.dataset.deleteMovement}`,{method:'DELETE'});await renderExpenses()}return}
      if(e.target.id==='saveSettingsBtn'){e.preventDefault();try{await saveSettings()}catch(err){toast(err.message,'error')}return}
    });
    document.addEventListener('dragstart',e=>{const row=e.target.closest?.('[data-media-key]');if(!row)return;state.mediaDragKey=row.dataset.mediaKey;row.classList.add('dragging');if(e.dataTransfer)e.dataTransfer.effectAllowed='move'});
    document.addEventListener('dragend',e=>{e.target.closest?.('[data-media-key]')?.classList.remove('dragging');state.mediaDragKey=null});
    document.addEventListener('dragover',e=>{if(e.target.closest?.('[data-media-key]'))e.preventDefault()});
    document.addEventListener('drop',e=>{const target=e.target.closest?.('[data-media-key]');if(!target||!state.mediaDragKey)return;e.preventDefault();const from=state.mediaItems.findIndex(x=>x.key===state.mediaDragKey),to=state.mediaItems.findIndex(x=>x.key===target.dataset.mediaKey);if(from<0||to<0||from===to)return;const [item]=state.mediaItems.splice(from,1);state.mediaItems.splice(to,0,item);renderMediaManager()});
    qs('#adminContent').addEventListener('input',e=>{if(e.target.id==='adminProductSearch'){const q=e.target.value.toLowerCase();const items=state.products.filter(p=>p.name.toLowerCase().includes(q)||String(p.category_name||'').toLowerCase().includes(q));qs('#adminProductsTable').innerHTML=productsTable(items)}});
    qs('#adminContent').addEventListener('change',e=>{
      const map={stockFilterSize:'size',stockFilterColor:'color',stockFilterFit:'fit',stockFilterAudience:'audience',stockSort:'sort'};
      const key=map[e.target.id];if(!key)return;state.stockFilters[key]=e.target.value;renderStockFiltered();
    });
  }

  initTheme();bind();navigate('dashboard');
})();