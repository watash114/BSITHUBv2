// BSITHUB Service Worker
const CACHE_NAME = 'bsithub-v3.0.1';

// Install event
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', function(event) {
    // Skip non-GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension and other non-http requests
    if (!event.request.url.startsWith('http')) {
        return;
    }
    
    event.respondWith(
        fetch(event.request)
            .then(function(response) {
                // Clone the response before caching
                var responseClone = response.clone();
                
                // Cache successful responses
                if (response.status === 200) {
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseClone);
                    });
                }
                
                return response;
            })
            .catch(function() {
                // Try to get from cache
                return caches.match(event.request).then(function(cachedResponse) {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // Return a fallback response for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html').then(function(indexResponse) {
                            if (indexResponse) {
                                return indexResponse;
                            }
                            // Return a basic offline response
                            return new Response(
                                '<html><body><h1>Offline</h1><p>Please check your internet connection.</p></body></html>',
                                {
                                    status: 503,
                                    statusText: 'Service Unavailable',
                                    headers: new Headers({
                                        'Content-Type': 'text/html'
                                    })
                                }
                            );
                        });
                    }
                    
                    // Return empty response for other requests
                    return new Response('', {
                        status: 408,
                        statusText: 'Network Error'
                    });
                });
            })
    );
});

// Activate event
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(cacheName) {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});
