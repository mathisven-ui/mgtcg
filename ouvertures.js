/* ==========================================================
   MGTCG — ouvertures.js   (V2)
   Tracker d'ouvertures : les membres notent ce qu'ils tirent
   de leurs boosters → taux de drop calculés par la communauté,
   affichés sur la page de chaque extension.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const PRODUCTS = { Booster: 1, Blister: 1, Tripack: 3, ETB: 9, "Demi-display": 18, Display: 36, Coffret: 4, Autre: 1 };
  const MIN_RELIABLE = 100; // en dessous de 100 boosters, on prévient que c'est peu fiable
  const isHitRarity = (r) => r && !/^(none|sans raret)|commune|common|peu commune|uncommon|^c$|^u$/i.test(String(r).trim());

  const ui = () => MG.ui;
  const auth = () => MG.auth;
  const pct = (x) => (x * 100).toLocaleString("fr-FR", { maximumFractionDigits: x < 0.01 ? 2 : 1 }) + " %";

  async function fetchOpenings(lang, setId) {
    const a = auth();
    if (!a || !a.enabled) return null;
    const { data, error } = await a.client.from("openings").select("id,user_id,product,boosters,pulls,created_at")
      .eq("lang", lang).eq("set_id", setId).order("created_at", { ascending: false }).limit(5000);
    return error ? null : data || [];
  }

  function stats(list) {
    let boosters = 0;
    const byRarity = new Map(), byCard = new Map(), users = new Set();
    for (const o of list) {
      boosters += o.boosters;
      users.add(o.user_id);
      for (const p of Array.isArray(o.pulls) ? o.pulls : []) {
        if (!p || typeof p !== "object") continue;
        const r = String(p.rarity || "Inconnue").slice(0, 60);
        byRarity.set(r, (byRarity.get(r) || 0) + 1);
        const k = String(p.id || "").slice(0, 40);
        if (k) { const c = byCard.get(k) || { id: k, name: String(p.name || k).slice(0, 80), rarity: r, n: 0 }; c.n++; byCard.set(k, c); }
      }
    }
    const rarities = [...byRarity.entries()].map(([r, n]) => ({ r, n, rate: n / boosters })).sort((a, b) => a.rate - b.rate);
    const top = [...byCard.values()].sort((a, b) => b.n - a.n).slice(0, 10);
    return { boosters, openings: list.length, users: users.size, rarities, top };
  }

  /* ---------------- Bloc sur la page d'une extension ---------------- */
  async function mountSet(el, set, lang, getCards) {
    if (!el) return;
    const { esc } = ui();
    const a = auth();
    const list = await fetchOpenings(lang, set.id);
    if (list === null) { el.innerHTML = ""; return; } // base pas encore prête
    const st = stats(list);
    const me = a.user ? list.filter((o) => o.user_id === a.user.id) : [];
    const myStats = me.length ? stats(me) : null;

    el.innerHTML = `<details class="serie-block drops" open>
      <summary><span class="sb-title">🎲 Taux de drop de la communauté</span>
        <span class="muted small">${st.boosters ? st.boosters + " booster" + (st.boosters > 1 ? "s" : "") + " ouvert" + (st.boosters > 1 ? "s" : "") : "aucune ouverture"}</span></summary>
      ${st.boosters ? `
        <p class="muted small">${st.openings} ouverture${st.openings > 1 ? "s" : ""} enregistrée${st.openings > 1 ? "s" : ""} par ${st.users} membre${st.users > 1 ? "s" : ""}.
        ${st.boosters < MIN_RELIABLE ? "<b>Encore peu de données :</b> ces chiffres deviendront fiables avec plus d'ouvertures." : ""}</p>
        ${st.rarities.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Rareté</th><th class="right">Tirées</th><th class="right">Taux par booster</th><th class="right">En moyenne</th></tr></thead>
          <tbody>${st.rarities.map((x) => { const R = MG.rarity(x.r); return `<tr>
            <td><span class="rar ${R.cls}">${esc(R.icon)}</span> ${esc(x.r)}</td>
            <td class="right">${x.n}</td><td class="right">${pct(x.rate)}</td>
            <td class="right"><b>1 tous les ${Math.max(1, Math.round(1 / x.rate)).toLocaleString("fr-FR")} boosters</b></td></tr>`; }).join("")}</tbody>
        </table></div>` : `<p class="muted small">Aucune carte rare enregistrée pour l'instant.</p>`}
        ${st.top.length ? `<h3>Les cartes les plus tirées</h3><div class="pull-chips">${st.top.map((c) => `<span class="pull-chip"><span class="rar ${MG.rarity(c.rarity).cls}">${esc(MG.rarity(c.rarity).icon)}</span> ${esc(c.name)} <b>×${c.n}</b></span>`).join("")}</div>` : ""}
      ` : `<p class="muted small">Personne n'a encore enregistré d'ouverture pour cette extension. Sois le premier !</p>`}
      ${myStats ? `<p class="small">📊 <b>Toi :</b> ${myStats.boosters} booster${myStats.boosters > 1 ? "s" : ""} ouvert${myStats.boosters > 1 ? "s" : ""}, ${myStats.rarities.reduce((t, x) => t + x.n, 0)} carte(s) rare(s) et plus.
        <button class="link-btn accent-link" id="my-openings">Voir / supprimer mes ouvertures</button></p>` : ""}
      <p>${a.user ? `<button class="btn" id="add-opening">🎲 J'ai ouvert des boosters</button>` : `<a class="btn ghost" href="#/connexion">Connecte-toi pour enregistrer tes ouvertures</a>`}</p>
      <p class="disclaimer">Taux calculés uniquement à partir des ouvertures déclarées par les membres de MGTCG (Pokémon ne publie pas de taux officiels). Ce sont des estimations, pas des garanties.</p>
    </details>`;

    const add = el.querySelector("#add-opening");
    if (add) add.addEventListener("click", () => openForm(set, lang, getCards, () => mountSet(el, set, lang, getCards)));
    const mine = el.querySelector("#my-openings");
    if (mine) mine.addEventListener("click", () => openMine(me, () => mountSet(el, set, lang, getCards)));
  }

  /* ---------------- Formulaire « j'ai ouvert… » ---------------- */
  function openForm(set, lang, getCards, done) {
    const { $, esc } = ui();
    const a = auth();
    const pulls = [];
    $("#modal-body").innerHTML = `
      <h2 id="modal-title">🎲 Mes ouvertures – ${esc(set.name)}</h2>
      <form id="f-open" class="form">
        <div class="row">
          <label class="grow">Ce que j'ai ouvert<select name="product">${Object.keys(PRODUCTS).map((p) => `<option>${p}</option>`).join("")}</select></label>
          <label class="grow">Nombre de boosters<input type="number" name="boosters" min="1" max="36" value="1" required></label>
        </div>
        <label>Mes cartes « rares et plus » <span class="muted small">(clique sur chaque carte tirée, même plusieurs fois ; pas besoin des communes et peu communes)</span>
          <input type="search" id="pull-q" placeholder="Chercher par nom ou numéro…" maxlength="40"></label>
        <div id="pull-pick" class="pull-pick"></div>
        <div><b class="small">Sélection :</b> <div id="pull-sel" class="pull-chips"><span class="muted small">aucune carte rare (c'est possible !)</span></div></div>
        <p class="form-msg" id="op-msg" role="alert"></p>
        <button class="btn full" type="submit">Enregistrer mon ouverture</button>
      </form>`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    const form = $("#f-open");
    form.product.addEventListener("change", () => { form.boosters.value = PRODUCTS[form.product.value] || 1; });

    const pick = $("#pull-pick"), sel = $("#pull-sel"), q = $("#pull-q");
    const renderPick = () => {
      const cards = (getCards() || []).filter((c) => c && isHitRarity(c.rarity));
      const s = q.value.trim().toLowerCase();
      const list = cards.filter((c) => !s || (c.name || "").toLowerCase().includes(s) || String(c.localId).toLowerCase() === s);
      if (!cards.length) { pick.innerHTML = `<p class="muted small">Les cartes de l'extension sont en cours de chargement… réessaie dans quelques secondes.</p>`; return; }
      pick.innerHTML = list.slice(0, 120).map((c) => {
        const R = MG.rarity(c.rarity);
        const img = MG.cardImg(c.image, "low");
        return `<button type="button" class="pick-card" data-id="${esc(c.id)}" title="${esc(c.name)} – ${esc(c.rarity)}">
          ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ""}<span><span class="rar ${R.cls}">${esc(R.icon)}</span> #${esc(c.localId)}</span></button>`;
      }).join("") || `<p class="muted small">Aucune carte ne correspond.</p>`;
      pick.querySelectorAll(".pick-card").forEach((b) => b.addEventListener("click", () => {
        const c = cards.find((x) => x.id === b.dataset.id);
        if (!c) return;
        if (pulls.length >= Math.min(120, (parseInt(form.boosters.value, 10) || 1) * 4)) { ui().toast("Ça fait beaucoup de cartes rares pour ce nombre de boosters !"); return; }
        pulls.push({ id: c.id, name: String(c.name).slice(0, 80), rarity: String(c.rarity).slice(0, 60) });
        renderSel();
      }));
    };
    const renderSel = () => {
      sel.innerHTML = pulls.length ? pulls.map((p, i) => `<span class="pull-chip">${esc(p.name)} <span class="muted">(${esc(MG.rarity(p.rarity).icon)})</span><button type="button" class="link-btn" data-rm="${i}" aria-label="Retirer">✕</button></span>`).join("")
        : `<span class="muted small">aucune carte rare (c'est possible !)</span>`;
      sel.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { pulls.splice(+b.dataset.rm, 1); renderSel(); }));
    };
    q.addEventListener("input", renderPick);
    renderPick();
    const retry = setInterval(() => { if (!document.getElementById("pull-pick")) return clearInterval(retry); if (!pick.querySelector(".pick-card")) renderPick(); else clearInterval(retry); }, 2000);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("#op-msg");
      const boosters = parseInt(form.boosters.value, 10);
      if (!(boosters >= 1 && boosters <= 36)) { msg.textContent = "Entre 1 et 36 boosters par enregistrement."; msg.className = "form-msg err"; return; }
      if (pulls.length > boosters * 4) { msg.textContent = "Trop de cartes rares pour ce nombre de boosters."; msg.className = "form-msg err"; return; }
      const btn = form.querySelector("button[type=submit]"); btn.disabled = true;
      const { error } = await a.client.from("openings").insert({
        user_id: a.user.id, lang, set_id: String(set.id).slice(0, 40), set_name: String(set.name).slice(0, 80),
        product: PRODUCTS[form.product.value] ? form.product.value : "Autre", boosters, pulls,
      });
      btn.disabled = false;
      if (error) { msg.textContent = /limite/i.test(error.message || "") ? error.message : "Impossible d'enregistrer. Réessaie."; msg.className = "form-msg err"; return; }
      $("#modal").hidden = true; document.body.classList.remove("noscroll");
      ui().toast("Merci ! Ouverture enregistrée 🎲");
      done();
    });
  }

  function openMine(list, done) {
    const { $, esc } = ui();
    $("#modal-body").innerHTML = `<h2 id="modal-title">Mes ouvertures</h2>
      <div class="mod-list">${list.map((o) => `<div class="mod-item" data-id="${esc(o.id)}">
        <div><b>${esc(o.product)}</b> · ${o.boosters} booster${o.boosters > 1 ? "s" : ""} · <span class="muted small">${esc(new Date(o.created_at).toLocaleDateString("fr-FR"))}</span><br>
        <span class="small">${(o.pulls || []).map((p) => esc(p.name)).join(", ") || "<span class='muted'>aucune carte rare</span>"}</span></div>
        <button class="btn ghost" data-del="${esc(o.id)}">Supprimer</button></div>`).join("")}</div>`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    $("#modal-body").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Supprimer cette ouverture ?")) return;
      const { error } = await auth().client.from("openings").delete().eq("id", b.dataset.del);
      if (!error) { b.closest(".mod-item").remove(); done(); }
    }));
  }

  MG.drops = { mountSet };
})(window.MG);
