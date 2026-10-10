/* ==========================================================
   MGTCG — drapeaux.js
   Petits drapeaux dessinés en SVG : ils s'affichent partout,
   même sur Windows (qui ne sait pas afficher les drapeaux emoji).
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  // Dessins simplifiés (format 3:2, 30 × 20)
  const tri = (a, b, c, vertical) => vertical
    ? `<rect width="10" height="20" fill="${a}"/><rect x="10" width="10" height="20" fill="${b}"/><rect x="20" width="10" height="20" fill="${c}"/>`
    : `<rect width="30" height="7" fill="${a}"/><rect y="6.6" width="30" height="7" fill="${b}"/><rect y="13.3" width="30" height="6.7" fill="${c}"/>`;

  const FLAGS = {
    fr: tri("#0055a4", "#fff", "#ef4135", true),
    it: tri("#009246", "#fff", "#ce2b37", true),
    de: tri("#000", "#dd0000", "#ffce00", false),
    es: `<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>`,
    ja: `<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>`,
    id: `<rect width="30" height="10" fill="#ce1126"/><rect y="10" width="30" height="10" fill="#fff"/>`,
    th: `<rect width="30" height="20" fill="#a51931"/><rect y="3.3" width="30" height="13.4" fill="#f4f5f8"/><rect y="6.7" width="30" height="6.6" fill="#2d2a4a"/>`,
    "zh-cn": `<rect width="30" height="20" fill="#de2910"/><path d="M5 3 l1.2 3.6 h3.8 l-3 2.2 1.1 3.6 -3.1 -2.2 -3.1 2.2 1.1 -3.6 -3 -2.2 h3.8z" fill="#ffde00"/>`,
    "zh-tw": `<rect width="30" height="20" fill="#fe0000"/><rect width="15" height="10" fill="#000095"/><circle cx="7.5" cy="5" r="2.6" fill="#fff"/>`,
    ko: `<rect width="30" height="20" fill="#fff"/><path d="M15 5 a5 5 0 0 1 0 10 a2.5 2.5 0 0 1 0 -5 a2.5 2.5 0 0 0 0 -5z" fill="#003478"/><path d="M15 5 a5 5 0 0 0 0 10 a2.5 2.5 0 0 0 0 -5 a2.5 2.5 0 0 1 0 -5z" fill="#c60c30"/><g stroke="#000" stroke-width="1"><path d="M4 4 l3 -2 M5 5.5 l3 -2 M22 2 l3 2 M23 3.5 l3 2 M4 16 l3 2 M5 14.5 l3 2 M22 18 l3 -2 M23 16.5 l3 -2"/></g>`,
    "pt-br": `<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.5 L27 10 L15 17.5 L3 10 Z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.2" fill="#002776"/>`,
    en: `<rect width="30" height="20" fill="#012169"/><path d="M0 0 L30 20 M30 0 L0 20" stroke="#fff" stroke-width="4"/><path d="M0 0 L30 20 M30 0 L0 20" stroke="#c8102e" stroke-width="1.6"/><path d="M15 0 V20 M0 10 H30" stroke="#fff" stroke-width="6"/><path d="M15 0 V20 M0 10 H30" stroke="#c8102e" stroke-width="3.4"/>`,
  };
  FLAGS.zh = FLAGS["zh-cn"];

  const cache = {};
  // Renvoie une petite image <img> du drapeau (ou rien si inconnu)
  MG.flag = function (code, title) {
    const svg = FLAGS[code];
    if (!svg) return "";
    if (!cache[code]) {
      cache[code] = "data:image/svg+xml," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">${svg}</svg>`);
    }
    const t = String(title || "").replace(/"/g, "");
    return `<img class="flag-img" src="${cache[code]}" alt="${t}" title="${t}" width="18" height="12">`;
  };
})(window.MG);
