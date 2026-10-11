/* ==========================================================
   MGTCG — i18n.js   (site en anglais)
   Le site est écrit en français. Quand la langue du site est
   l'anglais, ce fichier traduit à la volée tout ce qui s'affiche
   (textes, boutons, infobulles, messages) grâce au dictionnaire
   i18n-en.js, et passe les dates et nombres au format anglais.
   Les noms des cartes viennent de la langue des cartes choisie.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const KEY = "mgtcg:langue-site";
  const read = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const write = (v) => { try { localStorage.setItem(KEY, v); } catch (e) { /* rien */ } };
  let saved = read();
  const auto = !saved;
  const lang = saved === "en" || saved === "fr" ? saved : (navigator.language && !/^fr/i.test(navigator.language) ? "en" : "fr");
  MG.uiLang = () => lang;
  MG.setUiLang = (l) => { write(l === "en" ? "en" : "fr"); location.reload(); };

  // Petit bouton dans le pied de page pour changer la langue du site
  function mountSwitch() {
    const box = document.querySelector(".footer-inner");
    if (!box || document.getElementById("ui-lang")) return;
    const b = document.createElement("button");
    b.id = "ui-lang"; b.type = "button"; b.className = "link-btn accent-link small ui-lang"; b.setAttribute("translate", "no");
    const other = lang === "en" ? "fr" : "en";
    b.innerHTML = `${MG.flag ? MG.flag(other === "en" ? "en" : "fr", "") : ""} ${other === "en" ? "English version" : "Version française"}`;
    b.addEventListener("click", () => MG.setUiLang(other));
    box.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountSwitch); else mountSwitch();

  if (lang !== "en" || !MG.I18N_EN) return;

  /* ---------------- Dictionnaire ---------------- */
  document.documentElement.lang = "en";
  const exact = new Map();
  const pats = [];
  for (const [fr, en] of Object.entries(MG.I18N_EN)) {
    if (!/\{\d+\}/.test(fr)) { exact.set(fr, en); continue; }
    const statics = fr.split(/\{\d+\}/).map((x) => x.trim()).filter(Boolean).sort((a, b) => b.length - a.length);
    const staticLen = statics.join("").replace(/[^A-Za-zÀ-ÿ]/g, "").length;
    if (staticLen < 3) continue; // trop vague, risque de mauvaise traduction
    const order = [];
    const parts = fr.split(/(\{\d+\})/);
    const src = parts.map((part, i) => {
      const m = /^\{(\d+)\}$/.exec(part);
      if (!m) {
        let t = part;
        if (i > 0) t = t.replace(/^\s+/, "\u0001");                // espace juste après un {n}
        if (i < parts.length - 1) t = t.replace(/\s+$/, "\u0002"); // espace juste avant un {n}
        return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+").replace(/[\u0001\u0002]/g, "\\s*");
      }
      order.push(+m[1]);
      const before = parts[i - 1] || "";
      // « carte{1} » : terminaison du pluriel (s, es…) ; motif court : seulement des chiffres / montants
      if (/[A-Za-zÀ-ÿ]$/.test(before)) return "([A-Za-zÀ-ÿ]{0,5})";
      const endAfterWord = parts.slice(i + 1).every((x) => !x.trim()) && /[A-Za-zÀ-ÿ]{4,}\s+$/.test(before);
      const atStart = parts.slice(0, i).every((x) => !x.trim());
      if (staticLen < 12 && atStart && !endAfterWord) return "([^a-zà-ÿ]*?)";
      return "([\\s\\S]*?)";
    }).join("");
    pats.push({ re: new RegExp("^" + src + "$"), en, order, frag: statics[0] || "", weight: staticLen });
  }
  pats.sort((a, b) => b.weight - a.weight);
  const cache = new Map();
  const FR_LETTER = /[A-Za-zÀ-ÿ]/;

  function trCore(core) {
    if (cache.has(core)) return cache.get(core);
    let out = exact.has(core) ? exact.get(core) : null;
    if (out === null) {
      const flat = core.replace(/\s+/g, " ");
      if (exact.has(flat)) out = exact.get(flat);
      else for (const p of pats) {
        if (p.frag && !flat.includes(p.frag)) continue;
        const m = p.re.exec(flat);
        if (!m) continue;
        const caps = {};
        p.order.forEach((n, i) => { caps[n] = m[i + 1]; });
        out = p.en.replace(/\{(\d+)\}/g, (_, n) => { const c = caps[n] ?? ""; const t = c.trim(); if (!t || t === flat) return c; const r = trCore(t); return r === null ? c : c.replace(t, r); });
        break;
      }
    }
    if (out === null) {
      const pm = /^([^A-Za-zÀ-ÿ0-9«“"(]+)(\S[\s\S]*)$/.exec(core);
      if (pm && pm[2] !== core) { const r = trCore(pm[2]); if (r !== null) out = pm[1] + r; }
    }
    if (cache.size > 20000) cache.clear();
    cache.set(core, out);
    return out;
  }
  function tr(s) {
    if (!s || !FR_LETTER.test(s)) return s;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    const out = trCore(m[2]);
    return out === null ? s : m[1] + out + m[3];
  }
  MG.t = tr;

  /* ---------------- Traduction de la page ---------------- */
  const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "NOSCRIPT"]);
  const ATTRS = ["placeholder", "title", "aria-label", "alt"];
  function skipped(el) {
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (SKIP.has(e.tagName) || e.getAttribute("translate") === "no" || e.isContentEditable) return true;
    }
    return false;
  }
  function doText(n) {
    if (!n.parentElement || n.parentElement.tagName === "TEXTAREA" || skipped(n.parentElement)) return;
    const v = n.data, t = tr(v);
    if (t !== v) n.data = t;
  }
  function doAttrs(el) {
    if (skipped(el)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
    if (el.tagName === "INPUT" && (el.type === "submit" || el.type === "button") && el.value) { const t = tr(el.value); if (t !== el.value) el.value = t; }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || skipped(root)) return;
    doAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) doText(n); else doAttrs(n); }
  }
  const obs = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "characterData") doText(m.target);
      else if (m.type === "attributes") doAttrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  });
  function start() {
    walk(document.body);
    if (document.title) document.title = tr(document.title);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    new MutationObserver(() => { const t = tr(document.title); if (t !== document.title) document.title = t; }).observe(document.querySelector("title") || document.head, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  /* ---------------- Fenêtres, dates et nombres ---------------- */
  const wrap = (fn) => function (msg, ...rest) { return fn.call(window, typeof msg === "string" ? tr(msg) : msg, ...rest); };
  window.alert = wrap(window.alert); window.confirm = wrap(window.confirm); window.prompt = wrap(window.prompt);
  const loc = (l) => (l === "fr-FR" || l === "fr" ? "en-GB" : l);
  const nTo = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (l, o) { return nTo.call(this, loc(l), o); };
  for (const f of ["toLocaleDateString", "toLocaleTimeString", "toLocaleString"]) {
    const orig = Date.prototype[f];
    Date.prototype[f] = function (l, o) { return orig.call(this, loc(l), o); };
  }

  // Première visite en anglais : les cartes aussi en anglais (modifiable en haut à droite)
  if (auto) { write("en"); try { if (!localStorage.getItem("mgtcg:data:v1") && MG.store && MG.store.setLang) MG.store.setLang("en"); } catch (e) { /* rien */ } }
})(window.MG);
