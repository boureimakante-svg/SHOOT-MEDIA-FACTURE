/* ==========================================================
   SHOOT FACTURE - Code principal (étape 2 : squelette PWA)
   ========================================================== */

const VERSION = "0.2.0";

/* ----------------------------------------------------------
   1. Configuration Firebase (celle de ton projet)
   ---------------------------------------------------------- */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDl64Yaq7eLXrCoTPZtFCQTikW0-vtJjEg",
  authDomain: "shoot-media-facture.firebaseapp.com",
  projectId: "shoot-media-facture",
  storageBucket: "shoot-media-facture.firebasestorage.app",
  messagingSenderId: "994852211682",
  appId: "1:994852211682:web:39f9abb11d2a752c0d07bb"
};
const FIREBASE_VERSION = "10.14.1";

/* ----------------------------------------------------------
   2. État de l'application
   ---------------------------------------------------------- */
const etat = {
  firebase: { statut: "en cours", detail: "" },
  installPrompt: null,   // proposition d'installation (Android / ordinateur)
  installee: window.matchMedia("(display-mode: standalone)").matches
             || window.navigator.standalone === true
};

const vue = document.getElementById("view");

/* ----------------------------------------------------------
   3. Écrans
   ---------------------------------------------------------- */
const icones = {
  factures: '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6"/></svg>',
  clients: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
  produits: '<svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8"/></svg>'
};

function ecranVide(cle, titre, sousTitre, message) {
  return `
    <h1>${titre}</h1>
    <p class="sous-titre">${sousTitre}</p>
    <div class="vide">
      ${icones[cle]}
      <p>${message}</p>
    </div>`;
}

const ecrans = {
  factures: () => ecranVide("factures", "Factures",
    "Toutes vos factures au même endroit.",
    "Aucune facture pour l'instant. La création de factures arrive dans une prochaine étape."),

  clients: () => ecranVide("clients", "Clients",
    "Votre carnet de clients.",
    "Aucun client enregistré pour l'instant."),

  produits: () => ecranVide("produits", "Produits et prestations",
    "Ce que vous vendez, avec son prix.",
    "Aucun produit ni prestation pour l'instant."),

  reglages: () => {
    const f = etat.firebase;
    let texteFirebase = "Vérification…";
    let classe = "";
    if (f.statut === "ok") { texteFirebase = "Connecté"; classe = "ok"; }
    if (f.statut === "erreur") { texteFirebase = "Échec"; classe = "ko"; }

    let blocInstall = "";
    if (etat.installee) {
      blocInstall = `<p class="aide">L'application est installée sur cet appareil.</p>`;
    } else if (etat.installPrompt) {
      blocInstall = `<button class="btn btn-large" id="btn-install">Installer l'application</button>`;
    } else {
      blocInstall = `<p class="aide">Pour installer : sur Android, ouvrez le menu ⋮ du navigateur puis
        « Installer l'application » ou « Ajouter à l'écran d'accueil ». Sur iPhone, ouvrez Safari,
        appuyez sur Partager puis « Sur l'écran d'accueil ».</p>`;
    }

    return `
      <h1>Réglages</h1>
      <p class="sous-titre">État de l'application.</p>

      <div class="bloc">
        <h2>Connexion</h2>
        <div class="ligne"><span>Firebase</span><span class="valeur ${classe}">${texteFirebase}</span></div>
        <div class="ligne"><span>Projet</span><span class="valeur">${f.projet || "—"}</span></div>
        ${f.detail ? `<div class="ligne"><span>Détail</span><span class="valeur ko">${f.detail}</span></div>` : ""}
        <div class="ligne"><span>Version</span><span class="valeur">${VERSION}</span></div>
      </div>

      <div class="bloc">
        <h2>Installation</h2>
        ${blocInstall}
      </div>`;
  }
};

/* ----------------------------------------------------------
   4. Navigation (barre du bas)
   ---------------------------------------------------------- */
function afficher(nom) {
  if (!ecrans[nom]) nom = "factures";
  vue.innerHTML = ecrans[nom]();
  document.querySelectorAll(".tab").forEach(t =>
    t.classList.toggle("actif", t.dataset.tab === nom));
  window.scrollTo(0, 0);

  const btn = document.getElementById("btn-install");
  if (btn) btn.addEventListener("click", installer);
}

function ecranCourant() {
  return (location.hash || "#factures").replace("#", "");
}

document.querySelectorAll(".tab").forEach(t =>
  t.addEventListener("click", () => { location.hash = t.dataset.tab; }));
window.addEventListener("hashchange", () => afficher(ecranCourant()));

/* ----------------------------------------------------------
   5. Indicateur en ligne / hors ligne
   ---------------------------------------------------------- */
const pastille = document.getElementById("net-pill");
function majReseau() {
  const enLigne = navigator.onLine;
  pastille.textContent = enLigne ? "En ligne" : "Hors ligne";
  pastille.className = "pill " + (enLigne ? "pill-ok" : "pill-off");
}
window.addEventListener("online", majReseau);
window.addEventListener("offline", majReseau);
majReseau();

/* ----------------------------------------------------------
   6. Installation de l'application (PWA)
   ---------------------------------------------------------- */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  etat.installPrompt = e;
  if (ecranCourant() === "reglages") afficher("reglages");
});

async function installer() {
  if (!etat.installPrompt) return;
  etat.installPrompt.prompt();
  await etat.installPrompt.userChoice;
  etat.installPrompt = null;
  afficher("reglages");
}

window.addEventListener("appinstalled", () => {
  etat.installee = true;
  etat.installPrompt = null;
  if (ecranCourant() === "reglages") afficher("reglages");
});

/* ----------------------------------------------------------
   7. Service worker (fait fonctionner l'appli hors ligne)
   ---------------------------------------------------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err =>
      console.warn("Service worker non enregistré :", err));
  });
}

/* ----------------------------------------------------------
   8. Test de connexion à Firebase
   ---------------------------------------------------------- */
async function demarrerFirebase() {
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const { initializeApp } = await import(`${base}/firebase-app.js`);
    const { getAuth } = await import(`${base}/firebase-auth.js`);
    const { getFirestore } = await import(`${base}/firebase-firestore.js`);

    const app = initializeApp(FIREBASE_CONFIG);
    getAuth(app);
    getFirestore(app);

    etat.firebase = { statut: "ok", projet: app.options.projectId, detail: "" };
  } catch (err) {
    etat.firebase = { statut: "erreur", projet: FIREBASE_CONFIG.projectId,
      detail: navigator.onLine ? err.message : "Pas de connexion internet" };
    console.error("Firebase :", err);
  }
  if (ecranCourant() === "reglages") afficher("reglages");
}

/* ----------------------------------------------------------
   9. Démarrage
   ---------------------------------------------------------- */
afficher(ecranCourant());
demarrerFirebase();
