/* ==========================================================
   SHOOT FACTURE - Module « Profil de l'entreprise »
   Nom, logo, coordonnées et mentions des factures.
   ========================================================== */

/* ----------------------------------------------------------
   Styles de ce module
   ---------------------------------------------------------- */
export const style = `
.logo-mini { display: block; max-width: 120px; max-height: 80px; object-fit: contain; margin: 0 0 12px; }

.retour { padding-left: 0; margin-bottom: 4px; }

.section-titre {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--gris);
  margin: 26px 0 12px;
}

.champ textarea {
  width: 100%;
  min-height: 88px;
  padding: 12px 14px;
  border: 1.5px solid #CFCBC4;
  border-radius: 12px;
  background: var(--blanc);
  color: var(--noir);
  font: inherit;
  font-size: 16px;
  resize: vertical;
}
.champ textarea:focus {
  outline: 3px solid rgba(255, 106, 0, 0.35);
  border-color: var(--orange);
}
.champ .aide-champ { font-size: 13px; color: var(--gris); margin-top: 6px; }

.logo-zone { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.logo-cadre {
  flex: none;
  width: 104px;
  height: 104px;
  border: 2px dashed #CFCBC4;
  border-radius: 16px;
  background: var(--blanc);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--gris);
  font-size: 12px;
  text-align: center;
  padding: 6px;
}
.logo-cadre img { max-width: 100%; max-height: 100%; object-fit: contain; }
.logo-actions { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.logo-actions .btn { min-height: 44px; padding: 0 16px; font-size: 15px; }

.apercu { margin-top: 8px; }
.apercu-carte {
  background: var(--blanc);
  border: 1px solid var(--trait);
  border-left: 5px solid var(--orange);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  font-size: 14px;
}
.apercu-carte img { flex: none; width: 64px; height: 64px; object-fit: contain; }
.apercu-nom { font-weight: 800; font-size: 17px; line-height: 1.2; }
.apercu-ligne { color: #3d3d3d; word-break: break-word; }
.apercu-vide { color: var(--gris); }

.pied-formulaire { margin-top: 24px; }
`;

/* ----------------------------------------------------------
   Petits outils
   ---------------------------------------------------------- */
const DEVISES = ["FCFA", "GNF", "MAD", "DZD", "TND", "NGN", "GHS", "USD", "EUR"];
const TAILLE_LOGO = 320;       // pixels, côté le plus long
const POIDS_MAX_LOGO = 400000; // caractères, pour rester léger dans la base

function lireImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
    img.src = url;
  });
}

// Réduit l'image choisie pour qu'elle reste légère
async function reduireImage(fichier) {
  const img = await lireImage(fichier);
  const largeur0 = img.naturalWidth || 300;
  const hauteur0 = img.naturalHeight || 300;
  const echelle = Math.min(1, TAILLE_LOGO / Math.max(largeur0, hauteur0));
  const largeur = Math.max(1, Math.round(largeur0 * echelle));
  const hauteur = Math.max(1, Math.round(hauteur0 * echelle));

  const canvas = document.createElement("canvas");
  canvas.width = largeur;
  canvas.height = hauteur;
  const g = canvas.getContext("2d");
  g.drawImage(img, 0, 0, largeur, hauteur);

  let data = canvas.toDataURL("image/png");
  if (data.length > 250000) {
    g.globalCompositeOperation = "destination-over";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, largeur, hauteur);
    data = canvas.toDataURL("image/jpeg", 0.85);
  }
  if (data.length > POIDS_MAX_LOGO) throw new Error("image trop lourde");
  return data;
}

/* ----------------------------------------------------------
   Écran « Profil de l'entreprise »
   ---------------------------------------------------------- */
