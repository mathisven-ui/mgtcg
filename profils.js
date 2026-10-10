/* ==========================================================
   MGTCG — profils.js   (V3)
   Badges (calculés à partir de ta collection), objectifs personnels,
   profil public facultatif (pseudo + badges + vitrine de 6 cartes)
   et classements. Aucun texte libre sur les profils publics.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const enc = encodeURIComponent;
  const KEY_RE = /^[a-z-]{2,6}\|[A-Za-z0-9._-]{1,50}$/;
  const RARE_RE = /illustration|hyper|secr|gold|ultra|sp[ée]cial|rainbow|arc-en-ciel|chromatique|shiny|ace spec|double rare/i;
  const S = { names: new Map() };

  /* ---------------- Statistiques de la collection ---------------- */
  function stats() {
    const st = MG.store;
    const keys = st.ownedKeys();
    const langs = new Set(), sets = new Map();
    let versions = 0, rares = 0;
    for (const k of keys) {
      const lang = k.slice(0, k.indexOf("|"));
      langs.add(lang);
      const o = st.owned(lang, k.slice(k.indexOf("|") + 1)) || {};
      versions += Object.keys(o).length;
      const m = st.meta(k) || {};
      if (RARE_RE.test(m.rarity || "")) rares++;
      if (!m.setId) continue;
      const sk = lang + "|" + m.setId;
      const g = sets.get(sk) || { key: sk, lang, setId: m.setId, name: m.setName || m.setId, total: m.setTotal || 0, n: 0 };
      if (m.setTotal) g.total = m.setTotal;
      if (/^\d+$/.test(String(m.localId)) && (!g.total || parseInt(m.localId, 10) <= g.total)) g.n++;
      sets.set(sk, g);
    }
    const setList = [...sets.values()];
    let trades = 0;
    try { trades = JSON.parse(localStorage.getItem("mgtcg:echanges-faits") || "[]").length; } catch (e) { trades = 0; }
    return {
      cards: keys.length, versions, langs: langs.size, rares, sets: setList,
      setsDone: setList.filter((g) => g.total && g.n >= g.total).length,
      value: st.totalValue(), wish: st.listKeys("wish").length, sales: st.sales().length,
      sealed: st.sealedList().length, paid: st.paidKeys().length, alerts: st.alertKeys().length,
      days: st.history().length, trades,
    };
  }

  /* ---------------- Badges ---------------- */
  const tier = (id, icon, name, desc, field, target) => ({ id, icon, name, desc, field, target });
  const BADGES = [
    tier("premiere-carte", "🌱", "Premier pas", "Ajouter ta première carte", "cards", 1),
    tier("cartes-50", "📗", "Collectionneur", "50 cartes", "cards", 50),
    tier("cartes-250", "📘", "Passionné", "250 cartes", "cards", 250),
    tier("cartes-1000", "📕", "Encyclopédie", "1 000 cartes", "cards", 1000),
    tier("cartes-2500", "🏛️", "Musée Pokémon", "2 500 cartes", "cards", 2500),
    tier("set-1", "✅", "Set complet", "Compléter ton premier set", "setsDone", 1),
    tier("set-5", "🏅", "Finisseur", "Compléter 5 sets", "setsDone", 5),
    tier("set-20", "🏆", "Maître des sets", "Compléter 20 sets", "setsDone", 20),
    tier("rares-10", "✨", "Chasseur de rares", "10 cartes rares (illustration, ex, hyper…)", "rares", 10),
    tier("rares-50", "💎", "Œil de lynx", "50 cartes rares", "rares", 50),
    tier("langues-3", "🌍", "Polyglotte", "Des cartes dans 3 langues", "langs", 3),
    tier("langues-6", "🗺️", "Globe-trotteur", "Des cartes dans 6 langues", "langs", 6),
    tier("valeur-100", "💶", "Petit trésor", "Collection estimée à 100 €", "value", 100),
    tier("valeur-1000", "💰", "Coffre-fort", "Collection estimée à 1 000 €", "value", 1000),
    tier("valeur-10000", "👑", "Trésor royal", "Collection estimée à 10 000 €", "value", 10000),
    tier("wishlist-10", "⭐", "Rêveur", "10 cartes dans ta wishlist", "wish", 10),
    tier("echange-1", "🤝", "Premier échange", "Réussir un échange avec un membre", "trades", 1),
    tier("echange-10", "🔄", "Pro de l'échange", "Réussir 10 échanges", "trades", 10),
    tier("vente-1", "🏷️", "Premier vendeur", "Noter une vente dans « Mes ventes »", "sales", 1),
    tier("scelle-1", "📦", "Gardien du scellé", "Ajouter un produit scellé", "sealed", 1),
    tier("comptable-10", "🧾", "Comptable", "Noter le prix d'achat de 10 cartes", "paid", 10),
    tier("vigilant-3", "🔔", "Vigilant", "Créer 3 alertes de prix", "alerts", 3),
    tier("fidele-30", "📅", "Fidèle", "30 jours de suivi de la valeur", "days", 30),
  ];
  const BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));
  const earned = (s) => BADGES.filter((b) => (s[b.field] || 0) >= b.target);

  /* ---------------- Cartes (noms et images) ---------------- */
  function cardInfo(key) { return MG.store.meta(key) || S.names.get(key) || null; }
  async function resolve(keys) {
    const todo = [...new Set(keys)].filter((k) => !cardInfo(k) || !cardInfo(k).image);
    await Promise.all(todo.map(async (key) => {
      const [lang, id] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
      try { const c = await MG.api.card(lang, id); S.names.set(key, { name: c.name, image: c.image, setName: c.set ? c.set.name : "", localId: c.localId }); }
      catch (e) { S.names.set(key, { name: id, image: "", setName: "" }); }
    }));
  }
  function vitrine(keys) {
    const { esc } = ui();
    if (!keys.length) return `<p class="muted small">Aucune carte en vitrine.</p>`;
    return `<div class="pf-vitrine">${keys.map((k) => {
      const m = cardInfo(k) || {};
      const img = MG.cardImg(m.image, "low");
      return `<button class="pf-card" data-key="${esc(k)}" title="${esc(m.name || "")}">${img ? `<img src="${esc(img)}" alt="${esc(m.name || "")}" loading="lazy">` : `<span class="pf-ph">${esc(m.name || "?")}</span>`}<small>${esc(m.name || "")}</small></button>`;
    }).join("")}</div>`;
  }
  function bindVitrine(root) {
    root.querySelectorAll(".pf-card").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.key;
      ui().openCard(k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1));
    }));
  }
  const badgeHTML = (b, on, s) => {
    const { esc } = ui();
    const cur = Math.min(s ? s[b.field] || 0 : b.target, b.target);
    const pct = Math.round((cur / b.target) * 100);
    return `<div class="pf-badge ${on ? "on" : ""}" title="${esc(b.desc)}">
      <span class="pf-ico">${b.icon}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
      ${!on && s ? `<span class="bar"><span style="width:${pct}%"></span></span><small class="muted">${b.field === "value" ? Math.floor(cur) + " / " + b.target + " €" : cur + " / " + b.target}</small>` : ""}
    </div>`;
  };

  /* ---------------- Mon profil ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.profil = async function (arg) {
    if (arg) return publicProfile(arg);
    const { view, esc, eur, fmtDate, toast } = ui();
    const s = stats();
    const got = earned(s);
    const a = auth();
    let pub = null, pubErr = false;
    if (a && a.enabled && a.user) {
      const { data, error } = await a.client.from("public_profiles").select("user_id,pseudo,showcase,badges,cards,sets_done,langs,visible,blocked").eq("user_id", a.user.id);
      if (error) pubErr = true; else pub = (data || [])[0] || null;
      // Met à jour les chiffres du profil public s'ils ont changé
      if (pub && !pub.blocked && (pub.cards !== s.cards || pub.sets_done !== s.setsDone || pub.langs !== s.langs || (pub.badges || []).length !== got.length)) {
        await a.client.from("public_profiles").update({ cards: s.cards, sets_done: s.setsDone, langs: s.langs, badges: got.map((b) => b.id) }).eq("user_id", a.user.id);
        Object.assign(pub, { cards: s.cards, sets_done: s.setsDone, langs: s.langs, badges: got.map((b) => b.id) });
      }
    }
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🏅 Mon profil & mes badges</h1>
        <p class="muted">Tes badges se débloquent tout seuls en complétant ta collection. Fixe-toi des objectifs et, si tu veux, montre ta vitrine aux autres membres.</p>
      </div></header>
      <div class="imp-stats pf-stats">
        <div><b>${s.cards}</b><span>cartes</span></div>
        <div><b>${s.setsDone}</b><span>set${s.setsDone > 1 ? "s" : ""} complété${s.setsDone > 1 ? "s" : ""}</span></div>
        <div><b>${got.length} / ${BADGES.length}</b><span>badges</span></div>
      </div>

      <section>
        <div class="section-head"><h2>🏅 Mes badges</h2><a class="accent-link small" href="#/classements">Voir les classements →</a></div>
        <div class="pf-badges">${BADGES.map((b) => badgeHTML(b, got.includes(b), s)).join("")}</div>
      </section>

      <section class="tool-card">
        <h2>🎯 Mes objectifs</h2>
        <div id="pf-goals"></div>
        <form id="pf-goal-form" class="pf-goal-form">
          <label>Nouvel objectif<select name="type">
            <option value="set">Compléter un set</option>
            <option value="cartes">Atteindre un nombre de cartes</option>
            <option value="valeur">Atteindre une valeur de collection</option>
          </select></label>
          <label class="pf-set">Set<select name="setKey">${s.sets.length ? s.sets.sort((x, y) => (y.total ? y.n / y.total : 0) - (x.total ? x.n / x.total : 0)).map((g) => `<option value="${esc(g.key)}">${esc(g.name)} (${g.lang.toUpperCase()}) — ${g.n}/${g.total || "?"}</option>`).join("") : `<option value="">Commence d'abord un set</option>`}</select></label>
          <label class="pf-target" hidden>Objectif<input name="target" type="number" min="1" step="1" inputmode="numeric" placeholder="ex : 500"></label>
          <label>Avant le (optionnel)<input name="deadline" type="date" min="${new Date().toISOString().slice(0, 10)}"></label>
          <button class="btn" type="submit">＋ Ajouter</button>
        </form>
      </section>

      <section class="tool-card" id="pf-public"></section>`;

    renderGoals(s);
    const gf = document.getElementById("pf-goal-form");
    const sync = () => { const t = gf.type.value; gf.querySelector(".pf-set").hidden = t !== "set"; gf.querySelector(".pf-target").hidden = t === "set"; gf.target.placeholder = t === "valeur" ? "ex : 1000 (€)" : "ex : 500 (cartes)"; };
    gf.type.addEventListener("change", sync); sync();
    gf.addEventListener("submit", (e) => {
      e.preventDefault();
      const t = gf.type.value;
      const g = { id: Math.random().toString(36).slice(2, 12), type: t, deadline: gf.deadline.value, created: new Date().toISOString().slice(0, 10) };
      if (t === "set") {
        const set = s.sets.find((x) => x.key === gf.setKey.value);
        if (!set) return toast("Choisis un set");
        Object.assign(g, { setKey: set.key, label: set.name });
      } else {
        const n = parseFloat(gf.target.value);
        if (!(n > 0)) return toast("Indique un objectif");
        Object.assign(g, { target: n, label: t === "valeur" ? `Collection à ${eur(n)}` : `${n} cartes` });
      }
      if (!MG.store.addGoal(g)) return toast("30 objectifs maximum");
      toast("Objectif ajouté 🎯");
      gf.reset(); sync();
      renderGoals(stats());
    });
    renderPublic(pub, pubErr, s, got);
  };

  function renderGoals(s) {
    const { esc, eur, fmtDate } = ui();
    const el = document.getElementById("pf-goals");
    if (!el) return;
    const goals = MG.store.goals();
    const t = new Date().toISOString().slice(0, 10);
    el.innerHTML = goals.length ? `<div class="pf-goals">${goals.map((g) => {
      let cur = 0, target = g.target, label = g.label, link = "";
      if (g.type === "set") {
        const set = s.sets.find((x) => x.key === g.setKey);
        cur = set ? set.n : 0; target = set && set.total ? set.total : 0; label = "Compléter " + (set ? set.name : g.label);
        const [lang, id] = [g.setKey.slice(0, g.setKey.indexOf("|")), g.setKey.slice(g.setKey.indexOf("|") + 1)];
        link = `<a class="accent-link small" href="#/completer/${enc(id)}/${enc(lang)}">Ce qu'il me manque →</a>`;
      } else if (g.type === "cartes") cur = s.cards;
      else cur = Math.floor(s.value);
      const pct = target ? Math.min(100, Math.round((cur / target) * 100)) : 0;
      const done = target && cur >= target;
      const late = !done && g.deadline && g.deadline < t;
      const days = g.deadline && !done && !late ? Math.ceil((new Date(g.deadline) - new Date(t)) / 864e5) : 0;
      return `<div class="pf-goal ${done ? "done" : ""}">
        <div class="section-head"><b>${done ? "🎉 " : "🎯 "}${esc(label)}</b><button class="link-btn small" data-del="${esc(g.id)}" aria-label="Supprimer l'objectif">✕</button></div>
        <span class="bar"><span style="width:${pct}%"></span></span>
        <small class="muted">${g.type === "valeur" ? `${eur(cur)} / ${eur(target)}` : `${cur} / ${target || "?"}`} · ${pct} %${g.deadline ? ` · ${late ? "<b class='down'>date dépassée</b>" : done ? "atteint !" : `avant le ${esc(fmtDate(g.deadline))} (${days} j)`}` : ""}</small>
        ${link && !done ? `<div>${link}</div>` : ""}
      </div>`;
    }).join("")}</div>` : `<p class="muted small">Pas encore d'objectif. Exemple : « compléter 151 avant Noël ».</p>`;
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { MG.store.removeGoal(b.dataset.del); renderGoals(stats()); }));
  }

  /* ---------------- Profil public (réglages) ---------------- */
  function renderPublic(pub, pubErr, s, got) {
    const { esc, toast } = ui();
    const el = document.getElementById("pf-public");
    const a = auth();
    if (!a || !a.enabled || !a.user) { el.innerHTML = `<h2>🌐 Profil public</h2><p class="muted">Connecte-toi pour avoir un profil public et apparaître dans les classements.</p><a class="btn" href="#/connexion">Se connecter</a>`; return; }
    if (pubErr) { el.innerHTML = `<h2>🌐 Profil public</h2><p class="muted small">Bientôt disponible (admin : lance <code>supabase-profils.sql</code>).</p>`; return; }
    if (pub && pub.blocked) { el.innerHTML = `<h2>🌐 Profil public</h2><p class="muted">Ton profil public a été masqué par l'administrateur.</p>`; return; }
    const owned = MG.store.ownedKeys().filter((k) => KEY_RE.test(k));
    const byPrice = owned.slice().sort((x, y) => (MG.store.priceOf(y) || 0) - (MG.store.priceOf(x) || 0));
    let show = pub ? (pub.showcase || []).filter((k) => owned.includes(k)) : byPrice.slice(0, 6);
    el.innerHTML = `
      <h2>🌐 Mon profil public ${pub && pub.visible ? `<a class="accent-link small" href="#/profil/${enc(pub.pseudo)}">voir →</a>` : ""}</h2>
      <p class="muted small">Facultatif. Les autres voient seulement : ton pseudo, tes badges, ton nombre de cartes, de sets complétés et de langues, et ta vitrine. <b>Jamais</b> ton email, la valeur de ta collection ni le reste de tes cartes.</p>
      <form id="pf-form">
        <div class="sh-grid"><label>Pseudo<input name="pseudo" required maxlength="20" pattern="[A-Za-z0-9_\\-]{3,20}" placeholder="ex : Sacha_75" value="${esc(pub ? pub.pseudo : "")}"></label></div>
        <p class="muted small">3 à 20 lettres, chiffres, - ou _. Pas ton vrai nom, ni ton âge, ni tes réseaux.</p>
        <h3>🖼️ Ma vitrine <span class="muted small" id="pf-n">(${show.length} / 6)</span></h3>
        <div id="pf-show"></div>
        ${owned.length ? `<details class="pf-pick-wrap"><summary class="small">Choisir les cartes de ma vitrine</summary>
          <input type="search" id="pf-q" placeholder="Filtrer ma collection…">
          <div class="tr-pick" id="pf-pick">${byPrice.slice(0, 1500).map((k) => { const m = MG.store.meta(k) || {}; return `<label class="tr-opt" data-s="${esc(((m.name || "") + " " + (m.setName || "")).toLowerCase())}"><input type="checkbox" value="${esc(k)}" ${show.includes(k) ? "checked" : ""}> <b>${esc(m.name || k)}</b> <small class="muted">${esc(m.setName || "")} #${esc(m.localId || "")}</small></label>`; }).join("")}</div></details>` : ""}
        <label class="check"><input type="checkbox" name="visible" ${!pub || pub.visible ? "checked" : ""}> Profil visible et présent dans les classements</label>
        <p class="form-msg" id="pf-msg" role="alert"></p>
        <div class="row"><button class="btn" type="submit">${pub ? "Enregistrer" : "Créer mon profil public"}</button>
        ${pub ? `<button class="btn ghost danger" type="button" id="pf-del">Supprimer mon profil public</button>` : ""}</div>
      </form>`;
    const showEl = el.querySelector("#pf-show");
    const draw = () => { showEl.innerHTML = vitrine(show); bindVitrine(showEl); el.querySelector("#pf-n").textContent = `(${show.length} / 6)`; };
    draw();
    resolve(show).then(draw);
    el.querySelectorAll("#pf-pick input").forEach((i) => i.addEventListener("change", () => {
      if (i.checked && show.length >= 6) { i.checked = false; return toast("6 cartes maximum"); }
      show = i.checked ? show.concat(i.value) : show.filter((k) => k !== i.value);
      draw(); resolve(show).then(draw);
    }));
    const q = el.querySelector("#pf-q");
    if (q) q.addEventListener("input", () => { const v = q.value.trim().toLowerCase(); el.querySelectorAll("#pf-pick .tr-opt").forEach((o) => { o.hidden = v && !o.dataset.s.includes(v); }); });
    el.querySelector("#pf-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const msg = el.querySelector("#pf-msg");
      const pseudo = String(f.get("pseudo") || "").trim();
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(pseudo)) { msg.textContent = "Pseudo : 3 à 20 lettres, chiffres, - ou _ (sans espace ni accent)."; msg.className = "form-msg err"; return; }
      const row = { user_id: a.user.id, pseudo, showcase: show.slice(0, 6), badges: got.map((b) => b.id), cards: s.cards, sets_done: s.setsDone, langs: s.langs, visible: !!f.get("visible") };
      const { error } = await a.client.from("public_profiles").upsert(row, { onConflict: "user_id" });
      if (error) { msg.textContent = /duplicate|unique|pseudo/i.test(error.message || "") ? "Ce pseudo est déjà pris, choisis-en un autre." : "Impossible d'enregistrer. Réessaie dans un instant."; msg.className = "form-msg err"; return; }
      toast("Profil public enregistré ✓");
      MG.route();
    });
    const del = el.querySelector("#pf-del");
    if (del) del.addEventListener("click", async () => {
      if (!confirm("Supprimer ton profil public ? (Tes badges et ta collection restent.)")) return;
      const { error } = await a.client.from("public_profiles").delete().eq("user_id", a.user.id);
      if (!error) { toast("Profil public supprimé"); MG.route(); }
    });
  }

  /* ---------------- Profil d'un membre ---------------- */
  async function publicProfile(pseudo) {
    const { view, loading, esc } = ui();
    const a = auth();
    view().innerHTML = loading("Chargement du profil…");
    if (!a || !a.enabled) { view().innerHTML = `<p class="muted">Profils indisponibles.</p>`; return; }
    const { data, error } = await a.client.from("public_profiles").select("user_id,pseudo,showcase,badges,cards,sets_done,langs,visible,blocked").eq("pseudo", pseudo).limit(1);
    const p = !error && data && data[0];
    if (!p || p.blocked || (!p.visible && !(a.user && a.user.id === p.user_id))) { view().innerHTML = `<div class="state"><p>Ce profil n'existe pas ou n'est pas public.</p><a class="btn" href="#/classements">Voir les classements</a></div>`; return; }
    const badges = (p.badges || []).map((id) => BY_ID[id]).filter(Boolean);
    await resolve(p.showcase || []);
    const me = a.user && a.user.id === p.user_id;
    view().innerHTML = `
      <nav class="crumbs"><a href="#/classements">Classements</a> › <span>${esc(p.pseudo)}</span></nav>
      <header class="page-head"><div><h1>👤 ${esc(p.pseudo)}</h1>
        <p class="muted small">Chiffres déclarés par le membre à partir de sa collection MGTCG.</p></div></header>
      <div class="imp-stats pf-stats">
        <div><b>${p.cards}</b><span>cartes</span></div>
        <div><b>${p.sets_done}</b><span>sets complétés</span></div>
        <div><b>${badges.length}</b><span>badges</span></div>
      </div>
      <section><h2>🖼️ Vitrine</h2><div id="pf-v">${vitrine(p.showcase || [])}</div></section>
      <section><h2>🏅 Badges</h2>${badges.length ? `<div class="pf-badges">${badges.map((b) => badgeHTML(b, true)).join("")}</div>` : `<p class="muted">Pas encore de badge.</p>`}</section>
      ${a.user && !me ? `<p class="small"><button class="link-btn small" id="pf-report">Signaler ce profil</button></p>` : ""}
      ${me ? `<p><a class="btn ghost" href="#/profil">Modifier mon profil</a></p>` : ""}`;
    bindVitrine(document.getElementById("pf-v"));
    const rep = document.getElementById("pf-report");
    if (rep) rep.addEventListener("click", async () => {
      const reason = confirm("Signaler ce profil à l'administrateur (pseudo ou vitrine inappropriés) ?");
      if (!reason) return;
      const { error: err } = await a.client.from("trade_reports").insert({ reporter: a.user.id, reported: p.user_id, reason: "Pseudo inapproprié" });
      ui().toast(err ? "Impossible d'envoyer le signalement" : "Merci, c'est signalé");
    });
  }

  /* ---------------- Classements ---------------- */
  const BOARDS = { cards: "📚 Plus de cartes", sets_done: "✅ Plus de sets complétés", badge_count: "🏅 Plus de badges" };
  R.classements = async function (arg) {
    const { view, loading, esc } = ui();
    const col = BOARDS[arg] ? arg : "cards";
    const a = auth();
    view().innerHTML = loading("Chargement des classements…");
    let rows = [], err = false;
    if (a && a.enabled) {
      const { data, error } = await a.client.from("public_profiles").select("user_id,pseudo,cards,sets_done,langs,badge_count,badges,visible,blocked").eq("visible", true).order(col, { ascending: false }).limit(100);
      if (error) err = true;
      rows = (data || []).filter((r) => !r.blocked).map((r) => Object.assign(r, { badge_count: r.badge_count ?? (r.badges || []).length })).sort((x, y) => (y[col] || 0) - (x[col] || 0)).slice(0, 50);
    }
    const meId = a && a.user ? a.user.id : null;
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🏆 Classements</h1>
        <p class="muted">Les membres qui ont choisi d'avoir un profil public. Chiffres déclarés à partir de leur collection MGTCG.</p>
      </div></header>
      <div class="chips tool-tabs">${Object.entries(BOARDS).map(([k, v]) => `<a class="chip ${k === col ? "active" : ""}" href="#/classements/${k}">${v}</a>`).join("")}</div>
      ${err ? `<p class="muted">Bientôt disponible (admin : lance <code>supabase-profils.sql</code>).</p>`
        : rows.length ? `<div class="table-wrap"><table class="table pf-board"><thead><tr><th>#</th><th>Membre</th><th class="right">Cartes</th><th class="right">Sets</th><th class="right">Badges</th></tr></thead><tbody>
          ${rows.map((r, i) => `<tr class="${r.user_id === meId ? "pf-me" : ""}"><td>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</td><td><a class="accent-link" href="#/profil/${enc(r.pseudo)}">${esc(r.pseudo)}</a></td><td class="right ${col === "cards" ? "pf-col" : ""}">${r.cards}</td><td class="right ${col === "sets_done" ? "pf-col" : ""}">${r.sets_done}</td><td class="right ${col === "badge_count" ? "pf-col" : ""}">${r.badge_count}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="state"><p>Personne dans le classement pour l'instant. Sois le premier !</p></div>`}
      <p><a class="btn ghost" href="#/profil">🏅 Mon profil & mes badges</a></p>`;
  };

  /* ---------------- Espace admin ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc } = ui();
    const c = auth().client;
    const { data, error } = await c.from("public_profiles").select("user_id,pseudo,cards,blocked,updated_at").order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    const rep = await c.from("trade_reports").select("reported").eq("handled", false).limit(500);
    const flagged = new Set(((rep && rep.data) || []).map((r) => r.reported));
    const list = data.slice().sort((x, y) => flagged.has(y.user_id) - flagged.has(x.user_id));
    el.innerHTML = `<section><h2>👤 Profils publics (${list.length})</h2>
      <p class="muted small">Masque un profil si son pseudo ou sa vitrine posent problème. ⚠️ = signalé.</p>
      ${list.length ? `<div class="mod-list">${list.map((p) => `<div class="mod-item" data-uid="${esc(p.user_id)}">
        <div>${flagged.has(p.user_id) ? "⚠️ " : ""}<b>${esc(p.pseudo)}</b> · ${p.cards} cartes ${p.blocked ? '<span class="ag-kind">masqué</span>' : ""}<br><a class="small accent-link" href="#/profil/${enc(p.pseudo)}">voir</a></div>
        <div class="row"><button class="btn ghost" data-act="${p.blocked ? "show" : "hide"}">${p.blocked ? "Rétablir" : "Masquer"}</button></div></div>`).join("")}</div>`
      : `<p class="muted">Aucun profil public.</p>`}</section>`;
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
      const it = b.closest(".mod-item");
      const hide = b.dataset.act === "hide";
      const { error: err } = await c.from("public_profiles").update({ blocked: hide }).eq("user_id", it.dataset.uid);
      ui().toast(err ? "Erreur" : hide ? "Profil masqué" : "Profil rétabli");
      if (!err) { b.dataset.act = hide ? "show" : "hide"; b.textContent = hide ? "Rétablir" : "Masquer"; }
    }));
  });

  MG.profils = { stats, BADGES, earned };
})(window.MG);
