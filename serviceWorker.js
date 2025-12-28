const CACHE_NAME = 'taekwondo-reaction-v2';
const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  'main.js',
  'manifest.json',
  'icon-512.png',
  'icon-192.png',
  'attached_assets/gradient_background.PNG',
  'https://www.soundjay.com/human/applause-01.mp3'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames
          .filter(name => name.startsWith('taekwondo-reaction-') && name !== CACHE_NAME)
          .map(name => caches.delete(name))
      )
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
