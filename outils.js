/* ==========================================================
   SHOOT FACTURE - outils partagés
   Petites fonctions utilisées par plusieurs modules
   (prix, nombres, recherche).
   ========================================================== */

// Écrit un nombre à la française : 1500000 -> « 1 500 000 »
export function formaterNombre(n) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })
    .format(Number(n) || 0)
    .replace(/[\u202f\u00a0]/g, "\u00a0");
}

// Écrit un montant avec sa monnaie : « 15 000 FCFA »
export function formaterMontant(n, devise) {
  return formaterNombre(n) + "\u00a0" + (devise || "FCFA");
}

// Lit un nombre tapé par une personne : « 15 000 », « 2,5 », « 12500 »
// Renvoie NaN si ce n'est pas un nombre valide.
export function lireNombre(texte) {
  const t = String(texte ?? "").replace(/[\s\u00a0\u202f]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  return Number(t);
}

// Pour chercher sans tenir compte des majuscules ni des accents
export function simple(texte) {
  return String(texte || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
