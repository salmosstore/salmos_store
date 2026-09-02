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
  const DEFAULT_SHARE_META = {
    title: 'SALMOS — Tienda',
    description: 'SALMOS · creer · amar · crear · remeras y más',
    image: `${location.origin}/banner-salmos.png`,
    imageAlt: 'SALMOS · creer · amar · crear · remeras y más',
    url: `${location.origin}/`
  };
  function clipText(value='', max=180) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    return clean.length > max ? `${clean.slice(0, max - 1).trim()}…` : clean;
  }
  function upsertMeta(attrName, attrValue, content) {
    if (!attrValue) return;
    let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', String(content || ''));
  }
  function setCanonical(url) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', url || DEFAULT_SHARE_META.url);
  }
  function applyShareMeta({ title, description, image, imageAlt, url, type='website' } = {}) {
    const meta = {
      title: title || DEFAULT_SHARE_META.title,
      description: clipText(description || DEFAULT_SHARE_META.description, 180),
      image: image || DEFAULT_SHARE_META.image,
      imageAlt: imageAlt || DEFAULT_SHARE_META.imageAlt,
      url: url || DEFAULT_SHARE_META.url,
      type
    };
    document.title = meta.title;
    upsertMeta('name', 'description', meta.description);
    upsertMeta('property', 'og:site_name', 'SALMOS');
    upsertMeta('property', 'og:locale', 'es_AR');
    upsertMeta('property', 'og:type', meta.type);
    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:url', meta.url);
    upsertMeta('property', 'og:image', meta.image);
    upsertMeta('property', 'og:image:alt', meta.imageAlt);
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
    upsertMeta('name', 'twitter:image', meta.image);
    setCanonical(meta.url);
  }
  function applyDefaultShareMeta() {
    applyShareMeta(DEFAULT_SHARE_META);
  }
  function applyProductShareMeta(product) {
    if (!product) return applyDefaultShareMeta();
    const image = firstProductImage(product) || DEFAULT_SHARE_META.image;
    const description = product.short_description || product.verse_text || product.meaning_text || DEFAULT_SHARE_META.description;
    applyShareMeta({
      title: `${product.name} · SALMOS`,
      description,
      image,
      imageAlt: product.name || 'Producto de SALMOS',
      url: productShareUrl(product),
      type: 'product'
    });
  }
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
    applyDefaultShareMeta();
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
    shipping: { method: null, costCents: 0, distanceKm: null, address: null, lat: null, lng: null, quoteId: null },
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
    shippingQueriesRemaining: null
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
      const wa=qs('#footerWhatsapp');if(wa)wa.href = `https://wa.me/${whatsapp}`;
      await loadPublicFlyers().catch(err=>console.error('Flyers',err));
      await openProductFromCurrentPath();
    } catch (err) {
      console.error(err);
      qs('#productGrid').innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>No pudimos cargar la tienda.</strong>${API ? escapeHtml(err.message) : 'Falta conectar el sitio con el Worker de SALMOS en config.js.'}</div>`;
    }
  }

  function renderCategories() {
    const row = qs('#categoryRow');
    const bar = qs('#categoryBar') || row?.closest('.category-bar');
    if(!row) return;
    const visibleCategorySlugs = new Set(state.products.map(p => p.category_slug).filter(Boolean));
    const visibleCategories = state.categories.filter(c => visibleCategorySlugs.has(c.slug));
    const showBar = visibleCategories.length > 1;
    if(bar) bar.classList.toggle('hidden', !showBar);
    if (!showBar || (state.activeCategory !== 'all' && !visibleCategorySlugs.has(state.activeCategory))) state.activeCategory = 'all';
    row.innerHTML = showBar ? (`<button class="chip ${state.activeCategory==='all'?'active':''}" data-category="all">Todo</button>` + visibleCategories.map(c => `<button class="chip ${state.activeCategory===c.slug?'active':''}" data-category="${escapeHtml(c.slug)}">${escapeHtml(c.name)}</button>`).join('')) : '';
    if(row.dataset.bound!=='1'){
      row.dataset.bound='1';
      row.addEventListener('click', e => {
        const btn = e.target.closest('[data-category]');
        if (!btn) return;
        state.activeCategory = btn.dataset.category;
        qsa('.chip', row).forEach(x => x.classList.toggle('active', x === btn));
        renderProducts();
        qs('#productos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
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
      <div class="product-media">${image}<div class="product-tags">${tags}</div><button class="favorite-btn ${state.auth.favoriteIds.has(Number(p.id))?'active':''}" data-favorite-product="${p.id}" aria-label="Guardar en favoritos" title="Favorito"><svg class="favorite-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" fill="currentColor"/></svg></button></div>
      <div class="product-body">
        <div class="product-name">${escapeHtml(p.name)}</div>
        <div class="price-row"><span class="price">${money(p.price_cents)}</span>${p.compare_at_cents > p.price_cents ? `<span class="price-old">${money(p.compare_at_cents)}</span>` : ''}</div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const items = filteredProducts();
    const title = state.activeCategory === 'all' ? 'Productos' : (state.categories.find(c => c.slug === state.activeCategory)?.name || 'Productos');
    const t=qs('#productsTitle'),sub=qs('#productsSubtitle'),clear=qs('#clearFiltersBtn');
    if(t)t.textContent = state.query ? `Resultados para “${state.query}”` : title;
    if(sub)sub.textContent = items.length ? `${items.length} ${items.length === 1 ? 'producto' : 'productos'}` : 'No encontramos productos con ese filtro.';
    if(clear)clear.classList.toggle('hidden', state.activeCategory === 'all' && !state.query);
    const grid=qs('#productGrid');if(!grid)return;
    grid.innerHTML = items.length ? items.map(productCard).join('') : `<div class="empty-state" style="grid-column:1/-1"><strong>No hay productos para mostrar.</strong>Probá otra búsqueda.</div>`;
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
      applyProductShareMeta(p);
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

  async function fetchShareImageFile(url, baseName='salmos') {
    if (!url || typeof File === 'undefined') return null;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudo descargar la imagen a compartir.');
      const blob = await res.blob();
      const extFromType = String(blob.type || '').split('/')[1]?.split(';')[0] || '';
      const extFromUrl = (String(url).match(/\.(png|jpe?g|webp|gif)(?:$|\?)/i) || [])[1] || '';
      const ext = (extFromType || extFromUrl || 'jpg').replace(/jpeg/i, 'jpg');
      const fileName = `${productPathSegment(baseName) || 'salmos'}.${ext}`;
      return new File([blob], fileName, { type: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    } catch {
      return null;
    }
  }

  async function shareSelectedProduct() {
    const p=state.selectedProduct;if(!p)return;
    const url=productShareUrl(p);
    const title=`${p.name} · SALMOS`;
    const text=clipText(p.short_description || p.verse_text || `Mirá ${p.name} en SALMOS`, 120);
    try{
      if(navigator.share){
        const imageUrl = firstProductImage(p);
        const file = imageUrl ? await fetchShareImageFile(imageUrl, `${p.name}-salmos`) : null;
        if(file && navigator.canShare?.({files:[file]})){
          await navigator.share({title,text,url,files:[file]});
          return;
        }
        await navigator.share({title,text,url});
        return;
      }
      await navigator.clipboard.writeText(url);
      toast('Link del producto copiado','success');
    }catch(err){
      if(err?.name==='AbortError')return;
      try{await navigator.clipboard.writeText(url);toast('Link del producto copiado','success')}catch{toast(url)}
    }
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
    const sizes = [...new Set(availableVariants.filter(v => !state.selectedColor || v.color === state.selectedColor).map(v => v.size || 'Única'))];
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
          <div class="product-attribute-line" aria-label="Opciones del producto">
            <div class="product-attribute-cell product-attribute-size"><span class="detail-label">Talle</span><div class="attribute-options">${sizes.length?sizes.map(size => { const v=availableVariants.find(v => (v.color||'') === (state.selectedColor||'') && (v.size||'Única')===size) || availableVariants.find(v => !state.selectedColor && (v.size||'Única')===size); return `<button class="option compact-option ${v?.id===Number(state.selectedVariantId)?'active':''}" data-variant="${v?.id||''}">${escapeHtml(size)}</button>`; }).join(''):'<span class="attribute-static attribute-chip">—</span>'}</div></div>
            <div class="product-attribute-cell product-attribute-fit"><span class="detail-label">Corte</span><span class="attribute-static attribute-chip">${escapeHtml(p.fit||'—')}</span></div>
            <div class="product-attribute-cell product-attribute-color"><span class="detail-label">Color</span><div class="attribute-options">${colors.length?colors.map(c=>`<button class="option compact-option ${c===state.selectedColor?'active':''}" data-color="${escapeHtml(c)}">${escapeHtml(c || 'Único')}</button>`).join(''):'<span class="attribute-static attribute-chip">—</span>'}</div></div>
          </div>
          ${p.verse_text ? `<div class="detail-verse-centered"><div class="detail-verse-text">${escapeHtml(p.verse_text)}</div>${p.verse_reference ? `<div class="detail-verse-reference">${escapeHtml(p.verse_reference)}</div>` : ''}</div>` : ''}
          <p class="detail-description">${escapeHtml(p.short_description || '')}</p>
          ${p.meaning_text ? `<p class="detail-description detail-meaning-plain">${escapeHtml(p.meaning_text)}</p>` : ''}
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
    if(!restored) state.shipping = { method: null, costCents: 0, distanceKm: null, address: null, lat: null, lng: null, quoteId: null };
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
        <button class="shipping-card ${state.shipping.method==='correo'?'active':''} ${correoEnabled?'':'disabled'}" data-shipping="correo" ${correoEnabled?'':'disabled'}><span class="shipping-icon">📦</span><span class="shipping-copy"><strong>Correo Argentino</strong><small>${correoEnabled?'Domicilio o sucursal':'Integración pendiente de habilitación'}</small></span><span class="shipping-price">${correoEnabled?'Calcular':'Próximamente'}</span></button>
        <button class="shipping-card ${state.shipping.method==='pickup'?'active':''} ${pickupEnabled?'':'disabled'}" data-shipping="pickup" ${pickupEnabled?'':'disabled'}><span class="shipping-icon">📍</span><span class="shipping-copy"><strong>Retiro en SALMOS</strong><small>${pickupEnabled?escapeHtml(pc.shipping.pickup.address || 'Coordinar retiro'):'Se habilitará desde administración'}</small></span><span class="shipping-price">Gratis</span></button>
      </div>
      <div id="shippingDetail"></div>
      ${state.checkoutQuoteOnly?'<div class="checkout-actions quote-only-actions"><button class="btn btn-ghost" id="closeQuoteCheckoutBtn">Cerrar</button><button class="btn btn-primary" id="quoteAddProductBtn">Agregar un producto</button></div>':`<div class="checkout-actions"><button class="btn btn-ghost" id="backCustomerBtn">Atrás</button><button class="btn btn-primary" id="toSummaryBtn" ${state.shipping.method && (state.shipping.method!=='moto' || state.shipping.costCents>0) ? '' : 'disabled'}>Continuar</button></div>`}`;
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
      <div class="summary-list">${state.cart.map(x=>`<div class="summary-item"><div><strong>${escapeHtml(x.name)}</strong><br><small>${escapeHtml([x.color,x.size].filter(Boolean).join(' · '))} · x${x.qty}</small></div><strong>${money(x.priceCents*x.qty)}</strong></div>`).join('')}</div>

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
      <div class="notice" style="margin-top:14px"><strong>${shippingMethodLabel()}</strong><br>${state.shipping.method==='moto' ? `${escapeHtml(state.shipping.address || '')}<br>${state.shipping.distanceKm} km<br>Horarios de envíos entre las 8 am y las 23 hs con una demora de entre ${state.config?.shipping?.moto?.minHours || 1} y ${state.config?.shipping?.moto?.maxHours || 4} horas sujeto a disponibilidad` : ''}</div>
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
    qs('#searchBtn')?.addEventListener('click',()=>{const panel=qs('#headerSearchPanel');if(!panel)return;const opening=panel.classList.contains('hidden');panel.classList.toggle('hidden',!opening);qs('#searchBtn')?.classList.toggle('active',opening);if(opening)setTimeout(()=>qs('#searchInput')?.focus(),0);});
    qs('#accountBtn')?.addEventListener('click',()=>openAccount('profile'));
    qs('#favoritesBtn')?.addEventListener('click',()=>openAccount('favorites'));
    qs('#closeAccountBtn')?.addEventListener('click',closeAccount);
    qs('#accountBackdrop')?.addEventListener('click',closeAccount);
    qs('#cartBtn')?.addEventListener('click', openCart); qs('#footerCartBtn')?.addEventListener('click', openCart);
    qs('#closeCartBtn').addEventListener('click', closeCart); qs('#drawerBackdrop').addEventListener('click', closeCart);
    qs('#modalBackdrop').addEventListener('click', () => { closeModal('#productModal'); closeModal('#checkoutModal'); });
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
      const card=e.target.closest('.product-card'); if(card){ openProduct(Number(card.dataset.productId)); return; }
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
      const ship=e.target.closest('[data-shipping]'); if(ship && !ship.disabled){ const method=ship.dataset.shipping;if(method===state.shipping.method&&method==='moto'&&state.shipping.address){renderCheckout();return;}if(method==='moto'){const currentAddress=state.shipping.address&&Number.isFinite(Number(state.shipping.lat))&&Number.isFinite(Number(state.shipping.lng));if(currentAddress){state.shipping.method='moto';}else if(!restoreLastShipping({activateMoto:true,allowQuote:true})){state.shipping={method:'moto',costCents:0,distanceKm:null,address:null,lat:null,lng:null,quoteId:null};}}else{state.shipping={method,costCents:0,distanceKm:null,address:null,lat:null,lng:null,quoteId:null};state.shippingQuoteCarry=false;updateSavedShippingCarry(false);} state.coupon=null; renderCheckout(); return; }
      if(e.target.id==='useLocationBtn'){ try{e.target.disabled=true;await useCurrentLocation();}catch(err){toast(err.message,'error')}finally{e.target.disabled=false;} return; }
      if(e.target.id==='quoteMotoBtn'){ try{e.target.disabled=true;e.target.textContent='Calculando...';await quoteMoto();}catch(err){toast(err.message,'error');e.target.disabled=false;e.target.textContent='Calcular motomensajería';} return; }
      if(e.target.id==='toSummaryBtn'){ if(!state.shipping.method) return; if(state.shipping.method==='moto'&&!state.shipping.costCents){toast('Primero calculá la motomensajería.','error');return;} state.checkoutStep=3;renderCheckout();return; }
      if(e.target.id==='backShippingBtn'){state.checkoutStep=2;renderCheckout();return;}
      if(e.target.id==='applyCouponBtn'){await applyCouponCode();return;}
      if(e.target.id==='removeCouponBtn'){removeCouponCode();return;}
      if(e.target.id==='payBtn'){await createOrderAndPay();return;}
      if(e.target.id==='finishNoPayBtn'){closeModal('#checkoutModal');return;}
    });
  }

  async function boot() {
    initTheme();
    applyDefaultShareMeta();
    restoreLastShipping({activateMoto:false,allowQuote:true,restoreCarry:true});
    ensureAccountUi(); bindEvents(); await handlePaymentReturn();
    await Promise.all([loadStore(), initFirebaseAuth()]);
  }
  boot();
})();
