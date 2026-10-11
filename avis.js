/* ==========================================================
   MGTCG — avis.js   (V3 : communauté)
   Avis encadrés sur les boutiques et les produits scellés :
   une note de 1 à 5, des points positifs / négatifs choisis dans
   une liste, et un court commentaire facultatif publié seulement
   après validation par l'administrateur. Pas de discussion libre.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const COLS = "id,target_kind,target_id,target_name,rating,pros,cons,comment_public,created_at";
  const TAGS = {
    boutique: {
      pros: ["Bon accueil", "Bons conseils", "Prix corrects", "Bien approvisionnée", "Tournois / animations", "Prix de sortie respectés", "Cartes à l'unité", "Coin pour jouer"],
      cons: ["Prix trop élevés", "Souvent en rupture", "Lots imposés", "Accueil à revoir", "Horaires pas fiables"],
    },
    produit: {
      pros: ["Bon rapport qualité-prix", "Belles cartes promo", "Contenu généreux", "Joli objet", "Idéal pour débuter"],
      cons: ["Trop cher", "Peu de contenu", "Emballage fragile", "Difficile à trouver", "Revendu trop cher"],
    },
  };
  const CONTACT_RE = /(@|https?:\/\/|www\.|\.(com|fr|net)\b|(\+33|\b0)[1-9]([ .-]?\d{2}){4}|snap|insta|whatsapp|discord|telegram)/i;
  const stars = (n) => "★★★★★".slice(0, Math.round(n)) + "☆☆☆☆☆".slice(0, 5 - Math.round(n));

  function summary(list) {
    const n = list.length;
    const avg = n ? list.reduce((t, r) => t + r.rating, 0) / n : 0;
    const count = (field) => {
      const m = new Map();
      list.forEach((r) => (r[field] || []).forEach((t) => m.set(t, (m.get(t) || 0) + 1)));
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return { n, avg, pros: count("pros"), cons: count("cons") };
  }

  /* ---------------- Bloc d'avis (boutique ou produit) ---------------- */
  async function mount(el, kind, id, name) {
    if (!el) return;
    const { esc, fmtDate } = ui();
    const a = auth();
    if (!a || !a.enabled) { el.innerHTML = `<p class="muted small">Les avis arrivent dès que les comptes sont activés.</p>`; return; }
    el.innerHTML = `<p class="muted small">Chargement des avis…</p>`;
    const { data, error } = await a.client.from("reviews").select(COLS).eq("target_kind", kind).eq("target_id", id).order("created_at", { ascending: false }).limit(200);
    if (!el.isConnected) return;
    if (error) { el.innerHTML = `<p class="muted small">Avis bientôt disponibles (admin : lance <code>supabase-avis.sql</code>).</p>`; return; }
    const list = data || [];
    const s = summary(list);
    let mine = null;
    if (a.user) { const r = await a.client.rpc("mon_avis", { kind, tid: id }); mine = (r && r.data && r.data[0]) || null; }
    const comments = list.filter((r) => r.comment_public).slice(0, 6);
    el.innerHTML = `
      <div class="av-sum">
        ${s.n ? `<div class="av-score"><b>${s.avg.toFixed(1).replace(".", ",")}</b><span class="av-stars" aria-label="${s.avg.toFixed(1)} sur 5">${stars(s.avg)}</span><small class="muted">${s.n} avis</small></div>` : `<p class="muted small">Pas encore d'avis. Sois le premier !</p>`}
        ${s.pros.length || s.cons.length ? `<div class="av-tags">${s.pros.slice(0, 5).map(([t, c]) => `<span class="av-tag pro">👍 ${esc(t)} <small>${c}</small></span>`).join("")}${s.cons.slice(0, 4).map(([t, c]) => `<span class="av-tag con">👎 ${esc(t)} <small>${c}</small></span>`).join("")}</div>` : ""}
      </div>
      ${comments.length ? `<ul class="av-list">${comments.map((r) => `<li><span class="av-stars small">${stars(r.rating)}</span> <span>« ${esc(r.comment_public)} »</span> <small class="muted">${esc(fmtDate(r.created_at.slice(0, 10)))}</small></li>`).join("")}</ul>` : ""}
      ${a.user ? `<details class="av-form-wrap" ${mine ? "" : ""}><summary class="btn ghost small">${mine ? "✏️ Modifier mon avis" : "⭐ Donner mon avis"}</summary>
        <form class="av-form">
          <div class="av-rate" role="radiogroup" aria-label="Ma note">${[5, 4, 3, 2, 1].map((n) => `<label title="${n} sur 5"><input type="radio" name="rating" value="${n}" ${mine && mine.rating === n ? "checked" : ""} required><span>★</span></label>`).join("")}</div>
          <p class="small"><b>Les points positifs</b></p>
          <div class="av-checks">${TAGS[kind].pros.map((t) => `<label><input type="checkbox" name="pros" value="${esc(t)}" ${mine && mine.pros.includes(t) ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
          <p class="small"><b>Les points négatifs</b></p>
          <div class="av-checks">${TAGS[kind].cons.map((t) => `<label><input type="checkbox" name="cons" value="${esc(t)}" ${mine && mine.cons.includes(t) ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
          <label class="av-com">Un mot en plus ? (facultatif, 300 caractères)<textarea name="comment" maxlength="300" rows="2" placeholder="ex : super ambiance les soirs de tournoi">${esc(mine && mine.comment ? mine.comment : "")}</textarea></label>
          <p class="muted small">Le commentaire s'affiche après vérification par l'administrateur. Pas de lien, de pseudo ni de coordonnées. ${mine && mine.comment && !mine.comment_ok ? "⏳ Ton commentaire est en attente de validation." : ""}</p>
          <p class="form-msg" role="alert"></p>
          <div class="row"><button class="btn" type="submit">${mine ? "Enregistrer" : "Publier mon avis"}</button>${mine ? `<button class="link-btn small" type="button" data-del>Supprimer mon avis</button>` : ""}</div>
        </form></details>` : `<p class="small"><a class="accent-link" href="#/connexion">Connecte-toi</a> pour donner ton avis.</p>`}`;
    const form = el.querySelector(".av-form");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const msg = form.querySelector(".form-msg");
      const comment = String(f.get("comment") || "").trim();
      const err = (t) => { msg.textContent = t; msg.className = "form-msg err"; };
      if (!f.get("rating")) return err("Choisis une note de 1 à 5 étoiles.");
      if (comment && CONTACT_RE.test(comment)) return err("Pas de lien, de pseudo ni de coordonnées dans le commentaire.");
      if (comment && comment.length < 3) return err("Commentaire trop court.");
      const row = { rating: parseInt(f.get("rating"), 10), pros: f.getAll("pros").filter((t) => TAGS[kind].pros.includes(t)).slice(0, 5),
        cons: f.getAll("cons").filter((t) => TAGS[kind].cons.includes(t)).slice(0, 5), comment: comment || null };
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const res = mine
        ? await a.client.from("reviews").update(row).eq("id", mine.id)
        : await a.client.from("reviews").insert(Object.assign({ target_kind: kind, target_id: id, target_name: String(name || "").slice(0, 80) || "Sans nom" }, row));
      btn.disabled = false;
      if (res.error) return err(/[àéèêç]/.test(res.error.message || "") ? res.error.message : "Impossible d'enregistrer ton avis. Réessaie dans un instant.");
      ui().toast(comment && (!mine || comment !== mine.comment) ? "Merci ! Ta note est publiée, ton commentaire sera vérifié." : "Merci pour ton avis ⭐");
      mount(el, kind, id, name);
    });
    const del = form.querySelector("[data-del]");
    if (del) del.addEventListener("click", async () => {
      if (!confirm("Supprimer ton avis ?")) return;
      await a.client.from("reviews").delete().eq("id", mine.id);
      mount(el, kind, id, name);
    });
  }

  /* ---------------- Page Communauté ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.communaute = async function () {
    const { view, loading, esc, fmtDate } = ui();
    const a = auth();
    view().innerHTML = loading("Chargement de la communauté…");
    let list = [], err = !a || !a.enabled;
    if (!err) {
      const { data, error } = await a.client.from("reviews").select(COLS).order("created_at", { ascending: false }).limit(500);
      err = !!error; list = data || [];
    }
    const group = (kind) => {
      const m = new Map();
      list.filter((r) => r.target_kind === kind).forEach((r) => { const g = m.get(r.target_id) || { name: r.target_name, list: [] }; g.list.push(r); m.set(r.target_id, g); });
      return [...m.values()].map((g) => Object.assign(g, summary(g.list))).filter((g) => g.n >= 1)
        .sort((x, y) => (y.avg * Math.min(y.n, 5)) - (x.avg * Math.min(x.n, 5)) || y.n - x.n).slice(0, 8);
    };
    const shops = group("boutique"), prods = group("produit");
    const recent = list.filter((r) => r.comment_public).slice(0, 12);
    const top = (g) => `<li><span class="grow"><b>${esc(g.name)}</b>${g.pros[0] ? ` <small class="muted">👍 ${esc(g.pros[0][0])}</small>` : ""}</span><span class="av-stars small">${stars(g.avg)}</span><small class="muted">${g.avg.toFixed(1).replace(".", ",")} · ${g.n} avis</small></li>`;
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>💬 Communauté</h1>
        <p class="muted">Les avis des membres sur les boutiques et les produits scellés. Pour donner le tien, ouvre une boutique sur la <a class="accent-link" href="#/boutiques">carte</a> ou un produit dans les <a class="accent-link" href="#/scelles">Scellés</a>.</p>
      </div></header>
      ${err ? `<p class="muted">Avis bientôt disponibles (admin : lance <code>supabase-avis.sql</code>).</p>` : `
      <div class="av-cols">
        <section class="tool-card"><h2>🏪 Boutiques les mieux notées</h2>${shops.length ? `<ul class="av-top">${shops.map(top).join("")}</ul>` : `<p class="muted small">Pas encore d'avis sur les boutiques.</p>`}</section>
        <section class="tool-card"><h2>📦 Produits les mieux notés</h2>${prods.length ? `<ul class="av-top">${prods.map(top).join("")}</ul>` : `<p class="muted small">Pas encore d'avis sur les produits.</p>`}</section>
      </div>
      <section><h2>🗨️ Derniers commentaires</h2>
        ${recent.length ? `<ul class="av-list av-recent">${recent.map((r) => `<li><span class="ag-kind">${r.target_kind === "boutique" ? "🏪" : "📦"} ${esc(r.target_name)}</span> <span class="av-stars small">${stars(r.rating)}</span><span>« ${esc(r.comment_public)} »</span><small class="muted">${esc(fmtDate(r.created_at.slice(0, 10)))}</small></li>`).join("")}</ul>` : `<p class="muted">Pas encore de commentaire.</p>`}
      </section>`}
      <section class="tool-card">
        <h2>🤝 Les règles de la communauté</h2>
        <ul class="sh-list">
          <li>Des avis honnêtes, sur ce que tu as vraiment vécu.</li>
          <li>Pas d'insulte, pas de pseudo, pas de lien ni de coordonnées : les commentaires sont vérifiés avant publication.</li>
          <li>Un avis par membre et par boutique ou produit (tu peux le modifier quand tu veux).</li>
          <li>Pour échanger des cartes, passe par les <a class="accent-link" href="#/echanges">échanges encadrés</a> ; pour une arnaque, utilise le <a class="accent-link" href="#/bouclier">bouclier</a>.</li>
        </ul>
      </section>`;
  };

  /* ---------------- Espace admin ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc } = ui();
    const c = auth().client;
    const { data, error } = await c.rpc("avis_a_valider");
    if (error) throw error;
    const list = data || [];
    el.innerHTML = `<section><h2>💬 Commentaires d'avis à valider (${list.length})</h2>
      <p class="muted small">La note et les points cochés sont déjà publiés ; seul le commentaire attend ton accord.</p>
      ${list.length ? `<div class="mod-list">${list.map((r) => `<div class="mod-item" data-id="${esc(r.id)}">
        <div><b>${esc(r.target_name)}</b> · ${r.target_kind === "boutique" ? "boutique" : "produit"} · ${"★".repeat(r.rating)}<br><span class="small">« ${esc(r.comment)} »</span></div>
        <div class="row"><button class="btn" data-act="ok">Publier</button><button class="btn ghost" data-act="no">Refuser le commentaire</button><button class="btn ghost danger" data-act="hide">Masquer l'avis</button></div></div>`).join("")}</div>`
      : `<p class="muted">Aucun commentaire en attente.</p>`}</section>`;
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
      const it = b.closest(".mod-item");
      const patch = b.dataset.act === "ok" ? { comment_ok: true } : b.dataset.act === "no" ? { comment: null } : { status: "hidden" };
      const { error: err } = await c.from("reviews").update(patch).eq("id", it.dataset.id);
      ui().toast(err ? "Erreur" : b.dataset.act === "ok" ? "Commentaire publié ✓" : b.dataset.act === "no" ? "Commentaire refusé" : "Avis masqué");
      if (!err) it.remove();
    }));
  });

  MG.avis = { mount, summary };
})(window.MG);
