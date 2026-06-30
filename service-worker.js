 self.addEventListener('install', function(event) {
  console.log("Service Worker installed");
});

self.addEventListener('fetch', function(event) {
  // Basic offline support placeholder
});
