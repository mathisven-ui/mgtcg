/* ==========================================================
   MGTCG — pwa.js   (V3)
   Application installable (écran d'accueil du téléphone ou de
   l'ordinateur) et fonctionnement hors ligne.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  let deferred = null; // invitation d'installation (Chrome, Edge, Android)
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  // Service worker (seulement sur un vrai site en https)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { /* pas grave */ }); });
  }

  // Clic sur une notification de l'appareil quand le site est déjà ouvert
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", (e) => { const h = e.data && e.data.mgtcgHref; if (typeof h === "string" && h.startsWith("#/")) location.hash = h; });

  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
  window.addEventListener("appinstalled", () => { deferred = null; MG.ui && MG.ui.toast("MGTCG est installée ✓"); });

  function openInstall() {
    const { $ } = MG.ui;
    let how;
    if (standalone()) how = `<p>✅ Tu utilises déjà l'appli MGTCG.</p>`;
    else if (deferred) how = `<p>Ajoute MGTCG à ton écran d'accueil : elle s'ouvrira comme une vraie appli, en plein écran, même sans réseau pour ta collection.</p><button class="btn full" id="pwa-go">📱 Installer MGTCG</button>`;
    else if (isIOS) how = `<ol class="sh-steps"><li>Ouvre le site dans <b>Safari</b>.</li><li>Touche le bouton <b>Partager</b> (le carré avec une flèche vers le haut).</li><li>Choisis <b>« Sur l'écran d'accueil »</b>, puis <b>Ajouter</b>.</li></ol>`;
    else if (isAndroid) how = `<ol class="sh-steps"><li>Ouvre le site dans <b>Chrome</b>.</li><li>Touche le menu <b>⋮</b> en haut à droite.</li><li>Choisis <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</li></ol>`;
    else how = `<ol class="sh-steps"><li>Dans <b>Chrome</b> ou <b>Edge</b>, clique sur l'icône d'installation à droite de la barre d'adresse (un écran avec une flèche).</li><li>Ou passe par le menu <b>⋮</b> → <b>« Installer MGTCG »</b>.</li></ol><p class="muted small">Sur téléphone, c'est encore plus pratique : ouvre le site et suis les mêmes étapes.</p>`;
    $("#modal-body").innerHTML = `<h2 id="modal-title">📱 Installer l'appli MGTCG</h2>${how}
      <p class="muted small">Gratuit, sans passer par un magasin d'applications, et ça ne prend presque pas de place. Hors ligne, tu retrouves ta collection, tes listes et les cartes déjà consultées ; les prix et les fonctions en ligne (comptes, échanges, boutiques…) reviennent dès que tu as du réseau.</p>`;
    $("#modal").hidden = false; document.body.classList.add("noscroll");
    const go = document.getElementById("pwa-go");
    if (go) go.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      $("#modal-body").innerHTML = `<div class="state"><p>${outcome === "accepted" ? "✅ C'est installé ! Retrouve MGTCG sur ton écran d'accueil." : "Pas de souci, tu pourras l'installer plus tard."}</p></div>`;
    });
  }
  MG.installApp = openInstall;

  // Hors ligne
  function offlineBanner() {
    let el = document.getElementById("offline");
    if (navigator.onLine) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div");
      el.id = "offline"; el.className = "offline-banner"; el.setAttribute("role", "status");
      el.textContent = "📴 Hors ligne : ta collection reste disponible, les prix et les fonctions en ligne reviendront avec le réseau.";
      document.body.prepend(el);
    }
  }
  window.addEventListener("offline", offlineBanner);
  window.addEventListener("online", () => { offlineBanner(); MG.ui && MG.ui.toast("De retour en ligne ✓"); });

  function mount() {
    offlineBanner();
    const box = document.querySelector(".footer-inner");
    if (box && !document.getElementById("pwa-link")) {
      const a = document.createElement("button");
      a.id = "pwa-link"; a.className = "link-btn accent-link small"; a.type = "button";
      a.textContent = standalone() ? "📱 Appli MGTCG" : "📱 Installer l'appli";
      a.addEventListener("click", openInstall);
      box.appendChild(a);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})(window.MG);
