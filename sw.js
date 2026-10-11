/* ==========================================================
   MGTCG — sw.js   (V3 : application installable + hors ligne)
   Garde une copie du site pour qu'il s'ouvre même sans réseau.
   ⚠️ Le numéro VERSION doit suivre le ?v= de index.html.
   Créé par Mathis GILLIG.
   ========================================================== */
const VERSION = 33;
const SHELL = "mgtcg-site-v" + VERSION;
const DATA = "mgtcg-donnees";
const FILES = [
  "style.css",
  "api.js",
  "devises.js",
  "rarity.js",
  "drapeaux.js",
  "store.js",
  "i18n-en.js",
  "i18n.js",
  "config.js",
  "auth.js",
  "boutiques.js",
  "agenda.js",
  "valeur.js",
  "visuels.js",
  "scelle.js",
  "ouvertures.js",
  "outils.js",
  "actus.js",
  "importer.js",
  "completer.js",
  "bouclier.js",
  "echanges.js",
  "profils.js",
  "passeport.js",
  "portefeuille.js",
  "widgets.js",
  "avis.js",
  "assistant.js",
  "app.js",
  "pwa.js",
  "notifs.js"
].map((f) => f + "?v=" + VERSION).concat(["./", "index.html", "manifest.json", "icone-192.png", "icone-512.png", "icone-maskable-512.png", "apple-touch-icon.png"]);
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js";

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await c.addAll(FILES);
    try { await c.add(new Request(SUPABASE_JS, { mode: "cors" })); } catch (err) { /* pas grave */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("mgtcg-site-") && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: req.mode === "navigate" });
    if (hit) return hit;
    if (req.mode === "navigate") return (await caches.match("index.html")) || Response.error();
    return Response.error();
  }
}

async function trimData() {
  const c = await caches.open(DATA);
  const keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) await c.delete(k);
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Pages du site : réseau d'abord (pour avoir la dernière version), copie sinon
  if (req.mode === "navigate" && url.origin === location.origin) { e.respondWith(networkFirst(req, SHELL)); return; }
  // Fichiers du site et librairie Supabase : copie d'abord (ils changent de ?v= à chaque mise à jour)
  if (url.origin === location.origin || req.url === SUPABASE_JS) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && url.origin === location.origin) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // Données des cartes (TCGdex) : réseau d'abord, dernière copie si hors ligne
  if (url.hostname === "api.tcgdex.net") {
    e.respondWith(networkFirst(req, DATA).finally(() => trimData()));
  }
  // Tout le reste (comptes Supabase, cartes, images…) : pas de copie
});

// Clic sur une notification : ouvre MGTCG sur la bonne page
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const href = (e.notification.data && e.notification.data.href) || "#/";
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) { if ("focus" in c) { c.postMessage({ mgtcgHref: href }); return c.focus(); } }
    return self.clients.openWindow("./" + href);
  })());
});
