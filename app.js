/* ==========================================================
   SHOOT FACTURE - Code principal
   Étape 3 : comptes des entreprises (inscription, connexion)
   ========================================================== */

const VERSION = "0.3.0";

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
  firebase: { statut: "en cours", projet: FIREBASE_CONFIG.projectId, detail: "" },
  fb: null,                 // outils Firebase, une fois chargés
  utilisateur: null,        // la personne connectée
  entreprise: null,         // les infos de son entreprise
  pret: false,              // vrai quand on sait si quelqu'un est connecté
  modeAuth: "connexion",    // connexion | inscription | oubli
  occupe: false,
  inscriptionEnCours: false,
  installPrompt: null,
  installee: window.matchMedia("(display-mode: standalone)").matches
             || window.navigator.standalone === true
};

const vue = document.getElementById("view");

/* ----------------------------------------------------------
   3. Petits outils
   ---------------------------------------------------------- */
// Protège l'affichage : un texte saisi ne peut jamais être pris pour du code
function echapper(texte) {
  return String(texte ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const MESSAGES_ERREUR = {
  "auth/email-already-in-use": "Un compte existe déjà avec cette adresse e-mail. Connectez-vous.",
  "auth/invalid-email": "Cette adresse e-mail n'est pas valide.",
  "auth/weak-password": "Mot de passe trop faible : utilisez au moins 6 caractères.",
  "auth/invalid-credential": "E-mail ou mot de passe incorrect.",
  "auth/user-not-found": "E-mail ou mot de passe incorrect.",
  "auth/wrong-password": "E-mail ou mot de passe incorrect.",
  "auth/too-many-requests": "Trop de tentatives. Patientez quelques minutes puis réessayez.",
  "auth/network-request-failed": "Pas de connexion internet. Vérifiez votre réseau.",
  "auth/user-disabled": "Ce compte est désactivé.",
  "auth/operation-not-allowed": "La connexion par e-mail n'est pas activée dans Firebase."
};
function messageErreur(err) {
  return MESSAGES_ERREUR[err && err.code]
    || "Une erreur est survenue. Réessayez dans un instant.";
}

/* ----------------------------------------------------------
   4. Écrans de l'application (quand on est connecté)
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

function bienvenue() {
  return etat.entreprise
    ? `Bienvenue, ${echapper(etat.entreprise.nom)}.`
    : "Toutes vos factures au même endroit.";
}

const ecrans = {
  factures: () => ecranVide("factures", "Factures", bienvenue(),
    "Aucune facture pour l'instant. La création de factures arrive dans une prochaine étape."),

  clients: () => ecranVide("clients", "Clients",
    "Votre carnet de clients.",
    "Aucun client enregistré pour l'instant."),

  produits: () => ecranVide("produits", "Produits et prestations",
    "Ce que vous vendez, avec son prix.",
    "Aucun produit ni prestation pour l'instant."),

  reglages: () => {
    const f = etat.firebase;
    const e = etat.entreprise || {};
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
      <p class="sous-titre">Votre compte et l'état de l'application.</p>

      <div class="bloc">
        <h2>Mon compte</h2>
        <div class="ligne"><span>Entreprise</span><span class="valeur">${echapper(e.nom)}</span></div>
        <div class="ligne"><span>E-mail</span><span class="valeur">${echapper(etat.utilisateur && etat.utilisateur.email)}</span></div>
        <button class="btn btn-secondaire btn-large espace-haut" id="btn-deconnexion">Se déconnecter</button>
      </div>

      <div class="bloc">
        <h2>Connexion</h2>
        <div class="ligne"><span>Firebase</span><span class="valeur ${classe}">${texteFirebase}</span></div>
        <div class="ligne"><span>Projet</span><span class="valeur">${echapper(f.projet)}</span></div>
        <div class="ligne"><span>Version</span><span class="valeur">${VERSION}</span></div>
      </div>

      <div class="bloc">
        <h2>Installation</h2>
        ${blocInstall}
      </div>`;
  }
};

/* ----------------------------------------------------------
   5. Écran de chargement et écran de connexion
   ---------------------------------------------------------- */
function ecranChargement() {
  if (etat.firebase.statut === "erreur") {
    const texte = navigator.onLine
      ? "Impossible de joindre le service. Vérifiez votre connexion internet puis réessayez."
      : "Vous êtes hors ligne. Connectez-vous à internet pour ouvrir l'application.";
    return `
      <div class="chargement">
        <h1>Connexion impossible</h1>
        <p>${texte}</p>
        <button class="btn" id="btn-reessayer">Réessayer</button>
      </div>`;
  }
  return `
    <div class="chargement">
      <div class="spinner" aria-hidden="true"></div>
      <p>Chargement…</p>
    </div>`;
}

function champ(id, libelle, type, auto, aide) {
  let extra = "";
  if (type === "email") extra = ' autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="email"';
  if (id === "nom") extra = ' autocapitalize="words"';
  return `
    <div class="champ">
      <label for="${id}">${libelle}</label>
      <input id="${id}" name="${id}" type="${type}" autocomplete="${auto}"
             placeholder="${aide}" required${extra}>
    </div>`;
}

const TEXTES_AUTH = {
  connexion: {
    titre: "Connexion",
    sous: "Connectez-vous à l'espace de votre entreprise.",
    bouton: "Se connecter"
  },
  inscription: {
    titre: "Créer mon compte",
    sous: "Un compte par entreprise. Vos données restent privées.",
    bouton: "Créer mon compte"
  },
  oubli: {
    titre: "Mot de passe oublié",
    sous: "Saisissez votre e-mail : nous vous envoyons un lien pour en choisir un nouveau.",
    bouton: "Envoyer le lien"
  }
};

function ecranAuth() {
  const mode = etat.modeAuth;
  const t = TEXTES_AUTH[mode];

  let champs = "";
  if (mode === "inscription") champs += champ("nom", "Nom de l'entreprise", "text", "organization", "Ex. SHOOT MEDIA");
  champs += champ("email", "Adresse e-mail", "email", "email", "vous@exemple.com");
  if (mode !== "oubli") {
    champs += champ("mdp", "Mot de passe", "password",
      mode === "inscription" ? "new-password" : "current-password", "6 caractères minimum");
  }
  if (mode === "inscription") champs += champ("mdp2", "Confirmer le mot de passe", "password", "new-password", "Même mot de passe");

  const option = mode === "oubli" ? "" : `
    <label class="option"><input type="checkbox" id="voir-mdp"> Afficher le mot de passe</label>`;

  let liens = "";
  if (mode === "connexion") {
    liens = `
      <button type="button" class="lien" data-mode="oubli">Mot de passe oublié ?</button>
      <button type="button" class="lien" data-mode="inscription">Pas encore de compte ? Créer un compte</button>`;
  } else if (mode === "inscription") {
    liens = `<button type="button" class="lien" data-mode="connexion">Déjà un compte ? Se connecter</button>`;
  } else {
    liens = `<button type="button" class="lien" data-mode="connexion">Retour à la connexion</button>`;
  }

  return `
    <h1>${t.titre}</h1>
    <p class="sous-titre">${t.sous}</p>
    <div class="carte-auth">
      <form id="form-auth" novalidate>
        ${champs}
        ${option}
        <button type="submit" class="btn btn-large" id="btn-valider">${t.bouton}</button>
        <p id="message-auth" class="message" role="alert"></p>
      </form>
    </div>
    <div class="liens">${liens}</div>`;
}

/* ----------------------------------------------------------
   6. Affichage général
   ---------------------------------------------------------- */
function ecranCourant() {
  const nom = (location.hash || "#factures").replace("#", "");
  return ecrans[nom] ? nom : "factures";
}

function afficher() {
  const connecte = Boolean(etat.utilisateur);
  document.body.classList.toggle("auth", !connecte);
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("actif"));

  if (!etat.pret) {
    vue.innerHTML = ecranChargement();
    const r = document.getElementById("btn-reessayer");
    if (r) r.addEventListener("click", demarrerFirebase);
    return;
  }

  if (!connecte) {
    vue.innerHTML = ecranAuth();
    brancherAuth();
    window.scrollTo(0, 0);
    return;
  }

  const nom = ecranCourant();
  vue.innerHTML = ecrans[nom]();
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("actif", t.dataset.tab === nom));
  window.scrollTo(0, 0);

  const btnInstall = document.getElementById("btn-install");
  if (btnInstall) btnInstall.addEventListener("click", installer);
  const btnDeco = document.getElementById("btn-deconnexion");
  if (btnDeco) btnDeco.addEventListener("click", seDeconnecter);
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => { location.hash = t.dataset.tab; }));
window.addEventListener("hashchange", () => { if (etat.utilisateur) afficher(); });

