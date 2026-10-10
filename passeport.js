/* ==========================================================
   MGTCG — passeport.js   (V3)
   Passeport de chaque carte : état, défauts, carte gradée
   (gradeur, note, certificat), provenance, rangement, notes
   privées et jusqu'à 4 photos personnelles (stockage privé).
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const enc = encodeURIComponent;
  const BUCKET = "passeports";
  const DEFECTS = { coins: "Coins abîmés", bords: "Bords blanchis", surface: "Rayures / surface", centrage: "Mauvais centrage", pli: "Pli", tache: "Tache", dos: "Dos usé", impression: "Défaut d'impression" };
  const COND_HELP = {
    "Mint": "Parfaite, comme sortie du booster.", "Near Mint": "Quasi parfaite, un tout petit défaut à peine visible.",
    "Excellent": "Quelques petits défauts (coins, bords).", "Good": "Usure visible mais carte en bon état général.",
    "Light Played": "Usure nette, petites marques.", "Played": "Très jouée : rayures, coins arrondis.", "Poor": "Abîmée : pli, déchirure, tache.",
  };
  const urls = new Map(); // photo → adresse temporaire (blob:)

  const split = (key) => [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];

  /* ---------------- Photos ---------------- */
  async function compress(file) {
    if (!/^image\//.test(file.type || "image/")) throw new Error("Ce fichier n'est pas une image.");
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (e) {
      src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error("Image illisible (essaie en JPEG ou PNG).")); img.src = URL.createObjectURL(file); });
    }
    const max = 1400, w = src.width, h = src.height, r = Math.min(1, max / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.round(w * r); c.height = Math.round(h * r);
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    let blob = null;
    for (const q of [0.85, 0.75, 0.65, 0.5, 0.4]) {
      blob = await new Promise((res) => c.toBlob(res, "image/jpeg", q));
      if (blob && blob.size <= 580 * 1024) break;
    }
    if (!blob || blob.size > 600 * 1024) throw new Error("Photo trop lourde, même réduite.");
    return blob; // réencodée : les infos cachées (lieu GPS, appareil…) sont retirées
  }
  async function photoURL(path) {
    if (urls.has(path)) return urls.get(path);
    const { data, error } = await auth().client.storage.from(BUCKET).download(path);
    if (error || !data) return "";
    const u = URL.createObjectURL(data);
    urls.set(path, u);
    return u;
  }

  /* ---------------- Liste des passeports ---------------- */
  const R = (MG.routes = MG.routes || {});
  R.passeport = async function (arg) {
    if (arg && arg.includes("|")) return pageCard(arg);
    const { view, esc, eur } = ui();
    const st = MG.store;
    const keys = st.passportKeys();
    const f = ["gradees", "defauts", "photos"].includes(arg) ? arg : "";
    const rows = keys.map((k) => ({ k, p: st.passport(k), m: st.meta(k) || {} })).filter((r) =>
      !f || (f === "gradees" && r.p.grader) || (f === "defauts" && r.p.defects.length) || (f === "photos" && r.p.photos.length));
    const owned = st.ownedKeys();
    const todo = owned.filter((k) => !st.passport(k)).sort((x, y) => (st.priceOf(y) || 0) - (st.priceOf(x) || 0)).slice(0, 8);
    const graded = keys.filter((k) => st.passport(k).grader).length;
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🛂 Passeports de mes cartes</h1>
        <p class="muted">La carte d'identité de tes cartes importantes : état, défauts, certificat de grading, provenance, rangement et tes propres photos. Utile pour une assurance, une revente ou un litige.</p>
      </div></header>
      <div class="imp-stats">
        <div><b>${keys.length}</b><span>passeport${keys.length > 1 ? "s" : ""}</span></div>
        <div><b>${graded}</b><span>carte${graded > 1 ? "s" : ""} gradée${graded > 1 ? "s" : ""}</span></div>
        <div><b>${keys.reduce((t, k) => t + st.passport(k).photos.length, 0)}</b><span>photos</span></div>
      </div>
      ${todo.length ? `<section><h2>💡 Tes cartes les plus chères sans passeport</h2><div class="links">${todo.map((k) => { const m = st.meta(k) || {}; return `<a href="#/passeport/${enc(k)}">${esc(m.name || k)}${st.priceOf(k) ? ` · ${eur(st.priceOf(k))}` : ""}</a>`; }).join("")}</div></section>` : ""}
      <section>
        <div class="chips tool-tabs">
          <a class="chip ${!f ? "active" : ""}" href="#/passeport">Tous</a>
          <a class="chip ${f === "gradees" ? "active" : ""}" href="#/passeport/gradees">🏅 Gradées</a>
          <a class="chip ${f === "defauts" ? "active" : ""}" href="#/passeport/defauts">⚠️ Avec défauts</a>
          <a class="chip ${f === "photos" ? "active" : ""}" href="#/passeport/photos">📷 Avec photos</a>
        </div>
        ${rows.length ? `<div class="table-wrap"><table class="table pp-table"><thead><tr><th>Carte</th><th>État</th><th>Gradée</th><th>Provenance</th><th>Rangement</th><th class="right">📷</th></tr></thead><tbody>
          ${rows.map((r) => `<tr class="clickable" data-k="${esc(r.k)}"><td><b>${esc(r.m.name || r.k)}</b> <span class="muted small">${esc(r.m.setName || "")} #${esc(r.m.localId || "")}</span></td>
            <td>${esc(r.p.cond || "—")}${r.p.defects.length ? ` <span class="muted small">(${r.p.defects.length} défaut${r.p.defects.length > 1 ? "s" : ""})</span>` : ""}</td>
            <td>${r.p.grader ? `${esc(r.p.grader)} ${esc(r.p.grade)}` : "—"}</td><td>${esc(r.p.source || "—")}</td>
            <td>${esc(r.p.storage || "—")}${r.p.place ? ` <span class="muted small">${esc(r.p.place)}</span>` : ""}</td><td class="right">${r.p.photos.length || ""}</td></tr>`).join("")}
        </tbody></table></div>` : `<div class="state"><p>${keys.length ? "Aucun passeport dans cette catégorie." : "Pas encore de passeport. Ouvre une carte de ta collection et clique sur « 🛂 Passeport de la carte »."}</p></div>`}
      </section>`;
    view().querySelectorAll("tr[data-k]").forEach((tr) => tr.addEventListener("click", () => { location.hash = "#/passeport/" + enc(tr.dataset.k); }));
  };

  /* ---------------- Passeport d'une carte ---------------- */
  async function pageCard(key) {
    const { view, loading, esc, eur, fmtDate, toast } = ui();
    const st = MG.store;
    const [lang, id] = split(key);
    view().innerHTML = loading("Chargement du passeport…");
    let card = null;
    try { card = await MG.api.card(lang, id); } catch (e) { card = null; }
    const m = st.meta(key) || {};
    const name = (card && card.name) || m.name || id;
    const img = MG.cardImg((card && card.image) || m.image, "high");
    const owned = st.owned(lang, id) || {};
    const paid = st.paid(key);
    const price = st.priceOf(key);
    const p = st.passport(key) || { cond: "", defects: [], grader: "", grade: "", cert: "", source: "", storage: "", place: "", note: "", photos: [] };
    const PP = MG.PASSPORT;
    const a = auth();
    const canPhoto = a && a.enabled && a.user;
    const grades = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3", "2.5", "2", "1.5", "1"];
    view().innerHTML = `
      <nav class="crumbs"><a href="#/passeport">Passeports</a> › <span>${esc(name)}</span></nav>
      <div class="pp-head">
        <div class="pp-img">${img ? `<img src="${esc(img)}" alt="${esc(name)}">` : ""}</div>
        <div>
          <h1>🛂 ${esc(name)} <span class="flag">${MG.flag(lang, (MG.LANGS.find((x) => x.code === lang) || {}).label || lang)}</span></h1>
          <p class="muted">${esc((card && card.set && card.set.name) || m.setName || "")} · #${esc((card && card.localId) || m.localId || "")}${card && card.rarity ? " · " + esc(card.rarity) : ""}</p>
          <div class="imp-stats pp-stats">
            <div><b>${Object.keys(owned).length ? Object.keys(owned).map((v) => esc(MG.VARIANT_LABELS[v] || v)).join(", ") : "Non possédée"}</b><span>version(s) possédée(s)</span></div>
            <div><b>${paid ? eur(paid.price) : "—"}</b><span>prix d'achat${paid && paid.date ? " (" + esc(fmtDate(paid.date)) + ")" : ""}</span></div>
            <div><b>${price ? eur(price) : "—"}</b><span>cote actuelle (carte brute)</span></div>
          </div>
          <p><button class="btn ghost" id="pp-card">Ouvrir la fiche de la carte</button> ${p.updated ? `<span class="muted small">Passeport mis à jour le ${esc(fmtDate(p.updated))}</span>` : ""}</p>
        </div>
      </div>

      <form id="pp-form" class="pp-form">
        <section class="tool-card">
          <h2>🔍 État</h2>
          <div class="sh-grid">
            <label>État de la carte<select name="cond"><option value="">— non renseigné —</option>${PP.cond.map((c) => `<option ${p.cond === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
          </div>
          <p class="muted small" id="pp-cond-help">${esc(COND_HELP[p.cond] || "Échelle utilisée par Cardmarket, de Mint (parfaite) à Poor (abîmée).")}</p>
          <fieldset class="sh-checks"><legend>Défauts</legend>
            ${Object.entries(DEFECTS).map(([k, v]) => `<label class="sh-check"><input type="checkbox" name="defects" value="${k}" ${p.defects.includes(k) ? "checked" : ""}> ${v}</label>`).join("")}
          </fieldset>
        </section>

        <section class="tool-card">
          <h2>🏅 Carte gradée</h2>
          <div class="sh-grid">
            <label>Société de grading<select name="grader">${PP.grader.map((g) => `<option value="${g}" ${p.grader === g ? "selected" : ""}>${g || "Pas gradée"}</option>`).join("")}</select></label>
            <label>Note<select name="grade"><option value="">—</option>${grades.map((g) => `<option ${p.grade === g ? "selected" : ""}>${g}</option>`).join("")}</select></label>
            <label>N° de certificat<input name="cert" maxlength="20" pattern="[A-Za-z0-9\\-]{1,20}" value="${esc(p.cert)}" placeholder="ex : 81234567"></label>
          </div>
          <p class="small" id="pp-cert"></p>
        </section>

        <section class="tool-card">
          <h2>📦 Provenance et rangement</h2>
          <div class="sh-grid">
            <label>Obtenue via<select name="source">${PP.source.map((s) => `<option value="${s}" ${p.source === s ? "selected" : ""}>${s || "— non renseigné —"}</option>`).join("")}</select></label>
            <label>Rangée dans<select name="storage">${PP.storage.map((s) => `<option value="${s}" ${p.storage === s ? "selected" : ""}>${s || "— non renseigné —"}</option>`).join("")}</select></label>
            <label>Emplacement<input name="place" maxlength="80" value="${esc(p.place)}" placeholder="ex : classeur 2, page 5"></label>
          </div>
          <label class="pp-note">Notes privées<textarea name="note" maxlength="500" rows="3" placeholder="ex : achetée à la convention de Lyon, facture dans la boîte">${esc(p.note)}</textarea></label>
          <p class="muted small">Ces informations sont privées : elles restent dans ta collection (et ton compte), personne d'autre ne les voit.</p>
        </section>
        <div class="row"><button class="btn" type="submit">💾 Enregistrer le passeport</button>
          ${st.passport(key) ? `<button class="btn ghost danger" type="button" id="pp-del">Effacer le passeport</button>` : ""}</div>
      </form>

      <section class="tool-card pp-photos">
        <h2>📷 Mes photos <span class="muted small">(${p.photos.length} / 4)</span></h2>
        ${canPhoto ? `<p class="muted small">Recto, verso et gros plans des défauts, en lumière naturelle sur un fond uni. Les photos sont réduites et les infos cachées (lieu GPS, appareil) retirées avant l'envoi. Elles sont <b>privées</b> : toi seul peux les voir.</p>
          <div class="pp-grid" id="pp-grid">${p.photos.map((ph) => `<figure data-p="${esc(ph)}"><div class="pp-ph">⏳</div><button class="link-btn small" data-del-photo>Supprimer</button></figure>`).join("")}
          ${p.photos.length < 4 ? `<label class="pp-add">＋<span>Ajouter une photo</span><input type="file" id="pp-file" accept="image/*" hidden></label>` : ""}</div>
          <p class="form-msg" id="pp-msg" role="alert"></p>`
        : `<p class="muted">Connecte-toi pour ajouter tes photos (stockées en privé sur ton compte).</p><a class="btn" href="#/connexion">Se connecter</a>`}
      </section>`;

    document.getElementById("pp-card").addEventListener("click", () => ui().openCard(lang, id));
    const form = document.getElementById("pp-form");
    const certHelp = () => {
      const g = form.grader.value, c = form.cert.value.trim();
      const el = document.getElementById("pp-cert");
      el.innerHTML = g === "PSA" && /^[0-9]{5,12}$/.test(c)
        ? `<a class="accent-link" target="_blank" rel="noopener noreferrer" href="https://www.psacard.com/cert/${enc(c)}">Vérifier ce certificat sur le site de PSA ↗</a>`
        : g ? `<span class="muted">Vérifie toujours le numéro sur le site officiel de ${esc(g)} : la carte, la photo et la note doivent correspondre. <a class="accent-link" href="#/bouclier">Repérer un faux boîtier</a></span>` : "";
    };
    certHelp();
    form.addEventListener("change", (e) => {
      if (e.target.name === "cond") document.getElementById("pp-cond-help").textContent = COND_HELP[e.target.value] || "";
      if (e.target.name === "grader" || e.target.name === "cert") certHelp();
    });
    form.cert.addEventListener("input", certHelp);
    const read = () => {
      const f = new FormData(form);
      return { cond: f.get("cond"), defects: f.getAll("defects"), grader: f.get("grader"), grade: f.get("grader") ? f.get("grade") : "", cert: f.get("grader") ? String(f.get("cert") || "").trim() : "",
        source: f.get("source"), storage: f.get("storage"), place: String(f.get("place") || "").trim(), note: String(f.get("note") || "").trim(), photos: (st.passport(key) || p).photos };
    };
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = read();
      if (v.cert && !/^[A-Za-z0-9-]{1,20}$/.test(v.cert)) return toast("N° de certificat : lettres, chiffres et tirets seulement");
      st.setPassport(key, v);
      toast("Passeport enregistré ✓");
      pageCard(key);
    });
    const del = document.getElementById("pp-del");
    if (del) del.addEventListener("click", async () => {
      if (!confirm("Effacer le passeport de cette carte (et ses photos) ?")) return;
      const cur = st.passport(key);
      if (cur && cur.photos.length && canPhoto) await a.client.storage.from(BUCKET).remove(cur.photos);
      st.setPassport(key, {});
      toast("Passeport effacé");
      pageCard(key);
    });

    if (!canPhoto) return;
    const grid = document.getElementById("pp-grid");
    grid.querySelectorAll("figure[data-p]").forEach(async (fig) => {
      const u = await photoURL(fig.dataset.p);
      const ph = fig.querySelector(".pp-ph");
      if (u) { const im = document.createElement("img"); im.src = u; im.alt = "Ma photo de " + name; ph.replaceWith(im); im.addEventListener("click", () => window.open(u, "_blank", "noopener")); }
      else ph.textContent = "Photo indisponible";
    });
    grid.querySelectorAll("[data-del-photo]").forEach((b) => b.addEventListener("click", async () => {
      const path = b.closest("figure").dataset.p;
      if (!confirm("Supprimer cette photo ?")) return;
      const { error } = await a.client.storage.from(BUCKET).remove([path]);
      if (error) return toast("Impossible de supprimer la photo");
      const cur = st.passport(key) || p;
      st.setPassport(key, Object.assign({}, cur, { photos: cur.photos.filter((x) => x !== path) }));
      if (urls.has(path)) { URL.revokeObjectURL(urls.get(path)); urls.delete(path); }
      pageCard(key);
    }));
    const file = document.getElementById("pp-file");
    if (file) file.addEventListener("change", async () => {
      const fl = file.files[0];
      file.value = "";
      if (!fl) return;
      const msg = document.getElementById("pp-msg");
      const add = grid.querySelector(".pp-add");
      if (fl.size > 25 * 1024 * 1024) { msg.textContent = "Photo trop lourde (25 Mo maximum)."; msg.className = "form-msg err"; return; }
      add.classList.add("busy"); add.querySelector("span").textContent = "Envoi…";
      try {
        const blob = await compress(fl);
        const path = `${a.user.id}/${key.replace("|", "_")}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
        const { error } = await a.client.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) throw new Error(/bucket|not found/i.test(error.message || "") ? "Stockage pas encore prêt (admin : lance supabase-passeport.sql)." : "Envoi impossible. Réessaie dans un instant.");
        const cur = Object.assign({}, read(), { photos: ((st.passport(key) || p).photos || []).concat(path).slice(0, 4) });
        st.setPassport(key, cur);
        urls.set(path, URL.createObjectURL(blob));
        toast("Photo ajoutée ✓");
        pageCard(key);
      } catch (err) {
        add.classList.remove("busy"); add.querySelector("span").textContent = "Ajouter une photo";
        msg.textContent = err.message || "Envoi impossible."; msg.className = "form-msg err";
      }
    });
  }

  MG.passeport = { compress };
})(window.MG);
