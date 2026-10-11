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

  // Texte « sûr » (mêmes règles que la base) : pas de lien, d'e-mail, de téléphone ni de réseau social
  const CONTACT_RE = /(@|https?:\/\/|www\.|(\+33|\b0)[1-9]([ .-]?\d{2}){4}|\d{6,}|\b(snap|snapchat|insta|instagram|whatsapp|discord|telegram|tiktok|facebook|messenger|wechat|onlyfans|twitch)\b)/i;
  MG.texteSur = (t) => !CONTACT_RE.test(String(t ?? ""));

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

  /* ---------- Sous-extensions regroupées avec leur extension ----------
     TCGdex sépare certaines cartes dans une « extension » à part
     (réimpressions, galeries, coffres…). Sur MGTCG elles sont affichées
     et comptées avec l'extension principale, comme dans la vraie vie. */
  MG.SET_MERGE = {
    "30th-c": "30th",       // 30 ans : Collection Classique (réimpressions)
    "cel25cc": "cel25",     // Célébrations : Collection Classique
    "swsh12.5gg": "swsh12.5", // Zénith Suprême : Galerie Galaroise
    "swsh9tg": "swsh9",     // Stars Étincelantes : Galerie de Dresseurs
    "swsh10tg": "swsh10",   // Astres Radieux : Galerie de Dresseurs
    "swsh11tg": "swsh11",   // Origine Perdue : Galerie de Dresseurs
    "swsh12tg": "swsh12",   // Tempête Argentée : Galerie de Dresseurs
    "swsh4.5sv": "swsh4.5", // Destinées Radieuses : Coffre Étincelant
    "sma": "sm115",         // Destinées Occultes : Coffre Étincelant
    "rc": "bw11",           // Trésors Légendaires : Collection Radiante
  };
  MG.setParent = (id) => MG.SET_MERGE[id] || id;
  const childrenOf = (id) => Object.keys(MG.SET_MERGE).filter((c) => MG.SET_MERGE[c] === id);
  MG.setChildren = childrenOf;
  const count = (c) => ({ official: Number(c && c.official) || 0, total: Number(c && (c.total || c.official)) || 0 });
  // Carte « secrète » (au-delà du numéro officiel de l'extension principale) ?
  // Les cartes des sous-extensions regroupées (réimpressions, galeries…) comptent comme normales.
  MG.isSecretCard = function (card, mainOfficial) {
    const id = String((card && card.id) || "");
    if (MG.SET_MERGE[id.slice(0, id.lastIndexOf("-"))]) return false;
    const n = String((card && card.localId) ?? "");
    return !/^\d+$/.test(n) || (mainOfficial > 0 && parseInt(n, 10) > mainOfficial);
  };
  // Liste d'extensions : on retire les sous-extensions et on ajoute leurs cartes à l'extension principale
  function mergeList(list) {
    if (!Array.isArray(list)) return list;
    const kids = new Map();
    list.forEach((s) => { if (s && MG.SET_MERGE[s.id]) kids.set(s.id, s); });
    return list.filter((s) => !(s && MG.SET_MERGE[s.id])).map((s) => {
      if (!s) return s;
      const a = count(s.cardCount);
      a.main = a.official;
      childrenOf(s.id).map((c) => kids.get(c)).filter(Boolean).forEach((c) => { const b = count(c.cardCount); a.official += b.official; a.total += b.total; });
      return Object.assign({}, s, { cardCount: a });
    });
  }
  function fillBriefs(set) {
    const cards = (set && set.cards) || [];
    if (!cards.some((c) => c && !safeAsset(c.image))) return set;
    const sib = cards.find((c) => c && safeAsset(c.image));
    if (!sib) return set;
    const p = toEn(sib.image.replace(/[^/]+$/, ""));
    return Object.assign({}, set, { cards: cards.map((c) => (c && !safeAsset(c.image) && c.localId ? Object.assign({}, c, { image: p + c.localId, imageFallback: true }) : c)) });
  }
  async function mergedSet(lang, id) {
    const raw = fillBriefs(await get(`/${lang}/sets/${enc(id)}`, { persist: true }));
    const main = Object.assign({}, raw, { cardCount: Object.assign(count(raw.cardCount), { main: count(raw.cardCount).official }) });
    const ch = childrenOf(id);
    if (!ch.length) return main;
    const subs = (await Promise.all(ch.map((c) => get(`/${lang}/sets/${enc(c)}`, { persist: true }).then(fillBriefs).catch(() => null)))).filter(Boolean);
    if (!subs.length) return main;
    const a = Object.assign({}, main.cardCount);
    let cards = (main.cards || []).slice();
    subs.forEach((x) => { const b = count(x.cardCount); a.official += b.official; a.total += b.total; cards = cards.concat(x.cards || []); });
    a.total = Math.max(a.total, cards.length);
    return Object.assign({}, main, { cards, cardCount: a, merged: subs.map((x) => x.id) });
  }
  // Une carte d'une sous-extension est rattachée à l'extension principale
  async function fixCardSet(lang, c) {
    if (!c || !c.set || !MG.SET_MERGE[c.set.id]) return c;
    try {
      const p = await mergedSet(lang, MG.SET_MERGE[c.set.id]);
      return Object.assign({}, c, { set: { id: p.id, name: p.name, cardCount: p.cardCount } });
    } catch (e) { return Object.assign({}, c, { set: Object.assign({}, c.set, { id: MG.SET_MERGE[c.set.id] }) }); }
  }

  /* ---------- Images manquantes ----------
     Certaines cartes n'ont pas d'image dans une langue (ex. en français) :
     on reconstruit l'adresse à partir d'une autre carte de l'extension
     et on prend la version anglaise, qui existe presque toujours. */
  const prefixes = new Map();
  async function imgPrefix(lang, setId) {
    const k = lang + "|" + setId;
    if (!prefixes.has(k)) prefixes.set(k, get(`/${lang}/sets/${enc(setId)}`, { persist: true }).then((raw) => {
      const sib = ((raw && raw.cards) || []).find((c) => safeAsset(c.image));
      return sib ? sib.image.replace(/[^/]+$/, "") : "";
    }).catch(() => ""));
    return prefixes.get(k);
  }
  const toEn = (url) => url.replace(/^(https:\/\/assets\.tcgdex\.net\/)[a-z-]+\//, "$1en/");
  async function fillImage(lang, c, setId) {
    if (!c || safeAsset(c.image) || !c.localId) return c;
    const p = await imgPrefix(lang, setId || String(c.id || "").split("-").slice(0, -1).join("-"));
    return p ? Object.assign({}, c, { image: toEn(p) + c.localId, imageFallback: true }) : c;
  }
  // Une image qui ne charge pas : on essaie la version anglaise, sinon on la masque proprement
  document.addEventListener("error", (e) => {
    const t = e.target;
    if (!t || t.tagName !== "IMG") return;
    const m = /^https:\/\/assets\.tcgdex\.net\/([a-z-]+)\/(.+)$/.exec(t.getAttribute("src") || "");
    if (!m) return;
    if (m[1] !== "en" && m[1] !== "univ" && !t.dataset.fb) { t.dataset.fb = "1"; t.src = "https://assets.tcgdex.net/en/" + m[2]; return; }
    if (t.closest(".tile-img")) { t.classList.add("img-missing"); return; }
    t.remove();
  }, true);
  // Visuel réel d'un produit chargé : on masque l'image de secours en dessous
  document.addEventListener("load", (e) => {
    const t = e.target;
    if (t && t.tagName === "IMG" && t.classList.contains("visuel-real") && t.parentElement) t.parentElement.classList.add("real-ok");
  }, true);

  /* ---------- Appels ---------- */
  MG.api = {
    series: (lang) => get(`/${lang}/series`, { persist: true }),
    serie: async (lang, id) => { const s = await get(`/${lang}/series/${enc(id)}`, { persist: true }); return s && s.sets ? Object.assign({}, s, { sets: mergeList(s.sets) }) : s; },
    sets: async (lang) => mergeList(await get(`/${lang}/sets`, { persist: true })),
    setsRaw: (lang) => get(`/${lang}/sets`, { persist: true }),
    set: (lang, id) => mergedSet(lang, MG.setParent(id)),
    search: (lang, q, page = 1) =>
      get(`/${lang}/cards?name=${enc(q)}&pagination:page=${page}&pagination:itemsPerPage=60`),
    card: async (lang, id) => {
      const key = `/${lang}/cards/${id}`;
      if (memory.has(key)) return memory.get(key);
      const cached = readCache(key);
      if (cached) { const c2 = await fixCardSet(lang, await fillImage(lang, cached, cached.set && cached.set.id)); memory.set(key, c2); return c2; }
      const full = await get(key);
      // On garde en cache une version compacte (le stockage du navigateur est limité)
      const slim = await fixCardSet(lang, await fillImage(lang, slimCard(full), full.set && full.set.id));
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