/* ----------------------------------------------------------
   7. Formulaire de connexion / inscription
   ---------------------------------------------------------- */
function brancherAuth() {
  const form = document.getElementById("form-auth");
  const zone = document.getElementById("message-auth");
  const bouton = document.getElementById("btn-valider");
  const libelleBouton = bouton.textContent;

  const dire = (texte, type) => { zone.textContent = texte; zone.className = "message " + type; };

  vue.querySelectorAll("[data-mode]").forEach((b) =>
    b.addEventListener("click", () => { etat.modeAuth = b.dataset.mode; afficher(); }));

  const voir = document.getElementById("voir-mdp");
  if (voir) {
    voir.addEventListener("change", () => {
      form.querySelectorAll('input[name="mdp"], input[name="mdp2"]').forEach((i) => {
        i.type = voir.checked ? "text" : "password";
      });
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (etat.occupe) return;

    const mode = etat.modeAuth;
    const lire = (n) => (form.elements[n] ? form.elements[n].value : "");
    const nom = lire("nom").trim();
    const email = lire("email").trim();
    const mdp = lire("mdp");
    const mdp2 = lire("mdp2");

    if (mode === "inscription" && nom.length < 2) return dire("Indiquez le nom de votre entreprise.", "erreur");
    if (!email) return dire("Indiquez votre adresse e-mail.", "erreur");
    if (mode !== "oubli" && !mdp) return dire("Indiquez votre mot de passe.", "erreur");
    if (mode === "inscription") {
      if (mdp.length < 6) return dire("Le mot de passe doit contenir au moins 6 caractères.", "erreur");
      if (mdp !== mdp2) return dire("Les deux mots de passe ne sont pas identiques.", "erreur");
    }
    if (!etat.fb) return dire("Le service n'est pas encore prêt. Patientez un instant.", "erreur");

    etat.occupe = true;
    bouton.disabled = true;
    bouton.textContent = "Veuillez patienter…";
    zone.className = "message";
    zone.textContent = "";

    try {
      if (mode === "connexion") {
        await seConnecter(email, mdp);
      } else if (mode === "inscription") {
        await sInscrire(nom, email, mdp);
        afficher();
      } else {
        await envoyerLien(email);
        dire("Si un compte existe avec cette adresse, un e-mail pour choisir un nouveau mot de passe vient d'être envoyé. Pensez à vérifier vos courriers indésirables.", "succes");
      }
    } catch (err) {
      console.error(err);
      dire(messageErreur(err), "erreur");
    } finally {
      etat.occupe = false;
      bouton.disabled = false;
      bouton.textContent = libelleBouton;
    }
  });
}

/* ----------------------------------------------------------
   8. Actions : connexion, inscription, déconnexion
   ---------------------------------------------------------- */
async function seConnecter(email, mdp) {
  const { auth, A } = etat.fb;
  await A.signInWithEmailAndPassword(auth, email, mdp);
  // La suite est gérée par surChangementUtilisateur()
}

async function sInscrire(nom, email, mdp) {
  const { auth, db, A, F } = etat.fb;
  etat.inscriptionEnCours = true;
  try {
    const cred = await A.createUserWithEmailAndPassword(auth, email, mdp);
    etat.utilisateur = cred.user;

    try { await A.updateProfile(cred.user, { displayName: nom }); } catch (e) { console.warn(e); }

    // On crée l'espace de l'entreprise : /entreprises/{son identifiant}
    try {
      await F.setDoc(F.doc(db, "entreprises", cred.user.uid), {
        nom: nom,
        email: email,
        creeLe: F.serverTimestamp()
      });
    } catch (e) { console.error("Création de l'espace entreprise :", e); }

    etat.entreprise = { nom: nom, email: email };
  } finally {
    etat.inscriptionEnCours = false;
  }
}

async function envoyerLien(email) {
  const { auth, A } = etat.fb;
  await A.sendPasswordResetEmail(auth, email);
}

async function seDeconnecter() {
  try {
    await etat.fb.A.signOut(etat.fb.auth);
  } catch (err) {
    console.error(err);
  }
  etat.modeAuth = "connexion";
  history.replaceState(null, "", location.pathname + "#factures");
}

/* ----------------------------------------------------------
   9. Suivi de la personne connectée
   ---------------------------------------------------------- */
async function chargerEntreprise(user) {
  const { db, F } = etat.fb;
  const ref = F.doc(db, "entreprises", user.uid);
  try {
    let snap = await F.getDoc(ref);
    if (!snap.exists()) {
      await F.setDoc(ref, {
        nom: user.displayName || "Mon entreprise",
        email: user.email,
        creeLe: F.serverTimestamp()
      });
      snap = await F.getDoc(ref);
    }
    etat.entreprise = snap.data();
  } catch (err) {
    console.error("Lecture de l'entreprise :", err);
    etat.entreprise = { nom: user.displayName || "Mon entreprise", email: user.email };
  }
}

async function surChangementUtilisateur(user) {
  if (etat.inscriptionEnCours) return;   // l'inscription s'en occupe elle-même
  if (!user) {
    etat.utilisateur = null;
    etat.entreprise = null;
    etat.pret = true;
    afficher();
    return;
  }
  etat.utilisateur = user;
  await chargerEntreprise(user);
  etat.pret = true;
  afficher();
}

/* ----------------------------------------------------------
   10. Indicateur en ligne / hors ligne
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
   11. Installation de l'application (PWA)
   ---------------------------------------------------------- */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  etat.installPrompt = e;
  if (etat.utilisateur && ecranCourant() === "reglages") afficher();
});

