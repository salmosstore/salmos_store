const CACHE='salmos-pwa-v22-0';
const CORE=['/','/index.html','/styles.css?v=22.0','/app.js?v=22.0','/config.js','/icon-192.png','/icon-512.png','/logo-mark.png','/banner-salmos-header.png','/banner-salmos-light.png','/manifest.webmanifest','/admin.html','/admin.css','/admin-v4.css?v=22.0','/admin.js?v=22.0','/admin-manifest.webmanifest','/admin-salmos-rosa-ui.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match(u.pathname==='/admin.html'?'/admin.html':'/index.html'):Response.error()))));
});
