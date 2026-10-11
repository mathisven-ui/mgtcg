/* ==========================================================
   MGTCG — assistant.js   (V3)
   Assistant malin gratuit : ce n'est pas une IA, il reconnaît les
   questions fréquentes et répond avec les données du site et de
   ta collection. Tout se passe dans le navigateur : rien n'est
   envoyé à un service d'IA.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const enc = encodeURIComponent;
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
  const has = (t, words) => words.some((w) => new RegExp("(^|\\s)" + w + "(\\s|$)").test(t) || (w.length > 5 && t.includes(w)));
  const S = { msgs: [] };
  const EXAMPLES = ["Combien vaut ma collection ?", "Prix de Dracaufeu ex", "Il me manque quoi pour finir mon set ?", "C'est une arnaque si on me demande PayPal entre amis ?", "C'est quand la prochaine sortie ?", "Je veux vendre des cartes", "Ça vaut le coup de faire grader ?", "Comment échanger mes doubles ?"];
  const STOP = ["prix", "cote", "combien", "vaut", "valent", "valeur", "coute", "coutent", "de", "du", "des", "la", "le", "les", "l", "d", "un", "une", "carte", "cartes", "quel", "quelle", "quels", "est", "c'est", "ce", "ca", "en", "a", "au", "pour", "sur", "moi", "ma", "mon", "svp", "stp", "s'il", "te", "plait", "the", "price", "pokemon", "aujourd'hui", "actuellement", "argus", "of", "how", "much", "is", "what", "card", "cards", "cost", "worth", "value", "does", "price"];

  /* ---------------- Réponses ---------------- */
  const link = (href, txt) => `<a class="accent-link" href="${href}">${txt}</a>`;
  const chips = (list) => `<div class="as-chips">${list.map((q) => `<button class="chip as-q" data-q="${ui().esc(q)}">${ui().esc(q)}</button>`).join("")}</div>`;

  function aCollection() {
    const { eur, esc } = ui();
    const st = MG.store;
    const keys = st.ownedKeys();
    if (!keys.length) return `Ta collection est vide pour l'instant. Ajoute des cartes en cliquant sur le <b>+</b> dans une extension, ou ${link("#/importer", "importe ta collection")} depuis une autre appli.`;
    const top = keys.map((k) => ({ k, v: st.valueOf(k), m: st.meta(k) || {} })).sort((a, b) => b.v - a.v).slice(0, 3);
    const total = st.totalValue();
    const s = MG.profils ? MG.profils.stats() : null;
    return `Ta collection compte <b>${keys.length} cartes</b> pour une valeur estimée de <b>${eur(total)}</b> (prix Cardmarket).${s ? ` Tu as complété <b>${s.setsDone}</b> set${s.setsDone > 1 ? "s" : ""}.` : ""}
      ${top[0] && top[0].v ? `<br>Tes cartes les plus chères : ${top.filter((t) => t.v).map((t) => `<b>${esc(t.m.name || t.k)}</b> (${eur(t.v)})`).join(", ")}.` : ""}
      <br>👉 Plus de détails dans ${link("#/portefeuille", "💼 Mon portefeuille")} (répartition, plus-values, simulations).`;
  }

  async function aPrice(text) {
    const { eur, esc } = ui();
    const words = norm(text).split(" ").filter((w) => w && !STOP.includes(w));
    const q = words.join(" ").trim();
    if (q.length < 2) return `De quelle carte veux-tu le prix ? Écris par exemple « prix de Pikachu ».`;
    const lang = MG.store.lang;
    let res = [];
    try { res = (await MG.api.search(lang, q)) || []; } catch (e) { res = []; }
    if (!res.length) return null;
    const exact = res.filter((c) => norm(c.name) === q);
    const pick = (exact.length ? exact : res).slice(0, 4);
    const full = await Promise.all(pick.map((c) => MG.api.card(lang, c.id).catch(() => null)));
    const rows = full.filter(Boolean).map((c) => { const cm = c.cardmarket || {}; return { c, p: cm.trend || cm.avg || cm["trend-holo"] || 0 }; }).sort((a, b) => b.p - a.p);
    return `Voici ${rows.length > 1 ? "les versions les plus connues" : "la carte"} de « ${esc(pick[0].name)} »${res.length > pick.length ? ` (${res.length} cartes portent ce nom)` : ""} :
      <ul class="as-cards">${rows.map((r) => `<li><button class="link-btn as-card" data-l="${esc(lang)}" data-id="${esc(r.c.id)}"><b>${esc(r.c.name)}</b> <span class="muted small">${esc(r.c.set ? r.c.set.name : "")} #${esc(r.c.localId)}</span></button> <b class="as-p">${r.p ? eur(r.p) : "pas de prix"}</b></li>`).join("")}</ul>
      Prix Cardmarket indicatifs (carte non gradée). ${link("#/recherche/" + enc(q), "Voir toutes les cartes « " + esc(q) + " »")}`;
  }

  function aMissing(text) {
    const { esc } = ui();
    const s = MG.profils ? MG.profils.stats() : null;
    const sets = s ? s.sets.filter((g) => g.total) : [];
    if (!sets.length) return `Tu n'as encore commencé aucun set. Ouvre une extension depuis ${link("#/", "Séries")} et coche tes cartes : je pourrai ensuite te dire ce qu'il te manque.`;
    const t = norm(text);
    const found = sets.filter((g) => norm(g.name).length >= 3 && t.includes(norm(g.name))).sort((a, b) => b.name.length - a.name.length)[0];
    if (!found) {
      const close = sets.slice().sort((a, b) => b.n / b.total - a.n / a.total).slice(0, 4);
      return `Pour quel set ? Voici ceux que tu as le plus avancés :<ul class="as-cards">${close.map((g) => `<li>${link(`#/completer/${enc(g.setId)}/${enc(g.lang)}`, `<b>${esc(g.name)}</b>`)} <span class="muted small">${g.n} / ${g.total} · il en manque ${Math.max(0, g.total - g.n)}</span></li>`).join("")}</ul>Clique sur un set pour voir la liste d'achat, de la carte la moins chère à la plus chère.`;
    }
    const miss = Math.max(0, found.total - found.n);
    return miss ? `Dans <b>${esc(found.name)}</b>, tu as <b>${found.n} / ${found.total}</b> cartes : il t'en manque <b>${miss}</b>.<br>👉 ${link(`#/completer/${enc(found.setId)}/${enc(found.lang)}`, "🎯 Voir la liste d'achat au meilleur prix")} (coût total, budget, astuces).`
      : `🎉 Bravo, ton set <b>${esc(found.name)}</b> est complet ! Prochain défi : le master set (toutes les versions) dans ${link(`#/completer/${enc(found.setId)}/${enc(found.lang)}`, "🎯 Compléter")}.`;
  }

  function aScam(t) {
    let specific = "";
    if (has(t, ["entre amis", "entre proches", "proches", "amis"])) specific = "⚠️ PayPal « entre proches / amis » n'offre <b>aucune protection</b> : si rien n'arrive, l'argent est perdu. Demande « biens et services » ou paie dans l'appli.";
    else if (has(t, ["crypto", "bitcoin", "pcs", "transcash", "carte cadeau", "coupon"])) specific = "🚨 Paiement en crypto, coupons PCS / Transcash ou cartes cadeaux : c'est <b>toujours une arnaque</b>.";
    else if (has(t, ["lien", "whatsapp", "sms", "mail", "email"])) specific = "🚨 Un lien reçu par message pour « payer » ou « recevoir l'argent » sert à voler ta carte bancaire. Ne clique pas, reste dans l'appli.";
    else if (has(t, ["faux", "fausse", "contrefacon", "fake", "vraie"])) specific = "Pour repérer une fausse carte : compare avec une vraie de la même extension (taille, couleurs, police, holo), et méfie-toi d'un prix trop bas.";
    else if (has(t, ["gradee", "psa", "boitier", "certificat"])) specific = "Carte gradée : tape toujours le numéro du certificat sur le site officiel du gradeur, la carte et la note doivent correspondre.";
    return `${specific ? specific + "<br>" : ""}Les bons réflexes : reste dans l'appli (messages et paiement), demande une photo avec ton pseudo écrit à côté, et méfie-toi d'un prix bien plus bas que la cote.<br>👉 ${link("#/bouclier", "🛡️ Vérifie l'annonce avec le bouclier anti-arnaques")} : il te donne un niveau de risque expliqué.`;
  }

  async function aAgenda() {
    const { esc, fmtDate } = ui();
    const a = MG.auth;
    let ev = [];
    if (a && a.enabled) {
      const { data } = await a.client.from("events").select("kind,title,start_date,city").eq("status", "approved").gte("start_date", new Date().toISOString().slice(0, 10)).order("start_date", { ascending: true }).limit(40);
      ev = (data || []).sort((x, y) => (x.start_date < y.start_date ? -1 : 1));
    }
    const sorties = ev.filter((e) => ["sortie", "avant-premiere"].includes(e.kind)).slice(0, 3);
    const conv = ev.filter((e) => ["convention", "tournoi"].includes(e.kind)).slice(0, 3);
    const li = (e) => `<li><b>${esc(fmtDate(e.start_date))}</b> · ${esc(e.title)}${e.city ? ` <span class="muted small">(${esc(e.city)})</span>` : ""}</li>`;
    if (!sorties.length && !conv.length) return `Toutes les dates sont dans ${link("#/agenda", "📅 l'Agenda")} (sorties, avant-premières, conventions).`;
    return `${sorties.length ? `Les prochaines sorties :<ul class="as-cards">${sorties.map(li).join("")}</ul>` : ""}${conv.length ? `Les prochains événements :<ul class="as-cards">${conv.map(li).join("")}</ul>` : ""}👉 Tout le calendrier, avec la carte et le trajet : ${link("#/agenda", "📅 Agenda")}.`;
  }

  function aBadges() {
    if (!MG.profils) return `Tes badges sont dans ${link("#/profil", "🏅 Mon profil")}.`;
    const s = MG.profils.stats();
    const got = MG.profils.earned(s);
    const next = MG.profils.BADGES.filter((b) => !got.includes(b)).map((b) => ({ b, p: Math.min(1, (s[b.field] || 0) / b.target) })).sort((x, y) => y.p - x.p)[0];
    return `Tu as <b>${got.length} badge${got.length > 1 ? "s" : ""}</b> sur ${MG.profils.BADGES.length}.${next ? ` Le plus proche : ${next.b.icon} <b>${ui().esc(next.b.name)}</b> (${ui().esc(next.b.desc)}, ${Math.round(next.p * 100)} %).` : " Tu les as tous, bravo !"}<br>👉 ${link("#/profil", "🏅 Mon profil, mes badges et mes objectifs")}`;
  }

  const INTENTS = [
    { test: (t) => has(t, ["bonjour", "salut", "coucou", "hello", "aide", "help", "que sais tu faire", "tu sers a quoi", "hi", "hey", "what can you do"]) && t.split(" ").length < 6,
      run: () => `Salut ! 👋 Je suis l'assistant de MGTCG. Je réponds aux questions fréquentes avec les données du site et de ta collection. Essaie par exemple :${chips(EXAMPLES.slice(0, 6))}` },
    { test: (t) => has(t, ["arnaque", "arnaquer", "escroc", "escroquerie", "fiable", "entre amis", "entre proches", "faux", "fausse", "contrefacon", "fake", "suspect", "louche", "scam", "scammer", "friends and family", "suspicious", "legit"]), run: (t) => aScam(t) },
    { test: (t) => has(t, ["manque", "manquent", "manquantes", "completer", "finir", "terminer", "master set", "missing", "complete", "finish"]), run: (t, raw) => aMissing(raw) },
    { test: (t) => has(t, ["ma collection", "mon classeur", "mes cartes", "my collection", "my cards"]) && has(t, ["vaut", "valeur", "combien", "estimation", "prix", "valent", "worth", "value", "how much"]), run: () => aCollection() },
    { test: (t) => has(t, ["sortie", "sorties", "sort quand", "prochaine extension", "prochain set", "agenda", "convention", "conventions", "salon", "avant premiere", "avant premieres", "tournoi", "evenement", "release", "releases", "next set", "event", "events", "tournament"]), run: () => aAgenda() },
    { test: (t) => has(t, ["grader", "grade", "gradee", "grading", "graded", "psa", "pca", "ccc", "cgc"]),
      run: () => `Faire grader une carte coûte en général entre une dizaine et plusieurs dizaines d'euros (plus le port) selon la société et la valeur. Ça vaut le coup surtout pour une carte chère en très bon état.<br>👉 ${link("#/outils/grading", "🏅 Faire grader : rentable ?")} calcule le gain ou la perte selon la note espérée.` },
    { test: (t) => has(t, ["vendre", "revendre", "vente", "frais", "commission", "sell", "selling", "fees", "fee"]),
      run: () => `Frais pour un particulier en France (vérifiés en octobre 2026) : <b>Cardmarket</b> 5 % + 0,01 € par carte, <b>eBay</b> 0 % depuis le 1er septembre 2026, <b>Vinted / Leboncoin</b> 0 % pour le vendeur.<br>👉 ${link("#/portefeuille/vente", "💸 Simule ta vente")} pour savoir combien tu récupères, et note tes ventes dans ${link("#/outils/ventes", "💶 Mes ventes")}.` },
    { test: (t) => has(t, ["echange", "echanger", "echanges", "doubles", "troc", "trade", "trading", "swap", "duplicates"]),
      run: () => `Pour échanger : mets tes doubles « à échanger », ta wishlist sert de liste de recherche, et MGTCG trouve les membres compatibles. Les rendez-vous se font uniquement en lieu public (boutique ou convention), sans messagerie ni coordonnées.<br>👉 ${link("#/echanges", "🔄 Échanges entre membres")}` },
    { test: (t) => has(t, ["boutique", "boutiques", "magasin", "magasins", "ou acheter", "pres de chez moi", "restock", "restocks", "shop", "shops", "store", "stores", "near me", "where to buy"]),
      run: () => `La ${link("#/boutiques", "🗺️ carte des boutiques")} montre les boutiques spécialisées (en bleu) et les grandes enseignes (en rouge) près de chez toi, avec le trajet, son coût et les restocks signalés par les membres.` },
    { test: (t) => has(t, ["badge", "badges", "objectif", "objectifs", "classement", "niveau", "goal", "goals", "ranking"]), run: () => aBadges() },
    { test: (t) => has(t, ["importer", "import", "excel", "csv", "autre appli", "tableur", "spreadsheet"]),
      run: () => `Tu peux importer ta collection depuis un fichier CSV ou Excel (ou un tableau copié-collé) : MGTCG devine les colonnes et retrouve tes cartes.<br>👉 ${link("#/importer", "📥 Importer ma collection")}` },
    { test: (t) => has(t, ["installer", "application", "appli", "hors ligne", "telephone", "ecran d'accueil", "install", "app", "offline", "phone"]),
      run: () => `MGTCG s'installe comme une appli, gratuitement, et marche même sans réseau pour ta collection. <button class="link-btn accent-link" data-install>📱 Voir comment l'installer</button>` },
    { test: (t) => has(t, ["dollar", "dollars", "devise", "livre", "yen", "monnaie", "currency", "pound"]),
      run: () => `Choisis ta devise dans le petit menu à côté de la langue, en haut (€, $, £, CHF, CA$, ¥). Les prix sont convertis avec le taux du jour de la Banque centrale européenne.` },
    { test: (t) => has(t, ["taux", "drop", "chance", "chances", "pull", "pulls", "odds", "pull rate"]),
      run: () => `Les taux de drop sont estimés à partir des ouvertures déclarées par les membres, sur la page de chaque extension (bloc « 🎲 Taux de drop de la communauté »). Plus il y a d'ouvertures déclarées, plus c'est fiable. Ouvre une extension depuis ${link("#/", "Séries")}.` },
    { test: (t) => has(t, ["passeport", "etat", "defaut", "defauts", "photo", "photos", "rangement", "passport", "condition"]),
      run: () => `Le passeport d'une carte sert à noter son état, ses défauts, son certificat de grading, sa provenance et à ajouter tes photos.<br>👉 ${link("#/passeport", "🛂 Mes passeports")}` },
    { test: (t) => has(t, ["avis", "note", "communaute", "review", "reviews", "community"]),
      run: () => `Les avis des membres sur les boutiques et les produits sont dans ${link("#/communaute", "💬 Communauté")}. Pour donner le tien, ouvre une boutique sur la carte ou un produit dans les Scellés.` },
  ];

  async function answer(raw) {
    const t = norm(raw);
    if (!t) return "";
    for (const it of INTENTS) if (it.test(t)) return it.run(t, raw);
    // Une question de prix, ou juste un nom de carte
    if (has(t, ["prix", "cote", "combien", "vaut", "valent", "coute", "argus", "price", "cost", "worth", "value"]) || t.split(" ").length <= 4) {
      const r = await aPrice(raw);
      if (r) return r;
    }
    return `Je n'ai pas compris 😅 Je suis un assistant simple (pas une IA) : je connais les questions fréquentes sur MGTCG. Essaie une de celles-ci, ou ${link("#/recherche/" + enc(raw.slice(0, 60)), "cherche une carte")} :${chips(EXAMPLES)}`;
  }

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.assistant = function () {
    const { view } = ui();
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🤖 Assistant MGTCG</h1>
        <p class="muted">Pose ta question avec tes mots. Je réponds aux questions fréquentes avec les données du site et de ta collection. Ce n'est pas une IA : tout reste dans ton navigateur.</p>
      </div></header>
      <section class="as-chat tool-card">
        <div id="as-log" class="as-log" aria-live="polite"></div>
        <form id="as-form" class="as-form"><input name="q" maxlength="200" autocomplete="off" placeholder="ex : combien vaut ma collection ?" aria-label="Ta question"><button class="btn" type="submit">Envoyer</button></form>
      </section>`;
    if (!S.msgs.length) S.msgs.push({ who: "bot", html: `Salut ! 👋 Que veux-tu savoir ?${chips(EXAMPLES)}` });
    draw();
    const form = document.getElementById("as-form");
    form.addEventListener("submit", (e) => { e.preventDefault(); ask(form.q.value); form.q.value = ""; });
    form.q.focus();
  };

  async function ask(q) {
    q = String(q || "").trim().slice(0, 200);
    if (!q) return;
    S.msgs.push({ who: "me", html: ui().esc(q) });
    S.msgs.push({ who: "bot", html: "…", wait: true });
    draw();
    let html;
    try { html = await answer(q); } catch (e) { html = "Oups, je n'ai pas pu répondre (problème de connexion ?). Réessaie dans un instant."; }
    S.msgs = S.msgs.filter((m) => !m.wait).concat({ who: "bot", html });
    if (S.msgs.length > 60) S.msgs = S.msgs.slice(-60);
    draw();
  }

  function draw() {
    const log = document.getElementById("as-log");
    if (!log) return;
    log.innerHTML = S.msgs.map((m) => `<div class="as-msg ${m.who}"${m.who === "me" ? ' translate="no"' : ""}>${m.html}</div>`).join("");
    log.scrollTop = log.scrollHeight;
    log.querySelectorAll(".as-q").forEach((b) => b.addEventListener("click", () => ask(b.dataset.q)));
    log.querySelectorAll(".as-card").forEach((b) => b.addEventListener("click", () => ui().openCard(b.dataset.l, b.dataset.id)));
    log.querySelectorAll("[data-install]").forEach((b) => b.addEventListener("click", () => MG.installApp && MG.installApp()));
  }

  /* ---------------- Bouton flottant ---------------- */
  function mountFab() {
    if (document.getElementById("as-fab")) return;
    const a = document.createElement("a");
    a.id = "as-fab"; a.className = "as-fab"; a.href = "#/assistant"; a.title = "Assistant MGTCG"; a.setAttribute("aria-label", "Ouvrir l'assistant");
    a.textContent = "🤖";
    document.body.appendChild(a);
    const sync = () => { a.hidden = location.hash.startsWith("#/assistant"); };
    window.addEventListener("hashchange", sync); sync();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountFab); else mountFab();

  MG.assistant = { answer, norm };
})(window.MG);
