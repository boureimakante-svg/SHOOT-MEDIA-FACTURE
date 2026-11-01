/* ==========================================================
   SHOOT FACTURE - Service worker
   Garde l'application en mémoire pour qu'elle s'ouvre même
   sans internet. Quand tu modifies l'application, change
   le numéro de CACHE_NAME ci-dessous (v1 -> v2 -> v3...).
   ========================================================== */

const CACHE_NAME = "shoot-facture-v1";

const FICHIERS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icon.svg"
];

// Installation : on enregistre les fichiers de l'application
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS))
  );
  self.skipWaiting();
});

// Activation : on supprime les anciennes versions du cache
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(noms.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Chargement : on essaie internet d'abord (toujours la dernière version),
// et si internet est coupé, on utilise la copie enregistrée.
self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  if (new URL(requete.url).origin !== self.location.origin) return; // on laisse Firebase tranquille

  event.respondWith(
    fetch(requete)
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(requete, copie));
        return reponse;
      })
      .catch(() => caches.match(requete).then((r) => r || caches.match("./index.html")))
  );
});
