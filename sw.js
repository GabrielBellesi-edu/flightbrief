const CACHE = 'flightbrief-v1';
const ASSETS = [
  './flight-gonogo.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Barlow:wght@300;400;500;600&family=Barlow+Condensed:wght@400;600;700&display=swap'
];

// Instalación: cachea todos los archivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activación: limpia caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: primero intenta la red, si falla usa el cache
// Para APIs externas (METAR, Open-Meteo) siempre intenta la red primero
self.addEventListener('fetch', e => {
  const url = e.request.url;
  const isAPI = url.includes('aviationweather.gov') || url.includes('open-meteo.com');

  if (isAPI) {
    // Network first para APIs — si falla, responde con mensaje de error
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión — datos en tiempo real no disponibles' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
  } else {
    // Cache first para recursos estáticos
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
  }
});