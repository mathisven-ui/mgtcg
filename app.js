/* ==========================================================
   MGTCG — app.js
   Les pages du site : accueil, séries, sets (master set),
   recherche, fiche carte, collection, favoris.
   Créé par Mathis GILLIG.
   ========================================================== */
(function (MG) {
  "use strict";

  /* ---------------- Petits outils ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // TRÈS IMPORTANT pour la sécurité : tout texte venant de l'extérieur
  // passe par esc() avant d'être affiché (protection contre le XSS).
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const enc = encodeURIComponent;

  const eur = (n) => (typeof n === "number" && !isNaN(n)
    ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "—");
  const usd = (n) => (typeof n === "number" ? n.toLocaleString("fr-FR", { style: "currency", currency: "USD" }) : "—");
  const pct = (a, b) => (a && b ? Math.round((a / b) * 100) : 0);
  const langInfo = (code) => MG.LANGS.find((l) => l.code === code) || MG.LANGS[0];
  const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return d; } };

  MG.routes = MG.routes || {};
  const listeners = {};
  MG.emit = (ev) => (listeners[ev] || []).forEach((fn) => fn());
  MG.on = (ev, fn) => (listeners[ev] = listeners[ev] || []).push(fn);

  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2400);
  }

  const view = () => $("#view");
  let cleanup = null; // pour arrêter les chargements quand on change de page

  function loading(msg = "Chargement…") {
    return `<div class="state"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
  }
  function errorBox(e) {
    const msg = e && e.status === 404
      ? "Cette page n'existe pas dans cette langue. Les séries et sets ne sont pas les mêmes selon les langues (par exemple, le Japon a ses propres sets)."
      : "Impossible de joindre la base de données des cartes. Vérifie ta connexion et réessaie.";
    return `<div class="state"><p>😕 ${esc(msg)}</p><a class="btn" href="#/">Retour à l'accueil</a></div>`;
  }

  function progressBar(owned, total, label) {
    const p = pct(owned, total);
    return `<div class="progress">
      <div class="progress-top"><span>${esc(label)}</span><strong>${owned} / ${total} · ${p}%</strong></div>
      <div class="bar"><span style="width:${Math.min(p, 100)}%"></span></div>
    </div>`;
  }

  function ownedInSet(lang, setId) {
    const prefix = lang + "|" + setId + "-";
    return MG.store.ownedKeys().filter((k) => k.startsWith(prefix));
  }

  /* ---------------- Tuile de carte ---------------- */
  function tileHTML(card, lang, opts = {}) {
    const key = MG.store.key(lang, card.id);
    const owned = MG.store.isOwned(lang, card.id);
    const img = MG.cardImg(card.image, "low");
    const r = card.rarity ? MG.rarity(card.rarity) : null;
    const price = card.cardmarket ? (card.cardmarket.trend ?? card.cardmarket["trend-holo"]) : null;
    return `<article class="tile ${owned ? "is-owned" : ""}" data-id="${esc(card.id)}" data-key="${esc(key)}" data-lang="${esc(lang)}" tabindex="0">
      <div class="tile-img">
        ${img ? `<img src="${esc(img)}" alt="${esc(card.name)}" loading="lazy">` : `<div class="noimg">${esc(card.name)}</div>`}
        <button class="chk" title="Je l'ai / je ne l'ai pas" aria-label="Marquer comme possédée">${owned ? "✓" : "+"}</button>
        ${MG.store.isFav(lang, card.id) ? `<span class="fav-dot" title="Favori">♥</span>` : ""}
      </div>
      <div class="tile-info">
        <div class="tile-row">
          <span class="num">${opts.showLang ? MG.flag(lang, langInfo(lang).label) + " " : ""}#${esc(card.localId ?? card.id)}</span>
          <span class="rar ${r ? r.cls : "r-wait"}" title="${esc(r ? r.label : "")}">${r ? esc(r.icon) : ""}</span>
        </div>
        <div class="tile-name">${esc(card.name)}</div>
        <div class="tile-price">${price ? eur(price) : opts.priceWait ? "<span class='muted'>…</span>" : ""}</div>
      </div>
    </article>`;
  }

  // Gère les clics sur une grille de tuiles
  function bindGrid(grid, getCard) {
    grid.addEventListener("click", (e) => {
      const tile = e.target.closest(".tile");
      if (!tile) return;
      const lang = tile.dataset.lang;
      const card = getCard(tile.dataset.id, lang) || { id: tile.dataset.id };
      if (e.target.closest(".chk")) {
        e.stopPropagation();
        MG.store.toggleQuick(lang, card);
        refreshTile(tile, card, lang);
        return;
      }
      openCard(lang, tile.dataset.id);
    });
    grid.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target.classList.contains("tile")) openCard(e.target.dataset.lang, e.target.dataset.id);
    });
  }

  function refreshTile(tile, card, lang) {
    const tmp = document.createElement("div");
    tmp.innerHTML = tileHTML(card, lang, { showLang: tile.querySelector(".num").textContent.includes(" #") });
    const fresh = tmp.firstElementChild;
    fresh.className = fresh.className + (tile.classList.contains("hidden") ? " hidden" : "");
    tile.replaceWith(fresh);
  }

  /* ================== PAGES ================== */

  /* ---------- Accueil ---------- */
  async function pageHome() {
    const lang = MG.store.lang;
    const keys = MG.store.ownedKeys();
    const value = keys.reduce((s, k) => s + MG.store.valueOf(k), 0);
    const progress = setsInProgress().slice(0, 4);

    view().innerHTML = `
      <section class="hero">
        <div>
          <p class="eyebrow">Pokémon TCG · ${MG.flag(lang)} ${esc(langInfo(lang).label)}</p>
          <h1>Ton classeur Pokémon,<br><span class="accent">toujours dans ta poche.</span></h1>
          <p class="lead">Parcours toutes les séries, coche tes cartes et vois tout de suite ce qu'il te manque pour finir ton master set.</p>
        </div>
        <div class="hero-stats">
          <div class="stat"><strong>${keys.length}</strong><span>cartes possédées</span></div>
          <div class="stat"><strong>${eur(value)}</strong><span>valeur estimée</span></div>
          <div class="stat"><strong>${MG.store.listKeys("wish").length}</strong><span>dans ma wishlist</span></div>
        </div>
      </section>
      ${(() => { const hits = MG.store.triggeredAlerts(); return hits.length ? `<a class="alert-banner" href="#/collection">🔔 <b>${hits.length} alerte${hits.length > 1 ? "s" : ""} de prix</b> : ${hits.slice(0, 3).map((h) => esc(h.meta.name || "")).join(", ")}${hits.length > 3 ? "…" : ""} — voir</a>` : ""; })()}
      ${progress.length ? `<section><h2>Mes sets en cours</h2><div class="set-grid">${progress.map(setProgressCard).join("")}</div></section>` : ""}
      <section>
        <div class="section-head"><h2>Toutes les séries</h2><span class="muted">Clique sur une série pour voir ses sets</span></div>
        <div id="series">${loading("Chargement des séries…")}</div>
      </section>`;

    try {
      // Les cartes du jeu mobile « Pocket » ne sont pas de vraies cartes : on les cache
      const series = (await MG.api.series(lang)).slice().reverse().filter((x) => !/pocket/i.test(x.name + " " + x.id));
      $("#series").innerHTML = `<div class="serie-grid">${series.map((s) => `
        <a class="serie" href="#/serie/${enc(s.id)}">
          ${MG.logoImg(s.logo) ? `<img src="${esc(MG.logoImg(s.logo))}" alt="" loading="lazy">` : `<span class="serie-ph">${esc(s.name.slice(0, 2))}</span>`}
          <span>${esc(s.name)}</span>
        </a>`).join("")}</div>`;
    } catch (e) { $("#series").innerHTML = errorBox(e); }
  }

  function setsInProgress() {
    const groups = {};
    for (const k of MG.store.ownedKeys()) {
      const m = MG.store.meta(k); if (!m || !m.setId) continue;
      const lang = k.split("|")[0];
      const g = (groups[lang + "|" + m.setId] = groups[lang + "|" + m.setId] || { lang, setId: m.setId, setName: m.setName, total: m.setTotal, owned: 0, value: 0 });
      g.owned++; g.value += MG.store.valueOf(k);
      if (!g.total && m.setTotal) g.total = m.setTotal;
    }
    return Object.values(groups).sort((a, b) => pct(b.owned, b.total) - pct(a.owned, a.total));
  }

  function setProgressCard(g) {
    return `<a class="set-card" href="#/set/${enc(g.setId)}/${enc(g.lang)}">
      <div class="set-card-top"><strong>${esc(g.setName || g.setId)}</strong><span>${MG.flag(g.lang, langInfo(g.lang).label)}</span></div>
      ${progressBar(g.owned, g.total || g.owned, "Cartes")}
      <span class="muted small">Valeur estimée : ${eur(g.value)}</span>
    </a>`;
  }

  /* ---------- Une série → ses sets ---------- */
  async function pageSerie(id) {
    const lang = MG.store.lang;
    view().innerHTML = loading("Chargement de la série…");
    try {
      const serie = await MG.api.serie(lang, id);
      const sets = (serie.sets || []).slice().reverse();
      view().innerHTML = `
        <nav class="crumbs"><a href="#/">Accueil</a> › <span>${esc(serie.name)}</span></nav>
        <header class="page-head">
          ${MG.logoImg(serie.logo) ? `<img class="page-logo" src="${esc(MG.logoImg(serie.logo))}" alt="">` : ""}
          <div><h1>${esc(serie.name)}</h1><p class="muted">${sets.length} sets · du plus récent au plus ancien</p></div>
        </header>
        <div class="set-grid">${sets.map((s) => {
          const total = (s.cardCount && s.cardCount.official) || 0;
          const owned = ownedInSet(lang, s.id).length;
          return `<a class="set-card" href="#/set/${enc(s.id)}">
            <div class="set-logo">${MG.logoImg(s.logo) ? `<img src="${esc(MG.logoImg(s.logo))}" alt="" loading="lazy">` : `<span>${esc(s.name)}</span>`}</div>
            <div class="set-card-top"><strong>${esc(s.name)}</strong>
            ${MG.logoImg(s.symbol) ? `<img class="sym" src="${esc(MG.logoImg(s.symbol))}" alt="" loading="lazy">` : ""}</div>
            ${progressBar(owned, total, total + " cartes officielles" + (s.cardCount && s.cardCount.total > total ? " (+" + (s.cardCount.total - total) + " secrètes)" : ""))}
          </a>`;
        }).join("")}</div>`;
    } catch (e) { view().innerHTML = errorBox(e); }
  }

  /* ---------- Un set : le master set ---------- */
  async function pageSet(id) {
    const lang = MG.store.lang;
    view().innerHTML = loading("Chargement du set…");
    let set;
    try { set = await MG.api.set(lang, id); }
    catch (e) { view().innerHTML = errorBox(e); return; }

    const briefs = set.cards || [];
    const details = new Map(); // id → carte complète (rareté, prix, versions)
    const getCard = (cid) => details.get(cid) || briefs.find((c) => c.id === cid);
    const official = (set.cardCount && set.cardCount.official) || briefs.length;
    const total = (set.cardCount && set.cardCount.total) || briefs.length;
    let filter = "all", rarityFilter = "", textFilter = "";

    const ytQuery = enc("pokemon " + set.name + " " + (lang === "fr" ? "ouverture master set" : "master set"));
    view().innerHTML = `
      <nav class="crumbs"><a href="#/">Accueil</a> › ${set.serie ? `<a href="#/serie/${enc(set.serie.id)}">${esc(set.serie.name)}</a> › ` : ""}<span>${esc(set.name)}</span></nav>
      <header class="page-head set-head">
        ${MG.logoImg(set.logo) ? `<img class="page-logo" src="${esc(MG.logoImg(set.logo))}" alt="">` : ""}
        <div class="grow">
          <h1>${esc(set.name)} <span class="flag">${MG.flag(lang, langInfo(lang).label)}</span></h1>
          <p class="muted">${set.releaseDate ? "Sorti le " + esc(fmtDate(set.releaseDate)) + " · " : ""}${official} cartes officielles · ${total} au total (avec les secrètes)</p>
          <div class="head-links">
            <a class="chip-link" target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${ytQuery}">▶ Vidéos de ce set</a>
            <a class="chip-link" target="_blank" rel="noopener noreferrer" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${enc(set.name)}">Cardmarket</a>
            <a class="chip-link" target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=${enc("site:pokecardex.com " + set.name)}">PokéCardex</a>
          </div>
        </div>
      </header>

      <section class="set-stats">
        <div id="prog"></div>
        <div class="stat-row">
          <div class="stat small"><strong id="v-owned">—</strong><span>valeur de mes cartes</span></div>
          <div class="stat small"><strong id="v-missing">—</strong><span>coût estimé des manquantes</span></div>
          <div class="stat small"><strong id="v-load">0 / ${briefs.length}</strong><span>prix chargés</span></div>
        </div>
      </section>

      <div id="set-sealed"></div>
      <div id="set-drops"></div>

      <div class="toolbar">
        <div class="chips" role="tablist">
          <button class="chip active" data-f="all">Toutes</button>
          <button class="chip" data-f="owned">Possédées</button>
          <button class="chip" data-f="missing">Manquantes</button>
          <button class="chip" data-f="fav">Favoris</button>
        </div>
        <input id="setq" type="search" placeholder="Filtrer ce set (nom ou numéro)…" aria-label="Filtrer ce set">
        <select id="rar" aria-label="Rareté"><option value="">Toutes les raretés</option></select>
        <button class="btn ghost" id="copy">📋 Copier les manquantes</button>
        <button class="btn ghost" id="print">🖨 Checklist</button>
      </div>

      <div id="grid" class="grid">${briefs.map((c) => tileHTML(c, lang, { priceWait: true })).join("")}</div>
      <p class="disclaimer">Prix : moyennes Cardmarket (en euros), données indicatives mises à jour une fois par jour. Ce ne sont pas des conseils d'achat ou d'investissement.</p>
      <div id="print-area"></div>`;

    const grid = $("#grid");
    bindGrid(grid, getCard);
    if (MG.scelle && MG.scelle.mountSet) MG.scelle.mountSet($("#set-sealed"), set.name, lang, set.id);
    if (MG.drops) MG.drops.mountSet($("#set-drops"), set, lang, () => [...details.values()]);

    function computeStats() {
      let ownedCards = 0, ownedValue = 0, missingValue = 0, variantsTotal = 0, variantsOwned = 0;
      for (const c of briefs) {
        const d = details.get(c.id);
        const o = MG.store.owned(lang, c.id);
        if (o) ownedCards++;
        const avail = d ? MG.VARIANTS.filter((v) => d.variants && d.variants[v]) : ["normal"];
        const list = avail.length ? avail : ["normal"];
        variantsTotal += list.length;
        variantsOwned += list.filter((v) => o && o[v]).length;
        const p = d && d.cardmarket ? (d.cardmarket.trend ?? d.cardmarket["trend-holo"] ?? 0) : 0;
        if (o) ownedValue += MG.store.valueOf(MG.store.key(lang, c.id)) || p; else missingValue += p;
      }
      $("#prog").innerHTML =
        progressBar(ownedCards, briefs.length, "Set complet (1 exemplaire de chaque carte)") +
        progressBar(variantsOwned, variantsTotal, "Master set (toutes les versions : normale, reverse, holo…)");
      $("#v-owned").textContent = eur(ownedValue);
      $("#v-missing").textContent = eur(missingValue);
      $("#v-load").textContent = details.size + " / " + briefs.length;
    }

    function applyFilter() {
      const q = textFilter.trim().toLowerCase();
      for (const tile of $$(".tile", grid)) {
        const cid = tile.dataset.id;
        const c = getCard(cid);
        let show = true;
        if (filter === "owned") show = MG.store.isOwned(lang, cid);
        if (filter === "missing") show = !MG.store.isOwned(lang, cid);
        if (filter === "fav") show = MG.store.isFav(lang, cid);
        if (show && rarityFilter) show = !!(c && c.rarity === rarityFilter);
        if (show && q) show = (c.name || "").toLowerCase().includes(q) || String(c.localId).toLowerCase() === q;
        tile.classList.toggle("hidden", !show);
      }
    }

    let raf = 0;
    const rarities = new Set();
    const stop = MG.loadQueue(briefs.map((c) => c.id), lang, (card) => {
      if (!card) return;
      details.set(card.id, card);
      // Mémorise les prix des cartes déjà possédées (valeur de la collection)
      if (MG.store.isOwned(lang, card.id) || MG.store.isFav(lang, card.id) || MG.store.isWish(lang, card.id)) {
        MG.store.remember(lang, card, { setTotal: official });
      }
      const tile = grid.querySelector(`.tile[data-id="${CSS.escape(card.id)}"]`);
      if (tile) refreshTile(tile, card, lang);
      if (card.rarity && !rarities.has(card.rarity)) {
        rarities.add(card.rarity);
        const o = document.createElement("option");
        o.value = card.rarity; o.textContent = MG.rarity(card.rarity).icon + "  " + card.rarity;
        $("#rar").appendChild(o);
      }
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; computeStats(); if (rarityFilter || filter !== "all") applyFilter(); });
    });
    cleanup = stop;

    computeStats();
    const onStore = () => { computeStats(); applyFilter(); };
    MG.on("store", () => { if ($("#grid") === grid) onStore(); });

    $$(".chip[data-f]").forEach((b) => b.addEventListener("click", () => {
      $$(".chip[data-f]").forEach((x) => x.classList.remove("active"));
      b.classList.add("active"); filter = b.dataset.f; applyFilter();
    }));
    $("#setq").addEventListener("input", (e) => { textFilter = e.target.value; applyFilter(); });
    $("#rar").addEventListener("change", (e) => { rarityFilter = e.target.value; applyFilter(); });

    $("#copy").addEventListener("click", async () => {
      const missing = briefs.filter((c) => !MG.store.isOwned(lang, c.id));
      const text = `${set.name} — ${missing.length} cartes manquantes\n` +
        missing.map((c) => `#${c.localId} ${c.name}`).join("\n");
      try { await navigator.clipboard.writeText(text); toast("Liste copiée ✓ (" + missing.length + " cartes)"); }
      catch (e) { window.prompt("Copie la liste :", text); }
    });

    $("#print").addEventListener("click", () => {
      $("#print-area").innerHTML = `<h1>MGTCG — Checklist ${esc(set.name)}</h1>
        <table><thead><tr><th>✓</th><th>N°</th><th>Nom</th><th>Rareté</th></tr></thead><tbody>
        ${briefs.map((c) => {
          const d = details.get(c.id) || c;
          return `<tr><td>${MG.store.isOwned(lang, c.id) ? "☑" : "☐"}</td><td>${esc(c.localId)}</td><td>${esc(c.name)}</td><td>${esc(d.rarity || "")}</td></tr>`;
        }).join("")}</tbody></table><p>Généré par MGTCG — par Mathis GILLIG</p>`;
      window.print();
    });
  }

  /* ---------- Recherche ---------- */
  async function pageSearch(q) {
    const lang = MG.store.lang;
    $("#q").value = q;
    if (!q || q.length < 2) {
      view().innerHTML = `<div class="state"><p>Tape au moins 2 lettres dans la barre de recherche.</p></div>`;
      return;
    }
    view().innerHTML = loading(`Recherche de « ${q} »…`);
    try {
      const res = await MG.api.search(lang, q);
      view().innerHTML = `
        <header class="page-head"><div><h1>Résultats pour « ${esc(q)} »</h1>
        <p class="muted">${res.length >= 60 ? "60 premiers résultats" : res.length + " carte(s)"} en ${esc(langInfo(lang).label.toLowerCase())}. Clique sur une carte pour voir sa cote et ses détails.</p></div></header>
        ${res.length ? `<div id="grid" class="grid">${res.map((c) => tileHTML(c, lang)).join("")}</div>`
          : `<div class="state"><p>Aucune carte trouvée. Essaie un autre nom, ou change la langue des cartes en haut à droite.</p></div>`}`;
      if (res.length) bindGrid($("#grid"), (cid) => res.find((c) => c.id === cid));
    } catch (e) { view().innerHTML = errorBox(e); }
  }

  /* ---------- Ma collection ---------- */
  function pageCollection() {
    const keys = MG.store.ownedKeys();
    const items = keys.map((k) => ({ k, m: MG.store.meta(k) || {}, v: MG.store.valueOf(k) }));
    const total = items.reduce((s, i) => s + i.v, 0);
    const top = items.slice().sort((a, b) => b.v - a.v).slice(0, 10);
    const top3 = top.slice(0, 3).reduce((s, i) => s + i.v, 0);
    const sets = setsInProgress();

    view().innerHTML = `
      <header class="page-head"><div><h1>Ma collection</h1>
      <p class="muted">Enregistrée dans ce navigateur. Pense à faire une sauvegarde de temps en temps !</p></div></header>

      <div id="valeur"></div>
      <div class="stat-row">
        <div class="stat small"><strong>${keys.length}</strong><span>cartes différentes</span></div>
        <div class="stat small"><strong>${sets.length}</strong><span>sets commencés</span></div>
        <div class="stat small"><strong>${total ? pct(top3, total) + "%" : "—"}</strong><span>de la valeur dans tes 3 meilleures cartes</span></div>
      </div>

      ${keys.length === 0 ? `<div class="state"><p>Ta collection est vide pour l'instant. Va dans un set et clique sur le <b>+</b> des cartes que tu possèdes.</p><a class="btn" href="#/">Parcourir les séries</a></div>` : `
      <section><h2>Mes sets</h2><div class="set-grid">${sets.map(setProgressCard).join("")}</div></section>
      <section><h2>Mes cartes les plus précieuses</h2>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Carte</th><th>Set</th><th>Rareté</th><th class="right">Valeur</th></tr></thead>
          <tbody>${top.map((i) => {
            const [lang, id] = i.k.split("|");
            const r = MG.rarity(i.m.rarity);
            return `<tr class="clickable" data-lang="${esc(lang)}" data-id="${esc(id)}">
              <td>${MG.flag(lang, langInfo(lang).label)} ${esc(i.m.name || id)} <span class="muted">#${esc(i.m.localId)}</span></td>
              <td>${esc(i.m.setName || i.m.setId)}</td>
              <td><span class="rar ${r.cls}">${esc(r.icon)}</span></td>
              <td class="right">${i.v ? eur(i.v) : "<span class='muted'>ouvre la carte</span>"}</td></tr>`;
          }).join("")}</tbody></table></div>
        <p class="disclaimer">Prix Cardmarket actualisés automatiquement toutes les 12 h. Données indicatives, pas un conseil d'investissement.</p>
      </section>`}

      <div id="sealed-block"></div>
      <section class="backup"><h2>Sauvegarde</h2>
        <p class="muted">Télécharge ta collection dans un fichier, pour la garder en sécurité ou la mettre sur un autre appareil.</p>
        <div class="row">
          <button class="btn" id="exp">⬇ Exporter ma collection</button>
          <label class="btn ghost">⬆ Importer un fichier<input type="file" id="imp" accept=".json,application/json" hidden></label>
          <button class="btn danger" id="reset">Tout effacer</button>
        </div>
      </section>`;

    $$("main > section tr.clickable").forEach((tr) => tr.addEventListener("click", () => openCard(tr.dataset.lang, tr.dataset.id)));
    if (MG.valeur) MG.valeur.mount($("#valeur"));
    if (MG.scelle && MG.scelle.mountCollection) MG.scelle.mountCollection($("#sealed-block"));
    $("#exp").addEventListener("click", () => {
      const blob = new Blob([MG.store.exportJSON()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "mgtcg-collection-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $("#imp").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast("Fichier trop gros"); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          if (!confirm("Remplacer ta collection actuelle par ce fichier ?")) return;
          MG.store.importJSON(reader.result); toast("Collection importée ✓"); pageCollection();
        } catch (err) { toast("Ce fichier n'est pas une sauvegarde MGTCG valide"); }
      };
      reader.readAsText(file);
    });
    $("#reset").addEventListener("click", () => {
      if (confirm("Effacer TOUTE ta collection, tes favoris et ta wishlist ? (Fais un export avant !)")) {
        MG.store.reset(); toast("Collection effacée"); pageCollection();
      }
    });
  }

  /* ---------- Favoris & wishlist ---------- */
  function pageLists(tab = "fav") {
    const keys = MG.store.listKeys(tab);
    view().innerHTML = `
      <header class="page-head"><div><h1>Mes listes</h1></div></header>
      <div class="chips">
        <a class="chip ${tab === "fav" ? "active" : ""}" href="#/favoris">♥ Favoris (${MG.store.listKeys("fav").length})</a>
        <a class="chip ${tab === "wish" ? "active" : ""}" href="#/wishlist">★ Wishlist (${MG.store.listKeys("wish").length})</a>
      </div>
      ${keys.length ? `<div id="grid" class="grid">${keys.map((k) => {
        const [lang, id] = k.split("|"); const m = MG.store.meta(k) || {};
        return tileHTML({ id, name: m.name || id, image: m.image, localId: m.localId, rarity: m.rarity,
          cardmarket: m.price || m.priceHolo ? { trend: m.price || m.priceHolo } : null }, lang, { showLang: true });
      }).join("")}</div>`
      : `<div class="state"><p>${tab === "fav" ? "Aucun favori pour l'instant. Ouvre une carte et clique sur ♥." : "Ta wishlist est vide. Ouvre une carte et clique sur ★ Wishlist."}</p></div>`}`;
    if (keys.length) bindGrid($("#grid"), (cid, lang) => {
      const m = MG.store.meta(lang + "|" + cid) || {};
      return { id: cid, name: m.name, image: m.image, localId: m.localId, rarity: m.rarity };
    });
  }

  /* ---------- Mentions légales ---------- */
  function pageLegal() {
    view().innerHTML = `
      <article class="prose">
        <h1>Mentions légales & confidentialité</h1>
        <h2>Éditeur</h2>
        <p>MGTCG est un site personnel et gratuit créé par <b>Mathis GILLIG</b>.<br>Contact : <a href="mailto:mathisven@gmail.com">mathisven@gmail.com</a></p>
        <h2>Hébergement</h2>
        <p>GitHub Pages — GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</p>
        <h2>Tes données (RGPD)</h2>
        <p><b>Sans compte</b> : ta collection, tes favoris et ta wishlist sont enregistrés uniquement dans ton navigateur (stockage local). Aucune donnée personnelle n'est collectée.</p>
        <p><b>Avec un compte</b> : MGTCG enregistre ton adresse email, ton mot de passe (chiffré, jamais visible, même par l'administrateur), la date de création du compte et ta collection, pour te permettre de la retrouver sur tous tes appareils. Ces données sont hébergées par Supabase (serveurs dans l'Union européenne si la région choisie est européenne) et ne sont ni vendues, ni partagées, ni utilisées pour de la publicité.</p>
        <p>Tu peux à tout moment : exporter ta collection (page « Ma collection »), supprimer ta collection en ligne (page « Mon compte »), ou demander la suppression complète de ton compte et l'accès à tes données en écrivant à l'adresse de contact ci-dessus. Tu peux aussi saisir la CNIL (cnil.fr) si tu estimes que tes droits ne sont pas respectés.</p>
        <p>Cookies : le site n'utilise ni cookies publicitaires ni traceurs. Seul le stockage local du navigateur est utilisé, pour faire fonctionner le site (collection, connexion).</p>
        <h2>Sources des données</h2>
        <p>Informations et images des cartes : <a href="https://tcgdex.dev" target="_blank" rel="noopener noreferrer">TCGdex</a>. Prix : moyennes Cardmarket fournies par TCGdex, à titre indicatif.</p>
        <p>Carte des boutiques : fond de carte © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">contributeurs OpenStreetMap</a>, via OpenFreeMap et MapLibre. Boutiques : OpenStreetMap (API Overpass) et propositions des membres. Itinéraires : OSRM. Recherche d'adresse : Nominatim.</p>
        <p>Localisation : ta position n'est utilisée que dans ton navigateur pour centrer la carte et calculer les trajets. Elle n'est jamais enregistrée par MGTCG. Les recherches de boutiques et d'itinéraires envoient les coordonnées concernées aux services OpenStreetMap ci-dessus.</p>
        <p>Restocks et boutiques proposées : ils sont visibles par tous, sans afficher ton email. Tu peux supprimer tes signalements à tout moment.</p>
        <h2>Avertissements</h2>
        <p>Les prix affichés sont des données indicatives et ne constituent en aucun cas un conseil en investissement.</p>
        <p>MGTCG n'est pas affilié à, ni approuvé par, Nintendo, Creatures, GAME FREAK ou The Pokémon Company. Pokémon et les noms associés sont des marques de leurs propriétaires respectifs.</p>
      </article>`;
  }

  /* ================== FICHE CARTE (fenêtre) ================== */
  async function openCard(lang, id) {
    const modal = $("#modal");
    const box = $("#modal-body");
    box.innerHTML = loading("Chargement de la carte…");
    modal.hidden = false;
    document.body.classList.add("noscroll");
    $("#modal-close").focus();

    let card;
    try { card = await MG.api.card(lang, id); }
    catch (e) { box.innerHTML = errorBox(e); return; }
    MG.store.remember(lang, card);

    const render = () => {
      const r = MG.rarity(card.rarity);
      const owned = MG.store.owned(lang, card.id) || {};
      const avail = MG.VARIANTS.filter((v) => card.variants && card.variants[v]);
      const variants = avail.length ? avail : ["normal"];
      const cm = card.cardmarket;
      const q = enc(`${card.name} ${card.localId} ${card.set ? card.set.name : ""}`.trim());
      const qShort = enc(`pokemon ${card.name} ${card.set ? card.set.name : ""}`);

      let trendHTML = "";
      if (cm && cm.avg7 && cm.avg30) {
        const diff = Math.round(((cm.avg7 - cm.avg30) / cm.avg30) * 100);
        const cls = diff > 2 ? "up" : diff < -2 ? "down" : "flat";
        trendHTML = `<span class="trend ${cls}">${diff > 0 ? "▲" : diff < 0 ? "▼" : "■"} ${diff > 0 ? "+" : ""}${diff}% <small>(moy. 7 j vs 30 j)</small></span>`;
      }
      const bars = cm ? [["30 j", cm.avg30], ["7 j", cm.avg7], ["24 h", cm.avg1]].filter((b) => b[1]) : [];
      const maxBar = Math.max(...bars.map((b) => b[1]), 0.01);

      box.innerHTML = `
        <div class="card-detail">
          <div class="cd-img">
            ${MG.cardImg(card.image, "high") ? `<img src="${esc(MG.cardImg(card.image, "high"))}" alt="${esc(card.name)}">` : `<div class="noimg big">${esc(card.name)}</div>`}
          </div>
          <div class="cd-info">
            <p class="eyebrow">${MG.flag(lang, langInfo(lang).label)} ${card.set ? `<a href="#/set/${enc(card.set.id)}" data-close>${esc(card.set.name)}</a>` : ""} · #${esc(card.localId)}${card.set && card.set.cardCount ? " / " + esc(card.set.cardCount.official) : ""}</p>
            <h2 id="modal-title">${esc(card.name)}</h2>
            <div class="badges">
              <span class="badge"><span class="rar ${r.cls}">${esc(r.icon)}</span> ${esc(r.label)}</span>
              ${card.category ? `<span class="badge">${esc(card.category)}</span>` : ""}
              ${card.hp ? `<span class="badge">${esc(card.hp)} PV</span>` : ""}
              ${card.illustrator ? `<span class="badge">🎨 ${esc(card.illustrator)}</span>` : ""}
            </div>

            <div class="actions">
              <button class="btn ${MG.store.isFav(lang, card.id) ? "" : "ghost"}" id="b-fav">♥ ${MG.store.isFav(lang, card.id) ? "En favori" : "Favori"}</button>
              <button class="btn ${MG.store.isWish(lang, card.id) ? "" : "ghost"}" id="b-wish">★ ${MG.store.isWish(lang, card.id) ? "Dans ma wishlist" : "Wishlist"}</button>
            </div>

            <h3>Je possède</h3>
            <div class="variants">${variants.map((v) => `
              <label class="variant ${owned[v] ? "on" : ""}"><input type="checkbox" data-v="${v}" ${owned[v] ? "checked" : ""}> ${esc(MG.VARIANT_LABELS[v])}</label>`).join("")}
            </div>

            <h3>Cote ${trendHTML}</h3>
            ${cm ? `
              <div class="prices">
                <div><span>Tendance</span><strong>${eur(cm.trend)}</strong></div>
                <div><span>Prix moyen</span><strong>${eur(cm.avg)}</strong></div>
                <div><span>Plus bas</span><strong>${eur(cm.low)}</strong></div>
                ${cm["trend-holo"] ? `<div><span>Tendance holo/reverse</span><strong>${eur(cm["trend-holo"])}</strong></div>` : ""}
                ${card.tcgplayerMarket ? `<div><span>TCGplayer (US)</span><strong>${usd(card.tcgplayerMarket)}</strong></div>` : ""}
              </div>
              ${bars.length ? `<div class="mini-chart" aria-label="Prix moyen sur 30 jours, 7 jours et 24 heures">${bars.map((b) =>
                `<div class="mc-col"><div class="mc-track"><div class="mc-bar" style="height:${Math.max(6, (b[1] / maxBar) * 100)}%"></div></div><strong>${eur(b[1])}</strong><span>${b[0]}</span></div>`).join("")}</div>` : ""}
              <p class="disclaimer">Source : Cardmarket (via TCGdex)${cm.updated ? ", mis à jour le " + esc(fmtDate(cm.updated)) : ""}. Données indicatives, pas un conseil d'investissement.</p>`
            : `<p class="muted">Pas de prix Cardmarket disponible pour cette carte (fréquent pour les cartes asiatiques ou très récentes).</p>`}

            ${(() => {
              const key = MG.store.key(lang, card.id);
              const paid = MG.store.paid(key);
              const al = MG.store.alert(key);
              const now = MG.store.priceOf(key);
              const isOwned = Object.keys(owned).length > 0;
              const pl = paid && now ? MG.store.valueOf(key) - paid.price : null;
              return `
            ${isOwned ? `<h3>Mon achat</h3>
            <form class="mini-form" id="f-paid">
              <label>Prix payé (€)<input type="number" name="price" min="0" max="1000000" step="0.01" inputmode="decimal" value="${paid ? paid.price : ""}" placeholder="ex : 12,50"></label>
              <label>Date<input type="date" name="date" value="${paid ? esc(paid.date) : ""}"></label>
              <button class="btn ghost" type="submit">Enregistrer</button>
            </form>
            ${pl != null ? `<p class="pl ${pl >= 0 ? "up" : "down"}">${pl >= 0 ? "▲" : "▼"} ${pl >= 0 ? "+" : ""}${eur(pl)} de plus-value latente <span class="muted small">(valeur actuelle de tes exemplaires − prix payé)</span></p>` : ""}` : ""}

            <h3>🔔 Alerte de prix</h3>
            <form class="mini-form" id="f-alert">
              <label>Me prévenir si la cote passe sous (€)<input type="number" name="below" min="0.01" max="1000000" step="0.01" inputmode="decimal" value="${al ? al.below : ""}" placeholder="ex : ${now ? Math.max(0.01, Math.floor(now * 0.85 * 100) / 100) : "10"}"></label>
              <button class="btn ghost" type="submit">${al ? "Modifier" : "Créer l'alerte"}</button>
              ${al ? `<button class="btn ghost" type="button" id="al-del">Supprimer</button>` : ""}
            </form>
            ${al ? `<p class="small ${now && now <= al.below ? "pl up" : "muted"}">${now && now <= al.below ? "✅ Alerte déclenchée : la cote (" + eur(now) + ") est sous ton prix !" : "Alerte active : tu seras prévenu sur MGTCG quand la cote passera sous " + eur(al.below) + "."}</p>` : ""}`;
            })()}

            <h3>🧮 Outils</h3>
            <div class="links">
              <a href="#/outils/grading/${enc(MG.store.key(lang, card.id))}" data-close>🏅 La faire grader : rentable ?</a>
              <a href="#/outils/import/${enc(MG.store.key(lang, card.id))}" data-close>🗾 France ou Japon ?</a>
              ${Object.keys(owned).length ? `<a href="#/outils/ventes/${enc(MG.store.key(lang, card.id))}" data-close>💶 J'ai vendu cette carte</a>` : ""}
            </div>

            <h3>Trouver cette carte</h3>
            <div class="links">
              <a target="_blank" rel="noopener noreferrer" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${enc(card.name)}">Cardmarket</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.ebay.fr/sch/i.html?_nkw=${qShort}">eBay</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.leboncoin.fr/recherche?text=${qShort}">Leboncoin</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.vinted.fr/catalog?search_text=${qShort}">Vinted</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=${enc("site:pokecardex.com " + card.name + " " + (card.set ? card.set.name : ""))}">Voir sur PokéCardex</a>
            </div>
            <p class="warn">🛡 Avant d'acheter à un particulier : demande des photos recto/verso avec ton pseudo écrit à côté, méfie-toi des prix bien plus bas que la cote, et ne paie jamais « entre amis » (aucune protection en cas d'arnaque).</p>

            <h3>Vidéos</h3>
            <div class="links">
              <a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${q}">▶ Vidéos sur cette carte</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.youtube.com/results?search_query=${enc("pokemon " + card.name + " prix analyse")}">▶ Analyses de prix</a>
            </div>

            <h3>Faire grader</h3>
            <div class="links">
              <a target="_blank" rel="noopener noreferrer" href="https://www.pcagrade.com">PCA ${MG.flag("fr")}</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.cccgrading.com">CCC ${MG.flag("fr")}</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?q=${enc("CollectAura grading")}">CollectAura ${MG.flag("fr")}</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.psacard.com">PSA (USA)</a>
              <a target="_blank" rel="noopener noreferrer" href="https://www.cgccards.com">CGC (USA)</a>
            </div>
          </div>
        </div>`;

      $$("input[data-v]", box).forEach((inp) => inp.addEventListener("change", () => {
        MG.store.setVariant(lang, card, inp.dataset.v, inp.checked);
        render(); syncTile();
      }));
      $("#b-fav").addEventListener("click", () => { MG.store.toggleList("fav", lang, card); render(); syncTile(); });
      $("#b-wish").addEventListener("click", () => { MG.store.toggleList("wish", lang, card); render(); });
      $$("[data-close]", box).forEach((a) => a.addEventListener("click", closeModal));
      const fPaid = $("#f-paid", box);
      if (fPaid) fPaid.addEventListener("submit", (e) => {
        e.preventDefault();
        const f = new FormData(fPaid);
        const raw = String(f.get("price") || "").replace(",", ".").trim();
        const price = raw === "" ? null : parseFloat(raw);
        if (price != null && (isNaN(price) || price < 0 || price > 1e6)) { toast("Prix invalide"); return; }
        MG.store.setPaid(lang, card, price, String(f.get("date") || "").slice(0, 10));
        toast(price == null ? "Prix d'achat retiré" : "Prix d'achat enregistré ✓");
        render();
      });
      const fAlert = $("#f-alert", box);
      fAlert.addEventListener("submit", (e) => {
        e.preventDefault();
        const below = parseFloat(String(new FormData(fAlert).get("below") || "").replace(",", "."));
        if (!(below > 0 && below <= 1e6)) { toast("Indique un prix valide"); return; }
        MG.store.setAlert(lang, card, below);
        toast("🔔 Alerte enregistrée");
        render();
      });
      const alDel = $("#al-del", box);
      if (alDel) alDel.addEventListener("click", () => { MG.store.setAlert(lang, card, null); toast("Alerte supprimée"); render(); });
    };

    // Met à jour la tuile derrière la fenêtre
    const syncTile = () => {
      const tile = document.querySelector(`.tile[data-id="${CSS.escape(card.id)}"][data-lang="${CSS.escape(lang)}"]`);
      if (tile) refreshTile(tile, card, lang);
    };
    render();
  }

  function closeModal() {
    $("#modal").hidden = true;
    document.body.classList.remove("noscroll");
  }

  /* ================== NAVIGATION ================== */
  function route() {
    if (cleanup) { cleanup(); cleanup = null; }
    closeModal();
    const hash = location.hash.replace(/^#\/?/, "");
    const [page, ...rest] = hash.split("/");
    const arg = decodeURIComponent(rest.join("/") || "");
    $$(".nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#/" + page));
    window.scrollTo(0, 0);
    switch (page) {
      case "serie": return pageSerie(arg);
      case "set": {
        // Lien du type #/set/sv03.5/ja : ouvre le set dans une langue précise
        const [setId, l] = rest.map(decodeURIComponent);
        if (l && l !== MG.store.lang && MG.LANGS.some((x) => x.code === l)) { MG.store.setLang(l); $("#lang").value = l; }
        return pageSet(setId);
      }
      case "recherche": return pageSearch(arg);
      case "collection": return pageCollection();
      case "favoris": return pageLists("fav");
      case "wishlist": return pageLists("wish");
      case "mentions": return pageLegal();
      default:
        // Pages ajoutées par d'autres fichiers (ex : auth.js → connexion, compte, admin)
        if (MG.routes[page]) return MG.routes[page](arg);
        return pageHome();
    }
  }
  MG.route = route;

  // Outils partagés avec les autres fichiers (auth.js…)
  MG.ui = { $, $$, esc, enc, toast, loading, view, fmtDate, eur, openCard };

  function init() {
    // Menu des langues
    const sel = $("#lang");
    sel.innerHTML = MG.LANGS.map((l) => `<option value="${l.code}">${esc(l.label)}</option>`).join("");
    const showFlag = () => { const f = $("#lang-flag"); if (f) f.innerHTML = MG.flag(sel.value, langInfo(sel.value).label); };
    showFlag();
    sel.addEventListener("change", showFlag);
    sel.value = MG.store.lang;
    sel.addEventListener("change", () => {
      MG.store.setLang(sel.value);
      toast("Cartes affichées en " + langInfo(sel.value).label.toLowerCase());
      // Les sets sont différents selon la langue : on revient aux séries
      const page = location.hash.split("/")[1] || "";
      if (["serie", "set"].includes(page)) location.hash = "#/"; else route();
    });

    // Barre de recherche
    $("#search").addEventListener("submit", (e) => {
      e.preventDefault();
      const q = $("#q").value.trim().slice(0, 60);
      if (q) location.hash = "#/recherche/" + enc(q);
    });

    // Fenêtre carte
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

    // Menu mobile
    $("#burger").addEventListener("click", () => document.body.classList.toggle("menu-open"));
    $$(".nav a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-open")));

    $("#year").textContent = new Date().getFullYear();
    window.addEventListener("hashchange", route);
    route();
  }

  document.addEventListener("DOMContentLoaded", init);
})(window.MG);
