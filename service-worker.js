const CACHE='salmos-pwa-v25-35';
const CORE=['/','/index.html','/styles.css?v=25.35','/app.js?v=25.35','/config.js','/colors.js?v=25.35','/foreground.js?v=25.35','/montage-effects.js?v=25.35','/colors.css?v=25.35','/vendor/pickr/pickr.min.js?v=1.9.1','/vendor/pickr/nano.min.css?v=1.9.1','/icon-192.png','/icon-512.png','/logo-mark.png','/share-salmos-25-35.jpg','/banner-salmos-header.png','/banner-salmos-light.png','/manifest.webmanifest'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api/'))return;
  e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r;}).catch(()=>caches.match(e.request).then(r=>r||(e.request.mode==='navigate'?caches.match(u.pathname==='/admin.html'?'/admin.html':'/index.html'):Response.error()))));
});
