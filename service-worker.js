const CACHE='salmos-pwa-v48-3';
const CORE=['/storefront-backgrounds.css?v=45.0','/storefront-visuals-admin.js?v=45.0','/storefront-actions.css?v=43.0','/shipping-requests.css?v=40.0','/size-guide-data.js?v=43.0','/shipping-request-view.js?v=40.0','/storefront-shipping.js?v=40.0','/disclosure-icons.css?v=39.0','/disclosure-icons.js?v=39.0','/order-pricing.js?v=42.0','/storefront-wholesale.js?v=45.0','/sello-gloria.png','/brand-mark-dark-v30.png','/brand-mark-light-v30.png','/brand-wordmark-dark-v30.png','/brand-wordmark-light-v30.png','/storefront-refinements.css?v=46.4','/book-digital.js?v=31.0','/book-digital.css?v=28.0','/audiences.js?v=28.0','/product-copy.js?v=27.0','/storefront-home.js?v=46.0','/storefront-home.css?v=30.0','/logo-light.png','/','/index.html','/styles.css?v=27.0','/app.js?v=45.0','/config.js','/sharing.js?v=25.44','/sharing.css?v=25.44','/colors.js?v=25.70','/foreground.js?v=25.57','/montage-effects.js?v=25.57','/colors.css?v=25.44','/vendor/pickr/pickr.min.js?v=1.9.1','/vendor/pickr/nano.min.css?v=1.9.1','/icon-192.png','/icon-512.png','/logo-mark.png','/share-salmos-25-35.jpg','/banner-salmos-header.png','/banner-salmos-light.png','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await Promise.all(CORE.map(async path=>{try{
    const response=await fetch(path,{cache:'reload',redirect:'manual'});
    if(!response.ok||['opaque','opaqueredirect'].includes(response.type))return;
    if(/\.(?:js|css|png|jpe?g|svg|webp|woff2?)(?:\?|$)/i.test(path)&&/text\/html/i.test(response.headers.get('Content-Type')||''))return;
    await cache.put(path,response);
  }catch{}}));
  await self.skipWaiting();
})().catch(()=>{})));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname.startsWith('/admin')||u.pathname==='/quieromipagina'||u.pathname.startsWith('/quieromipagina/'))return;
  e.respondWith(fetch(e.request,{cache:'no-cache',redirect:'manual'}).then(r=>{
    if(r.type==='opaqueredirect')return e.request.mode==='navigate'?r:Response.error();
    const html=/text\/html/i.test(r.headers.get('Content-Type')||'');
    if(html&&['script','style','image','font'].includes(e.request.destination))return Response.error();
    if(r.ok&&r.type!=='opaque'){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});}
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||(u.pathname.startsWith('/marketing/')?Response.error():e.request.mode==='navigate'?caches.match('/index.html'):Response.error()))));
});
self.addEventListener('push',event=>{event.waitUntil((async()=>{let data={title:'SALMOS',body:'Tenés una notificación nueva.',url:'admin.html'};try{data={...data,...event.data.json()};}catch{}await self.registration.showNotification(data.title,{body:data.body,icon:'/admin-icon-black-192.png',badge:'/admin-icon-black-192.png',tag:data.tag||'salmos-admin',data:{url:data.url||'admin.html'}});})());});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const requested=new URL(event.notification.data?.url||'admin.html',self.location.origin),url=requested.origin===self.location.origin?requested.href:new URL('/admin.html',self.location.origin).href,windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows)if(new URL(client.url).pathname==='/admin.html'){await client.navigate(url);return client.focus();}return self.clients.openWindow(url);})());});
