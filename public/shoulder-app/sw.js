const CACHE='shoulder-app-v3';
const ASSETS=['/shoulder-app/','/shoulder-app/index.html','/shoulder-app/app.js','/shoulder-app/manifest.json','/shoulder-app/icon.svg','/shoulder-app/icon-192.png','/shoulder-app/icon-512.png','/shoulder.js','/shoulder.css','/shoulder-conditions.js','/farestald-injections/styles.css?v=3'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('shoulder-app-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.origin!==location.origin||url.pathname.startsWith('/api/'))return;
  if(!ASSETS.includes(url.pathname+url.search)&&!url.pathname.startsWith('/shoulder-app/'))return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return r;}).catch(async()=>await caches.match(e.request)||(e.request.mode==='navigate'?await caches.match('/shoulder-app/'):Response.error())));
});
