/* ==========================================================
   MGTCG — widget.js   (V3 : widgets pour créateurs de contenu)
   Petit cadre à intégrer sur un blog, un site ou un live (OBS) :
   prix Cardmarket d'une carte, ou profil public d'un membre.
   Paramètres : widget.html?type=carte&k=fr|sv03.5-199&theme=sombre&cur=EUR&taille=compact
                widget.html?type=profil&pseudo=Sacha_75&theme=clair
   Créé par Mathis GILLIG.
   ========================================================== */
(function () {
  "use strict";

  const P = new URLSearchParams(location.search);
  const type = P.get("type") === "profil" ? "profil" : "carte";
  const theme = ["clair", "transparent"].includes(P.get("theme")) ? P.get("theme") : "sombre";
  const big = P.get("taille") === "grand";
  const CURS = ["EUR", "USD", "GBP", "CHF", "CAD", "JPY"];
  const cur = CURS.includes(P.get("cur")) ? P.get("cur") : "EUR";
  const KEY_RE = /^([a-z-]{2,6})\|([A-Za-z0-9._-]{1,50})$/;
  const PSEUDO_RE = /^[A-Za-z0-9_-]{3,20}$/;
  const SITE = location.href.replace(/widget\.html.*$/, "");
  const root = document.getElementById("w");
  document.documentElement.className = theme;
  if (big) root.classList.add("grand");

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeImg = (u) => (/^https:\/\/assets\.tcgdex\.net\/[\w./-]+$/.test(u || "") ? u : "");
  const fail = (t) => { root.innerHTML = `<div class="msg">${esc(t)}</div>`; };
  const foot = `<div class="foot">via <b>MG<span>TCG</span></b> · prix Cardmarket indicatifs</div>`;

  let rate = 1;
  async function loadRate() {
    if (cur === "EUR") return;
    try {
      const r = await fetch("https://api.frankfurter.app/latest?from=EUR&to=" + cur);
      const d = await r.json();
      const v = d && d.rates && d.rates[cur];
      if (typeof v === "number" && v > 0) rate = v;
    } catch (e) { /* on reste en euros */ }
  }
  const money = (n) => {
    const c = rate !== 1 || cur === "EUR" ? cur : "EUR";
    return (n * (c === "EUR" ? 1 : rate)).toLocaleString("fr-FR", { style: "currency", currency: c, maximumFractionDigits: c === "JPY" ? 0 : 2 });
  };

  async function card() {
    const m = KEY_RE.exec(P.get("k") || "");
    if (!m) return fail("Carte inconnue");
    const [, lang, id] = m;
    let c;
    try { const r = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(id)}`); if (!r.ok) throw 0; c = await r.json(); }
    catch (e) { return fail("Carte indisponible pour le moment"); }
    const cm = (c.pricing && c.pricing.cardmarket) || {};
    const holoOnly = !(cm.trend || cm.avg) && (cm["trend-holo"] || cm["avg-holo"]);
    const price = holoOnly ? (cm["trend-holo"] || cm["avg-holo"]) : (cm.trend || cm.avg);
    const a7 = holoOnly ? cm["avg7-holo"] : cm.avg7, a30 = holoOnly ? cm["avg30-holo"] : cm.avg30;
    const chg = a7 && a30 ? (a7 - a30) / a30 : null;
    const rev = !holoOnly && (cm["trend-holo"] || cm["avg-holo"]);
    const img = safeImg(c.image) ? c.image + (big ? "/high.webp" : "/low.webp") : "";
    root.href = `${SITE}#/carte/${encodeURIComponent(lang + "|" + id)}`;
    root.title = `Voir ${c.name} sur MGTCG`;
    root.innerHTML = `
      ${img ? `<img class="img" src="${esc(img)}" alt="${esc(c.name)}">` : ""}
      <div class="info">
        <div class="name">${esc(c.name)}</div>
        <div class="sub">${esc(c.set ? c.set.name : "")} · #${esc(c.localId)} · ${esc(lang.toUpperCase())}</div>
        <div class="row"><span class="price">${price ? money(price) : "—"}</span>
          ${chg !== null && Math.abs(chg) >= 0.01 ? `<span class="chg ${chg >= 0 ? "up" : "down"}">${chg >= 0 ? "▲ +" : "▼ "}${Math.round(chg * 100)} % <small>(7 j)</small></span>` : ""}</div>
        ${rev ? `<div class="sub">Reverse / holo : ${money(rev)}</div>` : ""}
        ${foot}
      </div>`;
  }

  async function profil() {
    const pseudo = P.get("pseudo") || "";
    const cfg = window.MG && window.MG.config;
    if (!PSEUDO_RE.test(pseudo)) return fail("Profil inconnu");
    if (!cfg || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(cfg.SUPABASE_URL || "")) return fail("Profils indisponibles");
    let p;
    try {
      const r = await fetch(`${cfg.SUPABASE_URL}/rest/v1/public_profiles?select=pseudo,cards,sets_done,langs,badges,showcase&pseudo=eq.${encodeURIComponent(pseudo)}&limit=1`,
        { headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY } });
      p = (await r.json())[0];
    } catch (e) { p = null; }
    if (!p) return fail("Ce profil n'est pas public");
    const keys = (Array.isArray(p.showcase) ? p.showcase : []).filter((k) => KEY_RE.test(k)).slice(0, big ? 6 : 4);
    const imgs = await Promise.all(keys.map(async (k) => {
      const [, lang, id] = KEY_RE.exec(k);
      try { const c = await (await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(id)}`)).json(); return safeImg(c.image) ? { src: c.image + "/low.webp", name: c.name } : null; }
      catch (e) { return null; }
    }));
    root.href = `${SITE}#/profil/${encodeURIComponent(p.pseudo)}`;
    root.title = `Voir le profil de ${p.pseudo} sur MGTCG`;
    root.style.flexDirection = "column";
    root.innerHTML = `
      <div class="name">👤 ${esc(p.pseudo)}</div>
      <div class="stats"><div><b>${Number(p.cards) || 0}</b><span>cartes</span></div><div><b>${Number(p.sets_done) || 0}</b><span>sets complétés</span></div><div><b>${Array.isArray(p.badges) ? p.badges.length : 0}</b><span>badges</span></div></div>
      ${imgs.some(Boolean) ? `<div class="vit">${imgs.filter(Boolean).map((i) => `<img src="${esc(i.src)}" alt="${esc(i.name)}" title="${esc(i.name)}">`).join("")}</div>` : ""}
      ${foot.replace(" · prix Cardmarket indicatifs", " · ma collection Pokémon")}`;
  }

  async function run() { await loadRate(); return type === "profil" ? profil() : card(); }
  run();
  // Pour les lives : mise à jour toute seule toutes les 30 minutes
  setInterval(run, 30 * 60 * 1000);
})();
