// Service worker mínimo: sólo para poder "instalar" el juego (Agregar a inicio).
// No guarda nada en caché, así nunca queda una versión vieja.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* pasar todo directo a la red */
});
