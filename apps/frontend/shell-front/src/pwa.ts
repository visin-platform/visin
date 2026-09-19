/**
 * Registers the service worker that makes Visin installable as an app. Only in
 * a production build: under Vite's dev server a worker would just get in the
 * way of hot reload. `updateViaCache: 'none'` has the browser check for a new
 * worker on every load instead of trusting the HTTP cache.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch((error: unknown) => {
      console.warn('Service worker registration failed', error);
    });
  });
}
