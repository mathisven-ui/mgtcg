/* ==========================================================
   MGTCG — auth.js
   Comptes (email + mot de passe), compte administrateur et
   synchronisation de la collection en ligne, avec Supabase.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const cfg = MG.config || {};
  const auth = (MG.auth = {
    enabled: false,
    client: null,
    user: null,
    profile: null,
    syncState: "off", // off | syncing | ok | error
    lastSync: null,
  });

  /* ---------------- Sécurité côté site ----------------
     1) Limite de tentatives : après 5 erreurs, blocage 15 min
        (Supabase limite AUSSI les tentatives côté serveur).
     2) Mot de passe solide obligatoire.
     3) Champ piège invisible contre les robots.
     4) Messages d'erreur volontairement vagues (on ne dit pas
        si c'est l'email ou le mot de passe qui est faux). */
  const LOCK_KEY = "mgtcg:auth:fails";
  const MAX_FAILS = 5;
  const LOCK_MIN = 15;

  function getFails() {
    try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { n: 0, until: 0 }; }
    catch (e) { return { n: 0, until: 0 }; }
  }
  function setFails(f) { try { localStorage.setItem(LOCK_KEY, JSON.stringify(f)); } catch (e) { /* rien */ } }
  function lockedMinutes() {
    const f = getFails();
    return f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 60000) : 0;
  }
  function addFail() {
    const f = getFails();
    f.n = (f.n || 0) + 1;
    if (f.n >= MAX_FAILS) { f.until = Date.now() + LOCK_MIN * 60000; f.n = 0; }
    setFails(f);
  }
  function resetFails() { setFails({ n: 0, until: 0 }); }

  function passwordProblems(pw, email) {
    const p = [];
    if (pw.length < 10) p.push("au moins 10 caractères");
    if (!/[a-zA-Z]/.test(pw)) p.push("au moins une lettre");
    if (!/[0-9]/.test(pw)) p.push("au moins un chiffre");
    if (!/[^a-zA-Z0-9]/.test(pw)) p.push("au moins un caractère spécial (! ? @ # …)");
    if (email && pw.toLowerCase().includes(email.split("@")[0].toLowerCase())) p.push("pas ton email dedans");
    return p;
  }
  function strength(pw) {
    let s = 0;
    if (pw.length >= 10) s++; if (pw.length >= 14) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/[0-9]/.test(pw)) s++; if (/[^a-zA-Z0-9]/.test(pw)) s++;
    return Math.min(s, 4);
  }
  const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;

  // Traduit les erreurs Supabase en français simple
  function niceError(err) {
    const m = ((err && err.message) || "").toLowerCase();
    if (m.includes("email not confirmed")) return "Ton email n'est pas encore confirmé. Clique sur le lien reçu par email (pense à regarder dans les spams).";
    if (m.includes("rate limit") || m.includes("too many") || (err && err.status === 429)) return "Trop de tentatives. Patiente quelques minutes avant de réessayer.";
    if (m.includes("already registered") || m.includes("already exists")) return "Impossible de créer ce compte. Si tu as déjà un compte, connecte-toi ou réinitialise ton mot de passe.";
    if (m.includes("weak") || m.includes("password should")) return "Ce mot de passe est trop faible ou trop connu. Choisis-en un autre.";
    if (m.includes("same password") || m.includes("different from the old")) return "Le nouveau mot de passe doit être différent de l'ancien.";
    if (m.includes("failed to fetch") || m.includes("network")) return "Connexion impossible. Vérifie ton Internet.";
    return "Une erreur est survenue. Réessaie dans un instant.";
  }

  /* ---------------- Démarrage ---------------- */
  async function init() {
    renderAccountButton();
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
      auth.enabled = false;
      return;
    }
    try {
      auth.client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      auth.enabled = true;
    } catch (e) { console.error(e); return; }

    auth.client.auth.onAuthStateChange((event, session) => {
      // setTimeout : recommandé par Supabase pour ne pas bloquer l'événement
      setTimeout(() => {
        if (event === "PASSWORD_RECOVERY") location.hash = "#/nouveau-mot-de-passe";
        applySession(session, event);
      }, 0);
    });
    const { data } = await auth.client.auth.getSession();
    await applySession(data.session, "INITIAL");
    // Nettoie l'adresse après un lien reçu par email (?code=…)
    if (location.search.includes("code=")) history.replaceState(null, "", location.pathname + location.hash);
  }

  let lastUserId = null;
  async function applySession(session, event) {
    const user = session ? session.user : null;
    const changed = (user && user.id) !== lastUserId;
    auth.user = user;
    lastUserId = user ? user.id : null;
    if (user && changed) {
      await loadProfile();
      await pullCollection();
      if (event === "SIGNED_IN") MG.ui.toast("Connecté ✓");
    }
    if (!user) { auth.profile = null; auth.syncState = "off"; }
    renderAccountButton();
    MG.emit("auth");
    // Rafraîchit la page si on est sur une page liée au compte
    const page = (location.hash.split("/")[1] || "");
    if (changed && ["compte", "connexion", "admin", "collection", ""].includes(page)) MG.route();
  }

  async function loadProfile() {
    const { data, error } = await auth.client.from("profiles").select("id,email,role,created_at").eq("id", auth.user.id).maybeSingle();
    auth.profile = error ? null : data;
  }
  const isAdmin = () => !!(auth.profile && auth.profile.role === "admin");
  auth.isAdmin = isAdmin;

  /* ---------------- Synchronisation de la collection ---------------- */
  async function pullCollection() {
    auth.syncState = "syncing";
    const { data, error } = await auth.client.from("collections").select("data,updated_at").eq("user_id", auth.user.id).maybeSingle();
    if (error) { auth.syncState = "error"; return; }
    pausePush = true;
    if (data && data.data) MG.store.mergeFrom(data.data);
    pausePush = false;
    await pushCollection(); // renvoie la version fusionnée
  }

  let pushTimer = 0, pausePush = false;
  function schedulePush() {
    if (!auth.user || pausePush) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushCollection, 1500);
  }
  async function pushCollection() {
    if (!auth.user) return;
    auth.syncState = "syncing"; renderAccountButton();
    const payload = MG.store.snapshot();
    const { error } = await auth.client.from("collections").upsert({
      user_id: auth.user.id, data: payload, updated_at: new Date().toISOString(),
    });
    auth.syncState = error ? "error" : "ok";
    if (!error) auth.lastSync = new Date();
    renderAccountButton();
  }

  /* ---------------- Bouton dans la barre du haut ---------------- */
  function renderAccountButton() {
    const el = document.getElementById("account");
    if (!el) return;
    const esc = MG.ui ? MG.ui.esc : (s) => s;
    if (auth.user) {
      const initial = (auth.user.email || "?").charAt(0).toUpperCase();
      const dot = auth.syncState === "error" ? "err" : auth.syncState === "syncing" ? "sync" : "ok";
      el.innerHTML = `<a href="#/compte" class="avatar" title="Mon compte (${esc(auth.user.email)})">${esc(initial)}<span class="sync-dot ${dot}"></span></a>`;
    } else {
      el.innerHTML = `<a href="#/connexion" class="btn small-btn">Connexion</a>`;
    }
  }

  /* ================== PAGES ================== */
  const R = (MG.routes = MG.routes || {});

  function notConfigured() {
    MG.ui.view().innerHTML = `<div class="state"><p>🔒 Les comptes ne sont pas encore activés sur ce site.</p>
      <p class="muted small">Pour l'instant, ta collection est enregistrée dans ce navigateur.<br>(Admin : remplis le fichier <code>config.js</code>, voir le README.)</p>
      <a class="btn" href="#/">Retour à l'accueil</a></div>`;
  }

  /* ---------- Connexion / inscription / mot de passe oublié ---------- */
  R.connexion = function (tab) {
    if (!auth.enabled) return notConfigured();
    if (auth.user) { location.hash = "#/compte"; return; }
    const { view, $, $$ } = MG.ui;
    tab = ["inscription", "oubli"].includes(tab) ? tab : "connexion";

    view().innerHTML = `
      <div class="auth-wrap">
        <div class="auth-card">
          <div class="chips auth-tabs">
            <a class="chip ${tab === "connexion" ? "active" : ""}" href="#/connexion">Se connecter</a>
            <a class="chip ${tab === "inscription" ? "active" : ""}" href="#/connexion/inscription">Créer un compte</a>
          </div>

          ${tab === "connexion" ? `
          <h1>Bon retour 👋</h1>
          <form id="f-login" class="form" novalidate>
            <label>Email<input type="email" name="email" autocomplete="email" required maxlength="254"></label>
            <label>Mot de passe<input type="password" name="pw" autocomplete="current-password" required maxlength="72"></label>
            <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
            <p class="form-msg" id="msg" role="alert"></p>
            <button class="btn full" type="submit">Se connecter</button>
            <a class="small muted" href="#/connexion/oubli">Mot de passe oublié ?</a>
          </form>` : ""}

          ${tab === "inscription" ? `
          <h1>Crée ton compte</h1>
          <p class="muted small">Ta collection sera sauvegardée en ligne et disponible sur tous tes appareils. C'est gratuit.</p>
          <form id="f-signup" class="form" novalidate>
            <label>Email<input type="email" name="email" autocomplete="email" required maxlength="254"></label>
            <label>Mot de passe<input type="password" name="pw" autocomplete="new-password" required maxlength="72"></label>
            <div class="meter"><span id="meter"></span></div>
            <p class="small muted" id="pw-rules">10 caractères minimum, avec une lettre, un chiffre et un caractère spécial.</p>
            <label>Confirme le mot de passe<input type="password" name="pw2" autocomplete="new-password" required maxlength="72"></label>
            <label class="check"><input type="checkbox" name="ok" required><span>J'accepte les <a href="#/mentions">mentions légales et la politique de confidentialité</a></span></label>
            <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
            <p class="form-msg" id="msg" role="alert"></p>
            <button class="btn full" type="submit">Créer mon compte</button>
          </form>` : ""}

          ${tab === "oubli" ? `
          <h1>Mot de passe oublié</h1>
          <p class="muted small">Entre ton email : si un compte existe, tu recevras un lien pour choisir un nouveau mot de passe.</p>
          <form id="f-forgot" class="form" novalidate>
            <label>Email<input type="email" name="email" autocomplete="email" required maxlength="254"></label>
            <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
            <p class="form-msg" id="msg" role="alert"></p>
            <button class="btn full" type="submit">Envoyer le lien</button>
            <a class="small muted" href="#/connexion">← Retour à la connexion</a>
          </form>` : ""}
        </div>
      </div>`;

    const msg = (text, ok) => { const m = $("#msg"); m.textContent = text; m.className = "form-msg " + (ok ? "ok" : "err"); };
    const busy = (form, on) => { const b = form.querySelector("button[type=submit]"); b.disabled = on; b.classList.toggle("loading", on); };
    const redirect = location.origin + location.pathname;

    const login = $("#f-login");
    if (login) login.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(login);
      if (f.get("website")) return; // robot
      const mins = lockedMinutes();
      if (mins) return msg(`Trop d'essais ratés. Réessaie dans ${mins} min.`);
      const email = String(f.get("email")).trim().toLowerCase();
      const pw = String(f.get("pw"));
      if (!validEmail(email) || !pw) return msg("Remplis ton email et ton mot de passe.");
      busy(login, true);
      const { error } = await auth.client.auth.signInWithPassword({ email, password: pw });
      busy(login, false);
      if (error) {
        const m = (error.message || "").toLowerCase();
        if (m.includes("invalid")) { addFail(); return msg("Email ou mot de passe incorrect."); }
        return msg(niceError(error));
      }
      resetFails();
      location.hash = "#/compte";
    });

    const signup = $("#f-signup");
    if (signup) {
      const pwInput = signup.querySelector("[name=pw]");
      pwInput.addEventListener("input", () => {
        const s = strength(pwInput.value);
        const bar = $("#meter");
        bar.style.width = (s / 4) * 100 + "%";
        bar.className = ["", "weak", "weak", "mid", "strong"][s];
      });
      signup.addEventListener("submit", async (e) => {
        e.preventDefault();
        const f = new FormData(signup);
        if (f.get("website")) return;
        const email = String(f.get("email")).trim().toLowerCase();
        const pw = String(f.get("pw")), pw2 = String(f.get("pw2"));
        if (!validEmail(email)) return msg("Cet email n'a pas l'air valide.");
        const probs = passwordProblems(pw, email);
        if (probs.length) return msg("Mot de passe : " + probs.join(", ") + ".");
        if (pw !== pw2) return msg("Les deux mots de passe ne sont pas identiques.");
        if (!f.get("ok")) return msg("Accepte les mentions légales pour continuer.");
        busy(signup, true);
        const { data, error } = await auth.client.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } });
        busy(signup, false);
        if (error) return msg(niceError(error));
        if (data.session) { location.hash = "#/compte"; return; }
        signup.innerHTML = `<div class="state"><p>📧 C'est presque fini !</p><p>Un email de confirmation vient d'être envoyé à <b>${MG.ui.esc(email)}</b>. Clique sur le lien dedans pour activer ton compte (regarde aussi dans les spams).</p></div>`;
      });
    }

    const forgot = $("#f-forgot");
    if (forgot) forgot.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(forgot);
      if (f.get("website")) return;
      const email = String(f.get("email")).trim().toLowerCase();
      if (!validEmail(email)) return msg("Cet email n'a pas l'air valide.");
      busy(forgot, true);
      const { error } = await auth.client.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      busy(forgot, false);
      if (error && (error.status === 429)) return msg(niceError(error));
      // Toujours le même message : on ne révèle pas si l'email existe
      msg("Si un compte existe avec cet email, un lien vient d'être envoyé. Pense à regarder dans les spams.", true);
    });
  };

  /* ---------- Choisir un nouveau mot de passe (après le lien email) ---------- */
  R["nouveau-mot-de-passe"] = function () {
    if (!auth.enabled) return notConfigured();
    const { view, $ } = MG.ui;
    if (!auth.user) {
      view().innerHTML = `<div class="state"><p>Ce lien a expiré ou a déjà été utilisé.</p><a class="btn" href="#/connexion/oubli">Redemander un lien</a></div>`;
      return;
    }
    view().innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <h1>Nouveau mot de passe</h1>
      <form id="f-new" class="form" novalidate>
        <label>Nouveau mot de passe<input type="password" name="pw" autocomplete="new-password" required maxlength="72"></label>
        <label>Confirme<input type="password" name="pw2" autocomplete="new-password" required maxlength="72"></label>
        <p class="form-msg" id="msg" role="alert"></p>
        <button class="btn full" type="submit">Enregistrer</button>
      </form></div></div>`;
    const form = $("#f-new");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const pw = String(f.get("pw")), pw2 = String(f.get("pw2"));
      const m = $("#msg");
      const probs = passwordProblems(pw, auth.user.email);
      if (probs.length) { m.textContent = "Mot de passe : " + probs.join(", ") + "."; m.className = "form-msg err"; return; }
      if (pw !== pw2) { m.textContent = "Les deux mots de passe ne sont pas identiques."; m.className = "form-msg err"; return; }
      const { error } = await auth.client.auth.updateUser({ password: pw });
      if (error) { m.textContent = niceError(error); m.className = "form-msg err"; return; }
      MG.ui.toast("Mot de passe modifié ✓");
      location.hash = "#/compte";
    });
  };

  /* ---------- Mon compte ---------- */
  R.compte = function () {
    if (!auth.enabled) return notConfigured();
    const { view, $, esc, fmtDate } = MG.ui;
    if (!auth.user) { location.hash = "#/connexion"; return; }
    const syncText = {
      ok: "✅ Collection sauvegardée en ligne" + (auth.lastSync ? " (" + auth.lastSync.toLocaleTimeString("fr-FR") + ")" : ""),
      syncing: "🔄 Sauvegarde en cours…",
      error: "⚠️ La sauvegarde en ligne a échoué. Tes cartes restent enregistrées dans ce navigateur.",
      off: "—",
    }[auth.syncState];

    view().innerHTML = `
      <header class="page-head"><div><h1>Mon compte</h1>
        <p class="muted">${esc(auth.user.email)}${isAdmin() ? ' · <span class="badge admin">👑 Administrateur</span>' : ""}</p></div></header>

      <div class="stat-row">
        <div class="stat"><strong>${MG.store.ownedKeys().length}</strong><span>cartes dans ma collection</span></div>
        <div class="stat"><strong>${MG.store.listKeys("wish").length}</strong><span>dans ma wishlist</span></div>
        <div class="stat"><strong>${auth.user.created_at ? esc(fmtDate(auth.user.created_at)) : "—"}</strong><span>membre depuis</span></div>
      </div>

      <section class="backup">
        <h2>Sauvegarde en ligne</h2>
        <p>${syncText}</p>
        <div class="row"><button class="btn ghost" id="b-sync">🔄 Synchroniser maintenant</button>
        <a class="btn ghost" href="#/collection">Voir ma collection</a>
        ${isAdmin() ? '<a class="btn" href="#/admin">👑 Espace admin</a>' : ""}</div>
      </section>

      <section class="backup">
        <h2>Sécurité</h2>
        <form id="f-pw" class="form inline-form" novalidate>
          <label>Nouveau mot de passe<input type="password" name="pw" autocomplete="new-password" maxlength="72"></label>
          <label>Confirme<input type="password" name="pw2" autocomplete="new-password" maxlength="72"></label>
          <button class="btn ghost" type="submit">Changer mon mot de passe</button>
          <p class="form-msg" id="msg" role="alert"></p>
        </form>
        <div class="row" style="margin-top:14px">
          <button class="btn ghost" id="b-out">Se déconnecter</button>
          <button class="btn ghost" id="b-out-all">Se déconnecter de tous mes appareils</button>
        </div>
      </section>

      <section class="backup">
        <h2>Mes données</h2>
        <p class="muted small">Tu peux supprimer ta collection en ligne à tout moment. Pour supprimer complètement ton compte, contacte l'administrateur (voir les mentions légales).</p>
        <button class="btn danger" id="b-del">Supprimer ma collection en ligne</button>
      </section>`;

    $("#b-sync").addEventListener("click", async () => { await pullCollection(); R.compte(); });
    $("#b-out").addEventListener("click", () => signOut("local"));
    $("#b-out-all").addEventListener("click", () => signOut("global"));
    $("#b-del").addEventListener("click", async () => {
      if (!confirm("Supprimer ta collection sauvegardée en ligne ? (Celle de ce navigateur reste là.)")) return;
      const { error } = await auth.client.from("collections").delete().eq("user_id", auth.user.id);
      MG.ui.toast(error ? "Erreur, réessaie" : "Collection en ligne supprimée");
    });
    const form = $("#f-pw");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(form); const m = $("#msg");
      const pw = String(f.get("pw")), pw2 = String(f.get("pw2"));
      const probs = passwordProblems(pw, auth.user.email);
      if (probs.length) { m.textContent = "Mot de passe : " + probs.join(", ") + "."; m.className = "form-msg err"; return; }
      if (pw !== pw2) { m.textContent = "Les deux mots de passe ne sont pas identiques."; m.className = "form-msg err"; return; }
      const { error } = await auth.client.auth.updateUser({ password: pw });
      m.textContent = error ? niceError(error) : "Mot de passe modifié ✓";
      m.className = "form-msg " + (error ? "err" : "ok");
      if (!error) form.reset();
    });
  };

  async function signOut(scope) {
    clearTimeout(pushTimer);
    await pushCollection();
    pausePush = true; // surtout ne pas envoyer la collection vide en ligne !
    await auth.client.auth.signOut({ scope });
    auth.user = null;
    // Sur un ordinateur partagé, on ne laisse pas la collection visible
    MG.store.clearLocal();
    pausePush = false;
    MG.ui.toast("Déconnecté");
    location.hash = "#/";
  }

  /* ---------- Espace administrateur ---------- */
  R.admin = async function () {
    if (!auth.enabled) return notConfigured();
    const { view, esc, fmtDate, loading } = MG.ui;
    // L'affichage est caché aux non-admins, mais la VRAIE protection est
    // côté serveur : les règles RLS refusent les données aux autres comptes.
    if (!auth.user || !isAdmin()) {
      view().innerHTML = `<div class="state"><p>⛔ Accès réservé à l'administrateur.</p><a class="btn" href="#/">Retour</a></div>`;
      return;
    }
    view().innerHTML = loading("Chargement de l'espace admin…");
    const [{ data: users, error: e1 }, { data: cols, error: e2 }] = await Promise.all([
      auth.client.from("profiles").select("id,email,role,created_at").order("created_at", { ascending: false }).limit(500),
      auth.client.from("collections").select("user_id,updated_at").limit(5000),
    ]);
    if (e1 || e2) { view().innerHTML = `<div class="state"><p>Erreur de chargement.</p></div>`; return; }
    const lastSeen = new Map(cols.map((c) => [c.user_id, c.updated_at]));
    const week = Date.now() - 7 * 86400000;
    const newThisWeek = users.filter((u) => new Date(u.created_at) > week).length;
    const activeThisWeek = cols.filter((c) => new Date(c.updated_at) > week).length;

    view().innerHTML = `
      <header class="page-head"><div><h1>👑 Espace administrateur</h1><p class="muted">Vue d'ensemble de MGTCG</p></div></header>
      <div class="stat-row">
        <div class="stat"><strong>${users.length}</strong><span>comptes</span></div>
        <div class="stat"><strong>${newThisWeek}</strong><span>nouveaux cette semaine</span></div>
        <div class="stat"><strong>${cols.length}</strong><span>collections en ligne</span></div>
        <div class="stat"><strong>${activeThisWeek}</strong><span>actifs cette semaine</span></div>
      </div>
      <section><h2>Utilisateurs</h2>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Email</th><th>Rôle</th><th>Inscrit le</th><th>Dernière sauvegarde</th></tr></thead>
          <tbody>${users.map((u) => `<tr>
            <td>${esc(u.email)}</td>
            <td>${u.role === "admin" ? "👑 admin" : "utilisateur"}</td>
            <td>${esc(fmtDate(u.created_at))}</td>
            <td>${lastSeen.has(u.id) ? esc(fmtDate(lastSeen.get(u.id))) : "<span class='muted'>—</span>"}</td>
          </tr>`).join("")}</tbody></table></div>
        <p class="disclaimer">Les emails des utilisateurs sont des données personnelles : ne les partage pas et ne les utilise pas pour autre chose que le fonctionnement du site (RGPD).</p>
      </section>`;
  };

  document.addEventListener("DOMContentLoaded", () => {
    MG.on("store", schedulePush);
    init();
  });
})(window.MG);
