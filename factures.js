/* ==========================================================
   SHOOT FACTURE - Module « Factures »
   La liste des factures (historique), une facture en détail,
   les paiements (avances et solde) et l'envoi par WhatsApp.
   Rangées dans l'espace privé de l'entreprise :
   entreprises/{son identifiant}/factures
   ========================================================== */

import { formaterMontant, formaterNombre, lireNombre, simple } from "./outils.js";
import {
  MODES_PAIEMENT, memoire, verifierProprietaire, devise, arrondir, statutDe, etiquette,
  dateAujourdhui, dateFr, lienWhatsApp, chargerFactures, modifierFacture, supprimerFacture
} from "./facturation.js";

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
.resume { background: var(--noir); color: var(--blanc); border-radius: 14px; padding: 16px; margin: 16px 0 4px; }
.resume-label { font-size: 13px; color: #BDBDBD; }
.resume-montant { font-size: 28px; font-weight: 800; color: var(--orange); line-height: 1.2; }
.resume-detail { font-size: 13px; color: #BDBDBD; }

.carte-facture {
  display: block; width: 100%; text-align: left; margin-bottom: 10px; padding: 14px;
  background: var(--blanc); border: 1px solid var(--trait); border-radius: 14px;
  color: var(--noir); font: inherit; cursor: pointer;
}
.carte-facture:active { background: var(--fond); }
.cf-ligne { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.cf-numero { font-weight: 800; }
.cf-client { display: block; margin: 2px 0 6px; overflow-wrap: anywhere; }
.cf-date { color: var(--gris); font-size: 14px; }
.cf-total { font-weight: 800; white-space: nowrap; }
.cf-solde { display: block; margin-top: 4px; font-size: 13px; color: var(--erreur); font-weight: 700; }

.badge { flex: none; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
.badge-ok { background: #E8F5EC; color: var(--ok); }
.badge-avance { background: #FFF1E6; color: var(--orange-fonce); }
.badge-impayee { background: #EDEDED; color: #333; }
.badge-retard { background: #FDECEC; color: var(--erreur); }

.papier { background: var(--blanc); border: 1px solid var(--trait); border-top: 5px solid var(--orange); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
.p-entete { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 14px; }
.p-logo { flex: none; width: 64px; height: 64px; object-fit: contain; }
.p-nom { font-weight: 800; font-size: 18px; line-height: 1.2; overflow-wrap: anywhere; }
.p-texte { font-size: 13px; color: #3d3d3d; overflow-wrap: anywhere; }
.p-titre { display: flex; justify-content: space-between; align-items: center; gap: 10px; border-top: 1px solid var(--trait); border-bottom: 1px solid var(--trait); padding: 10px 0; margin-bottom: 12px; }
.p-titre span { font-weight: 800; letter-spacing: 0.08em; color: var(--gris); }
.p-titre strong { font-size: 18px; }
.p-label { display: block; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gris); margin-bottom: 2px; }
.p-bloc { margin-bottom: 14px; }
.p-lignes { margin: 8px 0 12px; }
.p-ligne { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--trait); }
.p-desc { overflow-wrap: anywhere; }
.p-desc small { display: block; color: var(--gris); font-size: 13px; }
.p-mont { font-weight: 700; white-space: nowrap; }
.p-total-ligne { display: flex; justify-content: space-between; padding: 4px 0; }
.p-total-ligne.gras { font-weight: 800; font-size: 18px; border-top: 2px solid var(--noir); margin-top: 6px; padding-top: 8px; }
.p-paiement { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 0; font-size: 14px; }
.p-paiement button { background: none; border: none; color: var(--erreur); font: inherit; font-weight: 700; cursor: pointer; padding: 6px 4px; }
.p-solde { margin-top: 14px; padding: 14px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; font-weight: 800; font-size: 18px; }
.p-solde.du { background: var(--noir); color: var(--orange); }
.p-solde.paye { background: #E8F5EC; color: var(--ok); }
.p-pied { margin-top: 14px; font-size: 13px; color: #3d3d3d; overflow-wrap: anywhere; }

.actions-facture { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.btn-lien { text-decoration: none; }
.panneau { background: var(--blanc); border: 1px solid var(--trait); border-radius: 14px; padding: 16px; margin-bottom: 16px; }
.panneau h2 { margin-bottom: 12px; }
`;

/* ----------------------------------------------------------
   Petits outils
   ---------------------------------------------------------- */
const texteHtml = (ctx, t) => ctx.echapper(t).replace(/\n/g, "<br>");

/* ----------------------------------------------------------
   Écran « Factures » (la liste = l'historique)
   ---------------------------------------------------------- */
let filtre = "tous";   // tous | apayer | payees

function dessinerListe(ctx) {
  const zone = document.getElementById("liste-factures");
  const liste = memoire.liste;
  if (!zone || !liste) return;

  const recherche = simple((document.getElementById("recherche-facture") || {}).value || "").trim();
  const aujourdhui = dateAujourdhui();

  // Résumé : ce qu'il reste à encaisser
  const enAttente = liste.filter((f) => arrondir(f.solde) > 0);
  const reste = arrondir(enAttente.reduce((s, f) => s + arrondir(f.solde), 0));
  const enRetard = enAttente.filter((f) => f.echeance && f.echeance < aujourdhui).length;
  const resume = document.getElementById("resume-factures");
  if (resume) {
    resume.innerHTML = `
      <div class="resume-label">Reste à encaisser</div>
      <div class="resume-montant">${ctx.echapper(formaterMontant(reste, devise(ctx)))}</div>
      <div class="resume-detail">${enAttente.length} facture${enAttente.length > 1 ? "s" : ""} en attente${enRetard ? ` · ${enRetard} en retard` : ""} · ${liste.length} au total</div>`;
  }

  if (!liste.length) {
    zone.innerHTML = `
      <div class="vide">
        <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6"/></svg>
        <p>Aucune facture pour l'instant. Appuyez sur « + Nouvelle facture » pour créer la première.</p>
      </div>`;
    return;
  }

  const trouvees = liste.filter((f) =>
    (filtre === "tous" || (filtre === "apayer" && arrondir(f.solde) > 0) || (filtre === "payees" && arrondir(f.solde) <= 0))
    && (!recherche || simple([f.numero, f.client && f.client.nom, dateFr(f.date)].join(" ")).includes(recherche)));

  if (!trouvees.length) {
    zone.innerHTML = `<p class="aide">Aucune facture ne correspond.</p>`;
    return;
  }

  zone.innerHTML = trouvees.map((f) => {
    const e = etiquette(f, aujourdhui);
    return `
      <button type="button" class="carte-facture" data-id="${ctx.echapper(f.id)}">
        <span class="cf-ligne"><span class="cf-numero">${ctx.echapper(f.numero)}</span><span class="badge ${e.classe}">${e.libelle}</span></span>
        <span class="cf-client">${ctx.echapper((f.client && f.client.nom) || "Client sans nom")}</span>
        <span class="cf-ligne"><span class="cf-date">${ctx.echapper(dateFr(f.date))}</span><span class="cf-total">${ctx.echapper(formaterMontant(f.total, f.devise))}</span></span>
        ${arrondir(f.solde) > 0 ? `<span class="cf-solde">Reste à payer : ${ctx.echapper(formaterMontant(f.solde, f.devise))}</span>` : ""}
      </button>`;
  }).join("");

  zone.querySelectorAll(".carte-facture").forEach((b) =>
    b.addEventListener("click", () => {
      memoire.selection = liste.find((f) => f.id === b.dataset.id) || null;
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
   Écran « Facture » (une facture en détail)
   ---------------------------------------------------------- */
function rendreFacture(ctx) {
  const f = memoire.selection;
  if (!f) {
    return `
      <button type="button" class="lien retour" data-aller="factures">← Factures</button>
      <h1>Facture</h1>
      <p class="sous-titre">Aucune facture sélectionnée.</p>`;
  }

  const e = f.emetteur || ctx.etat.entreprise || {};
  const logo = ctx.srcLogo(ctx.etat.entreprise && ctx.etat.entreprise.logo);
  const monnaie = f.devise || "FCFA";
  const m = (n) => ctx.echapper(formaterMontant(n, monnaie));
  const client = f.client || {};
  const etiq = etiquette(f);

  const coordonnees = [
    e.activite, e.adresse,
    e.telephone ? "Tél : " + e.telephone : "",
    e.whatsapp ? "WhatsApp : " + e.whatsapp : "",
    e.emailPro, e.numeroLegal ? "N° " + e.numeroLegal : ""
  ].filter(Boolean).map((l) => `<div class="p-texte">${texteHtml(ctx, l)}</div>`).join("");

  const lignes = (f.lignes || []).map((l) => `
    <div class="p-ligne">
      <div class="p-desc">${ctx.echapper(l.description)}
        <small>${ctx.echapper(formaterNombre(l.quantite))} × ${m(l.prix)}${l.unite ? " / " + ctx.echapper(l.unite) : ""}</small>
      </div>
      <div class="p-mont">${m(arrondir(l.quantite * l.prix))}</div>
    </div>`).join("");

  const paiements = (f.paiements || []).map((p, i) => `
    <div class="p-paiement">
      <span>${ctx.echapper(dateFr(p.date))} · ${ctx.echapper(p.mode || "Paiement")}${p.note ? " (" + ctx.echapper(p.note) + ")" : ""}</span>
      <span><strong>${m(p.montant)}</strong> <button type="button" data-suppr-paiement="${i}" aria-label="Supprimer ce paiement">✕</button></span>
    </div>`).join("");

  const pied = [e.paiement ? "Moyens de paiement :\n" + e.paiement : "", f.notes || "", e.mentions || ""]
    .filter(Boolean).map((t) => `<div>${texteHtml(ctx, t)}</div>`).join("<br>");

  const solde = arrondir(f.solde);
  const dateTexte = [`Date : ${dateFr(f.date)}`, f.echeance ? `Échéance : ${dateFr(f.echeance)}` : ""].filter(Boolean).join(" · ");

  return `
    <button type="button" class="lien retour" data-aller="factures">← Factures</button>
    ${memoire.flash ? `<p class="message succes">${ctx.echapper(memoire.flash)}</p>` : ""}
    <div class="papier">
      <div class="p-entete">
        ${logo ? `<img class="p-logo" src="${logo}" alt="">` : ""}
        <div><div class="p-nom">${ctx.echapper(e.nom || "")}</div>${coordonnees}</div>
      </div>
      <div class="p-titre"><span>FACTURE</span><strong>${ctx.echapper(f.numero)}</strong></div>
      <div class="p-bloc"><span class="badge ${etiq.classe}">${etiq.libelle}</span> <span class="p-texte">${ctx.echapper(dateTexte)}</span></div>
      <div class="p-bloc">
        <span class="p-label">Facturé à</span>
        <div><strong>${ctx.echapper(client.nom || "")}</strong></div>
        ${client.telephone ? `<div class="p-texte">${ctx.echapper(client.telephone)}</div>` : ""}
        ${client.adresse ? `<div class="p-texte">${texteHtml(ctx, client.adresse)}</div>` : ""}
      </div>
      <div class="p-lignes">${lignes}</div>
      <div class="p-total-ligne"><span>Sous-total</span><span>${m(f.sousTotal)}</span></div>
      ${arrondir(f.remise) > 0 ? `<div class="p-total-ligne"><span>Remise</span><span>− ${m(f.remise)}</span></div>` : ""}
      ${Number(f.tva) > 0 ? `<div class="p-total-ligne"><span>TVA ${ctx.echapper(formaterNombre(f.tva))} %</span><span>${m(f.montantTva)}</span></div>` : ""}
      <div class="p-total-ligne gras"><span>Total</span><span>${m(f.total)}</span></div>
      ${paiements ? `<div class="p-bloc" style="margin-top:14px"><span class="p-label">Paiements reçus</span>${paiements}</div>` : ""}
      <div class="p-solde ${solde > 0 ? "du" : "paye"}"><span>${solde > 0 ? "Reste à payer" : "Facture payée"}</span><span>${solde > 0 ? m(solde) : "✓"}</span></div>
      ${pied ? `<div class="p-pied">${pied}</div>` : ""}
    </div>

    <div id="panneau-paiement" class="panneau" hidden>
      <h2>Ajouter un paiement</h2>
      <form id="form-paiement" novalidate>
        <div class="champ"><label for="pa-montant">Montant (${ctx.echapper(monnaie)})</label>
          <input id="pa-montant" name="montant" type="text" inputmode="decimal" value="${solde > 0 ? ctx.echapper(String(solde).replace(".", ",")) : ""}" autocomplete="off"></div>
        <div class="champ"><label for="pa-mode">Mode de paiement</label>
          <select id="pa-mode" name="mode">${MODES_PAIEMENT.map((x) => `<option>${ctx.echapper(x)}</option>`).join("")}</select></div>
        <div class="champ"><label for="pa-date">Date</label>
          <input id="pa-date" name="date" type="date" value="${dateAujourdhui()}"></div>
        <button type="submit" class="btn btn-large">Enregistrer le paiement</button>
        <p id="message-paiement" class="message" role="alert"></p>
      </form>
    </div>

    <div class="actions-facture">
      ${solde > 0 ? '<button type="button" class="btn btn-large" id="btn-paiement">Ajouter un paiement</button>' : ""}
      <a class="btn btn-secondaire btn-large btn-lien" href="${ctx.echapper(lienWhatsApp(f, e.nom))}" target="_blank" rel="noopener">Envoyer par WhatsApp</a>
      <button type="button" class="btn btn-secondaire btn-large" id="btn-modifier-facture">Modifier la facture</button>
      <button type="button" class="btn btn-danger btn-large" id="btn-supprimer-facture">Supprimer la facture</button>
    </div>
    <p id="message-facture" class="message" role="alert"></p>`;
}

function brancherFacture(ctx) {
  verifierProprietaire(ctx);
  const f = memoire.selection;
  if (!f) { location.hash = "factures"; return; }
  memoire.flash = "";

  const dire = (texte, type) => {
    const z = document.getElementById("message-facture");
    z.textContent = texte;
    z.className = "message " + type;
  };

  // Ajouter un paiement
  const panneau = document.getElementById("panneau-paiement");
  const btnPaiement = document.getElementById("btn-paiement");
  if (btnPaiement) {
    btnPaiement.addEventListener("click", () => {
      panneau.hidden = !panneau.hidden;
      if (!panneau.hidden) panneau.scrollIntoView({ block: "center" });
    });
  }
  const formPaiement = document.getElementById("form-paiement");
  formPaiement.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const zone = document.getElementById("message-paiement");
    const erreur = (t) => { zone.textContent = t; zone.className = "message erreur"; };
    const montant = lireNombre(formPaiement.elements.montant.value);
    const solde = arrondir(f.solde);
    if (Number.isNaN(montant) || montant <= 0) return erreur("Indiquez un montant valide, par exemple 50000.");
    if (montant > solde) return erreur("Ce montant dépasse le reste à payer.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formPaiement.elements.date.value)) return erreur("Indiquez la date du paiement.");
    if (!navigator.onLine) return erreur("Vous êtes hors ligne. Reconnectez-vous à internet pour enregistrer.");

    const paiements = [...(f.paiements || []), { date: formPaiement.elements.date.value, montant, mode: formPaiement.elements.mode.value }];
    const paye = arrondir(paiements.reduce((s, p) => s + p.montant, 0));
    try {
      await modifierFacture(ctx, f, { paiements, paye, solde: arrondir(f.total - paye), statut: statutDe(f.total, paye) });
      memoire.flash = "Paiement enregistré.";
      ctx.afficher();
    } catch (err) {
      console.error(err);
      erreur("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.");
    }
  });

  // Supprimer un paiement saisi par erreur
  document.querySelectorAll("[data-suppr-paiement]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!window.confirm("Supprimer ce paiement ?")) return;
      if (!navigator.onLine) return dire("Vous êtes hors ligne. Reconnectez-vous à internet.", "erreur");
      const paiements = (f.paiements || []).filter((_, i) => i !== Number(b.dataset.supprPaiement));
      const paye = arrondir(paiements.reduce((s, p) => s + p.montant, 0));
      try {
        await modifierFacture(ctx, f, { paiements, paye, solde: arrondir(f.total - paye), statut: statutDe(f.total, paye) });
        memoire.flash = "Paiement supprimé.";
        ctx.afficher();
      } catch (err) {
        console.error(err);
        dire("La suppression a échoué. Vérifiez votre connexion et réessayez.", "erreur");
      }
    }));

  document.getElementById("btn-modifier-facture").addEventListener("click", () => {
    memoire.edition = f;
    location.hash = "nouvelle-facture";
  });

  document.getElementById("btn-supprimer-facture").addEventListener("click", async () => {
    if (!window.confirm(`Supprimer la facture ${f.numero} ? Son numéro ne sera pas réutilisé. Cette action est définitive.`)) return;
    if (!navigator.onLine) return dire("Vous êtes hors ligne. Reconnectez-vous à internet.", "erreur");
    try {
      await supprimerFacture(ctx, f);
      memoire.selection = null;
      memoire.flash = "Facture supprimée.";
      location.hash = "factures";
    } catch (err) {
      console.error(err);
      dire("La suppression a échoué. Vérifiez votre connexion et réessayez.", "erreur");
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
        <p class="sous-titre">Toutes vos factures au même endroit.</p>
        ${memoire.flash ? `<p class="message succes">${ctx.echapper(memoire.flash)}</p>` : ""}
        <button type="button" class="btn btn-large" id="btn-nouvelle-facture">+ Nouvelle facture</button>
        <div class="resume" id="resume-factures"><div class="resume-label">Reste à encaisser</div><div class="resume-montant">…</div></div>
        <div class="champ recherche">
          <label for="recherche-facture" class="cache">Rechercher une facture</label>
          <input id="recherche-facture" type="search" placeholder="Numéro, client ou date…" autocomplete="off" maxlength="60">
        </div>
        <div class="puces">${puce("tous", "Toutes")}${puce("apayer", "À payer")}${puce("payees", "Payées")}</div>
        <div id="liste-factures" aria-live="polite"><div class="chargement">Chargement…</div></div>`;
    },
    brancher(ctx) {
      memoire.flash = "";
      document.getElementById("btn-nouvelle-facture").addEventListener("click", () => {
        memoire.edition = null;
        location.hash = "nouvelle-facture";
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
    rendu: (ctx) => rendreFacture(ctx),
    brancher: (ctx) => brancherFacture(ctx)
  }
};
