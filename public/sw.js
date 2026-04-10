// BSITHUB Service Worker
const CACHE_NAME = 'bsithub-v4.0.0';

self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('fetch', function(event) {
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith('http')) return;
    
    // Skip external requests (Jitsi, Firebase, etc.)
    if (event.request.url.includes('jit.si') || 
        event.request.url.includes('firebase') ||
        event.request.url.includes('googleapis.com')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request).catch(function() {
            return caches.match(event.request).then(function(response) {
                return response || new Response('', { status: 200 });
            });
        })
    );
});

self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(names) {
            return Promise.all(
                names.filter(function(n) { return n !== CACHE_NAME; })
                     .map(function(n) { return caches.delete(n); })
            );
        })
    );
    self.clients.claim();
});
