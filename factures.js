/* ==========================================================
   SHOOT FACTURE - Module « Factures »
   La liste des factures et la fiche d'une facture
   (paiement, WhatsApp, modification, suppression).
   Rangées dans l'espace privé de l'entreprise :
   entreprises/{son identifiant}/factures
   ========================================================== */

import { formaterMontant, lireNombre, simple } from "./outils.js";
import {
  MODES_PAIEMENT, memoire, verifierProprietaire, devise, arrondir, statutDe,
  etiquette, dateAujourdhui, dateFr, lienWhatsApp,
  chargerFactures, modifierFacture, supprimerFacture
} from "./facturation.js";

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
a.btn { display: flex; align-items: center; justify-content: center; text-decoration: none; }
.champ select {
  width: 100%;
  min-height: 48px;
  padding: 0 12px;
  border: 2px solid #CFCBC4;
  border-radius: 12px;
  background: var(--blanc);
  color: var(--noir);
  font: inherit;
}
.resume-factures {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 12px 0 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--noir);
  color: var(--blanc);
  font-size: 14px;
}
.resume-factures strong { color: var(--orange); font-size: 17px; white-space: nowrap; }
.resume-factures:empty { display: none; }

.carte-facture {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 76px;
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
.carte-facture:active { background: var(--fond); }
.facture-textes { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 2px; }
.facture-numero { font-weight: 800; font-size: 16px; }
.facture-client { font-size: 14px; overflow-wrap: anywhere; }
.facture-date { color: var(--gris); font-size: 12px; }
.facture-droite { flex: none; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.facture-total { font-weight: 800; font-size: 15px; white-space: nowrap; }

.badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.badge-ok { background: #E3F4E8; color: #17673A; }
.badge-retard { background: #FDE3E1; color: #A12A22; }
.badge-avance { background: #FFF1E6; color: #9A4A00; }
.badge-impayee { background: #ECEAE6; color: #4A4743; }

.titre-facture { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.titre-facture h1 { margin: 0; }
.ligne-article { padding: 10px 0; border-bottom: 1px solid var(--trait); }
.ligne-article:last-child { border-bottom: 0; }
.article-nom { font-weight: 700; overflow-wrap: anywhere; }
.article-detail { display: flex; justify-content: space-between; gap: 10px; color: var(--gris); font-size: 14px; }
.ligne.total-fort { font-weight: 800; font-size: 17px; }
.ligne.reste { font-weight: 800; color: var(--orange); }
.notes-facture { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; }
`;

/* ----------------------------------------------------------
   Mémoire du module
   ---------------------------------------------------------- */
let filtre = "toutes";   // toutes | encaisser | retard | payees

const ICONE_FACTURE = '<svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6"/></svg>';

/* ----------------------------------------------------------
   Écran « Factures » (la liste)
   ---------------------------------------------------------- */
function accepte(f) {
  const code = etiquette(f).code;
  if (filtre === "encaisser") return code !== "payee";
  if (filtre === "retard") return code === "retard";
  if (filtre === "payees") return code === "payee";
  return true;
}

function dessinerListe(ctx) {
  const zone = document.getElementById("liste-factures");
  if (!zone || !memoire.liste) return;
  const liste = memoire.liste;
  const monnaie = devise(ctx);
  const recherche = simple((document.getElementById("recherche-facture") || {}).value || "").trim();

  const resume = document.getElementById("resume-factures");
  if (resume) {
    const reste = liste.reduce((s, f) => s + (etiquette(f).code === "payee" ? 0 : arrondir(f.solde)), 0);
    resume.innerHTML = liste.length
      ? `<span>Reste à encaisser</span><strong>${ctx.echapper(formaterMontant(arrondir(reste), monnaie))}</strong>`
      : "";
  }

  if (!liste.length) {
    zone.innerHTML = `
      <div class="vide">
        ${ICONE_FACTURE}
        <p>Aucune facture pour l'instant. Appuyez sur « + Nouvelle facture » pour créer la première.</p>
      </div>`;
    return;
  }

  const trouvees = liste.filter((f) =>
    accepte(f) && (!recherche || simple([f.numero, f.client && f.client.nom, f.client && f.client.telephone].join(" ")).includes(recherche)));

  if (!trouvees.length) {
    zone.innerHTML = `<p class="aide">Aucune facture ne correspond.</p>`;
    return;
  }

  zone.innerHTML = `
    <p class="compteur">${trouvees.length} facture${trouvees.length > 1 ? "s" : ""}</p>
    ${trouvees.map((f) => {
      const e = etiquette(f);
      const nomClient = (f.client && f.client.nom) || "Client sans nom";
      return `
      <button type="button" class="carte-facture" data-id="${ctx.echapper(f.id)}">
        <span class="facture-textes">
          <span class="facture-numero">${ctx.echapper(f.numero)}</span>
          <span class="facture-client">${ctx.echapper(nomClient)}</span>
          <span class="facture-date">${ctx.echapper(dateFr(f.date))}</span>
        </span>
        <span class="facture-droite">
          <span class="facture-total">${ctx.echapper(formaterMontant(f.total, f.devise || monnaie))}</span>
          <span class="badge ${e.classe}">${ctx.echapper(e.libelle)}</span>
        </span>
      </button>`;
    }).join("")}`;

  zone.querySelectorAll(".carte-facture").forEach((b) =>
    b.addEventListener("click", () => {
      memoire.selection = memoire.liste.find((f) => f.id === b.dataset.id) || null;
      location.hash = "facture";
    }));
}

async function remplirListe(ctx) {
  verifierProprietaire(ctx);
  if (memoire.liste === null) {
    try {
      await chargerFactures(ctx);
    } catch (err) {
      console.error("Factures :", err);
      const zone = document.getElementById("liste-factures");
      if (zone) {
        zone.innerHTML = `
          <div class="chargement">
            <p>Impossible de charger vos factures. Vérifiez votre connexion internet.</p>
            <button type="button" class="btn" id="btn-reessayer-factures">Réessayer</button>
          </div>`;
        const r = document.getElementById("btn-reessayer-factures");
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
   Écran « Fiche d'une facture »
   ---------------------------------------------------------- */
function rendreFiche(ctx) {
  verifierProprietaire(ctx);
  const f = memoire.selection;
  if (!f) {
    return `
      <button type="button" class="lien retour" data-aller="factures">← Factures</button>
      <p class="aide">Cette facture n'est plus affichée. Revenez à la liste et appuyez sur la facture.</p>`;
  }

  const monnaie = f.devise || devise(ctx);
  const m = (n) => ctx.echapper(formaterMontant(n, monnaie));
  const e = etiquette(f);
  const client = f.client || {};
  const lignes = Array.isArray(f.lignes) ? f.lignes : [];
  const paiements = Array.isArray(f.paiements) ? f.paiements : [];
  const nomEntreprise = (ctx.etat.entreprise && ctx.etat.entreprise.nom) || "";

  const blocLignes = lignes.map((l) => `
    <div class="ligne-article">
      <div class="article-nom">${ctx.echapper(l.description)}</div>
      <div class="article-detail">
        <span>${ctx.echapper(String(l.quantite))} × ${m(l.prix)}</span>
        <span>${m(arrondir(Number(l.quantite) * Number(l.prix)))}</span>
      </div>
    </div>`).join("");

  const blocPaiements = paiements.length ? `
    <div class="bloc">
      <h2>Paiements reçus</h2>
      ${paiements.map((p) => `
        <div class="ligne"><span>${ctx.echapper(dateFr(p.date))} · ${ctx.echapper(p.mode || "")}</span><span class="valeur">${m(p.montant)}</span></div>`).join("")}
    </div>` : "";

  const blocPaiementForm = arrondir(f.solde) > 0 ? `
    <div class="bloc">
      <h2>Enregistrer un paiement</h2>
      <form id="form-paiement" novalidate>
        <div class="champ">
          <label for="pay-montant">Montant reçu (${ctx.echapper(monnaie)})</label>
          <input id="pay-montant" name="montant" type="text" inputmode="decimal" maxlength="18"
                 placeholder="Ex. ${ctx.echapper(String(arrondir(f.solde)))}" autocomplete="off">
        </div>
        <div class="champ">
          <label for="pay-mode">Mode de paiement</label>
          <select id="pay-mode" name="mode">
            ${MODES_PAIEMENT.map((x) => `<option value="${ctx.echapper(x)}">${ctx.echapper(x)}</option>`).join("")}
          </select>
        </div>
        <button type="submit" class="btn btn-large" id="btn-paiement">Enregistrer le paiement</button>
        <p id="message-paiement" class="message" role="alert"></p>
      </form>
    </div>` : "";

  const blocWhatsApp = client.telephone
    ? `<a class="btn btn-large" href="${ctx.echapper(lienWhatsApp(f, nomEntreprise))}" target="_blank" rel="noopener">Envoyer par WhatsApp</a>`
    : `<p class="aide">Ajoutez un numéro de téléphone au client (bouton Modifier) pour l'envoyer par WhatsApp.</p>`;

  return `
    <button type="button" class="lien retour" data-aller="factures">← Factures</button>
    <div class="titre-facture">
      <h1>${ctx.echapper(f.numero)}</h1>
      <span class="badge ${e.classe}">${ctx.echapper(e.libelle)}</span>
    </div>
    ${memoire.flash ? `<p class="message succes">${ctx.echapper(memoire.flash)}</p>` : ""}

    <div class="bloc">
      <h2>Client</h2>
      <div class="ligne"><span>Nom</span><span class="valeur">${ctx.echapper(client.nom || "—")}</span></div>
      ${client.telephone ? `<div class="ligne"><span>Téléphone</span><span class="valeur">${ctx.echapper(client.telephone)}</span></div>` : ""}
      <div class="ligne"><span>Date</span><span class="valeur">${ctx.echapper(dateFr(f.date))}</span></div>
      ${f.echeance ? `<div class="ligne"><span>Échéance</span><span class="valeur">${ctx.echapper(dateFr(f.echeance))}</span></div>` : ""}
    </div>

    <div class="bloc">
      <h2>Détail</h2>
      ${blocLignes || '<p class="aide">Aucune ligne.</p>'}
      <div class="ligne espace-haut"><span>Sous-total</span><span class="valeur">${m(f.sousTotal)}</span></div>
      ${Number(f.remise) > 0 ? `<div class="ligne"><span>Remise</span><span class="valeur">− ${m(f.remise)}</span></div>` : ""}
      ${Number(f.tva) > 0 ? `<div class="ligne"><span>TVA (${ctx.echapper(String(f.tva))} %)</span><span class="valeur">${m(f.montantTva)}</span></div>` : ""}
      <div class="ligne total-fort"><span>Total</span><span class="valeur">${m(f.total)}</span></div>
      <div class="ligne"><span>Déjà payé</span><span class="valeur">${m(f.paye)}</span></div>
      <div class="ligne reste"><span>Reste à payer</span><span class="valeur">${m(f.solde)}</span></div>
    </div>

    ${f.notes ? `<div class="bloc"><h2>Notes</h2><p class="notes-facture">${ctx.echapper(f.notes)}</p></div>` : ""}

    ${blocPaiements}
    ${blocPaiementForm}

    <div class="actions-client">
      ${blocWhatsApp}
      <button type="button" class="btn btn-secondaire btn-large" id="btn-pdf-facture">Facture en PDF / Imprimer</button>
      <button type="button" class="btn btn-secondaire btn-large" id="btn-modifier-facture">Modifier la facture</button>
      <button type="button" class="btn btn-danger btn-large" id="btn-supprimer-facture">Supprimer la facture</button>
    </div>
    <p id="message-facture" class="message" role="alert"></p>`;
}

function brancherFiche(ctx) {
  verifierProprietaire(ctx);
  memoire.flash = "";
  const f = memoire.selection;
  if (!f) return;
  let occupe = false;

  /* --- Enregistrer un paiement --- */
  const form = document.getElementById("form-paiement");
  if (form) {
    const message = document.getElementById("message-paiement");
    const bouton = document.getElementById("btn-paiement");
    const dire = (texte, type) => { message.textContent = texte; message.className = "message " + type; };

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (occupe) return;
      const texte = form.elements.montant.value.trim();
      const montant = lireNombre(texte);
      const mode = form.elements.mode.value;

      if (!texte || Number.isNaN(montant) || montant <= 0) return dire("Indiquez un montant valide, par exemple 5000.", "erreur");
      if (montant > arrondir(f.solde)) return dire("Ce montant dépasse le reste à payer.", "erreur");
      if (!navigator.onLine) return dire("Vous êtes hors ligne. Reconnectez-vous à internet pour enregistrer.", "erreur");

      occupe = true;
      bouton.disabled = true;
      bouton.textContent = "Enregistrement…";
      message.className = "message";
      message.textContent = "";
      try {
        const paye = arrondir(arrondir(f.paye) + montant);
        const solde = arrondir(arrondir(f.total) - paye);
        const paiements = [...(Array.isArray(f.paiements) ? f.paiements : []), { date: dateAujourdhui(), montant, mode }];
        await modifierFacture(ctx, f, { paye, solde, statut: statutDe(f.total, paye), paiements });
        memoire.flash = "Paiement enregistré.";
        ctx.afficher();
      } catch (err) {
        console.error(err);
        dire("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.", "erreur");
        occupe = false;
        bouton.disabled = false;
        bouton.textContent = "Enregistrer le paiement";
      }
    });
  }

  /* --- PDF / impression --- */
  document.getElementById("btn-pdf-facture").addEventListener("click", () => {
    location.hash = "facture-pdf";
  });

  /* --- Modifier --- */
  document.getElementById("btn-modifier-facture").addEventListener("click", () => {
    memoire.edition = f;
    location.hash = "facture-form";
  });

  /* --- Supprimer --- */
  const supprimer = document.getElementById("btn-supprimer-facture");
  const messageFacture = document.getElementById("message-facture");
  supprimer.addEventListener("click", async () => {
    if (occupe) return;
    if (!window.confirm("Supprimer cette facture ? Cette action est définitive.")) return;
    if (!navigator.onLine) {
      messageFacture.textContent = "Vous êtes hors ligne. Reconnectez-vous à internet pour supprimer.";
      messageFacture.className = "message erreur";
      return;
    }
    occupe = true;
    supprimer.disabled = true;
    try {
      await supprimerFacture(ctx, f);
      memoire.selection = null;
      memoire.flash = "Facture supprimée.";
      location.hash = "factures";
    } catch (err) {
      console.error(err);
      messageFacture.textContent = "La suppression a échoué. Vérifiez votre connexion et réessayez.";
      messageFacture.className = "message erreur";
      occupe = false;
      supprimer.disabled = false;
    }
  });
}

/* ----------------------------------------------------------
   Les écrans de ce module
   ---------------------------------------------------------- */
export const ecrans = {
  factures: {
    rendu(ctx) {
      verifierProprietaire(ctx);
      const puce = (valeur, texte) =>
        `<button type="button" class="puce${filtre === valeur ? " actif" : ""}" data-filtre="${valeur}">${texte}</button>`;
      return `
        <h1>Factures</h1>
        <p class="sous-titre">Vos factures et ce qu'il reste à encaisser.</p>
        ${memoire.flash ? `<p class="message succes">${ctx.echapper(memoire.flash)}</p>` : ""}
        <button type="button" class="btn btn-large" id="btn-nouvelle-facture">+ Nouvelle facture</button>
        <div class="resume-factures" id="resume-factures"></div>
        <div class="champ recherche">
          <label for="recherche-facture" class="cache">Rechercher</label>
          <input id="recherche-facture" type="search" placeholder="Numéro ou client…" autocomplete="off" maxlength="60">
        </div>
        <div class="puces">${puce("toutes", "Toutes")}${puce("encaisser", "À encaisser")}${puce("retard", "En retard")}${puce("payees", "Payées")}</div>
        <div id="liste-factures" aria-live="polite"><div class="chargement">Chargement…</div></div>`;
    },
    brancher(ctx) {
      memoire.flash = "";
      document.getElementById("btn-nouvelle-facture").addEventListener("click", () => {
        memoire.edition = null;
        location.hash = "facture-form";
      });
      document.getElementById("recherche-facture").addEventListener("input", () => dessinerListe(ctx));
      document.querySelectorAll(".puce").forEach((b) =>
        b.addEventListener("click", () => {
          filtre = b.dataset.filtre;
          document.querySelectorAll(".puce").forEach((x) => x.classList.toggle("actif", x === b));
          dessinerListe(ctx);
        }));
      remplirListe(ctx);
    }
  },

  facture: {
    onglet: "factures",
    rendu: (ctx) => rendreFiche(ctx),
    brancher: (ctx) => brancherFiche(ctx)
  }
};
