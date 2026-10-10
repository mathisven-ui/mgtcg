/* ==========================================================
   MGTCG — portefeuille.js   (V3)
   Portefeuille intelligent : répartition de la collection,
   plus-values, simulateur de vente, simulateur d'achat et
   scénario « et si le marché bougeait ? ».
   Ce sont des calculs, pas des conseils financiers.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const enc = encodeURIComponent;
  // Frais vendeur particulier en France (sources : margeoapp.com MAJ 23/09/2026, justgeek.fr 01/09/2026)
  const FEES = {
    cardmarket: { label: "Cardmarket (5 % + 0,01 € par carte)", pct: 5, fixed: 0.01 },
    ebay: { label: "eBay particulier (0 % depuis le 1er sept. 2026)", pct: 0, fixed: 0 },
    vinted: { label: "Vinted / Leboncoin (0 % pour le vendeur)", pct: 0, fixed: 0 },
    main: { label: "En main propre (0 %)", pct: 0, fixed: 0 },
    pro: { label: "eBay professionnel (≈ 13 %)", pct: 13, fixed: 0 },
  };
  const S = { tab: "repartition", sell: new Set(), buy: new Map(), dim: "set" };
  const st = () => MG.store;
  const split = (k) => [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
  const langLabel = (l) => (MG.LANGS.find((x) => x.code === l) || {}).label || l;

  function rows() {
    return st().ownedKeys().map((k) => {
      const m = st().meta(k) || {};
      const [lang, id] = split(k);
      return { k, lang, id, m, v: st().valueOf(k) || 0, o: st().owned(lang, id) || {}, paid: st().paid(k) };
    });
  }

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.portefeuille = function (arg) {
    const { view, eur, esc } = ui();
    if (["repartition", "vente", "achat", "scenario"].includes(arg)) S.tab = arg;
    const all = rows();
    const value = all.reduce((t, r) => t + r.v, 0);
    const paid = all.filter((r) => r.paid);
    const invested = paid.reduce((t, r) => t + r.paid.price, 0);
    const valuePaid = paid.reduce((t, r) => t + r.v, 0);
    const top10 = all.slice().sort((a, b) => b.v - a.v).slice(0, 10).reduce((t, r) => t + r.v, 0);
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>💼 Mon portefeuille</h1>
        <p class="muted">Comprendre de quoi est faite ta collection et simuler une vente ou un achat avant de te décider. Ce sont des calculs à partir des prix Cardmarket, pas des conseils : c'est toi qui décides.</p>
      </div></header>
      ${all.length ? `
      <div class="imp-stats pf4">
        <div><b>${eur(value)}</b><span>valeur estimée (${all.length} cartes)</span></div>
        <div><b>${paid.length ? eur(invested) : "—"}</b><span>investi (${paid.length} carte${paid.length > 1 ? "s" : ""} avec prix d'achat)</span></div>
        <div><b class="${valuePaid - invested >= 0 ? "up" : "down"}">${paid.length ? (valuePaid - invested >= 0 ? "+" : "") + eur(valuePaid - invested) : "—"}</b><span>plus-value latente sur ces cartes</span></div>
        <div><b>${value ? Math.round((top10 / value) * 100) : 0} %</b><span>de la valeur dans tes 10 meilleures cartes</span></div>
      </div>
      <div class="chips tool-tabs">
        <a class="chip ${S.tab === "repartition" ? "active" : ""}" href="#/portefeuille/repartition">📊 Répartition</a>
        <a class="chip ${S.tab === "vente" ? "active" : ""}" href="#/portefeuille/vente">💸 Simuler une vente</a>
        <a class="chip ${S.tab === "achat" ? "active" : ""}" href="#/portefeuille/achat">🛒 Simuler un achat</a>
        <a class="chip ${S.tab === "scenario" ? "active" : ""}" href="#/portefeuille/scenario">📈 Et si le marché bougeait ?</a>
      </div>
      <div id="pt-body"></div>` : `<div class="state"><p>Ta collection est vide : ajoute des cartes pour voir ton portefeuille.</p><a class="btn" href="#/">Parcourir les séries</a> <a class="btn ghost" href="#/importer">📥 Importer</a></div>`}
      <p class="disclaimer">Valeurs estimées avec les prix Cardmarket de cartes non gradées (mis à jour une fois par jour). Le prix auquel tu vendras réellement dépend de l'état, de la langue et de la demande. MGTCG ne donne aucun conseil financier ni fiscal.</p>`;
    if (!all.length) return;
    const body = document.getElementById("pt-body");
    if (S.tab === "vente") return tabSell(body, all);
    if (S.tab === "achat") return tabBuy(body, all, value, invested);
    if (S.tab === "scenario") return tabScenario(body, all, value);
    return tabSplit(body, all, value, paid);
  };

  /* ---------------- Répartition ---------------- */
  function tabSplit(body, all, value, paid) {
    const { esc, eur } = ui();
    const DIMS = { set: "Par extension", lang: "Par langue", rarity: "Par rareté", variant: "Par version" };
    const groups = new Map();
    const add = (label, v, n = 1) => { const g = groups.get(label) || { label, v: 0, n: 0 }; g.v += v; g.n += n; groups.set(label, g); };
    for (const r of all) {
      if (S.dim === "set") add(r.m.setName || r.m.setId || "Inconnue", r.v);
      else if (S.dim === "lang") add(langLabel(r.lang), r.v);
      else if (S.dim === "rarity") add(r.m.rarity || "Rareté inconnue", r.v);
      else for (const v of Object.keys(r.o)) {
        const p = v === "normal" ? (r.m.price || r.m.priceHolo) : (r.m.priceHolo || r.m.price);
        add(MG.VARIANT_LABELS[v] || v, p || 0);
      }
    }
    let list = [...groups.values()].sort((a, b) => b.v - a.v || b.n - a.n);
    if (list.length > 12) {
      const rest = list.slice(11);
      list = list.slice(0, 11).concat({ label: `Autres (${rest.length})`, v: rest.reduce((t, g) => t + g.v, 0), n: rest.reduce((t, g) => t + g.n, 0) });
    }
    const tot = list.reduce((t, g) => t + g.v, 0) || 1;
    const gains = paid.map((r) => ({ r, pl: r.v - r.paid.price, pct: r.paid.price ? (r.v - r.paid.price) / r.paid.price : 0 }));
    const best = gains.filter((g) => g.pl > 0).sort((a, b) => b.pl - a.pl).slice(0, 5);
    const worst = gains.filter((g) => g.pl < 0).sort((a, b) => a.pl - b.pl).slice(0, 5);
    const line = (g) => `<li class="clickable" data-k="${esc(g.r.k)}"><span><b>${esc(g.r.m.name || g.r.k)}</b> <small class="muted">${esc(g.r.m.setName || "")}</small></span><span class="muted small">${eur(g.r.paid.price)} → ${eur(g.r.v)}</span><b class="${g.pl >= 0 ? "up" : "down"}">${g.pl >= 0 ? "+" : ""}${eur(g.pl)}</b></li>`;
    const biggest = list[0];
    body.innerHTML = `
      <section class="tool-card">
        <div class="section-head"><h2 style="margin:0">📊 De quoi est faite ma collection</h2>
          <div class="chips">${Object.entries(DIMS).map(([k, v]) => `<button class="chip ${S.dim === k ? "active" : ""}" data-dim="${k}">${v}</button>`).join("")}</div></div>
        <p class="muted small">Part de la <b>valeur</b> de ta collection${S.dim === "variant" ? " (chaque version possédée compte)" : ""}.</p>
        <div class="pt-bars">${list.map((g) => `<div class="pt-bar"><span class="pt-l">${esc(g.label)} <small class="muted">${g.n} carte${g.n > 1 ? "s" : ""}</small></span>
          <span class="bar"><span style="width:${Math.max(0.5, (g.v / tot) * 100)}%"></span></span><span class="pt-v"><b>${Math.round((g.v / tot) * 100)} %</b> <small class="muted">${eur(g.v)}</small></span></div>`).join("")}</div>
        ${biggest && biggest.v / tot > 0.5 && list.length > 1 ? `<p class="small">💡 Plus de la moitié de la valeur est dans « ${esc(biggest.label)} » : si ses prix bougent, toute ta collection bouge avec. Teste-le dans « 📈 Et si le marché bougeait ? ».</p>` : ""}
      </section>
      <section class="tool-card">
        <h2>📈 Mes plus- et moins-values</h2>
        ${paid.length ? `<div class="tr-two">
          <div><h3>Meilleures</h3>${best.length ? `<ul class="pt-list">${best.map(line).join("")}</ul>` : `<p class="muted small">Aucune carte en plus-value.</p>`}</div>
          <div><h3>Moins bonnes</h3>${worst.length ? `<ul class="pt-list">${worst.map(line).join("")}</ul>` : `<p class="muted small">Aucune carte en moins-value.</p>`}</div>
        </div>` : ""}
        <p class="muted small">${all.length - paid.length} carte${all.length - paid.length > 1 ? "s" : ""} sans prix d'achat. Ajoute-le dans la fiche d'une carte (« Mon achat ») pour suivre tes plus-values.</p>
      </section>`;
    body.querySelectorAll("[data-dim]").forEach((b) => b.addEventListener("click", () => { S.dim = b.dataset.dim; tabSplit(body, all, value, paid); }));
    body.querySelectorAll("li[data-k]").forEach((li) => li.addEventListener("click", () => ui().openCard(...split(li.dataset.k))));
  }

  /* ---------------- Simulateur de vente ---------------- */
  function picker(list, selected, id, sub) {
    const { esc, eur } = ui();
    return `<input type="search" id="${id}-q" placeholder="Filtrer (nom, extension)…">
      <div class="tr-pick pt-pick" id="${id}">${list.map((r) => `<label class="tr-opt" data-s="${esc(((r.m.name || "") + " " + (r.m.setName || "")).toLowerCase())}"><input type="checkbox" value="${esc(r.k)}" ${selected.has(r.k) ? "checked" : ""}>
        <span class="grow"><b>${esc(r.m.name || r.k)}</b> <small class="muted">${esc(r.m.setName || "")} #${esc(r.m.localId || "")}</small></span><b class="pt-price">${r.v ? eur(r.v) : "—"}</b>${sub ? sub(r) : ""}</label>`).join("")}</div>`;
  }
  function bindPicker(body, id, selected, onChange) {
    const q = body.querySelector(`#${id}-q`);
    q.addEventListener("input", () => { const v = q.value.trim().toLowerCase(); body.querySelectorAll(`#${id} .tr-opt`).forEach((o) => { o.hidden = v && !o.dataset.s.includes(v); }); });
    body.querySelectorAll(`#${id} input[type=checkbox]`).forEach((i) => i.addEventListener("change", () => { if (i.checked) selected.add(i.value); else selected.delete(i.value); onChange(); }));
  }

  function tabSell(body, all) {
    const { esc, eur } = ui();
    const list = all.slice().sort((a, b) => b.v - a.v);
    [...S.sell].forEach((k) => { if (!list.some((r) => r.k === k)) S.sell.delete(k); });
    body.innerHTML = `
      <section class="tool-card">
        <h2>💸 Si je vendais ces cartes, combien je récupère ?</h2>
        <div class="pt-two">
          <div><h3>1. Choisis les cartes</h3>${picker(list, S.sell, "pt-sell")}
            <div class="row" style="margin-top:8px"><button class="link-btn small accent-link" id="pt-none">Tout décocher</button></div></div>
          <div>
            <h3>2. Les conditions</h3>
            <form id="pt-sf" class="pt-form">
              <label>Où je vends<select name="fee">${Object.entries(FEES).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join("")}</select></label>
              <label><span>Prix de vente : <b id="pt-pctv">90 %</b> de la cote</span><input type="range" name="pct" min="50" max="120" step="5" value="90"></label>
              <p class="muted small">Pour vendre vite, on vend souvent un peu sous la cote.</p>
              <div class="row">
                <label class="grow">Frais d'envoi par colis (€)<input type="number" name="ship" min="0" step="0.1" value="3"></label>
                <label class="grow">Nombre de colis<input type="number" name="parcels" min="0" step="1" value="1"></label>
              </div>
            </form>
            <div id="pt-sr"></div>
          </div>
        </div>
      </section>`;
    const form = body.querySelector("#pt-sf");
    const calc = () => {
      const f = FEES[form.fee.value];
      const pct = parseInt(form.pct.value, 10) / 100;
      body.querySelector("#pt-pctv").textContent = form.pct.value + " %";
      const sel = list.filter((r) => S.sell.has(r.k));
      const cote = sel.reduce((t, r) => t + r.v, 0);
      const gross = cote * pct;
      const fees = gross * f.pct / 100 + f.fixed * sel.length;
      const ship = (parseFloat(form.ship.value) || 0) * (parseInt(form.parcels.value, 10) || 0);
      const net = gross - fees - ship;
      const known = sel.filter((r) => r.paid);
      const cost = known.reduce((t, r) => t + r.paid.price, 0);
      const netKnown = known.reduce((t, r) => t + r.v * pct * (1 - f.pct / 100) - f.fixed, 0) - (known.length && sel.length ? ship * known.length / sel.length : 0);
      const pl = netKnown - cost;
      const left = all.reduce((t, r) => t + r.v, 0) - cote;
      body.querySelector("#pt-sr").innerHTML = sel.length ? `
        <div class="verdict ${net > 0 ? "ok" : "ko"} pt-res">
          <div><span>${sel.length} carte${sel.length > 1 ? "s" : ""} · cote totale</span><b>${eur(cote)}</b></div>
          <div><span>Prix de vente (${form.pct.value} %)</span><b>${eur(gross)}</b></div>
          <div><span>Frais de la plateforme</span><b>− ${eur(fees)}</b></div>
          <div><span>Envoi</span><b>− ${eur(ship)}</b></div>
          <div class="pt-net"><span>Je récupère</span><strong>${eur(net)}</strong></div>
          ${known.length ? `<div><span>Prix d'achat de ${known.length === sel.length ? "ces cartes" : `${known.length} de ces cartes`}</span><b>${eur(cost)}</b></div>
          <div><span>Plus-value nette ${known.length === sel.length ? "" : "(sur ces " + known.length + ")"}</span><b class="${pl >= 0 ? "up" : "down"}">${pl >= 0 ? "+" : ""}${eur(pl)}</b></div>` : `<div><span class="muted small">Ajoute les prix d'achat pour voir ta plus-value.</span></div>`}
          <div><span>Valeur de la collection restante</span><b>${eur(left)}</b></div>
        </div>
        <p class="muted small">Si tu vends, note la vente dans <a class="accent-link" href="#/outils/ventes">💶 Mes ventes</a> pour suivre ton bénéfice réel. Rappel : les plateformes transmettent aux impôts les comptes qui dépassent 30 ventes ou 2 000 € dans l'année.</p>`
        : `<p class="muted">Coche une ou plusieurs cartes à gauche.</p>`;
    };
    form.addEventListener("input", calc);
    bindPicker(body, "pt-sell", S.sell, calc);
    body.querySelector("#pt-none").addEventListener("click", () => { S.sell.clear(); body.querySelectorAll("#pt-sell input").forEach((i) => { i.checked = false; }); calc(); });
    calc();
  }

  /* ---------------- Simulateur d'achat ---------------- */
  function tabBuy(body, all, value, invested) {
    const { esc, eur } = ui();
    const wish = st().listKeys("wish").map((k) => { const m = st().meta(k) || {}; return { k, m, v: m.price || m.priceHolo || 0 }; }).sort((a, b) => b.v - a.v);
    body.innerHTML = `
      <section class="tool-card">
        <h2>🛒 Si j'achetais ces cartes…</h2>
        ${wish.length ? `<p class="muted small">Cartes de ta wishlist. Coche-les et indique le prix qu'on te propose (par défaut : la cote).</p>
        <div class="pt-two">
          <div>${picker(wish, new Set(S.buy.keys()), "pt-buy", (r) => `<input type="number" class="pt-offer" data-k="${esc(r.k)}" min="0" step="0.5" value="${(S.buy.get(r.k) ?? r.v).toFixed ? (S.buy.get(r.k) ?? r.v).toFixed(2) : ""}" aria-label="Prix proposé">`)}</div>
          <div>
            <form id="pt-bf" class="pt-form"><label>Si je les revendais un jour sur<select name="fee">${Object.entries(FEES).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join("")}</select></label>
              <label class="grow">Frais d'envoi à l'achat (€)<input type="number" name="ship" min="0" step="0.1" value="0"></label></form>
            <div id="pt-br"></div>
          </div>
        </div>` : `<p class="muted">Ta wishlist est vide. Ajoute des cartes avec ☆ dans leur fiche, ou depuis <a class="accent-link" href="#/completer">Compléter mes sets</a>.</p>`}
      </section>`;
    if (!wish.length) return;
    const form = body.querySelector("#pt-bf");
    const sel = () => wish.filter((r) => S.buy.has(r.k));
    const calc = () => {
      const f = FEES[form.fee.value];
      const items = sel();
      const ship = parseFloat(form.ship.value) || 0;
      const cost = items.reduce((t, r) => t + (S.buy.get(r.k) || 0), 0) + ship;
      const cote = items.reduce((t, r) => t + r.v, 0);
      const diff = cote - cost;
      const be = items.length ? (cost / (1 - f.pct / 100)) + f.fixed * items.length : 0;
      body.querySelector("#pt-br").innerHTML = items.length ? `
        <div class="verdict ${diff >= 0 ? "ok" : "ko"} pt-res">
          <div><span>${items.length} carte${items.length > 1 ? "s" : ""} · prix payé${ship ? " (avec envoi)" : ""}</span><b>${eur(cost)}</b></div>
          <div><span>Cote actuelle</span><b>${eur(cote)}</b></div>
          <div class="pt-net"><span>${diff >= 0 ? "Sous la cote de" : "Au-dessus de la cote de"}</span><strong class="${diff >= 0 ? "up" : "down"}">${eur(Math.abs(diff))}</strong></div>
          <div><span>Ma collection passerait à</span><b>${eur(value + cote)}</b></div>
          <div><span>Investi passerait à</span><b>${eur(invested + cost)}</b></div>
          <div><span>Prix de revente minimum pour ne rien perdre</span><b>${eur(be)}</b></div>
        </div>
        ${cost > 0 && cote > 0 && cost < cote * 0.6 ? `<p class="small">⚠️ Prix très inférieur à la cote : vérifie l'annonce avec le <a class="accent-link" href="#/bouclier">🛡️ bouclier anti-arnaques</a>.</p>` : ""}`
        : `<p class="muted">Coche une ou plusieurs cartes à gauche.</p>`;
    };
    bindPicker(body, "pt-buy", { add: (k) => S.buy.set(k, parseFloat(body.querySelector(`.pt-offer[data-k="${CSS.escape(k)}"]`).value) || 0), delete: (k) => S.buy.delete(k) }, calc);
    body.querySelectorAll(".pt-offer").forEach((i) => {
      i.addEventListener("input", () => { if (S.buy.has(i.dataset.k)) S.buy.set(i.dataset.k, parseFloat(i.value) || 0); calc(); });
    });
    form.addEventListener("input", calc);
    calc();
  }

  /* ---------------- Scénario de marché ---------------- */
  function tabScenario(body, all, value) {
    const { esc, eur } = ui();
    const sets = [...new Set(all.map((r) => r.m.setName || r.m.setId).filter(Boolean))].sort();
    const rars = [...new Set(all.map((r) => r.m.rarity).filter(Boolean))].sort();
    body.innerHTML = `
      <section class="tool-card">
        <h2>📈 Et si le marché bougeait ?</h2>
        <p class="muted small">Teste l'effet d'une hausse ou d'une baisse des prix sur ta collection. C'est une simulation, pas une prévision.</p>
        <form id="pt-scf" class="pt-form pt-scen">
          <label>Cartes concernées<select name="scope"><option value="all">Toute ma collection</option>
            ${sets.length ? `<optgroup label="Une extension">${sets.map((s) => `<option value="set:${esc(s)}">${esc(s)}</option>`).join("")}</optgroup>` : ""}
            ${rars.length ? `<optgroup label="Une rareté">${rars.map((s) => `<option value="rar:${esc(s)}">${esc(s)}</option>`).join("")}</optgroup>` : ""}</select></label>
          <label><span>Variation des prix : <b id="pt-varv">+20 %</b></span><input type="range" name="var" min="-60" max="100" step="5" value="20"></label>
        </form>
        <div id="pt-scr"></div>
      </section>`;
    const form = body.querySelector("#pt-scf");
    const calc = () => {
      const v = parseInt(form.var.value, 10);
      body.querySelector("#pt-varv").textContent = (v > 0 ? "+" : "") + v + " %";
      const sc = form.scope.value;
      const hit = all.filter((r) => sc === "all" || (sc.startsWith("set:") && (r.m.setName || r.m.setId) === sc.slice(4)) || (sc.startsWith("rar:") && r.m.rarity === sc.slice(4)));
      const part = hit.reduce((t, r) => t + r.v, 0);
      const delta = part * v / 100;
      body.querySelector("#pt-scr").innerHTML = `
        <div class="verdict ${delta >= 0 ? "ok" : "ko"} pt-res">
          <div><span>${hit.length} carte${hit.length > 1 ? "s" : ""} concernée${hit.length > 1 ? "s" : ""} (${value ? Math.round((part / value) * 100) : 0} % de la valeur)</span><b>${eur(part)}</b></div>
          <div><span>Variation</span><b class="${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "+" : "−"}${eur(Math.abs(delta))}</b></div>
          <div class="pt-net"><span>Ma collection vaudrait</span><strong>${eur(value + delta)}</strong></div>
          <div><span>Soit, pour toute la collection</span><b class="${delta >= 0 ? "up" : "down"}">${value ? (delta >= 0 ? "+" : "") + ((delta / value) * 100).toFixed(1).replace(".", ",") + " %" : "—"}</b></div>
        </div>`;
    };
    form.addEventListener("input", calc);
    calc();
  }

  MG.portefeuille = { FEES };
})(window.MG);