export const ecrans = {
  profil: {
    onglet: "reglages",

    rendu(ctx) {
      const e = ctx.etat.entreprise || {};
      const v = (cle, defaut = "") => ctx.echapper(e[cle] ?? defaut);
      const logo = ctx.srcLogo(e.logo);

      const champ = (id, libelle, { type = "text", valeur = "", aide = "", exemple = "",
                                    auto = "off", maxlength = 120, liste = "" } = {}) => `
        <div class="champ">
          <label for="${id}">${libelle}</label>
          <input id="${id}" name="${id}" type="${type}" value="${valeur}" maxlength="${maxlength}"
                 autocomplete="${auto}" placeholder="${exemple}"${liste ? ` list="${liste}"` : ""}>
          ${aide ? `<p class="aide-champ">${aide}</p>` : ""}
        </div>`;

      const zone = (id, libelle, { valeur = "", exemple = "", aide = "", maxlength = 400 } = {}) => `
        <div class="champ">
          <label for="${id}">${libelle}</label>
          <textarea id="${id}" name="${id}" maxlength="${maxlength}" placeholder="${exemple}">${valeur}</textarea>
          ${aide ? `<p class="aide-champ">${aide}</p>` : ""}
        </div>`;

      return `
        <button type="button" class="lien retour" data-aller="reglages">← Réglages</button>
        <h1>Profil de l'entreprise</h1>
        <p class="sous-titre">Ces informations apparaîtront sur vos factures.</p>

        <form id="form-profil" novalidate>

          <h2 class="section-titre">Identité</h2>
          <div class="logo-zone">
            <div class="logo-cadre" id="logo-cadre">${logo ? `<img src="${logo}" alt="Logo">` : "Aucun logo"}</div>
            <div class="logo-actions">
              <label class="btn btn-secondaire" for="logo-fichier">Choisir un logo</label>
              <input type="file" id="logo-fichier" accept="image/*" hidden>
              <button type="button" class="lien" id="logo-retirer">Retirer le logo</button>
            </div>
          </div>
          ${champ("nom", "Nom de l'entreprise", { valeur: v("nom"), exemple: "Ex. SHOOT MEDIA", auto: "organization" })}
          ${champ("activite", "Activité (facultatif)", { valeur: v("activite"), exemple: "Ex. Photo, vidéo et communication" })}

          <h2 class="section-titre">Coordonnées</h2>
          ${zone("adresse", "Adresse", { valeur: v("adresse"), exemple: "Quartier, rue, ville, pays", maxlength: 250 })}
          ${champ("telephone", "Téléphone", { type: "tel", valeur: v("telephone"), exemple: "Ex. +221 77 123 45 67", auto: "tel", maxlength: 30 })}
          ${champ("whatsapp", "Numéro WhatsApp", { type: "tel", valeur: v("whatsapp"), exemple: "Ex. +221 77 123 45 67", maxlength: 30,
            aide: "Avec l'indicatif du pays. C'est ce numéro qui sera affiché pour échanger avec vos clients." })}
          ${champ("emailPro", "E-mail de l'entreprise", { type: "email", valeur: v("emailPro"), exemple: "contact@entreprise.com", maxlength: 120 })}
          ${champ("numeroLegal", "Numéro d'identification (facultatif)", { valeur: v("numeroLegal"), exemple: "RCCM, NIF, IFU…", maxlength: 60 })}

          <h2 class="section-titre">Facturation</h2>
          ${champ("devise", "Monnaie", { valeur: v("devise", "FCFA"), exemple: "FCFA", maxlength: 12, liste: "liste-devises",
            aide: "Choisissez dans la liste ou écrivez la vôtre." })}
          <datalist id="liste-devises">${DEVISES.map((d) => `<option value="${d}">`).join("")}</datalist>
          ${zone("paiement", "Moyens de paiement", { valeur: v("paiement"), maxlength: 400,
            exemple: "Ex. Orange Money : 77 123 45 67 (SHOOT MEDIA)&#10;Virement : IBAN…",
            aide: "Écrits en bas de chaque facture : mobile money, banque, espèces…" })}
          ${zone("mentions", "Mentions de bas de facture", { valeur: v("mentions"), maxlength: 400,
            exemple: "Ex. Merci pour votre confiance. Paiement sous 15 jours.", aide: "Conditions, remerciements, mentions légales." })}

          <h2 class="section-titre">Aperçu</h2>
          <div class="apercu">
            <div class="apercu-carte" id="apercu"></div>
            <p class="aide">Voici comment l'en-tête de vos factures sera présenté.</p>
          </div>

          <div class="pied-formulaire">
            <button type="submit" class="btn btn-large" id="btn-enregistrer">Enregistrer</button>
            <p id="message-profil" class="message" role="alert"></p>
          </div>
        </form>`;
    },

    brancher(ctx) {
      const form = document.getElementById("form-profil");
      const zoneMessage = document.getElementById("message-profil");
      const bouton = document.getElementById("btn-enregistrer");
      const cadre = document.getElementById("logo-cadre");
      const apercu = document.getElementById("apercu");
      const fichier = document.getElementById("logo-fichier");

      let logo = ctx.srcLogo((ctx.etat.entreprise || {}).logo);
      let occupe = false;

      const dire = (texte, type) => { zoneMessage.textContent = texte; zoneMessage.className = "message " + type; };
      const lire = (id) => form.elements[id].value.trim();
      const texteHtml = (t) => ctx.echapper(t).replace(/\n/g, "<br>");

      // Aperçu de l'en-tête de facture
      function majApercu() {
        const lignes = [];
        const nom = lire("nom");
        const activite = lire("activite");
        if (activite) lignes.push(`<div class="apercu-ligne">${ctx.echapper(activite)}</div>`);
        if (lire("adresse")) lignes.push(`<div class="apercu-ligne">${texteHtml(lire("adresse"))}</div>`);
        if (lire("telephone")) lignes.push(`<div class="apercu-ligne">Tél : ${ctx.echapper(lire("telephone"))}</div>`);
        if (lire("whatsapp")) lignes.push(`<div class="apercu-ligne">WhatsApp : ${ctx.echapper(lire("whatsapp"))}</div>`);
        if (lire("emailPro")) lignes.push(`<div class="apercu-ligne">${ctx.echapper(lire("emailPro"))}</div>`);
        if (lire("numeroLegal")) lignes.push(`<div class="apercu-ligne">N° ${ctx.echapper(lire("numeroLegal"))}</div>`);

        apercu.innerHTML = `
          ${logo ? `<img src="${logo}" alt="">` : ""}
          <div>
            <div class="apercu-nom">${nom ? ctx.echapper(nom) : '<span class="apercu-vide">Nom de l’entreprise</span>'}</div>
            ${lignes.join("") || '<div class="apercu-vide">Vos coordonnées apparaîtront ici.</div>'}
          </div>`;
      }

      function majLogo() {
        cadre.innerHTML = logo ? `<img src="${logo}" alt="Logo">` : "Aucun logo";
        majApercu();
      }

      form.addEventListener("input", majApercu);
      majApercu();

      // Choisir un logo
      fichier.addEventListener("change", async () => {
        const f = fichier.files && fichier.files[0];
        if (!f) return;
        if (f.size > 10 * 1024 * 1024) {
          dire("Cette image est trop lourde (10 Mo maximum).", "erreur");
          fichier.value = "";
          return;
        }
        try {
          logo = await reduireImage(f);
          zoneMessage.className = "message";
          zoneMessage.textContent = "";
          majLogo();
        } catch (err) {
          console.error(err);
          dire("Cette image n'a pas pu être lue. Essayez un fichier PNG ou JPEG.", "erreur");
        }
        fichier.value = "";
      });

      document.getElementById("logo-retirer").addEventListener("click", () => {
        logo = "";
        majLogo();
      });

      // Enregistrer
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        if (occupe) return;

        const nom = lire("nom");
        const emailPro = lire("emailPro");
        if (nom.length < 2) { dire("Indiquez le nom de votre entreprise.", "erreur"); form.elements.nom.focus(); return; }
        if (emailPro && !/^\S+@\S+\.\S+$/.test(emailPro)) {
          dire("L'e-mail de l'entreprise n'est pas valide.", "erreur");
          form.elements.emailPro.focus();
          return;
        }
        if (!navigator.onLine) {
          dire("Vous êtes hors ligne. Reconnectez-vous à internet pour enregistrer.", "erreur");
          return;
        }

        occupe = true;
        bouton.disabled = true;
        bouton.textContent = "Enregistrement…";
        zoneMessage.className = "message";
        zoneMessage.textContent = "";

        try {
          await ctx.enregistrerEntreprise({
            nom,
            activite: lire("activite"),
            adresse: lire("adresse"),
            telephone: lire("telephone"),
            whatsapp: lire("whatsapp"),
            emailPro,
            numeroLegal: lire("numeroLegal"),
            devise: lire("devise") || "FCFA",
            paiement: lire("paiement"),
            mentions: lire("mentions"),
            logo
          });
          dire("Profil enregistré.", "succes");
        } catch (err) {
          console.error(err);
          dire("L'enregistrement a échoué. Vérifiez votre connexion et réessayez.", "erreur");
        } finally {
          occupe = false;
          bouton.disabled = false;
          bouton.textContent = "Enregistrer";
        }
      });
    }
  }
};
