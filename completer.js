/* ==========================================================
   MGTCG — completer.js   (V3)
   « Compléter mon set au meilleur prix » : liste d'achat des cartes
   manquantes d'une extension, de la moins chère à la plus chère,
   coût total, budget, astuces pour payer moins et liens d'achat.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const enc = encodeURIComponent;
  const BULK = 1; // cartes à moins de 1 € : souvent moins cher en lot
  const S = { stop: null, opts: { goal: "complet", price: "trend", budget: "", max: "" } };
  try { Object.assign(S.opts, JSON.parse(localStorage.getItem("mgtcg:completer") || "{}")); } catch (e) { /* rien */ }
  const saveOpts = () => { try { localStorage.setItem("mgtcg:completer", JSON.stringify(S.opts)); } catch (e) { /* rien */ } };

  const GOALS = {
    complet: "Set complet (cartes numérotées, sans les secrètes)",
    secretes: "Set complet + cartes secrètes",
    master: "Master set (toutes les versions : normale, reverse, holo…)",
  };
  const PRICES = { trend: "Prix de tendance Cardmarket (conseillé)", low: "Prix le plus bas affiché (état et vendeur variables)" };

  // Prix d'une version précise d'une carte
  function priceOf(card, variant, mode) {
    const cm = card.cardmarket;
    if (!cm) return 0;
    const n = mode === "low" ? (cm.low || cm.trend || cm.avg) : (cm.trend || cm.avg);
    const h = mode === "low" ? (cm["low-holo"] || cm["trend-holo"] || cm["avg-holo"]) : (cm["trend-holo"] || cm["avg-holo"]);
    return (variant === "normal" || variant === "firstEdition" ? (n || h) : (h || n)) || 0;
  }
  const isSecret = (card, official) => !/^\d+$/.test(String(card.localId)) || parseInt(card.localId, 10) > official;
  const variantsOf = (card) => { const v = MG.VARIANTS.filter((x) => card.variants && card.variants[x]); return v.length ? v : ["normal"]; };

  /* ---------------- Liste des sets commencés ---------------- */
  const R = (MG.routes = MG.routes || {});
  let hooked = false;
  R.completer = function (arg) {
    if (!hooked && MG.on) { hooked = true; MG.on("store", () => { if (S.render && location.hash.startsWith("#/completer/") && !S.stop) S.render(); }); }
    if (S.stop) { S.stop(); S.stop = null; }
    const [setId, l] = String(arg || "").split("/");
    if (setId) return pageSet(setId, MG.LANGS.some((x) => x.code === l) ? l : MG.store.lang);
    const { view, esc } = ui();
    const groups = new Map();
    for (const key of MG.store.ownedKeys()) {
      const m = MG.store.meta(key);
      if (!m || !m.setId) continue;
      const lang = key.slice(0, key.indexOf("|"));
      const gk = lang + "|" + m.setId;
      const g = groups.get(gk) || { lang, setId: m.setId, name: m.setName || m.setId, total: m.setTotal || 0, n: 0 };
      g.n++; if (m.setTotal) g.total = m.setTotal;
      groups.set(gk, g);
    }
    const list = [...groups.values()].sort((a, b) => (b.total ? b.n / b.total : 0) - (a.total ? a.n / a.total : 0));
    const flag = (l) => MG.flag(l, (MG.LANGS.find((x) => x.code === l) || {}).label || l);
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🎯 Compléter mes sets</h1>
        <p class="muted">Choisis une extension : MGTCG calcule ce qu'il te manque, combien ça coûte au total et par où commencer pour payer le moins cher possible.</p>
      </div></header>
      ${list.length ? `<div class="cp-sets">${list.map((g) => {
        const pct = g.total ? Math.min(100, Math.round((g.n / g.total) * 100)) : 0;
        return `<a class="cp-set" href="#/completer/${enc(g.setId)}/${enc(g.lang)}">
          <span class="cp-set-name">${flag(g.lang)} <b>${esc(g.name)}</b></span>
          <span class="bar"><span style="width:${pct}%"></span></span>
          <span class="muted small">${g.n}${g.total ? " / " + g.total : ""} cartes · ${pct} %</span></a>`;
      }).join("")}</div>` : `<div class="state"><p>Tu n'as encore commencé aucun set. Ouvre une extension et coche tes cartes, ou importe ta collection.</p><div class="row" style="justify-content:center"><a class="btn" href="#/">Parcourir les séries</a><a class="btn ghost" href="#/importer">📥 Importer ma collection</a></div></div>`}
      <p class="muted small">Pour une extension que tu n'as pas commencée : ouvre-la depuis <a class="accent-link" href="#/">Séries</a> puis clique sur « 🎯 Compléter au meilleur prix ».</p>`;
  };

  /* ---------------- Une extension ---------------- */
  async function pageSet(setId, lang) {
    const { view, loading, esc } = ui();
    view().innerHTML = loading("Chargement de l'extension…");
    let set;
    try { set = await MG.api.set(lang, setId); }
    catch (e) { view().innerHTML = `<div class="state"><p>Extension introuvable.</p><a class="btn" href="#/completer">Retour</a></div>`; return; }
    const briefs = set.cards || [];
    const official = (set.cardCount && set.cardCount.official) || briefs.length;
    const cards = new Map();
    const o = S.opts;

    view().innerHTML = `
      <nav class="crumbs"><a href="#/completer">Compléter mes sets</a> › <a href="#/set/${enc(set.id)}/${enc(lang)}">${esc(set.name)}</a></nav>
      <header class="page-head"><div>
        <h1>🎯 Compléter ${esc(set.name)} <span class="flag">${MG.flag(lang, (MG.LANGS.find((x) => x.code === lang) || {}).label || lang)}</span></h1>
        <p class="muted">Ta liste d'achat, de la carte la moins chère à la plus chère. Les prix sont des estimations Cardmarket, pas des conseils d'achat.</p>
      </div></header>
      <section class="tool-card">
        <form id="cp-form" class="cp-opts">
          <label>Objectif<select name="goal">${Object.entries(GOALS).map(([k, v]) => `<option value="${k}" ${o.goal === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label>Prix utilisé<select name="price">${Object.entries(PRICES).map(([k, v]) => `<option value="${k}" ${o.price === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <label>Mon budget (€)<input name="budget" type="number" min="0" step="1" inputmode="decimal" placeholder="ex : 50" value="${esc(o.budget)}"></label>
          <label>Ignorer les cartes à plus de (€)<input name="max" type="number" min="0" step="1" inputmode="decimal" placeholder="aucune limite" value="${esc(o.max)}"></label>
        </form>
      </section>
      <div id="cp-body"><p class="muted" id="cp-prog">⏳ Récupération des prix… 0 / ${briefs.length}</p></div>`;

    const body = document.getElementById("cp-body");
    const form = document.getElementById("cp-form");
    form.addEventListener("input", () => {
      const f = new FormData(form);
      Object.assign(o, { goal: f.get("goal"), price: f.get("price"), budget: f.get("budget"), max: f.get("max") });
      saveOpts();
      if (cards.size >= briefs.length) render();
    });

    let done = 0;
    if (!briefs.length) { body.innerHTML = `<p class="muted">Aucune carte dans cette extension.</p>`; return; }
    S.stop = MG.loadQueue(briefs.map((c) => c.id), lang, (card, id) => {
      done++;
      cards.set(card ? card.id : id, card || briefs.find((b) => b.id === id));
      if (done < briefs.length) { const p = document.getElementById("cp-prog"); if (p && done % 8 === 0) p.textContent = `⏳ Récupération des prix… ${done} / ${briefs.length}`; return; }
      S.stop = null;
      render();
    }, 6);

    function buildList() {
      const rows = [];
      for (const b of briefs) {
        const c = cards.get(b.id) || b;
        if (o.goal === "complet" && isSecret(c, official)) continue;
        const owned = MG.store.owned(lang, c.id) || {};
        const vs = variantsOf(c);
        if (o.goal === "master") {
          vs.filter((v) => !owned[v]).forEach((v) => rows.push({ c, v, p: priceOf(c, v, o.price) }));
        } else if (!Object.keys(owned).length) {
          // Une seule carte suffit : on prend la version la moins chère
          const best = vs.map((v) => ({ v, p: priceOf(c, v, o.price) })).sort((a, b) => (a.p || 1e9) - (b.p || 1e9))[0];
          rows.push({ c, v: best.v, p: best.p });
        }
      }
      return rows.sort((a, b) => (a.p || 1e9) - (b.p || 1e9));
    }

    S.render = render;
    function render() {
      if (!body.isConnected) return;
      const { eur, toast } = ui();
      const all = buildList();
      const max = parseFloat(o.max) || 0;
      const budget = parseFloat(o.budget) || 0;
      const rows = max ? all.filter((r) => !r.p || r.p <= max) : all;
      const ignored = all.length - rows.length;
      const priced = rows.filter((r) => r.p);
      const total = priced.reduce((t, r) => t + r.p, 0);
      const noPrice = rows.length - priced.length;
      // Budget : on prend d'abord les moins chères
      let spent = 0, inBudget = 0;
      if (budget) for (const r of priced) { if (spent + r.p > budget) break; spent += r.p; inBudget++; r.ok = true; }
      const bulk = priced.filter((r) => r.p < BULK);
      const bulkSum = bulk.reduce((t, r) => t + r.p, 0);
      const top = priced.slice(-5);
      const topSum = top.reduce((t, r) => t + r.p, 0);
      const goalTotal = o.goal === "complet" ? briefs.filter((b) => !isSecret(cards.get(b.id) || b, official)).length : briefs.length;
      const q = (s) => enc(s);
      const searchName = (r) => `${r.c.name} ${r.c.localId} ${set.name}`;

      if (!all.length) {
        body.innerHTML = `<section class="tool-card"><p>🎉 Bravo, il ne te manque rien pour cet objectif !</p>${o.goal !== "master" ? `<p class="muted small">Prochain défi : passe l'objectif sur « Master set ».</p>` : ""}</section>`;
        return;
      }
      body.innerHTML = `
        <div class="imp-stats cp-stats">
          <div><b>${rows.length}</b><span>${o.goal === "master" ? "versions" : "cartes"} à trouver${o.goal !== "master" ? " sur " + goalTotal : ""}</span></div>
          <div><b>${eur(total)}</b><span>coût total estimé${noPrice ? ` (+ ${noPrice} sans prix)` : ""}</span></div>
          <div><b>${budget ? inBudget : priced.length ? eur(priced[Math.floor((priced.length - 1) / 2)].p) : "—"}</b><span>${budget ? `cartes avec ${eur(budget)} (${eur(spent)} dépensés)` : "prix médian d'une carte"}</span></div>
        </div>
        ${ignored ? `<p class="muted small">${ignored} carte${ignored > 1 ? "s" : ""} à plus de ${eur(max)} ignorée${ignored > 1 ? "s" : ""}.</p>` : ""}

        <section class="tool-card cp-tips">
          <h2>💡 Pour payer moins cher</h2>
          <ul>
            ${bulk.length >= 10 ? `<li><b>${bulk.length} cartes valent moins de ${eur(BULK)}</b> (${eur(bulkSum)} au total). Les frais de port coûtent souvent plus que la carte : cherche plutôt un <b>lot</b> de cette extension —
              <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.leboncoin.fr/recherche?text=${q("lot cartes pokemon " + set.name)}">Leboncoin</a> ·
              <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.vinted.fr/catalog?search_text=${q("lot pokemon " + set.name)}">Vinted</a> ·
              <a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.ebay.fr/sch/i.html?_nkw=${q("lot cartes pokemon " + set.name)}">eBay</a>.</li>` : ""}
            ${priced.length > 10 && total ? `<li>Les <b>5 cartes les plus chères</b> représentent <b>${Math.round((topSum / total) * 100)} %</b> du coût total (${eur(topSum)}). Garde-les pour la fin, ou guette les baisses avec une <b>alerte de prix</b> (fiche de la carte).</li>` : ""}
            <li>Sur Cardmarket, acheter plusieurs cartes <b>chez le même vendeur</b> évite de payer plusieurs fois les frais de port. Leur « Shopping Wizard » cherche la combinaison de vendeurs la moins chère pour une liste de cartes.</li>
            <li>Vérifie l'<b>état</b> (Near Mint, Excellent…) et la <b>langue</b> avant d'acheter : le prix le plus bas est souvent une carte abîmée ou d'une autre langue.</li>
            <li>Échanger tes doubles avec d'autres collectionneurs (boutiques, conventions de l'<a class="accent-link" href="#/agenda">Agenda</a>) ne coûte rien.</li>
          </ul>
        </section>

        <div class="row cp-actions">
          <button class="btn ghost" id="cp-wish">⭐ Tout mettre dans ma wishlist</button>
          <button class="btn ghost" id="cp-csv">⬇ Liste d'achat (CSV)</button>
          <button class="btn ghost" id="cp-copy">📋 Copier la liste</button>
        </div>
        <div class="table-wrap"><table class="table cp-table">
          <thead><tr><th>N°</th><th>Carte</th><th>Version</th><th class="right">Prix</th><th class="right">Cumul</th><th>Acheter</th><th></th></tr></thead>
          <tbody>${(() => { let cum = 0; return rows.map((r) => {
            cum += r.p || 0;
            const R = MG.rarity(r.c.rarity);
            return `<tr class="${budget && !r.ok ? "cp-out" : ""}" data-id="${esc(r.c.id)}" data-v="${esc(r.v)}">
              <td class="muted">${esc(r.c.localId)}</td>
              <td><button class="link-btn cp-open"><b>${esc(r.c.name)}</b></button> <span class="rar ${R.cls}" title="${esc(r.c.rarity || "")}">${esc(R.icon)}</span></td>
              <td class="small">${esc(MG.VARIANT_LABELS[r.v] || r.v)}</td>
              <td class="right"><b>${r.p ? eur(r.p) : "—"}</b></td>
              <td class="right muted small">${eur(cum)}</td>
              <td class="cp-links small">
                <a target="_blank" rel="noopener noreferrer" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q(r.c.name)}">CM</a>
                <a target="_blank" rel="noopener noreferrer" href="https://www.ebay.fr/sch/i.html?_nkw=${q(searchName(r))}">eBay</a>
                <a target="_blank" rel="noopener noreferrer" href="https://www.vinted.fr/catalog?search_text=${q(searchName(r))}">Vinted</a>
                <a target="_blank" rel="noopener noreferrer" href="https://www.leboncoin.fr/recherche?text=${q(searchName(r))}">LBC</a></td>
              <td><button class="btn ghost small cp-got" title="Je l'ai : l'ajouter à ma collection">✓ Je l'ai</button></td></tr>`;
          }).join(""); })()}</tbody></table></div>
        <p class="disclaimer">Prix Cardmarket indicatifs (mis à jour une fois par jour), hors frais de port. ${budget ? "Les lignes grisées dépassent ton budget." : ""} MGTCG ne vend rien et ne touche aucune commission.</p>`;

      body.querySelectorAll(".cp-open").forEach((b) => b.addEventListener("click", () => ui().openCard(lang, b.closest("tr").dataset.id)));
      body.querySelectorAll(".cp-got").forEach((b) => b.addEventListener("click", () => {
        const tr = b.closest("tr");
        const card = cards.get(tr.dataset.id);
        if (card) { MG.store.setVariant(lang, card, tr.dataset.v, true); toast(`${card.name} ajoutée à ta collection ✓`); render(); }
      }));
      body.querySelector("#cp-wish").addEventListener("click", () => {
        let n = 0;
        const seen = new Set();
        rows.forEach((r) => { if (!seen.has(r.c.id) && !MG.store.isWish(lang, r.c.id)) { MG.store.toggleList("wish", lang, r.c); n++; } seen.add(r.c.id); });
        toast(n ? `${n} carte${n > 1 ? "s" : ""} ajoutée${n > 1 ? "s" : ""} à ta wishlist ⭐` : "Déjà toutes dans ta wishlist");
      });
      const lines = () => rows.map((r) => [r.c.localId, r.c.name, MG.VARIANT_LABELS[r.v] || r.v, r.c.rarity || "", r.p ? r.p.toFixed(2).replace(".", ",") : ""]);
      body.querySelector("#cp-csv").addEventListener("click", () => {
        const c = (x) => `"${String(x).replace(/"/g, '""')}"`;
        const csv = "﻿" + ["Numéro", "Carte", "Version", "Rareté", "Prix estimé (€)"].map(c).join(";") + "\n" + lines().map((l) => l.map(c).join(";")).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        a.download = `mgtcg-a-acheter-${set.id}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      body.querySelector("#cp-copy").addEventListener("click", async () => {
        const text = `${set.name} — ${rows.length} à trouver (${eur(total)})\n` + lines().map((l) => `#${l[0]} ${l[1]} (${l[2]})${l[4] ? " — " + l[4] + " €" : ""}`).join("\n");
        try { await navigator.clipboard.writeText(text); toast("Liste copiée ✓"); } catch (e) { window.prompt("Copie la liste :", text); }
      });
    }
  }

  // Une carte cochée ailleurs (fiche de la carte) → la liste se met à jour
  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/completer/")) S.render = null; if (!location.hash.startsWith("#/completer") && S.stop) { S.stop(); S.stop = null; } });
  MG.completer = { priceOf, isSecret };
})(window.MG);
