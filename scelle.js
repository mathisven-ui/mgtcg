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

  /* ---------------- Page catalogue ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.scelles = async function () {
    const { view, loading, esc } = ui();
    const a = auth();
    if (!a || !a.enabled) {
      view().innerHTML = `<div class="state"><p>📦 Les produits scellés arrivent dès que les comptes sont activés.</p></div>`;
      return;
    }
    view().innerHTML = loading("Chargement des produits scellés…");
    const ok = await load(true);
    if (!ok) {
      view().innerHTML = `<div class="state"><p>😕 Impossible de charger les produits.</p><p class="muted small">(Admin : as-tu lancé <code>supabase-scelle.sql</code> dans Supabase ?)</p></div>`;
      return;
    }
    const isAdmin = a.isAdmin && a.isAdmin();
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>📦 Produits scellés</h1>
        <p class="muted">ETB, displays, UPC, coffrets… Leur prix de sortie, leur cote actuelle et ce que tu possèdes.</p>
      </div></header>

      <div class="toolbar static">
        <div class="chips" id="types">
          <button class="chip active" data-t="all">Tous</button>
          ${["ETB", "Display", "UPC", "Coffret", "Tripack", "Booster"].map((t) => `<button class="chip" data-t="${t}">${t}</button>`).join("")}
          <button class="chip" data-t="mine">⭐ Les miens</button>
        </div>
        <input id="sq" type="search" placeholder="Rechercher (ex : 151, Dracaufeu…)" maxlength="60" aria-label="Rechercher un produit">
        <select id="slang" aria-label="Langue">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === S.lang ? "selected" : ""}>${v}</option>`).join("")}<option value="all">Toutes langues</option></select>
        <button class="btn" id="propose">＋ Proposer un produit</button>
        ${isAdmin ? `<button class="btn ghost" id="gen">⚙ Ajouter les produits d'un set</button>` : ""}
      </div>

      <div id="sealed-grid" class="sealed-grid"></div>
      <p class="disclaimer">La « cote » est la médiane des prix signalés par les membres sur 30 jours (ou 90 jours s'il y en a peu). Ce sont des prix constatés, pas des conseils d'achat ou d'investissement. Vérifie toujours le prix sur Cardmarket avant d'acheter ou de vendre.</p>`;

    const grid = document.getElementById("sealed-grid");
    const render = () => renderGrid(grid);
    document.querySelectorAll("#types [data-t]").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("#types [data-t]").forEach((x) => x.classList.toggle("active", x === b));
      S.filter = b.dataset.t; render();
    }));
    document.getElementById("sq").addEventListener("input", (e) => { S.q = e.target.value.trim().toLowerCase(); render(); });
    document.getElementById("slang").addEventListener("change", (e) => { S.lang = e.target.value; render(); });
    document.getElementById("propose").addEventListener("click", openPropose);
    const gen = document.getElementById("gen");
    if (gen) gen.addEventListener("click", openGenerator);
    render();
  };

  function renderGrid(grid) {
    const { esc } = ui();
    let list = S.products.filter((p) => p.status === "approved");
    if (S.lang !== "all") list = list.filter((p) => p.lang === S.lang);
    if (S.filter === "mine") list = list.filter((p) => MG.store.sealed(p.id));
    else if (S.filter !== "all") list = list.filter((p) => p.type === S.filter);
    if (S.q) list = list.filter((p) => (p.name + " " + (p.set_name || "") + " " + (p.serie || "")).toLowerCase().includes(S.q));

    if (!list.length) {
      grid.innerHTML = `<div class="state"><p>${S.products.length ? "Aucun produit ne correspond à ta recherche." : "Le catalogue est encore vide."}</p>
        <p class="muted small">Tu ne trouves pas un produit ? Propose-le avec « ＋ Proposer un produit ».</p></div>`;
    } else {
      grid.innerHTML = list.slice(0, 300).map((p) => {
        const c = cote(p.id);
        const own = MG.store.sealed(p.id);
        const evo = c && p.msrp ? ((c.value - p.msrp) / p.msrp) * 100 : null;
        return `<button class="sealed-card" data-id="${esc(p.id)}">
          <div class="sc-top"><span class="sc-type">${esc(p.type)}</span><span class="muted small">${LANGS[p.lang] || ""}</span>${own ? `<span class="sc-own">⭐ ×${own.qty}</span>` : ""}</div>
          <b class="sc-name">${esc(p.name)}</b>
          <span class="muted small">${esc(p.set_name || p.serie || "")}${p.release_date ? " · " + esc(fmtDay(p.release_date)) : ""}</span>
          <div class="sc-prices">
            <div><span>Prix de sortie</span><strong>${p.msrp ? eur(p.msrp) : "—"}</strong></div>
            <div><span>Cote membres</span><strong>${c ? eur(c.value) : "—"}</strong></div>
          </div>
          ${evo != null ? `<span class="sc-evo ${evo >= 0 ? "up" : "down"}">${evo >= 0 ? "▲ +" : "▼ "}${evo.toFixed(0)} % depuis la sortie</span>` : `<span class="muted small">${c ? c.n + " prix signalé" + (c.n > 1 ? "s" : "") : "Aucun prix signalé"}</span>`}
        </button>`;
      }).join("");
    }
    grid.querySelectorAll(".sealed-card").forEach((b) => b.addEventListener("click", () => openProduct(b.dataset.id)));
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
          <div><span>Cote membres (${c ? c.days : WINDOW_DAYS} j)</span><strong>${c ? eur(c.value) : "—"}</strong></div>
          <div><span>Évolution</span><strong class="${evo == null ? "" : evo >= 0 ? "up" : "down"}">${evo == null ? "—" : (evo >= 0 ? "▲ +" : "▼ ") + evo.toFixed(0) + " %"}</strong></div>
          <div><span>Prix signalés</span><strong>${prices.length}</strong></div>
        </div>

        <h3>Évolution des prix signalés</h3>
        <div id="p-chart"></div>

        ${a.user ? `
        <h3>Mes ${esc(p.type)}</h3>
        <form class="mini-form" id="f-own">
          <label>Quantité<input type="number" name="qty" min="0" max="999" step="1" value="${own ? own.qty : ""}" placeholder="0"></label>
          <label>Prix payé / unité (€)<input type="number" name="paid" min="0" max="100000" step="0.01" value="${own && own.paid != null ? own.paid : ""}" placeholder="${p.msrp || ""}"></label>
          <label>Date<input type="date" name="date" value="${own ? esc(own.date) : ""}"></label>
          <button class="btn ghost" type="submit">Enregistrer</button>
        </form>
        ${plUnit != null ? `<p class="pl ${plUnit >= 0 ? "up" : "down"}">${plUnit >= 0 ? "▲ +" : "▼ "}${eur(plUnit * own.qty)} de plus-value latente sur tes ${own.qty} exemplaire${own.qty > 1 ? "s" : ""} <span class="muted small">(selon la cote membres)</span></p>` : ""}

        <h3>J'ai vu ce produit à…</h3>
        <form class="mini-form" id="f-price">
          <label>Prix (€)<input type="number" name="price" min="0.01" max="100000" step="0.01" required></label>
          <label>Où ?<select name="source">${SOURCES.map((s) => `<option>${s}</option>`).join("")}</select></label>
          <button class="btn" type="submit">Signaler ce prix</button>
          <p class="form-msg" id="pr-msg" role="alert"></p>
        </form>
        <p class="muted small">Indique un prix réellement vu (annonce, boutique, vente). Ça aide toute la communauté à connaître la vraie cote.</p>`
        : `<p class="small" style="margin-top:14px"><a href="#/connexion">Connecte-toi</a> pour suivre tes produits et signaler des prix.</p>`}

        ${prices.length ? `<h3>Derniers prix signalés</h3>
        <ul class="restock-list price-list">${prices.slice(-10).reverse().map((r) => `<li><div><span><b>${eur(r.price)}</b> · ${esc(r.source)}</span><small>${esc(fmtDay(r.created_at))}</small></div>
          ${(a.user && (r.user_id === a.user.id || (a.isAdmin && a.isAdmin()))) ? `<button class="link-btn small" data-pdel="${esc(r.id)}">Supprimer</button>` : ""}</li>`).join("")}</ul>` : ""}

        <h3>Comparer les prix</h3>
        <div class="links">
          <a target="_blank" rel="noopener noreferrer" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q}">Cardmarket</a>
          <a target="_blank" rel="noopener noreferrer" href="https://www.ebay.fr/sch/i.html?_nkw=${q}">eBay</a>
          <a target="_blank" rel="noopener noreferrer" href="https://www.vinted.fr/catalog?search_text=${q}">Vinted</a>
          <a target="_blank" rel="noopener noreferrer" href="https://www.leboncoin.fr/recherche?text=${q}">Leboncoin</a>
        </div>
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
    openModal(`<h2 id="modal-title">Ajouter les produits d'un set</h2>
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
        setSel.innerHTML = (s.sets || []).slice().reverse().map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("");
      } catch (e) { setSel.innerHTML = `<option>Erreur</option>`; }
    };
    form.serie.addEventListener("change", loadSets);
    loadSets();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = document.getElementById("gen-msg");
      const types = new FormData(form).getAll("types");
      if (!types.length) { msg.textContent = "Coche au moins un produit."; msg.className = "form-msg err"; return; }
      let set;
      try { set = await MG.api.set(lang, setSel.value); } catch (err) { msg.textContent = "Extension introuvable."; msg.className = "form-msg err"; return; }
      const serieName = form.serie.options[form.serie.selectedIndex].text;
      const pLang = LANG_MAP[lang] || "autre";
      const existing = new Set(S.products.map((p) => p.name.toLowerCase()));
      const rows = types.map((t) => ({
        name: `${t} ${set.name}`.slice(0, 120), type: t, lang: pLang, serie: serieName.slice(0, 80), set_name: String(set.name).slice(0, 80),
        release_date: /^\d{4}-\d{2}-\d{2}/.test(set.releaseDate || "") ? set.releaseDate.slice(0, 10) : null,
        status: "approved", created_by: auth().user.id,
      })).filter((r) => !existing.has(r.name.toLowerCase()));
      if (!rows.length) { msg.textContent = "Ces produits existent déjà."; msg.className = "form-msg err"; return; }
      const { error } = await auth().client.from("products").insert(rows);
      if (error) { msg.textContent = "Erreur : " + (error.message || "réessaie"); msg.className = "form-msg err"; return; }
      msg.textContent = `✅ ${rows.length} produit${rows.length > 1 ? "s" : ""} ajouté${rows.length > 1 ? "s" : ""} : ${rows.map((r) => r.name).join(", ")}`;
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

  /* ---------------- Espace admin : produits à valider ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc, fmtDate } = ui();
    const a = auth();
    const { data: pending, error } = await a.client.from("products").select("id,name,type,lang,set_name,release_date,msrp,content,created_at").eq("status", "pending").order("created_at").limit(100);
    if (error) throw error;
    el.innerHTML = `<section><div class="section-head"><h2>📦 Produits scellés à valider (${pending.length})</h2></div>
      ${pending.length ? `<div class="mod-list">${pending.map((p) => `<div class="mod-item" data-id="${esc(p.id)}">
        <div><b>${esc(p.name)}</b> · ${esc(p.type)} · ${LANGS[p.lang] || ""}<br>
        <span class="small muted">${esc(p.set_name || "")}${p.release_date ? " · sortie " + esc(p.release_date) : ""}${p.msrp ? " · " + eur(Number(p.msrp)) : ""}${p.content ? " · " + esc(p.content) : ""}</span><br>
        <span class="small muted">proposé le ${esc(fmtDate(p.created_at))}</span></div>
        <div class="row"><button class="btn" data-act="approved">Valider</button><button class="btn ghost" data-act="rejected">Refuser</button></div></div>`).join("")}</div>`
      : `<p class="muted">Aucun produit en attente.</p>`}</section>`;
    el.querySelectorAll(".mod-item [data-act]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".mod-item").dataset.id;
      const { error: err } = await a.client.from("products").update({ status: b.dataset.act }).eq("id", id);
      ui().toast(err ? "Erreur" : b.dataset.act === "approved" ? "Produit validé ✓" : "Produit refusé");
      if (!err) b.closest(".mod-item").remove();
    }));
  });
})(window.MG);
