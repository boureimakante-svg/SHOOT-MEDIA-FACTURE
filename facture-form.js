/* ==========================================================
   SHOOT FACTURE - Module « Formulaire de facture »
   Créer une nouvelle facture ou modifier une facture existante.
   Utilise les outils de facturation.js (calculs, numéro auto).
   ========================================================== */

import { formaterMontant, lireNombre } from "./outils.js";
import {
  MODES_PAIEMENT, memoire, verifierProprietaire, devise, calculer, statutDe,
  dateAujourdhui, instantaneEmetteur, creerFacture, modifierFacture, trier
} from "./facturation.js";

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
.article-form {
  margin-bottom: 10px;
  padding: 12px;
  background: var(--blanc);
  border: 1px solid var(--trait);
  border-radius: 14px;
}
.article-form .champ { margin-bottom: 8px; }
.article-rangee { display: flex; gap: 8px; }
.article-rangee .champ { flex: 1; min-width: 0; }
.article-pied {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-weight: 700;
}
.btn-ligne {
  min-height: 44px;
  padding: 0 14px;
  border: 2px solid #CFCBC4;
  border-radius: 12px;
  background: var(--blanc);
  color: var(--noir);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.btn-ligne:active { background: var(--fond); }
.ajout-article { display: flex; gap: 8px; margin: 8px 0 4px; }
.ajout-article select {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 0 10px;
  border: 2px solid #CFCBC4;
  border-radius: 12px;
  background: var(--blanc);
  color: var(--noir);
  font: inherit;
}
.note-edition { color: var(--gris); font-size: 14px; }
`;

const ICONE_SUPPRIMER = "Retirer";

function ligneVide() {
  return { description: "", quantite: "1", prix: "" };
}

function nombreOuZero(texte) {
  const n = lireNombre(texte);
  return Number.isNaN(n) ? 0 : n;
}

/* ----------------------------------------------------------
   Rendu du formulaire
   ---------------------------------------------------------- */
function rendreFormulaire(ctx) {
  verifierProprietaire(ctx);
  const f = memoire.edition;
  const e = ctx.echapper;
  const monnaie = (f && f.devise) || devise(ctx);
  const client = (f && f.client) || {};
  const date = (f && f.date) || dateAujourdhui();
  const retour = f ? "facture" : "factures";
  const nombre = (n) => (n === undefined || n === null || Number(n) === 0 ? "" : String(n).replace(".", ","));

  return `
    <button type="button" class="lien retour" data-aller="${retour}">← ${f ? "Retour à la facture" : "Factures"}</button>
    <h1>${f ? "Modifier " + e(f.numero) : "Nouvelle facture"}</h1>
    <p class="sous-titre">${f ? "Changez les informations puis enregistrez." : "Le numéro est attribué automatiquement."}</p>

    <form id="form-facture" novalidate>
      <div class="bloc">
        <h2>Client</h2>
        <div class="champ">
          <label for="choix-client">Client enregistré (facultatif)</label>
          <select id="choix-client">
            <option value="">Saisir un autre client</option>
          </select>
        </div>
        <div class="champ">
          <label for="f-client">Nom du client</label>
          <input id="f-client" name="client" type="text" value="${e(client.nom || "")}" maxlength="120"
                 placeholder="Ex. Awa Traoré" autocomplete="off">
        </div>
        <div class="champ">
          <label for="f-tel">Téléphone WhatsApp (facultatif)</label>
          <input id="f-tel" name="telephone" type="tel" inputmode="tel" value="${e(client.telephone || "")}" maxlength="25"
                 placeholder="Ex. 22370123456" autocomplete="off">
        </div>
        <div class="champ">
          <label for="f-date">Date de la facture</label>
          <input id="f-date" name="date" type="date" value="${e(date)}">
        </div>
        <div class="champ">
          <label for="f-echeance">Échéance (facultatif)</label>
          <input id="f-echeance" name="echeance" type="date" value="${e((f && f.echeance) || "")}">
        </div>
      </div>

      <div class="bloc">
        <h2>Articles</h2>
        <div id="lignes-facture"></div>
        <div class="ajout-article">
          <select id="choix-produit" aria-label="Choisir un produit ou une prestation">
            <option value="">Ligne vide</option>
          </select>
          <button type="button" class="btn-ligne" id="btn-ajouter-ligne">+ Ajouter</button>
        </div>
        <p class="aide">Choisissez un produit ou une prestation dans la liste pour remplir la ligne avec son prix.</p>
      </div>

      <div class="bloc">
        <h2>Remise et TVA</h2>
        <div class="champ">
          <label for="f-remise">Remise (montant en ${e(monnaie)}, facultatif)</label>
          <input id="f-remise" name="remise" type="text" inputmode="decimal" value="${e(nombre(f && f.remise))}"
                 maxlength="18" placeholder="Ex. 5000" autocomplete="off">
        </div>
        <div class="champ">
          <label for="f-tva">TVA en % (facultatif)</label>
          <input id="f-tva" name="tva" type="text" inputmode="decimal" value="${e(nombre(f && f.tva))}"
                 maxlength="6" placeholder="Ex. 18" autocomplete="off">
        </div>
      </div>

      ${f ? `
      <div class="bloc">
        <h2>Paiements</h2>
        <p class="note-edition">Déjà payé : ${e(formaterMontant(f.paye, monnaie))}. Pour ajouter un paiement, utilisez la fiche de la facture.</p>
      </div>` : `
      <div class="bloc">
        <h2>Acompte reçu (facultatif)</h2>
        <div class="champ">
          <label for="f-acompte">Montant déjà reçu (${e(monnaie)})</label>
          <input id="f-acompte" name="acompte" type="text" inputmode="decimal" maxlength="18"
                 placeholder="Ex. 10000" autocomplete="off">
        </div>
        <div class="champ">
          <label for="f-mode">Mode de paiement</label>
          <select id="f-mode" name="mode" class="select-simple">
            ${MODES_PAIEMENT.map((x) => `<option value="${e(x)}">${e(x)}</option>`).join("")}
          </select>
        </div>
      </div>`}

      <div class="bloc">
        <h2>Notes (facultatif)</h2>
        <div class="champ">
          <label for="f-notes" class="cache">Notes</label>
          <textarea id="f-notes" name="notes" maxlength="500" placeholder="Ex. Livraison sous 3 jours">${e((f && f.notes) || "")}</textarea>
        </div>
      </div>

      <div class="bloc">
        <h2>Récapitulatif</h2>
        <div class="ligne"><span>Sous-total</span><span class="valeur" id="tot-sous"></span></div>
        <div class="ligne" id="ligne-remise"><span>Remise</span><span class="valeur" id="tot-remise"></span></div>
        <div class="ligne" id="ligne-tva"><span>TVA</span><span class="valeur" id="tot-tva"></span></div>
        <div class="ligne total-fort"><span>Total</span><span class="valeur" id="tot-total"></span></div>
        <div class="ligne"><span>Déjà payé</span><span class="valeur" id="tot-paye"></span></div>
        <div class="ligne reste"><span>Reste à payer</span><span class="valeur" id="tot-reste"></span></div>
      </div>

      <div class="actions-client">
        <button type="submit" class="btn btn-large" id="btn-enregistrer-facture">Enregistrer la facture</button>
        <button type="button" class="btn btn-secondaire btn-large" id="btn-annuler-facture">Annuler</button>
      </div>
      <p id="message-form-facture" class="message" role="alert"></p>
    </form>`;
}

/* ----------------------------------------------------------
   Comportement du formulaire
   ---------------------------------------------------------- */
function brancherFormulaire(ctx) {
  verifierProprietaire(ctx);
  const f = memoire.edition;
  const e = ctx.echapper;
  const monnaie = (f && f.devise) || devise(ctx);
  const form = document.getElementById("form-facture");
  const zoneLignes = document.getElementById("lignes-facture");
  const message = document.getElementById("message-form-facture");
  const bouton = document.getElementById("btn-enregistrer-facture");
  const m = (n) => formaterMontant(n, monnaie);
  let occupe = false;

  const dire = (texte, type) => { message.textContent = texte; message.className = "message " + type; };

  // Les lignes sont gardées sous forme de texte, comme les a tapées la personne
  let lignes = f && Array.isArray(f.lignes) && f.lignes.length
    ? f.lignes.map((l) => ({
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

  const acompteSaisi = () => (form.elements.acompte ? nombreOuZero(form.elements.acompte.value) : 0);

  function calculerTotaux() {
    const valides = lignesNumeriques().filter((l) => !Number.isNaN(l.quantite) && !Number.isNaN(l.prix));
    const paye = f ? f.paye : acompteSaisi();
    return calculer(valides, nombreOuZero(form.elements.remise.value), nombreOuZero(form.elements.tva.value), paye);
  }

  function majTotaux() {
    const c = calculerTotaux();
    document.getElementById("tot-sous").textContent = m(c.sousTotal);
    document.getElementById("tot-remise").textContent = "− " + m(c.remise);
    document.getElementById("tot-tva").textContent = m(c.montantTva) + " (" + c.tva + " %)";
    document.getElementById("tot-total").textContent = m(c.total);
    document.getElementById("tot-paye").textContent = m(c.paye);
    document.getElementById("tot-reste").textContent = m(c.solde);
    document.getElementById("ligne-remise").style.display = c.remise > 0 ? "" : "none";
    document.getElementById("ligne-tva").style.display = c.tva > 0 ? "" : "none";
  }

  function dessinerLignes() {
    zoneLignes.innerHTML = lignes.map((l, i) => `
      <div class="article-form">
        <div class="champ">
          <label for="l-desc-${i}">Article ${i + 1}</label>
          <input id="l-desc-${i}" type="text" data-i="${i}" data-champ="description" value="${e(l.description)}"
                 maxlength="160" placeholder="Ex. Photo de mariage" autocomplete="off">
        </div>
        <div class="article-rangee">
          <div class="champ">
            <label for="l-qte-${i}">Quantité</label>
            <input id="l-qte-${i}" type="text" inputmode="decimal" data-i="${i}" data-champ="quantite"
                   value="${e(l.quantite)}" maxlength="10" autocomplete="off">
          </div>
          <div class="champ">
            <label for="l-prix-${i}">Prix unitaire</label>
            <input id="l-prix-${i}" type="text" inputmode="decimal" data-i="${i}" data-champ="prix"
                   value="${e(l.prix)}" maxlength="18" placeholder="Ex. 15000" autocomplete="off">
          </div>
        </div>
        <div class="article-pied">
          <span id="l-total-${i}"></span>
          ${lignes.length > 1 ? `<button type="button" class="btn-ligne" data-retirer="${i}">${ICONE_SUPPRIMER}</button>` : ""}
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

  function majTotalLigne(i) {
    const zone = document.getElementById("l-total-" + i);
    if (!zone) return;
    const q = lireNombre(lignes[i].quantite);
    const p = lireNombre(lignes[i].prix);
    zone.textContent = Number.isNaN(q) || Number.isNaN(p) ? "" : "Montant : " + m(Math.round(q * p * 100) / 100);
  }

  /* --- Liste des produits pour remplir une ligne --- */
  let produits = [];
  (async () => {
    try {
      const { db, F } = ctx.etat.fb;
      const uid = ctx.etat.utilisateur.uid;
      const resultat = await F.getDocs(F.collection(db, "entreprises", uid, "produits"));
      produits = resultat.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
      const choix = document.getElementById("choix-produit");
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
      const { db, F } = ctx.etat.fb;
      const uid = ctx.etat.utilisateur.uid;
      const resultat = await F.getDocs(F.collection(db, "entreprises", uid, "clients"));
      clients = resultat.docs.map((x) => ({ id: x.id, ...x.data() }))
        .sort((a, b) => String(a.nom || "").localeCompare(String(b.nom || ""), "fr", { sensitivity: "base" }));
      const liste = document.getElementById("choix-client");
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

  document.getElementById("choix-client").addEventListener("change", (ev) => {
    const c = clients.find((x) => x.id === ev.target.value);
    if (!c) return;
    form.elements.client.value = c.nom || "";
    form.elements.telephone.value = c.telephone || "";
  });

  document.getElementById("btn-ajouter-ligne").addEventListener("click", () => {
    const choix = document.getElementById("choix-produit");
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

  ["remise", "tva", "acompte"].forEach((nom) => {
    if (form.elements[nom]) form.elements[nom].addEventListener("input", majTotaux);
  });

  document.getElementById("btn-annuler-facture").addEventListener("click", () => {
    memoire.edition = null;
    location.hash = f ? "facture" : "factures";
  });

  /* --- Enregistrer --- */
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (occupe) return;

    const nomClient = form.elements.client.value.trim();
    const telephone = form.elements.telephone.value.trim();
    const date = form.elements.date.value;
    const echeance = form.elements.echeance.value;
    const notes = form.elements.notes.value.trim();

    if (nomClient.length < 2) { dire("Indiquez le nom du client.", "erreur"); form.elements.client.focus(); return; }
    if (!date) { dire("Indiquez la date de la facture.", "erreur"); form.elements.date.focus(); return; }
    if (echeance && echeance < date) { dire("L'échéance ne peut pas être avant la date de la facture.", "erreur"); return; }

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

    const acompteTexte = form.elements.acompte ? form.elements.acompte.value.trim() : "";
    if (acompteTexte && Number.isNaN(lireNombre(acompteTexte))) { dire("L'acompte n'est pas valide.", "erreur"); return; }

    const lignesOk = brutes.map((l) => ({ description: l.description, quantite: l.quantite, prix: l.prix }));
    const c = calculer(lignesOk, nombreOuZero(remiseTexte), tvaValeur, f ? f.paye : nombreOuZero(acompteTexte));

    if (c.total <= 0) { dire("Le total de la facture doit être supérieur à zéro.", "erreur"); return; }
    if (c.paye > c.total) { dire(f ? "Le total est inférieur à ce qui a déjà été payé." : "L'acompte dépasse le total de la facture.", "erreur"); return; }
    if (!navigator.onLine) { dire("Vous êtes hors ligne. Reconnectez-vous à internet pour enregistrer.", "erreur"); return; }

    occupe = true;
    bouton.disabled = true;
    bouton.textContent = "Enregistrement…";
    message.className = "message";
    message.textContent = "";

    try {
      const commun = {
        date, echeance, client: { nom: nomClient, telephone }, lignes: lignesOk,
        remise: c.remise, tva: c.tva, notes,
        sousTotal: c.sousTotal, montantTva: c.montantTva, total: c.total, paye: c.paye, solde: c.solde,
        statut: statutDe(c.total, c.paye)
      };

      if (f) {
        await modifierFacture(ctx, f, commun);
        if (memoire.liste) trier();
        memoire.selection = f;
        memoire.flash = "Facture modifiée.";
      } else {
        const paiements = c.paye > 0
          ? [{ date: dateAujourdhui(), montant: c.paye, mode: form.elements.mode.value }]
          : [];
        const creee = await creerFacture(ctx, {
          ...commun,
          devise: monnaie,
          paiements,
          emetteur: instantaneEmetteur(ctx.etat.entreprise)
        });
        if (memoire.liste) { memoire.liste.push(creee); trier(); }
        memoire.selection = creee;
        memoire.flash = "Facture " + creee.numero + " créée.";
      }
      memoire.edition = null;
      location.hash = "facture";
    } catch (err) {
      console.error(err);
      dire("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.", "erreur");
      occupe = false;
      bouton.disabled = false;
      bouton.textContent = "Enregistrer la facture";
    }
  });

  dessinerLignes();
  majTotaux();
}

/* ----------------------------------------------------------
   L'écran de ce module
   ---------------------------------------------------------- */
export const ecrans = {
  "facture-form": {
    onglet: "factures",
    rendu: (ctx) => rendreFormulaire(ctx),
    brancher: (ctx) => brancherFormulaire(ctx)
  }
};
