/* ==========================================================
   MGTCG — actus.js   (V2)
   Actualités : tendances du marché calculées automatiquement
   (prix Cardmarket des dernières extensions), actus publiées
   par l'admin ou proposées par les membres, sources à suivre.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const CATS = { Actu: "📰", Sortie: "📦", "Marché": "📈", Grading: "🏅", Tournoi: "🏆", Arnaque: "🛡️" };
  const MIN_PRICE = 2;      // on ignore les cartes à moins de 2 € (variations sans intérêt)
  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const eur = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
  const S = { news: [], setId: null, stop: null };

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.actus = async function () {
    const { view, loading, esc } = ui();
    view().innerHTML = loading("Chargement des actus…");
    const a = auth();
    const lang = MG.store.lang;

    // Dernières extensions de la langue choisie
    let sets = [];
    try {
      const series = await MG.api.series(lang);
      for (const s of series.slice(-2).reverse()) {
        const serie = await MG.api.serie(lang, s.id);
        sets.push(...(serie.sets || []).slice().reverse());
      }
      sets = sets.filter((x) => !/pocket|promo/i.test(x.name + " " + x.id)).slice(0, 6);
    } catch (e) { sets = []; }
    S.setId = S.setId && sets.some((x) => x.id === S.setId) ? S.setId : sets[0] && sets[0].id;

    let newsOk = false;
    if (a && a.enabled) {
      const { data, error } = await a.client.from("news").select("id,title,summary,category,url,source,published,status,created_by").order("published", { ascending: false }).limit(60);
      if (!error) { S.news = (data || []).filter((n) => n.status === "approved"); newsOk = true; }
    }

    view().innerHTML = `
      <header class="page-head"><div>
        <h1>📰 Actus & marché</h1>
        <p class="muted">Ce qui bouge sur le marché des cartes (calculé automatiquement à partir des prix Cardmarket) et les dernières nouvelles du JCC Pokémon.</p>
      </div></header>

      <section class="tool-card">
        <div class="section-head"><h2 style="margin:0">📈 Tendances de la semaine</h2>
          ${sets.length ? `<select id="mk-set" aria-label="Extension">${sets.map((x) => `<option value="${esc(x.id)}" ${x.id === S.setId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}</div>
        <p class="muted small">Prix moyen des 7 derniers jours comparé aux 30 derniers jours, sur Cardmarket (cartes à plus de ${MIN_PRICE} €). Données indicatives, pas des conseils d'achat.</p>
        <div id="mk-body">${sets.length ? ui().loading("Analyse des prix…") : `<p class="muted">Base de cartes indisponible pour le moment.</p>`}</div>
      </section>

      <section>
        <div class="section-head"><h2>📰 Dernières actus</h2>
          ${a && a.user ? `<button class="btn ghost" id="nw-add">＋ ${a.isAdmin && a.isAdmin() ? "Publier une actu" : "Proposer une actu"}</button>` : ""}</div>
        <div id="nw-list" class="nw-list"></div>
        ${newsOk ? "" : `<p class="muted small">Les actus arrivent dès que la base est prête (admin : lance <code>supabase-actus.sql</code>).</p>`}
      </section>

      <section>
        <h2>🔗 Sources à suivre</h2>
        <div class="links">
          <a target="_blank" rel="noopener noreferrer" href="https://www.pokemon.com/fr/actualites-pokemon">Pokémon (officiel)</a>
          <a target="_blank" rel="noopener noreferrer" href="https://www.pokecardex.com/">PokéCardex</a>
          <a target="_blank" rel="noopener noreferrer" href="https://www.pokebeach.com/">PokeBeach (anglais)</a>
          <a target="_blank" rel="noopener noreferrer" href="https://www.cardmarket.com/fr/Pokemon">Cardmarket</a>
          <a href="#/agenda">📅 Notre agenda des sorties</a>
        </div>
      </section>`;

    renderNews();
    const sel = document.getElementById("mk-set");
    if (sel) sel.addEventListener("change", () => { S.setId = sel.value; loadMarket(lang, sets.find((x) => x.id === sel.value)); });
    const add = document.getElementById("nw-add");
    if (add) add.addEventListener("click", openPropose);
    if (S.setId) loadMarket(lang, sets.find((x) => x.id === S.setId));
  };

  /* ---------------- Tendances ---------------- */
  async function loadMarket(lang, brief) {
    const box = document.getElementById("mk-body");
    if (!box || !brief) return;
    if (S.stop) S.stop();
    let set;
    try { set = await MG.api.set(lang, brief.id); } catch (e) { box.innerHTML = `<p class="muted">Extension indisponible.</p>`; return; }
    const ids = (set.cards || []).map((c) => c.id);
    const cards = [];
    let done = 0;
    box.innerHTML = `<p class="muted small" id="mk-prog">Analyse des prix… 0 / ${ids.length}</p>`;
    S.stop = MG.loadQueue(ids, lang, (card) => {
      done++;
      if (card) cards.push(card);
      const p = document.getElementById("mk-prog");
      if (p) p.textContent = `Analyse des prix… ${done} / ${ids.length}`;
      if (done === ids.length) renderMarket(box, cards, lang);
    }, 6);
  }

  function renderMarket(box, cards, lang) {
    const { esc } = ui();
    const rows = [];
    for (const c of cards) {
      const cm = c.cardmarket;
      if (!cm) continue;
      const holo = !(cm.avg7 && cm.avg30) && cm["avg7-holo"] && cm["avg30-holo"];
      const a7 = holo ? cm["avg7-holo"] : cm.avg7, a30 = holo ? cm["avg30-holo"] : cm.avg30;
      const now = holo ? (cm["trend-holo"] || a7) : (cm.trend || a7);
      if (!a7 || !a30 || now < MIN_PRICE) continue;
      rows.push({ c, now, change: (a7 - a30) / a30 });
    }
    if (!rows.length) { box.innerHTML = `<p class="muted">Pas encore assez de prix pour cette extension (fréquent pour les toutes nouvelles sorties).</p>`; return; }
    const ups = rows.filter((r) => r.change > 0.02).sort((a, b) => b.change - a.change).slice(0, 8);
    const downs = rows.filter((r) => r.change < -0.02).sort((a, b) => a.change - b.change).slice(0, 8);
    const top = rows.slice().sort((a, b) => b.now - a.now).slice(0, 8);
    const avg = rows.reduce((t, r) => t + r.change, 0) / rows.length;
    const line = (r) => {
      const R = MG.rarity(r.c.rarity);
      const img = MG.cardImg(r.c.image, "low");
      return `<li class="mk-row" data-id="${esc(r.c.id)}">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="mk-ph"></span>`}
        <span class="mk-name"><b>${esc(r.c.name)}</b><small class="muted"><span class="rar ${R.cls}">${esc(R.icon)}</span> #${esc(r.c.localId)}</small></span>
        <span class="mk-val"><b>${eur(r.now)}</b><small class="${r.change >= 0 ? "up" : "down"}">${r.change >= 0 ? "▲ +" : "▼ "}${(r.change * 100).toFixed(0)} %</small></span>
      </li>`;
    };
    box.innerHTML = `
      <p class="small">Tendance générale de l'extension : <b class="${avg >= 0 ? "up" : "down"}">${avg >= 0 ? "▲ +" : "▼ "}${(avg * 100).toFixed(1).replace(".", ",")} %</b> <span class="muted">(moyenne sur ${rows.length} cartes)</span></p>
      <div class="mk-grid">
        <div><h3>🚀 Plus fortes hausses</h3>${ups.length ? `<ul class="mk-list">${ups.map(line).join("")}</ul>` : `<p class="muted small">Aucune hausse notable.</p>`}</div>
        <div><h3>📉 Plus fortes baisses</h3>${downs.length ? `<ul class="mk-list">${downs.map(line).join("")}</ul>` : `<p class="muted small">Aucune baisse notable.</p>`}</div>
        <div><h3>💎 Les plus chères</h3><ul class="mk-list">${top.map(line).join("")}</ul></div>
      </div>`;
    box.querySelectorAll(".mk-row").forEach((li) => li.addEventListener("click", () => MG.ui.openCard(lang, li.dataset.id)));
  }

  /* ---------------- Actus ---------------- */
  function renderNews() {
    const el = document.getElementById("nw-list");
    if (!el) return;
    const { esc } = ui();
    const admin = auth() && auth().isAdmin && auth().isAdmin();
    el.innerHTML = S.news.length ? S.news.map((n) => {
      const url = /^https?:\/\//i.test(n.url || "") ? n.url : "";
      return `<article class="nw-item">
        <div class="nw-meta"><span class="ag-kind">${CATS[n.category] || "📰"} ${esc(n.category)}</span><span class="muted small">${esc(new Date(n.published + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }))}</span></div>
        <h3>${esc(n.title)}</h3>
        <p>${esc(n.summary)}</p>
        <p class="small">${url ? `<a class="accent-link" target="_blank" rel="noopener noreferrer nofollow" href="${esc(url)}">Lire la source${n.source ? " (" + esc(n.source) + ")" : ""} ↗</a>` : n.source ? `<span class="muted">Source : ${esc(n.source)}</span>` : ""}
        ${admin ? ` · <button class="link-btn small" data-del="${esc(n.id)}">Supprimer</button>` : ""}</p>
      </article>`;
    }).join("") : `<p class="muted">Pas encore d'actu.</p>`;
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer cette actu ?")) return;
      const { error } = await auth().client.from("news").delete().eq("id", b.dataset.del);
      if (!error) { S.news = S.news.filter((x) => x.id !== b.dataset.del); renderNews(); }
    }));
  }

  function openPropose() {
    const a = auth();
    const admin = a.isAdmin && a.isAdmin();
    const { $ } = ui();
    $("#modal-body").innerHTML = `
      <h2 id="modal-title">${admin ? "Publier une actu" : "Proposer une actu"}</h2>
      ${admin ? "" : `<p class="muted small">Elle sera vérifiée par l'administrateur avant d'être publiée. Indique toujours ta source.</p>`}
      <form id="f-nw" class="form">
        <label>Catégorie<select name="category">${Object.keys(CATS).map((c) => `<option>${c}</option>`).join("")}</select></label>
        <label>Titre<input name="title" required minlength="5" maxlength="160"></label>
        <label>Résumé (avec tes mots)<textarea name="summary" required minlength="10" maxlength="1200" rows="5"></textarea></label>
        <div class="row">
          <label class="grow">Lien de la source<input name="url" type="url" maxlength="400" placeholder="https://…"></label>
          <label class="grow">Nom de la source<input name="source" maxlength="120" placeholder="ex : pokemon.com"></label>
        </div>
        <p class="form-msg" id="nw-msg" role="alert"></p>
        <button class="btn full" type="submit">${admin ? "Publier" : "Envoyer"}</button>
      </form>`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    const form = $("#f-nw");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const msg = $("#nw-msg");
      const url = String(f.get("url") || "").trim();
      if (url && !/^https?:\/\//i.test(url)) { msg.textContent = "Le lien doit commencer par https://"; msg.className = "form-msg err"; return; }
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const { error } = await a.client.from("news").insert({
        title: String(f.get("title")).trim().slice(0, 160), summary: String(f.get("summary")).trim().slice(0, 1200),
        category: CATS[f.get("category")] ? f.get("category") : "Actu", url: url || null,
        source: String(f.get("source") || "").trim().slice(0, 120) || null,
        status: admin ? "approved" : "pending", created_by: a.user.id,
      });
      btn.disabled = false;
      if (error) { msg.textContent = /limite/i.test(error.message || "") ? error.message : "Impossible d'envoyer (titre 5 caractères min., résumé 10 min.)."; msg.className = "form-msg err"; return; }
      $("#modal-body").innerHTML = `<div class="state"><p>✅ ${admin ? "Actu publiée." : "Merci ! Ton actu a été envoyée."}</p></div>`;
      if (admin) MG.route();
    });
  }

  /* ---------------- Espace admin ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc } = ui();
    const a = auth();
    const { data, error } = await a.client.from("news").select("id,title,summary,category,url,source").eq("status", "pending").order("created_at").limit(50);
    if (error) throw error;
    el.innerHTML = `<section><h2>📰 Actus à valider (${data.length})</h2>
      ${data.length ? `<div class="mod-list">${data.map((n) => `<div class="mod-item" data-id="${esc(n.id)}">
        <div><b>${esc(n.title)}</b> · ${esc(n.category)}<br><span class="small">${esc(n.summary)}</span><br>
        <span class="small muted">${esc(n.source || "")} ${/^https?:/.test(n.url || "") ? `· <a target="_blank" rel="noopener noreferrer" href="${esc(n.url)}">source</a>` : ""}</span></div>
        <div class="row"><button class="btn" data-act="approved">Publier</button><button class="btn ghost" data-act="rejected">Refuser</button></div></div>`).join("")}</div>`
      : `<p class="muted">Aucune actu en attente.</p>`}</section>`;
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".mod-item").dataset.id;
      const { error: err } = await a.client.from("news").update({ status: b.dataset.act, published: new Date().toISOString().slice(0, 10) }).eq("id", id);
      ui().toast(err ? "Erreur" : b.dataset.act === "approved" ? "Actu publiée ✓" : "Actu refusée");
      if (!err) b.closest(".mod-item").remove();
    }));
  });

  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/actus") && S.stop) { S.stop(); S.stop = null; } });
})(window.MG);
