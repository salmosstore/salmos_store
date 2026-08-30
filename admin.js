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

  const state={view:'dashboard',categories:[],products:[],orders:[],settings:{},editingProduct:null,newFiles:[],financeRange:'month'};

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

  const titles={dashboard:'Dashboard',products:'Productos',categories:'Categorías',stock:'Stock',orders:'Pedidos',finance:'Finanzas',settings:'Configuración'};

  async function navigate(view){state.view=view;qs('#viewTitle').textContent=titles[view]||view;qsa('.admin-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));qs('#adminSidebar').classList.remove('open');const host=qs('#adminContent');host.innerHTML='<div class="empty-state"><strong>Cargando...</strong></div>';try{if(view==='dashboard')await renderDashboard();if(view==='products')await renderProducts();if(view==='categories')await renderCategories();if(view==='stock')await renderStock();if(view==='orders')await renderOrders();if(view==='finance')await renderFinance();if(view==='settings')await renderSettings()}catch(e){renderAccessError(e)}}

  function renderAccessError(e){
    const msg=e.status===503?'El panel administrativo está preparado, pero todavía falta activar Cloudflare Access cuando el dominio quede activo.':e.status===401?'Tu sesión de Cloudflare Access no está autorizada para este panel.':e.message;
    qs('#adminContent').innerHTML=`<div class="empty-state"><strong>Panel protegido</strong>${escapeHtml(msg)}</div>`;
  }

  async function ensureCategories(){if(state.categories.length)return;const d=await api('/api/admin/categories');state.categories=d.items||[]}

  async function renderDashboard(){
    const d=await api('/api/admin/dashboard');
    const k=d.kpis||{};
    qs('#adminContent').innerHTML=`
      <div class="kpi-grid">
        <div class="kpi"><small>Ventas del mes</small><strong>${money(k.salesCents)}</strong></div>
        <div class="kpi"><small>Pedidos pagados</small><strong>${k.paidOrders||0}</strong></div>
        <div class="kpi"><small>Ganancia neta estimada</small><strong>${money(k.netProfitCents)}</strong></div>
        <div class="kpi"><small>Stock bajo</small><strong>${k.lowStockCount||0}</strong></div>
      </div>
      <section class="admin-section"><div class="admin-section-head"><h2>Pedidos recientes</h2><button class="btn btn-ghost" data-go="orders">Ver todos</button></div>${ordersTable(d.recentOrders||[])}</section>
      <section class="admin-section"><div class="admin-section-head"><h2>Resumen financiero</h2><button class="btn btn-ghost" data-go="finance">Abrir finanzas</button></div>
        <div class="kpi-grid"><div class="kpi"><small>Costo mercadería</small><strong>${money(k.cogsCents)}</strong></div><div class="kpi"><small>Comisiones</small><strong>${money(k.feesCents)}</strong></div><div class="kpi"><small>Gastos</small><strong>${money(k.expensesCents)}</strong></div><div class="kpi"><small>Inversiones</small><strong>${money(k.investmentsCents)}</strong></div></div>
      </section>`;
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
    state.newFiles=[];
    if(id){const d=await api(`/api/admin/products/${id}`);state.editingProduct=duplicate?{...d.item,id:null,name:`${d.item.name} copia`,slug:''}:d.item}else state.editingProduct=null;
    const p=state.editingProduct||{status:'draft',price_cents:0,compare_at_cents:0,cost_cents:0,weight_grams:400,height_cm:5,width_cm:25,depth_cm:30,is_featured:0,is_new:0,is_bestseller:0,variants:[{color:'Negro',size:'S',stock:0,sku:''},{color:'Negro',size:'M',stock:0,sku:''},{color:'Negro',size:'L',stock:0,sku:''},{color:'Negro',size:'XL',stock:0,sku:''},{color:'Negro',size:'XXL',stock:0,sku:''}],images:[]};
    qs('#productDialogTitle').textContent=p.id?'Editar producto':'Nuevo producto';
    qs('#productFormBody').innerHTML=`
      <section class="form-section"><h3>Información</h3><div class="form-grid">
        <div class="field full"><label>Nombre</label><input class="input" name="name" required value="${escapeHtml(p.name||'')}"></div>
        <div class="field"><label>Categoría</label><select class="select" name="category_id" required><option value="">Elegir...</option>${state.categories.map(c=>`<option value="${c.id}" ${Number(p.category_id)===Number(c.id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Estado</label><select class="select" name="status"><option value="draft" ${p.status==='draft'?'selected':''}>Borrador</option><option value="published" ${p.status==='published'?'selected':''}>Publicado</option><option value="hidden" ${p.status==='hidden'?'selected':''}>Oculto</option></select></div>
        <div class="field"><label>Precio</label><input class="input" name="price" type="number" min="0" value="${centsToPesos(p.price_cents)}"></div>
        <div class="field"><label>Precio anterior</label><input class="input" name="compare" type="number" min="0" value="${centsToPesos(p.compare_at_cents)}"></div>
        <div class="field"><label>Costo del producto</label><input class="input" name="cost" type="number" min="0" value="${centsToPesos(p.cost_cents)}"></div>
        <div class="field full"><label>Descripción corta</label><textarea class="textarea" name="short_description">${escapeHtml(p.short_description||'')}</textarea></div>
        <div class="field full"><label>Significado del diseño</label><textarea class="textarea" name="meaning_text">${escapeHtml(p.meaning_text||'')}</textarea></div>
        <div class="field full"><label>Versículo (opcional)</label><input class="input" name="verse_text" value="${escapeHtml(p.verse_text||'')}"></div>
      </div><div class="toggle-row" style="margin-top:14px"><label class="toggle-label"><input type="checkbox" name="is_new" ${p.is_new?'checked':''}> Novedad</label><label class="toggle-label"><input type="checkbox" name="is_featured" ${p.is_featured?'checked':''}> Destacado</label><label class="toggle-label"><input type="checkbox" name="is_bestseller" ${p.is_bestseller?'checked':''}> Más vendido</label></div></section>
      <section class="form-section"><h3>Fotos</h3><input class="input" id="productImagesInput" type="file" accept="image/*" multiple><div class="image-preview-grid" id="existingImages">${(p.images||[]).map(im=>`<div class="image-preview"><img src="${escapeHtml(im.url)}" alt=""><button type="button" data-delete-image="${im.id}">×</button></div>`).join('')}</div><div class="image-preview-grid" id="newImages"></div></section>
      <section class="form-section"><div class="admin-section-head"><h3>Variantes y stock</h3><button type="button" class="btn btn-ghost" id="addVariantBtn">+ Variante</button></div><div class="variant-builder" id="variantBuilder">${(p.variants||[]).map(variantRow).join('')}</div></section>
      <section class="form-section"><h3>Datos para envío</h3><div class="form-grid"><div class="field"><label>Peso (g)</label><input class="input" name="weight_grams" type="number" min="0" value="${p.weight_grams||0}"></div><div class="field"><label>Alto (cm)</label><input class="input" name="height_cm" type="number" min="0" step=".1" value="${p.height_cm||0}"></div><div class="field"><label>Ancho (cm)</label><input class="input" name="width_cm" type="number" min="0" step=".1" value="${p.width_cm||0}"></div><div class="field"><label>Largo (cm)</label><input class="input" name="depth_cm" type="number" min="0" step=".1" value="${p.depth_cm||0}"></div></div></section>`;
    qs('#productDialog').showModal();
  }
  function variantRow(v={color:'',size:'',stock:0,sku:''}){return `<div class="variant-row"><input class="input" data-v="color" placeholder="Color" value="${escapeHtml(v.color||'')}"><input class="input" data-v="size" placeholder="Talle / opción" value="${escapeHtml(v.size||'')}"><input class="input" data-v="stock" type="number" min="0" placeholder="Stock" value="${Number(v.stock)||0}"><button type="button" class="btn btn-danger remove-variant">×</button><input type="hidden" data-v="sku" value="${escapeHtml(v.sku||'')}"></div>`}

  async function saveProduct(){
    const form=qs('#productForm');const fd=new FormData(form);const variants=qsa('.variant-row',qs('#variantBuilder')).map(r=>({color:qs('[data-v="color"]',r).value.trim(),size:qs('[data-v="size"]',r).value.trim(),stock:Number(qs('[data-v="stock"]',r).value)||0,sku:qs('[data-v="sku"]',r).value.trim()})).filter(v=>v.color||v.size);
    if(!fd.get('name')?.trim()||!fd.get('category_id')) throw new Error('Completá nombre y categoría.');
    const payload={name:fd.get('name').trim(),category_id:Number(fd.get('category_id')),status:fd.get('status'),price_cents:pesosToCents(fd.get('price')),compare_at_cents:pesosToCents(fd.get('compare')),cost_cents:pesosToCents(fd.get('cost')),short_description:fd.get('short_description')||'',meaning_text:fd.get('meaning_text')||'',verse_text:fd.get('verse_text')||'',is_new:fd.get('is_new')?1:0,is_featured:fd.get('is_featured')?1:0,is_bestseller:fd.get('is_bestseller')?1:0,weight_grams:Number(fd.get('weight_grams'))||0,height_cm:Number(fd.get('height_cm'))||0,width_cm:Number(fd.get('width_cm'))||0,depth_cm:Number(fd.get('depth_cm'))||0,variants};
    const id=state.editingProduct?.id;const d=await api(id?`/api/admin/products/${id}`:'/api/admin/products',{method:id?'PUT':'POST',body:JSON.stringify(payload)});const productId=d.item.id;
    for(const file of state.newFiles){const f=new FormData();f.append('file',file);await api(`/api/admin/products/${productId}/images`,{method:'POST',body:f});}
    qs('#productDialog').close();toast('Producto guardado','success');await renderProducts();
  }

  async function renderCategories(){
    const d=await api('/api/admin/categories');state.categories=d.items||[];
    qs('#adminContent').innerHTML=`<div class="admin-section-head"><div><p style="margin:0;color:var(--muted)">Creá categorías sin tocar código.</p></div><button class="btn btn-primary" id="newCategoryBtn">+ Nueva categoría</button></div><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Nombre</th><th>Slug</th><th>Orden</th><th>Activa</th></tr></thead><tbody>${state.categories.map(c=>`<tr><td><strong>${escapeHtml(c.name)}</strong></td><td>${escapeHtml(c.slug)}</td><td>${c.sort_order}</td><td><span class="status ${c.active?'success':'warning'}">${c.active?'Sí':'No'}</span></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function renderStock(){
    const d=await api('/api/admin/stock');
    qs('#adminContent').innerHTML=`<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Producto</th><th>Color</th><th>Talle</th><th>Stock físico</th><th>Disponible</th></tr></thead><tbody>${(d.items||[]).map(x=>`<tr><td><strong>${escapeHtml(x.product_name)}</strong></td><td>${escapeHtml(x.color||'—')}</td><td>${escapeHtml(x.size||'Única')}</td><td>${x.stock}</td><td><span class="status ${x.available_stock<=3?'warning':'success'}">${x.available_stock}</span></td></tr>`).join('')}</tbody></table></div>`;
  }

  function ordersTable(items){return `<div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Pago</th><th>Entrega</th><th>Fecha</th></tr></thead><tbody>${items.length?items.map(o=>`<tr><td><strong>${escapeHtml(o.code)}</strong></td><td>${escapeHtml(o.customer_name)}</td><td>${money(o.total_cents)}</td><td><span class="status ${o.payment_status==='paid'?'success':o.payment_status==='rejected'?'danger':'warning'}">${escapeHtml(o.payment_status)}</span></td><td><span class="status">${escapeHtml(o.fulfillment_status)}</span></td><td>${new Date(o.created_at).toLocaleString('es-AR')}</td></tr>`).join(''):`<tr><td colspan="6">Sin pedidos.</td></tr>`}</tbody></table></div>`}

  async function renderOrders(){
    const d=await api('/api/admin/orders');state.orders=d.items||[];
    qs('#adminContent').innerHTML=`${ordersTable(state.orders)}<div class="admin-section"><div class="notice">Abrí un pedido desde los botones de estado para marcar Preparando → En camino → Entregado. La vista detallada se activa al tener los primeros pedidos reales.</div></div>`;
    // add state controls into table rows
    const rows=qsa('tbody tr',qs('#adminContent')); rows.forEach((r,i)=>{const o=state.orders[i];if(!o)return;const td=document.createElement('td');td.innerHTML=`<select class="select order-status-select" data-order-id="${o.id}" style="min-width:145px"><option value="new" ${o.fulfillment_status==='new'?'selected':''}>Nuevo</option><option value="preparing" ${o.fulfillment_status==='preparing'?'selected':''}>Preparando</option><option value="ready" ${o.fulfillment_status==='ready'?'selected':''}>Listo</option><option value="on_the_way" ${o.fulfillment_status==='on_the_way'?'selected':''}>En camino</option><option value="delivered" ${o.fulfillment_status==='delivered'?'selected':''}>Entregado</option><option value="cancelled" ${o.fulfillment_status==='cancelled'?'selected':''}>Cancelado</option></select>`;r.appendChild(td)});
  }

  function rangeDates(){const now=new Date();let from=new Date(now);if(state.financeRange==='today')from=new Date(now.getFullYear(),now.getMonth(),now.getDate());else if(state.financeRange==='week')from.setDate(now.getDate()-7);else if(state.financeRange==='month')from=new Date(now.getFullYear(),now.getMonth(),1);else if(state.financeRange==='year')from=new Date(now.getFullYear(),0,1);return {from:from.toISOString(),to:now.toISOString()}}
  async function renderFinance(){
    const r=rangeDates(),d=await api(`/api/admin/finance?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);const s=d.summary||{};
    qs('#adminContent').innerHTML=`
      <div class="admin-section-head"><div class="finance-filters">${[['today','Hoy'],['week','7 días'],['month','Mes'],['year','Año']].map(([v,l])=>`<button class="btn btn-ghost ${state.financeRange===v?'active':''}" data-finance-range="${v}">${l}</button>`).join('')}</div><button class="btn btn-primary" id="newMovementBtn">+ Movimiento</button></div>
      <div class="kpi-grid"><div class="kpi"><small>Ingresos por ventas</small><strong>${money(s.salesCents)}</strong></div><div class="kpi"><small>Ganancia bruta</small><strong>${money(s.grossProfitCents)}</strong></div><div class="kpi"><small>Ganancia neta</small><strong>${money(s.netProfitCents)}</strong></div><div class="kpi"><small>Resultado de caja</small><strong>${money(s.cashResultCents)}</strong></div></div>
      <section class="admin-section"><div class="kpi-grid"><div class="kpi"><small>Costo mercadería</small><strong>${money(s.cogsCents)}</strong></div><div class="kpi"><small>Comisiones</small><strong>${money(s.feesCents)}</strong></div><div class="kpi"><small>Gastos</small><strong>${money(s.expensesCents)}</strong></div><div class="kpi"><small>Inversiones</small><strong>${money(s.investmentsCents)}</strong></div></div></section>
      <section class="admin-section"><div class="admin-section-head"><h2>Movimientos</h2></div><div class="admin-card admin-table-wrap"><table class="admin-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Descripción</th><th>Importe</th><th></th></tr></thead><tbody>${(d.movements||[]).map(m=>`<tr><td>${new Date(m.occurred_at).toLocaleDateString('es-AR')}</td><td>${escapeHtml(m.type)}</td><td>${escapeHtml(m.category||'')}</td><td>${escapeHtml(m.description)}</td><td>${money(m.amount_cents)}</td><td><button class="btn btn-danger" data-delete-movement="${m.id}">Eliminar</button></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  async function renderSettings(){
    const d=await api('/api/admin/settings');state.settings=d.settings||{};
    const s=state.settings;
    qs('#adminContent').innerHTML=`<form id="settingsForm">
      <div class="settings-grid">
        <section class="settings-card"><h3>Datos de SALMOS</h3><div class="field"><label>WhatsApp</label><input class="input" name="whatsapp" value="${escapeHtml(s.whatsapp||'5491162691341')}"></div><div class="field" style="margin-top:10px"><label>Instagram</label><input class="input" name="instagram" value="${escapeHtml(s.instagram||'')}"></div><div class="field" style="margin-top:10px"><label>Facebook</label><input class="input" name="facebook" value="${escapeHtml(s.facebook||'')}"></div></section>
        <section class="settings-card"><h3>Motomensajería</h3><div class="field"><label>Precio por km</label><input class="input" type="number" name="moto_rate_per_km" value="${escapeHtml(s.moto_rate_per_km||'800')}"></div><div class="field" style="margin-top:10px"><label>Máximo de km</label><input class="input" type="number" name="moto_max_km" value="${escapeHtml(s.moto_max_km||'50')}"></div><div class="field" style="margin-top:10px"><label>Demora mínima / máxima (horas)</label><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="input" type="number" name="moto_min_hours" value="${escapeHtml(s.moto_min_hours||'1')}"><input class="input" type="number" name="moto_max_hours" value="${escapeHtml(s.moto_max_hours||'4')}"></div></div></section>
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
    qs('#productImagesInput')?.addEventListener?.('change',()=>{});
    document.addEventListener('change',async e=>{
      if(e.target.id==='productImagesInput'){state.newFiles=[...e.target.files];qs('#newImages').innerHTML=state.newFiles.map((f,i)=>`<div class="image-preview"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-remove-new-image="${i}">×</button></div>`).join('')}
      if(e.target.matches('.order-status-select')){try{await api(`/api/admin/orders/${e.target.dataset.orderId}/status`,{method:'PATCH',body:JSON.stringify({fulfillment_status:e.target.value})});toast('Estado actualizado','success')}catch(err){toast(err.message,'error')}}
    });
    document.addEventListener('click',async e=>{
      const go=e.target.closest('[data-go]');if(go){navigate(go.dataset.go);return}
      if(e.target.id==='newProductBtn'){await openProductDialog();return}
      const edit=e.target.closest('[data-edit-product]');if(edit){await openProductDialog(Number(edit.dataset.editProduct));return}
      const dup=e.target.closest('[data-duplicate-product]');if(dup){await openProductDialog(Number(dup.dataset.duplicateProduct),true);return}
      if(e.target.id==='addVariantBtn'){qs('#variantBuilder').insertAdjacentHTML('beforeend',variantRow());return}
      const rv=e.target.closest('.remove-variant');if(rv){rv.closest('.variant-row').remove();return}
      const rn=e.target.closest('[data-remove-new-image]');if(rn){state.newFiles.splice(Number(rn.dataset.removeNewImage),1);qs('#newImages').innerHTML=state.newFiles.map((f,i)=>`<div class="image-preview"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-remove-new-image="${i}">×</button></div>`).join('');return}
      const di=e.target.closest('[data-delete-image]');if(di){if(confirm('¿Eliminar esta foto?')){await api(`/api/admin/images/${di.dataset.deleteImage}`,{method:'DELETE'});di.closest('.image-preview').remove();toast('Foto eliminada','success')}return}
      if(e.target.id==='saveProductBtn'){e.preventDefault();try{e.target.disabled=true;await saveProduct()}catch(err){toast(err.message,'error');e.target.disabled=false}return}
      if(e.target.id==='newCategoryBtn'){const name=prompt('Nombre de la categoría:');if(name){try{await api('/api/admin/categories',{method:'POST',body:JSON.stringify({name})});state.categories=[];await renderCategories();toast('Categoría creada','success')}catch(err){toast(err.message,'error')}}return}
      const fr=e.target.closest('[data-finance-range]');if(fr){state.financeRange=fr.dataset.financeRange;await renderFinance();return}
      if(e.target.id==='newMovementBtn'){const f=qs('#movementForm');f.reset();f.elements.date.value=today();qs('#movementDialog').showModal();return}
      if(e.target.id==='saveMovementBtn'){e.preventDefault();const f=new FormData(qs('#movementForm'));try{await api('/api/admin/finance',{method:'POST',body:JSON.stringify({type:f.get('type'),category:f.get('category'),description:f.get('description'),amount_cents:pesosToCents(f.get('amount')),occurred_at:new Date(`${f.get('date')}T12:00:00`).toISOString()})});qs('#movementDialog').close();toast('Movimiento guardado','success');await renderFinance()}catch(err){toast(err.message,'error')}return}
      const dm=e.target.closest('[data-delete-movement]');if(dm){if(confirm('¿Eliminar este movimiento?')){await api(`/api/admin/finance/${dm.dataset.deleteMovement}`,{method:'DELETE'});await renderFinance()}return}
      if(e.target.id==='saveSettingsBtn'){e.preventDefault();try{await saveSettings()}catch(err){toast(err.message,'error')}return}
    });
    qs('#adminContent').addEventListener('input',e=>{if(e.target.id==='adminProductSearch'){const q=e.target.value.toLowerCase();const items=state.products.filter(p=>p.name.toLowerCase().includes(q)||String(p.category_name||'').toLowerCase().includes(q));qs('#adminProductsTable').innerHTML=productsTable(items)}});
  }

  initTheme();bind();navigate('dashboard');
})();