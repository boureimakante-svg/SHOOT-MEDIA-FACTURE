/* ==========================================================
   SHOOT FACTURE - Module « Devis »
   Créer un devis, l'envoyer, le suivre (en attente, accepté,
   refusé) puis le transformer en facture en un seul appui.
   Rangés dans l'espace privé de l'entreprise :
   entreprises/{son identifiant}/devis
   ========================================================== */

import { formaterMontant, lireNombre, simple } from "./outils.js";
import {
  devise, calculer, statutDe, dateAujourdhui, dateFr, arrondir,
  chiffresWhatsApp, instantaneEmetteur, creerFacture,
  memoire as memoireFactures, trier as trierFactures
} from "./facturation.js";

/* ----------------------------------------------------------
   Styles de ce module
   (les styles des factures et du PDF sont déjà chargés par
   factures.js, facture-form.js et facture-pdf.js)
   ---------------------------------------------------------- */
export const style = `
.onglets-doc { display: flex; gap: 8px; margin: 0 0 14px; }
.onglet-doc {
  flex: 1;
  min-height: 46px;
  border: 2px solid #CFCBC4;
  border-radius: 12px;
  background: var(--blanc);
  color: var(--noir);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}
.onglet-doc.actif { background: var(--noir); border-color: var(--noir); color: var(--blanc); }
.rangee-actions { display: flex; gap: 8px; }
.rangee-actions .btn-ligne { flex: 1; }
.pdf-signature { display: flex; gap: 20px; margin-top: 26px; }
.pdf-signature div { flex: 1; min-height: 56px; padding-top: 4px; border-top: 1px solid #999; color: #666; font-size: 11px; }
`;

/* ----------------------------------------------------------
   Mémoire du module
   ---------------------------------------------------------- */
const mem = { liste: null, uid: null, selection: null, edition: null, flash: "" };
let filtre = "tous";   // tous | attente | accepte | refuse | converti

const ICONE_DEVIS = '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6"/></svg>';

const STATUTS = {
  attente: { libelle: "En attente", classe: "badge-impayee" },
  accepte: { libelle: "Accepté", classe: "badge-ok" },
  refuse: { libelle: "Refusé", classe: "badge-retard" },
  converti: { libelle: "Converti en facture", classe: "badge-avance" }
};

// Ce qui s'affiche à côté d'un devis
function etiquetteDevis(d) {
  const statut = STATUTS[d.statut] ? d.statut : "attente";
  if (statut === "attente" && d.validite && d.validite < dateAujourdhui()) {
    return { code: "attente", libelle: "Expiré", classe: "badge-retard" };
  }
  return { code: statut, ...STATUTS[statut] };
}

/* ----------------------------------------------------------
   Petits outils
   ---------------------------------------------------------- */
const deux = (n) => String(n).padStart(2, "0");

