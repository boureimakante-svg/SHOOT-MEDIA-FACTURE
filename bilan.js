/* ==========================================================
   SHOOT FACTURE - Module « Bilan » (tableau de bord)
   Chiffres clés : facturé, encaissé, reste à encaisser,
   retards, devis, clients principaux, modes de paiement.
   Lit les factures et les devis de l'entreprise.
   ========================================================== */

import { formaterMontant } from "./outils.js";
import {
  memoire, verifierProprietaire, devise, arrondir, etiquette,
  dateAujourdhui, chargerFactures
} from "./facturation.js";

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
.kpi-grille { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
.kpi {
  padding: 12px;
  background: var(--blanc);
  border: 1px solid var(--trait);
  border-radius: 14px;
}
.kpi-large { grid-column: 1 / -1; }
.kpi-titre { color: var(--gris); font-size: 12px; }
.kpi-valeur { margin-top: 2px; font-size: 16px; font-weight: 800; overflow-wrap: anywhere; }
.kpi-detail { margin-top: 2px; color: var(--gris); font-size: 12px; }
.kpi.accent { background: var(--noir); border-color: var(--noir); }
.kpi.accent .kpi-titre, .kpi.accent .kpi-detail { color: #CFCBC4; }
.kpi.accent .kpi-valeur { color: var(--orange); }
.kpi.alerte .kpi-valeur { color: #A12A22; }

.graph { display: flex; align-items: flex-end; gap: 8px; height: 150px; margin: 8px 0 4px; }
.graph-col { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%; min-width: 0; }
.graph-barres { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px; }
.barre { display: block; width: 40%; max-width: 22px; min-height: 2px; border-radius: 4px 4px 0 0; }
.barre.b1 { background: var(--noir); }
.barre.b2 { background: var(--orange); }
.graph-mois { margin-top: 4px; color: var(--gris); font-size: 11px; }
.legende { display: flex; gap: 14px; justify-content: center; font-size: 12px; color: var(--gris); }
.legende .pt { display: inline-block; width: 10px; height: 10px; margin-right: 5px; border-radius: 3px; }
.legende .p1 { background: var(--noir); }
.legende .p2 { background: var(--orange); }
`;

/* ----------------------------------------------------------
   Mémoire du module
   ---------------------------------------------------------- */
let periode = "mois";   // mois | annee | tout
let devisListe = [];

const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MOIS_LONGS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/* ----------------------------------------------------------
   Calculs
   ---------------------------------------------------------- */
function dansPeriode(iso, aujourdhui) {
  if (!iso) return false;
  if (periode === "mois") return String(iso).slice(0, 7) === aujourdhui.slice(0, 7);
  if (periode === "annee") return String(iso).slice(0, 4) === aujourdhui.slice(0, 4);
  return true;
}

function libellePeriode(aujourdhui) {
  const an = aujourdhui.slice(0, 4);
  const mois = Number(aujourdhui.slice(5, 7)) - 1;
  if (periode === "mois") return `Ce mois-ci (${MOIS_LONGS[mois] || ""} ${an})`;
  if (periode === "annee") return `Cette année (${an})`;
  return "Depuis le début";
}

// Les 6 derniers mois, du plus ancien au plus récent
function derniersMois(aujourdhui) {
  let annee = Number(aujourdhui.slice(0, 4));
  let mois = Number(aujourdhui.slice(5, 7)) - 1;
  const liste = [];
  for (let i = 0; i < 6; i++) {
    liste.unshift({ cle: `${annee}-${String(mois + 1).padStart(2, "0")}`, nom: MOIS_COURTS[mois], facture: 0, encaisse: 0 });
    mois -= 1;
    if (mois < 0) { mois = 11; annee -= 1; }
  }
  return liste;
}

function calculerBilan() {
  const aujourdhui = dateAujourdhui();
  const factures = memoire.liste || [];
  const mois = derniersMois(aujourdhui);
  const parCle = Object.fromEntries(mois.map((x) => [x.cle, x]));

  let facture = 0;
  let encaisse = 0;
  let nombre = 0;
  const modes = {};
  const clients = {};

  factures.forEach((f) => {
    const total = arrondir(f.total);
    const cle = String(f.date || "").slice(0, 7);
    if (parCle[cle]) parCle[cle].facture += total;

    if (dansPeriode(f.date, aujourdhui)) {
      facture += total;
      nombre += 1;
      const nom = ((f.client && f.client.nom) || "Client sans nom").trim();
      const id = nom.toLowerCase();
      clients[id] = clients[id] || { nom, total: 0 };
      clients[id].total += total;
    }

    (Array.isArray(f.paiements) ? f.paiements : []).forEach((p) => {
      const montant = arrondir(p.montant);
      const clePaiement = String(p.date || "").slice(0, 7);
      if (parCle[clePaiement]) parCle[clePaiement].encaisse += montant;
      if (dansPeriode(p.date, aujourdhui)) {
        encaisse += montant;
        const mode = p.mode || "Autre";
        modes[mode] = (modes[mode] || 0) + montant;
      }
    });
  });

  const impayees = factures.filter((f) => etiquette(f).code !== "payee");
  const retard = factures.filter((f) => etiquette(f).code === "retard");
  const somme = (liste, champ) => arrondir(liste.reduce((s, x) => s + arrondir(x[champ]), 0));

  const devisAttente = devisListe.filter((d) => d.statut === "attente" || !d.statut);
  const devisAcceptes = devisListe.filter((d) => d.statut === "accepte");

  return {
    aujourdhui, mois,
    facture: arrondir(facture), encaisse: arrondir(encaisse), nombre,
    reste: somme(impayees, "solde"), nbImpayees: impayees.length,
    retard: somme(retard, "solde"), nbRetard: retard.length,
    devisAttente: somme(devisAttente, "total"), nbDevisAttente: devisAttente.length,
    devisAcceptes: somme(devisAcceptes, "total"), nbDevisAcceptes: devisAcceptes.length,
    topClients: Object.values(clients).sort((a, b) => b.total - a.total).slice(0, 5),
    modes: Object.entries(modes).sort((a, b) => b[1] - a[1])
  };
}

/* ----------------------------------------------------------
   Affichage
   ---------------------------------------------------------- */
function htmlBilan(ctx) {
  const esc = ctx.echapper;
  const monnaie = devise(ctx);
  const m = (n) => esc(formaterMontant(n, monnaie));
  const b = calculerBilan();
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  if (!(memoire.liste || []).length && !devisListe.length) {
    return `
      <div class="vide">
        <svg viewBox="0 0 24 24"><path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2"/></svg>
        <p>Pas encore de chiffres. Ils apparaîtront dès votre première facture ou votre premier devis.</p>
      </div>`;
  }

  const maxi = Math.max(1, ...b.mois.map((x) => Math.max(x.facture, x.encaisse)));
  const hauteur = (v) => (v > 0 ? Math.max(3, Math.round((v / maxi) * 100)) : 0);

  return `
    <p class="compteur">${esc(libellePeriode(b.aujourdhui))}</p>
    <div class="kpi-grille">
      <div class="kpi accent kpi-large">
        <div class="kpi-titre">Encaissé</div>
        <div class="kpi-valeur">${m(b.encaisse)}</div>
        <div class="kpi-detail">Argent réellement reçu</div>
      </div>
      <div class="kpi">
        <div class="kpi-titre">Facturé</div>
        <div class="kpi-valeur">${m(b.facture)}</div>
        <div class="kpi-detail">${pluriel(b.nombre, "facture")}</div>
      </div>
      <div class="kpi">
        <div class="kpi-titre">Reste à encaisser</div>
        <div class="kpi-valeur">${m(b.reste)}</div>
        <div class="kpi-detail">${pluriel(b.nbImpayees, "facture")} · toutes dates</div>
      </div>
      <div class="kpi${b.nbRetard ? " alerte" : ""}">
        <div class="kpi-titre">En retard</div>
        <div class="kpi-valeur">${m(b.retard)}</div>
        <div class="kpi-detail">${pluriel(b.nbRetard, "facture")}</div>
      </div>
      <div class="kpi">
        <div class="kpi-titre">Devis en attente</div>
        <div class="kpi-valeur">${m(b.devisAttente)}</div>
        <div class="kpi-detail">${pluriel(b.nbDevisAttente, "devis")}</div>
      </div>
      ${b.nbDevisAcceptes ? `
      <div class="kpi kpi-large">
        <div class="kpi-titre">Devis acceptés, pas encore facturés</div>
        <div class="kpi-valeur">${m(b.devisAcceptes)}</div>
        <div class="kpi-detail">${pluriel(b.nbDevisAcceptes, "devis")} à transformer en facture</div>
      </div>` : ""}
    </div>

    <div class="bloc">
      <h2>6 derniers mois</h2>
      <div class="graph">
        ${b.mois.map((x) => `
        <div class="graph-col">
          <div class="graph-barres">
            <span class="barre b1" style="height:${hauteur(x.facture)}%"></span>
            <span class="barre b2" style="height:${hauteur(x.encaisse)}%"></span>
          </div>
          <span class="graph-mois">${esc(x.nom)}</span>
        </div>`).join("")}
      </div>
      <div class="legende"><span><span class="pt p1"></span>Facturé</span><span><span class="pt p2"></span>Encaissé</span></div>
    </div>

    ${b.topClients.length ? `
    <div class="bloc">
      <h2>Meilleurs clients</h2>
      ${b.topClients.map((c) => `<div class="ligne"><span>${esc(c.nom)}</span><span class="valeur">${m(arrondir(c.total))}</span></div>`).join("")}
    </div>` : ""}

    ${b.modes.length ? `
    <div class="bloc">
      <h2>Paiements reçus par mode</h2>
      ${b.modes.map(([mode, total]) => `<div class="ligne"><span>${esc(mode)}</span><span class="valeur">${m(arrondir(total))}</span></div>`).join("")}
    </div>` : ""}`;
}

async function chargerDevis(ctx) {
  try {
    const { db, F } = ctx.etat.fb;
    const uid = ctx.etat.utilisateur.uid;
    const resultat = await F.getDocs(F.collection(db, "entreprises", uid, "devis"));
    devisListe = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Les devis sont un « plus » : le bilan reste utile sans eux
    console.warn("Devis non chargés pour le bilan :", err);
    devisListe = [];
  }
}

async function remplir(ctx) {
  verifierProprietaire(ctx);
  const zone = document.getElementById("contenu-bilan");
  if (!zone) return;
  try {
    if (memoire.liste === null) await chargerFactures(ctx);
    await chargerDevis(ctx);
  } catch (err) {
    console.error("Bilan :", err);
    zone.innerHTML = `
      <div class="chargement">
        <p>Impossible de calculer le bilan. Vérifiez votre connexion internet.</p>
        <button type="button" class="btn" id="btn-reessayer-bilan">Réessayer</button>
      </div>`;
    const r = document.getElementById("btn-reessayer-bilan");
    if (r) r.addEventListener("click", () => {
      zone.innerHTML = '<div class="chargement">Chargement…</div>';
      remplir(ctx);
    });
    return;
  }
  zone.innerHTML = htmlBilan(ctx);
}

/* ----------------------------------------------------------
   L'écran de ce module
   ---------------------------------------------------------- */
export const ecrans = {
  bilan: {
    onglet: "factures",
    rendu(ctx) {
      verifierProprietaire(ctx);
      const puce = (valeur, texte) =>
        `<button type="button" class="puce${periode === valeur ? " actif" : ""}" data-periode="${valeur}">${texte}</button>`;
      return `
        <div class="onglets-doc">
          <button type="button" class="onglet-doc" data-aller="factures">Factures</button>
          <button type="button" class="onglet-doc" data-aller="devis">Devis</button>
          <button type="button" class="onglet-doc actif" data-aller="bilan">Bilan</button>
        </div>
        <h1>Bilan</h1>
        <p class="sous-titre">Où en est votre activité.</p>
        <div class="puces">${puce("mois", "Ce mois")}${puce("annee", "Cette année")}${puce("tout", "Tout")}</div>
        <div id="contenu-bilan" aria-live="polite"><div class="chargement">Chargement…</div></div>`;
    },
    brancher(ctx) {
      document.querySelectorAll(".puce").forEach((b) =>
        b.addEventListener("click", () => {
          periode = b.dataset.periode;
          document.querySelectorAll(".puce").forEach((x) => x.classList.toggle("actif", x === b));
          const zone = document.getElementById("contenu-bilan");
          if (zone && memoire.liste !== null) zone.innerHTML = htmlBilan(ctx);
        }));
      remplir(ctx);
    }
  }
};
