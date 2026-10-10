/* ==========================================================
   MGTCG — echanges.js   (V3)
   Échanges entre membres : chacun publie ses cartes à échanger
   (ses doubles) et sa wishlist, MGTCG trouve les correspondances.
   Sécurité : pas de messagerie libre, pas de coordonnées. On se
   propose un échange dans une boutique ou un événement public.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const enc = encodeURIComponent;
  const KEY_RE = /^[a-z-]{2,6}\|[A-Za-z0-9._-]+$/;
  const SLOTS = { matin: "le matin", midi: "le midi", "apres-midi": "l'après-midi" };
  const REASONS = ["Contact hors du site", "Comportement inapproprié", "Faux échange / arnaque", "Pseudo inapproprié", "Autre"];
  const S = { me: null, lists: [], offers: [], blocks: new Set(), places: null, tab: "matches", names: new Map() };
  let hooked = false;

  /* ---------------- Outils ---------------- */
  const myWants = () => MG.store.listKeys("wish").filter((k) => KEY_RE.test(k)).slice(0, 500);
  const pseudoOf = (uid) => (uid === (S.me && S.me.user_id) ? "toi" : ((S.lists.find((l) => l.user_id === uid) || {}).pseudo || "un membre"));
  const today = () => new Date().toISOString().slice(0, 10);
  const addDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const applied = () => { try { return JSON.parse(localStorage.getItem("mgtcg:echanges-faits") || "[]"); } catch (e) { return []; } };
  const markApplied = (id) => { try { localStorage.setItem("mgtcg:echanges-faits", JSON.stringify(applied().concat(id).slice(-300))); } catch (e) { /* rien */ } };

  function info(key) {
    const m = MG.store.meta(key) || S.names.get(key);
    return m || null;
  }
  function chip(key) {
    const { esc, eur } = ui();
    const m = info(key);
    const lang = key.slice(0, key.indexOf("|"));
    const flag = MG.flag(lang, (MG.LANGS.find((x) => x.code === lang) || {}).label || lang);
    return `<span class="tr-card" data-key="${esc(key)}">${flag} <b>${m ? esc(m.name) : "…"}</b>${m ? ` <small class="muted">${esc(m.setName || "")} #${esc(m.localId || "")}</small>` : ""}${m && m.price ? ` <small class="tr-price">${eur(m.price)}</small>` : ""}</span>`;
  }
  // Récupère le nom des cartes qu'on ne connaît pas encore (cartes des autres membres)
  async function resolve(keys, root) {
    const todo = [...new Set(keys)].filter((k) => !info(k)).slice(0, 120);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, async () => {
      while (i < todo.length) {
        const key = todo[i++];
        const [lang, id] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
        try {
          const c = await MG.api.card(lang, id);
          const cm = c.cardmarket || {};
          S.names.set(key, { name: c.name, setName: c.set ? c.set.name : "", localId: c.localId, price: cm.trend || cm.avg || cm["trend-holo"] || 0 });
        } catch (e) { S.names.set(key, { name: id, setName: "", localId: "" }); }
      }
    }));
    if (root && root.isConnected) root.querySelectorAll(".tr-card").forEach((el) => { if (todo.includes(el.dataset.key)) el.outerHTML = chip(el.dataset.key); });
  }
  const priceSum = (keys) => keys.reduce((t, k) => t + ((info(k) || {}).price || 0), 0);

  /* ---------------- Chargement ---------------- */
  async function load() {
    const a = auth();
    const uid = a.user.id;
    const c = a.client;
    const [mine, all, sent, recv, blocks] = await Promise.all([
      c.from("trade_lists").select("user_id,pseudo,dept,haves,wants,active,blocked,updated_at").eq("user_id", uid),
      c.from("trade_lists").select("user_id,pseudo,dept,haves,wants,active,blocked,updated_at").eq("active", true).limit(2000),
      c.from("trade_offers").select("*").eq("from_user", uid).order("created_at", { ascending: false }).limit(200),
      c.from("trade_offers").select("*").eq("to_user", uid).order("created_at", { ascending: false }).limit(200),
      c.from("trade_blocks").select("blocked").eq("blocker", uid),
    ]);
    const err = mine.error || all.error;
    if (err) throw err;
    S.me = (mine.data || [])[0] || null;
    S.blocks = new Set((blocks.data || []).map((b) => b.blocked));
    S.lists = (all.data || []).filter((l) => l.user_id !== uid && !l.blocked);
    const seen = new Set();
    S.offers = [...(sent.data || []), ...(recv.data || [])].filter((o) => !seen.has(o.id) && seen.add(o.id)).sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
  }

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.echanges = async function (arg) {
    if (!hooked && MG.on) { hooked = true; MG.on("auth", () => { if (location.hash.startsWith("#/echanges")) MG.route(); }); }
    const { view, loading, esc } = ui();
    const a = auth();
    if (["matches", "offres", "liste"].includes(arg)) S.tab = arg;
    const head = `<header class="page-head"><div>
        <h1>🔄 Échanges entre membres</h1>
        <p class="muted">Mets tes doubles « à échanger », MGTCG trouve les membres qui ont les cartes de ta wishlist, et vous vous donnez rendez-vous dans une boutique ou un événement.</p>
      </div></header>
      <div class="tr-safe">🛡️ <div><b>Échanges uniquement en lieu public.</b> Pas de messagerie, pas de coordonnées : chaque proposition se fait dans une boutique ou un événement de MGTCG, en journée. Si tu es mineur, viens avec un adulte. Ne donne jamais ton adresse, ton numéro ou tes réseaux, et <b>signale</b> tout membre qui te les demande.</div></div>`;
    if (!a || !a.enabled) { view().innerHTML = head + `<p class="muted">Les échanges arrivent bientôt.</p>`; return; }
    if (!a.user) { view().innerHTML = head + `<div class="state"><p>Connecte-toi pour échanger avec les autres membres.</p><a class="btn" href="#/connexion">Se connecter</a></div>`; return; }
    view().innerHTML = head + loading("Chargement des échanges…");
    try { await load(); }
    catch (e) { view().innerHTML = head + `<p class="muted">Les échanges arrivent dès que la base est prête (admin : lance <code>supabase-echanges.sql</code>).</p>`; return; }
    if (!S.me) S.tab = "liste";
    const pendingIn = S.offers.filter((o) => o.to_user === a.user.id && o.status === "pending").length;
    view().innerHTML = head + `
      <div class="chips tool-tabs">
        <a class="chip ${S.tab === "matches" ? "active" : ""}" href="#/echanges/matches">🤝 Correspondances</a>
        <a class="chip ${S.tab === "offres" ? "active" : ""}" href="#/echanges/offres">📬 Mes propositions${pendingIn ? ` <span class="tr-badge">${pendingIn}</span>` : ""}</a>
        <a class="chip ${S.tab === "liste" ? "active" : ""}" href="#/echanges/liste">📋 Ma liste d'échange</a>
      </div>
      <div id="tr-body"></div>`;
    const body = document.getElementById("tr-body");
    if (S.tab === "liste") return renderList(body);
    if (S.tab === "offres") return renderOffers(body);
    return renderMatches(body);
  };

  /* ---------------- Ma liste ---------------- */
  function renderList(body) {
    const { esc, toast } = ui();
    const me = S.me || { pseudo: "", dept: "", haves: [], active: true };
    const haves = new Set(me.haves || []);
    const owned = MG.store.ownedKeys().filter((k) => KEY_RE.test(k)).map((k) => ({ k, m: MG.store.meta(k) || {}, o: MG.store.owned(k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)) || {} }))
      .sort((x, y) => (x.m.setName || "").localeCompare(y.m.setName || "") || String(x.m.localId).localeCompare(String(y.m.localId), undefined, { numeric: true }));
    const wants = myWants();
    body.innerHTML = `
      <section class="tool-card">
        <h2>${S.me ? "Ma liste d'échange" : "Créer ma liste d'échange"}</h2>
        <form id="tr-form" class="tr-form">
          <div class="sh-grid">
            <label>Pseudo d'échange<input name="pseudo" required pattern="[A-Za-z0-9_\\-]{3,20}" maxlength="20" placeholder="ex : Sacha_75" value="${esc(me.pseudo || "")}"></label>
            <label>Département (optionnel)<input name="dept" maxlength="3" pattern="([0-9]{2}|2A|2B|97[1-6])" placeholder="ex : 75" value="${esc(me.dept || "")}"></label>
          </div>
          <p class="muted small">Le pseudo est visible des autres membres : n'y mets ni ton vrai nom, ni ton âge, ni tes réseaux (3 à 20 lettres, chiffres, - ou _).</p>
          <label class="check"><input type="checkbox" name="active" ${me.active !== false ? "checked" : ""}> Ma liste est visible (décoche pour faire une pause)</label>

          <h3>🎁 Mes cartes à échanger <span class="muted small" id="tr-count">(${haves.size})</span></h3>
          ${owned.length ? `<p class="muted small">Coche tes doubles (les cartes que tu peux donner). Elles restent dans ta collection.</p>
            <input type="search" id="tr-q" placeholder="Filtrer (nom, extension, numéro)…">
            <div class="tr-pick" id="tr-pick">${owned.map((x) => `<label class="tr-opt" data-s="${esc(((x.m.name || "") + " " + (x.m.setName || "") + " " + (x.m.localId || "")).toLowerCase())}"><input type="checkbox" value="${esc(x.k)}" ${haves.has(x.k) ? "checked" : ""}> ${chip(x.k)}</label>`).join("")}</div>`
            : `<p class="muted">Ta collection est vide : ajoute d'abord tes cartes (ou <a class="accent-link" href="#/importer">importe ta collection</a>).</p>`}

          <h3>⭐ Les cartes que je cherche (${wants.length})</h3>
          <p class="muted small">C'est ta <a class="accent-link" href="#/wishlist">wishlist</a> qui est utilisée. Ajoute des cartes avec ☆ dans leur fiche, ou depuis <a class="accent-link" href="#/completer">Compléter mes sets</a>, puis reviens enregistrer ta liste.</p>
          <p class="form-msg" id="tr-msg" role="alert"></p>
          <div class="row"><button class="btn" type="submit">${S.me ? "Enregistrer ma liste" : "Publier ma liste"}</button>
          ${S.me ? `<button class="btn ghost danger" type="button" id="tr-del">Supprimer ma liste</button>` : ""}</div>
        </form>
      </section>`;
    const form = body.querySelector("#tr-form");
    const q = body.querySelector("#tr-q");
    if (q) q.addEventListener("input", () => { const v = q.value.trim().toLowerCase(); body.querySelectorAll(".tr-opt").forEach((o) => { o.hidden = v && !o.dataset.s.includes(v); }); });
    body.querySelectorAll(".tr-pick input").forEach((i) => i.addEventListener("change", () => { body.querySelector("#tr-count").textContent = `(${body.querySelectorAll(".tr-pick input:checked").length})`; }));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const msg = body.querySelector("#tr-msg");
      const pseudo = String(f.get("pseudo") || "").trim();
      const dept = String(f.get("dept") || "").trim().toUpperCase();
      if (!/^[A-Za-z0-9_-]{3,20}$/.test(pseudo)) { msg.textContent = "Pseudo : 3 à 20 lettres, chiffres, - ou _ (sans espace ni accent)."; msg.className = "form-msg err"; return; }
      if (dept && !/^([0-9]{2}|2A|2B|97[1-6])$/.test(dept)) { msg.textContent = "Département : 2 chiffres (ex : 75), 2A, 2B ou 971 à 976."; msg.className = "form-msg err"; return; }
      const hv = [...body.querySelectorAll(".tr-pick input:checked")].map((i) => i.value).filter((k) => KEY_RE.test(k));
      if (hv.length > 500) { msg.textContent = "500 cartes à échanger maximum."; msg.className = "form-msg err"; return; }
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const { error } = await auth().client.from("trade_lists").upsert({ user_id: auth().user.id, pseudo, dept: dept || null, haves: hv, wants: myWants(), active: !!f.get("active") }, { onConflict: "user_id" });
      btn.disabled = false;
      if (error) { msg.textContent = /pseudo|duplicate|unique/i.test(error.message || "") ? "Ce pseudo est déjà pris, choisis-en un autre." : "Impossible d'enregistrer. Réessaie dans un instant."; msg.className = "form-msg err"; return; }
      toast("Liste d'échange enregistrée ✓");
      location.hash = "#/echanges/matches";
      if (S.tab === "matches") MG.route();
    });
    const del = body.querySelector("#tr-del");
    if (del) del.addEventListener("click", async () => {
      if (!confirm("Supprimer ta liste d'échange ? Les autres membres ne la verront plus.")) return;
      const { error } = await auth().client.from("trade_lists").delete().eq("user_id", auth().user.id);
      if (!error) { toast("Liste supprimée"); S.me = null; MG.route(); }
    });
  }

  /* ---------------- Correspondances ---------------- */
  function renderMatches(body) {
    const { esc } = ui();
    if (!S.me) { body.innerHTML = `<div class="state"><p>Crée d'abord ta liste d'échange.</p><a class="btn" href="#/echanges/liste">Créer ma liste</a></div>`; return; }
    const wants = new Set(myWants());
    const haves = new Set(S.me.haves || []);
    const stale = [...wants].sort().join() !== [...(S.me.wants || [])].sort().join();
    const rows = S.lists.filter((l) => !S.blocks.has(l.user_id)).map((l) => {
      const get = (l.haves || []).filter((k) => wants.has(k));
      const give = (l.wants || []).filter((k) => haves.has(k));
      return { l, get, give };
    }).filter((r) => r.get.length)
      .sort((x, y) => (y.give.length > 0) - (x.give.length > 0) || (y.l.dept && y.l.dept === S.me.dept) - (x.l.dept && x.l.dept === S.me.dept) || y.get.length - x.get.length);
    body.innerHTML = `
      ${stale ? `<p class="tr-warn">Ta wishlist a changé depuis ta dernière publication : <a class="accent-link" href="#/echanges/liste">enregistre ta liste</a> pour que les autres membres le voient.</p>` : ""}
      ${!S.me.active ? `<p class="tr-warn">Ta liste est en pause : les autres membres ne la voient pas.</p>` : ""}
      ${!wants.size ? `<div class="state"><p>Ta wishlist est vide : ajoute les cartes que tu cherches (☆ dans leur fiche) pour trouver des échanges.</p></div>`
        : !rows.length ? `<div class="state"><p>Aucun membre n'a encore les cartes de ta wishlist. Reviens plus tard : de nouveaux membres publient leur liste chaque jour.</p></div>`
        : `<p class="muted small">${rows.length} membre${rows.length > 1 ? "s ont" : " a"} des cartes de ta wishlist. En premier : ceux qui cherchent aussi tes cartes.</p>
      <div class="tr-matches">${rows.map((r) => `
        <article class="tool-card tr-match" data-uid="${esc(r.l.user_id)}">
          <div class="section-head"><h3>👤 ${esc(r.l.pseudo)} ${r.l.dept ? `<span class="ag-kind">📍 ${esc(r.l.dept)}</span>` : ""} ${r.give.length ? `<span class="ag-kind tr-perfect">🤝 Échange possible</span>` : ""}</h3>
            <div class="row"><button class="btn tr-propose">Proposer un échange</button><button class="link-btn small tr-more" aria-label="Plus d'options">Bloquer / signaler</button></div></div>
          <p class="small"><b>A ${r.get.length} carte${r.get.length > 1 ? "s" : ""} de ta wishlist :</b></p>
          <div class="tr-chips">${r.get.slice(0, 12).map(chip).join("")}${r.get.length > 12 ? `<span class="muted small">+ ${r.get.length - 12}</span>` : ""}</div>
          ${r.give.length ? `<p class="small"><b>Cherche ${r.give.length} de tes cartes à échanger :</b></p><div class="tr-chips">${r.give.slice(0, 12).map(chip).join("")}</div>` : `<p class="muted small">Ne cherche aucune de tes cartes pour l'instant : propose-lui quand même un échange, il ou elle verra tes cartes.</p>`}
        </article>`).join("")}</div>`}`;
    resolve(rows.flatMap((r) => r.get.slice(0, 12)), body);
    body.querySelectorAll(".tr-match").forEach((el) => {
      const l = S.lists.find((x) => x.user_id === el.dataset.uid);
      el.querySelector(".tr-propose").addEventListener("click", () => openPropose(l));
      el.querySelector(".tr-more").addEventListener("click", () => openReport(l.user_id, null));
    });
  }

  /* ---------------- Proposer un échange ---------------- */
  async function loadPlaces() {
    if (S.places) return S.places;
    const c = auth().client;
    const [shops, events] = await Promise.all([
      c.from("shops").select("id,name,address").eq("status", "approved").limit(2000),
      c.from("events").select("id,title,city,start_date,end_date,kind").eq("status", "approved").gte("start_date", addDays(-30)).limit(500),
    ]);
    const t = today(), max = addDays(90);
    S.places = {
      shops: (shops.data || []).map((s) => ({ id: s.id, name: s.name, address: s.address || "", cp: ((s.address || "").match(/\b(\d{5})\b/) || [])[1] || "" })),
      events: (events.data || []).filter((e) => (e.end_date || e.start_date) >= t && e.start_date <= max && ["convention", "tournoi"].includes(e.kind) && e.city)
        .sort((x, y) => (x.start_date < y.start_date ? -1 : 1)),
    };
    return S.places;
  }

  async function openPropose(l, parent) {
    const { $, esc, eur, fmtDate } = ui();
    const wants = new Set(myWants());
    const theirWants = new Set(l.wants || []);
    const mineAll = (S.me.haves || []);
    const giveFirst = mineAll.filter((k) => theirWants.has(k)), giveOther = mineAll.filter((k) => !theirWants.has(k));
    const getFirst = (l.haves || []).filter((k) => wants.has(k)), getOther = (l.haves || []).filter((k) => !wants.has(k));
    $("#modal-body").innerHTML = `<h2 id="modal-title">${parent ? "Contre-proposition" : "Proposer un échange"} à ${esc(l.pseudo)}</h2>${ui().loading("Chargement des lieux…")}`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    const places = await loadPlaces();
    const dept = S.me.dept || "";
    const shops = places.shops.slice().sort((x, y) => (y.cp.startsWith(dept) && !!dept) - (x.cp.startsWith(dept) && !!dept) || x.name.localeCompare(y.name));
    const box = (k, checked, name) => `<label class="tr-opt"><input type="checkbox" name="${name}" value="${esc(k)}" ${checked ? "checked" : ""}> ${chip(k)}</label>`;
    const pre = parent ? { give: new Set(parent.get), get: new Set(parent.give) } : { give: new Set(giveFirst.slice(0, 3)), get: new Set(getFirst.slice(0, 3)) };
    const col = (first, other, name, set, emptyMsg) => (first.length || other.length) ? `
      <div class="tr-pick small-pick">${first.map((k) => box(k, set.has(k), name)).join("")}</div>
      ${other.length ? `<details><summary class="small">Autres cartes (${other.length})</summary><div class="tr-pick small-pick">${other.map((k) => box(k, set.has(k), name)).join("")}</div></details>` : ""}` : `<p class="muted small">${emptyMsg}</p>`;
    $("#modal-body").innerHTML = `
      <h2 id="modal-title">${parent ? "Contre-proposition" : "Proposer un échange"} à ${esc(l.pseudo)}</h2>
      <form id="f-tr" class="form">
        <div class="tr-two">
          <div><h3>🎁 Tu donnes</h3>${col(giveFirst, giveOther, "give", pre.give, "Ta liste à échanger est vide.")}</div>
          <div><h3>⭐ Tu reçois</h3>${col(getFirst, getOther, "get", pre.get, "Sa liste à échanger est vide.")}</div>
        </div>
        <p class="tr-balance" id="tr-bal"></p>
        <label>Lieu public du rendez-vous<select name="place" required>
          <option value="">— choisir —</option>
          ${places.events.length ? `<optgroup label="Événements à venir">${places.events.map((e) => `<option value="evenement:${esc(e.id)}" data-date="${esc(e.start_date)}">${esc(fmtDate(e.start_date))} · ${esc(e.title)}${e.city ? " (" + esc(e.city) + ")" : ""}</option>`).join("")}</optgroup>` : ""}
          ${shops.length ? `<optgroup label="Boutiques">${shops.map((s) => `<option value="boutique:${esc(s.id)}">${esc(s.name)} — ${esc(s.address)}</option>`).join("")}</optgroup>` : ""}
        </select></label>
        <p class="muted small">Ta boutique n'est pas dans la liste ? Propose-la depuis la page <a class="accent-link" href="#/boutiques" data-close>Boutiques</a> : elle apparaîtra ici une fois validée.</p>
        <div class="row">
          <label class="grow">Date<input type="date" name="date" required min="${today()}" max="${addDays(90)}" value="${parent ? esc(parent.meet_date) : ""}"></label>
          <label class="grow">Moment<select name="slot">${Object.entries(SLOTS).map(([k, v]) => `<option value="${k}" ${parent && parent.slot === k ? "selected" : k === "apres-midi" ? "selected" : ""}>${v.replace(/^l[e']\s?/, "").replace(/^./, (c) => c.toUpperCase())}</option>`).join("")}</select></label>
        </div>
        <p class="muted small">🛡️ Pas de messagerie : ${esc(l.pseudo)} pourra accepter, refuser ou faire une contre-proposition. Retrouvez-vous dans le lieu choisi, aux heures d'ouverture.</p>
        <p class="form-msg" id="tr-msg2" role="alert"></p>
        <button class="btn full" type="submit">Envoyer la proposition</button>
      </form>`;
    const form = $("#f-tr");
    const bal = () => {
      const g = [...form.querySelectorAll("[name=give]:checked")].map((i) => i.value);
      const r = [...form.querySelectorAll("[name=get]:checked")].map((i) => i.value);
      const pg = priceSum(g), pr = priceSum(r);
      $("#tr-bal").innerHTML = `Tu donnes <b>${g.length}</b> carte${g.length > 1 ? "s" : ""}${pg ? ` (≈ ${eur(pg)})` : ""}, tu reçois <b>${r.length}</b> carte${r.length > 1 ? "s" : ""}${pr ? ` (≈ ${eur(pr)})` : ""}.${pg && pr && Math.abs(pg - pr) / Math.max(pg, pr) > 0.3 ? ` <span class="muted">Écart de valeur important : à vous de voir si ça vous convient à tous les deux.</span>` : ""}`;
    };
    form.addEventListener("change", (e) => {
      if (e.target.name === "place") { const o = e.target.selectedOptions[0]; if (o && o.dataset.date && o.dataset.date >= today()) form.date.value = o.dataset.date; }
      bal();
    });
    bal();
    resolve([...getFirst, ...getOther, ...giveFirst, ...giveOther], $("#modal-body")).then(bal);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("#tr-msg2");
      const give = [...form.querySelectorAll("[name=give]:checked")].map((i) => i.value);
      const get = [...form.querySelectorAll("[name=get]:checked")].map((i) => i.value);
      const [kind, pid] = String(form.place.value).split(":");
      const err = (t) => { msg.textContent = t; msg.className = "form-msg err"; };
      if (!give.length || !get.length) return err("Choisis au moins une carte à donner et une carte à recevoir.");
      if (give.length > 20 || get.length > 20) return err("20 cartes maximum de chaque côté.");
      if (!pid) return err("Choisis un lieu public.");
      if (!form.date.value || form.date.value < today() || form.date.value > addDays(90)) return err("Choisis une date dans les 3 prochains mois.");
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const place = kind === "boutique" ? places.shops.find((s) => s.id === pid) : places.events.find((x) => x.id === pid);
      const { error } = await auth().client.from("trade_offers").insert({
        from_user: auth().user.id, to_user: l.user_id, give, get, place_kind: kind === "boutique" ? "boutique" : "evenement", place_id: pid,
        place_name: place ? (place.name ? place.name + " — " + place.address : place.title + (place.city ? " — " + place.city : "")) : null,
        meet_date: form.date.value, slot: form.slot.value, parent: parent ? parent.id : null, status: "pending",
      });
      btn.disabled = false;
      if (error) return err(/[àéèêç]/.test(error.message || "") ? error.message : "Impossible d'envoyer la proposition. Réessaie dans un instant.");
      if (parent) await auth().client.from("trade_offers").update({ status: "countered" }).eq("id", parent.id);
      $("#modal-body").innerHTML = `<div class="state"><p>✅ Proposition envoyée à ${esc(l.pseudo)} !</p><p class="muted small">Tu verras sa réponse dans « Mes propositions ».</p></div>`;
      S.tab = "offres";
      setTimeout(() => { if (location.hash === "#/echanges/offres") MG.route(); else location.hash = "#/echanges/offres"; }, 900);
    });
  }

  /* ---------------- Mes propositions ---------------- */
  function renderOffers(body) {
    const { esc, fmtDate, toast } = ui();
    const uid = auth().user.id;
    const done = new Set(applied());
    const groups = {
      recues: S.offers.filter((o) => o.to_user === uid && o.status === "pending"),
      acceptees: S.offers.filter((o) => o.status === "accepted"),
      envoyees: S.offers.filter((o) => o.from_user === uid && o.status === "pending"),
      autres: S.offers.filter((o) => !["pending", "accepted"].includes(o.status)),
    };
    const LABEL = { declined: "Refusée", cancelled: "Annulée", countered: "Contre-proposition envoyée" };
    const card = (o, actions) => {
      const mine = o.from_user === uid;
      const other = mine ? o.to_user : o.from_user;
      const give = mine ? o.give : o.get, get = mine ? o.get : o.give;
      return `<article class="tool-card tr-offer" data-id="${esc(o.id)}">
        <div class="nw-meta"><span class="ag-kind">${mine ? "Envoyée à" : "Reçue de"} ${esc(pseudoOf(other))}</span><span class="muted small">${esc(new Date(o.created_at).toLocaleDateString("fr-FR"))}</span>${LABEL[o.status] ? `<span class="ag-kind">${LABEL[o.status]}</span>` : ""}</div>
        <div class="tr-two">
          <div><p class="small"><b>🎁 Tu donnes</b></p><div class="tr-chips">${(give || []).map(chip).join("")}</div></div>
          <div><p class="small"><b>⭐ Tu reçois</b></p><div class="tr-chips">${(get || []).map(chip).join("")}</div></div>
        </div>
        <p class="tr-place">📍 <b>${esc(o.place_name || "Lieu public")}</b><br>📅 ${esc(fmtDate(o.meet_date))}, ${esc(SLOTS[o.slot] || o.slot)}</p>
        <div class="row tr-actions">${actions}<button class="link-btn small" data-act="report">Signaler</button></div>
      </article>`;
    };
    body.innerHTML = `
      <section><h2>📥 Reçues (${groups.recues.length})</h2>${groups.recues.length ? groups.recues.map((o) => card(o, `<button class="btn" data-act="accepted">Accepter</button><button class="btn ghost" data-act="counter">Contre-proposer</button><button class="btn ghost" data-act="declined">Refuser</button>`)).join("") : `<p class="muted">Aucune proposition en attente.</p>`}</section>
      <section><h2>✅ Rendez-vous acceptés (${groups.acceptees.length})</h2>${groups.acceptees.length ? `<p class="muted small">Le jour J : vérifie les cartes avant d'échanger, reste dans le lieu choisi, et si tu es mineur viens avec un adulte.</p>` + groups.acceptees.map((o) => card(o, `${done.has(o.id) ? `<span class="muted small">✓ Collection mise à jour</span>` : `<button class="btn" data-act="done">Échange fait : mettre à jour ma collection</button>`}<button class="btn ghost" data-act="cancelled">Annuler le rendez-vous</button>`)).join("") : `<p class="muted">Aucun rendez-vous pour l'instant.</p>`}</section>
      <section><h2>📤 Envoyées (${groups.envoyees.length})</h2>${groups.envoyees.length ? groups.envoyees.map((o) => card(o, `<button class="btn ghost" data-act="cancelled">Annuler</button>`)).join("") : `<p class="muted">Aucune proposition en attente. Va dans <a class="accent-link" href="#/echanges/matches">Correspondances</a> pour en faire une.</p>`}</section>
      ${groups.autres.length ? `<details class="tr-hist"><summary>Historique (${groups.autres.length})</summary>${groups.autres.slice(0, 50).map((o) => card(o, "")).join("")}</details>` : ""}`;
    resolve(S.offers.flatMap((o) => [...(o.give || []), ...(o.get || [])]), body);
    body.querySelectorAll(".tr-offer [data-act]").forEach((b) => b.addEventListener("click", async () => {
      const o = S.offers.find((x) => x.id === b.closest(".tr-offer").dataset.id);
      const act = b.dataset.act;
      const other = o.from_user === uid ? o.to_user : o.from_user;
      if (act === "report") return openReport(other, o.id);
      if (act === "counter") {
        const l = S.lists.find((x) => x.user_id === o.from_user);
        if (!l) return toast("Ce membre n'échange plus pour le moment");
        return openPropose(l, o);
      }
      if (act === "done") return applyTrade(o);
      if (act === "cancelled" && !confirm("Annuler ce rendez-vous ?")) return;
      if (act === "declined" && !confirm("Refuser cette proposition ?")) return;
      b.disabled = true;
      const { error } = await auth().client.from("trade_offers").update({ status: act }).eq("id", o.id);
      if (error) { b.disabled = false; return toast("Action impossible"); }
      o.status = act;
      toast(act === "accepted" ? "Rendez-vous accepté ✓" : act === "declined" ? "Proposition refusée" : "Annulé");
      renderOffers(body);
    }));
  }

  // Après l'échange : ajoute les cartes reçues, les retire de la wishlist et de la liste « à échanger »
  async function applyTrade(o) {
    const { toast } = ui();
    const uid = auth().user.id;
    const mine = o.from_user === uid;
    const give = mine ? o.give : o.get, get = mine ? o.get : o.give;
    if (!confirm(`Ajouter les ${get.length} carte${get.length > 1 ? "s" : ""} reçue${get.length > 1 ? "s" : ""} à ta collection ? (Les cartes données étaient des doubles : elles restent dans ta collection, mais sortent de ta liste à échanger.)`)) return;
    await resolve(get);
    for (const k of get) {
      const [lang, id] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
      let card;
      try { card = await MG.api.card(lang, id); } catch (e) { card = null; }
      if (!card) continue;
      if (!MG.store.isOwned(lang, id)) MG.store.toggleQuick(lang, card);
      if (MG.store.isWish(lang, id)) MG.store.toggleList("wish", lang, card);
    }
    const hv = (S.me.haves || []).filter((k) => !give.includes(k));
    await auth().client.from("trade_lists").update({ haves: hv, wants: myWants() }).eq("user_id", uid);
    S.me.haves = hv;
    markApplied(o.id);
    toast("Collection mise à jour ✓");
    renderOffers(document.getElementById("tr-body"));
  }

  /* ---------------- Bloquer / signaler ---------------- */
  function openReport(otherId, offerId) {
    const { $, esc, toast } = ui();
    const p = pseudoOf(otherId);
    $("#modal-body").innerHTML = `
      <h2 id="modal-title">Bloquer ou signaler ${esc(p)}</h2>
      <p class="muted small">Un membre bloqué ne pourra plus te faire de proposition, et tu ne verras plus sa liste. Le signalement est envoyé à l'administrateur (anonymement pour l'autre membre).</p>
      <form id="f-rep" class="form">
        <label>Raison du signalement<select name="reason"><option value="">— ne pas signaler, seulement bloquer —</option>${REASONS.map((r) => `<option>${r}</option>`).join("")}</select></label>
        <label class="check"><input type="checkbox" name="block" checked> Bloquer ${esc(p)}</label>
        <p class="muted small">⚠️ Si quelqu'un te met mal à l'aise, te demande des photos, ton adresse ou de lui parler ailleurs : bloque-le, signale-le et parles-en à un adulte de confiance.</p>
        <button class="btn full" type="submit">Valider</button>
      </form>`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    $("#f-rep").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const c = auth().client;
      if (f.get("reason")) await c.from("trade_reports").insert({ reporter: auth().user.id, reported: otherId, reason: f.get("reason"), offer_id: offerId || null });
      if (f.get("block")) { await c.from("trade_blocks").insert({ blocker: auth().user.id, blocked: otherId }); S.blocks.add(otherId); }
      $("#modal-body").innerHTML = `<div class="state"><p>✅ C'est noté.${f.get("block") ? ` ${esc(p)} est bloqué.` : ""}</p></div>`;
      toast("Merci");
      if (location.hash.startsWith("#/echanges")) setTimeout(() => MG.route(), 800);
    });
  }

  /* ---------------- Espace admin ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc } = ui();
    const c = auth().client;
    const { data, error } = await c.from("trade_reports").select("id,reported,reason,offer_id,created_at,handled").eq("handled", false).order("created_at").limit(100);
    if (error) throw error;
    const ids = [...new Set(data.map((r) => r.reported))];
    const lists = {};
    if (ids.length) { const { data: ls } = await c.from("trade_lists").select("user_id,pseudo,blocked").in("user_id", ids); (ls || []).forEach((l) => { lists[l.user_id] = l; }); }
    el.innerHTML = `<section><h2>🔄 Signalements d'échanges (${data.length})</h2>
      ${data.length ? `<div class="mod-list">${data.map((r) => { const l = lists[r.reported] || {}; return `<div class="mod-item" data-id="${esc(r.id)}" data-uid="${esc(r.reported)}">
        <div><b>${esc(l.pseudo || "Membre sans liste")}</b>${l.blocked ? ' <span class="ag-kind">bloqué</span>' : ""} · ${esc(r.reason)}<br><span class="small muted">${esc(new Date(r.created_at).toLocaleString("fr-FR"))}${r.offer_id ? " · à propos d'une proposition" : ""}</span></div>
        <div class="row"><button class="btn" data-act="block">Bloquer sa liste</button><button class="btn ghost" data-act="ok">Ignorer</button></div></div>`; }).join("")}</div>`
      : `<p class="muted">Aucun signalement.</p>`}</section>`;
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
      const it = b.closest(".mod-item");
      if (b.dataset.act === "block") await c.from("trade_lists").update({ blocked: true }).eq("user_id", it.dataset.uid);
      const { error: err } = await c.from("trade_reports").update({ handled: true }).eq("id", it.dataset.id);
      ui().toast(err ? "Erreur" : b.dataset.act === "block" ? "Liste bloquée ✓" : "Signalement classé");
      if (!err) it.remove();
    }));
  });
})(window.MG);
