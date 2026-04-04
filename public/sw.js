// BSITHUB Service Worker
const CACHE_NAME = 'bsithub-v3.0.0';

// Install event
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', function(event) {
    event.respondWith(
        fetch(event.request)
            .catch(function() {
                return caches.match(event.request);
            })
    );
});

// Activate event
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    return caches.delete(cacheName);
                })
            );
        })
    );
    self.clients.claim();
});

console.log('BSITHUB Service Worker loaded');
