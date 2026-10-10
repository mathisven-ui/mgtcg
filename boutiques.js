/* ==========================================================
   MGTCG — boutiques.js   (V2)
   Carte 3D des boutiques de cartes en France, itinéraires
   (voiture, vélo, à pied, transports), coût du trajet,
   tournée « Chasse aux cartes », restocks signalés par les
   membres et boutiques proposées par la communauté.
   Créé par Mathis GILLIG.

   Services gratuits utilisés (sans clé) :
   - Carte : MapLibre + OpenFreeMap (fond OpenStreetMap)
   - Boutiques : OpenStreetMap via l'API Overpass
   - Itinéraires : OSRM (routing.openstreetmap.de)
   - Recherche d'adresse : Nominatim (OpenStreetMap)
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";
  const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
  const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
  const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
  const ROUTER = {
    car: "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
    bike: "https://routing.openstreetmap.de/routed-bike/route/v1/driving/",
    foot: "https://routing.openstreetmap.de/routed-foot/route/v1/driving/",
  };
  const NOMINATIM = "https://nominatim.openstreetmap.org/search";
  const PARIS = { lat: 48.8566, lon: 2.3522 };
  const RADIUS_M = 15000;

  const SETTINGS_KEY = "mgtcg:trajet";
  const TOUR_KEY = "mgtcg:tournee";

  const CATEGORIES = {
    games: "Jeux & cartes", collector: "Objets de collection", comics: "BD & manga",
    anime: "Manga & anime", hobby: "Loisirs", trade: "Achat / revente", toys: "Jouets",
  };
  // Grandes enseignes qui vendent souvent des cartes Pokémon (points rouges)
  const CHAINS = [
    ["Fnac", /^fnac\b/i], ["Micromania", /^micromania/i], ["Cultura", /^cultura\b/i],
    ["King Jouet", /^king ?jouet/i], ["JouéClub", /^jou[eé] ?club/i], ["La Grande Récré", /^la grande r[eé]cr[eé]/i],
    ["Smyths Toys", /^smyths/i], ["Carrefour", /^carrefour$/i], ["E.Leclerc", /^(e\.? ?)?leclerc$/i],
    ["Auchan", /^auchan$/i], ["Cora", /^cora$/i], ["Géant Casino", /^g[eé]ant( casino)?$/i], ["Hyper U", /^hyper u$/i],
  ];
  const chainOf = (t) => {
    for (const v of [t.brand, t.name]) {
      if (!v) continue;
      const hit = CHAINS.find(([, re]) => re.test(String(v).trim()));
      if (hit) return hit[0];
    }
    return null;
  };
  const SELLS = { boosters: "Boosters", gradees: "Cartes gradées", scelle: "Produits scellés (ETB, displays…)", occasion: "Cartes à l'unité / occasion", tournois: "Tournois" };
  const PRODUCTS = ["Boosters", "ETB", "Display", "UPC", "Coffret", "Cartes gradées", "Autre"];
  const MODES = {
    car: { label: "Voiture", icon: "🚗", gmaps: "driving" },
    transit: { label: "Transports", icon: "🚆", gmaps: "transit" },
    bike: { label: "Vélo", icon: "🚲", gmaps: "bicycling" },
    foot: { label: "À pied", icon: "🚶", gmaps: "walking" },
  };

  /* ---------------- État ---------------- */
  const S = {
    map: null,
    markers: new Map(),   // clé → marqueur
    shops: new Map(),     // clé → boutique
    hot: new Set(),       // boutiques avec un restock récent
    user: null,           // { lat, lon } position de l'utilisateur
    origin: null,         // point de départ des trajets
    selected: null,
    mode: "car",
    lastRoute: null,
    filter: "all",
  };

  const load = (k, d) => { try { return Object.assign({}, d, JSON.parse(localStorage.getItem(k))); } catch (e) { return d; } };
  const loadArr = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 12) : []; } catch (e) { return []; } };
  const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* rien */ } };

  let settings = load(SETTINGS_KEY, { conso: 6.5, prix: 1.8, ar: true });
  let tour = loadArr(TOUR_KEY);

  /* ---------------- Outils ---------------- */
  const ui = () => MG.ui;
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");
  const km = (m) => (m < 1000 ? Math.round(m) + " m" : (m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " km");
  const dur = (s) => { const m = Math.round(s / 60); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); };
  const euro = (n) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

  function haversine(a, b) {
    const R = 6371000, toR = (d) => (d * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat), dLon = toR(b.lon - a.lon);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  const DAYS = { Mo: "Lun", Tu: "Mar", We: "Mer", Th: "Jeu", Fr: "Ven", Sa: "Sam", Su: "Dim", PH: "Fériés", off: "fermé" };
  const hoursFr = (h) => String(h || "").replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH|off)\b/g, (d) => DAYS[d]).replace(/;\s*/g, " · ");

  function loadMapLibre() {
    if (window.maplibregl) return Promise.resolve();
    if (loadMapLibre.p) return loadMapLibre.p;
    loadMapLibre.p = new Promise((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet"; css.href = MAPLIBRE_CSS; css.crossOrigin = "anonymous";
      document.head.appendChild(css);
      const js = document.createElement("script");
      js.src = MAPLIBRE_JS; js.crossOrigin = "anonymous";
      js.onload = () => resolve();
      js.onerror = () => { loadMapLibre.p = null; reject(new Error("maplibre")); };
      document.head.appendChild(js);
    });
    return loadMapLibre.p;
  }

  /* ---------------- Données : OpenStreetMap ---------------- */
  const osmCache = new Map();
  async function fetchOSM(center) {
    const key = center.lat.toFixed(2) + "," + center.lon.toFixed(2);
    if (osmCache.has(key)) return osmCache.get(key);
    const a = `(around:${RADIUS_M},${center.lat.toFixed(5)},${center.lon.toFixed(5)})`;
    const q = `[out:json][timeout:25];(
      nwr["shop"~"^(games|collector|comics|anime|trade)$"]${a};
      nwr["shop"]["name"~"pok[eé]mon|tcg|trading card|cartes? (à|a) collectionner|card ?shop|carte ?shop|manga|geek",i]${a};
      nwr["shop"]["brand"~"^(Fnac|Micromania|Micromania-Zing|Cultura|King Jouet|JouéClub|La Grande Récré|Smyths Toys|Carrefour|E\\.Leclerc|Auchan|Cora|Géant Casino|Hyper U)$"]${a};
      nwr["shop"]["name"~"^(Fnac.*|Micromania.*|Cultura|King Jouet|JouéClub|La Grande Récré|Carrefour|E\\.Leclerc|Leclerc|Auchan|Cora|Hyper U)$"]${a};
    );out center tags 500;`;
    let lastErr;
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const json = await res.json();
        const shops = (json.elements || []).map(osmToShop).filter(Boolean);
        osmCache.set(key, shops);
        return shops;
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  function osmToShop(el) {
    const t = el.tags || {};
    const lat = el.lat ?? (el.center && el.center.lat);
    const lon = el.lon ?? (el.center && el.center.lon);
    if (!t.name || typeof lat !== "number" || typeof lon !== "number") return null;
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const city = [t["addr:postcode"], t["addr:city"]].filter(Boolean).join(" ");
    return {
      key: `osm:${el.type}/${el.id}`,
      source: "osm",
      type: chainOf(t) ? "chain" : "spec",
      name: String(t.name).slice(0, 80),
      lat, lon,
      address: [street, city].filter(Boolean).join(", "),
      category: chainOf(t) ? "Grande enseigne · " + chainOf(t) : CATEGORIES[t.shop] || "Boutique",
      hours: t.opening_hours || "",
      website: safeUrl(t.website || t["contact:website"] || ""),
      phone: String(t.phone || t["contact:phone"] || "").slice(0, 30),
      osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    };
  }

  /* ---------------- Données : boutiques de la communauté ---------------- */
  async function fetchCommunity() {
    const a = MG.auth;
    if (!a || !a.enabled) return [];
    const { data, error } = await a.client.from("shops").select("id,name,address,lat,lon,kind,sells,website,note,status").eq("status", "approved").limit(2000);
    if (error || !data) return [];
    return data.map((s) => ({
      key: "mg:" + s.id, source: "mg", id: s.id,
      name: s.name, lat: s.lat, lon: s.lon, address: s.address,
      type: s.kind === "enseigne" ? "chain" : "spec",
      category: s.kind === "enseigne" ? "Grande enseigne" : "Boutique spécialisée",
      sells: Array.isArray(s.sells) ? s.sells : [], website: safeUrl(s.website), note: s.note || "",
    }));
  }

  async function fetchHot() {
    const a = MG.auth;
    if (!a || !a.enabled) return;
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data } = await a.client.from("restocks").select("shop_key").gte("created_at", since).limit(2000);
    S.hot = new Set((data || []).map((r) => r.shop_key));
  }

  /* ---------------- Itinéraires ---------------- */
  async function osrm(profile, points) {
    const coords = points.map((p) => p.lon.toFixed(6) + "," + p.lat.toFixed(6)).join(";");
    const res = await fetch(ROUTER[profile] + coords + "?overview=full&geometries=geojson&steps=false");
    if (!res.ok) throw new Error("route " + res.status);
    const json = await res.json();
    if (json.code !== "Ok" || !json.routes || !json.routes[0]) throw new Error("no route");
    const r = json.routes[0];
    return { distance: r.distance, duration: r.duration, geometry: r.geometry };
  }

  // Calcule durée, distance et coût selon le mode
  async function computeTrip(mode, points) {
    const profile = mode === "transit" ? "foot" : mode;
    const r = await osrm(profile, points);
    const ar = settings.ar ? 2 : 1;
    const out = { mode, geometry: r.geometry, distance: r.distance * ar, duration: r.duration * ar, cost: 0, estimate: false };
    const kmOneWay = r.distance / 1000;
    if (mode === "car") {
      out.cost = (out.distance / 1000) * (settings.conso / 100) * settings.prix;
    } else if (mode === "transit") {
      // Pas de donnée officielle gratuite : estimation simple
      out.estimate = true;
      out.duration = ((kmOneWay / 20) * 3600 + 10 * 60) * ar;
      out.cost = (kmOneWay <= 25 ? 2.1 : 2.1 + (kmOneWay - 25) * 0.11) * ar;
    }
    return out;
  }

  function gmapsLink(mode, points) {
    const o = points[0], d = points[points.length - 1];
    const way = points.slice(1, -1).map((p) => p.lat + "," + p.lon).join("|");
    return "https://www.google.com/maps/dir/?api=1&origin=" + o.lat + "," + o.lon +
      "&destination=" + d.lat + "," + d.lon + (way ? "&waypoints=" + encodeURIComponent(way) : "") +
      "&travelmode=" + MODES[mode].gmaps;
  }

  function drawRoute(geometry) {
    const src = S.map && S.map.getSource("route");
    if (!src) return;
    src.setData(geometry ? { type: "Feature", geometry, properties: {} } : { type: "FeatureCollection", features: [] });
    if (geometry && geometry.coordinates.length) {
      const b = geometry.coordinates.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(geometry.coordinates[0], geometry.coordinates[0]));
      S.map.fitBounds(b, { padding: 60, pitch: 45, duration: 900 });
    }
  }

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.boutiques = async function () {
    const { view, $ } = ui();
    S.selected = null; S.lastRoute = null;
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🗺️ Boutiques de cartes</h1>
        <p class="muted">Trouve les boutiques près de chez toi, calcule ton trajet et vois les derniers restocks signalés par la communauté.</p>
      </div></header>

      <div class="shop-toolbar">
        <form id="where" class="where" role="search">
          <input id="where-q" type="search" placeholder="Ville ou adresse (ex : Lyon)" maxlength="100" aria-label="Ville ou adresse">
          <button class="btn ghost" type="submit">Chercher</button>
        </form>
        <button class="btn ghost" id="locate">📍 Me localiser</button>
        <button class="btn ghost" id="zone">🔄 Chercher dans cette zone</button>
        <button class="btn" id="add-shop">＋ Proposer une boutique</button>
      </div>

      <div class="shop-layout">
        <div class="map-wrap">
          <div id="map" class="map"></div>
          <button class="map-3d" id="toggle3d" title="Vue 3D / vue du dessus">2D</button>
          <div class="map-legend">
            <span><i class="lg spec"></i>Boutique spécialisée</span>
            <span><i class="lg chain"></i>Grande enseigne</span>
            <span><i class="lg mg"></i>Ajoutée par un membre</span>
            <span>🔥 Restock récent</span>
          </div>
          <div id="map-msg" class="map-msg" hidden></div>
        </div>
        <aside class="shop-panel" id="panel"></aside>
      </div>

      <section class="tour" id="tour"></section>

      <p class="disclaimer">Boutiques : © contributeurs OpenStreetMap et membres MGTCG. Les horaires et stocks peuvent changer : appelle la boutique avant de te déplacer.
      Coûts de trajet : estimations (carburant selon tes réglages, transports selon un tarif moyen). Itinéraires : OSRM / OpenStreetMap.</p>`;

    renderTour();
    renderPanel();

    $("#where").addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = $("#where-q").value.trim().slice(0, 100);
      if (!q) return;
      const place = await geocode(q);
      if (!place) return ui().toast("Lieu introuvable");
      S.origin = place;
      flyAndSearch(place, 12);
    });
    $("#locate").addEventListener("click", () => locate(true));
    $("#zone").addEventListener("click", () => {
      if (!S.map) return;
      const c = S.map.getCenter();
      search({ lat: c.lat, lon: c.lng });
    });
    $("#add-shop").addEventListener("click", openAddShop);
    $("#toggle3d").addEventListener("click", () => {
      if (!S.map) return;
      const flat = S.map.getPitch() < 10;
      S.map.easeTo({ pitch: flat ? 55 : 0, bearing: flat ? -15 : 0, duration: 700 });
      $("#toggle3d").textContent = flat ? "2D" : "3D";
    });

    try { await loadMapLibre(); }
    catch (e) { mapMsg("Impossible de charger la carte. Vérifie ta connexion."); return; }
    if (!document.getElementById("map")) return; // on a changé de page entre-temps

    initMap(PARIS);
    locate(false);
  };

  function mapMsg(text) {
    const el = document.getElementById("map-msg");
    if (!el) return;
    el.hidden = !text; el.textContent = text || "";
  }

  function initMap(center) {
    if (S.map) { try { S.map.remove(); } catch (e) { /* rien */ } }
    S.markers.clear();
    S.map = new maplibregl.Map({
      container: "map", style: MAP_STYLE,
      center: [center.lon, center.lat], zoom: 11.5, pitch: 55, bearing: -15, maxPitch: 75,
      attributionControl: { compact: true },
    });
    S.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    S.map.on("load", () => {
      S.map.addSource("route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      S.map.addLayer({ id: "route-casing", type: "line", source: "route", paint: { "line-color": "#12131a", "line-width": 9, "line-opacity": 0.6 }, layout: { "line-cap": "round", "line-join": "round" } });
      S.map.addLayer({ id: "route", type: "line", source: "route", paint: { "line-color": "#ffcb05", "line-width": 5 }, layout: { "line-cap": "round", "line-join": "round" } });
      add3dBuildings();
      if (S.lastRoute) drawRoute(S.lastRoute.geometry);
    });
  }

  // Bâtiments en relief (si le style de carte ne les a pas déjà)
  function add3dBuildings() {
    const style = S.map.getStyle();
    if (!style || style.layers.some((l) => l.type === "fill-extrusion")) return;
    const src = Object.keys(style.sources).find((k) => style.sources[k].type === "vector");
    if (!src) return;
    try {
      S.map.addLayer({
        id: "mg-buildings-3d", type: "fill-extrusion", source: src, "source-layer": "building", minzoom: 14,
        paint: {
          "fill-extrusion-color": "#c9c3b8",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.75,
        },
      });
    } catch (e) { /* style sans bâtiments */ }
  }

  function locate(manual) {
    if (!navigator.geolocation) { if (manual) ui().toast("Localisation non disponible"); search(PARIS); return; }
    mapMsg("📍 Recherche de ta position…");
    // Si personne ne répond à la demande de position, on affiche Paris en attendant
    const fallback = manual ? 0 : setTimeout(() => { if (!S.shops.size && !S.user) search(PARIS); }, 5000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(fallback);
        S.user = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        S.origin = S.user;
        showUser();
        flyAndSearch(S.user, 12);
      },
      () => {
        clearTimeout(fallback);
        if (manual) ui().toast("Position refusée : cherche une ville à la place");
        mapMsg("");
        if (!S.shops.size) search(PARIS);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }

  let userMarker = null;
  function showUser() {
    if (!S.map || !S.user) return;
    if (userMarker) userMarker.remove();
    const el = document.createElement("div");
    el.className = "mk-user"; el.title = "Ta position";
    userMarker = new maplibregl.Marker({ element: el }).setLngLat([S.user.lon, S.user.lat]).addTo(S.map);
  }

  function flyAndSearch(p, zoom) {
    if (S.map) S.map.flyTo({ center: [p.lon, p.lat], zoom, pitch: 55, bearing: -15, duration: 1200 });
    search(p);
  }

  let searchId = 0;
  async function search(center) {
    const id = ++searchId;
    mapMsg("🔍 Recherche des boutiques…");
    let osm = [], community = [], failed = false;
    try {
      [osm, community] = await Promise.all([
        fetchOSM(center).catch(() => { failed = true; return []; }),
        fetchCommunity().catch(() => []),
        fetchHot().catch(() => {}),
      ]);
    } catch (e) { failed = true; }
    if (id !== searchId || !document.getElementById("map")) return;
    S.shops.clear();
    for (const s of [...community, ...osm]) {
      // Évite les doublons (même boutique dans OSM et dans la communauté)
      const dup = [...S.shops.values()].some((o) => haversine(o, s) < 40 && o.name.toLowerCase() === s.name.toLowerCase());
      if (!dup) S.shops.set(s.key, s);
    }
    for (const k of tour) if (!S.shops.has(k) && tourCache[k]) S.shops.set(k, tourCache[k]);
    S.origin = S.origin || center;
    renderMarkers();
    renderPanel();
    if (failed && !osm.length) mapMsg("⚠️ Le service OpenStreetMap ne répond pas. Réessaie dans un instant avec « Chercher dans cette zone ».");
    else if (!S.shops.size) mapMsg("Aucune boutique trouvée dans un rayon de 15 km. Déplace la carte ou propose une boutique !");
    else mapMsg("");
  }

  function renderMarkers() {
    if (!S.map) return;
    for (const m of S.markers.values()) m.remove();
    S.markers.clear();
    for (const s of S.shops.values()) {
      const el = document.createElement("button");
      el.className = "mk " + (s.type || "spec") + " " + s.source + (S.hot.has(s.key) ? " hot" : "") + (S.selected === s.key ? " sel" : "") + (tour.includes(s.key) ? " in-tour" : "");
      el.setAttribute("aria-label", s.name);
      el.title = s.name;
      el.textContent = S.hot.has(s.key) ? "🔥" : "";
      el.addEventListener("click", (e) => { e.stopPropagation(); select(s.key, false); });
      const m = new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(S.map);
      S.markers.set(s.key, m);
    }
  }

  function select(key, fly) {
    S.selected = key;
    S.lastRoute = null;
    drawRoute(null);
    const s = S.shops.get(key);
    if (s && fly && S.map) S.map.flyTo({ center: [s.lon, s.lat], zoom: 15.5, pitch: 60, duration: 1000 });
    for (const [k, m] of S.markers) m.getElement().classList.toggle("sel", k === key);
    renderPanel();
    const panel = document.getElementById("panel");
    if (panel && window.innerWidth < 860) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- Panneau de droite ---------------- */
  function renderPanel() {
    const panel = document.getElementById("panel");
    if (!panel) return;
    const s = S.selected && S.shops.get(S.selected);
    if (s) return renderShop(panel, s);

    const { esc } = ui();
    const ref = S.origin || PARIS;
    let list = [...S.shops.values()].map((x) => ({ s: x, d: haversine(ref, x) }));
    if (S.filter === "hot") list = list.filter((x) => S.hot.has(x.s.key));
    if (S.filter === "mg") list = list.filter((x) => x.s.source === "mg");
    if (S.filter === "spec") list = list.filter((x) => x.s.type !== "chain");
    if (S.filter === "chain") list = list.filter((x) => x.s.type === "chain");
    list.sort((a, b) => a.d - b.d);

    panel.innerHTML = `
      <div class="panel-head">
        <strong>${S.shops.size} boutique${S.shops.size > 1 ? "s" : ""}</strong>
        <div class="chips small-chips">
          <button class="chip ${S.filter === "all" ? "active" : ""}" data-f="all">Toutes</button>
          <button class="chip ${S.filter === "spec" ? "active" : ""}" data-f="spec">Spécialisées</button>
          <button class="chip ${S.filter === "chain" ? "active" : ""}" data-f="chain">Grandes enseignes</button>
          <button class="chip ${S.filter === "hot" ? "active" : ""}" data-f="hot">🔥 Restocks</button>
          <button class="chip ${S.filter === "mg" ? "active" : ""}" data-f="mg">Communauté</button>
        </div>
      </div>
      ${list.length ? `<ul class="shop-list">${list.slice(0, 80).map(({ s: x, d }) => `
        <li><button class="shop-item" data-k="${esc(x.key)}">
          <span class="dot ${x.type || "spec"} ${x.source}"></span>
          <span class="si-main"><b>${S.hot.has(x.key) ? "🔥 " : ""}${esc(x.name)}</b><small>${esc(x.category)}${x.address ? " · " + esc(x.address) : ""}</small></span>
          <span class="si-dist">${km(d)}</span>
        </button></li>`).join("")}</ul>`
      : `<p class="muted small panel-empty">Aucune boutique à afficher ici.</p>`}`;

    panel.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { S.filter = b.dataset.f; renderPanel(); }));
    panel.querySelectorAll(".shop-item").forEach((b) => b.addEventListener("click", () => select(b.dataset.k, true)));
  }

  function renderShop(panel, s) {
    const { esc } = ui();
    const inTour = tour.includes(s.key);
    const d = S.origin ? haversine(S.origin, s) : null;
    panel.innerHTML = `
      <button class="link-btn" id="back">← Toutes les boutiques</button>
      <div class="shop-card">
        <p class="eyebrow">${s.type === "chain" ? "Grande enseigne" : "Boutique spécialisée"} · ${s.source === "mg" ? "ajoutée par un membre" : "OpenStreetMap"}${S.hot.has(s.key) ? ' · <span class="hot-tag">🔥 restock récent</span>' : ""}</p>
        <h2>${esc(s.name)}</h2>
        <p class="muted small">${esc(s.category)}${d != null ? " · à " + km(d) + " à vol d'oiseau" : ""}</p>
        ${s.address ? `<p>📍 ${esc(s.address)}</p>` : ""}
        ${s.hours ? `<p>🕒 ${esc(hoursFr(s.hours))}</p>` : ""}
        ${s.phone ? `<p>📞 <a href="tel:${esc(s.phone.replace(/[^\d+]/g, ""))}">${esc(s.phone)}</a></p>` : ""}
        ${s.sells && s.sells.length ? `<div class="badges">${s.sells.filter((x) => SELLS[x]).map((x) => `<span class="badge">${esc(SELLS[x])}</span>`).join("")}</div>` : ""}
        ${s.note ? `<p class="small">${esc(s.note)}</p>` : ""}
        ${s.type === "chain" ? `<p class="small muted">Les grandes enseignes ont souvent un rayon cartes Pokémon, mais le stock varie beaucoup d'un magasin à l'autre.</p>` : ""}
        <div class="links">
          ${s.website ? `<a target="_blank" rel="noopener noreferrer nofollow" href="${esc(s.website)}">🌐 Site web</a>` : ""}
          ${s.osmUrl ? `<a target="_blank" rel="noopener noreferrer" href="${esc(s.osmUrl)}">Fiche OpenStreetMap</a>` : ""}
        </div>
      </div>

      <h3>Y aller</h3>
      <div class="modes">${Object.entries(MODES).map(([k, m]) => `<button class="mode ${S.mode === k ? "active" : ""}" data-mode="${k}">${m.icon}<span>${m.label}</span></button>`).join("")}</div>
      <div id="trip" class="trip"><p class="muted small">${S.origin ? "Choisis un mode de transport pour calculer le trajet." : "Indique d'abord ta position (📍 Me localiser) ou une ville."}</p></div>
      ${tripSettingsHTML()}

      <div class="row panel-actions">
        <button class="btn ${inTour ? "" : "ghost"}" id="tour-btn">${inTour ? "✓ Dans ma tournée" : "＋ Ajouter à ma tournée"}</button>
      </div>

      <h3>Restocks signalés</h3>
      <div id="restocks"><p class="muted small">Chargement…</p></div>`;

    panel.querySelector("#back").addEventListener("click", () => { S.selected = null; S.lastRoute = null; drawRoute(null); renderMarkers(); renderPanel(); });
    panel.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { S.mode = b.dataset.mode; panel.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("active", x === b)); runTrip(s); }));
    bindTripSettings(panel, () => runTrip(s));
    panel.querySelector("#tour-btn").addEventListener("click", () => { toggleTour(s); renderShop(panel, s); });
    loadRestocks(s);
    if (S.origin) runTrip(s);
  }

  function tripSettingsHTML() {
    return `<details class="trip-settings"><summary>⚙️ Réglages du calcul</summary>
      <label>Consommation de la voiture <span><input type="number" id="conso" min="2" max="30" step="0.1" value="${settings.conso}"> L/100 km</span></label>
      <label>Prix du carburant <span><input type="number" id="prix" min="0.5" max="5" step="0.01" value="${settings.prix}"> €/L</span></label>
      <label class="check"><input type="checkbox" id="ar" ${settings.ar ? "checked" : ""}> Compter l'aller-retour</label>
    </details>`;
  }
  function bindTripSettings(root, onChange) {
    const upd = () => {
      const c = parseFloat(root.querySelector("#conso").value), p = parseFloat(root.querySelector("#prix").value);
      settings = { conso: c > 0 && c < 40 ? c : 6.5, prix: p > 0 && p < 10 ? p : 1.8, ar: root.querySelector("#ar").checked };
      persist(SETTINGS_KEY, settings);
      onChange();
    };
    root.querySelectorAll("#conso,#prix,#ar").forEach((i) => i.addEventListener("change", upd));
  }

  let tripId = 0;
  async function runTrip(s) {
    const box = document.getElementById("trip");
    if (!box || !S.origin) return;
    const id = ++tripId;
    box.innerHTML = `<p class="muted small">Calcul du trajet…</p>`;
    const points = [S.origin, { lat: s.lat, lon: s.lon }];
    try {
      const t = await computeTrip(S.mode, points);
      if (id !== tripId) return;
      S.lastRoute = t;
      drawRoute(t.geometry);
      box.innerHTML = tripHTML(t, points);
    } catch (e) {
      if (id !== tripId) return;
      box.innerHTML = `<p class="muted small">Itinéraire indisponible pour le moment.</p>
        <a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${gmapsLink(S.mode, points)}">Ouvrir dans Google Maps</a>`;
    }
  }

  function tripHTML(t, points) {
    const costLabel = t.mode === "car" ? "Carburant" : t.mode === "transit" ? "Tickets (estimation)" : "Coût";
    return `<div class="trip-stats">
        <div><span>Durée${settings.ar ? " A/R" : ""}</span><strong>${dur(t.duration)}</strong></div>
        <div><span>Distance${settings.ar ? " A/R" : ""}</span><strong>${km(t.distance)}</strong></div>
        <div><span>${costLabel}</span><strong>${t.cost ? "≈ " + euro(t.cost) : "Gratuit"}</strong></div>
      </div>
      ${t.mode === "car" ? `<p class="muted small">Calcul : ${settings.conso} L/100 km × ${settings.prix.toLocaleString("fr-FR")} €/L (modifiable dans les réglages). Hors péage et parking.</p>` : ""}
      ${t.estimate ? `<p class="muted small">Pas d'horaires en temps réel : durée et prix estimés. Vérifie le trajet exact dans Google Maps.</p>` : ""}
      <a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${gmapsLink(t.mode, points)}">🧭 Lancer le GPS (Google Maps)</a>`;
  }

  /* ---------------- Tournée « Chasse aux cartes » ---------------- */
  const tourCache = {};
  function toggleTour(s) {
    if (tour.includes(s.key)) tour = tour.filter((k) => k !== s.key);
    else if (tour.length >= 10) { ui().toast("10 boutiques maximum dans une tournée"); return; }
    else { tour.push(s.key); tourCache[s.key] = s; }
    persist(TOUR_KEY, tour);
    renderTour();
    renderMarkers();
  }

  function renderTour() {
    const box = document.getElementById("tour");
    if (!box) return;
    const { esc } = ui();
    for (const k of tour) if (S.shops.has(k)) tourCache[k] = S.shops.get(k);
    const items = tour.map((k) => tourCache[k]).filter(Boolean);
    if (!tour.length) {
      box.innerHTML = `<h2>🎯 Ma tournée « Chasse aux cartes »</h2><p class="muted">Ajoute plusieurs boutiques avec « ＋ Ajouter à ma tournée » : MGTCG calcule le meilleur ordre de passage, la durée et le coût total.</p>`;
      return;
    }
    box.innerHTML = `
      <div class="section-head"><h2>🎯 Ma tournée (${tour.length} boutique${tour.length > 1 ? "s" : ""})</h2>
        <button class="link-btn" id="tour-clear">Vider</button></div>
      <ol class="tour-list">${items.map((s) => `<li><span>${esc(s.name)}</span><button class="link-btn" data-rm="${esc(s.key)}" aria-label="Retirer">✕</button></li>`).join("")}</ol>
      ${items.length < tour.length ? `<p class="muted small">Certaines boutiques de ta tournée sont hors de la zone affichée : recherche leur ville pour les recharger.</p>` : ""}
      <div class="row"><button class="btn" id="tour-go" ${items.length < 1 ? "disabled" : ""}>🚗 Calculer ma tournée en voiture</button></div>
      <div id="tour-result"></div>`;
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => {
      tour = tour.filter((k) => k !== b.dataset.rm); persist(TOUR_KEY, tour); renderTour(); renderMarkers();
      if (S.selected) renderPanel();
    }));
    box.querySelector("#tour-clear").addEventListener("click", () => { tour = []; persist(TOUR_KEY, tour); renderTour(); renderMarkers(); if (S.selected) renderPanel(); });
    box.querySelector("#tour-go").addEventListener("click", () => runTour(items));
  }

  async function runTour(items) {
    const out = document.getElementById("tour-result");
    if (!S.origin) { out.innerHTML = `<p class="muted small">Indique d'abord ta position (📍) ou une ville.</p>`; return; }
    // Ordre de passage : toujours la boutique la plus proche ensuite
    const left = items.slice(); const ordered = []; let cur = S.origin;
    while (left.length) {
      left.sort((a, b) => haversine(cur, a) - haversine(cur, b));
      cur = left.shift(); ordered.push(cur);
    }
    const points = [S.origin, ...ordered.map((s) => ({ lat: s.lat, lon: s.lon }))];
    if (settings.ar) points.push(S.origin);
    out.innerHTML = `<p class="muted small">Calcul de la tournée…</p>`;
    try {
      const r = await osrm("car", points);
      const cost = (r.distance / 1000) * (settings.conso / 100) * settings.prix;
      S.selected = null; renderPanel();
      S.lastRoute = { geometry: r.geometry }; drawRoute(r.geometry);
      const { esc } = ui();
      out.innerHTML = `
        <p><b>Ordre conseillé :</b> ${ordered.map((s, i) => `${i + 1}. ${esc(s.name)}`).join(" → ")}${settings.ar ? " → retour" : ""}</p>
        <div class="trip-stats">
          <div><span>Durée de route</span><strong>${dur(r.duration)}</strong></div>
          <div><span>Distance</span><strong>${km(r.distance)}</strong></div>
          <div><span>Carburant</span><strong>≈ ${euro(cost)}</strong></div>
        </div>
        <a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${gmapsLink("car", points)}">🧭 Lancer la tournée dans Google Maps</a>`;
    } catch (e) {
      out.innerHTML = `<p class="muted small">Calcul indisponible pour le moment. Réessaie dans un instant.</p>`;
    }
  }

  /* ---------------- Restocks ---------------- */
  function ago(iso) {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 60) return "il y a " + Math.max(m, 1) + " min";
    const h = Math.round(m / 60);
    if (h < 24) return "il y a " + h + " h";
    const d = Math.round(h / 24);
    return d === 1 ? "hier" : "il y a " + d + " jours";
  }

  async function loadRestocks(s) {
    const box = document.getElementById("restocks");
    if (!box) return;
    const { esc } = ui();
    const a = MG.auth;
    if (!a || !a.enabled) { box.innerHTML = `<p class="muted small">Les restocks arrivent dès que les comptes sont activés.</p>`; return; }
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await a.client.from("restocks").select("id,product,set_name,note,user_id,created_at")
      .eq("shop_key", s.key).gte("created_at", since).order("created_at", { ascending: false }).limit(20);
    if (!document.getElementById("restocks") || S.selected !== s.key) return;
    const me = a.user && a.user.id;
    const list = error ? [] : data || [];
    box.innerHTML = `
      ${list.length ? `<ul class="restock-list">${list.map((r) => `<li>
          <div><b>${esc(r.product)}</b>${r.set_name ? " · " + esc(r.set_name) : ""}<small>${esc(ago(r.created_at))}</small></div>
          ${r.note ? `<p class="small muted">${esc(r.note)}</p>` : ""}
          ${(r.user_id === me || (a.isAdmin && a.isAdmin())) ? `<button class="link-btn small" data-del="${esc(r.id)}">Supprimer</button>` : ""}
        </li>`).join("")}</ul>`
      : `<p class="muted small">Aucun restock signalé ces 30 derniers jours.</p>`}
      ${a.user ? `
        <form id="restock-form" class="form restock-form">
          <div class="row">
            <select name="product" aria-label="Produit">${PRODUCTS.map((p) => `<option>${p}</option>`).join("")}</select>
            <input name="set_name" type="text" maxlength="60" placeholder="Série (ex : Flammes Fantasmagoriques)">
          </div>
          <input name="note" type="text" maxlength="140" placeholder="Précision (optionnel) : quantité, prix, limite par personne…">
          <button class="btn" type="submit">🔥 Signaler un restock ici</button>
          <p class="form-msg" id="rs-msg" role="alert"></p>
        </form>`
      : `<p class="small"><a href="#/connexion">Connecte-toi</a> pour signaler un restock.</p>`}`;

    box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer ce signalement ?")) return;
      await a.client.from("restocks").delete().eq("id", b.dataset.del);
      loadRestocks(s);
    }));
    const form = box.querySelector("#restock-form");
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const btn = form.querySelector("button"); btn.disabled = true;
      const { error: err } = await a.client.from("restocks").insert({
        shop_key: s.key, shop_name: s.name.slice(0, 80),
        product: PRODUCTS.includes(f.get("product")) ? f.get("product") : "Autre",
        set_name: String(f.get("set_name") || "").trim().slice(0, 60) || null,
        note: String(f.get("note") || "").trim().slice(0, 140) || null,
        user_id: a.user.id,
      });
      btn.disabled = false;
      if (err) {
        const msg = /limite/i.test(err.message || "") ? err.message : "Impossible d'enregistrer. Réessaie.";
        const m = form.querySelector("#rs-msg"); m.textContent = msg; m.className = "form-msg err";
        return;
      }
      S.hot.add(s.key);
      ui().toast("Merci ! Restock signalé 🔥");
      renderMarkers();
      loadRestocks(s);
    });
  }

  /* ---------------- Proposer une boutique ---------------- */
  async function geocode(q) {
    try {
      const res = await fetch(NOMINATIM + "?format=json&limit=1&countrycodes=fr,be,ch,lu,mc&accept-language=fr&q=" + encodeURIComponent(q));
      const json = await res.json();
      if (!json[0]) return null;
      return { lat: parseFloat(json[0].lat), lon: parseFloat(json[0].lon), label: json[0].display_name };
    } catch (e) { return null; }
  }

  function openAddShop() {
    const a = MG.auth;
    const { $ } = ui();
    const modal = $("#modal"), body = $("#modal-body");
    if (!a || !a.enabled || !a.user) {
      body.innerHTML = `<div class="state"><p>🔒 Connecte-toi pour proposer une boutique.</p><a class="btn" href="#/connexion">Se connecter</a></div>`;
    } else {
      body.innerHTML = `
        <h2 id="modal-title">Proposer une boutique</h2>
        <p class="muted small">Ta proposition sera vérifiée par l'administrateur avant d'apparaître sur la carte.</p>
        <form id="shop-form" class="form">
          <label>Nom de la boutique<input name="name" required minlength="2" maxlength="80"></label>
          <label>Adresse complète<input name="address" required minlength="5" maxlength="200" placeholder="12 rue de la Paix, 75002 Paris"></label>
          <label>Type
            <select name="kind"><option value="independante">Boutique indépendante</option><option value="enseigne">Grande enseigne</option></select>
          </label>
          <fieldset class="sells"><legend>Ce qu'on y trouve</legend>
            ${Object.entries(SELLS).map(([k, v]) => `<label class="check"><input type="checkbox" name="sells" value="${k}"><span>${v}</span></label>`).join("")}
          </fieldset>
          <label>Site web (optionnel)<input name="website" type="url" maxlength="300" placeholder="https://…"></label>
          <label>Infos utiles (optionnel)<input name="note" maxlength="300" placeholder="Horaires, spécialités…"></label>
          <p class="form-msg" id="sh-msg" role="alert"></p>
          <button class="btn full" type="submit">Envoyer la proposition</button>
        </form>`;
      const form = $("#shop-form");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        const msg = (t, ok) => { const m = $("#sh-msg"); m.textContent = t; m.className = "form-msg " + (ok ? "ok" : "err"); };
        const name = String(f.get("name")).trim(), address = String(f.get("address")).trim();
        const website = String(f.get("website") || "").trim();
        if (name.length < 2 || address.length < 5) return msg("Indique le nom et l'adresse complète.");
        if (website && !/^https?:\/\//i.test(website)) return msg("Le site web doit commencer par https://");
        const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
        msg("Recherche de l'adresse…", true);
        const place = await geocode(address);
        if (!place) { btn.disabled = false; return msg("Adresse introuvable. Vérifie-la (numéro, rue, code postal, ville)."); }
        const { error } = await a.client.from("shops").insert({
          name: name.slice(0, 80), address: address.slice(0, 200), lat: place.lat, lon: place.lon,
          kind: f.get("kind") === "enseigne" ? "enseigne" : "independante",
          sells: f.getAll("sells").filter((x) => SELLS[x]),
          website: website || null, note: String(f.get("note") || "").trim().slice(0, 300) || null,
          status: "pending", created_by: a.user.id,
        });
        btn.disabled = false;
        if (error) return msg(/limite/i.test(error.message || "") ? error.message : "Impossible d'envoyer. Réessaie.");
        body.innerHTML = `<div class="state"><p>✅ Merci ! Ta boutique a été envoyée.</p><p class="muted">Elle apparaîtra sur la carte dès que l'administrateur l'aura validée.</p></div>`;
      });
    }
    modal.hidden = false;
    document.body.classList.add("noscroll");
  }

  /* ---------------- Espace admin : modération ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const a = MG.auth; const { esc, fmtDate } = ui();
    const [{ data: pending }, { data: recent }] = await Promise.all([
      a.client.from("shops").select("id,name,address,kind,sells,website,note,created_at,lat,lon").eq("status", "pending").order("created_at").limit(100),
      a.client.from("restocks").select("id,shop_name,product,set_name,note,created_at").order("created_at", { ascending: false }).limit(30),
    ]);
    el.innerHTML = `
      <section><div class="section-head"><h2>🏪 Boutiques à valider (${(pending || []).length})</h2>
        ${(pending || []).length > 1 ? `<button class="btn ghost" id="approve-all">✓ Tout valider</button>` : ""}</div>
        ${(pending || []).length ? `<div class="mod-list">${pending.map((s) => `
          <div class="mod-item" data-id="${esc(s.id)}">
            <div><b>${esc(s.name)}</b> · ${s.kind === "enseigne" ? "Enseigne" : "Indépendante"}<br>
            <span class="small">${esc(s.address)}</span><br>
            <span class="small muted">${(s.sells || []).map((x) => esc(SELLS[x] || x)).join(", ")}${s.website ? " · " + esc(s.website) : ""}${s.note ? " · " + esc(s.note) : ""}</span><br>
            <a class="small" target="_blank" rel="noopener noreferrer" href="https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=18/${s.lat}/${s.lon}">Vérifier l'emplacement sur la carte</a>
            <span class="small muted"> · proposée le ${esc(fmtDate(s.created_at))}</span></div>
            <div class="row"><button class="btn" data-act="approved">Valider</button><button class="btn ghost" data-act="rejected">Refuser</button></div>
          </div>`).join("")}</div>` : `<p class="muted">Aucune boutique en attente.</p>`}
      </section>
      <section><h2>🔥 Derniers restocks signalés</h2>
        ${(recent || []).length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Boutique</th><th>Produit</th><th>Quand</th><th></th></tr></thead><tbody>
          ${recent.map((r) => `<tr><td>${esc(r.shop_name || "")}</td><td>${esc(r.product)}${r.set_name ? " · " + esc(r.set_name) : ""}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ""}</td><td>${esc(ago(r.created_at))}</td>
          <td><button class="link-btn" data-rdel="${esc(r.id)}">Supprimer</button></td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">Aucun restock pour l'instant.</p>`}
      </section>`;
    el.querySelectorAll(".mod-item [data-act]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".mod-item").dataset.id;
      const { error } = await a.client.from("shops").update({ status: b.dataset.act }).eq("id", id);
      ui().toast(error ? "Erreur" : b.dataset.act === "approved" ? "Boutique validée ✓" : "Boutique refusée");
      if (!error) b.closest(".mod-item").remove();
    }));
    const all = el.querySelector("#approve-all");
    if (all) all.addEventListener("click", async () => {
      if (!confirm("Valider les " + pending.length + " boutiques en attente ?")) return;
      const { error } = await a.client.from("shops").update({ status: "approved" }).in("id", pending.map((p) => p.id));
      ui().toast(error ? "Erreur" : "Boutiques validées ✓");
      if (!error) el.querySelectorAll(".mod-item").forEach((x) => x.remove());
    });
    el.querySelectorAll("[data-rdel]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer ce restock ?")) return;
      const { error } = await a.client.from("restocks").delete().eq("id", b.dataset.rdel);
      if (!error) b.closest("tr").remove();
    }));
  });

  // Libère la carte quand on quitte la page
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/boutiques") && S.map) {
      try { S.map.remove(); } catch (e) { /* rien */ }
      S.map = null; userMarker = null; S.markers.clear();
    }
  });
})(window.MG);