function plusJours(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

function nombreOuZero(texte) {
  const n = lireNombre(texte);
  return Number.isNaN(n) ? 0 : n;
}

function ligneVide() {
  return { description: "", quantite: "1", prix: "" };
}

// Sécurité : si une autre entreprise se connecte sur ce téléphone, on repart de zéro
function verifier(ctx) {
  const uid = ctx.etat.utilisateur && ctx.etat.utilisateur.uid;
  if (mem.uid !== uid) {
    mem.liste = null;
    mem.selection = null;
    mem.edition = null;
    mem.flash = "";
    mem.uid = uid;
    filtre = "tous";
  }
}

function acces(ctx) {
  const { db, F } = ctx.etat.fb;
  const uid = ctx.etat.utilisateur.uid;
  return { db, F, uid, colonne: F.collection(db, "entreprises", uid, "devis") };
}

function trierDevis() {
  mem.liste.sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")) || (Number(b.seq || 0) - Number(a.seq || 0)));
}

/* ----------------------------------------------------------
   Accès aux devis (base de données)
   ---------------------------------------------------------- */
async function chargerDevis(ctx) {
  const { F, colonne } = acces(ctx);
  const resultat = await F.getDocs(colonne);
  mem.liste = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  trierDevis();
}

// Numéro automatique DEV-2026-0001, attribué dans une « transaction » :
// jamais de doublon, jamais de trou.
async function creerDevis(ctx, donnees) {
  const { db, F, uid } = acces(ctx);
  const annee = Number(String(donnees.date).slice(0, 4)) || new Date().getFullYear();
  const compteur = F.doc(db, "entreprises", uid, "compteurs", "devis-" + annee);
  const reference = F.doc(F.collection(db, "entreprises", uid, "devis"));
  let resultat = null;

  await F.runTransaction(db, async (tx) => {
    const lu = await tx.get(compteur);
    const n = (lu.exists() ? Number(lu.data().dernier) || 0 : 0) + 1;
    resultat = { ...donnees, numero: `DEV-${annee}-${String(n).padStart(4, "0")}`, annee, seq: n };
    tx.set(compteur, { dernier: n });
    tx.set(reference, { ...resultat, creeLe: F.serverTimestamp() });
  });

  return { id: reference.id, ...resultat };
}

async function modifierDevis(ctx, devis, champs) {
  const { db, F, uid } = acces(ctx);
  await F.setDoc(F.doc(db, "entreprises", uid, "devis", devis.id),
    { ...champs, modifieLe: F.serverTimestamp() }, { merge: true });
  Object.assign(devis, champs);
}

async function supprimerDevis(ctx, devis) {
  const { db, F, uid } = acces(ctx);
  await F.deleteDoc(F.doc(db, "entreprises", uid, "devis", devis.id));
  if (mem.liste) mem.liste = mem.liste.filter((d) => d.id !== devis.id);
}

// Crée une vraie facture à partir du devis, puis marque le devis « converti »
async function transformerEnFacture(ctx, devis) {
  const facture = await creerFacture(ctx, {
    date: dateAujourdhui(),
    echeance: "",
    client: devis.client,
    lignes: devis.lignes,
    remise: devis.remise,
    tva: devis.tva,
    notes: devis.notes || "",
    sousTotal: devis.sousTotal,
    montantTva: devis.montantTva,
    total: devis.total,
    paye: 0,
    solde: devis.total,
    statut: statutDe(devis.total, 0),
    paiements: [],
    devise: devis.devise || devise(ctx),
    emetteur: instantaneEmetteur(ctx.etat.entreprise),
    devisNumero: devis.numero
  });
  if (memoireFactures.liste) { memoireFactures.liste.push(facture); trierFactures(); }
  await modifierDevis(ctx, devis, { statut: "converti", factureNumero: facture.numero, factureId: facture.id });
  return facture;
}

/* ----------------------------------------------------------
   WhatsApp
   ---------------------------------------------------------- */
function lienWhatsAppDevis(d, nomEntreprise, monnaie) {
  const texte = [
    `Bonjour ${(d.client && d.client.nom) || ""},`,
    `Voici notre devis ${d.numero} du ${dateFr(d.date)} : montant total ${formaterMontant(d.total, monnaie)}.`,
    d.validite ? `Il est valable jusqu'au ${dateFr(d.validite)}.` : "",
    `Merci de votre confiance. ${nomEntreprise || ""}`.trim()
  ].filter(Boolean).join("\n");
  return `https://wa.me/${chiffresWhatsApp(d.client && d.client.telephone)}?text=${encodeURIComponent(texte)}`;
}

/* ----------------------------------------------------------
   Barre « Factures | Devis »
   ---------------------------------------------------------- */
function barreOnglets(actif) {
  return `
    <div class="onglets-doc">
      <button type="button" class="onglet-doc${actif === "factures" ? " actif" : ""}" data-aller="factures">Factures</button>
      <button type="button" class="onglet-doc${actif === "devis" ? " actif" : ""}" data-aller="devis">Devis</button>
      <button type="button" class="onglet-doc${actif === "bilan" ? " actif" : ""}" data-aller="bilan">Bilan</button>
    </div>`;
}

/* ----------------------------------------------------------
   Écran « Devis » (la liste)
   ---------------------------------------------------------- */
function dessinerListe(ctx) {
  const zone = document.getElementById("liste-devis");
  if (!zone || !mem.liste) return;
  const esc = ctx.echapper;
  const liste = mem.liste;
  const monnaie = devise(ctx);
  const recherche = simple((document.getElementById("recherche-devis") || {}).value || "").trim();

  const resume = document.getElementById("resume-devis");
  if (resume) {
    const attente = liste.filter((d) => etiquetteDevis(d).code === "attente")
      .reduce((s, d) => s + arrondir(d.total), 0);
    resume.innerHTML = attente > 0
      ? `<span>Devis en attente</span><strong>${esc(formaterMontant(arrondir(attente), monnaie))}</strong>`
      : "";
  }

  if (!liste.length) {
    zone.innerHTML = `
      <div class="vide">
        ${ICONE_DEVIS}
        <p>Aucun devis pour l'instant. Appuyez sur « + Nouveau devis » pour créer le premier.</p>
      </div>`;
    return;
  }

  const trouves = liste.filter((d) =>
    (filtre === "tous" || etiquetteDevis(d).code === filtre)
    && (!recherche || simple([d.numero, d.client && d.client.nom, d.client && d.client.telephone].join(" ")).includes(recherche)));

  if (!trouves.length) {
    zone.innerHTML = `<p class="aide">Aucun devis ne correspond.</p>`;
    return;
  }

  zone.innerHTML = `
    <p class="compteur">${trouves.length} devis</p>
    ${trouves.map((d) => {
      const st = etiquetteDevis(d);
      return `
      <button type="button" class="carte-facture" data-id="${esc(d.id)}">
        <span class="facture-textes">
          <span class="facture-numero">${esc(d.numero)}</span>
          <span class="facture-client">${esc((d.client && d.client.nom) || "Client sans nom")}</span>
          <span class="facture-date">${esc(dateFr(d.date))}</span>
        </span>
        <span class="facture-droite">
          <span class="facture-total">${esc(formaterMontant(d.total, d.devise || monnaie))}</span>
          <span class="badge ${st.classe}">${esc(st.libelle)}</span>
        </span>
      </button>`;
    }).join("")}`;

  zone.querySelectorAll(".carte-facture").forEach((b) =>
    b.addEventListener("click", () => {
      mem.selection = mem.liste.find((d) => d.id === b.dataset.id) || null;
      location.hash = "devis-fiche";
    }));
}

async function remplirListe(ctx) {
  verifier(ctx);
  if (mem.liste === null) {
    try {
      await chargerDevis(ctx);
    } catch (err) {
      console.error("Devis :", err);
      const zone = document.getElementById("liste-devis");
      if (zone) {
        zone.innerHTML = `
          <div class="chargement">
            <p>Impossible de charger vos devis. Vérifiez votre connexion internet.</p>
            <button type="button" class="btn" id="btn-reessayer-devis">Réessayer</button>
          </div>`;
        const r = document.getElementById("btn-reessayer-devis");
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

function rendreListe(ctx) {
  verifier(ctx);
  const puce = (valeur, texte) =>
    `<button type="button" class="puce${filtre === valeur ? " actif" : ""}" data-filtre="${valeur}">${texte}</button>`;
  return `
    ${barreOnglets("devis")}
    <h1>Devis</h1>
    <p class="sous-titre">Vos propositions de prix, à transformer en factures.</p>
    ${mem.flash ? `<p class="message succes">${ctx.echapper(mem.flash)}</p>` : ""}
    <button type="button" class="btn btn-large" id="btn-nouveau-devis">+ Nouveau devis</button>
    <div class="resume-factures" id="resume-devis"></div>
    <div class="champ recherche">
      <label for="recherche-devis" class="cache">Rechercher</label>
      <input id="recherche-devis" type="search" placeholder="Numéro ou client…" autocomplete="off" maxlength="60">
    </div>
    <div class="puces">${puce("tous", "Tous")}${puce("attente", "En attente")}${puce("accepte", "Acceptés")}${puce("refuse", "Refusés")}${puce("converti", "Convertis")}</div>
    <div id="liste-devis" aria-live="polite"><div class="chargement">Chargement…</div></div>`;
}

function brancherListe(ctx) {
  mem.flash = "";
  document.getElementById("btn-nouveau-devis").addEventListener("click", () => {
    mem.edition = null;
    location.hash = "devis-form";
  });
  document.getElementById("recherche-devis").addEventListener("input", () => dessinerListe(ctx));
  document.querySelectorAll(".puce").forEach((b) =>
    b.addEventListener("click", () => {
      filtre = b.dataset.filtre;
      document.querySelectorAll(".puce").forEach((x) => x.classList.toggle("actif", x === b));
      dessinerListe(ctx);
    }));
  remplirListe(ctx);
}

/* ----------------------------------------------------------
   Écran « Fiche d'un devis »
   ---------------------------------------------------------- */
function rendreFiche(ctx) {
  verifier(ctx);
  const d = mem.selection;
  if (!d) {
    return `
      <button type="button" class="lien retour" data-aller="devis">← Devis</button>
      <p class="aide">Ce devis n'est plus affiché. Revenez à la liste et appuyez sur le devis.</p>`;
  }

  const esc = ctx.echapper;
  const monnaie = d.devise || devise(ctx);
  const m = (n) => esc(formaterMontant(n, monnaie));
  const st = etiquetteDevis(d);
  const client = d.client || {};
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  const nomEntreprise = (ctx.etat.entreprise && ctx.etat.entreprise.nom) || "";
  const converti = d.statut === "converti";

  const blocLignes = lignes.map((l) => `
    <div class="ligne-article">
      <div class="article-nom">${esc(l.description)}</div>
      <div class="article-detail">
        <span>${esc(String(l.quantite))} × ${m(l.prix)}</span>
        <span>${m(arrondir(Number(l.quantite) * Number(l.prix)))}</span>
      </div>
    </div>`).join("");

  const blocWhatsApp = client.telephone
    ? `<a class="btn btn-large" href="${esc(lienWhatsAppDevis(d, nomEntreprise, monnaie))}" target="_blank" rel="noopener">Envoyer par WhatsApp</a>`
    : `<p class="aide">Ajoutez un numéro de téléphone au client (bouton Modifier) pour l'envoyer par WhatsApp.</p>`;

  let blocStatut = "";
  if (converti) {
    blocStatut = `
      <div class="bloc">
        <h2>Facture</h2>
        <p class="aide">Ce devis a été transformé en facture ${esc(d.factureNumero || "")}. Retrouvez-la dans la liste des factures.</p>
      </div>`;
  } else if (d.statut === "attente" || !STATUTS[d.statut]) {
    blocStatut = `
      <div class="rangee-actions">
        <button type="button" class="btn-ligne" id="btn-accepte">Marquer accepté</button>
        <button type="button" class="btn-ligne" id="btn-refuse">Marquer refusé</button>
      </div>`;
  } else {
    blocStatut = `<button type="button" class="btn btn-secondaire btn-large" id="btn-attente">Remettre en attente</button>`;
  }

  return `
    <button type="button" class="lien retour" data-aller="devis">← Devis</button>
    <div class="titre-facture">
      <h1>${esc(d.numero)}</h1>
      <span class="badge ${st.classe}">${esc(st.libelle)}</span>
    </div>
    ${mem.flash ? `<p class="message succes">${esc(mem.flash)}</p>` : ""}

    <div class="bloc">
      <h2>Client</h2>
      <div class="ligne"><span>Nom</span><span class="valeur">${esc(client.nom || "—")}</span></div>
      ${client.telephone ? `<div class="ligne"><span>Téléphone</span><span class="valeur">${esc(client.telephone)}</span></div>` : ""}
      <div class="ligne"><span>Date</span><span class="valeur">${esc(dateFr(d.date))}</span></div>
      ${d.validite ? `<div class="ligne"><span>Valable jusqu'au</span><span class="valeur">${esc(dateFr(d.validite))}</span></div>` : ""}
    </div>

    <div class="bloc">
      <h2>Détail</h2>
      ${blocLignes || '<p class="aide">Aucune ligne.</p>'}
      <div class="ligne espace-haut"><span>Sous-total</span><span class="valeur">${m(d.sousTotal)}</span></div>
      ${Number(d.remise) > 0 ? `<div class="ligne"><span>Remise</span><span class="valeur">− ${m(d.remise)}</span></div>` : ""}
      ${Number(d.tva) > 0 ? `<div class="ligne"><span>TVA (${esc(String(d.tva))} %)</span><span class="valeur">${m(d.montantTva)}</span></div>` : ""}
      <div class="ligne total-fort"><span>Total</span><span class="valeur">${m(d.total)}</span></div>
    </div>

    ${d.notes ? `<div class="bloc"><h2>Notes</h2><p class="notes-facture">${esc(d.notes)}</p></div>` : ""}

    <div class="actions-client">
      ${converti ? "" : '<button type="button" class="btn btn-large" id="btn-transformer">Transformer en facture</button>'}
      ${blocStatut}
      ${blocWhatsApp}
      <button type="button" class="btn btn-secondaire btn-large" id="btn-pdf-devis">Devis en PDF / Imprimer</button>
      ${converti ? "" : '<button type="button" class="btn btn-secondaire btn-large" id="btn-modifier-devis">Modifier le devis</button>'}
      <button type="button" class="btn btn-danger btn-large" id="btn-supprimer-devis">Supprimer le devis</button>
    </div>
    <p id="message-devis" class="message" role="alert"></p>`;
}

function brancherFiche(ctx) {
  verifier(ctx);
  mem.flash = "";
  const d = mem.selection;
  if (!d) return;
  let occupe = false;
  const message = document.getElementById("message-devis");
  const dire = (texte, type) => { message.textContent = texte; message.className = "message " + type; };

  const lier = (id, action) => {
    const bouton = document.getElementById(id);
    if (bouton) bouton.addEventListener("click", action);
  };

  async function changerStatut(statut, texte) {
    if (occupe) return;
    if (!navigator.onLine) return dire("Vous êtes hors ligne. Reconnectez-vous à internet.", "erreur");
    occupe = true;
    try {
      await modifierDevis(ctx, d, { statut });
      mem.flash = texte;
      ctx.afficher();
    } catch (err) {
      console.error(err);
      dire("La modification a échoué. Vérifiez votre connexion et réessayez.", "erreur");
      occupe = false;
    }
  }

  lier("btn-accepte", () => changerStatut("accepte", "Devis marqué comme accepté."));
  lier("btn-refuse", () => changerStatut("refuse", "Devis marqué comme refusé."));
  lier("btn-attente", () => changerStatut("attente", "Devis remis en attente."));

  lier("btn-transformer", async () => {
    if (occupe) return;
    if (!window.confirm("Créer une facture à partir de ce devis ?")) return;
    if (!navigator.onLine) return dire("Vous êtes hors ligne. Reconnectez-vous à internet.", "erreur");
    occupe = true;
    const bouton = document.getElementById("btn-transformer");
    bouton.disabled = true;
    bouton.textContent = "Création de la facture…";
    try {
      const facture = await transformerEnFacture(ctx, d);
      memoireFactures.selection = facture;
      memoireFactures.flash = "Facture " + facture.numero + " créée à partir du devis " + d.numero + ".";
      location.hash = "facture";
    } catch (err) {
      console.error(err);
      dire("La création de la facture a échoué. Vérifiez votre connexion, puis contrôlez la liste des factures avant de réessayer.", "erreur");
      occupe = false;
      bouton.disabled = false;
      bouton.textContent = "Transformer en facture";
    }
  });

  lier("btn-pdf-devis", () => { location.hash = "devis-pdf"; });
  lier("btn-modifier-devis", () => { mem.edition = d; location.hash = "devis-form"; });

  lier("btn-supprimer-devis", async () => {
    if (occupe) return;
    if (!window.confirm("Supprimer ce devis ? Cette action est définitive.")) return;
    if (!navigator.onLine) return dire("Vous êtes hors ligne. Reconnectez-vous à internet pour supprimer.", "erreur");
    occupe = true;
    try {
      await supprimerDevis(ctx, d);
      mem.selection = null;
      mem.flash = "Devis supprimé.";
      location.hash = "devis";
    } catch (err) {
      console.error(err);
      dire("La suppression a échoué. Vérifiez votre connexion et réessayez.", "erreur");
      occupe = false;
    }
  });
}

/* ----------------------------------------------------------
   Écran « Formulaire de devis » (créer / modifier)
   ---------------------------------------------------------- */
function rendreFormulaire(ctx) {
  verifier(ctx);
  const d = mem.edition;
  const esc = ctx.echapper;
  const monnaie = (d && d.devise) || devise(ctx);
  const client = (d && d.client) || {};
  const date = (d && d.date) || dateAujourdhui();
  const validite = (d && d.validite) || plusJours(date, 30);
  const retour = d ? "devis-fiche" : "devis";
  const nombre = (n) => (n === undefined || n === null || Number(n) === 0 ? "" : String(n).replace(".", ","));

  return `
    <button type="button" class="lien retour" data-aller="${retour}">← ${d ? "Retour au devis" : "Devis"}</button>
    <h1>${d ? "Modifier " + esc(d.numero) : "Nouveau devis"}</h1>
    <p class="sous-titre">${d ? "Changez les informations puis enregistrez." : "Le numéro est attribué automatiquement."}</p>

    <form id="form-devis" novalidate>
      <div class="bloc">
        <h2>Client</h2>
        <div class="champ">
          <label for="choix-client-devis">Client enregistré (facultatif)</label>
          <select id="choix-client-devis">
            <option value="">Saisir un autre client</option>
          </select>
        </div>
        <div class="champ">
          <label for="d-client">Nom du client</label>
          <input id="d-client" name="client" type="text" value="${esc(client.nom || "")}" maxlength="120"
                 placeholder="Ex. Awa Traoré" autocomplete="off">
        </div>
        <div class="champ">
          <label for="d-tel">Téléphone WhatsApp (facultatif)</label>
          <input id="d-tel" name="telephone" type="tel" inputmode="tel" value="${esc(client.telephone || "")}" maxlength="25"
                 placeholder="Ex. 22370123456" autocomplete="off">
        </div>
        <div class="champ">
          <label for="d-date">Date du devis</label>
          <input id="d-date" name="date" type="date" value="${esc(date)}">
        </div>
        <div class="champ">
          <label for="d-validite">Valable jusqu'au</label>
          <input id="d-validite" name="validite" type="date" value="${esc(validite)}">
        </div>
      </div>

      <div class="bloc">
        <h2>Articles</h2>
        <div id="lignes-devis"></div>
        <div class="ajout-article">
          <select id="choix-produit-devis" aria-label="Choisir un produit ou une prestation">
            <option value="">Ligne vide</option>
          </select>
          <button type="button" class="btn-ligne" id="btn-ajouter-ligne-devis">+ Ajouter</button>
        </div>
        <p class="aide">Choisissez un produit ou une prestation dans la liste pour remplir la ligne avec son prix.</p>
      </div>

      <div class="bloc">
        <h2>Remise et TVA</h2>
        <div class="champ">
          <label for="d-remise">Remise (montant en ${esc(monnaie)}, facultatif)</label>
          <input id="d-remise" name="remise" type="text" inputmode="decimal" value="${esc(nombre(d && d.remise))}"
                 maxlength="18" placeholder="Ex. 5000" autocomplete="off">
        </div>
        <div class="champ">
          <label for="d-tva">TVA en % (facultatif)</label>
          <input id="d-tva" name="tva" type="text" inputmode="decimal" value="${esc(nombre(d && d.tva))}"
                 maxlength="6" placeholder="Ex. 18" autocomplete="off">
        </div>
      </div>

      <div class="bloc">
        <h2>Notes (facultatif)</h2>
        <div class="champ">
          <label for="d-notes" class="cache">Notes</label>
          <textarea id="d-notes" name="notes" maxlength="500" placeholder="Ex. Délai de réalisation : 5 jours">${esc((d && d.notes) || "")}</textarea>
        </div>
      </div>

      <div class="bloc">
        <h2>Récapitulatif</h2>
        <div class="ligne"><span>Sous-total</span><span class="valeur" id="dtot-sous"></span></div>
        <div class="ligne" id="dligne-remise"><span>Remise</span><span class="valeur" id="dtot-remise"></span></div>
        <div class="ligne" id="dligne-tva"><span>TVA</span><span class="valeur" id="dtot-tva"></span></div>
        <div class="ligne total-fort"><span>Total</span><span class="valeur" id="dtot-total"></span></div>
      </div>

      <div class="actions-client">
        <button type="submit" class="btn btn-large" id="btn-enregistrer-devis">Enregistrer le devis</button>
        <button type="button" class="btn btn-secondaire btn-large" id="btn-annuler-devis">Annuler</button>
      </div>
      <p id="message-form-devis" class="message" role="alert"></p>
    </form>`;
}

function brancherFormulaire(ctx) {
  verifier(ctx);
  const d = mem.edition;
  const esc = ctx.echapper;
  const monnaie = (d && d.devise) || devise(ctx);
  const form = document.getElementById("form-devis");
  const zoneLignes = document.getElementById("lignes-devis");
  const message = document.getElementById("message-form-devis");
  const bouton = document.getElementById("btn-enregistrer-devis");
  const m = (n) => formaterMontant(n, monnaie);
  let occupe = false;

  const dire = (texte, type) => { message.textContent = texte; message.className = "message " + type; };

  let lignes = d && Array.isArray(d.lignes) && d.lignes.length
    ? d.lignes.map((l) => ({
        description: String(l.description || ""),
        quantite: String(l.quantite ?? 1).replace(".", ","),
        prix: String(l.prix ?? "").replace(".", ",")
      }))
    : [ligneVide()];

  const lignesNumeriques = () => lignes.map((l) => ({
    description: l.description.trim(),
    quantite: lireNombre(l.quantite),
    prix: lireNombre(l.prix)
  }));

  function majTotaux() {
    const valides = lignesNumeriques().filter((l) => !Number.isNaN(l.quantite) && !Number.isNaN(l.prix));
    const c = calculer(valides, nombreOuZero(form.elements.remise.value), nombreOuZero(form.elements.tva.value), 0);
    document.getElementById("dtot-sous").textContent = m(c.sousTotal);
    document.getElementById("dtot-remise").textContent = "− " + m(c.remise);
    document.getElementById("dtot-tva").textContent = m(c.montantTva) + " (" + c.tva + " %)";
    document.getElementById("dtot-total").textContent = m(c.total);
    document.getElementById("dligne-remise").style.display = c.remise > 0 ? "" : "none";
    document.getElementById("dligne-tva").style.display = c.tva > 0 ? "" : "none";
  }

  function majTotalLigne(i) {
    const zone = document.getElementById("dl-total-" + i);
    if (!zone) return;
    const q = lireNombre(lignes[i].quantite);
    const p = lireNombre(lignes[i].prix);
    zone.textContent = Number.isNaN(q) || Number.isNaN(p) ? "" : "Montant : " + m(Math.round(q * p * 100) / 100);
  }

  function dessinerLignes() {
    zoneLignes.innerHTML = lignes.map((l, i) => `
      <div class="article-form">
        <div class="champ">
          <label for="dl-desc-${i}">Article ${i + 1}</label>
          <input id="dl-desc-${i}" type="text" data-i="${i}" data-champ="description" value="${esc(l.description)}"
                 maxlength="160" placeholder="Ex. Photo de mariage" autocomplete="off">
        </div>
        <div class="article-rangee">
          <div class="champ">
            <label for="dl-qte-${i}">Quantité</label>
            <input id="dl-qte-${i}" type="text" inputmode="decimal" data-i="${i}" data-champ="quantite"
                   value="${esc(l.quantite)}" maxlength="10" autocomplete="off">
          </div>
          <div class="champ">
            <label for="dl-prix-${i}">Prix unitaire</label>
            <input id="dl-prix-${i}" type="text" inputmode="decimal" data-i="${i}" data-champ="prix"
                   value="${esc(l.prix)}" maxlength="18" placeholder="Ex. 15000" autocomplete="off">
          </div>
        </div>
        <div class="article-pied">
          <span id="dl-total-${i}"></span>
          ${lignes.length > 1 ? `<button type="button" class="btn-ligne" data-retirer="${i}">Retirer</button>` : ""}
        </div>
      </div>`).join("");

    zoneLignes.querySelectorAll("input[data-i]").forEach((champ) =>
      champ.addEventListener("input", () => {
        lignes[Number(champ.dataset.i)][champ.dataset.champ] = champ.value;
        majTotalLigne(Number(champ.dataset.i));
        majTotaux();
      }));
    zoneLignes.querySelectorAll("[data-retirer]").forEach((b) =>
      b.addEventListener("click", () => {
        lignes.splice(Number(b.dataset.retirer), 1);
        if (!lignes.length) lignes.push(ligneVide());
        dessinerLignes();
        majTotaux();
      }));
    lignes.forEach((_, i) => majTotalLigne(i));
  }

  /* --- Produits proposés dans la liste --- */
  let produits = [];
  (async () => {
    try {
      const { db, F, uid } = acces(ctx);
      const resultat = await F.getDocs(F.collection(db, "entreprises", uid, "produits"));
      produits = resultat.docs.map((x) => ({ id: x.id, ...x.data() }))
        .sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
      const choix = document.getElementById("choix-produit-devis");
      if (!choix || !form.isConnected) return;
      produits.forEach((p) => {
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = p.nom + " — " + formaterMontant(p.prix, monnaie);
        choix.appendChild(option);
      });
    } catch (err) {
      console.warn("Produits non chargés :", err);
    }
  })();

  /* --- Clients enregistrés dans le carnet --- */
  let clients = [];
  (async () => {
    try {
      const { db, F, uid } = acces(ctx);
      const resultat = await F.getDocs(F.collection(db, "entreprises", uid, "clients"));
      clients = resultat.docs.map((x) => ({ id: x.id, ...x.data() }))
        .sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
      const liste = document.getElementById("choix-client-devis");
      if (!liste || !form.isConnected) return;
      clients.forEach((c) => {
        const option = document.createElement("option");
        option.value = c.id;
        option.textContent = c.nom + (c.telephone ? " — " + c.telephone : "");
        liste.appendChild(option);
      });
    } catch (err) {
      console.warn("Clients non chargés :", err);
    }
  })();

  document.getElementById("choix-client-devis").addEventListener("change", (ev) => {
    const c = clients.find((x) => x.id === ev.target.value);
    if (!c) return;
    form.elements.client.value = c.nom || "";
    form.elements.telephone.value = c.telephone || "";
  });

  document.getElementById("btn-ajouter-ligne-devis").addEventListener("click", () => {
    const choix = document.getElementById("choix-produit-devis");
    const produit = produits.find((p) => p.id === choix.value);
    const nouvelle = produit
      ? { description: String(produit.nom || ""), quantite: "1", prix: String(produit.prix ?? "").replace(".", ",") }
      : ligneVide();
    const seuleVide = lignes.length === 1 && !lignes[0].description.trim() && !lignes[0].prix.trim();
    if (seuleVide) lignes = [nouvelle]; else lignes.push(nouvelle);
    choix.value = "";
    dessinerLignes();
    majTotaux();
  });

  ["remise", "tva"].forEach((nom) => form.elements[nom].addEventListener("input", majTotaux));

  document.getElementById("btn-annuler-devis").addEventListener("click", () => {
    mem.edition = null;
    location.hash = d ? "devis-fiche" : "devis";
  });

  /* --- Enregistrer --- */
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (occupe) return;

    const nomClient = form.elements.client.value.trim();
    const telephone = form.elements.telephone.value.trim();
    const date = form.elements.date.value;
    const validite = form.elements.validite.value;
    const notes = form.elements.notes.value.trim();

    if (nomClient.length < 2) { dire("Indiquez le nom du client.", "erreur"); form.elements.client.focus(); return; }
    if (!date) { dire("Indiquez la date du devis.", "erreur"); form.elements.date.focus(); return; }
    if (validite && validite < date) { dire("La date de validité ne peut pas être avant la date du devis.", "erreur"); return; }

    const brutes = lignesNumeriques().filter((l) => l.description || !Number.isNaN(l.prix));
    if (!brutes.length) { dire("Ajoutez au moins un article.", "erreur"); return; }
    for (const l of brutes) {
      if (l.description.length < 1) { dire("Chaque article doit avoir un nom.", "erreur"); return; }
      if (Number.isNaN(l.quantite) || l.quantite <= 0) { dire("Vérifiez la quantité de « " + l.description + " ».", "erreur"); return; }
      if (Number.isNaN(l.prix) || l.prix < 0) { dire("Vérifiez le prix de « " + l.description + " ».", "erreur"); return; }
      if (l.quantite * l.prix > 1e12) { dire("Le montant de « " + l.description + " » est trop grand.", "erreur"); return; }
    }

    const remiseTexte = form.elements.remise.value.trim();
    const tvaTexte = form.elements.tva.value.trim();
    if (remiseTexte && Number.isNaN(lireNombre(remiseTexte))) { dire("La remise n'est pas valide.", "erreur"); return; }
    if (tvaTexte && Number.isNaN(lireNombre(tvaTexte))) { dire("La TVA n'est pas valide.", "erreur"); return; }
    const tvaValeur = nombreOuZero(tvaTexte);
    if (tvaValeur < 0 || tvaValeur > 100) { dire("La TVA doit être entre 0 et 100 %.", "erreur"); return; }

    const lignesOk = brutes.map((l) => ({ description: l.description, quantite: l.quantite, prix: l.prix }));
    const c = calculer(lignesOk, nombreOuZero(remiseTexte), tvaValeur, 0);

    if (c.total <= 0) { dire("Le total du devis doit être supérieur à zéro.", "erreur"); return; }
    if (!navigator.onLine) { dire("Vous êtes hors ligne. Reconnectez-vous à internet pour enregistrer.", "erreur"); return; }

    occupe = true;
    bouton.disabled = true;
    bouton.textContent = "Enregistrement…";
    message.className = "message";
    message.textContent = "";

    try {
      const commun = {
        date, validite, client: { nom: nomClient, telephone }, lignes: lignesOk,
        remise: c.remise, tva: c.tva, notes,
        sousTotal: c.sousTotal, montantTva: c.montantTva, total: c.total
      };

      if (d) {
        await modifierDevis(ctx, d, commun);
        if (mem.liste) trierDevis();
        mem.selection = d;
        mem.flash = "Devis modifié.";
      } else {
        const cree = await creerDevis(ctx, {
          ...commun,
          statut: "attente",
          devise: monnaie,
          emetteur: instantaneEmetteur(ctx.etat.entreprise)
        });
        if (mem.liste) { mem.liste.push(cree); trierDevis(); }
        mem.selection = cree;
        mem.flash = "Devis " + cree.numero + " créé.";
      }
      mem.edition = null;
      location.hash = "devis-fiche";
    } catch (err) {
      console.error(err);
      dire("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.", "erreur");
      occupe = false;
      bouton.disabled = false;
      bouton.textContent = "Enregistrer le devis";
    }
  });

  dessinerLignes();
  majTotaux();
}

/* ----------------------------------------------------------
   Écran « Devis en PDF »
   ---------------------------------------------------------- */
function rendreApercu(ctx) {
  verifier(ctx);
  const d = mem.selection;
  if (!d) {
    return `
      <button type="button" class="lien retour" data-aller="devis">← Devis</button>
      <p class="aide">Ce devis n'est plus affiché. Revenez à la liste et appuyez sur le devis.</p>`;
  }

  const esc = ctx.echapper;
  const monnaie = d.devise || devise(ctx);
  const m = (n) => esc(formaterMontant(n, monnaie));
  const emetteur = d.emetteur && typeof d.emetteur === "object" ? d.emetteur : instantaneEmetteur(ctx.etat.entreprise);
  const logo = ctx.srcLogo(emetteur.logo || (ctx.etat.entreprise && ctx.etat.entreprise.logo));
  const client = d.client || {};
  const lignes = Array.isArray(d.lignes) ? d.lignes : [];
  const mentions = emetteur.mentions || emetteur.mentionsLegales || emetteur.mention || "";

  const coordonnees = [
    emetteur.adresse,
    emetteur.telephone ? "Tél : " + emetteur.telephone : "",
    emetteur.whatsapp ? "WhatsApp : " + emetteur.whatsapp : "",
    emetteur.emailPro,
    emetteur.numeroLegal
  ].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join("");

  return `
    <button type="button" class="lien retour" data-aller="devis-fiche">← Retour au devis</button>
    <h1>Devis en PDF</h1>
    <p class="sous-titre">Vérifiez le devis, puis enregistrez-le en PDF.</p>
    <button type="button" class="btn btn-large" id="btn-imprimer-devis">Enregistrer en PDF / Imprimer</button>
    <p class="aide pdf-note-ecran">Dans la fenêtre qui s'ouvre, choisissez « Enregistrer au format PDF », puis envoyez le fichier à votre client.</p>

    <div class="feuille-facture">
      <div class="pdf-entete">
        <div class="pdf-emetteur">
          ${logo ? `<img class="pdf-logo" src="${logo}" alt="">` : ""}
          <div class="pdf-nom">${esc(emetteur.nom || "")}</div>
          ${emetteur.activite ? `<div class="pdf-activite">${esc(emetteur.activite)}</div>` : ""}
          ${coordonnees}
        </div>
        <div class="pdf-titre">
          <h2>DEVIS</h2>
          <div class="pdf-numero">${esc(d.numero)}</div>
          <div>Date : ${esc(dateFr(d.date))}</div>
          ${d.validite ? `<div>Valable jusqu'au : ${esc(dateFr(d.validite))}</div>` : ""}
        </div>
      </div>

      <div class="pdf-client">
        <div class="pdf-etiquette">Destinataire</div>
        <strong>${esc(client.nom || "")}</strong>
        ${client.telephone ? `<div>${esc(client.telephone)}</div>` : ""}
      </div>

      <table class="pdf-table">
        <thead>
          <tr><th>Désignation</th><th class="num">Qté</th><th class="num">Prix</th><th class="num">Montant</th></tr>
        </thead>
        <tbody>
          ${lignes.map((l) => `
          <tr>
            <td>${esc(l.description)}</td>
            <td class="num">${esc(String(l.quantite))}</td>
            <td class="num">${m(l.prix)}</td>
            <td class="num">${m(Math.round(Number(l.quantite) * Number(l.prix) * 100) / 100)}</td>
          </tr>`).join("")}
        </tbody>
      </table>

      <div class="pdf-totaux">
        <div><span>Sous-total</span><span>${m(d.sousTotal)}</span></div>
        ${Number(d.remise) > 0 ? `<div><span>Remise</span><span>− ${m(d.remise)}</span></div>` : ""}
        ${Number(d.tva) > 0 ? `<div><span>TVA (${esc(String(d.tva))} %)</span><span>${m(d.montantTva)}</span></div>` : ""}
        <div class="fort"><span>Total</span><span>${m(d.total)}</span></div>
      </div>

      <div class="pdf-bas">
        ${emetteur.paiement ? `<h3>Modalités de paiement</h3><p>${esc(emetteur.paiement)}</p>` : ""}
        ${d.notes ? `<h3>Notes</h3><p>${esc(d.notes)}</p>` : ""}
        ${mentions ? `<h3>Mentions</h3><p>${esc(mentions)}</p>` : ""}
      </div>

      <div class="pdf-signature">
        <div>Bon pour accord : date et signature du client</div>
        <div>Signature de l'entreprise</div>
      </div>
    </div>`;
}

/* ----------------------------------------------------------
   Les écrans de ce module
   ---------------------------------------------------------- */
export const ecrans = {
  devis: {
    onglet: "factures",
    rendu: (ctx) => rendreListe(ctx),
    brancher: (ctx) => brancherListe(ctx)
  },
  "devis-fiche": {
    onglet: "factures",
    rendu: (ctx) => rendreFiche(ctx),
    brancher: (ctx) => brancherFiche(ctx)
  },
  "devis-form": {
    onglet: "factures",
    rendu: (ctx) => rendreFormulaire(ctx),
    brancher: (ctx) => brancherFormulaire(ctx)
  },
  "devis-pdf": {
    onglet: "factures",
    rendu: (ctx) => rendreApercu(ctx),
    brancher() {
      const bouton = document.getElementById("btn-imprimer-devis");
      if (bouton) bouton.addEventListener("click", () => window.print());
    }
  }
};
