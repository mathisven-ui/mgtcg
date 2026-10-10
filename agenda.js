/* ==========================================================
   MGTCG — agenda.js   (V2)
   Agenda : sorties de produits (France + Japon), avant-premières,
   conventions et tournois, avec carte, trajet, coût et ajout
   à son propre agenda (.ics).
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const KINDS = {
    sortie: { label: "Sortie France", icon: "🇫🇷", cls: "k-sortie" },
    "sortie-jp": { label: "Sortie Japon", icon: "🇯🇵", cls: "k-jp" },
    "avant-premiere": { label: "Avant-première", icon: "⭐", cls: "k-ap" },
    convention: { label: "Convention / salon", icon: "🎪", cls: "k-conv" },
    tournoi: { label: "Tournoi", icon: "🏆", cls: "k-tournoi" },
    autre: { label: "Événement", icon: "📌", cls: "k-autre" },
  };
  const FILTERS = [["all", "Tout"], ["sorties", "Sorties"], ["convention", "Conventions"], ["tournoi", "Tournois"]];

  const S = { events: [], filter: "all", map: null, markers: new Map(), selected: null, user: null, past: false };
  const ui = () => MG.ui;
  const auth = () => MG.auth;

  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const dayFr = (d, o) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", o || { weekday: "short", day: "numeric", month: "long" });
  const monthFr = (d) => { const s = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); };
  const daysUntil = (d) => Math.round((new Date(d + "T12:00:00") - new Date(today() + "T12:00:00")) / 86400000);
  const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : "");

  /* ---------------- Données ---------------- */
  async function load() {
    const a = auth();
    if (!a || !a.enabled) return false;
    const from = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await a.client.from("events")
      .select("id,kind,title,start_date,end_date,city,address,lat,lon,url,description,source,confirmed,status,created_by")
      .gte("start_date", from).order("start_date", { ascending: true }).limit(1000);
    if (error) return false;
    S.events = (data || []).filter((e) => e.status === "approved");
    return true;
  }

  // Sorties récentes ou annoncées connues de la base de cartes (TCGdex)
  async function tcgdexReleases() {
    const out = [];
    const t = today();
    const recent = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
    for (const [lang, kind] of [["fr", "sortie"], ["ja", "sortie-jp"]]) {
      try {
        const series = await MG.api.series(lang);
        const last = series.slice(-2); // les 2 séries les plus récentes suffisent
        for (const s of last) {
          const serie = await MG.api.serie(lang, s.id);
          for (const set of (serie.sets || []).slice(-6)) {
            let full;
            try { full = await MG.api.set(lang, set.id); } catch (e) { continue; }
            const d = (full.releaseDate || "").slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
            if (d < recent) continue;
            const jpOut = lang === "ja" && d <= t;
            out.push({
              id: "tcgdex-" + lang + "-" + set.id, kind, title: full.name + (lang === "ja" ? " (Japon)" : ""), start_date: d,
              setId: set.id, setLang: lang, auto: true, jpOut,
              description: jpOut ? "Déjà sortie au Japon : ses cartes arrivent souvent en France quelques mois plus tard, dans une extension française." : null,
              source: "base de cartes TCGdex",
            });
          }
        }
      } catch (e) { /* base de cartes indisponible : on continue */ }
    }
    return out;
  }

  /* ---------------- Page ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.agenda = async function () {
    const { view, loading, esc } = ui();
    view().innerHTML = loading("Chargement de l'agenda…");
    S.selected = null;
    const ok = await load();
    S.auto = [];
    const a = auth();

    view().innerHTML = `
      <header class="page-head"><div>
        <h1>📅 Agenda</h1>
        <p class="muted">Les prochaines sorties de cartes et de produits (France et Japon), les avant-premières et les conventions en France, avec trajet et coût pour y aller.</p>
      </div></header>

      <div class="toolbar static">
        <div class="chips" id="ag-f">${FILTERS.map(([k, l]) => `<button class="chip ${S.filter === k ? "active" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
        <button class="btn ghost" id="ag-near">📍 Trier par distance</button>
        <label class="check small"><input type="checkbox" id="ag-past" ${S.past ? "checked" : ""}> Afficher les événements passés</label>
        ${a && a.user ? `<button class="btn" id="ag-add">＋ Proposer un événement</button>` : ""}
      </div>

      ${ok ? "" : `<p class="warn">L'agenda des conventions arrive dès que la base de données est prête (admin : lance <code>supabase-agenda.sql</code>). En attendant, voici les sorties connues de la base de cartes.</p>`}

      <div class="agenda-layout">
        <div id="ag-list" class="ag-list"></div>
        <aside class="ag-side">
          <div class="map-wrap"><div id="ag-map" class="map ag-map"></div><button class="map-3d" id="ag-3d">3D</button></div>
          <div id="ag-detail" class="ag-detail"><p class="muted small">Clique sur une convention (liste ou carte) pour voir le trajet et le coût pour y aller.</p></div>
        </aside>
      </div>
      <p class="disclaimer">Sources : calendriers de sorties de boutiques françaises (lebooster.fr, jollycards.fr), agenda des conventions (tobiocards.com), base de cartes TCGdex, et propositions des membres validées par l'admin. Les dates peuvent changer : vérifie toujours sur le site officiel avant de te déplacer. Les sorties japonaises marquées « rumeur » ne sont pas encore confirmées par Pokémon.</p>`;

    document.querySelectorAll("#ag-f [data-f]").forEach((b) => b.addEventListener("click", () => {
      S.filter = b.dataset.f;
      document.querySelectorAll("#ag-f [data-f]").forEach((x) => x.classList.toggle("active", x === b));
      renderList(); renderMarkers();
    }));
    document.getElementById("ag-past").addEventListener("change", (e) => { S.past = e.target.checked; renderList(); renderMarkers(); });
    document.getElementById("ag-near").addEventListener("click", locate);
    const add = document.getElementById("ag-add");
    if (add) add.addEventListener("click", openPropose);

    renderList();
    initMap();
    // Sorties connues de la base de cartes (chargées en arrière-plan)
    tcgdexReleases().then((auto) => {
      const titles = S.events.map((e) => e.title.toLowerCase());
      const seen = new Set();
      S.auto = auto.filter((x) => !seen.has(x.id) && seen.add(x.id) && !titles.some((t) => t.includes(x.title.toLowerCase().replace(" (japon)", ""))));
      if (document.getElementById("ag-list")) renderList();
    });
  };

  function visible() {
    const t = today();
    let list = [...S.events, ...(S.auto || [])];
    if (!S.past) list = list.filter((e) => e.jpOut || (e.end_date || e.start_date) >= t);
    if (S.filter === "sorties") list = list.filter((e) => ["sortie", "sortie-jp", "avant-premiere"].includes(e.kind));
    else if (S.filter !== "all") list = list.filter((e) => e.kind === S.filter);
    if (S.sortByDistance && S.user) {
      const d = (e) => (e.lat != null ? MG.trajet.haversine(S.user, e) : Infinity);
      list.sort((x, y) => d(x) - d(y) || (x.start_date < y.start_date ? -1 : 1));
    } else list.sort((x, y) => (x.start_date < y.start_date ? -1 : x.start_date > y.start_date ? 1 : 0));
    return list;
  }

  function renderList() {
    const el = document.getElementById("ag-list");
    if (!el) return;
    const { esc } = ui();
    const list = visible();
    if (!list.length) { el.innerHTML = `<div class="state"><p>Aucun événement à afficher.</p></div>`; return; }
    let month = "";
    el.innerHTML = list.map((e) => {
      const k = KINDS[e.kind] || KINDS.autre;
      const m = S.sortByDistance ? "" : monthFr(e.start_date);
      const head = m && m !== month ? `<h2 class="ag-month">${esc(m)}</h2>` : "";
      if (m) month = m;
      const n = daysUntil(e.start_date);
      const soon = n >= 0 && n <= 14 ? `<span class="ag-soon">${n === 0 ? "aujourd'hui" : n === 1 ? "demain" : "dans " + n + " j"}</span>` : "";
      const dist = S.user && e.lat != null ? `<span class="ag-dist">📍 ${MG.trajet.km(MG.trajet.haversine(S.user, e))}</span>` : "";
      const url = safeUrl(e.url);
      return `${head}<article class="ag-item ${e.lat != null ? "has-map" : ""} ${S.selected === e.id ? "sel" : ""}" data-id="${esc(e.id)}">
        <div class="ag-date"><b>${esc(new Date(e.start_date + "T12:00:00").getDate())}</b><span>${esc(new Date(e.start_date + "T12:00:00").toLocaleDateString("fr-FR", { month: "short" }))}</span></div>
        <div class="ag-main">
          <div class="ag-tags"><span class="ag-kind ${k.cls}">${k.icon} ${esc(e.jpOut ? "Déjà sortie au Japon" : k.label)}</span>${e.confirmed === false ? `<span class="ag-rumeur">rumeur</span>` : ""}${soon}${dist}</div>
          <b class="ag-title">${esc(e.title)}</b>
          <span class="muted small">${esc(dayFr(e.start_date))}${e.end_date && e.end_date !== e.start_date ? " → " + esc(dayFr(e.end_date)) : ""}${e.city ? " · " + esc(e.city) : ""}</span>
          ${e.description ? `<span class="small">${esc(e.description)}</span>` : ""}
          <div class="ag-actions">
            ${e.lat != null ? `<button class="link-btn accent-link" data-go="${esc(e.id)}">🚗 Trajet et coût</button>` : ""}
            ${e.auto ? `<a class="accent-link small" href="#/set/${encodeURIComponent(e.setId)}/${encodeURIComponent(e.setLang)}">Voir les cartes</a> · <a class="accent-link small" href="#/scelles/set/${encodeURIComponent(e.setId)}">Produits scellés</a>` : ""}
            ${url ? `<a class="accent-link small" target="_blank" rel="noopener noreferrer" href="${esc(url)}">Site officiel ↗</a>` : ""}
            ${!e.auto ? `<button class="link-btn small" data-ics="${esc(e.id)}">📅 Ajouter à mon agenda</button>` : ""}
            ${!e.auto && auth() && auth().isAdmin && auth().isAdmin() ? `<button class="link-btn small" data-del="${esc(e.id)}">Supprimer (admin)</button>` : ""}
          </div>
          ${e.source ? `<span class="muted tiny">Source : ${esc(e.source)}</span>` : ""}
        </div>
      </article>`;
    }).join("");
    el.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => select(b.dataset.go, true)));
    el.querySelectorAll("[data-ics]").forEach((b) => b.addEventListener("click", () => downloadIcs(S.events.find((x) => x.id === b.dataset.ics))));
    el.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer cet événement ?")) return;
      const { error } = await auth().client.from("events").delete().eq("id", b.dataset.del);
      ui().toast(error ? "Erreur" : "Supprimé");
      if (!error) { S.events = S.events.filter((x) => x.id !== b.dataset.del); renderList(); renderMarkers(); }
    }));
  }

  /* ---------------- Carte ---------------- */
  async function initMap() {
    try { await MG.trajet.loadMapLibre(); } catch (e) { const m = document.getElementById("ag-map"); if (m) m.innerHTML = `<p class="muted small" style="padding:20px">Carte indisponible.</p>`; return; }
    if (!document.getElementById("ag-map")) return;
    if (S.map) { try { S.map.remove(); } catch (e) { /* rien */ } }
    S.map = new maplibregl.Map({ container: "ag-map", style: MG.trajet.MAP_STYLE, center: [2.4, 46.6], zoom: 4.6, pitch: 0, attributionControl: { compact: true } });
    S.map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    S.map.on("load", () => {
      S.map.addSource("ag-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      S.map.addLayer({ id: "ag-route", type: "line", source: "ag-route", paint: { "line-color": "#ffcb05", "line-width": 4 }, layout: { "line-cap": "round", "line-join": "round" } });
    });
    document.getElementById("ag-3d").addEventListener("click", (e) => {
      const flat = S.map.getPitch() < 10;
      S.map.easeTo({ pitch: flat ? 55 : 0, duration: 600 });
      e.target.textContent = flat ? "2D" : "3D";
    });
    renderMarkers();
  }

  function renderMarkers() {
    if (!S.map || !window.maplibregl) return;
    for (const m of S.markers.values()) m.remove();
    S.markers.clear();
    for (const e of visible()) {
      if (e.lat == null || e.lon == null) continue;
      const el = document.createElement("button");
      el.className = "mk ev " + ((KINDS[e.kind] || KINDS.autre).cls) + (S.selected === e.id ? " sel" : "");
      el.title = e.title + " — " + dayFr(e.start_date);
      el.setAttribute("aria-label", e.title);
      el.textContent = (KINDS[e.kind] || KINDS.autre).icon;
      el.addEventListener("click", (ev) => { ev.stopPropagation(); select(e.id, false); });
      S.markers.set(e.id, new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]).addTo(S.map));
    }
  }

  function select(id, fly) {
    const e = S.events.find((x) => x.id === id);
    if (!e) return;
    S.selected = id;
    for (const [k, m] of S.markers) m.getElement().classList.toggle("sel", k === id);
    document.querySelectorAll(".ag-item").forEach((x) => x.classList.toggle("sel", x.dataset.id === id));
    if (S.map && e.lat != null) S.map.flyTo({ center: [e.lon, e.lat], zoom: fly ? 9 : Math.max(S.map.getZoom(), 7), duration: 900 });
    const item = document.querySelector(`.ag-item[data-id="${CSS.escape(id)}"]`);
    if (item && !fly) item.scrollIntoView({ behavior: "smooth", block: "nearest" });
    renderDetail(e);
    if (window.innerWidth < 860) document.getElementById("ag-detail").scrollIntoView({ behavior: "smooth" });
  }

  let mode = "car";
  function renderDetail(e) {
    const box = document.getElementById("ag-detail");
    if (!box) return;
    const { esc } = ui();
    const T = MG.trajet;
    box.innerHTML = `
      <p class="eyebrow">${esc((KINDS[e.kind] || KINDS.autre).label)}</p>
      <h3 style="margin-top:0">${esc(e.title)}</h3>
      <p class="small">${esc(dayFr(e.start_date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }))}${e.end_date && e.end_date !== e.start_date ? " → " + esc(dayFr(e.end_date, { weekday: "long", day: "numeric", month: "long" })) : ""}<br>📍 ${esc(e.address || e.city || "")}</p>
      <div class="modes">${Object.entries(T.MODES).map(([k, m]) => `<button class="mode ${mode === k ? "active" : ""}" data-mode="${k}">${m.icon}<span>${m.label}</span></button>`).join("")}</div>
      <div id="ag-trip" class="trip"></div>
      ${T.tripSettingsHTML()}`;
    box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.mode; renderDetail(e); }));
    T.bindTripSettings(box, () => runTrip(e));
    runTrip(e);
  }

  function locate() {
    if (!navigator.geolocation) { ui().toast("Localisation non disponible"); return; }
    ui().toast("📍 Recherche de ta position…");
    navigator.geolocation.getCurrentPosition((pos) => {
      S.user = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      S.sortByDistance = true;
      renderList();
      if (S.selected) { const e = S.events.find((x) => x.id === S.selected); if (e) renderDetail(e); }
    }, () => ui().toast("Position refusée"), { timeout: 8000, maximumAge: 300000 });
  }

  let tripId = 0;
  async function runTrip(e) {
    const box = document.getElementById("ag-trip");
    if (!box) return;
    const T = MG.trajet;
    if (!S.user) {
      box.innerHTML = `<p class="muted small">Pour calculer le trajet, indique ta position.</p><button class="btn ghost" id="ag-loc">📍 Me localiser</button>`;
      box.querySelector("#ag-loc").addEventListener("click", () => {
        navigator.geolocation && navigator.geolocation.getCurrentPosition((pos) => { S.user = { lat: pos.coords.latitude, lon: pos.coords.longitude }; renderList(); runTrip(e); },
          () => ui().toast("Position refusée"), { timeout: 8000, maximumAge: 300000 });
      });
      return;
    }
    const id = ++tripId;
    const points = [S.user, { lat: e.lat, lon: e.lon }];
    box.innerHTML = `<p class="muted small">Calcul du trajet…</p>`;
    try {
      const t = await T.computeTrip(mode, points);
      if (id !== tripId) return;
      const src = S.map && S.map.getSource("ag-route");
      if (src) {
        src.setData({ type: "Feature", geometry: t.geometry, properties: {} });
        const c = t.geometry.coordinates;
        const b = c.reduce((bb, p) => bb.extend(p), new maplibregl.LngLatBounds(c[0], c[0]));
        S.map.fitBounds(b, { padding: 40, duration: 900 });
      }
      const ar = T.settings.ar;
      box.innerHTML = `<div class="trip-stats">
          <div><span>Durée${ar ? " A/R" : ""}</span><strong>${T.dur(t.duration)}</strong></div>
          <div><span>Distance${ar ? " A/R" : ""}</span><strong>${T.km(t.distance)}</strong></div>
          <div><span>${mode === "car" ? "Carburant" : mode === "transit" ? "Billets (estim.)" : "Coût"}</span><strong>${t.cost ? "≈ " + T.euro(t.cost) : "Gratuit"}</strong></div>
        </div>
        ${mode === "transit" ? `<p class="muted small">Estimation simple (tarif moyen). Pour un long trajet, compare les prix du train.</p>` : ""}
        ${mode === "car" ? `<p class="muted small">Hors péages et parking.</p>` : ""}
        <a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${T.gmapsLink(mode, points)}">🧭 Lancer le GPS (Google Maps)</a>`;
    } catch (err) {
      if (id !== tripId) return;
      box.innerHTML = `<p class="muted small">Itinéraire indisponible pour le moment.</p><a class="btn ghost" target="_blank" rel="noopener noreferrer" href="${T.gmapsLink(mode, points)}">Ouvrir dans Google Maps</a>`;
    }
  }

  /* ---------------- Ajouter à son agenda (.ics) ---------------- */
  function downloadIcs(e) {
    if (!e) return;
    const d = (s) => s.replace(/-/g, "");
    const end = new Date((e.end_date || e.start_date) + "T12:00:00"); end.setDate(end.getDate() + 1);
    const endStr = end.getFullYear() + String(end.getMonth() + 1).padStart(2, "0") + String(end.getDate()).padStart(2, "0");
    const clean = (s) => String(s || "").replace(/[\\;,]/g, (c) => "\\" + c).replace(/\n/g, " ");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MGTCG//Agenda//FR", "BEGIN:VEVENT",
      "UID:" + e.id + "@mgtcg", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;VALUE=DATE:" + d(e.start_date), "DTEND;VALUE=DATE:" + endStr,
      "SUMMARY:" + clean(e.title), "LOCATION:" + clean(e.address || e.city || ""),
      "DESCRIPTION:" + clean((e.description || "") + (safeUrl(e.url) ? " " + e.url : "") + " (via MGTCG)"),
      "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    a.download = "mgtcg-" + e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) + ".ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------------- Proposer un événement ---------------- */
  function openPropose() {
    const a = auth();
    const admin = a.isAdmin && a.isAdmin();
    const { $ } = ui();
    $("#modal-body").innerHTML = `
      <h2 id="modal-title">${admin ? "Ajouter un événement" : "Proposer un événement"}</h2>
      ${admin ? "" : `<p class="muted small">Il sera vérifié par l'administrateur avant d'apparaître dans l'agenda.</p>`}
      <form id="f-ev" class="form">
        <label>Type<select name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join("")}</select></label>
        <label>Nom de l'événement<input name="title" required minlength="3" maxlength="140" placeholder="ex : Tournoi Pokémon – Boutique X"></label>
        <div class="row">
          <label class="grow">Date de début<input type="date" name="start" required></label>
          <label class="grow">Date de fin (optionnel)<input type="date" name="end"></label>
        </div>
        <label>Lieu / adresse (pour les conventions et tournois)<input name="address" maxlength="200" placeholder="ex : Parc des expositions, 69680 Chassieu"></label>
        <label>Site officiel (optionnel)<input name="url" type="url" maxlength="400" placeholder="https://…"></label>
        <label>Infos (optionnel)<input name="description" maxlength="500"></label>
        <p class="form-msg" id="ev-msg" role="alert"></p>
        <button class="btn full" type="submit">${admin ? "Ajouter" : "Envoyer"}</button>
      </form>`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    const form = $("#f-ev");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const msg = $("#ev-msg");
      const err = (t) => { msg.textContent = t; msg.className = "form-msg err"; };
      const title = String(f.get("title") || "").trim(), start = String(f.get("start") || ""), end = String(f.get("end") || "");
      const url = String(f.get("url") || "").trim(), address = String(f.get("address") || "").trim();
      if (title.length < 3 || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return err("Indique au moins le nom et la date.");
      if (end && end < start) return err("La date de fin doit être après la date de début.");
      if (url && !/^https?:\/\//i.test(url)) return err("Le site doit commencer par https://");
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      let lat = null, lon = null, city = null;
      if (address) {
        msg.textContent = "Recherche de l'adresse…"; msg.className = "form-msg ok";
        try {
          const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fr&countrycodes=fr,be,ch,lu,mc&q=" + encodeURIComponent(address));
          const j = await r.json();
          if (j[0]) { lat = parseFloat(j[0].lat); lon = parseFloat(j[0].lon); }
        } catch (e) { /* sans coordonnées, l'événement s'affiche quand même */ }
        city = address.slice(0, 120);
      }
      const kind = KINDS[f.get("kind")] ? f.get("kind") : "autre";
      const { error } = await a.client.from("events").insert({
        kind, title: title.slice(0, 140), start_date: start, end_date: end || null, city, address: address || null, lat, lon,
        url: url || null, description: String(f.get("description") || "").trim().slice(0, 500) || null,
        source: admin ? "MGTCG" : "Proposé par un membre", status: admin ? "approved" : "pending", created_by: a.user.id,
      });
      btn.disabled = false;
      if (error) return err(/limite/i.test(error.message || "") ? error.message : "Impossible d'envoyer. Réessaie.");
      $("#modal-body").innerHTML = `<div class="state"><p>✅ ${admin ? "Événement ajouté." : "Merci ! Ta proposition a été envoyée."}</p></div>`;
      if (admin) { await load(); renderList(); renderMarkers(); }
    });
  }

  /* ---------------- Espace admin : événements à valider ---------------- */
  MG.adminSections = MG.adminSections || [];
  MG.adminSections.push(async function (el) {
    const { esc } = ui();
    const a = auth();
    const { data, error } = await a.client.from("events").select("id,kind,title,start_date,end_date,city,address,url,description").eq("status", "pending").order("start_date").limit(100);
    if (error) throw error;
    el.innerHTML = `<section><h2>📅 Événements à valider (${data.length})</h2>
      ${data.length ? `<div class="mod-list">${data.map((e) => `<div class="mod-item" data-id="${esc(e.id)}">
        <div><b>${esc(e.title)}</b> · ${esc((KINDS[e.kind] || KINDS.autre).label)}<br>
        <span class="small">${esc(e.start_date)}${e.end_date ? " → " + esc(e.end_date) : ""}${e.address ? " · " + esc(e.address) : ""}</span><br>
        <span class="small muted">${e.description ? esc(e.description) : ""}${safeUrl(e.url) ? ` · <a target="_blank" rel="noopener noreferrer" href="${esc(e.url)}">site</a>` : ""}</span></div>
        <div class="row"><button class="btn" data-act="approved">Valider</button><button class="btn ghost" data-act="rejected">Refuser</button></div></div>`).join("")}</div>`
      : `<p class="muted">Aucun événement en attente.</p>`}</section>`;
    el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest(".mod-item").dataset.id;
      const { error: err } = await a.client.from("events").update({ status: b.dataset.act }).eq("id", id);
      ui().toast(err ? "Erreur" : b.dataset.act === "approved" ? "Événement validé ✓" : "Événement refusé");
      if (!err) b.closest(".mod-item").remove();
    }));
  });

  // Libère la carte quand on quitte la page
  window.addEventListener("hashchange", () => {
    if (!location.hash.startsWith("#/agenda") && S.map) { try { S.map.remove(); } catch (e) { /* rien */ } S.map = null; S.markers.clear(); }
  });
})(window.MG);
