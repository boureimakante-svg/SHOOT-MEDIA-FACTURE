/* ==========================================================
   SHOOT FACTURE - Module « Clients »
   Carnet de clients : ajouter, retrouver, modifier, supprimer.
   Les clients sont rangés dans l'espace privé de l'entreprise :
   entreprises/{son identifiant}/clients
   ========================================================== */

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
.cache { position: absolute; left: -9999px; }
.recherche { margin: 16px 0 6px; }
.compteur { font-size: 13px; color: var(--gris); margin: 6px 2px 12px; }

.carte-client {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 68px;
  margin-bottom: 10px;
  padding: 12px 14px;
  text-align: left;
  background: var(--blanc);
  border: 1px solid var(--trait);
  border-radius: 14px;
  color: var(--noir);
  font: inherit;
  cursor: pointer;
}
.carte-client:active { background: var(--fond); }
.avatar {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--noir);
  color: var(--orange);
  font-weight: 800;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.client-textes { display: flex; flex-direction: column; min-width: 0; }
.client-nom { font-weight: 700; font-size: 17px; }
.client-detail { color: var(--gris); font-size: 14px; word-break: break-word; }

.btn-danger { background: var(--blanc); border: 2px solid var(--erreur); color: var(--erreur); }
.btn-danger:active { background: #FDECEC; }
.actions-client { display: flex; flex-direction: column; gap: 12px; margin-top: 24px; }
.liens-contact { margin: -6px 0 16px; }
`;

/* ----------------------------------------------------------
   Mémoire du module
   ---------------------------------------------------------- */
let liste = null;        // clients chargés (null = pas encore chargés)
let listeUid = null;     // à qui appartient cette liste
let enEdition = null;    // client en cours de modification (null = nouveau client)
let flash = "";          // petit message affiché sur la liste

/* ----------------------------------------------------------
   Petits outils
   ---------------------------------------------------------- */
const simple = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Numéro pour WhatsApp : chiffres seulement, sans le « 00 » ou le « + » du début
export function numeroWhatsApp(telephone) {
  let n = String(telephone || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  return n;
}

function initiales(nom) {
  const mots = String(nom || "?").trim().split(/\s+/).filter(Boolean);
  const lettres = (mots[0] ? mots[0][0] : "?") + (mots[1] ? mots[1][0] : "");
  return lettres.toUpperCase();
}

function outils(ctx) {
  const { db, F } = ctx.etat.fb;
  const uid = ctx.etat.utilisateur.uid;
  return { db, F, uid, colonne: F.collection(db, "entreprises", uid, "clients") };
}

// Sécurité : si une autre entreprise se connecte sur ce téléphone, on repart de zéro
function verifierProprietaire(ctx) {
  const uid = ctx.etat.utilisateur && ctx.etat.utilisateur.uid;
  if (listeUid !== uid) {
    liste = null;
    enEdition = null;
    flash = "";
    listeUid = uid;
  }
}

async function chargerClients(ctx) {
  const { F, colonne } = outils(ctx);
  const resultat = await F.getDocs(colonne);
  liste = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  trier();
}

function trier() {
  liste.sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
}

/* ----------------------------------------------------------
   Écran « Clients » (la liste)
   ---------------------------------------------------------- */
function dessinerListe(ctx) {
  const zone = document.getElementById("liste-clients");
  if (!zone || !liste) return;
  const recherche = simple((document.getElementById("recherche-client") || {}).value || "").trim();

  const trouves = liste.filter((c) =>
    !recherche || simple([c.nom, c.telephone, c.email, c.adresse].join(" ")).includes(recherche));

  if (!liste.length) {
    zone.innerHTML = `
      <div class="vide">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>
        <p>Aucun client pour l'instant. Appuyez sur « + Nouveau client » pour ajouter le premier.</p>
      </div>`;
    return;
  }
  if (!trouves.length) {
    zone.innerHTML = `<p class="aide">Aucun client ne correspond à « ${ctx.echapper(recherche)} ».</p>`;
    return;
  }

  zone.innerHTML = `
    <p class="compteur">${trouves.length} client${trouves.length > 1 ? "s" : ""}</p>
    ${trouves.map((c) => {
      const details = [c.telephone, c.adresse].filter(Boolean).map((t) => ctx.echapper(String(t).split("\n")[0])).join(" · ");
      return `
        <button type="button" class="carte-client" data-id="${ctx.echapper(c.id)}">
          <span class="avatar" aria-hidden="true">${ctx.echapper(initiales(c.nom))}</span>
          <span class="client-textes">
            <span class="client-nom">${ctx.echapper(c.nom)}</span>
            ${details ? `<span class="client-detail">${details}</span>` : ""}
          </span>
        </button>`;
    }).join("")}`;

  zone.querySelectorAll(".carte-client").forEach((b) =>
    b.addEventListener("click", () => {
      enEdition = liste.find((c) => c.id === b.dataset.id) || null;
      location.hash = "client";
    }));
}

async function remplirListe(ctx) {
  verifierProprietaire(ctx);
  if (liste === null) {
    try {
      await chargerClients(ctx);
    } catch (err) {
      console.error("Clients :", err);
      const zone = document.getElementById("liste-clients");
      if (zone) {
        zone.innerHTML = `
          <div class="chargement">
            <p>Impossible de charger vos clients. Vérifiez votre connexion internet.</p>
            <button type="button" class="btn" id="btn-reessayer-clients">Réessayer</button>
          </div>`;
        const r = document.getElementById("btn-reessayer-clients");
        if (r) r.addEventListener("click", () => {
          zone.innerHTML = '<div class="chargement">Chargement…</div>';
          remplirListe(ctx);
        });
      }
      return;
    }
  }
  dessinerListe(ctx);
}

/* ----------------------------------------------------------
   Écran « Fiche client » (ajouter / modifier)
   ---------------------------------------------------------- */
function rendreFiche(ctx) {
  const c = enEdition || {};
  const v = (cle) => ctx.echapper(c[cle] ?? "");
  return `
    <button type="button" class="lien retour" data-aller="clients">← Clients</button>
    <h1>${enEdition ? "Modifier le client" : "Nouveau client"}</h1>
    <p class="sous-titre">${enEdition ? "Changez les informations puis enregistrez." : "Renseignez au moins son nom."}</p>

    <form id="form-client" novalidate>
      <div class="champ">
        <label for="c-nom">Nom du client</label>
        <input id="c-nom" name="nom" type="text" value="${v("nom")}" maxlength="120"
               placeholder="Nom ou entreprise" autocomplete="off" autocapitalize="words">
      </div>
      <div class="champ">
        <label for="c-telephone">Téléphone / WhatsApp</label>
        <input id="c-telephone" name="telephone" type="tel" value="${v("telephone")}" maxlength="30"
               placeholder="Avec l'indicatif du pays" autocomplete="off">
      </div>
      <p class="liens-contact" id="liens-contact"></p>
      <div class="champ">
        <label for="c-email">E-mail (facultatif)</label>
        <input id="c-email" name="email" type="email" value="${v("email")}" maxlength="120"
               placeholder="client@exemple.com" autocomplete="off" autocapitalize="none" spellcheck="false">
      </div>
      <div class="champ">
        <label for="c-adresse">Adresse (facultatif)</label>
        <textarea id="c-adresse" name="adresse" maxlength="250" placeholder="Quartier, rue, ville">${v("adresse")}</textarea>
      </div>
      <div class="champ">
        <label for="c-notes">Notes (facultatif)</label>
        <textarea id="c-notes" name="notes" maxlength="400" placeholder="Informations utiles sur ce client">${v("notes")}</textarea>
      </div>

      <div class="actions-client">
        <button type="submit" class="btn btn-large" id="btn-enregistrer-client">Enregistrer</button>
        ${enEdition ? '<button type="button" class="btn btn-danger btn-large" id="btn-supprimer-client">Supprimer ce client</button>' : ""}
      </div>
      <p id="message-client" class="message" role="alert"></p>
    </form>`;
}

function brancherFiche(ctx) {
  verifierProprietaire(ctx);
  const form = document.getElementById("form-client");
  const message = document.getElementById("message-client");
  const bouton = document.getElementById("btn-enregistrer-client");
  const liens = document.getElementById("liens-contact");
  let occupe = false;

  const dire = (texte, type) => { message.textContent = texte; message.className = "message " + type; };
  const lire = (id) => form.elements[id].value.trim();

  function majLiens() {
    const tel = lire("telephone");
    const n = numeroWhatsApp(tel);
    liens.innerHTML = n.length >= 6
      ? `<a class="lien" href="https://wa.me/${n}" target="_blank" rel="noopener">Écrire sur WhatsApp</a>
         <a class="lien" href="tel:+${n}">Appeler</a>`
      : "";
  }
  form.addEventListener("input", majLiens);
  majLiens();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (occupe) return;
    const nom = lire("nom");
    const email = lire("email");
    if (nom.length < 2) { dire("Indiquez le nom du client.", "erreur"); form.elements.nom.focus(); return; }
    if (email && !/^\S+@\S+\.\S+$/.test(email)) { dire("L'e-mail du client n'est pas valide.", "erreur"); form.elements.email.focus(); return; }
    if (!navigator.onLine) { dire("Vous êtes hors ligne. Reconnectez-vous à internet pour enregistrer.", "erreur"); return; }

    const donnees = { nom, telephone: lire("telephone"), email, adresse: lire("adresse"), notes: lire("notes") };

    occupe = true;
    bouton.disabled = true;
    bouton.textContent = "Enregistrement…";
    message.className = "message";
    message.textContent = "";
    try {
      const { db, F, uid, colonne } = outils(ctx);
      if (enEdition) {
        await F.setDoc(F.doc(db, "entreprises", uid, "clients", enEdition.id),
          { ...donnees, modifieLe: F.serverTimestamp() }, { merge: true });
        Object.assign(enEdition, donnees);
      } else {
        const ref = await F.addDoc(colonne, { ...donnees, creeLe: F.serverTimestamp() });
        if (liste) { liste.push({ id: ref.id, ...donnees }); }
      }
      if (liste) trier();
      flash = "Client enregistré.";
      enEdition = null;
      location.hash = "clients";
    } catch (err) {
      console.error(err);
      dire("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.", "erreur");
      occupe = false;
      bouton.disabled = false;
      bouton.textContent = "Enregistrer";
    }
  });

  const supprimer = document.getElementById("btn-supprimer-client");
  if (supprimer) {
    supprimer.addEventListener("click", async () => {
      if (occupe || !enEdition) return;
      if (!window.confirm("Supprimer ce client ? Cette action est définitive.")) return;
      if (!navigator.onLine) { dire("Vous êtes hors ligne. Reconnectez-vous à internet pour supprimer.", "erreur"); return; }
      occupe = true;
      supprimer.disabled = true;
      try {
        const { db, F, uid } = outils(ctx);
        await F.deleteDoc(F.doc(db, "entreprises", uid, "clients", enEdition.id));
        if (liste) liste = liste.filter((c) => c.id !== enEdition.id);
        flash = "Client supprimé.";
        enEdition = null;
        location.hash = "clients";
      } catch (err) {
        console.error(err);
        dire("La suppression a échoué. Vérifiez votre connexion et réessayez.", "erreur");
        occupe = false;
        supprimer.disabled = false;
      }
    });
  }
}

/* ----------------------------------------------------------
   Les écrans de ce module
   ---------------------------------------------------------- */
export const ecrans = {
  clients: {
    rendu(ctx) {
      verifierProprietaire(ctx);
      return `
        <h1>Clients</h1>
        <p class="sous-titre">Votre carnet de clients.</p>
        ${flash ? `<p class="message succes">${ctx.echapper(flash)}</p>` : ""}
        <button type="button" class="btn btn-large" id="btn-nouveau-client">+ Nouveau client</button>
        <div class="champ recherche">
          <label for="recherche-client" class="cache">Rechercher un client</label>
          <input id="recherche-client" type="search" placeholder="Rechercher un client…" autocomplete="off" maxlength="60">
        </div>
        <div id="liste-clients" aria-live="polite"><div class="chargement">Chargement…</div></div>`;
    },
    brancher(ctx) {
      flash = "";
      document.getElementById("btn-nouveau-client").addEventListener("click", () => {
        enEdition = null;
        location.hash = "client";
      });
      document.getElementById("recherche-client").addEventListener("input", () => dessinerListe(ctx));
      remplirListe(ctx);
    }
  },

  client: {
    onglet: "clients",
    rendu: (ctx) => rendreFiche(ctx),
    brancher: (ctx) => brancherFiche(ctx)
  }
};
