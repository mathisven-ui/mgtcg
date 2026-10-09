/* ==========================================================
   MGTCG — api.js
   Tout ce qui parle à la base de données TCGdex (gratuite,
   sans clé). Doc : https://tcgdex.dev
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const BASE = "https://api.tcgdex.net/v2";
  const ASSETS = "https://assets.tcgdex.net/";

  // Langues des cartes proposées dans le menu
  MG.LANGS = [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "Anglais", flag: "🇬🇧" },
    { code: "ja", label: "Japonais", flag: "🇯🇵" },
    { code: "zh-tw", label: "Chinois traditionnel", flag: "🇹🇼" },
    { code: "zh-cn", label: "Chinois simplifié", flag: "🇨🇳" },
    { code: "ko", label: "Coréen", flag: "🇰🇷" },
    { code: "th", label: "Thaï", flag: "🇹🇭" },
    { code: "id", label: "Indonésien", flag: "🇮🇩" },
    { code: "de", label: "Allemand", flag: "🇩🇪" },
    { code: "es", label: "Espagnol", flag: "🇪🇸" },
    { code: "it", label: "Italien", flag: "🇮🇹" },
    { code: "pt-br", label: "Portugais (Brésil)", flag: "🇧🇷" },
  ];

  const memory = new Map(); // cache en mémoire (le temps de la visite)
  const CACHE_PREFIX = "mgtcg:cache:";
  const CACHE_TTL = 1000 * 60 * 60 * 12; // 12 h : les prix Cardmarket changent 1x/jour

  function readCache(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const item = JSON.parse(raw);
      if (Date.now() - item.t > CACHE_TTL) return null;
      return item.v;
    } catch (e) { return null; }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) {
      // Stockage plein : on vide le cache (jamais la collection !)
      clearCache();
    }
  }

  function clearCache() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(CACHE_PREFIX))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* rien */ }
  }
  MG.clearCache = clearCache;

  async function get(path, { persist = false } = {}) {
    if (memory.has(path)) return memory.get(path);
    if (persist) {
      const cached = readCache(path);
      if (cached) { memory.set(path, cached); return cached; }
    }
    const res = await fetch(BASE + path, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const err = new Error("Erreur " + res.status);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    memory.set(path, data);
    if (persist) writeCache(path, data);
    return data;
  }

  const enc = encodeURIComponent;

  /* ---------- Sécurité : on n'accepte que les images TCGdex ---------- */
  function safeAsset(url) {
    return typeof url === "string" && url.startsWith(ASSETS) ? url : "";
  }
  MG.cardImg = (url, quality = "low") => (safeAsset(url) ? url + "/" + quality + ".webp" : "");
  MG.logoImg = (url) => (safeAsset(url) ? url + ".png" : "");

  /* ---------- Appels ---------- */
  MG.api = {
    series: (lang) => get(`/${lang}/series`, { persist: true }),
    serie: (lang, id) => get(`/${lang}/series/${enc(id)}`, { persist: true }),
    set: (lang, id) => get(`/${lang}/sets/${enc(id)}`, { persist: true }),
    search: (lang, q, page = 1) =>
      get(`/${lang}/cards?name=${enc(q)}&pagination:page=${page}&pagination:itemsPerPage=60`),
    card: async (lang, id) => {
      const key = `/${lang}/cards/${id}`;
      if (memory.has(key)) return memory.get(key);
      const cached = readCache(key);
      if (cached) { memory.set(key, cached); return cached; }
      const full = await get(key);
      // On garde en cache une version compacte (le stockage du navigateur est limité)
      const slim = slimCard(full);
      memory.set(key, slim);
      writeCache(key, slim);
      return slim;
    },
  };

  function slimCard(c) {
    const cm = (c.pricing && c.pricing.cardmarket) || null;
    const tp = (c.pricing && c.pricing.tcgplayer) || null;
    let tpMarket = null;
    if (tp) {
      for (const k of Object.keys(tp)) {
        if (tp[k] && typeof tp[k] === "object" && tp[k].marketPrice) { tpMarket = tp[k].marketPrice; break; }
      }
    }
    return {
      id: c.id,
      localId: c.localId,
      name: c.name,
      image: c.image,
      category: c.category,
      illustrator: c.illustrator,
      rarity: c.rarity,
      hp: c.hp,
      types: c.types,
      stage: c.stage,
      set: c.set ? { id: c.set.id, name: c.set.name, cardCount: c.set.cardCount } : null,
      variants: c.variants || {},
      cardmarket: cm,
      tcgplayerMarket: tpMarket,
    };
  }

  /* ---------- File d'attente : charge les détails des cartes
     d'un set sans surcharger l'API (6 requêtes à la fois) ---------- */
  MG.loadQueue = function (ids, lang, onEach, concurrency = 6) {
    let i = 0, cancelled = false;
    async function worker() {
      while (!cancelled && i < ids.length) {
        const id = ids[i++];
        try {
          const card = await MG.api.card(lang, id);
          if (!cancelled) onEach(card);
        } catch (e) { if (!cancelled) onEach(null, id); }
      }
    }
    for (let w = 0; w < concurrency; w++) worker();
    return () => { cancelled = true; };
  };
})(window.MG);
