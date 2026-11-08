// Minimal PWA lifecycle worker. Do not cache authenticated pages, R2 content, HLS or PDFs.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
