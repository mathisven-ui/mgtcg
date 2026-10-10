/* ==========================================================
   MGTCG — outils.js   (V2)
   Outils de collectionneur :
   1) Faire grader : est-ce rentable ? (frais, port, vente)
   2) Acheter en France ou importer du Japon ?
   3) Mes ventes : journal et bénéfice réel
   Ce sont des calculatrices : elles donnent des chiffres,
   pas des conseils d'achat, d'investissement ou fiscaux.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const eur = (n) => (isFinite(n) ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "—");
  const num = (v, d = 0) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : d; };

  /* ---------------- Taux de change (BCE via frankfurter.app) ---------------- */
  const RATE_FALLBACK = { USD: 0.9, JPY: 0.006 }; // valeurs de secours approximatives
  let rates = null;
  async function getRates() {
    if (rates) return rates;
    try {
      const cached = JSON.parse(localStorage.getItem("mgtcg:rates") || "null");
      if (cached && Date.now() - cached.t < 12 * 3600e3) return (rates = cached.v);
    } catch (e) { /* rien */ }
    try {
      const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=USD,JPY");
      const j = await res.json();
      // 1 EUR = x USD → 1 USD = 1/x EUR
      rates = { USD: 1 / j.rates.USD, JPY: 1 / j.rates.JPY, date: j.date, live: true };
      try { localStorage.setItem("mgtcg:rates", JSON.stringify({ t: Date.now(), v: rates })); } catch (e) { /* rien */ }
    } catch (e) { rates = Object.assign({ live: false }, RATE_FALLBACK); }
    return rates;
  }

  /* ---------------- Tarifs de grading (relevés 2026, à vérifier) ---------------- */
  // Source : margeoapp.com, grilles officielles relevées en juillet 2026 (mise à jour 23/09/2026)
  const GRADERS = {
    PCA: { label: "PCA – France (Classic, 6 mois)", cur: "EUR", ship: 15, fee: (v) => (v < 250 ? 12.9 : v < 1000 ? 24.9 : v < 10000 ? 79.9 : 390) },
    "PCA Fast": { label: "PCA – France (Fast, 1 mois)", cur: "EUR", ship: 15, fee: (v) => (v < 250 ? 19.9 : v < 1000 ? 39.9 : v < 10000 ? 149 : 490) },
    CCC: { label: "CCC – France (standard)", cur: "EUR", ship: 15, fee: (v) => (v <= 50 ? 17 : v <= 100 ? 20 : v <= 500 ? 24 : 28), insurance: 0.02 },
    PSA: { label: "PSA – USA (Regular, ≤ 1 500 $)", cur: "USD", ship: 60, fee: () => 79.99 },
    "PSA Express": { label: "PSA – USA (Express, ≤ 2 500 $)", cur: "USD", ship: 60, fee: () => 149 },
    Autre: { label: "Autre société (je saisis le prix)", cur: "EUR", ship: 15, fee: () => 0 },
  };
  const SELL_FEES = { "Cardmarket (≈ 5 %)": 5, "eBay (≈ 13 %)": 13, "Vinted / Leboncoin (0 % vendeur)": 0, "Autre": 0 };

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.outils = async function (arg) {
    const [tab, rest] = String(arg || "").split("/");
    const { view, esc } = ui();
    const t = ["grading", "import", "ventes"].includes(tab) ? tab : "grading";
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🧮 Outils de collectionneur</h1>
        <p class="muted">Des calculatrices pour prendre tes décisions avec les bons chiffres. Elles ne donnent pas de conseil : c'est toi qui décides.</p>
      </div></header>
      <div class="chips tool-tabs">
        <a class="chip ${t === "grading" ? "active" : ""}" href="#/outils/grading">🏅 Faire grader ?</a>
        <a class="chip ${t === "import" ? "active" : ""}" href="#/outils/import">🗾 France ou Japon ?</a>
        <a class="chip ${t === "ventes" ? "active" : ""}" href="#/outils/ventes">💶 Mes ventes</a>
      </div>
      <div id="tool"></div>`;
    const el = document.getElementById("tool");
    if (t === "grading") return toolGrading(el, rest ? decodeURIComponent(rest) : "");
    if (t === "import") return toolImport(el, rest ? decodeURIComponent(rest) : "");
    return toolSales(el, rest ? decodeURIComponent(rest) : "");
  };

  function cardFromKey(key) {
    if (!key || !key.includes("|")) return null;
    const m = MG.store.meta(key);
    return m ? Object.assign({ key }, m) : null;
  }

  /* ================= 1) Grading ================= */
  async function toolGrading(el, key) {
    const { esc } = ui();
    const c = cardFromKey(key);
    const raw = c ? (c.price || c.priceHolo || 0) : 0;
    const r = await getRates();
    el.innerHTML = `
      <div class="tool-grid">
        <form class="tool-card form" id="g-form">
          <h2>🏅 Faire grader : est-ce rentable ?</h2>
          ${c ? `<p class="muted small">Carte : <b>${esc(c.name)}</b> · ${esc(c.setName || "")}</p>` : ""}
          <label>Nom de la carte (pour les liens de recherche)<input name="name" maxlength="80" value="${esc(c ? c.name + " " + (c.setName || "") : "")}" placeholder="ex : Dracaufeu ex 151"></label>
          <div class="row">
            <label class="grow">Valeur de la carte non gradée (€)<input name="raw" type="number" min="0" step="0.01" value="${raw ? raw.toFixed(2) : ""}" required></label>
            <label class="grow">Société de grading<select name="grader">${Object.entries(GRADERS).map(([k, g]) => `<option value="${k}">${g.label}</option>`).join("")}</select></label>
          </div>
          <div class="row">
            <label class="grow">Prix du grading (€ / carte)<input name="fee" type="number" min="0" step="0.01"></label>
            <label class="grow">Port aller + retour, assuré (€)<input name="ship" type="number" min="0" step="0.01"></label>
          </div>
          <fieldset class="sells"><legend>Prix de revente de la carte gradée (regarde les ventes terminées 👇)</legend>
            <div class="row">
              <label class="grow">Si j'obtiens la note espérée (ex : 10)<input name="pHigh" type="number" min="0" step="0.01" required></label>
              <label class="grow">Si j'ai une note en dessous (ex : 9)<input name="pLow" type="number" min="0" step="0.01" required></label>
            </div>
            <label>Chance d'avoir la note espérée : <b id="g-proba-v">50 %</b><input name="proba" type="range" min="0" max="100" step="5" value="50"></label>
            <div class="buy-links" id="g-links"></div>
          </fieldset>
          <label>Où je revendrais<select name="sell">${Object.keys(SELL_FEES).map((k) => `<option>${k}</option>`).join("")}</select></label>
        </form>
        <div class="tool-card" id="g-result"></div>
      </div>
      <p class="disclaimer">Tarifs indicatifs relevés sur les sites officiels en juillet 2026 (source : margeoapp.com, mis à jour le 23/09/2026) ; ils changent souvent : vérifie toujours sur le site de la société. ${r.live ? "Taux de change BCE du " + esc(r.date) + "." : "Taux de change approximatif (hors ligne)."} Résultat purement indicatif, pas un conseil d'investissement.</p>`;

    const f = document.getElementById("g-form");
    const setGrader = () => {
      const g = GRADERS[f.grader.value];
      const v = num(f.raw.value);
      const fee = g.fee(v) * (g.cur === "USD" ? r.USD : 1);
      f.fee.value = fee ? fee.toFixed(2) : "";
      f.ship.value = g.ship;
    };
    f.grader.addEventListener("change", () => { setGrader(); calc(); });
    f.raw.addEventListener("change", () => { setGrader(); calc(); });
    f.addEventListener("input", calc);
    setGrader();

    function links() {
      const q = encodeURIComponent((f.name.value || "carte pokemon").trim() + " " + (f.grader.value.split(" ")[0]));
      document.getElementById("g-links").innerHTML = `
        <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.ebay.fr/sch/i.html?_nkw=${q}+10&LH_Sold=1&LH_Complete=1">eBay vendus (note 10)</a>
        <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.ebay.fr/sch/i.html?_nkw=${q}+9&LH_Sold=1&LH_Complete=1">eBay vendus (note 9)</a>
        <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(f.name.value || "")}">Cardmarket</a>`;
    }

    function calc() {
      links();
      const g = GRADERS[f.grader.value];
      const rawV = num(f.raw.value), fee = num(f.fee.value), ship = num(f.ship.value);
      const ins = g.insurance ? rawV * g.insurance : 0;
      const p = num(f.proba.value, 50) / 100;
      document.getElementById("g-proba-v").textContent = Math.round(p * 100) + " %";
      const pH = num(f.pHigh.value), pL = num(f.pLow.value);
      const sellPct = SELL_FEES[f.sell.value] / 100;
      const out = document.getElementById("g-result");
      if (!rawV || !pH) { out.innerHTML = `<h2>Résultat</h2><p class="muted">Indique la valeur de ta carte et son prix une fois gradée pour voir le calcul.</p>`; return; }
      const cost = fee + ship + ins;
      const net = (x) => x * (1 - sellPct);
      const expected = p * net(pH) + (1 - p) * net(pL || 0);
      const gain = expected - rawV * (1 - sellPct) - cost; // comparé à vendre la carte sans la grader
      const breakEven = p > 0 && sellPct < 1 ? (rawV * (1 - sellPct) + cost - (1 - p) * net(pL || 0)) / (p * (1 - sellPct)) : NaN;
      out.innerHTML = `<h2>Résultat</h2>
        <div class="calc-lines">
          <div><span>Frais de grading</span><b>${eur(fee)}</b></div>
          <div><span>Port aller-retour</span><b>${eur(ship)}</b></div>
          ${ins ? `<div><span>Assurance (2 % de la valeur)</span><b>${eur(ins)}</b></div>` : ""}
          <div class="total"><span>Coût total du grading</span><b>${eur(cost)}</b></div>
          <div><span>Revente moyenne attendue (après frais de vente)</span><b>${eur(expected)}</b></div>
          <div><span>Si je vends sans grader (après frais)</span><b>${eur(rawV * (1 - sellPct))}</b></div>
        </div>
        <div class="verdict ${gain >= 0 ? "ok" : "ko"}">
          <strong>${gain >= 0 ? "▲ Gain moyen estimé : +" : "▼ Perte moyenne estimée : "}${eur(gain)}</strong>
          <span>${gain >= 0 ? "Avec ces chiffres, grader rapporte en moyenne plus que vendre la carte telle quelle." : "Avec ces chiffres, grader coûte en moyenne plus qu'il ne rapporte."}</span>
        </div>
        ${isFinite(breakEven) ? `<p class="small muted">Pour être à l'équilibre, la carte avec la note espérée devrait se revendre au moins <b>${eur(breakEven)}</b>.</p>` : ""}
        <p class="small muted">« En moyenne » : sur plusieurs cartes envoyées, avec ${Math.round(p * 100)} % de chances d'obtenir la note espérée. Une seule carte peut faire mieux… ou moins bien.</p>`;
    }
    calc();
  }

  /* ================= 2) France ou Japon ? ================= */
  async function toolImport(el, key) {
    const { esc } = ui();
    const c = cardFromKey(key);
    const r = await getRates();
    const q0 = c ? c.name + " " + (c.setName || "") : "";
    el.innerHTML = `
      <div class="tool-grid">
        <form class="tool-card form" id="i-form">
          <h2>🗾 Acheter en France ou importer du Japon ?</h2>
          <label>Produit ou carte (pour les liens de recherche)<input name="name" maxlength="80" value="${esc(q0)}" placeholder="ex : display Terastal Festival"></label>
          <div class="row">
            <label class="grow">Prix en France (€)<input name="fr" type="number" min="0" step="0.01" value="${c && c.price ? c.price.toFixed(2) : ""}"></label>
            <label class="grow">Prix au Japon (¥)<input name="jp" type="number" min="0" step="1"></label>
          </div>
          <div class="row">
            <label class="grow">Port depuis le Japon (¥)<input name="ship" type="number" min="0" step="1" value="0"></label>
            <label class="grow">Taux : 1 ¥ = … €<input name="rate" type="number" min="0" step="0.00001" value="${r.JPY.toFixed(5)}"></label>
          </div>
          <div class="row">
            <label class="grow">TVA à l'import (%)<input name="vat" type="number" min="0" max="30" step="0.1" value="20"></label>
            <label class="grow">Droits de douane (%)<input name="duty" type="number" min="0" max="30" step="0.1" value="0"></label>
          </div>
          <label>Frais de dédouanement du transporteur (€)<input name="handling" type="number" min="0" step="0.01" value="0"></label>
          <div class="buy-links" id="i-links"></div>
        </form>
        <div class="tool-card" id="i-result"></div>
      </div>
      <p class="disclaimer">Depuis 2021, la TVA (20 % en France) est due sur tous les colis venant de hors Union européenne, quel que soit leur prix ; le transporteur peut aussi facturer des frais de dédouanement. Les droits de douane dépendent du produit et du montant : vérifie sur douane.gouv.fr. ${r.live ? "Taux de change BCE du " + esc(r.date) + "." : "Taux de change approximatif : corrige-le si besoin."} Pense aussi que les cartes japonaises ne sont pas jouables en tournoi officiel en France et ne valent pas le même prix que les françaises.</p>`;
    const f = document.getElementById("i-form");
    f.addEventListener("input", calc);
    function calc() {
      const q = encodeURIComponent((f.name.value || "pokemon").trim());
      document.getElementById("i-links").innerHTML = `
        <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.ebay.fr/sch/i.html?_nkw=${q}+FR">eBay (FR)</a>
        <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.ebay.fr/sch/i.html?_nkw=${q}+japonais">eBay (JP)</a>
        <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${q}">Cardmarket</a>
        <a target="_blank" rel="noopener noreferrer nofollow" href="https://www.leboncoin.fr/recherche?text=${q}">Leboncoin</a>`;
      const out = document.getElementById("i-result");
      const fr = num(f.fr.value), jp = num(f.jp.value), ship = num(f.ship.value), rate = num(f.rate.value);
      if (!jp || !rate) { out.innerHTML = `<h2>Résultat</h2><p class="muted">Indique le prix au Japon (en yens) pour voir le coût réel d'import.</p>`; return; }
      const base = (jp + ship) * rate;
      const duty = base * num(f.duty.value) / 100;
      const vat = (base + duty) * num(f.vat.value) / 100;
      const handling = num(f.handling.value);
      const total = base + duty + vat + handling;
      out.innerHTML = `<h2>Résultat</h2>
        <div class="calc-lines">
          <div><span>Prix + port convertis</span><b>${eur(base)}</b></div>
          ${duty ? `<div><span>Droits de douane</span><b>${eur(duty)}</b></div>` : ""}
          <div><span>TVA à l'import</span><b>${eur(vat)}</b></div>
          ${handling ? `<div><span>Frais de dédouanement</span><b>${eur(handling)}</b></div>` : ""}
          <div class="total"><span>Coût réel de l'import</span><b>${eur(total)}</b></div>
          ${fr ? `<div><span>Prix en France</span><b>${eur(fr)}</b></div>` : ""}
        </div>
        ${fr ? `<div class="verdict ${total < fr ? "ok" : "ko"}"><strong>${total < fr ? "🗾 L'import revient moins cher de " + eur(fr - total) : "🏪 Acheter en France revient moins cher de " + eur(total - fr)}</strong>
          <span>${Math.abs((total - fr) / fr * 100).toFixed(0)} % d'écart, avec ces chiffres.</span></div>` : `<p class="muted small">Indique aussi le prix en France pour comparer.</p>`}`;
    }
    calc();
  }

  /* ================= 3) Mes ventes ================= */
  function toolSales(el, key) {
    const { esc } = ui();
    const c = cardFromKey(key);
    const paid = c ? MG.store.paid(key) : null;
    const sales = MG.store.sales();
    const year = new Date().getFullYear();
    const byYear = {};
    for (const s of sales) {
      const y = (s.date || "").slice(0, 4) || "?";
      const b = (byYear[y] = byYear[y] || { n: 0, ca: 0, profit: 0 });
      b.n++; b.ca += s.price; b.profit += s.price - s.fees - s.ship - (s.cost || 0);
    }
    const cur = byYear[year] || { n: 0, ca: 0, profit: 0 };
    el.innerHTML = `
      <div class="tool-grid">
        <form class="tool-card form" id="s-form">
          <h2>💶 J'ai vendu…</h2>
          <label>Quoi ?<input name="name" required maxlength="100" value="${esc(c ? c.name + " – " + (c.setName || "") : "")}" placeholder="ex : Dracaufeu ex 151 PSA 10"></label>
          <div class="row">
            <label class="grow">Date<input name="date" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label>
            <label class="grow">Où ?<select name="where">${["Cardmarket", "eBay", "Vinted", "Leboncoin", "En main propre", "Autre"].map((x) => `<option>${x}</option>`).join("")}</select></label>
          </div>
          <div class="row">
            <label class="grow">Prix de vente (€)<input name="price" type="number" min="0" step="0.01" required></label>
            <label class="grow">Frais de la plateforme (€)<input name="fees" type="number" min="0" step="0.01" value="0"></label>
          </div>
          <div class="row">
            <label class="grow">Frais d'envoi payés (€)<input name="ship" type="number" min="0" step="0.01" value="0"></label>
            <label class="grow">Ce que je l'avais payée (€)<input name="cost" type="number" min="0" step="0.01" value="${paid ? paid.price : ""}"></label>
          </div>
          ${c && MG.store.isOwned(...key.split("|")) ? `<label class="check"><input type="checkbox" name="remove" checked><span>La retirer de ma collection</span></label>` : ""}
          <p class="form-msg" id="s-msg"></p>
          <button class="btn full" type="submit">Enregistrer la vente</button>
        </form>
        <div class="tool-card">
          <h2>📊 ${year}</h2>
          <div class="calc-lines">
            <div><span>Ventes</span><b>${cur.n}</b></div>
            <div><span>Total encaissé</span><b>${eur(cur.ca)}</b></div>
            <div class="total"><span>Bénéfice réel</span><b class="${cur.profit >= 0 ? "up" : "down"}">${cur.profit >= 0 ? "+" : ""}${eur(cur.profit)}</b></div>
          </div>
          <p class="small muted">Bénéfice = prix de vente − frais − envoi − prix d'achat.</p>
          <div class="warn small">ℹ️ <b>Bon à savoir (France) :</b> les plateformes (Vinted, Leboncoin, eBay…) transmettent aux impôts les comptes qui dépassent <b>30 ventes ou 2 000 € dans l'année</b>. Ça ne veut pas dire que tu dois payer un impôt, mais garde une trace de tes achats et ventes : c'est à ça que sert ce journal. Pour les règles exactes (objets de collection, revente régulière…), renseigne-toi sur impots.gouv.fr ; MGTCG ne donne pas de conseil fiscal.</div>
        </div>
      </div>
      <section><h2>Historique</h2>
        ${sales.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Date</th><th>Quoi</th><th>Où</th><th class="right">Prix</th><th class="right">Frais + envoi</th><th class="right">Bénéfice</th><th></th></tr></thead>
          <tbody>${sales.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((s) => {
            const p = s.price - s.fees - s.ship - (s.cost || 0);
            return `<tr><td>${esc(new Date(s.date + "T12:00:00").toLocaleDateString("fr-FR"))}</td><td>${esc(s.name)}</td><td>${esc(s.where)}</td>
              <td class="right">${eur(s.price)}</td><td class="right">${eur(s.fees + s.ship)}</td>
              <td class="right ${p >= 0 ? "up" : "down"}">${s.cost != null ? (p >= 0 ? "+" : "") + eur(p) : "<span class='muted'>prix d'achat ?</span>"}</td>
              <td><button class="link-btn small" data-del="${esc(s.id)}">✕</button></td></tr>`;
          }).join("")}</tbody></table></div>
          ${Object.keys(byYear).length > 1 ? `<p class="small muted">${Object.entries(byYear).sort().reverse().map(([y, b]) => `${esc(y)} : ${b.n} vente(s), ${eur(b.ca)} encaissés, bénéfice ${eur(b.profit)}`).join(" · ")}</p>` : ""}
          <p><button class="btn ghost" id="s-csv">⬇ Exporter en tableur (CSV)</button></p>`
        : `<p class="muted">Aucune vente enregistrée. Astuce : depuis la fiche d'une carte de ta collection, clique sur « J'ai vendu cette carte ».</p>`}
      </section>`;

    const f = document.getElementById("s-form");
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = new FormData(f);
      const price = num(d.get("price"), NaN);
      if (!(price >= 0)) { const m = document.getElementById("s-msg"); m.textContent = "Indique le prix de vente."; m.className = "form-msg err"; return; }
      const costRaw = String(d.get("cost") || "").trim();
      MG.store.addSale({
        name: String(d.get("name") || "").trim(), date: String(d.get("date") || ""), where: String(d.get("where") || "Autre"),
        price, fees: num(d.get("fees")), ship: num(d.get("ship")), cost: costRaw === "" ? null : num(costRaw), key: c ? key : "",
      });
      if (c && d.get("remove")) {
        const [lang, id] = key.split("|");
        const o = MG.store.owned(lang, id) || {};
        for (const v of Object.keys(o)) MG.store.setVariant(lang, { id }, v, false);
      }
      ui().toast("Vente enregistrée 💶");
      location.hash = "#/outils/ventes";
      MG.route();
    });
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      if (!confirm("Supprimer cette vente ?")) return;
      MG.store.removeSale(b.dataset.del); toolSales(el, "");
    }));
    const csv = document.getElementById("s-csv");
    if (csv) csv.addEventListener("click", () => {
      const rows = [["Date", "Quoi", "Où", "Prix", "Frais", "Envoi", "Prix d'achat", "Bénéfice"]].concat(
        sales.map((s) => [s.date, s.name, s.where, s.price, s.fees, s.ship, s.cost ?? "", s.cost != null ? (s.price - s.fees - s.ship - s.cost).toFixed(2) : ""]));
      const text = "﻿" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\r\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
      a.download = "mgtcg-ventes.csv"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }
})(window.MG);
