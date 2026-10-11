/* ==========================================================
   MGTCG — notifs.js   (après la V3 : notifications)
   Cloche 🔔 en haut du site : alertes de prix déclenchées,
   propositions d'échange (reçues, acceptées, refusées…), rendez-vous
   proches, commentaires d'avis validés, et pour l'admin les éléments
   à valider. Option : notifications de l'appareil (quand MGTCG est
   ouvert ou installé comme appli).
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const SEEN = "mgtcg:notifs-vues", SENT = "mgtcg:notifs-envoyees", OPT = "mgtcg:notifs-appareil";
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* rien */ } };
  const enc = encodeURIComponent;
  let items = [];
  let busy = false;

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const seen = () => new Set(read(SEEN, []));

  /* ---------------- Collecte ---------------- */
  async function collect() {
    const out = [];
    const { eur } = ui();
    // 1) Alertes de prix
    for (const h of MG.store.triggeredAlerts()) {
      out.push({ id: `alerte:${h.key}:${h.below}`, icon: "📉", text: `${h.meta.name || "Une carte"} est à ${eur(h.now)} (ton alerte : moins de ${eur(h.below)})`, href: `#/carte/${enc(h.key)}`, date: "" });
    }
    const a = auth();
    if (!a || !a.enabled || !a.user) return out;
    const uid = a.user.id, c = a.client;
    const today = new Date().toISOString().slice(0, 10);
    // 2) Échanges
    const [recv, sent] = await Promise.all([
      c.from("trade_offers").select("id,from_user,to_user,status,meet_date,slot,place_name,updated_at,created_at").eq("to_user", uid).order("created_at", { ascending: false }).limit(50),
      c.from("trade_offers").select("id,from_user,to_user,status,meet_date,slot,place_name,updated_at,created_at").eq("from_user", uid).order("created_at", { ascending: false }).limit(50),
    ]);
    const offers = [...((recv && recv.data) || []), ...((sent && sent.data) || [])];
    if (offers.length) {
      const ids = [...new Set(offers.map((o) => (o.from_user === uid ? o.to_user : o.from_user)))];
      const { data: ls } = await c.from("trade_lists").select("user_id,pseudo").in("user_id", ids);
      const ps = new Map(((ls) || []).map((l) => [l.user_id, l.pseudo]));
      const who = (o) => ps.get(o.from_user === uid ? o.to_user : o.from_user) || "Un membre";
      for (const o of offers) {
        const mine = o.from_user === uid;
        const day = (o.updated_at || o.created_at || "").slice(0, 10);
        if (!mine && o.status === "pending") out.push({ id: `offre:${o.id}`, icon: "🔄", text: `${who(o)} te propose un échange`, href: "#/echanges/offres", date: day });
        if (mine && ["accepted", "declined", "countered"].includes(o.status)) {
          const t = { accepted: "a accepté ta proposition d'échange 🎉", declined: "a refusé ta proposition d'échange", countered: "t'a fait une contre-proposition" }[o.status];
          out.push({ id: `offre:${o.id}:${o.status}`, icon: o.status === "accepted" ? "🤝" : "🔄", text: `${who(o)} ${t}`, href: "#/echanges/offres", date: day });
        }
        if (o.status === "accepted" && o.meet_date >= today) {
          const diff = Math.round((new Date(o.meet_date) - new Date(today)) / 864e5);
          if (diff <= 2) out.push({ id: `rdv:${o.id}:${o.meet_date}`, icon: "📍", text: `Rendez-vous d'échange ${diff === 0 ? "aujourd'hui" : diff === 1 ? "demain" : "après-demain"} avec ${who(o)} : ${o.place_name || "lieu public"}`, href: "#/echanges/offres", date: o.meet_date });
        }
      }
    }
    // 3) Commentaires d'avis validés
    let revs = null;
    const rp = await c.rpc("mes_avis_publies");
    if (rp && !rp.error) revs = rp.data;
    else { const old = await c.from("reviews").select("id,target_name,comment_ok,updated_at").eq("created_by", uid).eq("comment_ok", true).limit(50); revs = old && old.data; }
    for (const r of revs || []) out.push({ id: `avis:${r.id}`, icon: "💬", text: `Ton commentaire sur « ${r.target_name} » a été publié`, href: "#/communaute", date: (r.updated_at || "").slice(0, 10) });
    // 4) Admin : éléments à valider
    if (a.isAdmin && a.isAdmin()) {
      const pend = (t, col = "status", val = "pending") => c.from(t).select("id").eq(col, val).limit(100).then((r) => (r && r.data ? r.data.length : 0), () => 0);
      const counts = await Promise.all([pend("shops"), pend("events"), pend("products"), pend("news"), pend("scam_alerts"), pend("trade_reports", "handled", false),
        c.rpc("avis_a_valider").then((r) => (r && r.data ? r.data.length : 0), () => 0)]);
      const n = counts.reduce((t, x) => t + x, 0);
      if (n) out.push({ id: `admin:${counts.join("-")}`, icon: "👑", text: `${n} élément${n > 1 ? "s" : ""} à valider dans l'espace admin`, href: "#/admin", date: today });
    }
    return out;
  }

  /* ---------------- Affichage ---------------- */
  function bell() { return document.getElementById("bell"); }
  function badge() {
    const b = bell();
    if (!b) return;
    const s = seen();
    const n = items.filter((i) => !s.has(i.id)).length;
    const el = b.querySelector(".bell-n");
    el.textContent = n > 9 ? "9+" : String(n);
    el.hidden = !n;
    b.setAttribute("aria-label", n ? `Notifications : ${n} nouvelle${n > 1 ? "s" : ""}` : "Notifications");
  }
  function panel() {
    const { esc, fmtDate } = ui();
    let p = document.getElementById("notif-panel");
    if (!p) { p = document.createElement("div"); p.id = "notif-panel"; p.className = "notif-panel"; p.setAttribute("role", "dialog"); p.setAttribute("aria-label", "Notifications"); document.body.appendChild(p); }
    const s = seen();
    const supported = "Notification" in window;
    const on = supported && Notification.permission === "granted" && read(OPT, false);
    p.innerHTML = `
      <div class="np-head"><b>🔔 Notifications</b><button class="link-btn small" id="np-close" aria-label="Fermer">✕</button></div>
      ${items.length ? `<ul class="np-list">${items.map((i) => `<li class="${s.has(i.id) ? "" : "new"}"><a href="${esc(i.href)}"><span class="np-ico">${i.icon}</span><span class="np-t">${esc(i.text)}${i.date ? `<small class="muted">${esc(fmtDate(i.date))}</small>` : ""}</span></a></li>`).join("")}</ul>`
        : `<p class="muted small np-empty">Rien de nouveau pour l'instant.${auth() && auth().user ? "" : " Connecte-toi pour être prévenu des échanges et de tes avis."}</p>`}
      <div class="np-foot">
        ${supported ? `<label class="check"><input type="checkbox" id="np-device" ${on ? "checked" : ""}> Notifications sur cet appareil</label>
        <p class="muted small">Elles s'affichent quand MGTCG est ouvert ou installé comme appli (vérification toutes les 5 minutes).</p>` : `<p class="muted small">Ton navigateur ne gère pas les notifications de l'appareil.</p>`}
      </div>`;
    p.hidden = false;
    // Tout est vu une fois la liste ouverte
    write(SEEN, [...new Set([...s, ...items.map((i) => i.id)])].slice(-500));
    setTimeout(badge, 50);
    p.querySelector("#np-close").addEventListener("click", close);
    p.querySelectorAll("a").forEach((x) => x.addEventListener("click", close));
    const dev = p.querySelector("#np-device");
    if (dev) dev.addEventListener("change", async () => {
      if (dev.checked) {
        const r = await Notification.requestPermission();
        if (r !== "granted") { dev.checked = false; ui().toast("Autorisation refusée par le navigateur"); return; }
        write(OPT, true);
        write(SENT, items.map((i) => i.id)); // on ne renvoie pas les anciennes
        ui().toast("Notifications activées sur cet appareil ✓");
      } else write(OPT, false);
    });
  }
  function close() { const p = document.getElementById("notif-panel"); if (p) p.hidden = true; }

  async function system(newOnes) {
    if (!newOnes.length || !("Notification" in window) || Notification.permission !== "granted" || !read(OPT, false)) return;
    const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration().catch(() => null) : null;
    for (const i of newOnes.slice(0, 3)) {
      const opts = { body: MG.t ? MG.t(i.text) : i.text, icon: "icone-192.png", badge: "icone-192.png", tag: i.id, data: { href: i.href } };
      try { if (reg && reg.showNotification) await reg.showNotification("MGTCG " + i.icon, opts); else new Notification("MGTCG " + i.icon, opts).onclick = () => { window.focus(); location.hash = i.href; }; }
      catch (e) { /* pas grave */ }
    }
  }

  async function refresh() {
    if (busy || !MG.ui || !MG.store) return;
    busy = true;
    try {
      items = await collect();
      const sent = new Set(read(SENT, []));
      const s = seen();
      const fresh = items.filter((i) => !sent.has(i.id) && !s.has(i.id));
      if (fresh.length) { write(SENT, [...sent, ...fresh.map((i) => i.id)].slice(-500)); system(fresh); }
      badge();
      const p = document.getElementById("notif-panel");
      if (p && !p.hidden) panel();
    } catch (e) { /* tables pas encore créées : on ignore */ }
    busy = false;
  }

  function mount() {
    const acc = document.getElementById("account");
    if (!acc || bell()) return;
    const b = document.createElement("button");
    b.id = "bell"; b.className = "bell"; b.type = "button"; b.setAttribute("aria-label", "Notifications");
    b.innerHTML = `🔔<span class="bell-n" hidden></span>`;
    acc.parentNode.insertBefore(b, acc);
    b.addEventListener("click", (e) => { e.stopPropagation(); const p = document.getElementById("notif-panel"); if (p && !p.hidden) close(); else panel(); });
    document.addEventListener("click", (e) => { const p = document.getElementById("notif-panel"); if (p && !p.hidden && !p.contains(e.target) && e.target !== b) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    if (MG.on) { MG.on("auth", refresh); MG.on("alerts", refresh); }
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
    setInterval(refresh, 5 * 60 * 1000);
    setTimeout(refresh, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();

  MG.notifs = { refresh, collect };
})(window.MG);
