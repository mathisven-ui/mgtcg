/* ==========================================================
   MGTCG — store.js
   La collection, les favoris et la wishlist.
   Étape 1 : tout est enregistré dans le navigateur (localStorage).
   Étape 2 : on branchera les comptes (email + mot de passe).
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const KEY = "mgtcg:data:v1";
  const VARIANTS = ["normal", "reverse", "holo", "firstEdition"];
  MG.VARIANTS = VARIANTS;
  MG.VARIANT_LABELS = {
    normal: "Normale",
    reverse: "Reverse",
    holo: "Holo",
    firstEdition: "1ère édition",
  };

  function empty() {
    return { version: 1, lang: "fr", owned: {}, fav: {}, wish: {}, meta: {}, paid: {}, alerts: {}, history: {}, lastRefresh: 0, sealed: {}, sales: [], goals: [], passport: {} };
  }

  const PP = {
    cond: ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"],
    defects: ["coins", "bords", "surface", "centrage", "pli", "tache", "dos", "impression"],
    grader: ["", "PSA", "PCA", "CCC", "CGC", "Beckett", "Autre"],
    source: ["", "Booster ouvert", "Boutique", "Cardmarket", "eBay", "Vinted", "Leboncoin", "Échange", "Cadeau", "Autre"],
    storage: ["", "Classeur", "Toploader", "Sleeve", "Boîte", "Présentoir", "Autre"],
  };
  MG.PASSPORT = PP;
  function cleanPassport(v) {
    if (!v || typeof v !== "object") return null;
    const s = (x, n) => (typeof x === "string" ? x.slice(0, n) : "");
    const pick = (x, list) => (list.includes(x) ? x : "");
    const out = {
      cond: pick(v.cond, PP.cond), defects: Array.isArray(v.defects) ? [...new Set(v.defects.filter((d) => PP.defects.includes(d)))] : [],
      grader: pick(v.grader, PP.grader), grade: /^(10|[1-9](\.5)?)$/.test(String(v.grade || "")) ? String(v.grade) : "",
      cert: /^[A-Za-z0-9-]{1,20}$/.test(String(v.cert || "")) ? String(v.cert) : "",
      source: pick(v.source, PP.source), storage: pick(v.storage, PP.storage), place: s(v.place, 80), note: s(v.note, 500),
      photos: Array.isArray(v.photos) ? v.photos.filter((p) => typeof p === "string" && /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,120}\.jpg$/.test(p)).slice(0, 4) : [],
      updated: typeof v.updated === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.updated) ? v.updated.slice(0, 10) : "",
    };
    const empty = !out.cond && !out.defects.length && !out.grader && !out.cert && !out.source && !out.storage && !out.place && !out.note && !out.photos.length;
    return empty ? null : out;
  }

  let data = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      return sanitize(JSON.parse(raw));
    } catch (e) { return empty(); }
  }

  // Vérifie qu'un fichier importé a la bonne forme (sécurité)
  function sanitize(obj) {
    const out = empty();
    if (!obj || typeof obj !== "object") return out;
    if (typeof obj.lang === "string" && MG.LANGS.some((l) => l.code === obj.lang)) out.lang = obj.lang;
    const isKey = (k) => typeof k === "string" && k.length < 80 && /^[a-z-]+\|[\w.\-]+$/i.test(k);
    const str = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
    for (const [k, v] of Object.entries(obj.owned || {})) {
      if (!isKey(k) || !v || typeof v !== "object") continue;
      const flags = {};
      VARIANTS.forEach((n) => { if (v[n] === true) flags[n] = true; });
      if (Object.keys(flags).length) out.owned[k] = flags;
    }
    for (const list of ["fav", "wish"]) {
      for (const [k, v] of Object.entries(obj[list] || {})) {
        if (isKey(k) && v === true) out[list][k] = true;
      }
    }
    for (const [k, m] of Object.entries(obj.meta || {})) {
      if (!isKey(k) || !m || typeof m !== "object") continue;
      out.meta[k] = {
        name: str(m.name), image: str(m.image, 300), localId: str(String(m.localId ?? ""), 20),
        setId: str(m.setId, 40), setName: str(m.setName), setTotal: Number(m.setTotal) || 0,
        price: Number(m.price) || 0, priceHolo: Number(m.priceHolo) || 0,
        rarity: str(m.rarity, 60),
      };
    }
    const money = (v) => { const n = Number(v); return isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null; };
    const isDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
    // Prix d'achat
    for (const [k, v] of Object.entries(obj.paid || {})) {
      if (!isKey(k) || !v || typeof v !== "object" || money(v.price) == null) continue;
      out.paid[k] = { price: money(v.price), date: isDate(v.date) ? v.date : "" };
    }
    // Alertes de prix
    for (const [k, v] of Object.entries(obj.alerts || {})) {
      if (!isKey(k) || !v || typeof v !== "object" || !money(v.below)) continue;
      out.alerts[k] = { below: money(v.below) };
    }
    // Historique de valeur (1 point par jour, 3 ans max)
    const days = Object.keys(obj.history || {}).filter(isDate).sort().slice(-1100);
    for (const d of days) { const v = money(obj.history[d]); if (v != null) out.history[d] = v; }
    out.lastRefresh = Number(obj.lastRefresh) || 0;
    // Produits scellés possédés (clé = identifiant du produit)
    for (const [id, v] of Object.entries(obj.sealed || {})) {
      if (!/^[0-9a-f-]{36}$/i.test(id) || !v || typeof v !== "object") continue;
      const qty = Math.min(999, Math.max(0, parseInt(v.qty, 10) || 0));
      if (!qty) continue;
      out.sealed[id] = { qty, paid: money(v.paid), date: isDate(v.date) ? v.date : "", name: str(v.name, 120), type: str(v.type, 30) };
    }
    // Journal des ventes
    for (const v of Array.isArray(obj.sales) ? obj.sales.slice(-2000) : []) {
      if (!v || typeof v !== "object" || money(v.price) == null || !isDate(v.date)) continue;
      out.sales.push({
        id: str(v.id, 40) || Math.random().toString(36).slice(2, 12), name: str(v.name, 100), date: v.date, where: str(v.where, 30),
        price: money(v.price), fees: money(v.fees) || 0, ship: money(v.ship) || 0, cost: v.cost == null ? null : money(v.cost), key: str(v.key, 80),
      });
    }
    // Objectifs personnels
    for (const g of Array.isArray(obj.goals) ? obj.goals.slice(0, 30) : []) {
      if (!g || typeof g !== "object" || !["set", "cartes", "valeur"].includes(g.type)) continue;
      const target = Number(g.target);
      if (g.type !== "set" && !(isFinite(target) && target > 0 && target < 1e7)) continue;
      if (g.type === "set" && !(typeof g.setKey === "string" && /^[a-z-]+\|[\w.\-]+$/i.test(g.setKey))) continue;
      out.goals.push({ id: str(g.id, 40) || Math.random().toString(36).slice(2, 12), type: g.type, target: g.type === "set" ? 0 : Math.round(target),
        setKey: g.type === "set" ? g.setKey.slice(0, 60) : "", label: str(g.label, 80), deadline: isDate(g.deadline) ? g.deadline : "", created: isDate(g.created) ? g.created : "" });
    }
    // Passeports des cartes (état, défauts, certificat, photos…)
    for (const [k, v] of Object.entries(obj.passport || {}).slice(0, 5000)) {
      const pp = cleanPassport(v);
      if (isKey(k) && pp) out.passport[k] = pp;
    }
    return out;
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { alert("Impossible d'enregistrer : le stockage du navigateur est plein."); }
    MG.emit && MG.emit("store");
  }

  // Sauvegarde discrète (sans rafraîchir l'écran), regroupée toutes les 0,5 s
  let quietTimer = 0;
  function saveQuiet() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* plein */ }
    }, 500);
  }

  const k = (lang, id) => lang + "|" + id;

  MG.store = {
    get lang() { return data.lang; },
    setLang(l) { data.lang = l; save(); },

    key: k,
    owned: (lang, id) => data.owned[k(lang, id)] || null,
    isOwned: (lang, id) => !!data.owned[k(lang, id)],
    isFav: (lang, id) => !!data.fav[k(lang, id)],
    isWish: (lang, id) => !!data.wish[k(lang, id)],
    meta: (key) => data.meta[key],

    // Retient les infos utiles d'une carte (pour afficher la collection sans tout recharger)
    remember(lang, card, extra = {}) {
      if (!card || !card.id) return;
      const key = k(lang, card.id);
      const prev = data.meta[key] || {};
      const cm = card.cardmarket || null;
      data.meta[key] = Object.assign({}, prev, {
        name: card.name || prev.name || "",
        image: card.image || prev.image || "",
        localId: String(card.localId ?? prev.localId ?? ""),
        setId: (card.set && card.set.id) || extra.setId || prev.setId || card.id.split("-").slice(0, -1).join("-"),
        setName: (card.set && card.set.name) || extra.setName || prev.setName || "",
        setTotal: (card.set && card.set.cardCount && card.set.cardCount.official) || extra.setTotal || prev.setTotal || 0,
        rarity: card.rarity || prev.rarity || "",
        price: cm ? (cm.trend ?? cm.avg ?? 0) : prev.price || 0,
        priceHolo: cm ? (cm["trend-holo"] ?? cm["avg-holo"] ?? 0) : prev.priceHolo || 0,
      });
      saveQuiet();
    },

    // Coche / décoche une version précise (normale, reverse, holo…)
    setVariant(lang, card, variant, value) {
      const key = k(lang, card.id);
      const cur = Object.assign({}, data.owned[key] || {});
      if (value) cur[variant] = true; else delete cur[variant];
      if (Object.keys(cur).length) data.owned[key] = cur; else delete data.owned[key];
      this.remember(lang, card);
      save();
    },

    // Clic rapide sur la case d'une carte dans la grille
    toggleQuick(lang, card) {
      const key = k(lang, card.id);
      if (data.owned[key]) { delete data.owned[key]; }
      else {
        const v = card.variants || {};
        const first = VARIANTS.find((n) => v[n]) || "normal";
        data.owned[key] = { [first]: true };
      }
      this.remember(lang, card);
      save();
    },

    toggleList(list, lang, card) {
      const key = k(lang, card.id);
      if (data[list][key]) delete data[list][key];
      else { data[list][key] = true; this.remember(lang, card); }
      save();
    },

    ownedKeys: () => Object.keys(data.owned),
    listKeys: (list) => Object.keys(data[list]),

    // Valeur estimée d'une carte possédée (toutes versions cochées)
    valueOf(key) {
      const m = data.meta[key]; const o = data.owned[key];
      if (!m || !o) return 0;
      let total = 0;
      for (const v of Object.keys(o)) {
        const p = v === "normal" ? (m.price || m.priceHolo) : (m.priceHolo || m.price);
        total += p || 0;
      }
      return total;
    },

    exportJSON() {
      return JSON.stringify(Object.assign({ app: "MGTCG", exportedAt: new Date().toISOString() }, data), null, 2);
    },
    importJSON(text) {
      const parsed = JSON.parse(text); // lève une erreur si le fichier est invalide
      data = sanitize(parsed);
      save();
    },
    reset() { data = Object.assign(empty(), { lang: data.lang }); save(); },

    // Import depuis une autre appli : ajoute (sans rien supprimer) des cartes en une fois
    // entries = [{ lang, card, variants: ["normal", …], paid: { price, date } | null }]
    bulkImport(entries) {
      let added = 0;
      for (const e of entries) {
        if (!e || !e.card || !e.card.id || !MG.LANGS.some((l) => l.code === e.lang)) continue;
        const key = k(e.lang, e.card.id);
        const cur = Object.assign({}, data.owned[key] || {});
        if (!data.owned[key]) added++;
        (e.variants || []).forEach((v) => { if (VARIANTS.includes(v)) cur[v] = true; });
        if (!Object.keys(cur).length) cur.normal = true;
        data.owned[key] = cur;
        if (e.paid && isFinite(e.paid.price) && e.paid.price >= 0 && e.paid.price < 1e7 && !data.paid[key]) {
          data.paid[key] = { price: Math.round(e.paid.price * 100) / 100, date: /^\d{4}-\d{2}-\d{2}$/.test(e.paid.date || "") ? e.paid.date : "" };
        }
        this.remember(e.lang, e.card);
      }
      save();
      return added;
    },

    /* ---- Prix d'achat, alertes, historique ---- */
    paid: (key) => data.paid[key] || null,
    paidKeys: () => Object.keys(data.paid),
    setPaid(lang, card, price, date) {
      const key = k(lang, card.id);
      if (price == null || price === "" || isNaN(price)) delete data.paid[key];
      else data.paid[key] = { price: Math.round(Number(price) * 100) / 100, date: date || "" };
      this.remember(lang, card);
      save();
    },
    alert: (key) => data.alerts[key] || null,
    alertKeys: () => Object.keys(data.alerts),
    setAlert(lang, card, below) {
      const key = k(lang, card.id);
      if (!below || isNaN(below) || below <= 0) delete data.alerts[key];
      else data.alerts[key] = { below: Math.round(Number(below) * 100) / 100 };
      this.remember(lang, card);
      save();
    },
    // Prix actuel d'une carte (tendance Cardmarket)
    priceOf(key) { const m = data.meta[key]; return m ? (m.price || m.priceHolo || 0) : 0; },
    // Alertes déclenchées : la cote est passée sous le prix voulu
    triggeredAlerts() {
      return Object.entries(data.alerts)
        .map(([key, a]) => ({ key, below: a.below, now: this.priceOf(key), meta: data.meta[key] || {} }))
        .filter((x) => x.now > 0 && x.now <= x.below);
    },
    totalValue() { return Object.keys(data.owned).reduce((s, key) => s + this.valueOf(key), 0); },
    // Enregistre la valeur du jour (un point par jour)
    recordHistory() {
      if (!Object.keys(data.owned).length) return;
      const d = new Date();
      const day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      const v = Math.round(this.totalValue() * 100) / 100;
      if (data.history[day] === v) return;
      data.history[day] = v;
      const days = Object.keys(data.history).sort();
      while (days.length > 1100) delete data.history[days.shift()];
      save();
    },
    /* ---- Produits scellés ---- */
    sealed: (id) => data.sealed[id] || null,
    sealedList: () => Object.entries(data.sealed).map(([id, v]) => Object.assign({ id }, v)),
    setSealed(product, qty, paid, date) {
      if (!product || !/^[0-9a-f-]{36}$/i.test(product.id)) return;
      qty = Math.min(999, Math.max(0, parseInt(qty, 10) || 0));
      if (!qty) delete data.sealed[product.id];
      else data.sealed[product.id] = {
        qty, paid: paid == null || paid === "" || isNaN(paid) ? null : Math.round(Number(paid) * 100) / 100,
        date: date || "", name: String(product.name || "").slice(0, 120), type: String(product.type || "").slice(0, 30),
      };
      save();
    },
    sales: () => data.sales.slice(),
    addSale(v) {
      const clean = sanitize({ sales: [Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) }, v)] }).sales[0];
      if (clean) { data.sales.push(clean); save(); }
    },
    passport: (key) => data.passport[key] || null,
    passportKeys: () => Object.keys(data.passport),
    setPassport(key, v) {
      const pp = cleanPassport(Object.assign({}, v, { updated: new Date().toISOString().slice(0, 10) }));
      if (pp) data.passport[key] = pp; else delete data.passport[key];
      save();
      return pp;
    },
    goals: () => data.goals.slice(),
    addGoal(g) { if (data.goals.length >= 30) return false; const t = sanitize({ goals: [g] }).goals[0]; if (!t) return false; data.goals.push(t); save(); return true; },
    removeGoal(id) { data.goals = data.goals.filter((x) => x.id !== id); save(); },
    removeSale(id) { data.sales = data.sales.filter((x) => x.id !== id); save(); },
    history: () => Object.entries(data.history).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    get lastRefresh() { return data.lastRefresh || 0; },
    markRefreshed() { data.lastRefresh = Date.now(); save(); },

    /* ---- Pour la synchronisation avec le compte (auth.js) ---- */
    // Copie propre des données à envoyer en ligne
    snapshot() { return JSON.parse(JSON.stringify(data)); },
    // Fusionne une collection en ligne avec celle du navigateur :
    // on garde tout ce qui est coché d'un côté OU de l'autre
    mergeFrom(remote) {
      const r = sanitize(remote);
      for (const [key, flags] of Object.entries(r.owned)) {
        data.owned[key] = Object.assign({}, data.owned[key] || {}, flags);
      }
      for (const list of ["fav", "wish"]) Object.assign(data[list], r[list]);
      for (const [key, m] of Object.entries(r.meta)) {
        data.meta[key] = Object.assign({}, m, data.meta[key] || {});
      }
      for (const [key, v] of Object.entries(r.paid)) if (!data.paid[key]) data.paid[key] = v;
      for (const [key, v] of Object.entries(r.alerts)) if (!data.alerts[key]) data.alerts[key] = v;
      for (const [day, v] of Object.entries(r.history)) if (data.history[day] == null) data.history[day] = v;
      data.lastRefresh = Math.max(data.lastRefresh || 0, r.lastRefresh || 0);
      for (const [id, v] of Object.entries(r.sealed)) if (!data.sealed[id]) data.sealed[id] = v;
      const known = new Set(data.sales.map((x) => x.id));
      for (const v of r.sales) if (!known.has(v.id)) data.sales.push(v);
      for (const [k, v] of Object.entries(r.passport)) if (!data.passport[k]) data.passport[k] = v;
      const knownGoals = new Set(data.goals.map((x) => x.id));
      for (const g of r.goals) if (!knownGoals.has(g.id) && data.goals.length < 30) data.goals.push(g);
      save();
    },
    // Vide la collection du navigateur à la déconnexion (ordinateur partagé)
    clearLocal() { data = Object.assign(empty(), { lang: data.lang }); save(); },
    get isEmpty() { return !Object.keys(data.sealed).length && !Object.keys(data.owned).length && !Object.keys(data.fav).length && !Object.keys(data.wish).length; },
  };
})(window.MG);
