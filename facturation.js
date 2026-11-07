/* ==========================================================
   SHOOT FACTURE - Outils de facturation
   Calculs, numéros, dates et accès aux factures.
   Partagés par factures.js (liste et facture) et
   facture-form.js (création et modification).
   ========================================================== */

import { formaterMontant } from "./outils.js";

export const MODES_PAIEMENT = ["Espèces", "Orange Money", "Wave", "Moov Money", "Virement bancaire", "Chèque", "Autre"];

/* ----------------------------------------------------------
   Mémoire partagée entre les écrans de facturation
   ---------------------------------------------------------- */
export const memoire = {
  liste: null,       // toutes les factures (null = pas encore chargées)
  uid: null,         // à qui appartient cette liste
  selection: null,   // la facture ouverte
  edition: null,     // la facture en cours de modification (null = nouvelle)
  flash: ""          // petit message à afficher
};

// Sécurité : si une autre entreprise se connecte sur ce téléphone, on repart de zéro
export function verifierProprietaire(ctx) {
  const uid = ctx.etat.utilisateur && ctx.etat.utilisateur.uid;
  if (memoire.uid !== uid) {
    memoire.liste = null;
    memoire.selection = null;
    memoire.edition = null;
    memoire.flash = "";
    memoire.uid = uid;
  }
}

export function outils(ctx) {
  const { db, F } = ctx.etat.fb;
  const uid = ctx.etat.utilisateur.uid;
  return { db, F, uid, colonne: F.collection(db, "entreprises", uid, "factures") };
}

export function devise(ctx) {
  return (ctx.etat.entreprise && ctx.etat.entreprise.devise) || "FCFA";
}

/* ----------------------------------------------------------
   Calculs
   ---------------------------------------------------------- */
export const arrondir = (n) => Math.round((Number(n) || 0) * 100) / 100;

// lignes : [{ quantite, prix }]   remise : montant   tva : pourcentage   paye : déjà payé
export function calculer(lignes, remise, tva, paye) {
  const sousTotal = arrondir(lignes.reduce((s, l) => s + arrondir(l.quantite * l.prix), 0));
  const remiseOk = Math.min(Math.max(arrondir(remise), 0), sousTotal);
  const base = arrondir(sousTotal - remiseOk);
  const taux = Math.min(Math.max(Number(tva) || 0, 0), 100);
  const montantTva = arrondir((base * taux) / 100);
  const total = arrondir(base + montantTva);
  const payeOk = arrondir(paye);
  return { sousTotal, remise: remiseOk, base, tva: taux, montantTva, total, paye: payeOk, solde: arrondir(total - payeOk) };
}

export function statutDe(total, paye) {
  if (paye >= total) return "payee";
  if (paye > 0) return "partielle";
  return "impayee";
}

// Ce qui s'affiche à côté d'une facture
export function etiquette(f, aujourdhui = dateAujourdhui()) {
  if (arrondir(f.solde) <= 0) return { code: "payee", libelle: "Payée", classe: "badge-ok" };
  if (f.echeance && f.echeance < aujourdhui) return { code: "retard", libelle: "En retard", classe: "badge-retard" };
  if (arrondir(f.paye) > 0) return { code: "partielle", libelle: "Avance versée", classe: "badge-avance" };
  return { code: "impayee", libelle: "Impayée", classe: "badge-impayee" };
}

/* ----------------------------------------------------------
   Dates
   ---------------------------------------------------------- */
const deux = (n) => String(n).padStart(2, "0");

export function dateAujourdhui() {
  const d = new Date();
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
}

export function dateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/* ----------------------------------------------------------
   WhatsApp
   ---------------------------------------------------------- */
export function chiffresWhatsApp(telephone) {
  let n = String(telephone || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  return n;
}

export function lienWhatsApp(f, nomEntreprise) {
  const monnaie = f.devise || "FCFA";
  const texte = [
    `Bonjour ${(f.client && f.client.nom) || ""},`,
    `Voici votre facture ${f.numero} du ${dateFr(f.date)} : montant total ${formaterMontant(f.total, monnaie)}.`,
    arrondir(f.paye) > 0 ? `Déjà payé : ${formaterMontant(f.paye, monnaie)}.` : "",
    arrondir(f.solde) > 0 ? `Reste à payer : ${formaterMontant(f.solde, monnaie)}.` : "Facture entièrement payée.",
    `Merci de votre confiance. ${nomEntreprise || ""}`.trim()
  ].filter(Boolean).join("\n");
  return `https://wa.me/${chiffresWhatsApp(f.client && f.client.telephone)}?text=${encodeURIComponent(texte)}`;
}

/* ----------------------------------------------------------
   Copie des coordonnées de l'entreprise au moment de la facture
   (si le profil change plus tard, les anciennes factures restent justes)
   ---------------------------------------------------------- */
export function instantaneEmetteur(e) {
  const cles = ["nom", "activite", "adresse", "telephone", "whatsapp", "emailPro", "numeroLegal", "paiement", "mentions"];
  const o = {};
  for (const c of cles) o[c] = e && e[c] ? String(e[c]) : "";
  return o;
}

/* ----------------------------------------------------------
   Accès aux factures (base de données)
   ---------------------------------------------------------- */
export function trier() {
  memoire.liste.sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || "")) || (Number(b.seq || 0) - Number(a.seq || 0)));
}

export async function chargerFactures(ctx) {
  const { F, colonne } = outils(ctx);
  const resultat = await F.getDocs(colonne);
  memoire.liste = resultat.docs.map((d) => ({ id: d.id, ...d.data() }));
  trier();
}

// Crée une facture avec son numéro automatique (FAC-2026-0001, FAC-2026-0002...)
// Le numéro est attribué dans une « transaction » : jamais de doublon, jamais de trou.
export async function creerFacture(ctx, donnees) {
  const { db, F, uid } = outils(ctx);
  const annee = Number(String(donnees.date).slice(0, 4)) || new Date().getFullYear();
  const prefixe = (ctx.etat.entreprise && ctx.etat.entreprise.prefixeFacture) || "FAC";
  const compteur = F.doc(db, "entreprises", uid, "compteurs", "factures-" + annee);
  const reference = F.doc(F.collection(db, "entreprises", uid, "factures"));
  let resultat = null;

  await F.runTransaction(db, async (tx) => {
    const lu = await tx.get(compteur);
    const n = (lu.exists() ? Number(lu.data().dernier) || 0 : 0) + 1;
    resultat = { ...donnees, numero: `${prefixe}-${annee}-${String(n).padStart(4, "0")}`, annee, seq: n };
    tx.set(compteur, { dernier: n });
    tx.set(reference, { ...resultat, creeLe: F.serverTimestamp() });
  });

  return { id: reference.id, ...resultat };
}

export async function modifierFacture(ctx, facture, champs) {
  const { db, F, uid } = outils(ctx);
  await F.setDoc(F.doc(db, "entreprises", uid, "factures", facture.id),
    { ...champs, modifieLe: F.serverTimestamp() }, { merge: true });
  Object.assign(facture, champs);
}

export async function supprimerFacture(ctx, facture) {
  const { db, F, uid } = outils(ctx);
  await F.deleteDoc(F.doc(db, "entreprises", uid, "factures", facture.id));
  if (memoire.liste) memoire.liste = memoire.liste.filter((f) => f.id !== facture.id);
}
