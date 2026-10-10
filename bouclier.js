/* ==========================================================
   MGTCG — bouclier.js   (V3)
   Bouclier anti-arnaques : vérifier une annonce (niveau de risque
   expliqué), les arnaques les plus courantes, alertes de la
   communauté (validées par l'admin) et où signaler.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const S = { alerts: [], filter: "" };

  const PLATFORMS = {
    Vinted: { label: "Vinted", risk: 0 }, Leboncoin: { label: "Leboncoin", risk: 0 }, eBay: { label: "eBay", risk: 0 },
    Cardmarket: { label: "Cardmarket", risk: 0 }, social: { label: "Réseau social (Facebook, Instagram, Discord, Snapchat…)", risk: 2 },
    main: { label: "En main propre", risk: 0 }, autre: { label: "Autre site", risk: 1 },
  };
  const PAYMENTS = {
    plateforme: { label: "Paiement dans l'appli / le site (Vinted, Leboncoin, eBay, Cardmarket)", risk: 0, good: "Payer dans l'appli te protège : l'argent n'est versé au vendeur qu'une fois l'objet reçu." },
    paypal_gs: { label: "PayPal « biens et services »", risk: 0, good: "PayPal « biens et services » offre une protection des achats." },
    paypal_proches: { label: "PayPal « entre proches / amis »", risk: 4, why: "PayPal « entre proches » n'offre aucune protection : si rien n'arrive, l'argent est perdu." },
    virement: { label: "Virement bancaire", risk: 3, why: "Un virement à un inconnu est presque impossible à récupérer." },
    instant: { label: "Lydia, Wero, Paylib…", risk: 3, why: "Les paiements instantanés entre particuliers sont irréversibles." },
    crypto: { label: "Cryptomonnaie", risk: 6, crit: true, why: "Paiement en cryptomonnaie demandé : signe d'arnaque quasi certain, aucun recours possible." },
    cadeau: { label: "Coupons ou cartes cadeaux (PCS, Transcash, Google Play…)", risk: 6, crit: true, why: "Paiement en coupons ou cartes cadeaux : c'est TOUJOURS une arnaque." },
    especes: { label: "Espèces en main propre", risk: 0, good: "En main propre, tu peux vérifier la carte avant de payer." },
  };
  const SIGNALS = [
    { k: "hors", risk: 3, label: "Le vendeur veut continuer ailleurs (WhatsApp, email, SMS…)", why: "Quitter la plateforme fait perdre toute protection : c'est la première étape de la plupart des arnaques." },
    { k: "lien", risk: 6, crit: true, label: "J'ai reçu un lien pour payer, « recevoir l'argent » ou suivre la livraison", why: "Un lien reçu par message qui imite la plateforme sert à voler tes coordonnées bancaires." },
    { k: "photo", risk: 3, label: "Il refuse une photo de la carte avec mon pseudo écrit à côté", why: "Un vendeur honnête qui a vraiment la carte accepte toujours une photo personnalisée." },
    { k: "internet", risk: 2, label: "Les photos semblent venir d'internet (fond blanc, image officielle)", why: "Des photos trouvées en ligne peuvent montrer une carte que le vendeur n'a pas." },
    { k: "pression", risk: 2, label: "Il me presse (« plusieurs acheteurs », « dernière chance »)", why: "La pression empêche de prendre le temps de vérifier : c'est voulu." },
    { k: "acompte", risk: 2, label: "Il demande un acompte ou de payer avant de discuter", why: "Un acompte versé hors plateforme est rarement récupérable." },
    { k: "nouveau", risk: 1, label: "Compte tout récent ou sans aucun avis", why: "Un compte neuf n'est pas forcément malhonnête, mais tu n'as aucun historique pour juger." },
    { k: "histoire", risk: 1, label: "Histoire compliquée (vendeur à l'étranger, héritage, transporteur à payer…)", why: "Les histoires compliquées servent souvent à justifier un paiement inhabituel." },
    { k: "certif", risk: 5, crit: true, label: "Carte gradée : le numéro de certificat est introuvable ou ne correspond pas", why: "Un certificat introuvable ou différent = boîtier ou étiquette falsifiés." },
    { k: "scelle", risk: 3, label: "Produit scellé : emballage abîmé, recollé, ou film plastique « maison »", why: "Les boosters et coffrets peuvent être ouverts, vidés de leurs cartes rares, puis refermés." },
    { k: "suivi", risk: 1, label: "Envoi proposé sans numéro de suivi pour une carte chère", why: "Sans suivi, impossible de prouver l'envoi ou la perte du colis." },
  ];
  const KINDS = ["Fausse carte", "Booster rescellé", "Faux boîtier gradé", "Paiement", "Faux lien", "Colis", "Échange", "Autre"];
  const APLATFORMS = ["Vinted", "Leboncoin", "eBay", "Cardmarket", "Facebook", "Instagram", "Discord", "WhatsApp", "En main propre", "Autre"];
  const LEVELS = [
    { max: 2, cls: "lvl-1", name: "Risque faible", text: "Rien d'inquiétant dans tes réponses. Garde quand même les bons réflexes ci-dessous." },
    { max: 5, cls: "lvl-2", name: "Risque moyen", text: "Quelques signaux d'alerte. Pose des questions, demande des preuves et reste sur la plateforme." },
    { max: 9, cls: "lvl-3", name: "Risque élevé", text: "Plusieurs signaux d'arnaque. Ne paie pas tant que les points en rouge ne sont pas réglés." },
    { max: Infinity, cls: "lvl-4", name: "Risque très élevé", text: "Tout indique une arnaque. N'envoie pas d'argent et ne donne aucune information bancaire." },
  ];

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.bouclier = async function (arg) {
    const { view, esc, eur } = ui();
    const key = String(arg || "");
    let ref = null; // carte de référence (pour la cote)
    if (key.includes("|")) {
      const [lang, id] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
      const m = MG.store.meta(key);
      if (m && (m.price || m.priceHolo)) ref = { name: m.name, price: m.price || m.priceHolo };
      else { try { const c = await MG.api.card(lang, id); const cm = c.cardmarket || {}; ref = { name: c.name, price: cm.trend || cm.avg || cm["trend-holo"] || 0 }; } catch (e) { ref = null; } }
    }
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🛡️ Bouclier anti-arnaques</h1>
        <p class="muted">Avant d'acheter une carte ou un produit à un particulier, réponds à quelques questions sur l'annonce : MGTCG t'explique les signaux d'alerte et le niveau de risque.</p>
      </div></header>

      <section class="tool-card">
        <h2>🔍 Vérifier une annonce</h2>
        <form id="sh-form" class="sh-form">
          <div class="sh-grid">
            <label>Cote de la carte (€)<input name="cote" type="number" min="0" step="0.01" inputmode="decimal" placeholder="ex : 120" value="${ref && ref.price ? ref.price.toFixed(2) : ""}"></label>
            <label>Prix demandé (€)<input name="prix" type="number" min="0" step="0.01" inputmode="decimal" placeholder="ex : 45"></label>
            <label>Où est l'annonce ?<select name="platform"><option value="">— choisir —</option>${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></label>
            <label>Paiement demandé<select name="payment"><option value="">— choisir —</option>${Object.entries(PAYMENTS).map(([k, p]) => `<option value="${k}">${esc(p.label)}</option>`).join("")}</select></label>
          </div>
          <p class="small muted">${ref ? `Cote Cardmarket de « ${esc(ref.name || "la carte")} » pré-remplie depuis sa fiche.` : `Tu ne connais pas la cote ? Cherche la carte avec la barre de recherche en haut, puis clique sur « 🛡 Vérifier une annonce » dans sa fiche.`}</p>
          <fieldset class="sh-checks"><legend>Coche ce qui correspond à l'annonce</legend>
            ${SIGNALS.map((s) => `<label class="sh-check"><input type="checkbox" name="${s.k}"> ${esc(s.label)}</label>`).join("")}
          </fieldset>
        </form>
        <div id="sh-result" aria-live="polite"></div>
      </section>

      <section>
        <h2>📚 Les arnaques les plus courantes</h2>
        <div class="sh-guide">${GUIDE.map((g) => `<details class="tool-card"><summary><b>${g.t}</b></summary>${g.h}</details>`).join("")}</div>
      </section>

      <section>
        <div class="section-head"><h2>🚨 Alertes de la communauté</h2>
          ${auth() && auth().user ? `<button class="btn ghost" id="sh-add">＋ Signaler une arnaque</button>` : `<a class="btn ghost" href="#/connexion">Se connecter pour signaler</a>`}</div>
        <p class="muted small">Des façons d'arnaquer repérées par les membres, vérifiées par l'administrateur avant publication. Pour protéger tout le monde (et éviter les erreurs), on ne publie <b>ni pseudo ni nom</b> : signale aussi le compte directement à la plateforme.</p>
        <div class="chips" id="sh-filter"><button class="chip active" data-k="">Toutes</button>${KINDS.map((k) => `<button class="chip" data-k="${esc(k)}">${esc(k)}</button>`).join("")}</div>
        <div id="sh-alerts" class="nw-list"></div>
      </section>

      <section class="tool-card">
        <h2>📣 Tu t'es fait arnaquer ? Où signaler</h2>
        <ol class="sh-steps">
          <li><b>Signale le compte à la plateforme</b> (bouton « Signaler » sur l'annonce ou le profil) et ouvre un litige si tu as payé dans l'appli.</li>
          <li>Si tu as donné ta carte bancaire : <b>appelle ta banque tout de suite</b> pour faire opposition, puis déclare la fraude sur <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.service-public.fr/particuliers/vosdroits/R46526">Perceval</a>.</li>
          <li>Garde toutes les preuves : captures de l'annonce, des messages, du paiement.</li>
          <li>Porte plainte (en ligne via <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.service-public.fr/particuliers/vosdroits/N31138">service-public.fr, rubrique arnaque sur Internet</a>, ou au commissariat / à la gendarmerie).</li>
          <li>Signale l'annonce sur <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.internet-signalement.gouv.fr/">Pharos</a>, fais-toi aider par <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.cybermalveillance.gouv.fr/">Cybermalveillance.gouv.fr</a>, ou appelle <b>Info Escroqueries au 0 805 805 817</b> (gratuit, du lundi au vendredi).</li>
        </ol>
        <p class="disclaimer">Ces conseils et ce niveau de risque sont une aide, pas une garantie : un risque faible ne prouve pas qu'une annonce est honnête. MGTCG ne vérifie pas les vendeurs.</p>
      </section>`;

    const form = document.getElementById("sh-form");
    form.addEventListener("input", () => evaluate(form));
    form.addEventListener("submit", (e) => e.preventDefault());
    evaluate(form);
    document.querySelectorAll("#sh-filter .chip").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#sh-filter .chip").forEach((x) => x.classList.toggle("active", x === b));
      S.filter = b.dataset.k; renderAlerts();
    }));
    const add = document.getElementById("sh-add");
    if (add) add.addEventListener("click", openReport);
    loadAlerts();
  };

  /* ---------------- Calcul du risque ---------------- */
  function evaluate(form) {
    const { esc, eur } = ui();
    const f = new FormData(form);
    const out = document.getElementById("sh-result");
    const bad = [], good = [], info = [];
    let score = 0, crit = false, answered = 0;
    const cote = parseFloat(f.get("cote")), prix = parseFloat(f.get("prix"));
    if (cote > 0 && prix > 0) {
      answered++;
      const r = prix / cote;
      const pct = Math.round((1 - r) * 100);
      if (r < 0.5) { score += 4; bad.push(`Prix ${pct} % sous la cote (${eur(prix)} au lieu de ${eur(cote)}) : beaucoup trop beau pour être vrai. C'est le signe n°1 d'une arnaque ou d'une contrefaçon.`); }
      else if (r < 0.7) { score += 2; bad.push(`Prix ${pct} % sous la cote : rarissime pour une vraie bonne affaire. Demande pourquoi.`); }
      else if (r < 0.85) { score += 1; bad.push(`Prix un peu bas (${pct} % sous la cote) : possible (vendeur pressé, état moyen), reste attentif.`); }
      else if (r > 1.5) info.push(`Prix ${Math.round((r - 1) * 100)} % au-dessus de la cote : ce n'est pas une arnaque, mais tu paierais bien plus cher que le marché.`);
      else good.push("Prix cohérent avec la cote.");
    }
    const pl = PLATFORMS[f.get("platform")];
    if (pl) {
      answered++;
      if (pl.risk >= 2) { score += pl.risk; bad.push("Sur les réseaux sociaux, il n'y a aucune protection acheteur ni moyen de récupérer ton argent."); }
      else if (pl.risk === 1) { score += 1; bad.push("Site inconnu : vérifie ses avis et ses conditions de remboursement avant de payer."); }
      else if (f.get("platform") === "main") good.push("En main propre : retrouve-toi dans un lieu public (boutique, café) et vérifie la carte avant de payer.");
      else good.push(`${pl.label} protège les achats… tant que tout se passe dans l'appli.`);
    }
    const pay = PAYMENTS[f.get("payment")];
    if (pay) {
      answered++;
      if (pay.risk) { score += pay.risk; bad.push(pay.why); if (pay.crit) crit = true; }
      else good.push(pay.good);
    }
    for (const s of SIGNALS) if (f.get(s.k)) { answered++; score += s.risk; bad.push(s.why); if (s.crit) crit = true; }

    if (!answered) { out.innerHTML = `<p class="muted small sh-wait">Remplis au moins une réponse pour voir le niveau de risque.</p>`; return; }
    const lvl = crit ? LEVELS[3] : LEVELS.find((l) => score <= l.max);
    const idx = LEVELS.indexOf(lvl);
    out.innerHTML = `
      <div class="sh-level ${lvl.cls}">
        <div class="sh-meter" role="img" aria-label="${esc(lvl.name)}">${LEVELS.map((l, i) => `<span class="${i <= idx ? "on" : ""}"></span>`).join("")}</div>
        <div><b>${lvl.name}</b><p>${esc(lvl.text)}</p></div>
      </div>
      ${bad.length ? `<h3>⚠️ Signaux d'alerte</h3><ul class="sh-list bad">${bad.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${good.length ? `<h3>✅ Points rassurants</h3><ul class="sh-list good">${good.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      ${info.length ? `<ul class="sh-list">${info.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <h3>🧠 Les bons réflexes</h3>
      <ul class="sh-list">
        <li>Reste dans l'appli du début à la fin : messages <b>et</b> paiement.</li>
        <li>Demande une photo recto/verso avec ton pseudo et la date écrits sur un papier à côté de la carte.</li>
        <li>Carte gradée : vérifie le numéro du certificat sur le site du gradeur.</li>
        <li>Quand tu reçois le colis, filme l'ouverture sans couper la vidéo : c'est ta preuve en cas de litige.</li>
      </ul>`;
  }

  /* ---------------- Guide ---------------- */
  const GUIDE = [
    { t: "🃏 Les fausses cartes", h: `<ul>
      <li><b>Le prix</b> : une carte rare vendue beaucoup moins cher que sa cote doit éveiller tes soupçons.</li>
      <li><b>Compare</b> avec une carte de la même extension que tu possèdes : taille, épaisseur, couleurs, police et alignement des textes.</li>
      <li><b>L'aspect</b> : surface trop brillante ou trop lisse, couleurs délavées ou trop saturées, dos d'un bleu inhabituel, holo qui ne bouge pas avec la lumière.</li>
      <li><b>La tranche</b> : sur les cartes officielles récentes, on voit souvent une fine couche sombre au milieu de l'épaisseur.</li>
      <li><b>Les fautes</b> : erreurs d'orthographe, accents manquants, attaques ou PV qui ne correspondent pas à la fiche de la carte sur MGTCG.</li></ul>` },
    { t: "📦 Les boosters et produits rescellés", h: `<ul>
      <li>Des boosters sont ouverts, vidés de leurs cartes rares, puis refermés (colle, fer à repasser).</li>
      <li>Indices : soudures irrégulières ou plus larges, aluminium froissé, booster plus fin ou plus léger.</li>
      <li>Pour les coffrets (ETB, Display), le film d'origine porte souvent des marques imprimées : méfie-toi d'un film tout lisse ou mal plié.</li>
      <li>Les boosters « à l'unité » d'extensions chères sont les plus à risque : préfère les produits sous blister ou les <a class="accent-link" href="#/boutiques">boutiques</a>.</li></ul>` },
    { t: "🏅 Les faux boîtiers gradés", h: `<ul>
      <li>Les boîtiers et étiquettes PSA, CGC… sont parfois copiés, ou une vraie étiquette est mise sur une autre carte.</li>
      <li>Tape <b>toujours</b> le numéro de certificat sur le site officiel : <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.psacard.com/cert/">PSA</a> ou le site du gradeur (PCA, CCC, CGC…). La photo, la carte et la note doivent correspondre.</li>
      <li>Regarde le boîtier : rayures autour de l'étiquette, colle, boîtier qui s'ouvre facilement = manipulé.</li></ul>` },
    { t: "💸 Les paiements sans protection", h: `<ul>
      <li>« Paie en PayPal entre amis, ça évite les frais » : sans protection, aucun recours si rien n'arrive.</li>
      <li>Virement, Lydia, Wero… sont irréversibles avec un inconnu.</li>
      <li>Cryptomonnaie, coupons PCS / Transcash, cartes cadeaux : <b>toujours</b> une arnaque.</li></ul>` },
    { t: "🔗 Les faux liens (phishing)", h: `<ul>
      <li>Un « acheteur » ou « vendeur » te propose de continuer sur WhatsApp ou par email, puis t'envoie un lien qui imite Vinted, Leboncoin ou un transporteur.</li>
      <li>Le faux site te demande ta carte bancaire « pour recevoir l'argent » ou « payer la livraison ».</li>
      <li>Règle simple : <b>on ne reçoit jamais d'argent en donnant sa carte bancaire</b>, et on ne clique sur aucun lien reçu par message.</li></ul>` },
    { t: "📮 Colis vide ou carte échangée", h: `<ul>
      <li>Acheteur : filme l'ouverture du colis sans couper. Exige un envoi suivi pour les cartes chères.</li>
      <li>Vendeur : prends en photo la carte, le numéro de certificat et le colis fermé avant l'envoi. Certains acheteurs renvoient une autre carte (ou une fausse) en disant que la tienne ne convient pas.</li></ul>` },
    { t: "🧑‍💼 Quand c'est toi qui vends", h: `<ul>
      <li>Fausse capture « j'ai payé » : vérifie toujours dans l'appli ou sur ton compte bancaire avant d'envoyer.</li>
      <li>« Envoie d'abord, je paie après » : non, sauf en main propre.</li>
      <li>Un acheteur qui veut te payer plus que le prix et te demande de « rembourser la différence » : arnaque.</li></ul>` },
  ];

  /* ---------------- Alertes de la communauté ---------------- */
  async function loadAlerts() {
    const el = document.getElementById("sh-alerts");
    if (!el) return;
    const a = auth();
    if (!a || !a.enabled) { el.innerHTML = `<p class="muted">Alertes indisponibles pour le moment.</p>`; return; }
    const { data, error } = await a.client.from("scam_alerts").select("id,title,description,platform,kind,status,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) { el.innerHTML = `<p class="muted small">Les alertes arrivent dès que la base est prête (admin : lance <code>supabase-bouclier.sql</code>).</p>`; return; }
    S.alerts = (data || []).filter((x) => x.status === "approved");
    renderAlerts();
  }
  function renderAlerts() {
    const el = document.getElementById("sh-alerts");
    if (!el) return;
    const { esc, fmtDate } = ui();
    const admin = auth() && auth().isAdmin && auth().isAdmin();
    const list = S.alerts.filter((x) => !S.filter || x.kind === S.filter);
    el.innerHTML = list.length ? list.map((n) => `<article class="nw-item">
      <div class="nw-meta"><span class="ag-kind">🚨 ${esc(n.kind)}</span><span class="ag-kind">${esc(n.platform)}</span><span class="muted small">${esc(new Date(n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))}</span></div>
      <h3>${esc(n.title)}</h3><p>${esc(n.description)}</p>
      ${admin ? `<p class="small"><button class="link-btn small" data-del="${esc(n.id)}">Supprimer</button></p>` : ""}</article>`).join("")
      : `<p class="muted">Aucune alerte${S.filter ? " dans cette catégorie" : ""} pour le moment.</p>`;
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer cette alerte ?")) return;
      const { error } = await auth().client.from("scam_alerts").delete().eq("id", b.dataset.del);
      if (!error) { S.alerts = S.alerts.filter((x) => x.id !== b.dataset.del); renderAlerts(); }
    }));
  }

  function openReport() {
    const a = auth();
    const admin = a.isAdmin && a.isAdmin();
    const { $ } = ui();
    $("#modal-body").innerHTML = `
      <h2 id="modal-title">Signaler une arnaque</h2>
      <p class="muted small">Décris <b>comment</b> l'arnaque fonctionne pour prévenir les autres. ${admin ? "" : "L'administrateur vérifie avant de publier. "}<b>N'écris ni pseudo, ni nom, ni numéro de téléphone</b> : signale le compte directement à la plateforme.</p>
      <form id="f-sh" class="form">
        <div class="row">
          <label class="grow">Type<select name="kind">${KINDS.map((k) => `<option>${k}</option>`).join("")}</select></label>
          <label class="grow">Où ?<select name="platform">${APLATFORMS.map((k) => `<option>${k}</option>`).join("")}</select></label>
        </div>
        <label>Titre<input name="title" required minlength="5" maxlength="140" placeholder="ex : Faux lien de livraison envoyé par SMS"></label>
        <label>Comment ça se passe ?<textarea name="description" required minlength="20" maxlength="1500" rows="6" placeholder="Les étapes, les indices qui auraient dû t'alerter…"></textarea></label>
        <p class="form-msg" id="sh-msg" role="alert"></p>
        <button class="btn full" type="submit">${admin ? "Publier" : "Envoyer"}</button>
      </form>`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    const form = $("#f-sh");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const msg = $("#sh-msg");
      const text = String(f.get("title")) + " " + String(f.get("description"));
      if (/@\w|(?:\+33|\b0)[1-9](?:[ .-]?\d{2}){4}\b|https?:\/\//i.test(text)) { msg.textContent = "Retire les pseudos (@…), numéros de téléphone et liens : décris seulement la méthode."; msg.className = "form-msg err"; return; }
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const { error } = await a.client.from("scam_alerts").insert({
        title: String(f.get("title")).trim().slice(0, 140), description: String(f.get("description")).trim().slice(0, 1500),
        kind: KINDS.includes(f.get("kind")) ? f.get("kind") : "Autre", platform: APLATFORMS.includes(f.get("platform")) ? f.get("platform") : "Autre",
        status: admin ? "approved" : "pending", created_by: a.user.id,
      });
      btn.disabled = false;
      if (error) { msg.textContent = /limite/i.test(error.message || "") ? error.message : "Impossible d'envoyer (titre 5 caractères min., description 20 min.)."; msg.className = "form-msg err"; return; }
      $("#modal-body").innerHTML = `<div class="state"><p>✅ ${admin ? "Alerte publiée." : "Merci ! Ton signalement sera vérifié avant publication."}</p></div>`;
      if (admin) loadAlerts();
    });
  }

  /* ---------------- Espace admin ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc } = ui();
    const a = auth();
    const { data, error } = await a.client.from("scam_alerts").select("id,title,description,platform,kind").eq("status", "pending").order("created_at").limit(50);
    if (error) throw error;
    el.innerHTML = `<section><h2>🚨 Alertes arnaques à valider (${data.length})</h2>
      <p class="muted small">Avant de publier : vérifie qu'il n'y a ni pseudo, ni nom, ni accusation contre une personne précise.</p>
      ${data.length ? `<div class="mod-list">${data.map((n) => `<div class="mod-item" data-id="${esc(n.id)}">
        <div><b>${esc(n.title)}</b> · ${esc(n.kind)} · ${esc(n.platform)}<br><span class="small">${esc(n.description)}</span></div>
        <div class="row"><button class="btn" data-act="approved">Publier</button><button class="btn ghost" data-act="rejected">Refuser</button></div></div>`).join("")}</div>`
      : `<p class="muted">Aucune alerte en attente.</p>`}</section>`;
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".mod-item").dataset.id;
      const { error: err } = await a.client.from("scam_alerts").update({ status: b.dataset.act }).eq("id", id);
      ui().toast(err ? "Erreur" : b.dataset.act === "approved" ? "Alerte publiée ✓" : "Alerte refusée");
      if (!err) b.closest(".mod-item").remove();
    }));
  });
})(window.MG);
