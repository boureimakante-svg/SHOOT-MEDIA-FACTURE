/* ==========================================================
   SHOOT FACTURE - Module « Produits et prestations »
   Ce que l'entreprise vend, avec son prix.
   Rangés dans l'espace privé de l'entreprise :
   entreprises/{son identifiant}/produits
   ========================================================== */

import { formaterMontant, lireNombre, simple } from "./Outils.js";

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
.puces { display: flex; gap: 8px; margin: 4px 0 4px; flex-wrap: wrap; }
.puce {
  min-height: 40px;
  padding: 0 16px;
  border: 2px solid #CFCBC4;
  border-radius: 999px;
  background: var(--blanc);
  color: var(--noir);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.puce.actif { background: var(--noir); border-color: var(--noir); color: var(--blanc); }

.carte-produit {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 72px;
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
.carte-produit:active { background: var(--fond); }
.pastille-type {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--noir);
  display: flex;
  align-items: center;
  justify-content: center;
}
.pastille-type svg { width: 24px; height: 24px; fill: none; stroke: var(--orange); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.produit-textes { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.produit-nom { font-weight: 700; font-size: 17px; overflow-wrap: anywhere; }
.produit-type { color: var(--gris); font-size: 13px; }
.produit-prix { flex: none; font-weight: 800; font-size: 15px; text-align: right; white-space: nowrap; }
.produit-unite { display: block; font-weight: 500; font-size: 12px; color: var(--gris); }

.choix-groupe { display: flex; gap: 10px; }
.choix { position: relative; flex: 1; }
.choix input { position: absolute; opacity: 0; inset: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
.choix span {
  display: block;
  padding: 14px 8px;
  border: 2px solid #CFCBC4;
  border-radius: 12px;
  background: var(--blanc);
  text-align: center;
  font-weight: 700;
}
.choix input:checked + span { border-color: var(--orange); background: #FFF1E6; }
.choix input:focus-visible + span { outline: 3px solid rgba(255, 106, 0, 0.35); }
`;

/* ----------------------------------------------------------
   Mémoire du module
   ---------------------------------------------------------- */
let liste = null;
let listeUid = null;
let enEdition = null;
let flash = "";
let filtre = "tous";    // tous | produit | prestation

const ICONE_PRODUIT = '<svg viewBox="0 0 24 24"><path d="M3 8l9-5 9 5v8l-9 5-9-5z M3 8l9 5 9-5 M12 13v8"/></svg>';
const ICONE_PRESTATION = '<svg viewBox="0 0 24 24"><path d="M3 8h18v12H3z M8 8V5h8v3 M3 14h18"/></svg>';
const UNITES = ["pièce", "heure", "jour", "mois", "forfait", "m²", "kg", "litre"];

/* ----------------------------------------------------------
   Petits outils
   ---------------------------------------------------------- */
function devise(ctx) {
  return (ctx.etat.entreprise && ctx.etat.entreprise.devise) || "FCFA";
}

function outils(ctx) {
  const { db, F } = ctx.etat.fb;
  const uid = ctx.etat.utilisateur.uid;
  return { db, F, uid, colonne: F.collection(db, "entreprises", uid, "produits") };
}

// Sécurité : si une autre entreprise se connecte sur ce téléphone, on repart de zéro
function verifierProprietaire(ctx) {
  const uid = ctx.etat.utilisateur && ctx.etat.utilisateur.uid;
  if (listeUid !== uid) {
    liste = null;
    enEdition = null;
    flash = "";
    filtre = "tous";
    listeUid = uid;
  }
}

async function chargerProduits(ctx) {
  const { F, colonne } = outils(ctx);
  const resultat = await F.getDocs(colonne);
  liste = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  trier();
}

function trier() {
  liste.sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
}

/* ----------------------------------------------------------
   Écran « Produits » (la liste)
   ---------------------------------------------------------- */
function dessinerListe(ctx) {
  const zone = document.getElementById("liste-produits");
  if (!zone || !liste) return;
  const recherche = simple((document.getElementById("recherche-produit") || {}).value || "").trim();

  const trouves = liste.filter((p) =>
    (filtre === "tous" || p.type === filtre)
    && (!recherche || simple([p.nom, p.description, p.unite].join(" ")).includes(recherche)));

  if (!liste.length) {
    zone.innerHTML = `
      <div class="vide">
        ${ICONE_PRODUIT}
        <p>Aucun produit ni prestation pour l'instant. Appuyez sur « + Nouveau » pour ajouter le premier.</p>
      </div>`;
    return;
  }
  if (!trouves.length) {
    zone.innerHTML = `<p class="aide">Rien ne correspond à votre recherche.</p>`;
    return;
  }

  const monnaie = devise(ctx);
  zone.innerHTML = `
    <p class="compteur">${trouves.length} élément${trouves.length > 1 ? "s" : ""}</p>
    ${trouves.map((p) => `
      <button type="button" class="carte-produit" data-id="${ctx.echapper(p.id)}">
        <span class="pastille-type" aria-hidden="true">${p.type === "prestation" ? ICONE_PRESTATION : ICONE_PRODUIT}</span>
        <span class="produit-textes">
          <span class="produit-nom">${ctx.echapper(p.nom)}</span>
          <span class="produit-type">${p.type === "prestation" ? "Prestation" : "Produit"}</span>
        </span>
        <span class="produit-prix">${ctx.echapper(formaterMontant(p.prix, monnaie))}
          ${p.unite ? `<span class="produit-unite">/ ${ctx.echapper(p.unite)}</span>` : ""}</span>
      </button>`).join("")}`;

  zone.querySelectorAll(".carte-produit").forEach((b) =>
    b.addEventListener("click", () => {
      enEdition = liste.find((p) => p.id === b.dataset.id) || null;
      location.hash = "produit";
    }));
}

async function remplirListe(ctx) {
  verifierProprietaire(ctx);
  if (liste === null) {
    try {
      await chargerProduits(ctx);
    } catch (err) {
      console.error("Produits :", err);
      const zone = document.getElementById("liste-produits");
      if (zone) {
        zone.innerHTML = `
          <div class="chargement">
            <p>Impossible de charger vos produits. Vérifiez votre connexion internet.</p>
            <button type="button" class="btn" id="btn-reessayer-produits">Réessayer</button>
          </div>`;
        const r = document.getElementById("btn-reessayer-produits");
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
   Écran « Fiche produit » (ajouter / modifier)
   ---------------------------------------------------------- */
function rendreFiche(ctx) {
  const p = enEdition || {};
  const v = (cle) => ctx.echapper(p[cle] ?? "");
  const type = p.type === "prestation" ? "prestation" : "produit";
  const prix = p.prix === undefined ? "" : ctx.echapper(String(p.prix).replace(".", ","));
  return `
    <button type="button" class="lien retour" data-aller="produits">← Produits</button>
    <h1>${enEdition ? "Modifier" : "Nouveau produit ou prestation"}</h1>
    <p class="sous-titre">${enEdition ? "Changez les informations puis enregistrez." : "Ce que vous vendez à vos clients."}</p>

    <form id="form-produit" novalidate>
      <div class="champ">
        <label>Type</label>
        <div class="choix-groupe">
          <label class="choix"><input type="radio" name="type" value="produit"${type === "produit" ? " checked" : ""}><span>Produit</span></label>
          <label class="choix"><input type="radio" name="type" value="prestation"${type === "prestation" ? " checked" : ""}><span>Prestation</span></label>
        </div>
      </div>
      <div class="champ">
        <label for="p-nom">Nom</label>
        <input id="p-nom" name="nom" type="text" value="${v("nom")}" maxlength="120"
               placeholder="Ex. Photo de mariage, Cadre 30x40" autocomplete="off">
      </div>
      <div class="champ">
        <label for="p-prix">Prix unitaire (${ctx.echapper(devise(ctx))})</label>
        <input id="p-prix" name="prix" type="text" inputmode="decimal" value="${prix}" maxlength="18"
               placeholder="Ex. 15000" autocomplete="off">
      </div>
      <div class="champ">
        <label for="p-unite">Unité (facultatif)</label>
        <input id="p-unite" name="unite" type="text" value="${v("unite")}" maxlength="20" list="liste-unites"
               placeholder="Ex. pièce, heure, jour, forfait" autocomplete="off">
        <datalist id="liste-unites">${UNITES.map((u) => `<option value="${u}">`).join("")}</datalist>
      </div>
      <div class="champ">
        <label for="p-description">Description (facultatif)</label>
        <textarea id="p-description" name="description" maxlength="400" placeholder="Détails affichés sur la facture">${v("description")}</textarea>
      </div>

      <div class="actions-client">
        <button type="submit" class="btn btn-large" id="btn-enregistrer-produit">Enregistrer</button>
        ${enEdition ? '<button type="button" class="btn btn-danger btn-large" id="btn-supprimer-produit">Supprimer</button>' : ""}
      </div>
      <p id="message-produit" class="message" role="alert"></p>
    </form>`;
}

function brancherFiche(ctx) {
  verifierProprietaire(ctx);
  const form = document.getElementById("form-produit");
  const message = document.getElementById("message-produit");
  const bouton = document.getElementById("btn-enregistrer-produit");
  let occupe = false;

  const dire = (texte, type) => { message.textContent = texte; message.className = "message " + type; };
  const lire = (id) => form.elements[id].value.trim();

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (occupe) return;
    const nom = lire("nom");
    const prix = lireNombre(lire("prix"));
    const type = form.elements.type.value === "prestation" ? "prestation" : "produit";

    if (nom.length < 2) { dire("Indiquez le nom.", "erreur"); form.elements.nom.focus(); return; }
    if (!lire("prix") || Number.isNaN(prix)) { dire("Indiquez un prix valide, par exemple 15000.", "erreur"); form.elements.prix.focus(); return; }
    if (prix > 1e12) { dire("Ce prix est trop grand.", "erreur"); form.elements.prix.focus(); return; }
    if (!navigator.onLine) { dire("Vous êtes hors ligne. Reconnectez-vous à internet pour enregistrer.", "erreur"); return; }

    const donnees = { nom, type, prix, unite: lire("unite"), description: lire("description") };

    occupe = true;
    bouton.disabled = true;
    bouton.textContent = "Enregistrement…";
    message.className = "message";
    message.textContent = "";
    try {
      const { db, F, uid, colonne } = outils(ctx);
      if (enEdition) {
        await F.setDoc(F.doc(db, "entreprises", uid, "produits", enEdition.id),
          { ...donnees, modifieLe: F.serverTimestamp() }, { merge: true });
        Object.assign(enEdition, donnees);
      } else {
        const ref = await F.addDoc(colonne, { ...donnees, creeLe: F.serverTimestamp() });
        if (liste) liste.push({ id: ref.id, ...donnees });
      }
      if (liste) trier();
      flash = "Enregistré.";
      enEdition = null;
      location.hash = "produits";
    } catch (err) {
      console.error(err);
      dire("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.", "erreur");
      occupe = false;
      bouton.disabled = false;
      bouton.textContent = "Enregistrer";
    }
  });

  const supprimer = document.getElementById("btn-supprimer-produit");
  if (supprimer) {
    supprimer.addEventListener("click", async () => {
      if (occupe || !enEdition) return;
      if (!window.confirm("Supprimer cet élément ? Cette action est définitive.")) return;
      if (!navigator.onLine) { dire("Vous êtes hors ligne. Reconnectez-vous à internet pour supprimer.", "erreur"); return; }
      occupe = true;
      supprimer.disabled = true;
      try {
        const { db, F, uid } = outils(ctx);
        await F.deleteDoc(F.doc(db, "entreprises", uid, "produits", enEdition.id));
        if (liste) liste = liste.filter((p) => p.id !== enEdition.id);
        flash = "Supprimé.";
        enEdition = null;
        location.hash = "produits";
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
  produits: {
    rendu(ctx) {
      verifierProprietaire(ctx);
      const puce = (valeur, texte) =>
        `<button type="button" class="puce${filtre === valeur ? " actif" : ""}" data-filtre="${valeur}">${texte}</button>`;
      return `
        <h1>Produits et prestations</h1>
        <p class="sous-titre">Ce que vous vendez, avec son prix.</p>
        ${flash ? `<p class="message succes">${ctx.echapper(flash)}</p>` : ""}
        <button type="button" class="btn btn-large" id="btn-nouveau-produit">+ Nouveau</button>
        <div class="champ recherche">
          <label for="recherche-produit" class="cache">Rechercher</label>
          <input id="recherche-produit" type="search" placeholder="Rechercher…" autocomplete="off" maxlength="60">
        </div>
        <div class="puces">${puce("tous", "Tous")}${puce("produit", "Produits")}${puce("prestation", "Prestations")}</div>
        <div id="liste-produits" aria-live="polite"><div class="chargement">Chargement…</div></div>`;
    },
    brancher(ctx) {
      flash = "";
      document.getElementById("btn-nouveau-produit").addEventListener("click", () => {
        enEdition = null;
        location.hash = "produit";
      });
      document.getElementById("recherche-produit").addEventListener("input", () => dessinerListe(ctx));
      document.querySelectorAll(".puce").forEach((b) =>
        b.addEventListener("click", () => {
          filtre = b.dataset.filtre;
          document.querySelectorAll(".puce").forEach((x) => x.classList.toggle("actif", x === b));
          dessinerListe(ctx);
        }));
      remplirListe(ctx);
    }
  },

  produit: {
    onglet: "produits",
    rendu: (ctx) => rendreFiche(ctx),
    brancher: (ctx) => brancherFiche(ctx)
  }
};
