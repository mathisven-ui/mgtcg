/* ==========================================================
   MGTCG — widgets.js   (V3)
   Générateur de widgets pour créateurs de contenu : on choisit
   une carte (ou son profil public), le style, et on copie le
   code à coller sur son site, son blog ou dans OBS.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const ui = () => MG.ui;
  const enc = encodeURIComponent;
  const KEY_RE = /^[a-z-]{2,6}\|[A-Za-z0-9._-]{1,50}$/;
  const S = { type: "carte", key: "", pseudo: "", theme: "sombre", taille: "compact", cur: "EUR", results: [] };
  const SIZES = { carte: { compact: [360, 150], grand: [260, 470] }, profil: { compact: [360, 200], grand: [420, 230] } };
  const base = () => location.href.split("#")[0].replace(/index\.html$/, "").replace(/[^/]*$/, "") + "widget.html";

  function src() {
    const q = new URLSearchParams({ type: S.type });
    if (S.type === "carte") q.set("k", S.key); else q.set("pseudo", S.pseudo);
    q.set("theme", S.theme); q.set("taille", S.taille);
    if (S.cur !== "EUR") q.set("cur", S.cur);
    return base() + "?" + q.toString().replace(/%7C/g, "|");
  }

  const R = (MG.routes = MG.routes || {});
  R.widgets = async function (arg) {
    const { view, esc } = ui();
    const [t, rest] = String(arg || "").split("/");
    if (t === "profil") S.type = "profil";
    if (t === "carte") { S.type = "carte"; if (rest && KEY_RE.test(decodeURIComponent(rest))) S.key = decodeURIComponent(rest); }
    S.cur = MG.money && MG.money.code ? MG.money.code() : "EUR";
    const a = MG.auth;
    if (S.type === "profil" && !S.pseudo && a && a.enabled && a.user) {
      const { data } = await a.client.from("public_profiles").select("pseudo,visible").eq("user_id", a.user.id);
      const p = (data || [])[0];
      if (p && p.visible) S.pseudo = p.pseudo;
    }
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>🧩 Widgets pour ton site</h1>
        <p class="muted">Tu as un blog, une chaîne ou tu fais des lives ? Affiche le prix d'une carte ou ta collection avec un petit cadre qui se met à jour tout seul. Gratuit, il suffit de copier-coller le code.</p>
      </div></header>
      <div class="chips tool-tabs">
        <a class="chip ${S.type === "carte" ? "active" : ""}" href="#/widgets/carte">🃏 Prix d'une carte</a>
        <a class="chip ${S.type === "profil" ? "active" : ""}" href="#/widgets/profil">👤 Mon profil</a>
      </div>
      <div class="wg-layout">
        <section class="tool-card">
          ${S.type === "carte" ? `
            <h2>1. La carte</h2>
            <form id="wg-search" class="wg-search"><input type="search" name="q" placeholder="Nom de la carte (ex : Dracaufeu)" maxlength="60"><button class="btn" type="submit">Chercher</button></form>
            <div id="wg-res" class="wg-res"></div>
            <p class="small" id="wg-chosen"></p>` : `
            <h2>1. Ton profil public</h2>
            ${S.pseudo ? `<p>Profil : <b>${esc(S.pseudo)}</b> ✓</p>` : `<p class="muted">Le widget affiche ton <b>profil public</b> (pseudo, nombre de cartes, sets complétés, badges et vitrine). Crée-le d'abord dans <a class="accent-link" href="#/profil">🏅 Mon profil</a> et laisse-le visible.</p>`}`}
          <h2>2. Le style</h2>
          <form id="wg-opts" class="pt-form">
            <label>Thème<select name="theme"><option value="sombre">Sombre</option><option value="clair">Clair</option><option value="transparent">Transparent (pour OBS / lives)</option></select></label>
            <label>Format<select name="taille"><option value="compact">Compact (horizontal)</option><option value="grand">Grand (vertical, grande image)</option></select></label>
            ${S.type === "carte" ? `<label>Devise<select name="cur">${Object.entries(MG.CURRENCIES || { EUR: "€ Euro" }).map(([c, l]) => `<option value="${c}">${esc(l)}</option>`).join("")}</select></label>` : ""}
          </form>
        </section>
        <section class="tool-card">
          <h2>3. Aperçu et code</h2>
          <div id="wg-prev" class="wg-prev"></div>
          <label class="wg-code-l">Code à coller sur ton site<textarea id="wg-code" readonly rows="4"></textarea></label>
          <div class="row"><button class="btn" id="wg-copy">📋 Copier le code</button><button class="btn ghost" id="wg-link">🔗 Copier le lien seul</button></div>
          <details class="wg-help"><summary>Comment l'utiliser ?</summary>
            <ul>
              <li><b>Site ou blog</b> (WordPress, Wix, Blogger…) : ajoute un bloc « HTML personnalisé » ou « Intégrer » et colle le code.</li>
              <li><b>OBS / Streamlabs</b> : ajoute une source « Navigateur », colle le <b>lien seul</b>, mets la taille indiquée et choisis le thème « Transparent ».</li>
              <li>Le prix se met à jour tout seul (toutes les 30 minutes sur un live). Un clic sur le widget ouvre la carte sur MGTCG.</li>
            </ul></details>
          <p class="disclaimer">Prix Cardmarket indicatifs. Merci de laisser la mention « via MGTCG » visible.</p>
        </section>
      </div>`;
    const opts = document.getElementById("wg-opts");
    opts.theme.value = S.theme; opts.taille.value = S.taille; if (opts.cur) opts.cur.value = S.cur;
    opts.addEventListener("change", () => { S.theme = opts.theme.value; S.taille = opts.taille.value; if (opts.cur) S.cur = opts.cur.value; render(); });
    const sf = document.getElementById("wg-search");
    if (sf) sf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = sf.q.value.trim();
      const box = document.getElementById("wg-res");
      if (q.length < 2) return;
      box.innerHTML = `<p class="muted small">Recherche…</p>`;
      let res = [];
      try { res = (await MG.api.search(MG.store.lang, q)) || []; } catch (err) { res = []; }
      S.results = res.slice(0, 30);
      box.innerHTML = S.results.length ? S.results.map((c) => `<button class="wg-pick" data-id="${esc(c.id)}">${MG.cardImg(c.image) ? `<img src="${esc(MG.cardImg(c.image))}" alt="" loading="lazy">` : ""}<span>${esc(c.name)}<small class="muted"> #${esc(c.localId)}</small></span></button>`).join("") : `<p class="muted small">Aucune carte trouvée.</p>`;
      box.querySelectorAll(".wg-pick").forEach((b) => b.addEventListener("click", () => { S.key = MG.store.lang + "|" + b.dataset.id; render(); }));
    });
    render();
  };

  function render() {
    const { esc, toast } = ui();
    const prev = document.getElementById("wg-prev");
    const code = document.getElementById("wg-code");
    if (!prev) return;
    const chosen = document.getElementById("wg-chosen");
    const ready = S.type === "carte" ? KEY_RE.test(S.key) : !!S.pseudo;
    if (chosen) {
      const m = S.key && (MG.store.meta(S.key) || (S.results.find((c) => S.key.endsWith("|" + c.id)) || null));
      chosen.innerHTML = S.key ? `Carte choisie : <b>${esc(m ? m.name : S.key)}</b>` : `<span class="muted">Cherche une carte, ou ouvre une carte et clique sur « 🧩 Widget pour mon site ».</span>`;
    }
    if (!ready) { prev.innerHTML = `<p class="muted">L'aperçu apparaîtra ici.</p>`; code.value = ""; return; }
    const [w, h] = SIZES[S.type][S.taille];
    const url = src();
    const title = S.type === "carte" ? "Prix de la carte – MGTCG" : "Ma collection Pokémon – MGTCG";
    code.value = `<iframe src="${url}" width="${w}" height="${h}" style="border:0;border-radius:12px;max-width:100%" loading="lazy" title="${title}"></iframe>`;
    prev.innerHTML = `<div class="wg-frame ${S.theme === "transparent" ? "checker" : ""}"><iframe src="${esc(url)}" width="${w}" height="${h}" title="${esc(title)}" loading="lazy"></iframe></div><p class="muted small">Taille : ${w} × ${h} pixels</p>`;
    const copy = async (txt, ok) => { try { await navigator.clipboard.writeText(txt); toast(ok); } catch (e) { window.prompt("Copie :", txt); } };
    document.getElementById("wg-copy").onclick = () => copy(code.value, "Code copié ✓");
    document.getElementById("wg-link").onclick = () => copy(url, "Lien copié ✓");
  }
})(window.MG);
