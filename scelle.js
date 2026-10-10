/* ==========================================================
   MGTCG — scelle.js   (V2)
   Produits scellés : catalogue (ETB, UPC, displays, coffrets…),
   cote communautaire à partir des prix signalés par les membres,
   évolution par rapport au prix de sortie, produits possédés
   et plus-values.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const TYPES = ["ETB", "Display", "UPC", "Coffret", "Collection premium", "Pokébox", "Tripack", "Blister", "Mini-tin", "Booster", "Autre"];
  const SOURCES = ["Cardmarket", "Boutique", "Grande enseigne", "eBay", "Vinted", "Leboncoin", "Autre"];
  const LANGS = { fr: "🇫🇷 FR", en: "🇬🇧 EN", ja: "🇯🇵 JP", zh: "🇨🇳 CN", ko: "🇰🇷 KR", autre: "Autre" };
  const C_LINE = "#b88a00";
  const WINDOW_DAYS = 30; // la cote = médiane des prix signalés sur 30 jours

  const S = { products: [], prices: new Map(), filter: "all", lang: "fr", q: "", loaded: false };

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const eur = (n) => (typeof n === "number" && isFinite(n) ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "—");
  const fmtDay = (d) => { try { return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return d; } };
  const median = (arr) => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  /* ---------------- Données ---------------- */
  async function load(force) {
    const a = auth();
    if (!a || !a.enabled) return false;
    if (S.loaded && !force) return true;
    const since = new Date(Date.now() - 365 * 86400000).toISOString();
    const [{ data: products, error: e1 }, { data: prices }] = await Promise.all([
      a.client.from("products").select("id,name,type,lang,serie,set_name,release_date,msrp,content,status,created_by").order("release_date", { ascending: false, nullsFirst: false }).limit(1000),
      a.client.from("product_prices").select("id,product_id,price,source,user_id,created_at").gte("created_at", since).order("created_at", { ascending: true }).limit(10000),
    ]);
    if (e1) return false;
    S.products = (products || []).map((p) => Object.assign(p, { msrp: p.msrp != null ? Number(p.msrp) : null }));
    S.prices = new Map();
    for (const r of prices || []) {
      r.price = Number(r.price);
      if (!S.prices.has(r.product_id)) S.prices.set(r.product_id, []);
      S.prices.get(r.product_id).push(r);
    }
    S.loaded = true;
    return true;
  }

  // Cote = médiane des prix signalés ces 30 derniers jours (sinon : 90 jours)
  function cote(id) {
    const list = S.prices.get(id) || [];
    for (const days of [WINDOW_DAYS, 90]) {
      const from = Date.now() - days * 86400000;
      const recent = list.filter((r) => new Date(r.created_at).getTime() >= from).map((r) => r.price);
      if (recent.length) return { value: median(recent), n: recent.length, days };
    }
    return null;
  }
  MG.scelle = { cote: (id) => (S.loaded ? cote(id) : null), load };

  /* ---------------- Page « Scellés » : séries → extensions → items ---------------- */
  // Items classiques d'une extension (tous n'existent pas pour toutes les extensions :
  // les boutons lancent une recherche, ils ne promettent pas que le produit existe)
  const SET_ITEMS = [
    { type: "Booster", icon: "🃏", label: "Booster", desc: "Le paquet de cartes à l'unité.", q: "booster" },
    { type: "Blister", icon: "🎁", label: "Blister", desc: "1 à 3 boosters + souvent une carte promo.", q: "blister" },
    { type: "Tripack", icon: "📚", label: "Tripack", desc: "3 boosters + une carte promo.", q: "tripack" },
    { type: "ETB", icon: "🧰", label: "ETB (Coffret Dresseur d'Élite)", desc: "Boosters, protège-cartes, dés, marqueurs, carte promo.", q: "ETB" },
    { type: "Display", icon: "📦", label: "Display", desc: "La boîte complète de boosters (souvent 36 en FR).", q: "display" },
    { type: "Coffret", icon: "🎀", label: "Coffrets", desc: "Coffrets collection, coffrets ex, coffrets premium…", q: "coffret" },
    { type: "UPC", icon: "💎", label: "UPC (Ultra Premium Collection)", desc: "Le gros coffret haut de gamme (pas pour toutes les extensions).", q: "UPC ultra premium" },
    { type: "Pokébox", icon: "🥫", label: "Pokébox & mini-tins", desc: "Boîtes en métal avec boosters.", q: "pokebox mini tin" },
  ];
  const EXTRAS = [
    { v: "Peluches", icon: "🧸", label: "Peluches", desc: "Peluches des Pokémon de la série.", q: "peluche" },
    { v: "Classeur", icon: "📒", label: "Classeurs & portfolios", desc: "Pour ranger ta collection.", q: "classeur portfolio" },
    { v: "Protège-cartes", icon: "🛡️", label: "Protège-cartes", desc: "Sleeves aux couleurs de la série.", q: "protège cartes sleeves" },
    { v: "Figurines", icon: "🗿", label: "Figurines", desc: "Figurines et objets de collection.", q: "figurine" },
  ];
  const LANG_WORD = { fr: "FR", en: "anglais", ja: "japonais", "zh-tw": "chinois", "zh-cn": "chinois", ko: "coréen" };

  function searchLinks(query, cmQuery) {
    const q = encodeURIComponent(query);
    return `<div class="buy-links">
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.ebay.fr/sch/i.html?_nkw=${q}">eBay</a>
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.leboncoin.fr/recherche?text=${q}">Leboncoin</a>
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.vinted.fr/catalog?search_text=${q}">Vinted</a>
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(cmQuery || query)}">Cardmarket</a>
    </div>`;
  }

  const R = (MG.routes = MG.routes || {});
  R.scelles = async function (arg) {
    const [kind, id] = String(arg || "").split("/");
    if (kind === "serie" && id) return pageSerie(decodeURIComponent(id));
    if (kind === "set" && id) return pageSetItems(decodeURIComponent(id));
    return pageSeries();
  };

  // 1) Toutes les séries
  async function pageSeries() {
    const { view, loading, esc } = ui();
    const lang = MG.store.lang;
    view().innerHTML = loading("Chargement des séries…");
    let series;
    try { series = (await MG.api.series(lang)).slice().reverse(); }
    catch (e) { view().innerHTML = `<div class="state"><p>😕 Impossible de charger les séries. Vérifie ta connexion.</p></div>`; return; }
    series = series.filter((x) => !/pocket/i.test(x.name + " " + x.id)); // pas les cartes du jeu mobile
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>📦 Produits scellés</h1>
        <p class="muted">Choisis une série, puis une extension : tu verras tous les produits (boosters, ETB, displays, UPC, coffrets, peluches, classeurs…) avec des liens pour les trouver sur eBay, Leboncoin, Vinted ou Cardmarket.</p>
      </div></header>
      <div class="serie-grid">${series.map((x) => `
        <a class="serie" href="#/scelles/serie/${encodeURIComponent(x.id)}">
          ${MG.logoImg(x.logo) ? `<img src="${esc(MG.logoImg(x.logo))}" alt="" loading="lazy">` : `<span class="serie-ph">${esc(x.name.slice(0, 2))}</span>`}
          <span>${esc(x.name)}</span>
        </a>`).join("")}</div>
      <p class="disclaimer">La langue des produits suit la langue choisie en haut à droite. MGTCG ne vend rien et ne touche aucune commission : les boutons ouvrent une recherche sur les sites d'achat.</p>`;
  }

  // 2) Les extensions d'une série
  async function pageSerie(id) {
    const { view, loading, esc } = ui();
    const lang = MG.store.lang;
    view().innerHTML = loading("Chargement de la série…");
    let serie;
    try { serie = await MG.api.serie(lang, id); }
    catch (e) { view().innerHTML = `<div class="state"><p>😕 Série introuvable dans cette langue.</p><a class="btn" href="#/scelles">Retour</a></div>`; return; }
    const sets = (serie.sets || []).slice().reverse();
    const q = "pokemon " + serie.name + " " + (LANG_WORD[lang] || "");
    view().innerHTML = `
      <nav class="crumbs"><a href="#/scelles">Produits scellés</a> › <span>${esc(serie.name)}</span></nav>
      <header class="page-head">
        ${MG.logoImg(serie.logo) ? `<img class="page-logo" src="${esc(MG.logoImg(serie.logo))}" alt="">` : ""}
        <div><h1>${esc(serie.name)}</h1><p class="muted">${sets.length} extensions · clique sur une extension pour voir ses produits</p></div>
      </header>
      <div class="set-grid">${sets.map((x) => `
        <a class="set-card" href="#/scelles/set/${encodeURIComponent(x.id)}">
          <div class="set-logo">${MG.logoImg(x.logo) ? `<img src="${esc(MG.logoImg(x.logo))}" alt="" loading="lazy">` : `<span>${esc(x.name)}</span>`}</div>
          <div class="set-card-top"><strong>${esc(x.name)}</strong>${MG.logoImg(x.symbol) ? `<img class="sym" src="${esc(MG.logoImg(x.symbol))}" alt="" loading="lazy">` : ""}</div>
          <span class="muted small">Voir les produits →</span>
        </a>`).join("")}</div>
      <section>
        <h2>🧸 Produits dérivés de la série</h2>
        <div class="item-grid">${EXTRAS.map((it) => itemCard(it, q + " " + it.q, "pokemon " + serie.name, "", MG.logoImg(serie.logo))).join("")}</div>
      </section>`;
  }

  function itemCard(it, query, cmQuery, extra, logoUrl, realUrl) {
    const { esc } = ui();
    return `<div class="item-card">
      ${MG.visuel ? MG.visuel(it.v || it.type || "Autre", logoUrl, realUrl, it.label) : ""}
      <div class="ic-head"><div><b>${esc(it.label)}</b><small class="muted">${esc(it.desc)}</small></div></div>
      ${extra || ""}
      ${searchLinks(query, cmQuery)}
    </div>`;
  }

  // 3) Les items d'une extension
  async function pageSetItems(id) {
    const { view, loading, esc, fmtDate } = ui();
    const lang = MG.store.lang;
    view().innerHTML = loading("Chargement de l'extension…");
    let set;
    try { set = await MG.api.set(lang, id); }
    catch (e) { view().innerHTML = `<div class="state"><p>😕 Extension introuvable dans cette langue.</p><a class="btn" href="#/scelles">Retour</a></div>`; return; }
    // Produits déjà répertoriés (prix estimé) si la base est active
    const a = auth();
    let known = [];
    if (a && a.enabled && await load()) {
      const norm = (x) => String(x || "").toLowerCase().trim();
      const pLang = LANG_OF[lang] || "autre";
      known = S.products.filter((p) => p.status === "approved" && p.lang === pLang && norm(p.set_name) === norm(set.name));
    }
    const base = "pokemon " + set.name + " " + (LANG_WORD[lang] || "");
    const priceBox = (type) => {
      const p = known.find((x) => x.type === type || (type === "Pokébox" && x.type === "Mini-tin"));
      if (!p) return "";
      const e = estimate(p);
      return `<button class="ic-price" data-open="${esc(p.id)}">
        <span>${e ? esc(e.label) : "Prix estimé"}</span><strong>${e ? eur(e.value) : "—"}</strong><small class="muted">voir le détail →</small></button>`;
    };
    const setLogo = MG.logoImg(set.logo);
    const boosterArt = (set.boosters || []).map((b) => b && b.artwork_front).find((u) => MG.logoImg(u));
    const boosterReal = boosterArt ? MG.logoImg(boosterArt) : "";
    const others = known.filter((p) => !SET_ITEMS.some((it) => it.type === p.type || (it.type === "Pokébox" && p.type === "Mini-tin")));
    const serieId = set.serie && set.serie.id;
    view().innerHTML = `
      <nav class="crumbs"><a href="#/scelles">Produits scellés</a> › ${serieId ? `<a href="#/scelles/serie/${encodeURIComponent(serieId)}">${esc(set.serie.name)}</a> › ` : ""}<span>${esc(set.name)}</span></nav>
      <header class="page-head set-head">
        ${MG.logoImg(set.logo) ? `<img class="page-logo" src="${esc(MG.logoImg(set.logo))}" alt="">` : ""}
        <div class="grow"><h1>${esc(set.name)}</h1>
          <p class="muted">${set.releaseDate ? "Sortie le " + esc(fmtDate(set.releaseDate)) + " · " : ""}<a href="#/set/${encodeURIComponent(set.id)}">Voir les cartes de l'extension</a></p></div>
      </header>

      <section style="margin-top:8px">
        <h2>Produits de l'extension</h2>
        <div class="item-grid">${SET_ITEMS.map((it) => itemCard(it, base + " " + it.q, it.q.split(" ")[0] + " " + set.name, priceBox(it.type), setLogo, it.type === "Booster" ? boosterReal : "")).join("")}
          ${others.map((p) => itemCard({ v: p.type, label: p.name, desc: p.content || p.type }, "pokemon " + p.name, p.name,
            `<button class="ic-price" data-open="${esc(p.id)}"><span>${estimate(p) ? esc(estimate(p).label) : "Prix estimé"}</span><strong>${estimate(p) ? eur(estimate(p).value) : "—"}</strong><small class="muted">voir le détail →</small></button>`)).join("")}
        </div>
        <p class="muted small">Tous les produits n'existent pas pour chaque extension (par exemple, peu d'extensions ont un UPC). Les boutons lancent une recherche sur chaque site.</p>
      </section>

      <section>
        <h2>🧸 Produits dérivés</h2>
        <div class="item-grid">${EXTRAS.map((it) => itemCard(it, base + " " + it.q, "pokemon " + set.name, "", setLogo)).join("")}</div>
      </section>
      <p class="disclaimer">Prix estimé (quand il est affiché) : prix constatés par les membres sur 30 jours, sinon prix de sortie. MGTCG ne vend rien et ne touche aucune commission. 🛡 Pour le scellé, méfie-toi des films refaits (« reseal ») : achète à des vendeurs bien notés.</p>`;
    bindCards(view());
  }

  // Prix estimé : prix constatés par les membres, sinon prix de sortie
  function estimate(p) {
    const c = cote(p.id);
    if (c) return { value: c.value, label: "Prix estimé", hint: c.n + " prix constaté" + (c.n > 1 ? "s" : "") };
    if (p.msrp) return { value: p.msrp, label: "Prix de sortie", hint: "prix conseillé à la sortie" };
    return null;
  }

  // Liens de recherche pré-remplis vers les sites d'achat
  function buyLinks(p) {
    const words = { fr: "", en: "anglais", ja: "japonais", zh: "chinois", ko: "coréen" };
    const q = encodeURIComponent(("pokemon " + p.name + " " + (words[p.lang] || "")).trim());
    const cm = encodeURIComponent(p.name);
    return `<div class="buy-links">
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.ebay.fr/sch/i.html?_nkw=${q}">eBay</a>
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.leboncoin.fr/recherche?text=${q}">Leboncoin</a>
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.vinted.fr/catalog?search_text=${q}">Vinted</a>
      <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${cm}">Cardmarket</a>
    </div>`;
  }

  function cardHTML(p) {
    const { esc } = ui();
    const e = estimate(p);
    const c = cote(p.id);
    const evo = c && p.msrp ? ((c.value - p.msrp) / p.msrp) * 100 : null;
    return `<div class="sealed-card" data-id="${esc(p.id)}">
      <button class="sc-open" data-open="${esc(p.id)}" aria-label="Voir ${esc(p.name)}">
        <div class="sc-top"><span class="sc-type">${esc(p.type)}</span><span class="muted small">${LANGS[p.lang] || ""}</span></div>
        <b class="sc-name">${esc(p.name)}</b>
        ${p.content ? `<span class="muted small">${esc(p.content)}</span>` : ""}
        <div class="sc-est">
          <span>${e ? esc(e.label) : "Prix estimé"}</span>
          <strong>${e ? eur(e.value) : "—"}</strong>
          <small class="muted">${e ? esc(e.hint) : "pas encore de prix : regarde les annonces"}${evo != null ? ` · <span class="${evo >= 0 ? "up" : "down"}">${evo >= 0 ? "▲ +" : "▼ "}${evo.toFixed(0)} % depuis la sortie</span>` : ""}</small>
        </div>
      </button>
      ${buyLinks(p)}
    </div>`;
  }

  function bindCards(root) {
    root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openProduct(b.dataset.open)));
  }

  const TYPE_ORDER = ["Booster", "Blister", "Tripack", "ETB", "Display", "Coffret", "Pokébox", "Mini-tin", "UPC", "Collection premium", "Autre"];
  const byType = (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || a.name.localeCompare(b.name);

  function renderGrid(grid) {
    const { esc } = ui();
    let list = S.products.filter((p) => p.status === "approved");
    if (S.lang !== "all") list = list.filter((p) => p.lang === S.lang);
    if (S.filter !== "all") list = list.filter((p) => p.type === S.filter);
    if (S.q) list = list.filter((p) => (p.name + " " + (p.set_name || "") + " " + (p.serie || "")).toLowerCase().includes(S.q));

    if (!list.length) {
      grid.innerHTML = `<div class="state"><p>${S.products.length ? "Aucun produit ne correspond à ta recherche." : "Le catalogue est encore vide."}</p>
        <p class="muted small">Il manque un produit ? Propose-le avec « ＋ Proposer un produit manquant ».</p></div>`;
      return;
    }
    // Regroupe : série → extension (de la plus récente à la plus ancienne)
    const series = new Map();
    for (const p of list) {
      const sk = p.serie || "Autres produits";
      const ek = p.set_name || "Hors extension";
      if (!series.has(sk)) series.set(sk, new Map());
      const sets = series.get(sk);
      if (!sets.has(ek)) sets.set(ek, []);
      sets.get(ek).push(p);
    }
    const newest = (arr) => arr.reduce((m, p) => (p.release_date && p.release_date > m ? p.release_date : m), "");
    const serieList = [...series.entries()].sort((a, b) => (newest([...b[1].values()].flat()) > newest([...a[1].values()].flat()) ? 1 : -1));
    const open = S.q || S.filter !== "all" || serieList.length <= 2;
    grid.innerHTML = serieList.map(([serie, sets], i) => {
      const setList = [...sets.entries()].sort((a, b) => (newest(b[1]) > newest(a[1]) ? 1 : -1));
      const count = setList.reduce((t, [, l]) => t + l.length, 0);
      return `<details class="serie-block" ${open || i === 0 ? "open" : ""}>
        <summary><span class="sb-title">${esc(serie)}</span><span class="muted small">${setList.length} extension${setList.length > 1 ? "s" : ""} · ${count} produit${count > 1 ? "s" : ""}</span></summary>
        ${setList.map(([setName, prods]) => {
          const d = newest(prods);
          return `<div class="set-block">
            <h3>${esc(setName)}${d ? `<span class="muted small"> · sortie le ${esc(fmtDay(d))}</span>` : ""}</h3>
            <div class="sealed-grid">${prods.sort(byType).map(cardHTML).join("")}</div>
          </div>`;
        }).join("")}
      </details>`;
    }).join("");
    bindCards(grid);
  }

  /* ---------------- Bloc « produits de cette extension » (page d'un set) ---------------- */
  const LANG_OF = { fr: "fr", en: "en", ja: "ja", "zh-tw": "zh", "zh-cn": "zh", ko: "ko" };
  async function mountSet(el, setName, cardLang, setId) {
    if (!el) return;
    const { esc } = ui();
    const a = auth();
    const pLang = LANG_OF[cardLang] || "autre";
    let prods = [];
    if (a && a.enabled && await load()) {
      const norm = (x) => String(x || "").toLowerCase().trim();
      prods = S.products.filter((p) => p.status === "approved" && p.lang === pLang && norm(p.set_name) === norm(setName)).sort(byType);
    }
    const link = setId ? `<a class="btn" href="#/scelles/set/${encodeURIComponent(setId)}">📦 Voir tous les produits scellés de cette extension →</a>` : "";
    el.innerHTML = prods.length
      ? `<details class="serie-block set-sealed" open>
          <summary><span class="sb-title">📦 Produits scellés de cette extension</span><span class="muted small">${prods.length} produit${prods.length > 1 ? "s" : ""}</span></summary>
          <div class="sealed-grid">${prods.map(cardHTML).join("")}</div>
          <p>${link}</p>
        </details>`
      : `<div class="set-sealed-link">${link}</div>`;
    bindCards(el);
  }

  /* ---------------- Fiche produit ---------------- */
  function openModal(html) {
    const { $ } = ui();
    $("#modal-body").innerHTML = html;
    $("#modal").hidden = false;
    document.body.classList.add("noscroll");
  }

  async function openProduct(id) {
    const { esc } = ui();
    if (!S.loaded) await load();
    const p = S.products.find((x) => x.id === id);
    if (!p) return;
    const a = auth();
    const c = cote(id);
    const own = MG.store.sealed(id);
    const prices = (S.prices.get(id) || []).slice();
    const q = encodeURIComponent(p.name);
    const evo = c && p.msrp ? ((c.value - p.msrp) / p.msrp) * 100 : null;
    const plUnit = own && own.paid != null && c ? c.value - own.paid : null;

    openModal(`
      <div class="product-detail">
        <p class="eyebrow">${esc(p.type)} · ${LANGS[p.lang] || ""}${p.set_name ? " · " + esc(p.set_name) : ""}</p>
        <h2 id="modal-title">${esc(p.name)}</h2>
        <div class="badges">
          ${p.release_date ? `<span class="badge">📅 Sortie le ${esc(fmtDay(p.release_date))}</span>` : ""}
          ${p.content ? `<span class="badge">📦 ${esc(p.content)}</span>` : ""}
        </div>

        <div class="prices" style="margin-top:14px">
          <div><span>Prix de sortie</span><strong>${p.msrp ? eur(p.msrp) : "—"}</strong></div>
          <div><span>Prix estimé (${c ? c.days : WINDOW_DAYS} j)</span><strong>${c ? eur(c.value) : "—"}</strong></div>
          <div><span>Évolution</span><strong class="${evo == null ? "" : evo >= 0 ? "up" : "down"}">${evo == null ? "—" : (evo >= 0 ? "▲ +" : "▼ ") + evo.toFixed(0) + " %"}</strong></div>
          <div><span>Prix constatés</span><strong>${prices.length}</strong></div>
        </div>

        <h3>🛒 Trouver ce produit</h3>
        ${buyLinks(p)}

        <h3>Évolution des prix constatés</h3>
        <div id="p-chart"></div>

        ${a.user ? `
        <h3>J'en ai (optionnel)</h3>
        <form class="mini-form" id="f-own">
          <label>Quantité<input type="number" name="qty" min="0" max="999" step="1" value="${own ? own.qty : ""}" placeholder="0"></label>
          <label>Prix payé / unité (€)<input type="number" name="paid" min="0" max="100000" step="0.01" value="${own && own.paid != null ? own.paid : ""}" placeholder="${p.msrp || ""}"></label>
          <label>Date<input type="date" name="date" value="${own ? esc(own.date) : ""}"></label>
          <button class="btn ghost" type="submit">Enregistrer</button>
        </form>
        ${plUnit != null ? `<p class="pl ${plUnit >= 0 ? "up" : "down"}">${plUnit >= 0 ? "▲ +" : "▼ "}${eur(plUnit * own.qty)} de plus-value latente sur tes ${own.qty} exemplaire${own.qty > 1 ? "s" : ""} <span class="muted small">(selon la cote membres)</span></p>` : ""}

        <h3>Aider à estimer le prix : j'ai vu ce produit à…</h3>
        <form class="mini-form" id="f-price">
          <label>Prix (€)<input type="number" name="price" min="0.01" max="100000" step="0.01" required></label>
          <label>Où ?<select name="source">${SOURCES.map((s) => `<option>${s}</option>`).join("")}</select></label>
          <button class="btn" type="submit">Signaler ce prix</button>
          <p class="form-msg" id="pr-msg" role="alert"></p>
        </form>
        <p class="muted small">Indique un prix réellement vu (annonce, boutique, vente terminée). Plus il y a de prix, plus l'estimation est juste pour tout le monde.</p>`
        : `<p class="small" style="margin-top:14px"><a href="#/connexion">Connecte-toi</a> pour aider à estimer les prix (signaler un prix vu).</p>`}

        ${prices.length ? `<h3>Derniers prix signalés</h3>
        <ul class="restock-list price-list">${prices.slice(-10).reverse().map((r) => `<li><div><span><b>${eur(r.price)}</b> · ${esc(r.source)}</span><small>${esc(fmtDay(r.created_at))}</small></div>
          ${(a.user && (r.user_id === a.user.id || (a.isAdmin && a.isAdmin()))) ? `<button class="link-btn small" data-pdel="${esc(r.id)}">Supprimer</button>` : ""}</li>`).join("")}</ul>` : ""}

        <p class="warn">🛡 Produits scellés : méfie-toi des films plastiques refaits (« reseal »). Achète de préférence en boutique ou à des vendeurs bien notés, et vérifie le film, les logos et le poids.</p>
        ${a.isAdmin && a.isAdmin() ? `<p style="margin-top:14px"><button class="btn danger" id="p-del">Supprimer ce produit (admin)</button></p>` : ""}
      </div>`);

    drawPriceChart(document.getElementById("p-chart"), prices, p.msrp);

    const fOwn = document.getElementById("f-own");
    if (fOwn) fOwn.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(fOwn);
      const qty = parseInt(f.get("qty"), 10) || 0;
      const paidRaw = String(f.get("paid") || "").replace(",", ".").trim();
      const paid = paidRaw === "" ? null : parseFloat(paidRaw);
      if (qty < 0 || qty > 999 || (paid != null && (isNaN(paid) || paid < 0))) { ui().toast("Valeurs invalides"); return; }
      MG.store.setSealed(p, qty, paid, String(f.get("date") || "").slice(0, 10));
      ui().toast(qty ? "Enregistré ✓" : "Retiré de tes produits");
      openProduct(id);
      const grid = document.getElementById("sealed-grid");
      if (grid) renderGrid(grid);
    });

    const fPrice = document.getElementById("f-price");
    if (fPrice) fPrice.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(fPrice);
      const price = parseFloat(String(f.get("price")).replace(",", "."));
      const msg = document.getElementById("pr-msg");
      if (!(price > 0 && price < 100000)) { msg.textContent = "Prix invalide."; msg.className = "form-msg err"; return; }
      // Garde-fou : un prix très éloigné de la cote est probablement une erreur de frappe
      if (c && (price > c.value * 5 || price < c.value / 5) && !confirm("Ce prix est très différent de la cote actuelle (" + eur(c.value) + "). Tu confirmes ?")) return;
      const source = SOURCES.includes(f.get("source")) ? f.get("source") : "Autre";
      const btn = fPrice.querySelector("button"); btn.disabled = true;
      const { error } = await a.client.from("product_prices").insert({ product_id: id, price, source, user_id: a.user.id });
      btn.disabled = false;
      if (error) { msg.textContent = /limite/i.test(error.message || "") ? error.message : "Impossible d'enregistrer. Réessaie."; msg.className = "form-msg err"; return; }
      ui().toast("Merci ! Prix enregistré 💶");
      await load(true);
      openProduct(id);
      const grid = document.getElementById("sealed-grid");
      if (grid) renderGrid(grid);
    });

    document.querySelectorAll("[data-pdel]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer ce prix ?")) return;
      await a.client.from("product_prices").delete().eq("id", b.dataset.pdel);
      await load(true); openProduct(id);
    }));
    const del = document.getElementById("p-del");
    if (del) del.addEventListener("click", async () => {
      if (!confirm("Supprimer définitivement « " + p.name + " » et ses prix ?")) return;
      const { error } = await a.client.from("products").delete().eq("id", id);
      ui().toast(error ? "Erreur" : "Produit supprimé");
      if (!error) { document.getElementById("modal").hidden = true; document.body.classList.remove("noscroll"); MG.route(); }
    });
  }

  // Petit graphique : un point par prix signalé, ligne de la médiane glissante
  function drawPriceChart(el, prices, msrp) {
    const { esc } = ui();
    if (!el) return;
    if (prices.length < 2) {
      el.innerHTML = `<p class="muted small">${prices.length ? "Un seul prix signalé pour l'instant." : "Aucun prix signalé pour l'instant."} La courbe apparaît à partir de 2 prix.</p>`;
      return;
    }
    // Un point par jour = médiane des prix du jour
    const byDay = new Map();
    for (const r of prices) { const d = r.created_at.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r.price); }
    const pts = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([d, l]) => ({ d, v: median(l), n: l.length }));
    const W = Math.max(280, el.clientWidth || 600), H = 200, m = { t: 14, r: 64, b: 26, l: 58 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = pts.map((p) => p.v).concat(msrp ? [msrp] : []);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.15 || hi * 0.1 || 1; lo = Math.max(0, lo - pad); hi += pad;
    const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts[pts.length - 1].d).getTime();
    const x = (d) => m.l + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const ticks = [lo, (lo + hi) / 2, hi];
    const path = pts.map((p, i) => (i ? "L" : "M") + x(p.d).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ");
    const last = pts[pts.length - 1];
    const short = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    el.innerHTML = `<div class="chart-box"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Prix signalés dans le temps">
      ${ticks.map((t) => `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${m.l - 8}" y="${y(t) + 4}" class="axis" text-anchor="end">${esc(eur(Math.round(t)))}</text>`).join("")}
      ${msrp ? `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(msrp)}" y2="${y(msrp)}" class="msrp-line"/><text x="${m.l + iw + 6}" y="${y(msrp) + 4}" class="axis">sortie</text>` : ""}
      <text x="${m.l}" y="${H - 6}" class="axis">${esc(short(pts[0].d))}</text>
      <text x="${m.l + iw}" y="${H - 6}" class="axis" text-anchor="end">${esc(short(last.d))}</text>
      <path d="${path}" fill="none" stroke="${C_LINE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${pts.map((p) => `<circle cx="${x(p.d)}" cy="${y(p.v)}" r="4" fill="${C_LINE}" stroke="var(--bg-2)" stroke-width="2"><title>${esc(short(p.d))} : ${esc(eur(p.v))} (${p.n} prix)</title></circle>`).join("")}
      <text x="${x(last.d) + 8}" y="${y(last.v) + 4}" class="end-label">${esc(eur(last.v))}</text>
    </svg></div>
    <p class="muted small">Chaque point = médiane des prix signalés ce jour-là. Survole un point pour le détail.${msrp ? " Ligne pointillée = prix de sortie." : ""}</p>`;
  }

  /* ---------------- Proposer un produit ---------------- */
  function openPropose() {
    const a = auth();
    if (!a.user) { openModal(`<div class="state"><p>🔒 Connecte-toi pour proposer un produit.</p><a class="btn" href="#/connexion">Se connecter</a></div>`); return; }
    const admin = a.isAdmin && a.isAdmin();
    openModal(`
      <h2 id="modal-title">${admin ? "Ajouter un produit" : "Proposer un produit"}</h2>
      ${admin ? "" : `<p class="muted small">Il sera vérifié par l'administrateur avant d'apparaître dans le catalogue.</p>`}
      <form id="f-prod" class="form">
        <label>Nom du produit<input name="name" required minlength="3" maxlength="120" placeholder="ex : ETB Écarlate et Violet – 151"></label>
        <div class="row">
          <label class="grow">Type<select name="type">${TYPES.map((t) => `<option>${t}</option>`).join("")}</select></label>
          <label class="grow">Langue<select name="lang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        </div>
        <label>Série / extension (optionnel)<input name="set_name" maxlength="80" placeholder="ex : 151"></label>
        <div class="row">
          <label class="grow">Date de sortie<input type="date" name="release_date"></label>
          <label class="grow">Prix de sortie (€)<input type="number" name="msrp" min="0.01" max="100000" step="0.01" placeholder="ex : 59,99"></label>
        </div>
        <label>Contenu (optionnel)<input name="content" maxlength="300" placeholder="ex : 9 boosters, 65 protège-cartes, 1 carte promo"></label>
        <p class="form-msg" id="pp-msg" role="alert"></p>
        <button class="btn full" type="submit">${admin ? "Ajouter au catalogue" : "Envoyer la proposition"}</button>
      </form>`);
    const form = document.getElementById("f-prod");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const msg = document.getElementById("pp-msg");
      const name = String(f.get("name") || "").trim();
      if (name.length < 3) { msg.textContent = "Indique le nom du produit."; msg.className = "form-msg err"; return; }
      const msrp = parseFloat(String(f.get("msrp") || "").replace(",", "."));
      const row = {
        name: name.slice(0, 120),
        type: TYPES.includes(f.get("type")) ? f.get("type") : "Autre",
        lang: LANGS[f.get("lang")] ? f.get("lang") : "fr",
        set_name: String(f.get("set_name") || "").trim().slice(0, 80) || null,
        release_date: /^\d{4}-\d{2}-\d{2}$/.test(f.get("release_date") || "") ? f.get("release_date") : null,
        msrp: msrp > 0 && msrp < 100000 ? msrp : null,
        content: String(f.get("content") || "").trim().slice(0, 300) || null,
        status: admin ? "approved" : "pending",
        created_by: a.user.id,
      };
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const { error } = await a.client.from("products").insert(row);
      btn.disabled = false;
      if (error) { msg.textContent = /limite/i.test(error.message || "") ? error.message : "Impossible d'envoyer. Réessaie."; msg.className = "form-msg err"; return; }
      document.getElementById("modal-body").innerHTML = `<div class="state"><p>✅ ${admin ? "Produit ajouté au catalogue." : "Merci ! Ta proposition a été envoyée."}</p>${admin ? "" : `<p class="muted">Elle apparaîtra dès que l'administrateur l'aura validée.</p>`}</div>`;
      if (admin) { await load(true); const g = document.getElementById("sealed-grid"); if (g) renderGrid(g); }
    });
  }

  /* ---------------- Admin : produits standard d'un set ---------------- */
  const LANG_MAP = { fr: "fr", en: "en", ja: "ja", "zh-tw": "zh", "zh-cn": "zh", ko: "ko" };
  async function openGenerator() {
    const { esc } = ui();
    const lang = MG.store.lang;
    openModal(`<h2 id="modal-title">Ajouter les produits d'une série</h2>
      <p class="muted small">Crée en un clic les produits classiques d'une extension (langue des cartes actuelle : ${esc(lang)}). Tu pourras ensuite ajouter les prix de sortie avec « Proposer un produit » ou les laisser vides.</p>
      <div id="gen-body">${ui().loading("Chargement des séries…")}</div>`);
    let series;
    try { series = (await MG.api.series(lang)).slice().reverse(); }
    catch (e) { document.getElementById("gen-body").innerHTML = `<p class="muted">Impossible de charger les séries.</p>`; return; }
    const body = document.getElementById("gen-body");
    body.innerHTML = `<form class="form" id="f-gen">
      <label>Série<select name="serie">${series.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></label>
      <label>Extension<select name="set" id="gen-set"><option>Choisis une série…</option></select></label>
      <fieldset class="sells"><legend>Produits à créer</legend>
        ${["Booster", "Tripack", "ETB", "Display", "Coffret"].map((t, i) => `<label class="check"><input type="checkbox" name="types" value="${t}" ${i < 4 ? "checked" : ""}><span>${t}</span></label>`).join("")}
      </fieldset>
      <p class="form-msg" id="gen-msg"></p>
      <button class="btn full" type="submit">Créer les produits</button></form>`;
    const form = document.getElementById("f-gen");
    const setSel = document.getElementById("gen-set");
    const loadSets = async () => {
      setSel.innerHTML = `<option>Chargement…</option>`;
      try {
        const s = await MG.api.serie(lang, form.serie.value);
        setSel.innerHTML = `<option value="__all">⭐ Toutes les extensions de la série (${(s.sets || []).length})</option>` +
          (s.sets || []).slice().reverse().map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
      } catch (e) { setSel.innerHTML = `<option>Erreur</option>`; }
    };
    form.serie.addEventListener("change", loadSets);
    loadSets();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("gen-msg");
      const types = new FormData(form).getAll("types");
      if (!types.length) { msg.textContent = "Coche au moins un produit."; msg.className = "form-msg err"; return; }
      const ids = setSel.value === "__all" ? [...setSel.options].map((o) => o.value).filter((v) => v !== "__all") : [setSel.value];
      const serieName = form.serie.options[form.serie.selectedIndex].text;
      const pLang = LANG_MAP[lang] || "autre";
      const existing = new Set(S.products.map((p) => p.name.toLowerCase()));
      const rows = [];
      msg.textContent = "Préparation…"; msg.className = "form-msg ok";
      for (const sid of ids) {
        let set;
        try { set = await MG.api.set(lang, sid); } catch (err) { continue; }
        for (const t of types) {
          const name = `${t} ${set.name}`.slice(0, 120);
          if (existing.has(name.toLowerCase())) continue;
          existing.add(name.toLowerCase());
          rows.push({
            name, type: t, lang: pLang, serie: serieName.slice(0, 80), set_name: String(set.name).slice(0, 80),
            release_date: /^\d{4}-\d{2}-\d{2}/.test(set.releaseDate || "") ? set.releaseDate.slice(0, 10) : null,
            status: "approved", created_by: auth().user.id,
          });
        }
      }
      if (!rows.length) { msg.textContent = "Ces produits existent déjà."; msg.className = "form-msg err"; return; }
      const { error } = await auth().client.from("products").insert(rows);
      if (error) { msg.textContent = "Erreur : " + (error.message || "réessaie"); msg.className = "form-msg err"; return; }
      msg.textContent = `✅ ${rows.length} produit${rows.length > 1 ? "s" : ""} ajouté${rows.length > 1 ? "s" : ""}${rows.length <= 6 ? " : " + rows.map((r) => r.name).join(", ") : ""}. Pense à supprimer ceux qui n'existent pas pour une extension (ex : pas de display pour certaines extensions spéciales).`;
      msg.className = "form-msg ok";
      await load(true);
      const g = document.getElementById("sealed-grid"); if (g) renderGrid(g);
    });
  }

  /* ---------------- Bloc « Mes produits scellés » (page collection) ---------------- */
  async function mountCollection(el) {
    if (!el) return;
    const { esc } = ui();
    const list = MG.store.sealedList();
    if (!list.length) {
      el.innerHTML = `<section><h2>📦 Mes produits scellés</h2><p class="muted small">Tu n'as pas encore de produits scellés. Va dans <a href="#/scelles">Scellés</a> pour ajouter tes ETB, displays, UPC…</p></section>`;
      return;
    }
    await load();
    let value = 0, paid = 0, valueOfPaid = 0;
    const rows = list.map((s) => {
      const c = cote(s.id);
      const v = c ? c.value * s.qty : null;
      if (v != null) value += v;
      if (s.paid != null) { paid += s.paid * s.qty; if (v != null) valueOfPaid += v; }
      return { s, c, v, pl: v != null && s.paid != null ? v - s.paid * s.qty : null };
    });
    const pl = valueOfPaid - rows.filter((r) => r.pl != null).reduce((t, r) => t + r.s.paid * r.s.qty, 0);
    el.innerHTML = `<section><h2>📦 Mes produits scellés</h2>
      <div class="stat-row">
        <div class="stat small"><strong>${list.reduce((t, s) => t + s.qty, 0)}</strong><span>produits</span></div>
        <div class="stat small"><strong>${value ? eur(value) : "—"}</strong><span>valeur selon la cote membres</span></div>
        <div class="stat small"><strong>${paid ? eur(paid) : "—"}</strong><span>payé</span></div>
        <div class="stat small"><strong class="${rows.some((r) => r.pl != null) ? (pl >= 0 ? "up" : "down") : ""}">${rows.some((r) => r.pl != null) ? (pl >= 0 ? "▲ +" : "▼ ") + eur(pl) : "—"}</strong><span>plus-value latente</span></div>
      </div>
      <div class="table-wrap" style="margin-top:12px"><table class="table">
        <thead><tr><th>Produit</th><th class="right">Qté</th><th class="right">Payé / u.</th><th class="right">Cote / u.</th><th class="right">Écart</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="clickable" data-pid="${esc(r.s.id)}">
          <td>${esc(r.s.name)} <span class="muted">· ${esc(r.s.type)}</span></td>
          <td class="right">${r.s.qty}</td>
          <td class="right">${r.s.paid != null ? eur(r.s.paid) : "—"}</td>
          <td class="right">${r.c ? eur(r.c.value) : "—"}</td>
          <td class="right ${r.pl == null ? "" : r.pl >= 0 ? "up" : "down"}">${r.pl == null ? "—" : (r.pl >= 0 ? "▲ +" : "▼ ") + eur(r.pl)}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="disclaimer">Cote = médiane des prix signalés par les membres. Données indicatives, pas un conseil d'investissement.</p>
    </section>`;
    el.querySelectorAll("[data-pid]").forEach((tr) => tr.addEventListener("click", () => openProduct(tr.dataset.pid)));
  }
  MG.scelle.mountCollection = mountCollection;
  MG.scelle.mountSet = mountSet;

  /* ---------------- Espace admin : produits à valider ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc, fmtDate } = ui();
    const a = auth();
    const { data: pending, error } = await a.client.from("products").select("id,name,type,lang,set_name,release_date,msrp,content,created_at").eq("status", "pending").order("created_at").limit(100);
    if (error) throw error;
    el.innerHTML = `<section><div class="section-head"><h2>📦 Produits scellés à valider (${pending.length})</h2>
      <button class="btn ghost" id="gen-admin">⚙ Ajouter les produits d'une série</button></div>
      ${pending.length ? `<div class="mod-list">${pending.map((p) => `<div class="mod-item" data-id="${esc(p.id)}">
        <div><b>${esc(p.name)}</b> · ${esc(p.type)} · ${LANGS[p.lang] || ""}<br>
        <span class="small muted">${esc(p.set_name || "")}${p.release_date ? " · sortie " + esc(p.release_date) : ""}${p.msrp ? " · " + eur(Number(p.msrp)) : ""}${p.content ? " · " + esc(p.content) : ""}</span><br>
        <span class="small muted">proposé le ${esc(fmtDate(p.created_at))}</span></div>
        <div class="row"><button class="btn" data-act="approved">Valider</button><button class="btn ghost" data-act="rejected">Refuser</button></div></div>`).join("")}</div>`
      : `<p class="muted">Aucun produit en attente.</p>`}</section>`;
    el.querySelector("#gen-admin").addEventListener("click", async () => { await load(); openGenerator(); });
    el.querySelectorAll(".mod-item [data-act]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".mod-item").dataset.id;
      const { error: err } = await a.client.from("products").update({ status: b.dataset.act }).eq("id", id);
      ui().toast(err ? "Erreur" : b.dataset.act === "approved" ? "Produit validé ✓" : "Produit refusé");
      if (!err) b.closest(".mod-item").remove();
    }));
  });
})(window.MG);
