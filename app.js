(() => {
  'use strict';

  const cfg = window.SALMOS_CONFIG || {};
  const API = (cfg.API_BASE_URL || '').replace(/\/$/, '');
  const apiUrl = (path) => `${API}${path}`;
  const money = (cents = 0) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);
  const escapeHtml = (v = '') => String(v).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s]));
  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => [...root.querySelectorAll(s)];

  const state = {
    config: null,
    categories: [],
    products: [],
    activeCategory: 'all',
    query: '',
    cart: loadJSON('salmos_cart', []),
    auth: { ready:false, user:null, firebaseAuth:null, favoriteIds:new Set(), addresses:[], orders:[], profile:null, syncing:false },
    accountTab: 'profile',
    cartSyncTimer: null,
    paymentApprovedReturn: false,
    selectedProduct: null,
    selectedColor: null,
    selectedVariantId: null,
    checkoutStep: 1,
    customer: loadJSON('salmos_customer', { name: '', phone: '', email: '' }),
    shipping: { method: null, costCents: 0, distanceKm: null, address: null, lat: null, lng: null, quoteId: null },
    googleLoaded: false,
    googleMap: null,
    googleMarker: null,
    autocomplete: null,
    area: null,
    order: null
  };

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function saveCart(sync = true) {
    localStorage.setItem('salmos_cart', JSON.stringify(state.cart));
    renderCart();
    if (sync && state.auth.user) scheduleCartSync();
  }
  function toast(message, type = '') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    qs('#toastStack').appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }
  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const res = await fetch(apiUrl(path), { ...options, headers });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) throw new Error(data?.error || data?.message || `Error ${res.status}`);
    return data;
  }

  function setTheme(theme) {
    const actual = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = actual;
    localStorage.setItem('salmos_theme', actual);
    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.content = actual === 'light' ? '#f6f2e8' : '#0b0b0c';
  }
  function initTheme() {
    const saved = localStorage.getItem('salmos_theme');
    const preferred = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    setTheme(saved || preferred);
  }


  function loadScriptOnce(src) {
    return new Promise((resolve,reject)=>{
      const old=[...document.scripts].find(s=>s.src===src);
      if(old){ if(old.dataset.loaded==='1') return resolve(); old.addEventListener('load',resolve,{once:true}); old.addEventListener('error',reject,{once:true}); return; }
      const s=document.createElement('script');s.src=src;s.async=true;s.dataset.loaded='0';s.onload=()=>{s.dataset.loaded='1';resolve()};s.onerror=()=>reject(new Error('No se pudo cargar el acceso con Google.'));document.head.appendChild(s);
    });
  }
  async function initFirebaseAuth() {
    if (!cfg.FIREBASE_CONFIG?.apiKey) { state.auth.ready=true; return; }
    try {
      await loadScriptOnce('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
      await loadScriptOnce('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js');
      const appName='salmosCustomerAuth';
      const fbApp = firebase.apps.find(a=>a.name===appName) || firebase.initializeApp(cfg.FIREBASE_CONFIG, appName);
      const auth = fbApp.auth();
      state.auth.firebaseAuth=auth;
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      await auth.getRedirectResult().catch(()=>null);
      auth.onAuthStateChanged(async user=>{
        state.auth.user=user||null;
        state.auth.ready=true;
        if(user){
          try {
            if(state.paymentApprovedReturn) {
              await authApi('/api/account/cart',{method:'PUT',body:JSON.stringify({items:[]})});
              state.auth.favoriteIds=new Set();
            }
            await loadAccountData(!state.paymentApprovedReturn);
          } catch(err) { console.error(err); toast(err.message,'error'); }
        } else {
          state.auth.profile=null;state.auth.favoriteIds=new Set();state.auth.addresses=[];state.auth.orders=[];
        }
        state.paymentApprovedReturn=false;
        renderAuthButtons();renderProducts();renderFeatured();renderAccountPanel();
      });
    } catch(err) {
      console.error(err);state.auth.ready=true;toast('No se pudo iniciar Google en este momento. La compra sin cuenta sigue disponible.','error');
    }
  }
  async function currentIdToken(force=false) {
    if(!state.auth.user) return '';
    return state.auth.user.getIdToken(force);
  }
  async function authApi(path, options={}) {
    const token=await currentIdToken();
    if(!token) throw new Error('Ingresá con Google para usar esta función.');
    const headers=new Headers(options.headers||{});
    headers.set('Authorization',`Bearer ${token}`);
    if(!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
    let res=await fetch(apiUrl(path),{...options,headers});
    if(res.status===401){
      const refreshed=await currentIdToken(true);
      headers.set('Authorization',`Bearer ${refreshed}`);
      res=await fetch(apiUrl(path),{...options,headers});
    }
    const text=await res.text();let data=null;try{data=text?JSON.parse(text):null}catch{data={message:text}};
    if(!res.ok) throw new Error(data?.error||data?.message||`Error ${res.status}`);
    return data;
  }
  function mergeCarts(local, remote) {
    const byId=new Map();
    for(const x of [...remote,...local]){
      const id=Number(x.variantId);if(!id)continue;
      const old=byId.get(id);
      if(!old) byId.set(id,{...x,variantId:id,qty:Number(x.qty)||1});
      else {
        const maxStock=Math.max(Number(old.maxStock)||0,Number(x.maxStock)||0,99);
        byId.set(id,{...old,...x,qty:Math.min(Math.max(Number(old.qty)||1,Number(x.qty)||1),maxStock)});
      }
    }
    return [...byId.values()];
  }
  async function loadAccountData(mergeCart=true) {
    const d=await authApi('/api/account/bootstrap');
    state.auth.profile=d.user||{};
    state.auth.favoriteIds=new Set((d.favoriteIds||[]).map(Number));
    state.auth.addresses=d.addresses||[];
    state.auth.orders=d.orders||[];
    if(mergeCart){
      const merged=mergeCarts(state.cart,d.cart||[]);
      state.cart=merged;saveCart(false);
      await syncCartNow();
    }
    const u=state.auth.user;
    if(u){
      state.customer={
        name: state.auth.profile?.display_name || u.displayName || state.customer.name || '',
        phone: state.auth.profile?.phone || state.customer.phone || '',
        email: u.email || state.customer.email || ''
      };
      localStorage.setItem('salmos_customer',JSON.stringify(state.customer));
    }
  }
  function scheduleCartSync() {
    clearTimeout(state.cartSyncTimer);
    state.cartSyncTimer=setTimeout(()=>syncCartNow().catch(err=>console.error(err)),450);
  }
  async function syncCartNow(items=state.cart) {
    if(!state.auth.user || state.auth.syncing)return;
    state.auth.syncing=true;
    try { await authApi('/api/account/cart',{method:'PUT',body:JSON.stringify({items:items.map(x=>({variantId:x.variantId,quantity:x.qty}))})}); }
    finally { state.auth.syncing=false; }
  }
  async function signInGoogle() {
    if(!state.auth.firebaseAuth) { toast('Google todavía está cargando. Probá nuevamente en unos segundos.'); return; }
    const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
    try { await state.auth.firebaseAuth.signInWithPopup(provider); }
    catch(err){
      if(['auth/popup-blocked','auth/cancelled-popup-request','auth/web-storage-unsupported'].includes(err.code)) await state.auth.firebaseAuth.signInWithRedirect(provider);
      else if(err.code!=='auth/popup-closed-by-user') toast('No pudimos iniciar sesión con Google.','error');
    }
  }
  async function signOutGoogle() {
    if(state.auth.firebaseAuth) await state.auth.firebaseAuth.signOut();
    closeAccount();
    toast('Sesión cerrada.');
  }
  function ensureAccountUi() {
    const actions=qs('.header-actions');
    if(actions && !qs('#favoritesBtn')){
      const fav=document.createElement('button');fav.className='icon-btn';fav.id='favoritesBtn';fav.title='Favoritos';fav.setAttribute('aria-label','Favoritos');fav.innerHTML=`<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg><span class="badge hidden" id="favoritesBadge">0</span>`;
      const acc=document.createElement('button');acc.className='icon-btn account-btn';acc.id='accountBtn';acc.title='Mi cuenta';acc.setAttribute('aria-label','Mi cuenta');acc.innerHTML=`<span id="accountButtonContent"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>`;
      const cart=qs('#cartBtn');actions.insertBefore(fav,cart);actions.insertBefore(acc,cart);
    }
    if(!qs('#accountBackdrop')){
      document.body.insertAdjacentHTML('beforeend',`
        <div class="drawer-backdrop account-backdrop" id="accountBackdrop"></div>
        <aside class="drawer account-drawer" id="accountDrawer" aria-label="Mi cuenta">
          <div class="drawer-head"><div><div class="account-kicker">SALMOS</div><h3>Mi cuenta</h3></div><button class="icon-btn" id="closeAccountBtn" aria-label="Cerrar">×</button></div>
          <div class="drawer-body" id="accountContent"></div>
        </aside>`);
    }
    renderAuthButtons();renderAccountPanel();
  }
  function renderAuthButtons() {
    const host=qs('#accountButtonContent'), badge=qs('#favoritesBadge');
    if(host){
      if(state.auth.user?.photoURL) host.innerHTML=`<img class="account-avatar-small" src="${escapeHtml(state.auth.user.photoURL)}" alt="">`;
      else host.innerHTML=`<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>`;
    }
    const n=state.auth.favoriteIds.size;if(badge){badge.textContent=n;badge.classList.toggle('hidden',!n);}
  }
  function openAccount(tab='profile') { state.accountTab=tab;renderAccountPanel();qs('#accountDrawer')?.classList.add('open');qs('#accountBackdrop')?.classList.add('open');document.body.classList.add('no-scroll'); }
  function closeAccount() { qs('#accountDrawer')?.classList.remove('open');qs('#accountBackdrop')?.classList.remove('open');document.body.classList.remove('no-scroll'); }
  function accountTabs() {
    return `<div class="account-tabs">
      <button class="${state.accountTab==='profile'?'active':''}" data-account-tab="profile">Cuenta</button>
      <button class="${state.accountTab==='favorites'?'active':''}" data-account-tab="favorites">Favoritos</button>
      <button class="${state.accountTab==='orders'?'active':''}" data-account-tab="orders">Pedidos</button>
      <button class="${state.accountTab==='addresses'?'active':''}" data-account-tab="addresses">Direcciones</button>
    </div>`;
  }
  function statusLabel(s){return ({pending:'Pendiente',paid:'Pagado',rejected:'Rechazado',refunded:'Reintegrado',cancelled:'Cancelado',new:'Nuevo',preparing:'Preparando',ready:'Listo',on_the_way:'En camino',delivered:'Entregado'})[s]||s||'—'}
  function renderAccountPanel() {
    const host=qs('#accountContent');if(!host)return;
    if(!state.auth.ready){host.innerHTML='<div class="empty-state"><strong>Cargando acceso...</strong></div>';return;}
    if(!state.auth.user){
      host.innerHTML=`<div class="account-guest">
        <div class="account-google-mark">G</div>
        <h3>Ingresá con Google</h3>
        <p>Tu cuenta es opcional. Podés comprar sin registrarte; al ingresar guardamos favoritos, carrito, pedidos y direcciones para usarlos en cualquier dispositivo.</p>
        <button class="btn btn-primary full" id="googleSignInBtn">Continuar con Google</button>
        <div class="notice">SALMOS no administra contraseñas. El único ingreso de clientes es mediante Google.</div>
      </div>`;return;
    }
    const u=state.auth.user,p=state.auth.profile||{};
    let content='';
    if(state.accountTab==='profile') content=`<div class="account-profile">
      <div class="account-identity">${u.photoURL?`<img src="${escapeHtml(u.photoURL)}" alt="">`:''}<div><strong>${escapeHtml(p.display_name||u.displayName||'Cliente SALMOS')}</strong><small>${escapeHtml(u.email||'')}</small></div></div>
      <div class="field"><label>Nombre y apellido</label><input class="input" id="accountName" value="${escapeHtml(p.display_name||u.displayName||'')}"></div>
      <div class="field"><label>WhatsApp</label><input class="input" id="accountPhone" inputmode="tel" value="${escapeHtml(p.phone||'')}"></div>
      <button class="btn btn-primary full" id="saveProfileBtn">Guardar mis datos</button>
      <button class="btn btn-ghost full" id="signOutBtn">Cerrar sesión</button>
    </div>`;
    if(state.accountTab==='favorites'){
      const favs=state.products.filter(p=>state.auth.favoriteIds.has(Number(p.id)));
      content=favs.length?`<div class="account-list">${favs.map(p=>`<button class="account-product-row" data-open-favorite="${p.id}">${p.primary_image_url?`<img src="${escapeHtml(p.primary_image_url)}" alt="">`:'<span class="account-product-placeholder">S</span>'}<span><strong>${escapeHtml(p.name)}</strong><small>${money(p.price_cents)}</small></span><b>›</b></button>`).join('')}</div>`:'<div class="empty-state"><strong>Todavía no guardaste favoritos.</strong>Tocá el corazón de cualquier producto.</div>';
    }
    if(state.accountTab==='orders'){
      content=state.auth.orders.length?`<div class="account-orders">${state.auth.orders.map(o=>`<div class="account-order"><div><strong>${escapeHtml(o.code)}</strong><small>${new Date(o.created_at).toLocaleDateString('es-AR')}</small></div><div class="account-order-total">${money(o.total_cents)}</div><div class="account-statuses"><span>${escapeHtml(statusLabel(o.payment_status))}</span><span>${escapeHtml(statusLabel(o.fulfillment_status))}</span></div>${o.tracking_number?`<small>Seguimiento: ${escapeHtml(o.tracking_number)}</small>`:''}</div>`).join('')}</div>`:'<div class="empty-state"><strong>Todavía no hay pedidos en esta cuenta.</strong>Las compras que hagas conectado con Google aparecerán acá.</div>';
    }
    if(state.accountTab==='addresses'){
      const rows=state.auth.addresses.map(a=>`<div class="account-address"><div><strong>${escapeHtml(a.label||'Dirección')}</strong>${a.is_default?'<span class="mini-pill">Predeterminada</span>':''}<p>${escapeHtml(a.formatted_address)}</p>${a.recipient_name?`<small>${escapeHtml(a.recipient_name)}${a.phone?' · '+escapeHtml(a.phone):''}</small>`:''}</div><div class="account-address-actions">${!a.is_default?`<button class="btn btn-ghost" data-default-address="${a.id}">Usar por defecto</button>`:''}<button class="btn btn-danger" data-delete-address="${a.id}">Eliminar</button></div></div>`).join('');
      content=`${rows?`<div class="account-list">${rows}</div>`:'<div class="empty-state"><strong>No tenés direcciones guardadas.</strong>Podés agregarlas acá o guardar la dirección al comprar.</div>'}
      <div class="account-address-form">
        <h4>Agregar dirección</h4>
        <div class="field"><label>Nombre (ej. Casa)</label><input class="input" id="newAddressLabel" value="Casa"></div>
        <div class="field"><label>Dirección completa</label><input class="input" id="newAddressText" placeholder="Calle, altura, localidad, provincia"></div>
        <div class="field"><label>Quién recibe</label><input class="input" id="newAddressRecipient" value="${escapeHtml(p.display_name||u.displayName||'')}"></div>
        <div class="field"><label>WhatsApp</label><input class="input" id="newAddressPhone" value="${escapeHtml(p.phone||'')}"></div>
        <label class="account-check"><input type="checkbox" id="newAddressDefault"> Usar como predeterminada</label>
        <button class="btn btn-primary full" id="validateSaveAddressBtn">Validar y guardar</button>
      </div>`;
    }
    host.innerHTML=accountTabs()+`<div class="account-tab-content">${content}</div>`;
  }
  async function toggleFavorite(productId) {
    if(!state.auth.user){openAccount('favorites');toast('Ingresá con Google para guardar favoritos.');return;}
    const id=Number(productId),on=state.auth.favoriteIds.has(id);
    try{
      await authApi(`/api/account/favorites/${id}`,{method:on?'DELETE':'PUT'});
      if(on)state.auth.favoriteIds.delete(id);else state.auth.favoriteIds.add(id);
      renderAuthButtons();renderProducts();renderFeatured();if(state.selectedProduct?.id===id)renderProductModal();renderAccountPanel();
      toast(on?'Quitado de favoritos':'Guardado en favoritos','success');
    }catch(err){toast(err.message,'error')}
  }
  async function refreshAccount() { if(state.auth.user){await loadAccountData(false);renderAuthButtons();renderAccountPanel();} }
  async function saveProfile() {
    const displayName=qs('#accountName')?.value.trim()||'',phone=qs('#accountPhone')?.value.trim()||'';
    await authApi('/api/account/profile',{method:'PUT',body:JSON.stringify({displayName,phone})});
    state.auth.profile={...(state.auth.profile||{}),display_name:displayName,phone};
    state.customer={...state.customer,name:displayName||state.customer.name,phone,email:state.auth.user?.email||state.customer.email};localStorage.setItem('salmos_customer',JSON.stringify(state.customer));
    renderAccountPanel();toast('Datos guardados','success');
  }
  async function validateAndSaveAddress() {
    const address=qs('#newAddressText')?.value.trim();if(!address){toast('Escribí la dirección completa.','error');return;}
    const btn=qs('#validateSaveAddressBtn');if(btn){btn.disabled=true;btn.textContent='Validando...'}
    try{
      const v=await api('/api/geo/validate-address',{method:'POST',body:JSON.stringify({address})});
      const loc=v.geocode?.location||{};const lat=Number(loc.latitude??loc.lat),lng=Number(loc.longitude??loc.lng);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))throw new Error('Google pudo leer la dirección, pero falta confirmar el punto. Guardala desde el checkout usando el mapa.');
      await authApi('/api/account/addresses',{method:'POST',body:JSON.stringify({
        label:qs('#newAddressLabel')?.value.trim()||'Casa',recipientName:qs('#newAddressRecipient')?.value.trim()||'',phone:qs('#newAddressPhone')?.value.trim()||'',
        formattedAddress:v.formattedAddress||address,lat,lng,isDefault:Boolean(qs('#newAddressDefault')?.checked)
      })});
      await refreshAccount();toast('Dirección guardada','success');
    }catch(err){toast(err.message,'error')}finally{if(btn){btn.disabled=false;btn.textContent='Validar y guardar'}}
  }
  async function saveCheckoutAddressIfRequested() {
    if(!state.auth.user||state.shipping.method!=='moto'||!qs('#saveCheckoutAddress')?.checked)return;
    const duplicate=state.auth.addresses.some(a=>String(a.formatted_address).toLowerCase()===String(state.shipping.address||'').toLowerCase());
    if(duplicate)return;
    await authApi('/api/account/addresses',{method:'POST',body:JSON.stringify({
      label:'Casa',recipientName:state.customer.name,phone:state.customer.phone,formattedAddress:state.shipping.address,lat:state.shipping.lat,lng:state.shipping.lng,isDefault:state.auth.addresses.length===0
    })});
    await loadAccountData(false);
  }

  function renderSkeletons() {
    qs('#productGrid').innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');
  }

  async function loadStore() {
    renderSkeletons();
    try {
      const [publicConfig, categories, products] = await Promise.all([
        api('/api/config/public'), api('/api/categories'), api('/api/products')
      ]);
      state.config = publicConfig;
      state.categories = categories.items || [];
      state.products = products.items || [];
      renderCategories();
      renderProducts();
      renderFeatured();
      renderCart();
      const whatsapp = state.config?.whatsapp || cfg.STORE_WHATSAPP || '5491162691341';
      qs('#footerWhatsapp').href = `https://wa.me/${whatsapp}`;
    } catch (err) {
      console.error(err);
      qs('#productGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>No pudimos cargar la tienda.</strong>${API ? escapeHtml(err.message) : 'Falta conectar el sitio con el Worker de SALMOS en config.js.'}</div>`;
    }
  }

  function renderCategories() {
    const row = qs('#categoryRow');
    row.innerHTML = `<button class="chip active" data-category="all">Todo</button>` + state.categories.map(c => `<button class="chip" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`).join('');
    row.addEventListener('click', e => {
      const btn = e.target.closest('[data-category]');
      if (!btn) return;
      state.activeCategory = btn.dataset.category;
      qsa('.chip', row).forEach(x => x.classList.toggle('active', x === btn));
      renderProducts();
      qs('#productos').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function filteredProducts() {
    const q = state.query.trim().toLowerCase();
    return state.products.filter(p => {
      const cat = state.activeCategory === 'all' || p.category_slug === state.activeCategory;
      const hay = !q || [p.name, p.short_description, p.category_name].some(x => String(x || '').toLowerCase().includes(q));
      return cat && hay;
    });
  }

  function productCard(p) {
    const image = p.primary_image_url
      ? `<img loading="lazy" src="${escapeHtml(p.primary_image_url)}" alt="${escapeHtml(p.name)}">`
      : `<div class="product-placeholder">SALMOS</div>`;
    const tags = [p.is_new ? '<span class="tag gold">NUEVO</span>' : '', p.is_bestseller ? '<span class="tag">MÁS VENDIDO</span>' : ''].join('');
    return `<article class="product-card" data-product-id="${p.id}">
      <div class="product-media">${image}<div class="product-tags">${tags}</div><button class="favorite-btn ${state.auth.favoriteIds.has(Number(p.id))?'active':''}" data-favorite-product="${p.id}" aria-label="Guardar en favoritos" title="Favorito">♥</button></div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="price-row"><span class="price">${money(p.price_cents)}</span>${p.compare_at_cents > p.price_cents ? `<span class="price-old">${money(p.compare_at_cents)}</span>` : ''}</div>
        <div class="stock-note">${p.available_stock > 0 ? (p.available_stock <= 3 ? 'Últimas unidades' : 'Disponible') : 'Sin stock'}</div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const items = filteredProducts();
    const title = state.activeCategory === 'all' ? 'Productos' : (state.categories.find(c => c.slug === state.activeCategory)?.name || 'Productos');
    qs('#productsTitle').textContent = state.query ? `Resultados para “${state.query}”` : title;
    qs('#productsSubtitle').textContent = items.length ? `${items.length} ${items.length === 1 ? 'producto' : 'productos'}` : 'No encontramos productos con ese filtro.';
    qs('#clearFiltersBtn').classList.toggle('hidden', state.activeCategory === 'all' && !state.query);
    qs('#productGrid').innerHTML = items.length ? items.map(productCard).join('') : `<div class="empty-state" style="grid-column:1/-1"><strong>No hay productos para mostrar.</strong>Probá otra categoría o búsqueda.</div>`;
  }

  function renderFeatured() {
    const items = state.products.filter(p => p.is_featured).slice(0, 4);
    qs('#featuredSection').classList.toggle('hidden', !items.length);
    qs('#featuredGrid').innerHTML = items.map(productCard).join('');
  }

  async function openProduct(id) {
    try {
      const data = await api(`/api/products/${id}`);
      const p = data.item;
      state.selectedProduct = p;
      state.selectedColor = p.colors?.[0] || null;
      state.selectedVariantId = firstAvailableVariant(p, state.selectedColor)?.id || null;
      renderProductModal();
      openModal('#productModal');
    } catch (err) { toast(err.message, 'error'); }
  }

  function firstAvailableVariant(p, color) {
    return (p.variants || []).find(v => (!color || v.color === color) && v.available_stock > 0) || (p.variants || []).find(v => !color || v.color === color) || null;
  }

  function renderProductModal() {
    const p = state.selectedProduct;
    if (!p) return;
    const images = p.images?.length ? p.images : [{ url: '', alt_text: p.name }];
    const activeVariant = p.variants?.find(v => v.id === Number(state.selectedVariantId));
    const colors = p.colors || [];
    const sizes = [...new Set((p.variants || []).filter(v => !state.selectedColor || v.color === state.selectedColor).map(v => v.size || 'Única'))];
    const modal = qs('#productModal');
    modal.innerHTML = `
      <button class="icon-btn modal-close" data-close-product aria-label="Cerrar">×</button>
      <div class="product-detail">
        <div class="detail-gallery">
          <div class="detail-main">${images[0].url ? `<img id="detailMainImage" src="${escapeHtml(images[0].url)}" alt="${escapeHtml(images[0].alt_text || p.name)}">` : '<div class="product-placeholder">SALMOS</div>'}<button class="favorite-btn detail-favorite ${state.auth.favoriteIds.has(Number(p.id))?'active':''}" data-favorite-product="${p.id}" aria-label="Guardar en favoritos">♥</button></div>
          ${images.length > 1 ? `<div class="thumb-row">${images.map((im,i)=>`<button class="thumb ${i===0?'active':''}" data-image="${escapeHtml(im.url)}"><img src="${escapeHtml(im.url)}" alt=""></button>`).join('')}</div>` : ''}
        </div>
        <div class="detail-info">
          <div class="hero-kicker">${escapeHtml(p.category_name || '')}</div>
          <h2>${escapeHtml(p.name)}</h2>
          <div class="price-row"><span class="price">${money(p.price_cents)}</span>${p.compare_at_cents > p.price_cents ? `<span class="price-old">${money(p.compare_at_cents)}</span>` : ''}</div>
          <p class="detail-description">${escapeHtml(p.short_description || '')}</p>
          ${colors.length > 1 || (colors.length === 1 && colors[0]) ? `<div class="detail-block"><span class="detail-label">Color</span><div class="option-row">${colors.map(c=>`<button class="option ${c===state.selectedColor?'active':''}" data-color="${escapeHtml(c)}">${escapeHtml(c || 'Único')}</button>`).join('')}</div></div>` : ''}
          <div class="detail-block"><span class="detail-label">Talle / variante</span><div class="option-row">${sizes.map(size => { const v=(p.variants||[]).find(v => (v.color||'') === (state.selectedColor||'') && (v.size||'Única')===size) || (p.variants||[]).find(v => !state.selectedColor && (v.size||'Única')===size); return `<button class="option ${v?.id===Number(state.selectedVariantId)?'active':''}" data-variant="${v?.id||''}" ${!v || v.available_stock<=0?'disabled':''}>${escapeHtml(size)}</button>`; }).join('')}</div></div>
          ${p.meaning_text || p.verse_text ? `<div class="meaning-box"><h4>El significado detrás del diseño</h4>${p.meaning_text ? `<div>${escapeHtml(p.meaning_text)}</div>`:''}${p.verse_text ? `<div class="verse">${escapeHtml(p.verse_text)}</div>`:''}</div>` : ''}
          <div class="stock-note">${activeVariant?.available_stock > 0 ? `Stock disponible: ${activeVariant.available_stock}` : 'Seleccioná una variante disponible'}</div>
          <div class="detail-actions">
            <button class="btn btn-secondary" data-add-cart ${!activeVariant || activeVariant.available_stock<=0?'disabled':''}>Agregar al carrito</button>
            <button class="btn btn-primary" data-buy-now ${!activeVariant || activeVariant.available_stock<=0?'disabled':''}>Comprar ahora</button>
          </div>
        </div>
      </div>`;
  }

  function addSelectedToCart(openCheckoutNow = false) {
    const p = state.selectedProduct;
    const v = p?.variants?.find(x => x.id === Number(state.selectedVariantId));
    if (!p || !v || v.available_stock <= 0) return;
    const existing = state.cart.find(x => x.variantId === v.id);
    if (existing) existing.qty = Math.min(existing.qty + 1, v.available_stock);
    else state.cart.push({ productId: p.id, variantId: v.id, name: p.name, color: v.color, size: v.size, priceCents: p.price_cents, qty: 1, maxStock: v.available_stock, image: p.images?.[0]?.url || '' });
    saveCart();
    closeModal('#productModal');
    toast('Producto agregado al carrito', 'success');
    if (openCheckoutNow) startCheckout(); else openCart();
  }

  function renderCart() {
    const count = state.cart.reduce((n, x) => n + x.qty, 0);
    const badge = qs('#cartBadge');
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
    const items = qs('#cartItems');
    if (!state.cart.length) {
      items.innerHTML = '<div class="empty-state"><strong>Tu carrito está vacío.</strong>Agregá un producto para comenzar.</div>';
    } else {
      items.innerHTML = state.cart.map((x,i) => `<div class="cart-item">
        ${x.image ? `<img class="cart-thumb" src="${escapeHtml(x.image)}" alt="">` : '<div class="cart-thumb product-placeholder">S</div>'}
        <div class="cart-meta"><strong>${escapeHtml(x.name)}</strong><small>${escapeHtml([x.color,x.size].filter(Boolean).join(' · ') || 'Única')}</small><div class="qty"><button data-qty="-1" data-index="${i}">−</button><b>${x.qty}</b><button data-qty="1" data-index="${i}">+</button></div></div>
        <button class="cart-remove" data-remove="${i}" aria-label="Eliminar">×</button>
      </div>`).join('');
    }
    qs('#cartSubtotal').textContent = money(cartSubtotal());
    qs('#checkoutBtn').disabled = !state.cart.length;
  }
  function cartSubtotal() { return state.cart.reduce((sum, x) => sum + x.priceCents * x.qty, 0); }
  function openCart() { qs('#cartDrawer').classList.add('open'); qs('#drawerBackdrop').classList.add('open'); document.body.classList.add('no-scroll'); }
  function closeCart() { qs('#cartDrawer').classList.remove('open'); qs('#drawerBackdrop').classList.remove('open'); document.body.classList.remove('no-scroll'); }

  function openModal(sel) { qs(sel).classList.add('open'); qs('#modalBackdrop').classList.add('open'); document.body.classList.add('no-scroll'); }
  function closeModal(sel) { qs(sel).classList.remove('open'); if (!qsa('.modal.open').length) { qs('#modalBackdrop').classList.remove('open'); document.body.classList.remove('no-scroll'); } }

  function startCheckout() {
    if (!state.cart.length) return;
    closeCart();
    state.checkoutStep = 1;
    state.shipping = { method: null, costCents: 0, distanceKm: null, address: null, lat: null, lng: null, quoteId: null };
    renderCheckout();
    openModal('#checkoutModal');
  }

  function renderCheckout() {
    qsa('.step', qs('#checkoutModal')).forEach((el, i) => el.classList.toggle('active', i < state.checkoutStep));
    if (state.checkoutStep === 1) renderCheckoutCustomer();
    else if (state.checkoutStep === 2) renderCheckoutShipping();
    else renderCheckoutSummary();
  }

  function renderCheckoutCustomer() {
    qs('#checkoutContent').innerHTML = `
      <h2>Tus datos</h2><div class="checkout-sub">Solo lo necesario para preparar y coordinar tu pedido.</div>
      ${state.auth.user?`<div class="notice account-checkout-note">✓ Comprando con ${escapeHtml(state.auth.user.email||'tu cuenta de Google')}. Este pedido aparecerá en Mi cuenta.</div>`:`<div class="notice account-checkout-note">Podés comprar sin cuenta. <button class="link-action inline-link" id="checkoutGoogleBtn">Ingresar con Google</button> para sincronizar carrito, favoritos y pedidos.</div>`}
      <div class="form-grid">
        <div class="field full"><label>Nombre y apellido</label><input class="input" id="customerName" autocomplete="name" value="${escapeHtml(state.customer.name)}"></div>
        <div class="field"><label>WhatsApp</label><input class="input" id="customerPhone" inputmode="tel" autocomplete="tel" placeholder="11 1234 5678" value="${escapeHtml(state.customer.phone)}"></div>
        <div class="field"><label>Email</label><input class="input" id="customerEmail" type="email" autocomplete="email" placeholder="opcional" value="${escapeHtml(state.customer.email)}"></div>
      </div>
      <div class="checkout-actions"><span></span><button class="btn btn-primary" id="toShippingBtn">Continuar</button></div>`;
  }

  function renderCheckoutShipping() {
    const pc = state.config || {};
    const pickupEnabled = Boolean(pc.shipping?.pickup?.enabled);
    const motoEnabled = pc.shipping?.moto?.enabled !== false;
    const correoEnabled = Boolean(pc.shipping?.correo?.enabled);
    qs('#checkoutContent').innerHTML = `
      <h2>Entrega</h2><div class="checkout-sub">Elegí cómo querés recibir tu compra.</div>
      <div class="shipping-options">
        <button class="shipping-card ${state.shipping.method==='moto'?'active':''} ${motoEnabled?'':'disabled'}" data-shipping="moto" ${motoEnabled?'':'disabled'}><span class="shipping-icon">🏍️</span><span class="shipping-copy"><strong>Motomensajería</strong><small>Hasta ${pc.shipping?.moto?.maxKm || 50} km · demora estimada ${pc.shipping?.moto?.minHours || 1}–${pc.shipping?.moto?.maxHours || 4} h</small></span><span class="shipping-price">${state.shipping.method==='moto' && state.shipping.costCents ? money(state.shipping.costCents) : 'Calcular'}</span></button>
        <button class="shipping-card ${state.shipping.method==='correo'?'active':''} ${correoEnabled?'':'disabled'}" data-shipping="correo" ${correoEnabled?'':'disabled'}><span class="shipping-icon">📦</span><span class="shipping-copy"><strong>Correo Argentino</strong><small>${correoEnabled?'Domicilio o sucursal':'Integración pendiente de habilitación'}</small></span><span class="shipping-price">${correoEnabled?'Calcular':'Próximamente'}</span></button>
        <button class="shipping-card ${state.shipping.method==='pickup'?'active':''} ${pickupEnabled?'':'disabled'}" data-shipping="pickup" ${pickupEnabled?'':'disabled'}><span class="shipping-icon">📍</span><span class="shipping-copy"><strong>Retiro en SALMOS</strong><small>${pickupEnabled?escapeHtml(pc.shipping.pickup.address || 'Coordinar retiro'):'Se habilitará desde administración'}</small></span><span class="shipping-price">Gratis</span></button>
      </div>
      <div id="shippingDetail"></div>
      <div class="checkout-actions"><button class="btn btn-ghost" id="backCustomerBtn">Atrás</button><button class="btn btn-primary" id="toSummaryBtn" ${state.shipping.method && (state.shipping.method!=='moto' || state.shipping.costCents>0) ? '' : 'disabled'}>Continuar</button></div>`;
    renderShippingDetail();
  }

  function renderShippingDetail() {
    const host = qs('#shippingDetail');
    if (!host) return;
    if (state.shipping.method === 'pickup') {
      const pickup = state.config?.shipping?.pickup;
      host.innerHTML = `<div class="address-panel"><strong>Retiro sin costo</strong><p class="detail-description">${escapeHtml(pickup?.instructions || 'Te avisaremos cuando tu pedido esté listo para retirar.')}</p></div>`;
      return;
    }
    if (state.shipping.method === 'correo') {
      host.innerHTML = `<div class="address-panel"><strong>Correo Argentino</strong><p class="detail-description">La cotización se habilitará automáticamente cuando Correo Argentino entregue las credenciales de PAQ.AR.</p></div>`;
      return;
    }
    if (state.shipping.method !== 'moto') { host.innerHTML = ''; return; }
    host.innerHTML = `
      <div class="address-panel">
        ${state.auth.user && state.auth.addresses.length ? `<div class="saved-addresses"><span class="detail-label">Direcciones guardadas</span><div class="saved-address-row">${state.auth.addresses.map(a=>`<button class="saved-address-btn ${state.shipping.address===a.formatted_address?'active':''}" data-use-address="${a.id}"><strong>${escapeHtml(a.label||'Dirección')}</strong><small>${escapeHtml(a.formatted_address)}</small></button>`).join('')}</div></div>` : ''}
        <div class="row">
          <div class="field" style="flex:1"><label>Primero: localidad o código postal</label><input class="input" id="areaInput" placeholder="Ej. Tristán Suárez o 1806" value="${escapeHtml(state.area?.query || '')}"></div>
          <button class="btn btn-secondary" id="resolveAreaBtn">Buscar zona</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-ghost" id="useLocationBtn">📍 Usar mi ubicación actual</button></div>
        <div class="address-autocomplete" id="autocompleteHost"></div>
        <div class="map-box hidden" id="mapBox"></div>
        <div class="address-confirm hidden" id="addressConfirm"></div>
        <div id="quoteHost"></div>
      </div>`;
    if (state.area) setupAddressAutocomplete().catch(err => toast(err.message, 'error'));
    if (state.shipping.lat && state.shipping.lng) setTimeout(() => showMap(state.shipping.lat, state.shipping.lng, state.shipping.address), 0);
  }

  async function resolveArea(query) {
    if (!query?.trim()) throw new Error('Ingresá una localidad o código postal.');
    const data = await api('/api/geo/resolve-area', { method:'POST', body: JSON.stringify({ query }) });
    state.area = { query, ...data };
    await setupAddressAutocomplete();
    toast('Zona encontrada. Ahora elegí calle y altura.', 'success');
  }

  async function loadGoogle() {
    if (window.google?.maps) { state.googleLoaded = true; return; }
    if (state.googleLoaded) return;
    const key = cfg.GOOGLE_MAPS_WEB_KEY || state.config?.googleMapsWebKey;
    if (!key) throw new Error('Falta configurar la clave SALMOS-WEB de Google Maps.');
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=places`;
      script.async = true; script.defer = true; script.onload = resolve; script.onerror = () => reject(new Error('No se pudo cargar Google Maps.'));
      document.head.appendChild(script);
    });
    state.googleLoaded = true;
  }

  async function setupAddressAutocomplete() {
    await loadGoogle();
    const host = qs('#autocompleteHost');
    if (!host || !state.area) return;
    host.innerHTML = '<label class="detail-label">Calle y altura</label>';
    const { PlaceAutocompleteElement } = await google.maps.importLibrary('places');
    const ac = new PlaceAutocompleteElement({ includedRegionCodes: ['ar'] });
    ac.placeholder = 'Empezá a escribir la calle y altura';
    if (state.area.lat && state.area.lng) ac.locationBias = { center: { lat: state.area.lat, lng: state.area.lng }, radius: 18000 };
    ac.style.width = '100%';
    ac.addEventListener('gmp-select', async (event) => {
      try {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: ['formattedAddress','location','viewport','addressComponents'] });
        const loc = place.location;
        if (!loc) throw new Error('No pudimos ubicar esa dirección.');
        state.shipping.address = place.formattedAddress;
        state.shipping.lat = loc.lat(); state.shipping.lng = loc.lng();
        state.shipping.costCents = 0; state.shipping.distanceKm = null;
        await showMap(state.shipping.lat, state.shipping.lng, state.shipping.address, place.viewport);
      } catch (e) { toast(e.message, 'error'); }
    });
    host.appendChild(ac);
    state.autocomplete = ac;
  }

  async function showMap(lat, lng, address, viewport = null) {
    await loadGoogle();
    const box = qs('#mapBox');
    const confirm = qs('#addressConfirm');
    if (!box || !confirm) return;
    box.classList.remove('hidden'); confirm.classList.remove('hidden');
    const center = { lat:Number(lat), lng:Number(lng) };
    if (!state.googleMap) state.googleMap = new google.maps.Map(box, { center, zoom:17, disableDefaultUI:true, zoomControl:true, gestureHandling:'greedy' });
    else { state.googleMap.setCenter(center); state.googleMap.setZoom(17); }
    if (viewport) state.googleMap.fitBounds(viewport);
    if (state.googleMarker) state.googleMarker.setMap(null);
    state.googleMarker = new google.maps.Marker({ position:center, map:state.googleMap, draggable:true, animation:google.maps.Animation.DROP });
    state.googleMarker.addListener('dragend', async e => {
      const p = e.latLng;
      state.shipping.lat = p.lat(); state.shipping.lng = p.lng(); state.shipping.costCents = 0;
      try {
        const r = await api('/api/geo/reverse', { method:'POST', body:JSON.stringify({ lat:state.shipping.lat, lng:state.shipping.lng }) });
        state.shipping.address = r.formattedAddress || state.shipping.address;
        confirm.innerHTML = `<strong>Confirmá el punto:</strong><br>${escapeHtml(state.shipping.address || '')}`;
      } catch { confirm.innerHTML = '<strong>Confirmá el punto marcado en el mapa.</strong>'; }
      renderMotoQuoteButton();
    });
    confirm.innerHTML = `<strong>Confirmá el punto:</strong><br>${escapeHtml(address || '')}`;
    renderMotoQuoteButton();
  }

  function renderMotoQuoteButton() {
    const host = qs('#quoteHost');
    if (!host) return;
    if (!state.shipping.lat || !state.shipping.lng) { host.innerHTML=''; return; }
    host.innerHTML = state.shipping.costCents ? `<div class="quote-box"><div><strong>${state.shipping.distanceKm} km</strong><div class="stock-note">Entrega estimada ${state.config?.shipping?.moto?.minHours || 1}–${state.config?.shipping?.moto?.maxHours || 4} h</div></div><strong class="price">${money(state.shipping.costCents)}</strong></div><div style="margin-top:9px"><a class="btn btn-ghost full" target="_blank" rel="noopener" href="${motoWhatsappUrl()}">Consultar demora por WhatsApp</a></div>` : `<button class="btn btn-primary full" id="quoteMotoBtn">Calcular motomensajería</button>`;
    const toSummary = qs('#toSummaryBtn'); if (toSummary) toSummary.disabled = !state.shipping.costCents;
  }

  async function quoteMoto() {
    const data = await api('/api/shipping/moto/quote', { method:'POST', body:JSON.stringify({ destination:{ lat:state.shipping.lat, lng:state.shipping.lng, address:state.shipping.address } }) });
    state.shipping.distanceKm = data.distanceKm; state.shipping.costCents = data.costCents; state.shipping.quoteId = data.quoteId;
    renderMotoQuoteButton();
  }

  function motoWhatsappUrl() {
    const whatsapp = state.config?.whatsapp || cfg.STORE_WHATSAPP || '5491162691341';
    const orderTxt = state.order?.code ? ` ${state.order.code}` : '';
    const msg = `Hola, quiero consultar la demora de motomensajería para mi pedido${orderTxt}. Dirección: ${state.shipping.address || ''}. Distancia calculada: ${state.shipping.distanceKm || ''} km.`;
    return `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) throw new Error('Tu dispositivo no permite obtener ubicación.');
    const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('No pudimos obtener tu ubicación. Revisá el permiso del navegador.')), { enableHighAccuracy:true, timeout:12000, maximumAge:60000 }));
    const lat=pos.coords.latitude, lng=pos.coords.longitude;
    const data = await api('/api/geo/reverse', { method:'POST', body:JSON.stringify({ lat,lng }) });
    state.area = { query: data.locality || data.postalCode || 'Ubicación actual', lat, lng };
    state.shipping.address = data.formattedAddress; state.shipping.lat=lat; state.shipping.lng=lng; state.shipping.costCents=0;
    await setupAddressAutocomplete();
    await showMap(lat,lng,data.formattedAddress);
  }

  function renderCheckoutSummary() {
    const subtotal = cartSubtotal(), total = subtotal + state.shipping.costCents;
    qs('#checkoutContent').innerHTML = `
      <h2>Revisá tu compra</h2><div class="checkout-sub">Antes de pagar, confirmá que esté todo correcto.</div>
      <div class="summary-list">${state.cart.map(x=>`<div class="summary-item"><div><strong>${escapeHtml(x.name)}</strong><br><small>${escapeHtml([x.color,x.size].filter(Boolean).join(' · '))} · x${x.qty}</small></div><strong>${money(x.priceCents*x.qty)}</strong></div>`).join('')}</div>
      <div style="margin-top:16px"><div class="total-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div><div class="total-row"><span>Envío</span><strong>${state.shipping.costCents ? money(state.shipping.costCents) : 'Gratis'}</strong></div><div class="total-row grand"><span>Total</span><strong>${money(total)}</strong></div></div>
      <div class="notice" style="margin-top:14px"><strong>${shippingMethodLabel()}</strong><br>${state.shipping.method==='moto' ? `${escapeHtml(state.shipping.address || '')}<br>${state.shipping.distanceKm} km · demora estimada ${state.config?.shipping?.moto?.minHours || 1}–${state.config?.shipping?.moto?.maxHours || 4} h` : ''}</div>
      ${state.shipping.method==='moto' ? `<a class="btn btn-ghost full" style="margin-top:10px" target="_blank" rel="noopener" href="${motoWhatsappUrl()}">Consultar demora por WhatsApp</a>` : ''}
      ${state.auth.user && state.shipping.method==='moto' ? `<label class="account-check save-address-check"><input type="checkbox" id="saveCheckoutAddress"> Guardar esta dirección en Mi cuenta</label>` : ''}
      <div class="checkout-actions"><button class="btn btn-ghost" id="backShippingBtn">Atrás</button><button class="btn btn-primary" id="payBtn">${state.config?.mercadopago?.enabled ? 'Pagar con Mercado Pago' : 'Crear pedido'}</button></div>
      ${!state.config?.mercadopago?.enabled ? '<div class="stock-note" style="text-align:right">Mercado Pago quedará activo apenas soporte habilite la visualización de las credenciales.</div>' : ''}`;
  }
  function shippingMethodLabel() { return state.shipping.method === 'moto' ? '🏍️ Motomensajería' : state.shipping.method === 'correo' ? '📦 Correo Argentino' : '📍 Retiro en SALMOS'; }

  async function createOrderAndPay() {
    const btn=qs('#payBtn'); if (btn) { btn.disabled=true; btn.textContent='Procesando...'; }
    try {
      const orderHeaders=new Headers();const customerToken=await currentIdToken().catch(()=> '');if(customerToken)orderHeaders.set('Authorization',`Bearer ${customerToken}`);
      const order = await api('/api/orders', { method:'POST', headers:orderHeaders, body:JSON.stringify({ customer:state.customer, items:state.cart.map(x=>({variantId:x.variantId,quantity:x.qty})), shipping:state.shipping }) });
      state.order = order.order;
      await saveCheckoutAddressIfRequested().catch(err=>console.error(err));
      if (state.config?.mercadopago?.enabled) {
        const pref = await api('/api/payments/mercadopago/preference', { method:'POST', body:JSON.stringify({ orderId:order.order.id }) });
        window.location.href = pref.initPoint;
      } else {
        state.cart=[]; saveCart(false); if(state.auth.user) await syncCartNow([]);
        qs('#checkoutContent').innerHTML = `<div class="empty-state"><strong>Pedido ${escapeHtml(order.order.code)} creado.</strong>El pago online todavía está pendiente de las credenciales de Mercado Pago. El pedido ya quedó registrado para probar el flujo administrativo.</div><div style="margin-top:14px"><button class="btn btn-primary full" id="finishNoPayBtn">Volver a la tienda</button></div>`;
      }
    } catch (err) { toast(err.message,'error'); if(btn){btn.disabled=false;btn.textContent='Intentar nuevamente';} }
  }

  function handlePaymentReturn() {
    const p = new URLSearchParams(location.search);
    const status = p.get('status') || p.get('collection_status');
    const ref = p.get('external_reference');
    if (!status) return;
    if (status === 'approved') { state.cart=[]; saveCart(false); state.paymentApprovedReturn=true; toast(`Pago aprobado${ref ? ` · ${ref}` : ''}`, 'success'); }
    else if (status === 'pending' || status === 'in_process') toast(`Pago pendiente${ref ? ` · ${ref}` : ''}`);
    else toast(`El pago no fue aprobado${ref ? ` · ${ref}` : ''}`, 'error');
    history.replaceState({},'',location.pathname+location.hash);
  }

  function bindEvents() {
    qs('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
    qs('#accountBtn')?.addEventListener('click',()=>openAccount('profile'));
    qs('#favoritesBtn')?.addEventListener('click',()=>openAccount('favorites'));
    qs('#closeAccountBtn')?.addEventListener('click',closeAccount);
    qs('#accountBackdrop')?.addEventListener('click',closeAccount);
    qs('#cartBtn').addEventListener('click', openCart); qs('#footerCartBtn').addEventListener('click', openCart);
    qs('#closeCartBtn').addEventListener('click', closeCart); qs('#drawerBackdrop').addEventListener('click', closeCart);
    qs('#modalBackdrop').addEventListener('click', () => { closeModal('#productModal'); closeModal('#checkoutModal'); });
    qs('#closeCheckoutBtn').addEventListener('click', () => closeModal('#checkoutModal'));
    qs('#checkoutBtn').addEventListener('click', startCheckout);
    qs('#heroShopBtn').addEventListener('click', () => qs('#productos').scrollIntoView({behavior:'smooth'}));
    qs('#clearFiltersBtn').addEventListener('click', () => { state.activeCategory='all'; state.query=''; qs('#searchInput').value=''; renderCategories(); renderProducts(); });
    qs('#searchInput').addEventListener('input', e => { state.query=e.target.value; renderProducts(); });
    qs('#year').textContent = new Date().getFullYear();

    document.addEventListener('click', async e => {
      const fav=e.target.closest('[data-favorite-product]');if(fav){e.preventDefault();e.stopPropagation();await toggleFavorite(fav.dataset.favoriteProduct);return;}
      if(e.target.id==='googleSignInBtn'||e.target.id==='checkoutGoogleBtn'){await signInGoogle();return;}
      if(e.target.id==='signOutBtn'){await signOutGoogle();return;}
      const tab=e.target.closest('[data-account-tab]');if(tab){state.accountTab=tab.dataset.accountTab;renderAccountPanel();return;}
      if(e.target.id==='saveProfileBtn'){try{await saveProfile()}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='validateSaveAddressBtn'){await validateAndSaveAddress();return;}
      const def=e.target.closest('[data-default-address]');if(def){const a=state.auth.addresses.find(x=>Number(x.id)===Number(def.dataset.defaultAddress));if(a){try{await authApi(`/api/account/addresses/${a.id}`,{method:'PUT',body:JSON.stringify({label:a.label,recipientName:a.recipient_name,phone:a.phone,formattedAddress:a.formatted_address,lat:a.lat,lng:a.lng,notes:a.notes,isDefault:true})});await refreshAccount()}catch(err){toast(err.message,'error')}}return;}
      const del=e.target.closest('[data-delete-address]');if(del){try{await authApi(`/api/account/addresses/${del.dataset.deleteAddress}`,{method:'DELETE'});await refreshAccount();toast('Dirección eliminada','success')}catch(err){toast(err.message,'error')}return;}
      const af=e.target.closest('[data-open-favorite]');if(af){closeAccount();await openProduct(Number(af.dataset.openFavorite));return;}
      const useAddr=e.target.closest('[data-use-address]');if(useAddr){const a=state.auth.addresses.find(x=>Number(x.id)===Number(useAddr.dataset.useAddress));if(a){state.shipping.address=a.formatted_address;state.shipping.lat=Number(a.lat);state.shipping.lng=Number(a.lng);state.shipping.costCents=0;state.shipping.distanceKm=null;state.area={query:a.label||'Dirección guardada',lat:Number(a.lat),lng:Number(a.lng)};renderShippingDetail();setTimeout(()=>showMap(a.lat,a.lng,a.formatted_address).catch(err=>toast(err.message,'error')),0)}return;}
      const card=e.target.closest('.product-card'); if(card){ openProduct(Number(card.dataset.productId)); return; }
      if(e.target.closest('[data-close-product]')) { closeModal('#productModal'); return; }
      const thumb=e.target.closest('[data-image]'); if(thumb){ qsa('.thumb',qs('#productModal')).forEach(x=>x.classList.remove('active')); thumb.classList.add('active'); const img=qs('#detailMainImage'); if(img) img.src=thumb.dataset.image; return; }
      const color=e.target.closest('[data-color]'); if(color){ state.selectedColor=color.dataset.color; const v=firstAvailableVariant(state.selectedProduct,state.selectedColor); state.selectedVariantId=v?.id||null; renderProductModal(); return; }
      const variant=e.target.closest('[data-variant]'); if(variant){ state.selectedVariantId=Number(variant.dataset.variant); renderProductModal(); return; }
      if(e.target.closest('[data-add-cart]')) { addSelectedToCart(false); return; }
      if(e.target.closest('[data-buy-now]')) { addSelectedToCart(true); return; }
      const qty=e.target.closest('[data-qty]'); if(qty){ const i=Number(qty.dataset.index), d=Number(qty.dataset.qty), item=state.cart[i]; if(!item)return; item.qty=Math.max(1,Math.min(item.maxStock||99,item.qty+d)); saveCart(); return; }
      const rem=e.target.closest('[data-remove]'); if(rem){ state.cart.splice(Number(rem.dataset.remove),1); saveCart(); return; }
      if(e.target.id==='toShippingBtn'){
        const name=qs('#customerName').value.trim(), phone=qs('#customerPhone').value.trim(), email=qs('#customerEmail').value.trim();
        if(name.length<3 || phone.length<6){toast('Completá nombre y WhatsApp.','error');return;}
        state.customer={name,phone,email:state.auth.user?.email||email}; localStorage.setItem('salmos_customer',JSON.stringify(state.customer)); if(state.auth.user)authApi('/api/account/profile',{method:'PUT',body:JSON.stringify({displayName:name,phone})}).catch(()=>{}); state.checkoutStep=2; renderCheckout(); return;
      }
      if(e.target.id==='backCustomerBtn'){state.checkoutStep=1;renderCheckout();return;}
      const ship=e.target.closest('[data-shipping]'); if(ship && !ship.disabled){ state.shipping={method:ship.dataset.shipping,costCents:0,distanceKm:null,address:null,lat:null,lng:null,quoteId:null}; renderCheckout(); return; }
      if(e.target.id==='resolveAreaBtn'){ try{e.target.disabled=true;await resolveArea(qs('#areaInput').value);}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;} return; }
      if(e.target.id==='useLocationBtn'){ try{e.target.disabled=true;await useCurrentLocation();}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;} return; }
      if(e.target.id==='quoteMotoBtn'){ try{e.target.disabled=true;e.target.textContent='Calculando...';await quoteMoto();}catch(err){toast(err.message,'error');e.target.disabled=false;e.target.textContent='Calcular motomensajería';} return; }
      if(e.target.id==='toSummaryBtn'){ if(!state.shipping.method) return; if(state.shipping.method==='moto'&&!state.shipping.costCents){toast('Primero calculá la motomensajería.','error');return;} state.checkoutStep=3;renderCheckout();return; }
      if(e.target.id==='backShippingBtn'){state.checkoutStep=2;renderCheckout();return;}
      if(e.target.id==='payBtn'){await createOrderAndPay();return;}
      if(e.target.id==='finishNoPayBtn'){closeModal('#checkoutModal');return;}
    });
  }

  async function boot() {
    initTheme(); ensureAccountUi(); bindEvents(); handlePaymentReturn();
    await Promise.all([loadStore(), initFirebaseAuth()]);
  }
  boot();
})();
