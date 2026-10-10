/* ==========================================================
   MGTCG — valeur.js   (V2)
   Valeur de la collection dans le temps : actualisation des
   prix, graphique d'évolution, plus-values / moins-values,
   alertes de prix.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  // Couleurs vérifiées (contraste + daltonisme) sur le fond sombre du site
  const C_VALUE = "#b88a00";   // valeur de la collection
  const C_PAID = "#4c8dff";    // montant investi
  const REFRESH_EVERY = 12 * 3600 * 1000;
  const MAX_REFRESH = 800;     // cartes actualisées par passage

  const eur = (n) => (typeof n === "number" && isFinite(n) ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "—");
  const eur0 = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 });
  const dayFr = (d, opt) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", opt || { day: "numeric", month: "short" });

  /* ---------------- Actualisation des prix ---------------- */
  let running = null;
  function refresh(onProgress) {
    if (running) return running;
    const keys = [...new Set([...MG.store.ownedKeys(), ...MG.store.alertKeys()])].slice(0, MAX_REFRESH);
    if (!keys.length) return Promise.resolve();
    let done = 0;
    running = new Promise((resolve) => {
      const byLang = {};
      for (const k of keys) { const [lang, id] = k.split("|"); (byLang[lang] = byLang[lang] || []).push(id); }
      for (const lang of Object.keys(byLang)) {
        MG.loadQueue(byLang[lang], lang, (card) => {
          if (card) MG.store.remember(lang, card);
          done++;
          if (onProgress) onProgress(done, keys.length);
          if (done === keys.length) {
            MG.store.markRefreshed();
            MG.store.recordHistory();
            running = null;
            resolve();
          }
        }, 4);
      }
    });
    return running;
  }

  function needsRefresh() {
    return Date.now() - MG.store.lastRefresh > REFRESH_EVERY &&
      (MG.store.ownedKeys().length > 0 || MG.store.alertKeys().length > 0);
  }

  // Au démarrage du site : actualise en arrière-plan si besoin, puis prévient des alertes
  function autoRefresh() {
    MG.store.recordHistory();
    if (!needsRefresh()) return notifyAlerts();
    refresh().then(notifyAlerts);
  }

  let notified = false;
  function notifyAlerts() {
    const hits = MG.store.triggeredAlerts();
    if (hits.length && !notified) {
      notified = true;
      MG.ui.toast("🔔 " + hits.length + " alerte" + (hits.length > 1 ? "s" : "") + " de prix déclenchée" + (hits.length > 1 ? "s" : "") + " !");
    }
    MG.emit("alerts");
  }

  /* ---------------- Calculs ---------------- */
  function portfolio() {
    const owned = MG.store.ownedKeys();
    let value = 0, invested = 0, valueOfPaid = 0, withPrice = 0;
    const rows = [];
    for (const key of owned) {
      const v = MG.store.valueOf(key);
      value += v;
      const p = MG.store.paid(key);
      if (p) {
        invested += p.price; valueOfPaid += v; withPrice++;
        rows.push({ key, meta: MG.store.meta(key) || {}, paid: p.price, value: v, pl: v - p.price });
      }
    }
    return { count: owned.length, value, invested, valueOfPaid, pl: valueOfPaid - invested, withPrice, rows };
  }

  // Montant investi à une date donnée (achats sans date = comptés depuis le début)
  function investedAt(day) {
    let sum = 0;
    for (const key of MG.store.paidKeys()) {
      if (!MG.store.isOwned(...key.split("|"))) continue;
      const p = MG.store.paid(key);
      if (!p.date || p.date <= day) sum += p.price;
    }
    return sum;
  }

  /* ---------------- Graphique ---------------- */
  function niceTicks(min, max, n) {
    if (max <= min) max = min + 1;
    const raw = (max - min) / n;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = [];
    for (let t = lo; t <= hi + step / 2; t += step) out.push(Math.round(t * 100) / 100);
    return out;
  }

  function drawChart(el, range) {
    const { esc } = MG.ui;
    let hist = MG.store.history();
    if (range !== "all") {
      const days = { "30": 30, "90": 90, "365": 365 }[range] || 30;
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      hist = hist.filter(([d]) => d >= from);
    }
    const hasPaid = MG.store.paidKeys().length > 0;
    const pts = hist.map(([d, v]) => ({ d, v, p: hasPaid ? investedAt(d) : null }));

    if (pts.length < 2) {
      el.innerHTML = `<div class="chart-empty">
        <p>📈 Le graphique se remplit tout seul, <b>un point par jour</b> où tu ouvres MGTCG.</p>
        <p class="muted small">${pts.length ? "Premier point enregistré aujourd'hui : " + eur(pts[0].v) + ". Reviens demain pour voir la courbe démarrer !" : "Ajoute des cartes à ta collection pour commencer."}</p>
      </div>`;
      return;
    }

    const W = Math.max(300, el.clientWidth || 700), H = 280;
    const m = { t: 18, r: 78, b: 30, l: 62 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const vals = pts.flatMap((p) => (p.p != null ? [p.v, p.p] : [p.v]));
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals), 4);
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const t0 = new Date(pts[0].d).getTime(), t1 = new Date(pts[pts.length - 1].d).getTime();
    const x = (d) => m.l + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * iw;
    const y = (v) => m.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
    const line = (key) => pts.map((p, i) => (i ? "L" : "M") + x(p.d).toFixed(1) + " " + y(p[key]).toFixed(1)).join(" ");
    const area = line("v") + ` L${x(pts[pts.length - 1].d).toFixed(1)} ${y(yMin)} L${x(pts[0].d).toFixed(1)} ${y(yMin)} Z`;

    // Dates de l'axe (5 max)
    const nX = Math.min(5, pts.length);
    const xLabels = Array.from({ length: nX }, (_, i) => pts[Math.round((i * (pts.length - 1)) / Math.max(1, nX - 1))]);
    const last = pts[pts.length - 1];
    // Étiquettes de fin (évite qu'elles se chevauchent)
    let yv = y(last.v), yp = last.p != null ? y(last.p) : null;
    if (yp != null && Math.abs(yv - yp) < 16) { if (yv <= yp) { yv -= 8; yp += 8; } else { yv += 8; yp -= 8; } }

    el.innerHTML = `
      ${hasPaid ? `<div class="legend"><span><i style="background:${C_VALUE}"></i>Valeur de la collection</span><span><i style="background:${C_PAID}"></i>Montant investi</span></div>` : ""}
      <div class="chart-box">
        <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Évolution de la valeur de la collection">
          ${ticks.map((t) => `<line x1="${m.l}" x2="${m.l + iw}" y1="${y(t)}" y2="${y(t)}" class="grid"/>
            <text x="${m.l - 8}" y="${y(t) + 4}" class="axis" text-anchor="end">${esc(eur0(t))}</text>`).join("")}
          ${xLabels.map((p, i) => `<text x="${x(p.d)}" y="${H - 8}" class="axis" text-anchor="${i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}">${esc(dayFr(p.d))}</text>`).join("")}
          <path d="${area}" fill="${C_VALUE}" opacity="0.10"/>
          ${hasPaid ? `<path d="${line("p")}" fill="none" stroke="${C_PAID}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
          <path d="${line("v")}" fill="none" stroke="${C_VALUE}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${x(last.d)}" cy="${y(last.v)}" r="4.5" fill="${C_VALUE}" stroke="var(--surface)" stroke-width="2"/>
          <text x="${x(last.d) + 8}" y="${yv + 4}" class="end-label">${esc(eur0(last.v))}</text>
          ${hasPaid ? `<circle cx="${x(last.d)}" cy="${y(last.p)}" r="4.5" fill="${C_PAID}" stroke="var(--surface)" stroke-width="2"/>
            <text x="${x(last.d) + 8}" y="${yp + 4}" class="end-label">${esc(eur0(last.p))}</text>` : ""}
          <g class="hover" visibility="hidden">
            <line class="xhair" y1="${m.t}" y2="${m.t + ih}"/>
            <circle class="hv" r="4.5" fill="${C_VALUE}" stroke="var(--surface)" stroke-width="2"/>
            ${hasPaid ? `<circle class="hp" r="4.5" fill="${C_PAID}" stroke="var(--surface)" stroke-width="2"/>` : ""}
          </g>
          <rect class="hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>
        </svg>
        <div class="tip" hidden></div>
      </div>
      <details class="data-table"><summary>Voir les données</summary>
        <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th class="right">Valeur</th>${hasPaid ? '<th class="right">Investi</th>' : ""}</tr></thead>
        <tbody>${pts.slice().reverse().map((p) => `<tr><td>${esc(dayFr(p.d, { day: "numeric", month: "long", year: "numeric" }))}</td><td class="right">${eur(p.v)}</td>${hasPaid ? `<td class="right">${eur(p.p)}</td>` : ""}</tr>`).join("")}</tbody></table></div>
      </details>`;

    // Survol : ligne verticale + bulle d'info
    const svg = el.querySelector("svg"), g = el.querySelector(".hover"), tip = el.querySelector(".tip");
    const move = (evt) => {
      const r = svg.getBoundingClientRect();
      const px = ((evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left) * (W / r.width);
      let best = pts[0];
      for (const p of pts) if (Math.abs(x(p.d) - px) < Math.abs(x(best.d) - px)) best = p;
      g.setAttribute("visibility", "visible");
      g.querySelector(".xhair").setAttribute("x1", x(best.d)); g.querySelector(".xhair").setAttribute("x2", x(best.d));
      g.querySelector(".hv").setAttribute("cx", x(best.d)); g.querySelector(".hv").setAttribute("cy", y(best.v));
      if (hasPaid) { g.querySelector(".hp").setAttribute("cx", x(best.d)); g.querySelector(".hp").setAttribute("cy", y(best.p)); }
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(dayFr(best.d, { weekday: "short", day: "numeric", month: "long", year: "numeric" }))}</b>
        <span><i style="background:${C_VALUE}"></i>Valeur <strong>${eur(best.v)}</strong></span>
        ${hasPaid ? `<span><i style="background:${C_PAID}"></i>Investi <strong>${eur(best.p)}</strong></span>
        <span class="${best.v - best.p >= 0 ? "up" : "down"}">${best.v - best.p >= 0 ? "▲ +" : "▼ "}${eur(best.v - best.p)}</span>` : ""}`;
      const left = (x(best.d) / W) * r.width;
      tip.style.left = Math.min(Math.max(left, 90), r.width - 90) + "px";
    };
    const hide = () => { g.setAttribute("visibility", "hidden"); tip.hidden = true; };
    const hit = el.querySelector(".hit");
    hit.addEventListener("mousemove", move);
    hit.addEventListener("touchmove", move, { passive: true });
    hit.addEventListener("mouseleave", hide);
    hit.addEventListener("touchend", hide);
  }

  /* ---------------- Bloc « valeur » de la page collection ---------------- */
  let range = "90";
  function mount(el) {
    const { esc } = MG.ui;
    const P = portfolio();
    const plPct = P.invested ? (P.pl / P.invested) * 100 : 0;
    const alerts = MG.store.alertKeys().map((key) => ({ key, a: MG.store.alert(key), now: MG.store.priceOf(key), meta: MG.store.meta(key) || {} }));
    const last = MG.store.lastRefresh;

    el.innerHTML = `
      <div class="stat-row">
        <div class="stat"><strong>${eur(P.value)}</strong><span>valeur estimée (Cardmarket)</span></div>
        <div class="stat"><strong>${P.invested ? eur(P.invested) : "—"}</strong><span>investi (${P.withPrice} carte${P.withPrice > 1 ? "s" : ""} avec prix d'achat)</span></div>
        <div class="stat"><strong class="${P.withPrice ? (P.pl >= 0 ? "up" : "down") : ""}">${P.withPrice ? (P.pl >= 0 ? "▲ +" : "▼ ") + eur(P.pl) : "—"}</strong>
          <span>${P.withPrice ? "plus-value latente (" + (plPct >= 0 ? "+" : "") + plPct.toFixed(1).replace(".", ",") + " %)" : "plus-value : ajoute tes prix d'achat"}</span></div>
      </div>

      <section class="value-section">
        <div class="section-head">
          <h2>📈 Évolution de la valeur</h2>
          <div class="chips small-chips">${[["30", "30 j"], ["90", "3 mois"], ["365", "1 an"], ["all", "Tout"]].map(([k, l]) => `<button class="chip ${range === k ? "active" : ""}" data-range="${k}">${l}</button>`).join("")}</div>
        </div>
        <p class="muted small" id="refresh-info">${running ? "🔄 Actualisation des prix…" : last ? "Prix actualisés le " + esc(new Date(last).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })) + " · " : ""}${running ? "" : '<button class="link-btn accent-link" id="refresh-now">Actualiser maintenant</button>'}</p>
        <div id="chart"></div>
      </section>

      ${P.rows.length ? `<section><h2>💶 Plus-values et moins-values</h2>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Carte</th><th class="right">Payé</th><th class="right">Valeur</th><th class="right">Écart</th></tr></thead>
          <tbody>${P.rows.sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl)).slice(0, 50).map((r) => {
            const [lang, id] = r.key.split("|");
            const pc = r.paid ? (r.pl / r.paid) * 100 : 0;
            return `<tr class="clickable" data-lang="${esc(lang)}" data-id="${esc(id)}">
              <td>${esc(r.meta.name || id)} <span class="muted">· ${esc(r.meta.setName || "")}</span></td>
              <td class="right">${eur(r.paid)}</td><td class="right">${r.value ? eur(r.value) : "—"}</td>
              <td class="right ${r.pl >= 0 ? "up" : "down"}">${r.pl >= 0 ? "▲ +" : "▼ "}${eur(r.pl)} <small>(${pc >= 0 ? "+" : ""}${pc.toFixed(0)} %)</small></td></tr>`;
          }).join("")}</tbody></table></div>
      </section>` : `<p class="muted small">💡 Ouvre une carte de ta collection et indique ton <b>prix d'achat</b> pour suivre tes plus-values.</p>`}

      <section><h2>🔔 Mes alertes de prix</h2>
        ${alerts.length ? `<div class="alert-list">${alerts.map((x) => {
          const [lang, id] = x.key.split("|");
          const hit = x.now > 0 && x.now <= x.a.below;
          return `<div class="alert-item ${hit ? "hit" : ""}" data-lang="${esc(lang)}" data-id="${esc(id)}">
            <span class="ai-main"><b>${esc(x.meta.name || id)}</b><small>${esc(x.meta.setName || "")}</small></span>
            <span class="ai-val">Cote : <b>${x.now ? eur(x.now) : "—"}</b> · seuil : ${eur(x.a.below)}</span>
            <span class="ai-state">${hit ? "✅ Déclenchée" : "⏳ En attente"}</span>
          </div>`;
        }).join("")}</div>
        <p class="disclaimer">Les alertes sont vérifiées quand tu ouvres MGTCG (prix Cardmarket actualisés une fois par jour). Données indicatives, pas un conseil d'investissement.</p>`
        : `<p class="muted small">Aucune alerte. Ouvre une carte (même une carte que tu n'as pas encore) et crée une alerte : MGTCG te prévient quand sa cote passe sous ton prix.</p>`}
      </section>`;

    drawChart(el.querySelector("#chart"), range);
    el.querySelectorAll("[data-range]").forEach((b) => b.addEventListener("click", () => {
      range = b.dataset.range;
      el.querySelectorAll("[data-range]").forEach((x) => x.classList.toggle("active", x === b));
      drawChart(el.querySelector("#chart"), range);
    }));
    el.querySelectorAll("tr.clickable, .alert-item").forEach((r) => r.addEventListener("click", () => MG.ui.openCard(r.dataset.lang, r.dataset.id)));
    const btn = el.querySelector("#refresh-now");
    if (btn) btn.addEventListener("click", () => runRefresh(el));
    if (needsRefresh() && !running) runRefresh(el);
  }

  function runRefresh(el) {
    const info = el.querySelector("#refresh-info");
    refresh((done, total) => { if (info && info.isConnected) info.textContent = `🔄 Actualisation des prix… ${done} / ${total}`; })
      .then(() => {
        notifyAlerts();
        // Réaffiche toute la page collection avec les nouveaux prix, sans remonter en haut
        if (!el.isConnected) return;
        if (document.getElementById("modal").hidden) { const y = window.scrollY; MG.route(); window.scrollTo(0, y); }
        else mount(el);
      });
  }

  // Redessine le graphique quand la fenêtre change de taille
  let rz = 0;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => { const c = document.getElementById("chart"); if (c && c.querySelector("svg")) drawChart(c, range); }, 200);
  });

  MG.valeur = { refresh, mount, autoRefresh, portfolio };
  document.addEventListener("DOMContentLoaded", () => setTimeout(autoRefresh, 2500));
})(window.MG);
