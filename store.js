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
    return { version: 1, lang: "fr", owned: {}, fav: {}, wish: {}, meta: {} };
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
  };
})(window.MG);
