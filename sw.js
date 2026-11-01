/* ==========================================================
   SHOOT FACTURE - Service worker
   Garde l'application en mémoire pour qu'elle s'ouvre même
   sans internet. Quand tu modifies l'application, change
   le numéro de CACHE_NAME ci-dessous (v3 -> v4 -> v5...).
   ========================================================== */

const CACHE_NAME = "shoot-facture-v3";
const CACHE_FIREBASE = "firebase-sdk-10.14.1";

const FICHIERS = [
  "./",
  "./index.html",
  "./style.css",
  "./modules.css",
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
      Promise.all(
        noms
          .filter((n) => n !== CACHE_NAME && n !== CACHE_FIREBASE)
          .map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;
  const url = new URL(requete.url);

  // Les fichiers Firebase : on les garde en mémoire (l'appli s'ouvre même sans internet)
  if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(
      caches.open(CACHE_FIREBASE).then((cache) =>
        cache.match(requete).then((copie) =>
          copie || fetch(requete).then((reponse) => {
            if (reponse.ok) cache.put(requete, reponse.clone());
            return reponse;
          })
        )
      )
    );
    return;
  }

  // Tout ce qui vient d'ailleurs : on ne s'en occupe pas
  if (url.origin !== self.location.origin) return;

  // Nos fichiers : internet d'abord (toujours la dernière version, sans
  // attendre), et si internet est coupé, on utilise la copie enregistrée.
  event.respondWith(
    fetch(requete, { cache: "no-cache" })
      .then((reponse) => {
        const copie = reponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(requete, copie));
        return reponse;
      })
      .catch(() => caches.match(requete).then((r) => r || caches.match("./index.html")))
  );
});