async function installer() {
  if (!etat.installPrompt) return;
  etat.installPrompt.prompt();
  await etat.installPrompt.userChoice;
  etat.installPrompt = null;
  afficher();
}

window.addEventListener("appinstalled", () => {
  etat.installee = true;
  etat.installPrompt = null;
  if (etat.utilisateur && ecranCourant() === "reglages") afficher();
});

/* ----------------------------------------------------------
   12. Service worker (fait fonctionner l'appli hors ligne)
   ---------------------------------------------------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) =>
      console.warn("Service worker non enregistré :", err));
  });
}

/* ----------------------------------------------------------
   13. Démarrage de Firebase
   ---------------------------------------------------------- */
async function demarrerFirebase() {
  etat.firebase = { statut: "en cours", projet: FIREBASE_CONFIG.projectId, detail: "" };
  afficher();
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [moduleApp, A, F] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`)
    ]);

    const app = moduleApp.initializeApp(FIREBASE_CONFIG);
    const auth = A.getAuth(app);
    auth.languageCode = "fr";
    const db = F.getFirestore(app);

    etat.fb = { auth, db, A, F };
    etat.firebase = { statut: "ok", projet: app.options.projectId, detail: "" };

    A.onAuthStateChanged(auth, surChangementUtilisateur);
  } catch (err) {
    console.error("Firebase :", err);
    etat.firebase = { statut: "erreur", projet: FIREBASE_CONFIG.projectId, detail: err.message };
    etat.pret = false;
    afficher();
  }
}

/* ----------------------------------------------------------
   14. Démarrage
   ---------------------------------------------------------- */
afficher();
demarrerFirebase();
