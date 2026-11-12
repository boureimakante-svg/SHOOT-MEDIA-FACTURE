/* ==========================================================
   SHOOT FACTURE - Module « Facture en PDF »
   Aperçu de la facture, prêt à être enregistré en PDF
   ou imprimé grâce au bouton du téléphone.
   ========================================================== */

import { formaterMontant } from "./outils.js";
import { memoire, verifierProprietaire, devise, etiquette, dateFr, instantaneEmetteur } from "./facturation.js";

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
.feuille-facture {
  margin-top: 12px;
  padding: 16px;
  background: #fff;
  color: #111;
  border: 1px solid var(--trait);
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
}
.pdf-entete {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 3px solid #FF6A00;
}
.pdf-emetteur { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.pdf-logo { display: block; max-width: 90px; max-height: 70px; margin-bottom: 6px; object-fit: contain; }
.pdf-nom { font-size: 17px; font-weight: 800; }
.pdf-activite { color: #555; }
.pdf-titre { flex: none; text-align: right; }
.pdf-titre h2 { margin: 0; font-size: 22px; letter-spacing: 1px; }
.pdf-numero { font-weight: 800; }
.pdf-client { margin-bottom: 8px; overflow-wrap: anywhere; }
.pdf-etiquette { color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
.pdf-table { width: 100%; margin: 10px 0; border-collapse: collapse; }
.pdf-table th {
  padding: 6px 8px;
  background: #111;
  color: #fff;
  font-size: 12px;
  text-align: left;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pdf-table td { padding: 6px 8px; border-bottom: 1px solid #ddd; vertical-align: top; overflow-wrap: anywhere; }
.pdf-table .num { text-align: right; white-space: nowrap; }
.pdf-totaux { width: 65%; min-width: 220px; margin-left: auto; }
.pdf-totaux div { display: flex; justify-content: space-between; gap: 10px; padding: 3px 0; }
.pdf-totaux .fort { margin-top: 4px; padding-top: 6px; border-top: 2px solid #111; font-size: 15px; font-weight: 800; }
.pdf-totaux .reste { font-weight: 800; color: #C2410C; }
.pdf-bas { margin-top: 14px; color: #333; font-size: 12px; overflow-wrap: anywhere; }
.pdf-bas h3 { margin: 10px 0 2px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; color: #666; }
.pdf-bas p { margin: 0; white-space: pre-wrap; }
.pdf-note-ecran { margin: 8px 0 0; }

@media print {
  @page { margin: 12mm; }
  body * { visibility: hidden !important; }
  .feuille-facture, .feuille-facture * { visibility: visible !important; }
  .feuille-facture {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
  }
}
`;

/* ----------------------------------------------------------
   Rendu de l'aperçu
   ---------------------------------------------------------- */
function rendreApercu(ctx) {
  verifierProprietaire(ctx);
  const f = memoire.selection;
  if (!f) {
    return `
      <button type="button" class="lien retour" data-aller="factures">← Factures</button>
      <p class="aide">Cette facture n'est plus affichée. Revenez à la liste et appuyez sur la facture.</p>`;
  }

  const e = ctx.echapper;
  const monnaie = f.devise || devise(ctx);
  const m = (n) => e(formaterMontant(n, monnaie));
  const emetteur = f.emetteur && typeof f.emetteur === "object" ? f.emetteur : instantaneEmetteur(ctx.etat.entreprise);
  const logo = ctx.srcLogo(emetteur.logo || (ctx.etat.entreprise && ctx.etat.entreprise.logo));
  const client = f.client || {};
  const lignes = Array.isArray(f.lignes) ? f.lignes : [];
  const paiements = Array.isArray(f.paiements) ? f.paiements : [];
  const mentions = emetteur.mentions || emetteur.mentionsLegales || emetteur.mention || "";

  const coordonnees = [
    emetteur.adresse,
    emetteur.telephone ? "Tél : " + emetteur.telephone : "",
    emetteur.whatsapp ? "WhatsApp : " + emetteur.whatsapp : "",
    emetteur.emailPro,
    emetteur.numeroLegal
  ].filter(Boolean).map((l) => `<div>${e(l)}</div>`).join("");

  return `
    <button type="button" class="lien retour" data-aller="facture">← Retour à la facture</button>
    <h1>Facture en PDF</h1>
    <p class="sous-titre">Vérifiez la facture, puis enregistrez-la en PDF.</p>
    <button type="button" class="btn btn-large" id="btn-imprimer-facture">Enregistrer en PDF / Imprimer</button>
    <p class="aide pdf-note-ecran">Dans la fenêtre qui s'ouvre, choisissez « Enregistrer au format PDF », puis envoyez le fichier à votre client.</p>

    <div class="feuille-facture">
      <div class="pdf-entete">
        <div class="pdf-emetteur">
          ${logo ? `<img class="pdf-logo" src="${logo}" alt="">` : ""}
          <div class="pdf-nom">${e(emetteur.nom || "")}</div>
          ${emetteur.activite ? `<div class="pdf-activite">${e(emetteur.activite)}</div>` : ""}
          ${coordonnees}
        </div>
        <div class="pdf-titre">
          <h2>FACTURE</h2>
          <div class="pdf-numero">${e(f.numero)}</div>
          <div>Date : ${e(dateFr(f.date))}</div>
          ${f.echeance ? `<div>Échéance : ${e(dateFr(f.echeance))}</div>` : ""}
        </div>
      </div>

      <div class="pdf-client">
        <div class="pdf-etiquette">Facturé à</div>
        <strong>${e(client.nom || "")}</strong>
        ${client.telephone ? `<div>${e(client.telephone)}</div>` : ""}
      </div>

      <table class="pdf-table">
        <thead>
          <tr><th>Désignation</th><th class="num">Qté</th><th class="num">Prix</th><th class="num">Montant</th></tr>
        </thead>
        <tbody>
          ${lignes.map((l) => `
          <tr>
            <td>${e(l.description)}</td>
            <td class="num">${e(String(l.quantite))}</td>
            <td class="num">${m(l.prix)}</td>
            <td class="num">${m(Math.round(Number(l.quantite) * Number(l.prix) * 100) / 100)}</td>
          </tr>`).join("")}
        </tbody>
      </table>

      <div class="pdf-totaux">
        <div><span>Sous-total</span><span>${m(f.sousTotal)}</span></div>
        ${Number(f.remise) > 0 ? `<div><span>Remise</span><span>− ${m(f.remise)}</span></div>` : ""}
        ${Number(f.tva) > 0 ? `<div><span>TVA (${e(String(f.tva))} %)</span><span>${m(f.montantTva)}</span></div>` : ""}
        <div class="fort"><span>Total</span><span>${m(f.total)}</span></div>
        <div><span>Déjà payé</span><span>${m(f.paye)}</span></div>
        <div class="reste"><span>Reste à payer</span><span>${m(f.solde)}</span></div>
      </div>

      <div class="pdf-bas">
        <p><strong>Statut : ${e(etiquette(f).libelle)}</strong></p>
        ${paiements.length ? `
          <h3>Paiements reçus</h3>
          ${paiements.map((p) => `<p>${e(dateFr(p.date))} · ${e(p.mode || "")} · ${m(p.montant)}</p>`).join("")}` : ""}
        ${emetteur.paiement ? `<h3>Modalités de paiement</h3><p>${e(emetteur.paiement)}</p>` : ""}
        ${f.notes ? `<h3>Notes</h3><p>${e(f.notes)}</p>` : ""}
        ${mentions ? `<h3>Mentions</h3><p>${e(mentions)}</p>` : ""}
      </div>
    </div>`;
}

/* ----------------------------------------------------------
   L'écran de ce module
   ---------------------------------------------------------- */
export const ecrans = {
  "facture-pdf": {
    onglet: "factures",
    rendu: (ctx) => rendreApercu(ctx),
    brancher() {
      const bouton = document.getElementById("btn-imprimer-facture");
      if (bouton) bouton.addEventListener("click", () => window.print());
    }
  }
};
