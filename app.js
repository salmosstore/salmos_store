(() => {
  'use strict';

  const cfg = window.SALMOS_CONFIG || {};
  const API = (cfg.API_BASE_URL || '').replace(/\/$/, '');
  const apiUrl = (path) => `${API}${path}`;
  const money = (cents = 0) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format((Number(cents) || 0) / 100);
  const escapeHtml = (v = '') => String(v).replace(/[&<>'"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[s]));
  const qs = (s, root = document) => root.querySelector(s);
  const qsa = (s, root = document) => [...root.querySelectorAll(s)];

  function productPathSegment(value='') {
    return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/[^A-Za-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function productPathKey(value='') { return productPathSegment(value).toLowerCase(); }
  function productSharePath(product) { return `/${productPathSegment(product?.name||product?.slug||'producto')}`; }
  function productShareUrl(product) { return `${location.origin}${productSharePath(product)}`; }
  function currentProductPathKey() {
    const raw=decodeURIComponent(location.pathname||'/').replace(/^\/+|\/+$/g,'');
    if(!raw || /^(index\.html?|admin\.html?|404\.html?)$/i.test(raw) || raw.includes('/')) return '';
    return productPathKey(raw);
  }
  function setProductPath(product) {
    if(!product)return;
    const path=productSharePath(product);
    if(location.pathname!==path) history.replaceState({salmosProduct:Number(product.id)||null},'',path+location.search+location.hash);
  }
  function clearProductPath() {
    if(currentProductPathKey()) history.replaceState({},'',`/${location.search}${location.hash}`);
  }

  function checkoutToken() {
    let token = localStorage.getItem('salmos_checkout_token') || '';
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(token)) {
      token = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g,'');
      localStorage.setItem('salmos_checkout_token', token);
    }
    return token;
  }

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
    checkoutToken: checkoutToken(),
    pendingCheckout: loadJSON('salmos_pending_checkout', null),
    selectedProduct: null,
    selectedColor: null,
    selectedVariantId: null,
    checkoutStep: 1,
    customer: loadJSON('salmos_customer', { name: '', phone: '', email: '' }),
    shipping: { method: null, costCents: 0, distanceKm: null, address: null, lat: null, lng: null, quoteId: null, correo: null },
    checkoutQuoteOnly: false,
    shippingQuoteCarry: false,
    googleLoaded: false,
    googleMap: null,
    googleMarker: null,
    autocomplete: null,
    placesLib: null,
    areaSessionToken: null,
    streetSessionToken: null,
    area: null,
    coupon: null,
    order: null,
    flyers: [],
    designCatalog: [],
    designCatalogLoaded: false,
    designCatalogPromise: null,
    shippingQueriesRemaining: null,
    correoAgencies: [],
    correoAgenciesLoading: false,
    correoAddressSuggestions: [],
    correoAgencySuggestions: [],
    correoAgencyArea: null,
    correoFilterArea: null,
    correoMap: null,
    correoMapMarkers: [],
    correoMapPreview: null,
    correoSuggestTimer: null,
    correoLastParcel: null
  };

  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }

  const LAST_SHIPPING_KEY = 'salmos_last_shipping';
  function localDayKey() {
    const d=new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function readLastShipping() {
    const saved=loadJSON(LAST_SHIPPING_KEY,null);
    if(!saved || !saved.address || !Number.isFinite(Number(saved.lat)) || !Number.isFinite(Number(saved.lng))) return null;
    return saved;
  }
  function saveLastShipping({withQuote=false,carry=state.shippingQuoteCarry}={}) {
    if(!state.shipping.address || !Number.isFinite(Number(state.shipping.lat)) || !Number.isFinite(Number(state.shipping.lng))) return;
    const previous=readLastShipping();
    const sameAddress=Boolean(previous && String(previous.address).trim().toLowerCase()===String(state.shipping.address).trim().toLowerCase()
      && Math.abs(Number(previous.lat)-Number(state.shipping.lat))<0.00001
      && Math.abs(Number(previous.lng)-Number(state.shipping.lng))<0.00001);
    const keepPreviousQuote=Boolean(!withQuote && sameAddress && previous.quotedDay===localDayKey() && Number(previous.costCents)>0);
    const payload={
      address:state.shipping.address,
      lat:Number(state.shipping.lat),
      lng:Number(state.shipping.lng),
      area:state.area||null,
      costCents:withQuote ? Number(state.shipping.costCents)||0 : keepPreviousQuote ? Number(previous.costCents)||0 : 0,
      distanceKm:withQuote ? state.shipping.distanceKm : keepPreviousQuote ? previous.distanceKm : null,
      quoteId:withQuote ? state.shipping.quoteId : keepPreviousQuote ? previous.quoteId : null,
      quotedDay:withQuote && Number(state.shipping.costCents)>0 ? localDayKey() : keepPreviousQuote ? previous.quotedDay : null,
      carryToCart:withQuote ? Boolean(carry && Number(state.shipping.costCents)>0) : keepPreviousQuote ? Boolean(previous.carryToCart) : false
    };
    localStorage.setItem(LAST_SHIPPING_KEY,JSON.stringify(payload));
  }
  function updateSavedShippingCarry(carry) {
    const saved=readLastShipping();
    if(!saved)return;
    saved.carryToCart=Boolean(carry && saved.quotedDay===localDayKey() && Number(saved.costCents)>0);
    localStorage.setItem(LAST_SHIPPING_KEY,JSON.stringify(saved));
  }
  function restoreLastShipping({activateMoto=false,allowQuote=true,restoreCarry=false}={}) {
    const saved=readLastShipping();
    if(!saved)return false;
    const quoteValid=allowQuote && saved.quotedDay===localDayKey() && Number(saved.costCents)>0;
    state.area=saved.area||state.area;
    state.shipping={
      method:activateMoto?'moto':null,
      costCents:quoteValid?Number(saved.costCents):0,
      distanceKm:quoteValid?saved.distanceKm:null,
      address:saved.address,
      lat:Number(saved.lat),
      lng:Number(saved.lng),
      quoteId:quoteValid?saved.quoteId:null
    };
    if(restoreCarry && quoteValid && saved.carryToCart && state.cart.length){
      state.shipping.method='moto';
      state.shippingQuoteCarry=true;
    }
    return true;
  }
  function sameSavedShippingAddress(saved=readLastShipping()) {
    if(!saved || !state.shipping.address)return false;
    return String(saved.address).trim().toLowerCase()===String(state.shipping.address).trim().toLowerCase()
      && Math.abs(Number(saved.lat)-Number(state.shipping.lat))<0.00001
      && Math.abs(Number(saved.lng)-Number(state.shipping.lng))<0.00001;
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
    if (!headers.has('X-Salmos-Checkout-Token')) headers.set('X-Salmos-Checkout-Token', state.checkoutToken);
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
    // SALMOS siempre abre en oscuro. El usuario puede cambiar a claro durante la sesión.
    setTheme('dark');
  }


  function loadScriptOnce(src) {
    return new Promise((resolve,reject)=>{
      const old=[...document.scripts].find(s=>s.src===src);
      if(old){ if(old.dataset.loaded==='1') return resolve(); old.addEventListener('load',resolve,{once:true}); old.addEventListener('error',reject,{once:true}); return; }
      const s=document.createElement('script');s.src=src;s.async=true;s.dataset.loaded='0';s.onload=()=>{s.dataset.loaded='1';resolve()};s.onerror=()=>reject(new Error('No se pudo cargar el acceso con Google.'));document.head.appendChild(s);
    });
  }

  async function ensurePlacesLibrary() {
    if (state.placesLib) return state.placesLib;
    const key = state.config?.googleMapsWebKey || cfg.GOOGLE_MAPS_WEB_KEY || '';
    if (!key) throw new Error('Google Places no está configurado para la tienda.');

    const hasImportLibrary = () => typeof window.google?.maps?.importLibrary === 'function';
    const hasAutocompleteSuggestion = () => !!window.google?.maps?.places?.AutocompleteSuggestion;

    if (!hasImportLibrary() && !hasAutocompleteSuggestion()) {
      const src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&libraries=places`;
      await new Promise((resolve,reject)=>{
        const existing=[...document.scripts].find(x=>x.src.includes('maps.googleapis.com/maps/api/js'));
        if(existing){
          // Si ya existe un script de Maps, esperamos brevemente a que termine de exponer Places.
          let attempts=0;
          const wait=()=>{
            if(hasImportLibrary() || hasAutocompleteSuggestion()) return resolve();
            if(++attempts>=30) return reject(new Error('Google Places se cargó incompleto. Recargá la página.'));
            setTimeout(wait,100);
          };
          wait();
          return;
        }
        const el=document.createElement('script');el.src=src;el.async=true;el.defer=true;
        el.onload=()=>{
          let attempts=0;
          const wait=()=>{
            if(hasImportLibrary() || hasAutocompleteSuggestion()) return resolve();
            if(++attempts>=30) return reject(new Error('Google Places se cargó incompleto. Recargá la página.'));
            setTimeout(wait,100);
          };
          wait();
        };
        el.onerror=()=>reject(new Error('No se pudo cargar Google Places.'));
        document.head.appendChild(el);
      });
    }

    // Primero usamos Places ya expuesto por el script. Evita llamar importLibrary cuando
    // Google dejó una propiedad con ese nombre que no es una función.
    if (hasAutocompleteSuggestion()) {
      state.placesLib = google.maps.places;
      return state.placesLib;
    }
    if (hasImportLibrary()) {
      state.placesLib = await google.maps.importLibrary('places');
      return state.placesLib;
    }
    throw new Error('Google Places se cargó incompleto. Recargá la página.');
  }

  function normalizeSearch(v='') {
    return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }

  function expandedSearch(v='') {
    return normalizeSearch(v)
      .replace(/^sta\b/,'santa')
      .replace(/^sto\b/,'santo')
      .replace(/^av\b/,'avenida');
  }

  function viewportLiteral(vp) {
    if (!vp) return null;
    try {
      const ne = typeof vp.getNorthEast === 'function' ? vp.getNorthEast() : null;
      const sw = typeof vp.getSouthWest === 'function' ? vp.getSouthWest() : null;
      if (ne && sw) return { north:ne.lat(), east:ne.lng(), south:sw.lat(), west:sw.lng() };
      if ([vp.north,vp.east,vp.south,vp.west].every(Number.isFinite)) return vp;
    } catch {}
    return null;
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
    headers.set('X-Salmos-Checkout-Token', state.checkoutToken);
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
    if(actions && !qs('#accountBtn')){
      const acc=document.createElement('button');acc.className='icon-btn account-btn';acc.id='accountBtn';acc.title='Mi cuenta';acc.setAttribute('aria-label','Mi cuenta');acc.innerHTML=`<span id="accountButtonContent"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>`;
      const cart=qs('#cartBtn');actions.insertBefore(acc,cart||null);
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
    const favoritesBtn=qs('#favoritesBtn');if(favoritesBtn)favoritesBtn.classList.toggle('hidden',!state.auth.user);
    const n=state.auth.favoriteIds.size;if(badge){badge.textContent=n;badge.classList.toggle('hidden',!state.auth.user||!n);}
    const adminLink=qs('#adminOnlyLink');if(adminLink){const adminEmail=String(cfg.ADMIN_EMAIL||'salmos.store7@gmail.com').toLowerCase();const allowed=Boolean(state.auth.user?.email && state.auth.user.email.toLowerCase()===adminEmail);adminLink.classList.toggle('hidden',!allowed);}
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

  async function loadPublicFlyers() {
    const launch=qs('#flyersLaunchBtn'),section=qs('#flyersSection'),host=qs('#flyerScroll');
    if(!launch||!section||!host)return;
    try{
      const d=await api('/api/flyers');state.flyers=d.items||[];
      launch.classList.toggle('hidden',!state.flyers.length);
      if(!state.flyers.length){section.classList.add('hidden');host.innerHTML='';return;}
      host.innerHTML=state.flyers.map(f=>`<article class="flyer-card"><div class="flyer-media">${String(f.mime_type||'').startsWith('video/')?`<video src="${escapeHtml(f.url)}" controls playsinline preload="metadata"></video>`:String(f.mime_type||'').includes('pdf')?`<a class="flyer-pdf" href="${escapeHtml(f.url)}" target="_blank" rel="noopener">PDF<br><small>${escapeHtml(f.title||'Flyer')}</small></a>`:`<img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.title||'Flyer SALMOS')}">`}</div><div class="flyer-actions"><strong>${escapeHtml(f.title||'SALMOS')}</strong><button class="btn btn-ghost" data-share-flyer="${f.id}">Compartir</button></div></article>`).join('');
    }catch(err){console.error(err);launch.classList.add('hidden');section.classList.add('hidden');}
  }
  async function shareFlyer(id){
    const f=state.flyers.find(x=>Number(x.id)===Number(id));if(!f)return;
    try{
      if(navigator.share){
        try{
          const r=await fetch(f.url);const blob=await r.blob();const ext=(f.title||'flyer').split('.').pop();const file=new File([blob],f.file_name||`salmos-flyer.${ext}`,{type:f.mime_type||blob.type||'application/octet-stream'});
          if(navigator.canShare?.({files:[file]})){await navigator.share({title:f.title||'SALMOS',files:[file]});return;}
        }catch(err){if(err?.name==='AbortError')return;}
        await navigator.share({title:f.title||'SALMOS',text:'SALMOS · creer · amar · crear',url:f.url});return;
      }
      await navigator.clipboard.writeText(f.url);toast('Link del flyer copiado','success');
    }catch(err){if(err?.name!=='AbortError')toast('No pudimos compartir este flyer.','error');}
  }

  function renderSkeletons() {
    const grid=qs('#productGrid');if(grid)grid.innerHTML='';
    document.body.classList.add('store-pending');
    qs('#porPedido')?.classList.add('hidden');
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
      document.body.classList.remove('store-pending');
      qs('#porPedido')?.classList.remove('hidden');
      renderCategories();
      renderProducts();
      renderFeatured();
      renderCart();
      const whatsapp = state.config?.whatsapp || cfg.STORE_WHATSAPP || '5491162691341';
      const wa=qs('#footerWhatsapp');if(wa)wa.href = `https://wa.me/${whatsapp}`;
      await loadPublicFlyers().catch(err=>console.error('Flyers',err));
      await openProductFromCurrentPath();
    } catch (err) {
      console.error(err);
      const grid=qs('#productGrid');if(grid)grid.innerHTML='';
      qs('#porPedido')?.classList.add('hidden');
      // Si la API tarda o falla, no mostramos estados vacíos que parezcan falta de stock.
      // La cabecera y el bloque de WhatsApp/cotización siguen disponibles.
    }
  }

  function renderCategories() {
    const rows=[qs('#categoryRow'),qs('#desktopCategoryRow')].filter(Boolean);
    const mobileBar=qs('#categoryBar');
    const desktopNav=qs('#desktopCategoryNav');
    if(!rows.length) return;
    const visibleCategories = state.categories;
    const activeSlugs = new Set(visibleCategories.map(c => c.slug));
    const showBar = visibleCategories.length > 1;
    if(mobileBar) mobileBar.classList.toggle('hidden', !showBar);
    if(desktopNav) desktopNav.classList.toggle('hidden', !showBar);
    if (!showBar || (state.activeCategory !== 'all' && !activeSlugs.has(state.activeCategory))) state.activeCategory = 'all';
    const html=showBar ? (`<button class="chip ${state.activeCategory==='all'?'active':''}" data-category="all">Todo</button>` + visibleCategories.map(c => `<button class="chip ${state.activeCategory===c.slug?'active':''}" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`).join('')) : '';
    rows.forEach(row=>{
      row.innerHTML=html;
      if(row.dataset.bound==='1')return;
      row.dataset.bound='1';
      row.addEventListener('click', e => {
        const btn = e.target.closest('[data-category]');
        if (!btn) return;
        state.activeCategory = btn.dataset.category;
        qsa('[data-category]',document).forEach(x => x.classList.toggle('active', x.dataset.category===state.activeCategory));
        renderProducts();
        qs('#productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
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
    const tags = [p.is_new ? '<span class="tag gold">NUEVO</span>' : '', p.is_bestseller ? '<span class="tag">MÁS VENDIDO</span>' : '', Number(p.available_stock)<=0 ? '<span class="tag">AGOTADO</span>' : ''].join('');
    return `<article class="product-card" data-product-id="${p.id}" data-sale-mode="${escapeHtml(p.sale_mode||'stock')}">
      <div class="product-media">${image}<div class="product-tags">${tags}</div><button class="favorite-btn ${state.auth.favoriteIds.has(Number(p.id))?'active':''}" data-favorite-product="${p.id}" aria-label="Guardar en favoritos" title="Favorito"><svg class="favorite-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" fill="currentColor"/></svg></button></div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="price-row"><span class="price">${money(p.price_cents)}</span>${p.compare_at_cents > p.price_cents ? `<span class="price-old">${money(p.compare_at_cents)}</span>` : ''}</div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const items = filteredProducts();
    const stockItems=items.filter(p=>p.sale_mode!=='order');
    const orderItems=items.filter(p=>p.sale_mode==='order');
    const title = state.activeCategory === 'all' ? 'Productos' : (state.categories.find(c => c.slug === state.activeCategory)?.name || 'Productos');
    const t=qs('#productsTitle'),sub=qs('#productsSubtitle'),clear=qs('#clearFiltersBtn');
    if(t)t.textContent = state.query ? `Resultados para “${state.query}”` : title;
    if(sub)sub.textContent = items.length ? `${items.length} ${items.length === 1 ? 'producto' : 'productos'}` : 'No encontramos productos con ese filtro.';
    if(clear)clear.classList.toggle('hidden', state.activeCategory === 'all' && !state.query);
    const grid=qs('#productGrid'),orderGrid=qs('#orderProductGrid'),productsSection=qs('#productos');
    const filtering=Boolean(state.query || state.activeCategory!=='all');
    if(grid)grid.innerHTML = stockItems.length ? stockItems.map(productCard).join('') : (filtering?`<div class="empty-state" style="grid-column:1/-1"><strong>No encontramos productos con ese filtro.</strong>Probá otra búsqueda.</div>`:'');
    if(productsSection)productsSection.classList.toggle('hidden',!stockItems.length&&!filtering);
    if(orderGrid)orderGrid.innerHTML=orderItems.map(productCard).join('');
  }

  function renderFeatured() {
    const section=qs('#featuredSection');if(section)section.classList.add('hidden');
    const grid=qs('#featuredGrid');if(grid)grid.innerHTML='';
  }

  async function openProduct(id, options={}) {
    try {
      const data = await api(`/api/products/${id}`);
      const p = data.item;
      state.selectedProduct = p;
      state.selectedColor = p.colors?.[0] || null;
      state.selectedVariantId = firstAvailableVariant(p, state.selectedColor)?.id || null;
      renderProductModal();
      openModal('#productModal');
      if(options.updatePath!==false) setProductPath(p);
      return p;
    } catch (err) { toast(err.message, 'error'); return null; }
  }

  async function openProductFromCurrentPath() {
    const key=currentProductPathKey();
    if(!key)return;
    const found=state.products.find(p=>productPathKey(p.name)===key || productPathKey(p.slug)===key);
    if(found){await openProduct(found.id,{updatePath:false});return;}
    // Si el enlace quedó viejo por un cambio de nombre, no rompemos la tienda.
    toast('Ese producto no está disponible o el enlace cambió.','error');
  }

  function isMobileShareDevice() {
    return Boolean(
      navigator.userAgentData?.mobile ||
      /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') ||
      (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth < 900)
    );
  }

  async function copyLink(text, successMessage='Link copiado') {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('Clipboard API no disponible');
      }
    } catch {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      input.style.pointerEvents = 'none';
      document.body.appendChild(input);
      input.select();
      input.setSelectionRange(0, input.value.length);
      const ok = document.execCommand?.('copy');
      input.remove();
      if (!ok) throw new Error('No se pudo copiar');
    }
    toast(successMessage, 'success');
  }

  async function fetchShareFile(url, name='salmos') {
    try {
      const res = await fetch(url, { cache:'force-cache' });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) return null;
      const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
      return new File([blob], `${productPathSegment(name) || 'salmos'}.${ext}`, { type: blob.type });
    } catch {
      return null;
    }
  }

  async function sharePage() {
    const url = `${location.origin}/`;
    const title = 'SALMOS — Tienda';
    const text = 'SALMOS · creer · amar · crear · remeras y más';

    // En PC priorizamos algo que siempre funcione: copiar el enlace.
    if (!isMobileShareDevice() || !navigator.share) {
      try { await copyLink(url, 'Link de SALMOS copiado'); }
      catch { toast(url); }
      return;
    }

    try {
      const file = await fetchShareFile(`${location.origin}/banner-salmos.png`, 'salmos');
      if (file && navigator.canShare?.({ files:[file] })) {
        await navigator.share({ title, text:`${text}\n${url}`, files:[file] });
        return;
      }
      await navigator.share({ title, text, url });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      try { await copyLink(url, 'Link de SALMOS copiado'); }
      catch { toast(url); }
    }
  }

  async function shareSelectedProduct() {
    const p=state.selectedProduct;if(!p)return;
    const url=productShareUrl(p);
    const verse=[p.verse_text,p.verse_reference].filter(Boolean).join('\n');
    const text=[
      `Mirá ${p.name} en SALMOS`,
      url,
      verse
    ].filter(Boolean).join('\n\n');

    // En PC copiamos directamente el enlace del producto.
    // No dependemos del menú de compartir de Chrome/Windows.
    if (!isMobileShareDevice()) {
      try { await copyLink(url, 'Link del producto copiado'); }
      catch { toast(url); }
      return;
    }

    // En celular mantenemos FOTO + NOMBRE + LINK + VERSÍCULO.
    // No enviamos además el parámetro "url" cuando va la foto,
    // porque WhatsApp terminaba mostrando el enlace dos veces.
    if (navigator.share) {
      try {
        const imageUrl = firstProductImage(p);
        const file = imageUrl ? await fetchShareFile(imageUrl, `${p.name}-salmos`) : null;

        if (file && navigator.canShare?.({ files:[file] })) {
          await navigator.share({
            title:`${p.name} · SALMOS`,
            text,
            files:[file]
          });
          return;
        }

        // Si ese celular no admite compartir la foto como archivo,
        // compartimos el mismo contenido una sola vez.
        await navigator.share({
          title:`${p.name} · SALMOS`,
          text
        });
        return;
      } catch (err) {
        if (err?.name==='AbortError') return;
      }
    }

    try { await copyLink(url, 'Link del producto copiado'); }
    catch { toast(url); }
  }

  function firstAvailableVariant(p, color) {
    return (p.variants || []).find(v => (!color || v.color === color) && Number(v.available_stock) > 0) || null;
  }

  function detailMediaType(item) {
    if (item?.media_type) return item.media_type === 'video' ? 'video' : 'image';
    return /\.(mp4|webm|mov|m4v|ogv)(?:$|\?)/i.test(String(item?.r2_key || item?.url || '')) ? 'video' : 'image';
  }
  function renderDetailMedia(item, productName='SALMOS') {
    if (!item?.url) return '<div class="product-placeholder">SALMOS</div>';
    if (detailMediaType(item) === 'video') return `<video class="detail-main-video" src="${escapeHtml(item.url)}" controls playsinline preload="metadata" aria-label="Video de ${escapeHtml(productName)}"></video>`;
    return `<img class="detail-main-image" src="${escapeHtml(item.url)}" alt="${escapeHtml(item.alt_text || productName)}">`;
  }
  function firstProductImage(p) {
    return (p?.images || []).find(item => detailMediaType(item) === 'image')?.url || '';
  }

  function openProductImageViewer(src, alt='SALMOS') {
    if (!src) return;
    let viewer=qs('#productImageViewer');
    if(!viewer){
      viewer=document.createElement('div');
      viewer.id='productImageViewer';
      viewer.className='product-image-viewer';
      document.body.appendChild(viewer);
    }
    viewer.innerHTML=`<button class="icon-btn product-image-viewer-close" data-close-image-viewer aria-label="Cerrar imagen">×</button><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}">`;
    viewer.classList.add('open');
  }

  function closeProductImageViewer(){
    const viewer=qs('#productImageViewer');
    if(viewer)viewer.classList.remove('open');
  }

  function productUsesSizes(product){
    const key=String(`${product?.category_slug||''} ${product?.category_name||''}`).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return /(remera|camiseta|chomba|buzo|prenda)/.test(key);
  }

  function renderProductModal() {
    const p = state.selectedProduct;
    if (!p) return;
    const media = p.images?.length ? p.images : [{ url: '', alt_text: p.name, media_type:'image' }];
    const availableVariants = (p.variants || []).filter(v => Number(v.available_stock) > 0);
    const activeVariant = availableVariants.find(v => v.id === Number(state.selectedVariantId)) || null;
    const colors = [...new Set(availableVariants.map(v => v.color || '').filter((v,i,a) => a.indexOf(v) === i))];
    if (state.selectedColor && !colors.includes(state.selectedColor)) state.selectedColor = colors[0] || null;
    if (!activeVariant) {
      const fallback = firstAvailableVariant({ variants: availableVariants }, state.selectedColor);
      state.selectedVariantId = fallback?.id || null;
    }
    const selected = availableVariants.find(v => v.id === Number(state.selectedVariantId)) || null;
    const usesSizes=productUsesSizes(p);
    const sizes = usesSizes?[...new Set(availableVariants.filter(v => !state.selectedColor || v.color === state.selectedColor).map(v => String(v.size||'').trim()).filter(Boolean))]:[];
    const attributeCells=[];
    if(usesSizes)attributeCells.push(`<div class="product-attribute-cell product-attribute-size"><span class="detail-label">Talle</span><div class="attribute-options">${sizes.length?sizes.map(size => { const v=availableVariants.find(v => (v.color||'') === (state.selectedColor||'') && String(v.size||'').trim()===size) || availableVariants.find(v => !state.selectedColor && String(v.size||'').trim()===size); return `<button class="option compact-option ${v?.id===Number(state.selectedVariantId)?'active':''}" data-variant="${v?.id||''}">${escapeHtml(size)}</button>`; }).join(''):'<span class="attribute-static attribute-chip">—</span>'}</div></div>`);
    if(usesSizes&&p.fit)attributeCells.push(`<div class="product-attribute-cell product-attribute-fit"><span class="detail-label">Corte</span><span class="attribute-static attribute-chip">${escapeHtml(p.fit)}</span></div>`);
    if(colors.length)attributeCells.push(`<div class="product-attribute-cell product-attribute-color"><span class="detail-label">Color</span><div class="attribute-options">${colors.map(c=>`<button class="option compact-option ${c===state.selectedColor?'active':''}" data-color="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div></div>`);
    const modal = qs('#productModal');
    modal.innerHTML = `
      <div class="product-modal-topbar"><button class="icon-btn modal-close product-modal-close" data-close-product aria-label="Cerrar">×</button></div>
      <div class="product-detail product-detail-v4">
        <div class="detail-gallery detail-gallery-scroll">
          <div class="detail-media-strip" id="detailMediaStrip">${media.map((im,i)=>`<div class="detail-media-slide" data-slide="${i}">${renderDetailMedia(im,p.name)}</div>`).join('')}</div>
          <button class="favorite-btn detail-favorite ${state.auth.favoriteIds.has(Number(p.id))?'active':''}" data-favorite-product="${p.id}" aria-label="Guardar en favoritos"><svg class="favorite-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" fill="currentColor"/></svg></button>
          ${media.length>1?`<div class="media-dots">${media.map((_,i)=>`<span class="${i===0?'active':''}"></span>`).join('')}</div>`:''}
        </div>
        <div class="detail-info detail-info-v4">
          <h2>${escapeHtml(p.name)}</h2>
          <div class="price-row detail-price-centered"><span class="price">${money(p.price_cents)}</span>${p.compare_at_cents > p.price_cents ? `<span class="price-old">${money(p.compare_at_cents)}</span>` : ''}</div>
          ${attributeCells.length?`<div class="product-attribute-line" aria-label="Opciones del producto">${attributeCells.join('')}</div>`:''}
          ${p.verse_text ? `<div class="detail-verse-centered"><div class="detail-verse-text">${escapeHtml(p.verse_text)}</div>${p.verse_reference ? `<div class="detail-verse-reference">${escapeHtml(p.verse_reference)}</div>` : ''}</div>` : ''}
          <p class="detail-description">${escapeHtml(p.short_description || '')}</p>
          ${p.meaning_text ? `<p class="detail-description detail-meaning-plain">${escapeHtml(p.meaning_text)}</p>` : ''}
          ${!selected?'<div class="stock-note" style="text-align:center"><strong>Sin stock disponible por el momento.</strong></div>':''}
          <div class="detail-actions">
            <button class="btn btn-ghost detail-share-inline" data-share-product type="button" title="Compartir este producto"><span class="detail-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.1M8.7 13.3l6.6 4.1"/></svg></span><span>Compartir</span></button>
            <button class="btn btn-secondary" data-add-cart ${!selected?'disabled':''}><span class="detail-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 10.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 7H6"/></svg></span><span>Agregar al carrito</span></button>
            <button class="btn btn-primary" data-buy-now ${!selected?'disabled':''}><span class="detail-action-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v9H4v-9"/><path d="M2 7h20v5H2zM12 7v14"/><path d="M12 7H8.5A2.5 2.5 0 1 1 11 4.5V7Zm0 0h3.5A2.5 2.5 0 1 0 13 4.5V7Z"/></svg></span><span>Comprar ahora</span></button>
          </div>
        </div>
      </div>`;
    const strip=qs('#detailMediaStrip');
    if(strip && media.length>1){
      strip.addEventListener('scroll',()=>{const i=Math.round(strip.scrollLeft/Math.max(1,strip.clientWidth));qsa('.media-dots span',modal).forEach((d,n)=>d.classList.toggle('active',n===i));},{passive:true});
    }
  }

  function addSelectedToCart(openCheckoutNow = false) {
    const p = state.selectedProduct;
    const v = p?.variants?.find(x => x.id === Number(state.selectedVariantId));
    if (!p || !v || v.available_stock <= 0) return;
    const existing = state.cart.find(x => x.variantId === v.id);
    if (existing) existing.qty = Math.min(existing.qty + 1, v.available_stock);
    else state.cart.push({ productId: p.id, variantId: v.id, name: p.name, color: v.color, size: v.size, priceCents: p.price_cents, qty: 1, maxStock: v.available_stock, image: firstProductImage(p) });
    saveCart();
    closeModal('#productModal');
    toast('Producto agregado al carrito', 'success');
    if (openCheckoutNow) startCheckout(); else openCart();
  }

  function cartVariantLabel(item){return [item?.color,item?.size].map(v=>String(v||'').trim()).filter(Boolean).join(' · ')}

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
        <div class="cart-meta"><strong>${escapeHtml(x.name)}</strong>${cartVariantLabel(x)?`<small>${escapeHtml(cartVariantLabel(x))}</small>`:''}<div class="qty"><button data-qty="-1" data-index="${i}">−</button><b>${x.qty}</b><button data-qty="1" data-index="${i}">+</button></div></div>
        <button class="cart-remove" data-remove="${i}" aria-label="Eliminar">×</button>
      </div>`).join('');
    }
    qs('#cartSubtotal').textContent = money(cartSubtotal());
    renderCartShippingCarry();
    qs('#checkoutBtn').disabled = !state.cart.length;
  }
  function renderCartShippingCarry() {
    const subtotalEl=qs('#cartSubtotal');
    const foot=subtotalEl?.closest('.drawer-foot');
    if(!foot)return;
    let box=qs('#cartShippingCarry',foot);
    const show=Boolean(state.cart.length && state.shippingQuoteCarry && state.shipping.method==='moto' && state.shipping.address && Number(state.shipping.costCents)>0);
    if(!show){box?.remove();return;}
    if(!box){box=document.createElement('div');box.id='cartShippingCarry';box.className='cart-shipping-carry';foot.insertBefore(box,foot.firstChild);}
    box.innerHTML=`<div class="total-row"><span>Envío cotizado</span><strong>${money(state.shipping.costCents)}</strong></div><small>${escapeHtml(state.shipping.address)}</small>`;
  }
  function cartSubtotal() { return state.cart.reduce((sum, x) => sum + x.priceCents * x.qty, 0); }
  function openCart() { qs('#cartDrawer').classList.add('open'); qs('#drawerBackdrop').classList.add('open'); document.body.classList.add('no-scroll'); }
  function closeCart() { qs('#cartDrawer').classList.remove('open'); qs('#drawerBackdrop').classList.remove('open'); document.body.classList.remove('no-scroll'); }

  function openModal(sel) { qs(sel).classList.add('open'); qs('#modalBackdrop').classList.add('open'); document.body.classList.add('no-scroll'); }
  function closeModal(sel) { qs(sel).classList.remove('open'); if(sel==='#productModal'){state.selectedProduct=null;state.selectedColor=null;state.selectedVariantId=null;clearProductPath();} if (!qsa('.modal.open').length) { qs('#modalBackdrop').classList.remove('open'); document.body.classList.remove('no-scroll'); } }

  function startCheckout() {
    if (!state.cart.length) return;
    closeCart();
    state.checkoutQuoteOnly = false;
    state.checkoutStep = 1;
    const keepQuotedShipping = state.shippingQuoteCarry && state.shipping.method === 'moto' && state.shipping.address && Number.isFinite(Number(state.shipping.lat)) && Number.isFinite(Number(state.shipping.lng));
    if (!keepQuotedShipping) restoreLastShipping({activateMoto:false,allowQuote:true});
    state.coupon = null;
    renderCheckout();
    openModal('#checkoutModal');
  }

  function startShippingQuote() {
    closeCart();
    state.checkoutQuoteOnly = true;
    state.checkoutStep = 2;
    const restored=restoreLastShipping({activateMoto:true,allowQuote:true});
    if(!restored) state.shipping = { method: null, costCents: 0, distanceKm: null, address: null, lat: null, lng: null, quoteId: null, correo: null };
    state.coupon = null;
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
      <h2>${state.checkoutQuoteOnly?'Consultá el costo de envío':'Entrega'}</h2><div class="checkout-sub">${state.checkoutQuoteOnly?'Simulá el envío sin producto. Cuando termines, podés agregar una remera y hacer la compra normalmente.':'Elegí cómo querés recibir tu compra.'}</div>
      ${state.checkoutQuoteOnly?'<div class="notice quote-only-notice"><strong>Simulación sin producto</strong><br>La cotización es solo para conocer el costo de entrega; no genera ningún pedido.</div>':''}
      <div class="shipping-options">
        <button class="shipping-card ${state.shipping.method==='moto'?'active':''} ${motoEnabled?'':'disabled'}" data-shipping="moto" ${motoEnabled?'':'disabled'}><span class="shipping-icon">🏍️</span><span class="shipping-copy"><strong>Motomensajería</strong><small>Hasta ${pc.shipping?.moto?.maxKm || 50} km · Horarios de envíos entre las 8 am y las 23 hs con una demora de entre ${pc.shipping?.moto?.minHours || 1} y ${pc.shipping?.moto?.maxHours || 4} horas sujeto a disponibilidad</small></span><span class="shipping-price">${state.shipping.method==='moto' && state.shipping.costCents ? money(state.shipping.costCents) : 'Calcular'}</span></button>
        <button class="shipping-card ${state.shipping.method==='correo'?'active':''} ${correoEnabled?'':'disabled'}" data-shipping="correo" ${correoEnabled?'':'disabled'}><span class="shipping-icon">📦</span><span class="shipping-copy"><strong>Correo Argentino</strong><small>${correoEnabled?`Domicilio o sucursal${pc.shipping?.correo?.testMode?' · entorno de prueba':''}`:'Integración pendiente de habilitación'}</small></span><span class="shipping-price">${state.shipping.method==='correo'&&state.shipping.costCents?money(state.shipping.costCents):(correoEnabled?'Calcular':'Próximamente')}</span></button>
        <button class="shipping-card ${state.shipping.method==='pickup'?'active':''} ${pickupEnabled?'':'disabled'}" data-shipping="pickup" ${pickupEnabled?'':'disabled'}><span class="shipping-icon">📍</span><span class="shipping-copy"><strong>Retiro en SALMOS</strong><small>${pickupEnabled?escapeHtml(pc.shipping.pickup.address || 'Coordinar retiro'):'Se habilitará desde administración'}</small></span><span class="shipping-price">Gratis</span></button>
      </div>
      <div id="shippingDetail"></div>
      ${state.checkoutQuoteOnly?'<div class="checkout-actions quote-only-actions"><button class="btn btn-ghost" id="closeQuoteCheckoutBtn">Cerrar</button><button class="btn btn-primary" id="quoteAddProductBtn">Agregar un producto</button></div>':`<div class="checkout-actions"><button class="btn btn-ghost" id="backCustomerBtn">Atrás</button><button class="btn btn-primary" id="toSummaryBtn" ${state.shipping.method && (state.shipping.method==='pickup' || state.shipping.costCents>0) ? '' : 'disabled'}>Continuar</button></div>`}`;
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
      const conf=state.config?.shipping?.correo||{};
      const ca=state.shipping.correo||{deliveryType:'homeDelivery',state:'',postalCode:'',inputAddress:'',agencyReference:''};
      state.shipping.correo=ca;
      const provinces=Array.isArray(conf.provinces)?conf.provinces:[];
      const provinceOptions=['<option value="">Elegí provincia</option>',...provinces.map(p=>`<option value="${escapeHtml(p.code)}" ${String(ca.state||'')===String(p.code)?'selected':''}>${escapeHtml(p.name)}</option>`)].join('');
      const postal=String(ca.postalCode||'').trim();
      const filterReady=Boolean(ca.state || validCorreoPostal(postal));
      const testNote=conf.testMode?'<div class="notice correo-test-notice"><strong>Modo de prueba</strong><br>La tarifa que ves es provisoria para probar el flujo. No es una tarifa comercial de Correo Argentino.</div>':'';
      const filters=`<div class="correo-location-filter"><div class="field"><label>Provincia</label><select class="select" id="correoProvinceSelect" autocomplete="off">${provinceOptions}</select><small class="field-help">Podés usar provincia, código postal o ambos.</small></div><div class="field"><label>Código postal</label><input class="input" id="correoPostalCode" autocomplete="one-time-code" data-form-type="other" inputmode="text" placeholder="Ej.: 1806 o B1806" value="${escapeHtml(ca.postalCode||'')}"><small class="field-help">Si lo completás, se usa como código postal real, nunca como nombre de calle.</small></div></div>`;
      let body='';
      if(ca.deliveryType==='agency'){
        body=`${filters}<div class="field correo-search-wrap"><label>Dirección o localidad de referencia <span class="muted">(opcional)</span></label><input class="input" id="correoAgencyReferenceInput" autocomplete="one-time-code" data-form-type="other" spellcheck="false" placeholder="Ej.: Tristán Suárez o Roca 123" value="${escapeHtml(ca.agencyReference||'')}" ${filterReady?'':'disabled'}><small class="field-help">Si escribís una referencia, las sucursales se ordenan desde ese punto. Si no, usamos provincia/código postal.</small></div>${filterReady?`<button class="btn btn-secondary full" id="loadCorreoAgenciesBtn">${state.correoAgenciesLoading?'Buscando...':'Buscar sucursales y puntos PAQ.AR cercanos'}</button>`:'<div class="notice correo-filter-note">Elegí una provincia o escribí un código postal para ubicar la zona.</div>'}
          <div class="correo-agency-list">${state.correoAgenciesLoading?'<div class="notice">Consultando sucursales y puntos habilitados...</div>':state.correoAgencies.length?state.correoAgencies.map(a=>`<button type="button" class="correo-agency-card ${String(ca.agencyId||'')===String(a.agencyId)?'active':''}" data-correo-agency="${escapeHtml(a.agencyId)}"><strong>${escapeHtml(a.agencyName)}</strong><small>${escapeHtml([a.location?.streetName,a.location?.streetNumber,a.location?.cityName,a.location?.zipCode].filter(Boolean).join(' '))}</small>${Number.isFinite(Number(a.distanceKm))?`<small class="agency-distance">A ${Number(a.distanceKm).toFixed(1)} km aprox.</small>`:''}${a.schedule?`<small>${escapeHtml(a.schedule)}</small>`:''}</button>`).join(''):(filterReady?'<div class="muted correo-empty">Tocá “Buscar sucursales y puntos PAQ.AR cercanos”.</div>':'')}</div>
          ${ca.agencyId?`<div class="address-confirm"><strong>Punto elegido:</strong><br>${escapeHtml(ca.agencyName||ca.agencyId)}</div>`:''}`;
      }else{
        body=`${filters}<div class="field correo-search-wrap"><label>Calle y altura</label><input class="input" id="correoAddressInput" autocomplete="one-time-code" data-form-type="other" autocapitalize="words" spellcheck="false" placeholder="Ej.: Carrizo 123" value="${escapeHtml(ca.inputAddress||'')}" ${filterReady?'':'disabled'}><small class="field-help">${filterReady?'Escribí parte del nombre. Buscamos coincidencias dentro de la zona elegida y el mapa acompaña la búsqueda.':'Primero elegí una provincia o escribí un código postal.'}</small><div class="correo-suggestions" id="correoAddressSuggestions">${state.correoAddressSuggestions.map((x,i)=>`<button type="button" class="correo-suggestion" data-correo-address-suggestion="${i}"><strong>${escapeHtml(x.mainText||x.text)}</strong>${x.secondaryText?`<small>${escapeHtml(x.secondaryText)}</small>`:''}</button>`).join('')}</div></div>
          ${ca.address?`<div class="address-confirm"><strong>Dirección elegida:</strong><br>${escapeHtml(state.shipping.address||'')}</div>`:''}`;
      }
      const mapStatus=state.shipping.address?`Ubicación seleccionada: ${escapeHtml(state.shipping.address)}`:state.correoFilterArea?.formattedAddress?`Zona de búsqueda: ${escapeHtml(state.correoFilterArea.formattedAddress)}`:'Elegí provincia o código postal para ubicar el mapa.';
      host.innerHTML=`<div class="address-panel correo-panel"><div class="correo-head"><div><strong>Correo Argentino</strong><p class="detail-description">Filtrá primero la zona. Después elegí la dirección o el punto de retiro.</p></div>${conf.testMode?'<span class="mini-pill">TEST</span>':''}</div>
        <div class="correo-delivery-tabs"><button type="button" class="option ${ca.deliveryType!=='agency'?'active':''}" data-correo-delivery="homeDelivery">A domicilio</button><button type="button" class="option ${ca.deliveryType==='agency'?'active':''}" data-correo-delivery="agency">Sucursal / PAQ.AR</button></div>
        <div class="correo-workspace"><div class="correo-data-column">${testNote}${body}<div id="correoQuoteHost"></div></div><aside class="correo-map-column"><div class="correo-map-card"><div class="correo-map" id="correoMap"></div><div class="correo-map-status" id="correoMapStatus">${mapStatus}</div><small class="field-help">El mapa sirve para corroborar la zona, la dirección elegida y las sucursales cercanas.</small></div></aside></div></div>`;
      renderCorreoQuote();
      setTimeout(()=>renderCorreoMap().catch(err=>console.error('Mapa Correo',err)),0);
      return;
    }
    if (state.shipping.method !== 'moto') { host.innerHTML = ''; return; }
    host.innerHTML = `
      <div class="address-panel">
        ${state.auth.user && state.auth.addresses.length ? `<div class="saved-addresses"><span class="detail-label">Direcciones guardadas</span><div class="saved-address-row">${state.auth.addresses.map(a=>`<button class="saved-address-btn ${state.shipping.address===a.formatted_address?'active':''}" data-use-address="${a.id}"><strong>${escapeHtml(a.label||'Dirección')}</strong><small>${escapeHtml(a.formatted_address)}</small></button>`).join('')}</div></div>` : ''}
        <div class="field area-field">
          <label>Primero: localidad o código postal</label>
          <input class="input" id="areaInput" autocomplete="off" spellcheck="false" placeholder="Localidad o código postal" value="${escapeHtml(state.area?.selectedLabel || state.area?.locality || state.area?.query || '')}">
          <div class="address-suggestions hidden" id="areaSuggestions"></div>
          <div class="area-status ${state.area ? 'ready' : ''}" id="areaStatus">${state.area ? `✓ Zona elegida: ${escapeHtml(state.area.selectedLabel || state.area.locality || state.area.query || '')}` : 'Escribí y elegí una localidad de la lista.'}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-ghost" id="useLocationBtn">📍 Usar mi ubicación actual</button></div>
        <div class="address-autocomplete" id="autocompleteHost"></div>
        <div class="address-confirm ${state.shipping.address ? '' : 'hidden'}" id="addressConfirm">${state.shipping.address ? `<strong>Dirección seleccionada:</strong><br>${escapeHtml(state.shipping.address)}` : ''}</div>
        <div id="quoteHost"></div>
      </div>`;
    setupAreaAutocomplete();
    if (state.area) setupAddressAutocomplete().catch(err => toast(err.message, 'error'));
    if (state.shipping.lat && state.shipping.lng) {
      showMap(state.shipping.lat, state.shipping.lng, state.shipping.address).catch(err => toast(err.message,'error'));
    }
  }


  function renderCorreoQuote(){
    const host=qs('#correoQuoteHost');if(!host)return;
    const conf=state.config?.shipping?.correo||{},ca=state.shipping.correo||{};
    const ready=ca.deliveryType==='agency'?Boolean(ca.agencyId):Boolean(ca.address);
    const parcel=state.correoLastParcel;
    host.innerHTML=ready?(state.shipping.costCents?`<div class="quote-box correo-quote"><div><strong>${ca.deliveryType==='agency'?'Retiro en sucursal':'Entrega a domicilio'}</strong><div class="delivery-note">${conf.testMode?'Tarifa provisoria de prueba':'Tarifa configurada'}</div>${parcel?`<div class="correo-parcel-note">Paquete calculado: ${parcel.weightGrams} g · ${parcel.heightCm} × ${parcel.widthCm} × ${parcel.depthCm} cm · ${parcel.units} unidad${parcel.units===1?'':'es'}</div>`:''}</div><strong class="price">${money(state.shipping.costCents)}</strong></div>`:`<button class="btn btn-primary full" id="quoteCorreoBtn">Calcular envío</button>`):'';
    const toSummary=qs('#toSummaryBtn');if(toSummary)toSummary.disabled=!(state.shipping.method==='pickup'||Number(state.shipping.costCents)>0);
  }
  async function quoteCorreoShipping(){
    const ca=state.shipping.correo||{};const items=state.cart.map(i=>({productId:i.productId,variantId:i.variantId,quantity:i.qty||1}));const subtotalCents=state.cart.reduce((sum,i)=>sum+(Number(i.priceCents)||0)*(Number(i.qty)||1),0);const data=await api('/api/shipping/correo/quote',{method:'POST',body:JSON.stringify({deliveryType:ca.deliveryType||'homeDelivery',items,subtotalCents})});state.shipping.costCents=Number(data.costCents)||0;state.shipping.quoteId=data.quoteId||null;state.correoLastParcel=data.parcel||null;renderCorreoQuote();renderCheckoutShippingPriceOnly();return data;
  }
  function renderCheckoutShippingPriceOnly(){
    const card=qs('[data-shipping="correo"] .shipping-price');if(card&&state.shipping.method==='correo')card.textContent=state.shipping.costCents?money(state.shipping.costCents):'Calcular';
  }
  function correoProvinceName(code=''){
    const list=state.config?.shipping?.correo?.provinces||[];return list.find(p=>String(p.code)===String(code))?.name||'';
  }
  const CORREO_PROVINCE_MAP={
    A:{lat:-24.7821,lng:-65.4232,zoom:7},B:{lat:-36.6769,lng:-60.5588,zoom:6},C:{lat:-34.6037,lng:-58.3816,zoom:11},D:{lat:-33.3017,lng:-66.3378,zoom:7},E:{lat:-31.7747,lng:-60.4956,zoom:7},F:{lat:-29.4131,lng:-66.8558,zoom:7},G:{lat:-27.7834,lng:-64.2642,zoom:7},H:{lat:-26.5858,lng:-60.9540,zoom:7},J:{lat:-30.8654,lng:-68.8895,zoom:7},K:{lat:-28.4696,lng:-65.7852,zoom:7},L:{lat:-37.8957,lng:-65.0958,zoom:7},M:{lat:-34.6299,lng:-68.5831,zoom:7},N:{lat:-26.9377,lng:-54.4342,zoom:7},P:{lat:-24.8949,lng:-59.9324,zoom:7},Q:{lat:-38.9516,lng:-68.0591,zoom:7},R:{lat:-40.8261,lng:-63.0266,zoom:7},S:{lat:-31.5855,lng:-60.7238,zoom:7},T:{lat:-26.8083,lng:-65.2176,zoom:8},U:{lat:-43.2934,lng:-65.1115,zoom:7},V:{lat:-54.8019,lng:-68.3030,zoom:7},W:{lat:-28.7743,lng:-57.8012,zoom:7},X:{lat:-31.4201,lng:-64.1888,zoom:7},Y:{lat:-23.3201,lng:-65.7593,zoom:7},Z:{lat:-48.7737,lng:-69.1917,zoom:6}
  };
  function correoProvinceQueryName(code=''){
    if(String(code)==='C')return 'Ciudad Autónoma de Buenos Aires';
    if(String(code)==='B')return 'Provincia de Buenos Aires';
    return correoProvinceName(code);
  }
  function correoProvinceCodeFromName(name=''){
    const raw=normalizeSearch(name);
    if(!raw)return '';
    if(raw.includes('ciudad autonoma de buenos aires')||raw==='caba'||raw.includes('capital federal'))return 'C';
    if(raw.includes('provincia de buenos aires')||raw==='buenos aires province')return 'B';
    const n=raw.replace(/^provincia de /,'').replace(/^ciudad autonoma de /,'');
    const list=state.config?.shipping?.correo?.provinces||[];
    const hit=list.find(p=>{const pn=normalizeSearch(p.name).replace(/^provincia de /,'').replace(/^ciudad autonoma de /,'');return pn===n || n.includes(pn) || pn.includes(n)});
    return hit?.code||'';
  }
  function validCorreoPostal(value=''){return /^[A-Za-z]?\d{4}[A-Za-z]{0,3}$/.test(String(value||'').replace(/\s+/g,''));}
  function hasCorreoCoords(lat,lng){return lat!==null&&lat!==undefined&&lat!==''&&lng!==null&&lng!==undefined&&lng!==''&&Number.isFinite(Number(lat))&&Number.isFinite(Number(lng));}
  function googleAddressPart(components=[],type=''){
    const c=(components||[]).find(x=>(x.types||[]).includes(type));return c?.long_name||c?.longText||'';
  }
  async function geocodeCorreoClient(query,{all=false}={}){
    await ensurePlacesLibrary();
    if(!window.google?.maps?.Geocoder)throw new Error('El mapa todavía no está listo. Volvé a intentar.');
    const geocoder=new google.maps.Geocoder();
    const request=typeof query==='string'?{address:String(query||'').trim(),region:'AR'}:{...(query||{}),region:'AR'};
    const result=await geocoder.geocode(request);
    const rows=result?.results||[];if(!rows.length)throw new Error('No pudimos ubicar esa zona en el mapa.');
    return all?rows:rows[0];
  }
  function correoAreaFromGoogleResult(r,key,postal='',fallbackState=''){
    const comps=r?.address_components||[];
    const provinceName=googleAddressPart(comps,'administrative_area_level_1');
    const stateCode=correoProvinceCodeFromName(provinceName)||fallbackState||'';
    return {key,formattedAddress:r?.formatted_address||'',lat:Number(r?.geometry?.location?.lat?.()??r?.geometry?.location?.lat),lng:Number(r?.geometry?.location?.lng?.()??r?.geometry?.location?.lng),locality:googleAddressPart(comps,'locality')||googleAddressPart(comps,'administrative_area_level_2'),postalCode:googleAddressPart(comps,'postal_code')||postal,provinceName,state:stateCode,viewport:viewportLiteral(r?.geometry?.viewport)};
  }
  async function resolveCorreoFilterArea(force=false){
    const ca=state.shipping.correo||{},postal=String(ca.postalCode||'').trim().toUpperCase(),province=correoProvinceQueryName(ca.state);
    if(!ca.state&&!postal)throw new Error('Elegí una provincia o escribí un código postal.');
    if(postal&&!validCorreoPostal(postal))throw new Error('Escribí un código postal argentino válido.');
    const key=`${ca.state||''}|${postal}`;
    if(!force&&state.correoFilterArea?.key===key&&hasCorreoCoords(state.correoFilterArea?.lat,state.correoFilterArea?.lng))return state.correoFilterArea;

    // La provincia sola mueve el mapa inmediatamente, sin depender de una consulta externa.
    if(ca.state&&!postal){
      const fixed=CORREO_PROVINCE_MAP[String(ca.state)]||null;
      if(fixed){
        state.correoFilterArea={key,formattedAddress:correoProvinceName(ca.state)||province,lat:fixed.lat,lng:fixed.lng,locality:'',postalCode:'',provinceName:correoProvinceName(ca.state)||province,state:ca.state,viewport:null,zoom:fixed.zoom,scope:'province'};
        return state.correoFilterArea;
      }
    }

    try{
      const numeric=postal.match(/\d{4}/)?.[0]||postal;
      let rows=[];
      if(postal){
        try{rows=await geocodeCorreoClient({componentRestrictions:{country:'AR',postalCode:numeric}},{all:true});}catch{}
      }
      if(!rows.length)rows=await geocodeCorreoClient([postal,province,'Argentina'].filter(Boolean).join(', '),{all:true});
      let r=rows[0];
      if(ca.state){
        const matched=rows.find(x=>correoProvinceCodeFromName(googleAddressPart(x.address_components||[],'administrative_area_level_1'))===String(ca.state));
        if(matched)r=matched;
      }
      const area=correoAreaFromGoogleResult(r,key,postal,ca.state||'');
      if(ca.state&&area.state&&String(area.state)!==String(ca.state))throw new Error('Ese código postal corresponde a otra provincia.');
      if(!ca.state&&area.state)ca.state=area.state;
      state.shipping.correo=ca;state.correoFilterArea=area;return area;
    }catch(clientErr){
      try{
        const data=await api('/api/geo/resolve-area',{method:'POST',body:JSON.stringify({query:postal||province,provinceCode:ca.state||'',provinceName:province,postalCode:postal||''})});
        if(!ca.state&&data.state)ca.state=data.state;
        state.shipping.correo=ca;state.correoFilterArea={...data,key,query:postal||province,postalCode:postal,state:ca.state||data.state||'',provinceName:province||data.provinceName||''};
        return state.correoFilterArea;
      }catch{
        const fixed=ca.state?CORREO_PROVINCE_MAP[String(ca.state)]:null;
        if(fixed&&!postal){state.correoFilterArea={key,formattedAddress:correoProvinceName(ca.state),lat:fixed.lat,lng:fixed.lng,locality:'',postalCode:'',provinceName:correoProvinceName(ca.state),state:ca.state,viewport:null,zoom:fixed.zoom,scope:'province'};return state.correoFilterArea;}
        throw clientErr;
      }
    }
  }
  async function previewCorreoAddress(text){
    const q=String(text||'').trim();if(q.length<2){state.correoMapPreview=null;await renderCorreoMap();return null;}
    const ca=state.shipping.correo||{},area=await resolveCorreoFilterArea();
    const query=[q,ca.postalCode||area.postalCode,correoProvinceQueryName(ca.state)||area.provinceName,'Argentina'].filter(Boolean).join(', ');
    try{
      const rows=await geocodeCorreoClient(query,{all:true});
      let r=rows[0];
      if(ca.state){const hit=rows.find(x=>correoProvinceCodeFromName(googleAddressPart(x.address_components||[],'administrative_area_level_1'))===String(ca.state));if(hit)r=hit;}
      const loc=r?.geometry?.location;const lat=Number(loc?.lat?.()??loc?.lat),lng=Number(loc?.lng?.()??loc?.lng);
      if(hasCorreoCoords(lat,lng)){state.correoMapPreview={lat,lng,label:r.formatted_address||q};await renderCorreoMap();return state.correoMapPreview;}
    }catch{}
    return null;
  }
  async function fetchCorreoSuggestions(kind,input){
    const q=String(input||'').trim();if(kind!=='home')return;
    if(q.length<2){state.correoAddressSuggestions=[];state.correoMapPreview=null;renderShippingDetail();return;}
    const area=await resolveCorreoFilterArea();
    const ca=state.shipping.correo||{};
    const data=await api('/api/geo/autocomplete',{method:'POST',body:JSON.stringify({input:q,area,provinceCode:ca.state||'',provinceName:correoProvinceName(ca.state),postalCode:ca.postalCode||''})});
    state.correoAddressSuggestions=(data.items||[]).slice(0,20);
    renderShippingDetail();
    const inputEl=qs('#correoAddressInput');if(inputEl){inputEl.focus();try{inputEl.setSelectionRange(q.length,q.length)}catch{}}
  }
  async function chooseCorreoHomeSuggestion(index){
    const item=state.correoAddressSuggestions[Number(index)];if(!item)return;
    const ca=state.shipping.correo||{};const province=correoProvinceName(ca.state),postal=String(ca.postalCode||'').trim();
    const data=await api('/api/geo/validate-address',{method:'POST',body:JSON.stringify({address:item.text||item.mainText||'',placeId:item.placeId||'',provinceCode:ca.state||'',provinceName:province,postalCode:postal})});const a=data.correoAddress||{};
    if(!a.streetName||!a.streetNumber||!a.cityName||!a.state)throw new Error('Esa opción no tiene calle, altura y localidad completas. Elegí otra dirección.');
    if(ca.state&&String(a.state)!==String(ca.state))throw new Error('Esa dirección pertenece a otra provincia.');
    const selectedZip=String(a.zipCode||'').toUpperCase(),wanted=postal.toUpperCase();
    if(wanted&&selectedZip&&!selectedZip.includes(wanted.replace(/^[A-Z]/,''))&&!wanted.includes(selectedZip.replace(/^[A-Z]/,'')))throw new Error('Esa dirección no corresponde al código postal indicado.');
    const finalZip=a.zipCode||postal;if(!finalZip)throw new Error('Falta el código postal de esa dirección. Completalo para continuar.');
    const lat=Number(data.geocode?.location?.latitude??data.geocode?.location?.lat),lng=Number(data.geocode?.location?.longitude??data.geocode?.location?.lng);
    state.shipping.address=data.formattedAddress||item.text;state.shipping.lat=lat;state.shipping.lng=lng;state.shipping.costCents=0;state.shipping.quoteId=null;state.correoLastParcel=null;state.correoAddressSuggestions=[];state.correoMapPreview=null;state.shipping.correo={...ca,state:ca.state||a.state,postalCode:postal||finalZip,deliveryType:'homeDelivery',inputAddress:item.text||item.mainText||'',address:{streetName:a.streetName,streetNumber:a.streetNumber,cityName:a.cityName,state:a.state,zipCode:finalZip,floor:'',department:''}};
    await quoteCorreoShipping();renderShippingDetail();
  }
  async function loadCorreoAgencies(){
    const ca=state.shipping.correo||{};let area=await resolveCorreoFilterArea();
    if(String(ca.agencyReference||'').trim()){
      const preview=await previewCorreoAddress(ca.agencyReference);if(preview)area={...area,lat:preview.lat,lng:preview.lng,formattedAddress:preview.label||area.formattedAddress};
    }
    ca.agencyId='';ca.agencyName='';state.shipping.correo=ca;state.shipping.costCents=0;state.correoAgencies=[];state.correoAgenciesLoading=true;renderShippingDetail();
    try{
      const stateId=ca.state||area.state||'';
      if(!stateId)throw new Error('No pudimos identificar la provincia de esa zona. Elegila en el selector.');
      const d=await api(`/api/shipping/correo/agencies?stateId=${encodeURIComponent(stateId)}&postalCode=${encodeURIComponent(ca.postalCode||area.postalCode||'')}&lat=${encodeURIComponent(area.lat)}&lng=${encodeURIComponent(area.lng)}`);state.correoAgencies=d.items||[];
    }finally{state.correoAgenciesLoading=false;renderShippingDetail();}
  }
  async function selectCorreoAgency(id){
    const a=state.correoAgencies.find(x=>String(x.agencyId)===String(id));if(!a)return;const ca=state.shipping.correo||{};state.shipping.correo={...ca,deliveryType:'agency',agencyId:a.agencyId,agencyName:a.agencyName,address:null};state.shipping.address=[a.agencyName,a.location?.streetName,a.location?.streetNumber,a.location?.cityName].filter(Boolean).join(' · ');state.shipping.lat=hasCorreoCoords(a.location?.latitude,a.location?.longitude)?Number(a.location.latitude):null;state.shipping.lng=hasCorreoCoords(a.location?.latitude,a.location?.longitude)?Number(a.location.longitude):null;state.shipping.costCents=0;state.shipping.quoteId=null;await quoteCorreoShipping();renderShippingDetail();
  }
  async function renderCorreoMap(){
    const el=qs('#correoMap');if(!el)return;
    await ensurePlacesLibrary();
    if(!window.google?.maps?.Map)return;
    const ca=state.shipping.correo||{};let center=null,zoom=4;
    if(hasCorreoCoords(state.shipping.lat,state.shipping.lng)){center={lat:Number(state.shipping.lat),lng:Number(state.shipping.lng)};zoom=16;}
    else if(hasCorreoCoords(state.correoMapPreview?.lat,state.correoMapPreview?.lng)){center={lat:Number(state.correoMapPreview.lat),lng:Number(state.correoMapPreview.lng)};zoom=15;}
    else if(hasCorreoCoords(state.correoFilterArea?.lat,state.correoFilterArea?.lng)){center={lat:Number(state.correoFilterArea.lat),lng:Number(state.correoFilterArea.lng)};zoom=state.shipping.correo?.postalCode?13:(Number(state.correoFilterArea?.zoom)||7);}
    else center={lat:-38.4161,lng:-63.6167};
    const map=new google.maps.Map(el,{center,zoom,mapTypeControl:false,streetViewControl:false,fullscreenControl:true,gestureHandling:'greedy'});
    state.correoMap=map;state.correoMapMarkers=[];const bounds=new google.maps.LatLngBounds();let points=0;
    const addMarker=(pos,opts={})=>{const m=new google.maps.Marker({position:pos,map,title:opts.title||'',label:opts.label||undefined});if(opts.onClick)m.addListener('click',opts.onClick);state.correoMapMarkers.push(m);bounds.extend(pos);points++;return m;};
    if(ca.deliveryType!=='agency'){
      if(hasCorreoCoords(state.shipping.lat,state.shipping.lng))addMarker({lat:Number(state.shipping.lat),lng:Number(state.shipping.lng)},{title:state.shipping.address||'Dirección de entrega'});
      else if(hasCorreoCoords(state.correoMapPreview?.lat,state.correoMapPreview?.lng))addMarker({lat:Number(state.correoMapPreview.lat),lng:Number(state.correoMapPreview.lng)},{title:state.correoMapPreview.label||'Vista preliminar'});
    }
    if(ca.deliveryType==='agency'){
      if(hasCorreoCoords(state.correoMapPreview?.lat,state.correoMapPreview?.lng))addMarker({lat:Number(state.correoMapPreview.lat),lng:Number(state.correoMapPreview.lng)},{title:'Punto de referencia'});
      for(const a of state.correoAgencies){const lat=Number(a.location?.latitude),lng=Number(a.location?.longitude);if(!hasCorreoCoords(lat,lng))continue;const pos={lat,lng};const paq=/paq/i.test(String(a.agencyName||''));addMarker(pos,{title:`${paq?'Punto PAQ.AR':'Sucursal Correo Argentino'} · ${a.agencyName||''}`,label:paq?'P':'C',onClick:()=>selectCorreoAgency(a.agencyId).catch(err=>toast(err.message,'error'))});}
    }
    if(points>1)map.fitBounds(bounds,70);else if(points===1)map.setZoom(ca.deliveryType==='agency'?14:16);
    const status=qs('#correoMapStatus');if(status){status.textContent=state.shipping.address?`Ubicación seleccionada: ${state.shipping.address}`:state.correoMapPreview?.label?`Vista preliminar: ${state.correoMapPreview.label}`:state.correoFilterArea?.formattedAddress?`Zona de búsqueda: ${state.correoFilterArea.formattedAddress}`:'Elegí provincia o código postal para ubicar el mapa.';}
  }

  async function resolveAreaChoice(item) {
    if (!item?.prediction) throw new Error('Elegí una localidad de la lista.');
    const status = qs('#areaStatus');
    if (status) { status.className='area-status loading'; status.textContent='Cargando zona...'; }
    const place = item.prediction.toPlace();
    await place.fetchFields({ fields:['displayName','formattedAddress','location','viewport','addressComponents'] });
    const lat=Number(place.location?.lat?.() ?? place.location?.lat);
    const lng=Number(place.location?.lng?.() ?? place.location?.lng);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) throw new Error('No pudimos ubicar esa localidad.');
    const components=place.addressComponents || [];
    const part=(type)=>{
      const c=components.find(x=>(x.types||[]).includes(type));
      return c?.longText || c?.long_name || '';
    };
    const label=item.mainText || place.displayName || item.text || '';
    state.area = {
      placeId:item.placeId || place.id || '',
      query:label,
      selectedLabel:label,
      formattedAddress:place.formattedAddress || item.text || label,
      locality:part('locality') || part('sublocality_level_1') || part('sublocality') || part('administrative_area_level_2') || label,
      postalCode:part('postal_code'),
      lat,lng,
      viewport:viewportLiteral(place.viewport)
    };
    state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;state.shipping.distanceKm=null;
    state.areaSuggestions=[];state.areaSessionToken=null;state.streetSessionToken=null;
    const input=qs('#areaInput');if(input) input.value=label;
    const list=qs('#areaSuggestions');if(list){list.innerHTML='';list.classList.add('hidden');}
    if(status){status.className='area-status ready';status.textContent=`✓ Zona elegida: ${label}`;}
    await setupAddressAutocomplete();
  }

  function setupAreaAutocomplete() {
    const input=qs('#areaInput');
    if(!input || input.dataset.autoBound==='1') return;
    input.dataset.autoBound='1';
    let timer=null;
    input.addEventListener('input',()=>{
      clearTimeout(timer);
      const q=input.value.trim();
      const chosen=String(state.area?.selectedLabel || '').trim();
      if(state.area && normalizeSearch(q)!==normalizeSearch(chosen)){
        state.area=null;state.areaSuggestions=[];state.areaSessionToken=null;state.streetSessionToken=null;
        state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;state.shipping.distanceKm=null;
        const streetHost=qs('#autocompleteHost');if(streetHost)streetHost.innerHTML='';
        const confirm=qs('#addressConfirm');if(confirm){confirm.innerHTML='';confirm.classList.add('hidden');}
        const quote=qs('#quoteHost');if(quote)quote.innerHTML='';
        const status=qs('#areaStatus');if(status){status.className='area-status';status.textContent='Elegí una localidad de la lista.';}
      }
      const list=qs('#areaSuggestions');
      if(q.length<2){if(list){list.innerHTML='';list.classList.add('hidden');}return;}
      timer=setTimeout(()=>fetchAreaSuggestions(q).catch(err=>{
        console.error(err);
        if(list){list.innerHTML='<div class="address-suggestion-empty">No pudimos cargar las localidades. Volvé a intentar.</div>';list.classList.remove('hidden');}
        const status=qs('#areaStatus');if(status){status.className='area-status error';status.textContent='No pudimos cargar las sugerencias.';}
      }),220);
    });
    input.addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault();});
  }

  async function fetchAreaSuggestions(input) {
    const list=qs('#areaSuggestions');if(!list)return;
    list.innerHTML='<div class="address-suggestion-empty">Buscando localidades...</div>';list.classList.remove('hidden');
    const {AutocompleteSuggestion,AutocompleteSessionToken}=await ensurePlacesLibrary();
    if(!state.areaSessionToken) state.areaSessionToken=new AutocompleteSessionToken();
    const {suggestions=[]}=await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      sessionToken:state.areaSessionToken,
      includedRegionCodes:['ar'],
      includedPrimaryTypes:['(regions)'],
      language:'es-AR',
      region:'ar'
    });
    const items=[];const seen=new Set();const q=expandedSearch(input);
    for(const s of suggestions){
      const p=s.placePrediction;if(!p)continue;
      const main=p.mainText?.text || p.text?.text || '';
      const secondary=p.secondaryText?.text || '';
      const text=p.text?.text || [main,secondary].filter(Boolean).join(', ');
      const matchText=expandedSearch(main+' '+text);
      if(q && !matchText.includes(q)) continue;
      if(seen.has(p.placeId))continue;seen.add(p.placeId);
      items.push({placeId:p.placeId,text,mainText:main,secondaryText:secondary,prediction:p});
    }
    state.areaSuggestions=items;
    if(!items.length){list.innerHTML='<div class="address-suggestion-empty">No encontramos localidades con ese texto.</div>';return;}
    list.innerHTML=items.map((x,i)=>`<button class="address-suggestion" data-area-suggestion="${i}"><strong>${escapeHtml(x.mainText||x.text)}</strong>${x.secondaryText?`<small>${escapeHtml(x.secondaryText)}</small>`:''}</button>`).join('')+'<div class="google-attribution">Sugerencias de Google</div>';
  }

  async function setupAddressAutocomplete() {
    const host=qs('#autocompleteHost');if(!host||!state.area)return;
    host.innerHTML=`
      <label class="detail-label">Calle y altura</label>
      <div class="address-search-row">
        <input class="input" id="streetAddressInput" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Calle y altura" value="${escapeHtml(state.shipping.address||'')}">
        <button class="btn btn-secondary" id="confirmTypedAddressBtn">Usar dirección</button>
      </div>
      <div class="address-suggestions hidden" id="addressSuggestions"></div>
      <div class="address-helper">Te mostramos calles dentro de la localidad o código postal elegido. Escribí el nombre y después agregá la altura.</div>`;
    const input=qs('#streetAddressInput');if(!input)return;
    state.streetSessionToken=null;
    let timer=null;
    input.addEventListener('input',()=>{
      clearTimeout(timer);const q=input.value.trim();const list=qs('#addressSuggestions');if(!list)return;
      if(q.length<2){list.innerHTML='';list.classList.add('hidden');return;}
      timer=setTimeout(()=>fetchAddressSuggestions(q).catch(err=>{console.error(err);list.innerHTML='';list.classList.add('hidden');}),220);
    });
  }

  async function fetchAddressSuggestions(input) {
    const list=qs('#addressSuggestions');if(!list||!state.area)return;
    list.innerHTML='<div class="address-suggestion-empty">Buscando calles...</div>';list.classList.remove('hidden');
    const q=expandedSearch(input.replace(/\b\d{1,6}[A-Za-z]?\b/g,' '));
    const items=[];const seen=new Set();

    // Primera pasada: Places del navegador, priorizando la zona elegida sin encerrar
    // demasiado la búsqueda. Así también contempla calles de localidades del mismo partido.
    try{
      const {AutocompleteSuggestion,AutocompleteSessionToken}=await ensurePlacesLibrary();
      if(!state.streetSessionToken) state.streetSessionToken=new AutocompleteSessionToken();
      const request={
        input,
        sessionToken:state.streetSessionToken,
        includedRegionCodes:['ar'],
        includedPrimaryTypes:/\b\d{1,6}[A-Za-z]?\b/.test(input)?['street_address','route','premise']:['route'],
        language:'es-AR',region:'ar'
      };
      const areaBounds=viewportLiteral(state.area.viewport);
      if(areaBounds){
        request.locationRestriction=areaBounds;
      }else if(Number.isFinite(Number(state.area.lat))&&Number.isFinite(Number(state.area.lng))){
        request.locationRestriction={center:{lat:Number(state.area.lat),lng:Number(state.area.lng)},radius:12000};
      }
      const {suggestions=[]}=await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
      for(const suggestion of suggestions){
        const pred=suggestion.placePrediction;if(!pred)continue;
        const main=pred.mainText?.text || pred.text?.text || '';
        const secondary=pred.secondaryText?.text || '';
        const text=pred.text?.text || [main,secondary].filter(Boolean).join(', ');
        const matchText=expandedSearch(`${main} ${text}`);
        if(q && !matchText.includes(q))continue;
        const key=pred.placeId||text;
        if(seen.has(key))continue;seen.add(key);
        items.push({placeId:pred.placeId||'',text,mainText:main,secondaryText:secondary,prediction:pred});
      }
    }catch(err){console.error('Places navegador',err);}

    // Si Google no encontró por el comienzo del nombre, consultamos el Worker.
    // Ese respaldo también usa Text Search, que permite encontrar "Victoriano Carrizo"
    // aunque la persona escriba solo "carr".
    if(items.length<5){
      try{
        const data=await api('/api/geo/autocomplete',{method:'POST',body:JSON.stringify({input,area:state.area})});
        for(const x of (data.items||[])){
          const text=x.text||'';
          const main=x.mainText||text;
          const secondary=x.secondaryText||'';
          const matchText=expandedSearch(`${main} ${text}`);
          if(q && !matchText.includes(q))continue;
          const key=x.placeId||text;
          if(!text||seen.has(key))continue;seen.add(key);
          items.push({placeId:x.placeId||'',text,mainText:main,secondaryText:secondary});
          if(items.length>=7)break;
        }
      }catch(err){console.error('Respaldo de calles',err);}
    }

    state.addressSuggestions=items;
    if(!items.length){
      list.innerHTML='<div class="address-suggestion-empty">No encontramos esa calle todavía. Podés seguir escribiendo o poner calle y altura y tocar “Usar dirección”.</div>';
      list.classList.remove('hidden');
      return;
    }
    list.innerHTML=items.map((x,i)=>`<button class="address-suggestion" data-address-suggestion="${i}" data-address-text="${escapeHtml(x.text)}" data-address-main="${escapeHtml(x.mainText||x.text)}"><strong>${escapeHtml(x.mainText||x.text)}</strong>${x.secondaryText?`<small>${escapeHtml(x.secondaryText)}</small>`:''}</button>`).join('')+'<div class="google-attribution">Sugerencias de Google</div>';
  }

  async function confirmTypedAddress(addressText) {
    const raw = String(addressText || '').trim();
    if (raw.length < 3) throw new Error('Escribí la calle.');
    if (!/\b\d{1,6}[A-Za-z]?\b/.test(raw)) throw new Error('Ahora agregá la altura (número) para confirmar la dirección.');
    const areaText = state.area?.formattedAddress || state.area?.query || '';
    const full = raw.toLowerCase().includes('argentina') ? raw : `${raw}, ${areaText}, Argentina`;
    const data = await api('/api/geo/validate-address', { method:'POST', body:JSON.stringify({ address:full }) });
    const loc = data.geocode?.location || {};
    const lat = Number(loc.latitude ?? loc.lat), lng = Number(loc.longitude ?? loc.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('No pudimos ubicar esa dirección. Probá escribiendo calle, altura y localidad.');
    state.shipping.address = data.formattedAddress || raw;
    state.shipping.lat = lat; state.shipping.lng = lng; state.shipping.costCents = 0; state.shipping.distanceKm = null;
    state.shippingQuoteCarry=false;
    saveLastShipping({withQuote:false,carry:false});
    await showMap(lat,lng,state.shipping.address);
    await quoteMoto();
  }

  async function showMap(lat, lng, address) {
    const confirm = qs('#addressConfirm');
    if (!confirm) return;
    state.shipping.lat = Number(lat); state.shipping.lng = Number(lng);
    if (address) state.shipping.address = address;
    confirm.classList.remove('hidden');
    confirm.innerHTML = `<strong>Dirección seleccionada:</strong><br>${escapeHtml(state.shipping.address || '')}`;
    renderMotoQuoteButton();
  }

  function renderMotoQuoteButton() {
    const host = qs('#quoteHost');
    if (!host) return;
    if (!state.shipping.lat || !state.shipping.lng) { host.innerHTML=''; return; }
    host.innerHTML = state.shipping.costCents
      ? `<div class="quote-box"><div><strong>${state.shipping.distanceKm} km</strong><div class="delivery-note">Horarios de envíos entre las 8 am y las 23 hs con una demora de entre ${state.config?.shipping?.moto?.minHours || 1} y ${state.config?.shipping?.moto?.maxHours || 4} horas sujeto a disponibilidad</div></div><strong class="price">${money(state.shipping.costCents)}</strong></div><div style="margin-top:9px"><a class="btn btn-ghost full" target="_blank" rel="noopener" href="${motoWhatsappUrl()}">Consultar demora por WhatsApp</a></div>`
      : `<button class="btn btn-primary full" id="quoteMotoBtn">Calcular motomensajería</button>`;
    const toSummary = qs('#toSummaryBtn'); if (toSummary) toSummary.disabled = !state.shipping.costCents;
  }

  async function quoteMoto() {
    if (!state.shipping.lat || !state.shipping.lng) throw new Error('Primero elegí una dirección.');
    state.coupon=null;
    const saved=readLastShipping();
    if(saved && sameSavedShippingAddress(saved) && saved.quotedDay===localDayKey() && Number(saved.costCents)>0){
      state.shipping.distanceKm=saved.distanceKm;
      state.shipping.costCents=Number(saved.costCents);
      state.shipping.quoteId=saved.quoteId||null;
      renderMotoQuoteButton();
      toast('Usamos la cotización guardada de hoy para no gastar otra consulta.','success');
      return;
    }
    const data = await api('/api/shipping/moto/quote', { method:'POST', body:JSON.stringify({ destination:{ lat:state.shipping.lat, lng:state.shipping.lng, address:state.shipping.address } }) });
    state.shipping.distanceKm = data.distanceKm; state.shipping.costCents = data.costCents; state.shipping.quoteId = data.quoteId;
    if(Number.isFinite(Number(data.queriesRemaining))) state.shippingQueriesRemaining=Number(data.queriesRemaining);
    saveLastShipping({withQuote:true,carry:state.shippingQuoteCarry});
    renderMotoQuoteButton();
    if(Number.isFinite(state.shippingQueriesRemaining)) toast(`Cotización lista · te quedan ${state.shippingQueriesRemaining} consulta${state.shippingQueriesRemaining===1?'':'s'} hoy.`, 'success');
  }

  async function getBestCurrentPosition() {
    if(!navigator.geolocation) throw new Error('Tu navegador no permite obtener ubicación.');
    return await new Promise((resolve,reject)=>{
      let best=null,done=false;
      const finish=(value,error)=>{if(done)return;done=true;clearTimeout(timer);if(watchId!=null)navigator.geolocation.clearWatch(watchId);error?reject(error):resolve(value);};
      const timer=setTimeout(()=>{
        if(best) finish(best);
        else finish(null,new Error('No pudimos detectar tu ubicación. Revisá que la ubicación del dispositivo esté activada.'));
      },12000);
      let watchId=navigator.geolocation.watchPosition(pos=>{
        if(!best || Number(pos.coords.accuracy)<Number(best.coords.accuracy)) best=pos;
        if(Number(pos.coords.accuracy)<=45) finish(pos);
      },err=>{
        if(err.code===1) finish(null,new Error('Chrome tiene bloqueada tu ubicación. Permitila desde el ícono junto a la dirección del sitio y volvé a probar.'));
        else if(!best && err.code===2) finish(null,new Error('El dispositivo no pudo obtener una ubicación precisa.'));
      },{enableHighAccuracy:true,timeout:11000,maximumAge:0});
    });
  }

  async function useCurrentLocation() {
    const pos=await getBestCurrentPosition();
    const lat=Number(pos.coords.latitude),lng=Number(pos.coords.longitude),accuracy=Math.round(Number(pos.coords.accuracy)||0);
    const data=await api('/api/geo/reverse',{method:'POST',body:JSON.stringify({lat,lng})});
    const zoneName=data.locality || data.postalCode || '';
    if(!zoneName) throw new Error('Detectamos tu posición, pero no pudimos identificar la localidad. Elegila manualmente.');
    let resolved=null;
    try{resolved=await api('/api/geo/resolve-area',{method:'POST',body:JSON.stringify({query:zoneName})});}catch{}
    state.area={...(resolved||{}),query:zoneName,selectedLabel:zoneName,formattedAddress:resolved?.formattedAddress||data.formattedAddress||zoneName,lat:resolved?.lat??lat,lng:resolved?.lng??lng,locality:zoneName,postalCode:data.postalCode||resolved?.postalCode||''};
    const areaInput=qs('#areaInput');if(areaInput)areaInput.value=zoneName;
    const status=qs('#areaStatus');
    if(accuracy>100){
      state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;state.shipping.distanceKm=null;
      if(status){status.className='area-status ready';status.textContent=`✓ Zona detectada: ${zoneName}`;}
      await setupAddressAutocomplete();
      throw new Error(`La ubicación del dispositivo es aproximada (±${accuracy} m). Para no mandar el pedido a una dirección equivocada, completá calle y altura.`);
    }
    state.shipping.address=data.formattedAddress;state.shipping.lat=lat;state.shipping.lng=lng;state.shipping.costCents=0;state.shipping.distanceKm=null;
    state.shippingQuoteCarry=false;
    saveLastShipping({withQuote:false,carry:false});
    if(status){status.className='area-status ready';status.textContent=`✓ Zona detectada: ${zoneName}`;}
    await setupAddressAutocomplete();
    await showMap(lat,lng,data.formattedAddress);
    await quoteMoto();
  }

  function motoWhatsappUrl() {
    const whatsapp = state.config?.whatsapp || cfg.STORE_WHATSAPP || '5491162691341';
    const orderTxt = state.order?.code ? ` ${state.order.code}` : '';
    const msg = `Hola, quiero consultar la demora de motomensajería para mi pedido${orderTxt}. Dirección: ${state.shipping.address || ''}. Distancia calculada: ${state.shipping.distanceKm || ''} km.`;
    return `https://wa.me/${whatsapp}?text=${encodeURIComponent(msg)}`;
  }

  async function applyCouponCode() {
    const code=String(qs('#couponInput')?.value||'').trim();
    if(!code){toast('Ingresá un código de cupón.','error');return;}
    const btn=qs('#applyCouponBtn');
    if(btn){btn.disabled=true;btn.textContent='Aplicando...';}
    try{
      const data=await api('/api/coupons/preview',{method:'POST',body:JSON.stringify({
        code,
        subtotalCents:cartSubtotal(),
        shippingCostCents:state.shipping.costCents
      })});
      state.coupon=data;
      toast(`Cupón ${data.code} aplicado`,'success');
      renderCheckoutSummary();
    }catch(err){
      state.coupon=null;
      toast(err.message,'error');
      if(btn){btn.disabled=false;btn.textContent='Aplicar';}
    }
  }
  function removeCouponCode(){state.coupon=null;renderCheckoutSummary();}

  function renderCheckoutSummary() {
    const subtotal=cartSubtotal();
    const shippingBase=state.shipping.costCents;
    const discount=state.coupon?.totalDiscountCents||0;
    const total=state.coupon?.totalCents ?? (subtotal+shippingBase);
    qs('#checkoutContent').innerHTML = `
      <h2>Revisá tu compra</h2><div class="checkout-sub">Antes de pagar, confirmá que esté todo correcto.</div>
      <div class="summary-list">${state.cart.map(x=>`<div class="summary-item"><div><strong>${escapeHtml(x.name)}</strong><br><small>${cartVariantLabel(x)?`${escapeHtml(cartVariantLabel(x))} · `:''}x${x.qty}</small></div><strong>${money(x.priceCents*x.qty)}</strong></div>`).join('')}</div>

      <div class="coupon-box">
        <div class="coupon-title"><strong>¿Tenés un cupón de descuento?</strong><small>Ingresalo antes de pagar.</small></div>
        <div class="coupon-row">
          <input class="input" id="couponInput" autocomplete="off" placeholder="Código de cupón" value="${escapeHtml(state.coupon?.code||'')}">
          <button class="btn btn-secondary" id="applyCouponBtn">Aplicar</button>
        </div>
        ${state.coupon?`<div class="coupon-applied"><div><strong>✓ ${escapeHtml(state.coupon.code)}</strong><small>${escapeHtml(state.coupon.label||'Descuento aplicado')}</small></div><button class="link-action" id="removeCouponBtn">Quitar</button></div>`:''}
      </div>

      <div style="margin-top:16px">
        <div class="total-row"><span>Subtotal</span><strong>${money(subtotal)}</strong></div>
        <div class="total-row"><span>Envío</span><strong>${shippingBase ? money(shippingBase) : 'Gratis'}</strong></div>
        ${discount?`<div class="total-row discount-row"><span>Descuento · ${escapeHtml(state.coupon.code)}</span><strong>− ${money(discount)}</strong></div>`:''}
        <div class="total-row grand"><span>Total</span><strong>${money(total)}</strong></div>
      </div>
      <div class="notice" style="margin-top:14px"><strong>${shippingMethodLabel()}</strong><br>${state.shipping.method==='moto' ? `${escapeHtml(state.shipping.address || '')}<br>${state.shipping.distanceKm} km<br>Horarios de envíos entre las 8 am y las 23 hs con una demora de entre ${state.config?.shipping?.moto?.minHours || 1} y ${state.config?.shipping?.moto?.maxHours || 4} horas sujeto a disponibilidad` : state.shipping.method==='correo' ? `${escapeHtml(state.shipping.correo?.deliveryType==='agency'?`Sucursal: ${state.shipping.correo?.agencyName||state.shipping.correo?.agencyId||''}`:(state.shipping.address||''))}${state.config?.shipping?.correo?.testMode?'<br><small>Integración PAQ.AR en entorno TEST · tarifa provisoria de prueba.</small>':''}` : ''}</div>
      ${state.shipping.method==='moto' ? `<a class="btn btn-ghost full" style="margin-top:10px" target="_blank" rel="noopener" href="${motoWhatsappUrl()}">Consultar demora por WhatsApp</a>` : ''}
      ${state.auth.user && state.shipping.method==='moto' ? `<label class="account-check save-address-check"><input type="checkbox" id="saveCheckoutAddress"> Guardar esta dirección en Mi cuenta</label>` : ''}
      <div class="checkout-actions"><button class="btn btn-ghost" id="backShippingBtn">Atrás</button><button class="btn btn-primary" id="payBtn">${state.config?.mercadopago?.enabled ? 'Pagar con Mercado Pago' : 'Crear pedido'}</button></div>
      ${!state.config?.mercadopago?.enabled ? '<div class="stock-note" style="text-align:right">Mercado Pago quedará activo apenas soporte habilite la visualización de las credenciales.</div>' : ''}`;
  }

  function shippingMethodLabel() { return state.shipping.method === 'moto' ? '🏍️ Motomensajería' : state.shipping.method === 'correo' ? '📦 Correo Argentino' : '📍 Retiro en SALMOS'; }

  async function releaseOwnPendingReservation() {
    try { await api('/api/orders/release-reservation', { method:'POST' }); } catch (err) { console.error(err); }
    state.pendingCheckout = null;
    localStorage.removeItem('salmos_pending_checkout');
  }

  async function createOrderAndPay() {
    const btn=qs('#payBtn'); if (btn) { btn.disabled=true; btn.textContent='Procesando...'; }
    try {
      const orderHeaders=new Headers();const customerToken=await currentIdToken().catch(()=> '');if(customerToken)orderHeaders.set('Authorization',`Bearer ${customerToken}`);
      const order = await api('/api/orders', { method:'POST', headers:orderHeaders, body:JSON.stringify({ customer:state.customer, items:state.cart.map(x=>({variantId:x.variantId,quantity:x.qty})), shipping:state.shipping, couponCode:state.coupon?.code||'' }) });
      state.order = order.order;
      state.pendingCheckout = { id:order.order.id, code:order.order.code, at:Date.now() };
      localStorage.setItem('salmos_pending_checkout', JSON.stringify(state.pendingCheckout));
      await saveCheckoutAddressIfRequested().catch(err=>console.error(err));
      if (state.config?.mercadopago?.enabled) {
        const pref = await api('/api/payments/mercadopago/preference', { method:'POST', body:JSON.stringify({ orderId:order.order.id }) });
        window.location.href = pref.initPoint;
      } else {
        state.cart=[]; state.shippingQuoteCarry=false; updateSavedShippingCarry(false); saveCart(false); if(state.auth.user) await syncCartNow([]);
        qs('#checkoutContent').innerHTML = `<div class="empty-state"><strong>Pedido ${escapeHtml(order.order.code)} creado.</strong>El pago online todavía está pendiente de las credenciales de Mercado Pago. El pedido ya quedó registrado para probar el flujo administrativo.</div><div style="margin-top:14px"><button class="btn btn-primary full" id="finishNoPayBtn">Volver a la tienda</button></div>`;
      }
    } catch (err) { toast(err.message,'error'); if(btn){btn.disabled=false;btn.textContent='Intentar nuevamente';} }
  }

  async function handlePaymentReturn() {
    const p = new URLSearchParams(location.search);
    const status = p.get('status') || p.get('collection_status');
    const returnKind = p.get('mp_return');
    const ref = p.get('external_reference') || state.pendingCheckout?.code || '';
    if (!status && !returnKind) return;
    if (status === 'approved' || returnKind === 'success' && status === 'approved') {
      state.cart=[]; state.shippingQuoteCarry=false; updateSavedShippingCarry(false); saveCart(false); state.paymentApprovedReturn=true;
      state.pendingCheckout=null; localStorage.removeItem('salmos_pending_checkout');
      toast(`Pago aprobado${ref ? ` · ${ref}` : ''}`, 'success');
    } else if (status === 'pending' || status === 'in_process' || returnKind === 'pending') {
      toast(`Pago pendiente${ref ? ` · ${ref}` : ''}`);
    } else {
      await releaseOwnPendingReservation();
      toast(`Pago cancelado o no aprobado${ref ? ` · ${ref}` : ''}. El producto volvió a quedar disponible.`, 'error');
    }
    history.replaceState({},'',location.pathname+location.hash);
  }

  function bindEvents() {
    qs('#themeBtn').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
    qs('#pageShareBtn')?.addEventListener('click', sharePage);
    qs('#searchBtn')?.addEventListener('click',()=>{const panel=qs('#headerSearchPanel');if(!panel)return;const opening=panel.classList.contains('hidden');panel.classList.toggle('hidden',!opening);qs('#searchBtn')?.classList.toggle('active',opening);if(opening)setTimeout(()=>qs('#searchInput')?.focus(),0);});
    qs('#accountBtn')?.addEventListener('click',()=>openAccount('profile'));
    qs('#favoritesBtn')?.addEventListener('click',()=>openAccount('favorites'));
    qs('#closeAccountBtn')?.addEventListener('click',closeAccount);
    qs('#accountBackdrop')?.addEventListener('click',closeAccount);
    qs('#cartBtn')?.addEventListener('click', openCart); qs('#footerCartBtn')?.addEventListener('click', openCart);
    qs('#closeCartBtn').addEventListener('click', closeCart); qs('#drawerBackdrop').addEventListener('click', closeCart);
    qs('#modalBackdrop').addEventListener('click', () => { closeModal('#productModal'); closeModal('#checkoutModal'); closeModal('#customOrderModal'); });
    qs('#closeCheckoutBtn').addEventListener('click', () => closeModal('#checkoutModal'));
    qs('#checkoutBtn').addEventListener('click', startCheckout);
    qs('#footerShippingQuoteBtn')?.addEventListener('click', startShippingQuote);
    qs('#heroShopBtn')?.addEventListener('click', () => qs('#productos')?.scrollIntoView({behavior:'smooth'}));
    qs('#flyersLaunchBtn')?.addEventListener('click',()=>{const sec=qs('#flyersSection');if(sec){sec.classList.remove('hidden');sec.scrollIntoView({behavior:'smooth',block:'start'});}});
    qs('#closeFlyersBtn')?.addEventListener('click',()=>qs('#flyersSection')?.classList.add('hidden'));
    qs('#clearFiltersBtn')?.addEventListener('click', () => { state.activeCategory='all'; state.query=''; qs('#searchInput').value=''; renderCategories(); renderProducts(); });
    qs('#searchInput').addEventListener('input', e => { state.query=e.target.value; renderProducts(); });
    if(qs('#year')) qs('#year').textContent = new Date().getFullYear();
    window.addEventListener('popstate',()=>{const key=currentProductPathKey();if(!key){if(qs('#productModal')?.classList.contains('open'))closeModal('#productModal');return;}openProductFromCurrentPath();});
    document.addEventListener('error',e=>{const img=e.target;if(!(img instanceof HTMLImageElement))return;const thumb=img.closest('.thumb');if(thumb)thumb.remove();if(img.classList.contains('detail-main-image')){const next=state.selectedProduct?.images?.find(m=>detailMediaType(m)==='image'&&m.url!==img.src);const host=qs('#detailMainMedia');if(next&&host)host.innerHTML=renderDetailMedia(next,state.selectedProduct?.name||'SALMOS');}},true);

    document.addEventListener('keydown',e=>{
      if(e.key==='Escape' && qs('#productImageViewer')?.classList.contains('open')){closeProductImageViewer();return;}
      if(e.target?.id==='couponInput' && e.key==='Enter'){e.preventDefault();applyCouponCode();}
    });

    document.addEventListener('click', async e => {
      const sf=e.target.closest('[data-share-flyer]');if(sf){e.preventDefault();await shareFlyer(sf.dataset.shareFlyer);return;}
      const fav=e.target.closest('[data-favorite-product]');if(fav){e.preventDefault();e.stopPropagation();await toggleFavorite(fav.dataset.favoriteProduct);return;}
      if(e.target.id==='googleSignInBtn'||e.target.id==='checkoutGoogleBtn'){await signInGoogle();return;}
      if(e.target.id==='signOutBtn'){await signOutGoogle();return;}
      const tab=e.target.closest('[data-account-tab]');if(tab){state.accountTab=tab.dataset.accountTab;renderAccountPanel();return;}
      if(e.target.id==='saveProfileBtn'){try{await saveProfile()}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='validateSaveAddressBtn'){await validateAndSaveAddress();return;}
      const def=e.target.closest('[data-default-address]');if(def){const a=state.auth.addresses.find(x=>Number(x.id)===Number(def.dataset.defaultAddress));if(a){try{await authApi(`/api/account/addresses/${a.id}`,{method:'PUT',body:JSON.stringify({label:a.label,recipientName:a.recipient_name,phone:a.phone,formattedAddress:a.formatted_address,lat:a.lat,lng:a.lng,notes:a.notes,isDefault:true})});await refreshAccount()}catch(err){toast(err.message,'error')}}return;}
      const del=e.target.closest('[data-delete-address]');if(del){try{await authApi(`/api/account/addresses/${del.dataset.deleteAddress}`,{method:'DELETE'});await refreshAccount();toast('Dirección eliminada','success')}catch(err){toast(err.message,'error')}return;}
      const af=e.target.closest('[data-open-favorite]');if(af){closeAccount();await openProduct(Number(af.dataset.openFavorite));return;}
      const useAddr=e.target.closest('[data-use-address]');if(useAddr){const a=state.auth.addresses.find(x=>Number(x.id)===Number(useAddr.dataset.useAddress));if(a){state.shipping.address=a.formatted_address;state.shipping.lat=Number(a.lat);state.shipping.lng=Number(a.lng);state.shipping.costCents=0;state.shipping.distanceKm=null;state.shippingQuoteCarry=false;state.area={query:a.label||'Dirección guardada',formattedAddress:a.formatted_address,lat:Number(a.lat),lng:Number(a.lng)};saveLastShipping({withQuote:false,carry:false});renderShippingDetail();try{await quoteMoto()}catch(err){toast(err.message,'error')}}return;}
      const areaSuggestion=e.target.closest('[data-area-suggestion]');if(areaSuggestion){const item=(state.areaSuggestions||[])[Number(areaSuggestion.dataset.areaSuggestion)];if(item){try{await resolveAreaChoice(item)}catch(err){toast(err.message,'error')}}return;}
      const addrSuggestion=e.target.closest('[data-address-suggestion]');if(addrSuggestion){const item=(state.addressSuggestions||[])[Number(addrSuggestion.dataset.addressSuggestion)];const text=item?.text||addrSuggestion.dataset.addressText||'';const main=item?.mainText||addrSuggestion.dataset.addressMain||text;const input=qs('#streetAddressInput');const hasNumber=/\b\d{1,6}[A-Za-z]?\b/.test(main);if(input){input.value=hasNumber?text:main;input.focus();if(!hasNumber)input.setSelectionRange(input.value.length,input.value.length);}const list=qs('#addressSuggestions');if(list)list.classList.add('hidden');state.streetSessionToken=null;if(hasNumber){try{await confirmTypedAddress(text)}catch(err){toast(err.message,'error')}}else{toast('Calle encontrada. Ahora agregá la altura.','success')}return;}
      if(e.target.id==='confirmTypedAddressBtn'){try{e.target.disabled=true;e.target.textContent='Ubicando...';await confirmTypedAddress(qs('#streetAddressInput')?.value||'')}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;e.target.textContent='Usar dirección'}return;}
      if(e.target.closest('[data-close-image-viewer]') || (e.target.id==='productImageViewer' && e.target.classList.contains('open'))){closeProductImageViewer();return;}
      const detailImage=e.target.closest('.detail-main-image');if(detailImage){openProductImageViewer(detailImage.currentSrc||detailImage.src,detailImage.alt||state.selectedProduct?.name||'SALMOS');return;}
      if(e.target.closest('[data-share-product]')){await shareSelectedProduct();return;}
      const card=e.target.closest('.product-card'); if(card){ if(card.dataset.saleMode==='order'){const p=state.products.find(x=>Number(x.id)===Number(card.dataset.productId));openCustomOrder('clothing',p||null);return;} openProduct(Number(card.dataset.productId)); return; }
      if(e.target.closest('[data-close-product]')) { closeModal('#productModal'); return; }
      const thumb=e.target.closest('[data-media-url]'); if(thumb){ qsa('.thumb',qs('#productModal')).forEach(x=>x.classList.remove('active')); thumb.classList.add('active'); const host=qs('#detailMainMedia'); if(host){ const item={url:thumb.dataset.mediaUrl,media_type:thumb.dataset.mediaType,alt_text:thumb.dataset.mediaAlt}; host.innerHTML=renderDetailMedia(item,state.selectedProduct?.name||'SALMOS'); } return; }
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
      if(e.target.id==='closeQuoteCheckoutBtn'){state.checkoutQuoteOnly=false;closeModal('#checkoutModal');return;}
      if(e.target.id==='quoteAddProductBtn'){state.shippingQuoteCarry=Boolean(state.shipping.method==='moto'&&state.shipping.address&&Number.isFinite(Number(state.shipping.lat))&&Number.isFinite(Number(state.shipping.lng))&&Number(state.shipping.costCents)>0);if(state.shippingQuoteCarry){saveLastShipping({withQuote:true,carry:true});updateSavedShippingCarry(true);}state.checkoutQuoteOnly=false;closeModal('#checkoutModal');renderCart();qs('#productos')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
      const ship=e.target.closest('[data-shipping]'); if(ship && !ship.disabled){ const method=ship.dataset.shipping;if(method===state.shipping.method&&method==='moto'&&state.shipping.address){renderCheckout();return;}if(method==='moto'){const currentAddress=state.shipping.address&&Number.isFinite(Number(state.shipping.lat))&&Number.isFinite(Number(state.shipping.lng));if(currentAddress){state.shipping.method='moto';state.shipping.correo=null;}else if(!restoreLastShipping({activateMoto:true,allowQuote:true})){state.shipping={method:'moto',costCents:0,distanceKm:null,address:null,lat:null,lng:null,quoteId:null,correo:null};}}else if(method==='correo'){state.shipping={method:'correo',costCents:0,distanceKm:null,address:null,lat:null,lng:null,quoteId:null,correo:{deliveryType:'homeDelivery',state:'',postalCode:'',inputAddress:'',agencyReference:'',agencyId:'',agencyName:'',address:null}};state.correoAgencies=[];state.correoAddressSuggestions=[];state.correoAgencySuggestions=[];state.correoAgencyArea=null;state.correoLastParcel=null;state.shippingQuoteCarry=false;updateSavedShippingCarry(false);}else{state.shipping={method,costCents:0,distanceKm:null,address:null,lat:null,lng:null,quoteId:null,correo:null};state.shippingQuoteCarry=false;updateSavedShippingCarry(false);} state.coupon=null; renderCheckout(); return; }
      const correoDelivery=e.target.closest('[data-correo-delivery]');if(correoDelivery){const type=correoDelivery.dataset.correoDelivery;state.shipping.correo={deliveryType:type,state:state.shipping.correo?.state||'',postalCode:state.shipping.correo?.postalCode||'',inputAddress:'',agencyReference:'',agencyId:'',agencyName:'',address:null};state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;state.shipping.quoteId=null;state.correoAgencies=[];state.correoAddressSuggestions=[];state.correoAgencySuggestions=[];state.correoAgencyArea=null;state.correoMapPreview=null;state.correoLastParcel=null;renderShippingDetail();return;}
      if(e.target.id==='loadCorreoAgenciesBtn'){try{e.target.disabled=true;await loadCorreoAgencies()}catch(err){toast(err.message,'error');state.correoAgenciesLoading=false;renderShippingDetail()}return;}
      const correoHomeSuggestion=e.target.closest('[data-correo-address-suggestion]');if(correoHomeSuggestion){try{await chooseCorreoHomeSuggestion(correoHomeSuggestion.dataset.correoAddressSuggestion);toast('Dirección seleccionada','success')}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='quoteCorreoBtn'){try{e.target.disabled=true;e.target.textContent='Calculando...';await quoteCorreoShipping()}catch(err){toast(err.message,'error');e.target.disabled=false;e.target.textContent='Calcular envío'}return;}
      const correoAgency=e.target.closest('[data-correo-agency]');if(correoAgency){try{await selectCorreoAgency(correoAgency.dataset.correoAgency);toast('Sucursal seleccionada','success')}catch(err){toast(err.message,'error')}return;}
      if(e.target.id==='useLocationBtn'){ try{e.target.disabled=true;await useCurrentLocation();}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;} return; }
      if(e.target.id==='quoteMotoBtn'){ try{e.target.disabled=true;e.target.textContent='Calculando...';await quoteMoto();}catch(err){toast(err.message,'error');e.target.disabled=false;e.target.textContent='Calcular motomensajería';} return; }
      if(e.target.id==='toSummaryBtn'){ if(!state.shipping.method) return; if(['moto','correo'].includes(state.shipping.method)&&!state.shipping.costCents){toast(state.shipping.method==='moto'?'Primero calculá la motomensajería.':'Primero completá y calculá el envío por Correo Argentino.','error');return;} state.checkoutStep=3;renderCheckout();return; }
      if(e.target.id==='backShippingBtn'){state.checkoutStep=2;renderCheckout();return;}
      if(e.target.id==='applyCouponBtn'){await applyCouponCode();return;}
      if(e.target.id==='removeCouponBtn'){removeCouponCode();return;}
      if(e.target.id==='payBtn'){await createOrderAndPay();return;}
      if(e.target.id==='finishNoPayBtn'){closeModal('#checkoutModal');return;}
    });
    document.addEventListener('change',async e=>{
      if(e.target.id==='correoProvinceSelect'){
        const ca=state.shipping.correo||{};ca.state=e.target.value;ca.address=null;ca.agencyId='';ca.agencyName='';ca.inputAddress='';ca.agencyReference='';state.shipping.correo=ca;
        state.correoFilterArea=null;state.correoMapPreview=null;state.correoAgencies=[];state.correoAddressSuggestions=[];state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;
        renderShippingDetail();
        if(ca.state||validCorreoPostal(ca.postalCode||'')){try{await resolveCorreoFilterArea(true);renderShippingDetail();}catch(err){toast(err.message,'error')}}
        return;
      }
    });
    document.addEventListener('input',e=>{
      if(e.target.id==='correoPostalCode'){
        const input=e.target,ca=state.shipping.correo||{};ca.postalCode=input.value.replace(/\s+/g,'').toUpperCase();ca.address=null;ca.agencyId='';ca.agencyName='';ca.inputAddress='';ca.agencyReference='';state.shipping.correo=ca;
        state.correoFilterArea=null;state.correoMapPreview=null;state.correoAgencies=[];state.correoAddressSuggestions=[];state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;
        clearTimeout(state.correoSuggestTimer);state.correoSuggestTimer=setTimeout(async()=>{
          if(ca.postalCode&&!validCorreoPostal(ca.postalCode)){await renderCorreoMap().catch(()=>{});return;}
          if(!ca.postalCode&&!ca.state){state.correoFilterArea=null;state.correoMapPreview=null;await renderCorreoMap().catch(()=>{});return;}
          try{await resolveCorreoFilterArea(true);renderShippingDetail();}catch(err){toast(err.message,'error')}
        },420);return;
      }
      if(e.target.id==='correoAgencyReferenceInput'){
        const value=e.target.value,ca=state.shipping.correo||{};ca.agencyReference=value;ca.agencyId='';ca.agencyName='';state.shipping.correo=ca;state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;state.correoMapPreview=null;state.correoAgencies=[];
        clearTimeout(state.correoSuggestTimer);state.correoSuggestTimer=setTimeout(()=>previewCorreoAddress(value).catch(()=>{}),320);return;
      }
      if(e.target.id!=='correoAddressInput')return;
      const value=e.target.value;const ca=state.shipping.correo||{};ca.inputAddress=value;ca.address=null;state.shipping.correo=ca;state.shipping.address=null;state.shipping.lat=null;state.shipping.lng=null;state.shipping.costCents=0;state.correoLastParcel=null;state.correoMapPreview=null;
      clearTimeout(state.correoSuggestTimer);state.correoSuggestTimer=setTimeout(async()=>{
        await previewCorreoAddress(value).catch(()=>{});
        await fetchCorreoSuggestions('home',value).catch(err=>toast(err.message,'error'));
      },320);
    });
  }


  let deferredInstallPrompt=null;
  function initInfoRotator(){
  }
  function initPwaInstall(){
    window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;qs('#pwaInstallBtn')?.classList.remove('hidden')});
    window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;qs('#pwaInstallBtn')?.classList.add('hidden');toast('SALMOS quedó instalada','success')});
    qs('#pwaInstallBtn')?.addEventListener('click',async()=>{if(!deferredInstallPrompt){toast('Usá la opción “Instalar aplicación” de tu navegador.');return;}deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;qs('#pwaInstallBtn')?.classList.add('hidden')});
  }
  const DTF_SHEET_PRICE_PESOS=12000;
  const DTF_CONFIG_PER_SHEET_PESOS=3000;
  const DTF_INDIVIDUAL_READY_PESOS=3000;
  const DTF_INDIVIDUAL_CONFIG_PESOS=4000;
  const DTF_SHEET_AREA_CM2=58*100;

  async function loadSalmosDesignCatalog(){
    if(state.designCatalogLoaded)return state.designCatalog;
    if(state.designCatalogPromise)return state.designCatalogPromise;
    state.designCatalogPromise=api('/api/designs').then(d=>{
      state.designCatalog=Array.isArray(d?.items)?d.items:[];
      state.designCatalogLoaded=true;
      return state.designCatalog;
    }).finally(()=>{state.designCatalogPromise=null});
    return state.designCatalogPromise;
  }
  function selectedSalmosDesigns(form){
    const ids=qsa('[name="selectedDesignIds"]:checked',form).map(x=>Number(x.value)).filter(Number.isInteger);
    const byId=new Map(state.designCatalog.map(d=>[Number(d.id),d]));
    return ids.map(id=>byId.get(id)||{id,name:`Diseño #${id}`}).filter(Boolean);
  }
  function updateDesignPickerCards(form){
    qsa('.salmos-design-card',form).forEach(card=>card.classList.toggle('selected',Boolean(qs('input[type="checkbox"]',card)?.checked)));
  }
  function syncDtfRowsFromSelectedDesigns(form){
    if(form.elements.kind?.value!=='dtf'||form.elements.designSource?.value!=='salmos')return;
    const selected=selectedSalmosDesigns(form);if(!selected.length)return;
    const list=qs('#customDtfDesignList',form);if(!list)return;
    const designMode=form.elements.designMode?.value||'same';
    if(designMode==='same_sizes'){
      const name=selected[0].name;
      const rows=qsa('[data-dtf-design-row]',list);
      if(!rows.length)list.innerHTML=dtfDesignRow(0,{label:name});
      qsa('[data-dtf-design-row]',list).forEach((row,i)=>{const input=qs('[data-dtf-label]',row);if(input)input.value=name;});
      return;
    }
    const existing=new Map(collectDtfDesigns(form).map(d=>[String(d.label||'').trim(),d]));
    const wanted=designMode==='same'?selected.slice(0,1):selected;
    list.innerHTML=wanted.map((d,i)=>dtfDesignRow(i,{...(existing.get(d.name)||{}),label:d.name})).join('');
  }
  async function refreshSalmosDesignPicker(form){
    const box=qs('#salmosDesignPicker',form);if(!box)return;
    const source=form.elements.designSource?.value||'personalizado';
    box.classList.toggle('hidden',source!=='salmos');
    if(source!=='salmos')return;
    const previous=new Set(qsa('[name="selectedDesignIds"]:checked',form).map(x=>Number(x.value)));
    const initialId=Number(form.elements.productId?.value)||0;
    box.innerHTML='<div class="salmos-design-loading">Cargando diseños SALMOS…</div>';
    try{
      const items=await loadSalmosDesignCatalog();
      if(!items.length){box.innerHTML='<div class="notice">Todavía no hay diseños publicados para elegir.</div>';return;}
      box.innerHTML=`<div class="salmos-design-picker-head"><strong>Elegí diseño SALMOS</strong><small>Podés marcar uno o varios.</small></div><div class="salmos-design-grid">${items.map(d=>{const checked=previous.has(Number(d.id))||(!previous.size&&initialId===Number(d.id));return `<label class="salmos-design-card ${checked?'selected':''}"><input type="checkbox" name="selectedDesignIds" value="${Number(d.id)}" ${checked?'checked':''}><span class="salmos-design-thumb">${d.primary_image_url?`<img src="${escapeHtml(d.primary_image_url)}" alt="${escapeHtml(d.name)}" loading="lazy">`:'<span>SALMOS</span>'}</span><span class="salmos-design-name">${escapeHtml(d.name)}</span></label>`}).join('')}</div>`;
      if(form.elements.kind?.value==='dtf'&&['same','same_sizes'].includes(form.elements.designMode?.value||'same')){
        const checked=qsa('[name="selectedDesignIds"]:checked',form);checked.slice(1).forEach(x=>x.checked=false);
      }
      updateDesignPickerCards(form);
      syncDtfRowsFromSelectedDesigns(form);
      if(form.elements.kind?.value==='dtf')updateDtfEstimate(form);
    }catch(err){box.innerHTML=`<div class="notice">No pudimos cargar los diseños. ${escapeHtml(err.message||'')}</div>`;}
  }
  function bindDesignPicker(form){
    if(form.dataset.designPickerBound==='1')return;form.dataset.designPickerBound='1';
    form.addEventListener('change',e=>{
      if(e.target.name==='designSource'){refreshSalmosDesignPicker(form);return;}
      if(e.target.name==='designMode'){
        if(['same','same_sizes'].includes(form.elements.designMode?.value||'same')){
          const checked=qsa('[name="selectedDesignIds"]:checked',form);checked.slice(1).forEach(x=>x.checked=false);
        }
        updateDesignPickerCards(form);syncDtfRowsFromSelectedDesigns(form);updateDtfEstimate(form);return;
      }
      if(e.target.name==='selectedDesignIds'){
        if(form.elements.kind?.value==='dtf'&&['same','same_sizes'].includes(form.elements.designMode?.value||'same')&&e.target.checked){qsa('[name="selectedDesignIds"]',form).forEach(x=>{if(x!==e.target)x.checked=false;});}
        updateDesignPickerCards(form);syncDtfRowsFromSelectedDesigns(form);if(form.elements.kind?.value==='dtf')updateDtfEstimate(form);
      }
    });
  }

  function customFileModeHint(kind,subtype,mode){
    if(kind!=='dtf')return 'Podés adjuntar imágenes o archivos de referencia. El original se guarda sin recomprimir.';
    if(subtype==='sheet'&&mode==='ready')return 'Plancha 58 × 100 cm: $12.000. Listo para imprimir admite únicamente PNG a 300 DPI, máximo 58 × 100 cm por archivo. Podés cargar varios.';
    if(subtype==='sheet'&&mode==='configure')return 'Plancha 58 × 100 cm: $12.000 + $3.000 de configuración por cada plancha. Podés subir el diseño como lo tengas.';
    if(subtype==='individual'&&mode==='ready')return 'Diseño individual listo para imprimir: $3.000 por unidad. PNG a 300 DPI.';
    if(subtype==='individual'&&mode==='configure')return 'Diseño individual a configurar: $4.000 por unidad.';
    return 'Elegí las opciones para ver las condiciones.';
  }
  async function readPngInfo(file){
    const buf=await file.arrayBuffer(),v=new DataView(buf);
    const sig=[137,80,78,71,13,10,26,10];for(let i=0;i<8;i++)if(v.getUint8(i)!==sig[i])throw new Error('No es un PNG válido.');
    const width=v.getUint32(16),height=v.getUint32(20);let dpi=null,off=8;
    while(off+12<=buf.byteLength){const len=v.getUint32(off),type=String.fromCharCode(v.getUint8(off+4),v.getUint8(off+5),v.getUint8(off+6),v.getUint8(off+7));if(type==='pHYs'&&len>=9){const x=v.getUint32(off+8),unit=v.getUint8(off+16);if(unit===1)dpi=x*0.0254;break;}off+=12+len;}
    return {width,height,dpi};
  }
  async function validateReadyDtfFiles(files,subtype){
    const results=[];for(const f of files){
      try{
        if(f.type!=='image/png'&&!/\.png$/i.test(f.name))throw new Error('Debe ser PNG');
        const inf=await readPngInfo(f);
        if(!inf.dpi||Math.abs(inf.dpi-300)>6)throw new Error(inf.dpi?`DPI detectados: ${Math.round(inf.dpi)} (se requieren 300)`:'El PNG no informa 300 DPI');
        if(subtype==='sheet'&&(inf.width>6851||inf.height>11811))throw new Error(`Supera 58 × 100 cm a 300 DPI (${inf.width}×${inf.height}px)`);
        results.push({file:f,ok:true,text:`${f.name}: ${inf.width}×${inf.height}px · ${Math.round(inf.dpi)} DPI`});
      }catch(e){results.push({file:f,ok:false,text:`${f.name}: ${e.message}`});}
    }return results;
  }
  function closeCustomOrder(){closeModal('#customOrderModal');}
  function dtfDesignRow(index,{label='',widthCm=30,heightCm=30,quantity=1}={}){
    return `<div class="custom-dtf-design-row" data-dtf-design-row>
      <div class="design-label-field"><label>Diseño</label><input class="input" data-dtf-label value="${escapeHtml(label||`Diseño ${index+1}`)}" placeholder="Nombre o referencia"></div>
      <div><label>Ancho cm</label><input class="input" data-dtf-width type="number" min="1" max="58" step="0.5" value="${Number(widthCm)||30}"></div>
      <div><label>Alto cm</label><input class="input" data-dtf-height type="number" min="1" max="100" step="0.5" value="${Number(heightCm)||30}"></div>
      <div><label>Cantidad</label><input class="input" data-dtf-qty type="number" min="1" max="999" value="${Number(quantity)||1}"></div>
      <button class="custom-dtf-remove" type="button" data-remove-dtf-design aria-label="Quitar diseño">×</button>
    </div>`;
  }
  function collectDtfDesigns(form){
    return qsa('[data-dtf-design-row]',form).map((row,i)=>({
      label:qs('[data-dtf-label]',row)?.value.trim()||`Diseño ${i+1}`,
      widthCm:Math.max(1,Math.min(58,Number(qs('[data-dtf-width]',row)?.value)||30)),
      heightCm:Math.max(1,Math.min(100,Number(qs('[data-dtf-height]',row)?.value)||30)),
      quantity:Math.max(1,Math.min(999,Math.trunc(Number(qs('[data-dtf-qty]',row)?.value)||1)))
    }));
  }
  function dtfEstimate(form){
    const subtype=form.elements.subtype?.value||'sheet',mode=form.elements.fileMode?.value||'ready';
    const designs=collectDtfDesigns(form);const totalQty=designs.reduce((n,d)=>n+d.quantity,0);
    const totalArea=designs.reduce((n,d)=>n+(d.widthCm*d.heightCm*d.quantity),0);
    const areaSheets=Math.max(1,Math.ceil(totalArea/DTF_SHEET_AREA_CM2));
    const requested=Math.max(1,Math.trunc(Number(form.elements.requestedSheets?.value)||1));
    const estimatedSheets=Math.max(requested,areaSheets);
    if(subtype==='individual'){
      const unit=mode==='configure'?DTF_INDIVIDUAL_CONFIG_PESOS:DTF_INDIVIDUAL_READY_PESOS;
      return {designs,totalQty,totalArea,requestedSheets:0,areaSheets:0,estimatedSheets:0,approxPerSheet:0,totalPesos:totalQty*unit,unitPesos:unit};
    }
    const first=designs[0]||{widthCm:30,heightCm:30};
    const approxPerSheet=Math.max(1,Math.floor(DTF_SHEET_AREA_CM2/Math.max(1,first.widthCm*first.heightCm)));
    const unit=DTF_SHEET_PRICE_PESOS+(mode==='configure'?DTF_CONFIG_PER_SHEET_PESOS:0);
    return {designs,totalQty,totalArea,requestedSheets:requested,areaSheets,estimatedSheets,approxPerSheet,totalPesos:estimatedSheets*unit,unitPesos:unit};
  }
  function updateDtfEstimate(form){
    const box=qs('#customDtfEstimate',form);if(!box)return;
    const e=dtfEstimate(form),subtype=form.elements.subtype?.value||'sheet',mode=form.elements.fileMode?.value||'ready';
    if(subtype==='individual'){
      box.innerHTML=`<strong>Estimación:</strong> ${e.totalQty} ${e.totalQty===1?'diseño':'diseños'} × $${e.unitPesos.toLocaleString('es-AR')} = <span class="custom-dtf-price">$${e.totalPesos.toLocaleString('es-AR')}</span>. Seña estimada 50%: $${Math.round(e.totalPesos/2).toLocaleString('es-AR')}.`;
      return;
    }
    const standard=e.designs.length===1&&Math.abs(e.designs[0].widthCm-30)<.01&&Math.abs(e.designs[0].heightCm-30)<.01;
    const designMode=form.elements.designMode?.value||'same';
    const ref=designMode==='different'
      ? `Diseños diferentes: por superficie total el mínimo teórico es ${e.areaSheets} ${e.areaSheets===1?'plancha':'planchas'}; el acomodo real puede requerir más.`
      : designMode==='same_sizes'
        ? `Mismo diseño en diferentes medidas: por superficie total el mínimo teórico es ${e.areaSheets} ${e.areaSheets===1?'plancha':'planchas'}; el acomodo real puede requerir más.`
        : (standard?'Referencia: 30 × 30 cm ≈ 6 diseños por plancha por cálculo de superficie.':`Por superficie, ese tamaño da ≈ ${e.approxPerSheet} por plancha.`);
    const warning=e.areaSheets>e.requestedSheets?` <span class="custom-dtf-warning">Elegiste ${e.requestedSheets} m/planchas, pero por superficie estimamos al menos ${e.areaSheets}.</span>`:'';
    box.innerHTML=`<strong>Estimación:</strong> ${e.estimatedSheets} ${e.estimatedSheets===1?'plancha / metro':'planchas / metros'} × $${e.unitPesos.toLocaleString('es-AR')} = <span class="custom-dtf-price">$${e.totalPesos.toLocaleString('es-AR')}</span>. Seña estimada 50%: $${Math.round(e.totalPesos/2).toLocaleString('es-AR')}. ${ref}${warning}<br><small>La cantidad final de metros queda sujeta al acomodo real de los diseños y se confirma personalmente antes de producir.</small>`;
  }
  function renderCustomDynamicFields(form,kind,product=null){
    const host=qs('#customDynamicFields',form);if(!host)return;
    const productName=product?.name||form.elements.productName?.value||'';
    if(kind==='clothing'){
      host.innerHTML=`
        <div class="custom-order-section-title">Ropa por pedido</div>
        <div class="field"><label>Prenda</label><select class="select" name="subtype"><option value="clasica">Remera corte clásico</option><option value="oversize">Remera oversize</option><option value="crop-over">Remera crop over</option><option value="chomba">Chomba clásica</option><option value="gorra">Gorra</option></select></div>
        <div class="field"><label>Terminación</label><select class="select" name="finish"><option value="estampada">Estampada</option><option value="lisa">Lisa</option></select></div>
        <div class="field"><label>Diseño</label><select class="select" name="designSource"><option value="salmos" ${productName?'selected':''}>Diseño SALMOS</option><option value="personalizado">Diseño personalizado</option></select></div>
        <div class="field"><label>Cantidad</label><input class="input" type="number" name="quantity" min="1" value="1"></div>
        <div class="field full salmos-design-picker hidden" id="salmosDesignPicker"></div>
        <div class="field full"><label>Archivos / referencias</label><input class="input" id="customOrderFiles" name="files" type="file" multiple accept="image/*,application/pdf,.psd,.ai,.eps,.svg"><div class="custom-file-hint" id="customFileHint">Podés adjuntar referencias. Guardamos el original sin recomprimir.</div></div>`;
      return;
    }
    host.innerHTML=`
      <div class="custom-order-section-title">DTF</div>
      <div class="field"><label>Modalidad</label><select class="select" name="subtype"><option value="sheet">Por plancha / metro (58 × 100 cm)</option><option value="individual">Diseño individual</option></select></div>
      <div class="field"><label>Preparación del archivo</label><select class="select" name="fileMode"><option value="ready">Listo para imprimir</option><option value="configure">A configurar</option></select></div>
      <div class="field"><label>Origen del diseño</label><select class="select" name="designSource"><option value="salmos">Diseño SALMOS</option><option value="personalizado" selected>Diseño personalizado</option></select></div>
      <div class="field"><label>Diseños</label><select class="select" name="designMode"><option value="same">Mismo diseño · misma medida</option><option value="same_sizes">Mismo diseño · diferentes medidas</option><option value="different">Diseños diferentes</option></select></div>
      <div class="field full salmos-design-picker hidden" id="salmosDesignPicker"></div>
      <div class="field" data-sheet-request-field><label>Metros / planchas solicitadas</label><input class="input" type="number" name="requestedSheets" min="1" step="1" value="1"><div class="custom-file-hint">1 plancha = 58 × 100 cm = 1 metro.</div></div>
      <div class="custom-dtf-builder">
        <div class="custom-dtf-builder-head"><strong>Tamaño y cantidad de cada diseño</strong><button class="btn btn-ghost hidden" type="button" id="addDtfDesignBtn">+ Agregar diseño</button></div>
        <div class="custom-dtf-design-list" id="customDtfDesignList">${dtfDesignRow(0)}</div>
        <div class="custom-dtf-estimate" id="customDtfEstimate"></div>
      </div>
      <div class="field full"><label>Archivos</label><input class="input" id="customOrderFiles" name="files" type="file" multiple accept="image/png,image/*,application/pdf,.psd,.ai,.eps,.svg,.tif,.tiff"><div class="custom-file-hint" id="customFileHint"></div><div class="custom-file-checks" id="customFileChecks"></div></div>`;
    bindDtfBuilder(form);
  }
  function bindDtfBuilder(form){
    const sync=()=>{
      const subtype=form.elements.subtype?.value||'sheet',mode=form.elements.fileMode?.value||'ready',designMode=form.elements.designMode?.value||'same';
      const sheetField=qs('[data-sheet-request-field]',form);if(sheetField)sheetField.classList.toggle('hidden',subtype!=='sheet');
      const designSource=form.elements.designSource?.value||'personalizado';
      const add=qs('#addDtfDesignBtn',form);
      if(add){
        add.textContent=designMode==='same_sizes'?'+ Agregar medida':'+ Agregar diseño';
        add.classList.toggle('hidden',designMode==='same'||(designMode==='different'&&designSource==='salmos'));
      }
      const rows=qsa('[data-dtf-design-row]',form);if(designMode==='same'&&rows.length>1)rows.slice(1).forEach(r=>r.remove());
      if(designSource==='salmos')syncDtfRowsFromSelectedDesigns(form);
      const currentRows=qsa('[data-dtf-design-row]',form);
      qsa('[data-remove-dtf-design]',form).forEach((b,i)=>b.classList.toggle('hidden',designMode==='same'||(i===0&&currentRows.length===1)));
      const hint=qs('#customFileHint',form);if(hint)hint.textContent=customFileModeHint('dtf',subtype,mode);
      updateDtfEstimate(form);
    };
    form.addEventListener('input',e=>{if(e.target.closest('#customDynamicFields'))sync();});
    form.addEventListener('change',async e=>{
      if(e.target.closest('#customDynamicFields'))sync();
      if(e.target.id==='customOrderFiles'&&form.elements.fileMode?.value==='ready'){
        const checks=qs('#customFileChecks',form),res=await validateReadyDtfFiles([...e.target.files],form.elements.subtype.value);
        if(checks)checks.innerHTML=res.map(x=>`<div class="custom-file-check ${x.ok?'ok':'bad'}">${escapeHtml(x.ok?'✓ '+x.text:'✕ '+x.text)}</div>`).join('');
      }
    });
    qs('#addDtfDesignBtn',form)?.addEventListener('click',()=>{const list=qs('#customDtfDesignList',form);if(!list)return;const mode=form.elements.designMode?.value||'same';const selected=selectedSalmosDesigns(form);const label=mode==='same_sizes'&&form.elements.designSource?.value==='salmos'&&selected[0]?selected[0].name:'';list.insertAdjacentHTML('beforeend',dtfDesignRow(qsa('[data-dtf-design-row]',form).length,{label}));sync();});
    qs('#customDtfDesignList',form)?.addEventListener('click',e=>{const b=e.target.closest('[data-remove-dtf-design]');if(!b)return;b.closest('[data-dtf-design-row]')?.remove();sync();});
    sync();
  }
  function setCustomKind(form,kind,product=null){
    form.elements.kind.value=kind;
    qsa('[data-custom-type]',form).forEach(b=>b.classList.toggle('active',b.dataset.customType===kind));
    renderCustomDynamicFields(form,kind,product);
    refreshSalmosDesignPicker(form);
  }
  function openCustomOrder(kind='choose',product=null){
    const host=qs('#customOrderContent');if(!host)return;openModal('#customOrderModal');
    const initialKind=kind==='dtf'?'dtf':'clothing',productName=product?.name||'';
    host.innerHTML=`<div class="custom-order-head"><div class="eyebrow">SALMOS · Por pedido</div><h2>${productName?escapeHtml(productName):'Solicitar por pedido'}</h2><p>Completá una sola solicitud. Si es DTF, podés indicar medidas, cantidades y varios diseños.</p></div>
      <form class="custom-order-form" id="customOrderForm">
        <input type="hidden" name="kind" value="${initialKind}"><input type="hidden" name="productId" value="${product?.id||''}"><input type="hidden" name="productName" value="${escapeHtml(productName)}">
        <div class="custom-order-type-row">
          <button class="custom-order-type-btn ${initialKind==='clothing'?'active':''}" type="button" data-custom-type="clothing"><strong>Ropa</strong><small>Remeras · Chombas · Gorras</small></button>
          <button class="custom-order-type-btn ${initialKind==='dtf'?'active':''}" type="button" data-custom-type="dtf"><strong>DTF</strong><small>Por metro o individual</small></button>
        </div>
        <div class="form-grid">
          <div id="customDynamicFields" class="form-grid-nested" style="display:contents"></div>
          <div class="field full"><label>Aclaraciones</label><textarea class="textarea" name="notes" rows="4" placeholder="Talles, colores, ubicación de estampa, medidas especiales u observaciones..."></textarea></div>
          <div class="custom-order-section-title full">Tus datos</div>
          <div class="field"><label>Nombre y apellido</label><input class="input" name="customerName" required value="${escapeHtml(state.customer?.name||'')}"></div>
          <div class="field"><label>WhatsApp</label><input class="input" name="customerPhone" required value="${escapeHtml(state.customer?.phone||'')}"></div>
          <div class="field full"><label>Email (opcional)</label><input class="input" type="email" name="customerEmail" value="${escapeHtml(state.auth.user?.email||state.customer?.email||'')}"></div>
        </div>
        <div class="order-conditions"><strong>Condiciones:</strong> tiempo estimado de 24 a 72 hs, sujeto a cantidad y disponibilidad. El trabajo se confirma con una seña del 50%. En DTF por metro, el cálculo final queda sujeto al orden y acomodo real de los diseños.</div>
        <button class="btn btn-primary full" type="submit" id="submitCustomOrderBtn">Enviar solicitud</button>
      </form>`;
    const form=qs('#customOrderForm',host);
    bindDesignPicker(form);
    qsa('[data-custom-type]',form).forEach(b=>b.addEventListener('click',()=>setCustomKind(form,b.dataset.customType,product)));
    setCustomKind(form,initialKind,product);
    form.addEventListener('submit',submitCustomOrder);
  }
  async function submitCustomOrder(e){
    e.preventDefault();const form=e.currentTarget,btn=qs('#submitCustomOrderBtn',form),fd=new FormData(form),kind=fd.get('kind'),subtype=fd.get('subtype'),fileMode=fd.get('fileMode')||'',files=[...(form.elements.files?.files||[])];
    try{
      btn.disabled=true;btn.textContent='Preparando pedido...';
      if(kind==='dtf'&&fileMode==='ready'&&files.length){const res=await validateReadyDtfFiles(files,subtype);const bad=res.find(x=>!x.ok);if(bad)throw new Error(`Revisá el archivo: ${bad.text}`);}
      const notes=[fd.get('finish')?`Terminación: ${fd.get('finish')}`:'',fd.get('notes')||''].filter(Boolean).join('\n');
      const designSource=fd.get('designSource')||'personalizado';
      const selectedDesigns=designSource==='salmos'?selectedSalmosDesigns(form):[];
      if(designSource==='salmos'&&!selectedDesigns.length)throw new Error('Elegí al menos un diseño SALMOS.');
      if(kind==='dtf'&&['same','same_sizes'].includes(fd.get('designMode')||'same')&&selectedDesigns.length>1)throw new Error('Para “Mismo diseño” elegí un solo diseño SALMOS.');
      let designs=[],requestedSheets=0,estimated=null,quantity=Number(fd.get('quantity'))||1;
      if(kind==='dtf'){
        syncDtfRowsFromSelectedDesigns(form);
        estimated=dtfEstimate(form);designs=estimated.designs;quantity=estimated.totalQty;requestedSheets=estimated.requestedSheets;
      }
      const firstSelected=selectedDesigns[0]||null;
      const selectedNames=selectedDesigns.map(d=>d.name).join(' · ');
      const payload={customerName:fd.get('customerName'),customerPhone:fd.get('customerPhone'),customerEmail:fd.get('customerEmail'),kind,subtype,productId:firstSelected?.id||fd.get('productId'),productName:selectedNames||fd.get('productName'),designSource,fileMode,designMode:fd.get('designMode')||'',quantity,requestedSheets,sheets:requestedSheets,designs,selectedDesigns:selectedDesigns.map(d=>({id:d.id})),notes};
      const created=await api('/api/custom-orders',{method:'POST',body:JSON.stringify(payload)});const order=created.item;
      if(files.length){btn.textContent='Subiendo archivos originales...';const up=new FormData();up.append('uploadToken',order.uploadToken);files.forEach(f=>up.append('files',f));await api(`/api/custom-orders/${order.id}/files`,{method:'POST',body:up});}
      const known=Number(order.knownExtraCents)||0,total=Number(order.quotedTotalCents)||0,deposit=Number(order.depositCents)||0,whatsapp=state.config?.whatsapp||'5491162691341';
      const dtfDetail=kind==='dtf'?[
        `DTF: ${subtype==='sheet'?'por plancha/metro 58x100':'individual'} · ${fileMode==='ready'?'listo para imprimir':'a configurar'}`,
        `Diseños: ${(fd.get('designMode')||'same')==='different'?'diferentes':(fd.get('designMode')||'same')==='same_sizes'?'mismo diseño en diferentes medidas':'mismo diseño'}`,
        designs.map(d=>`${d.label}: ${d.widthCm}×${d.heightCm} cm × ${d.quantity}`).join(' | '),
        subtype==='sheet'?`Metros solicitados: ${requestedSheets} · estimados: ${Number(order.estimatedSheets)||estimated?.estimatedSheets||requestedSheets}`:''
      ].filter(Boolean):[];
      const selectedSummary=selectedDesigns.length?`Diseño(s) SALMOS: ${selectedDesigns.map(d=>d.name).join(' · ')}`:(fd.get('productName')?`Diseño: ${fd.get('productName')}`:'');
      const summary=[`Hola SALMOS, envié el pedido ${order.code}.`,...dtfDetail,kind==='clothing'?`Ropa: ${subtype}`:'',selectedSummary,`Cantidad total: ${quantity}`,total?`Total estimado: ${money(total)} · Seña 50%: ${money(deposit)}`:(known?`Costo de configuración ya determinado: ${money(known)}. Falta confirmar el total.`:`La seña será del 50% del total confirmado.`),kind==='dtf'&&subtype==='sheet'?'La cantidad final de metros queda sujeta al acomodo de los diseños.':''].filter(Boolean).join('\n');
      qs('#customOrderContent').innerHTML=`<div class="custom-order-result"><div class="eyebrow">Solicitud recibida</div><h2>Tu pedido quedó registrado</h2><div class="code">${escapeHtml(order.code)}</div><p>Guardamos los archivos originales. ${deposit?`Seña estimada: <strong>${money(deposit)}</strong>. El total se confirma antes de producir.`:''} Ahora podés enviarnos el resumen por WhatsApp para acordar los detalles finales.</p><a class="btn btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${encodeURIComponent(whatsapp)}?text=${encodeURIComponent(summary)}">Continuar por WhatsApp</a><button class="btn btn-ghost" type="button" id="finishCustomOrderBtn">Cerrar</button></div>`;
    }catch(err){toast(err.message,'error');btn.disabled=false;btn.textContent='Enviar solicitud';}
  }
  document.addEventListener('click',e=>{
    const custom=e.target.closest('[data-custom-kind]');if(custom){openCustomOrder(custom.dataset.customKind);return;}
    if(e.target.id==='closeCustomOrderBtn'||e.target.id==='finishCustomOrderBtn'){closeCustomOrder();return;}
  });

  async function boot() {
    initTheme();initInfoRotator();initPwaInstall();
    restoreLastShipping({activateMoto:false,allowQuote:true,restoreCarry:true});
    ensureAccountUi(); bindEvents(); await handlePaymentReturn();
    await Promise.all([loadStore(), initFirebaseAuth()]);
  }
  boot();
})();
