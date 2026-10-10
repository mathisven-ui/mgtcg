/* ==========================================================
   MGTCG — visuels.js
   Illustrations des produits scellés, dessinées en SVG
   (créations originales MGTCG) avec le vrai logo de
   l'extension posé dessus. Si TCGdex fournit le visuel
   réel du booster, on l'utilise à la place.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let uid = 0;

  // Logo de l'extension posé dans une zone (x, y, largeur, hauteur)
  const logo = (url, x, y, w, h) => url
    ? `<image href="${esc(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
    : `<rect x="${x + w * 0.15}" y="${y + h * 0.3}" width="${w * 0.7}" height="${h * 0.4}" rx="6" fill="rgba(255,255,255,.25)"/>`;

  // Un booster (réutilisé dans plusieurs produits)
  function pack(x, y, w, h, c1, c2, url, id) {
    const crimp = (yy) => Array.from({ length: Math.floor(w / 4) }, (_, i) => `<rect x="${x + i * 4 + 1}" y="${yy}" width="2" height="${h * 0.05}" fill="rgba(0,0,0,.18)"/>`).join("");
    return `
      <linearGradient id="pk${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="url(#pk${id})"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h * 0.07}" fill="rgba(255,255,255,.35)"/>
      <rect x="${x}" y="${y + h * 0.93}" width="${w}" height="${h * 0.07}" fill="rgba(255,255,255,.35)"/>
      ${crimp(y + h * 0.01)}${crimp(y + h * 0.94)}
      <path d="M${x + w * 0.1} ${y + h * 0.12} L${x + w * 0.35} ${y + h * 0.12} L${x + w * 0.1} ${y + h * 0.6} Z" fill="rgba(255,255,255,.18)"/>
      <circle cx="${x + w * 0.5}" cy="${y + h * 0.68}" r="${w * 0.22}" fill="rgba(255,255,255,.15)"/>
      ${logo(url, x + w * 0.08, y + h * 0.16, w * 0.84, h * 0.3)}`;
  }

  const SHAPES = {
    Booster: (u, i) => pack(52, 4, 56, 112, "#ff9a3c", "#c2185b", u, i),
    Blister: (u, i) => `
      <rect x="40" y="6" width="80" height="108" rx="6" fill="#e9eef8"/>
      <circle cx="80" cy="14" r="4" fill="#9aa1b9"/>
      <rect x="40" y="6" width="80" height="22" rx="6" fill="#3d6fd8"/>
      ${logo(u, 46, 8, 68, 18)}
      <rect x="52" y="32" width="56" height="76" rx="8" fill="rgba(160,200,255,.35)" stroke="rgba(255,255,255,.9)" stroke-width="2"/>
      ${pack(60, 36, 40, 68, "#7b5cff", "#1e88e5", u, i)}`,
    Tripack: (u, i) => `
      <rect x="22" y="10" width="116" height="102" rx="6" fill="#e9eef8"/>
      <rect x="22" y="10" width="116" height="20" rx="6" fill="#d32f2f"/>
      ${logo(u, 50, 12, 60, 16)}
      <g transform="rotate(-8 50 70)">${pack(32, 36, 34, 70, "#26a69a", "#00695c", u, i + "a")}</g>
      ${pack(63, 34, 34, 72, "#ffb300", "#e65100", u, i + "b")}
      <g transform="rotate(8 110 70)">${pack(94, 36, 34, 70, "#5c6bc0", "#283593", u, i + "c")}</g>`,
    ETB: (u, i) => `
      <linearGradient id="e${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7e57c2"/><stop offset="1" stop-color="#3f1d8a"/></linearGradient>
      <path d="M30 34 L80 18 L130 34 L80 50 Z" fill="#9c7ae0"/>
      <path d="M30 34 L80 50 L80 112 L30 96 Z" fill="url(#e${i})"/>
      <path d="M130 34 L80 50 L80 112 L130 96 Z" fill="#2d1466"/>
      <path d="M30 34 L80 50 L80 60 L30 44 Z" fill="rgba(255,255,255,.18)"/>
      ${logo(u, 34, 58, 42, 30)}`,
    Display: (u, i) => `
      <rect x="18" y="40" width="124" height="70" rx="4" fill="#1565c0"/>
      <rect x="18" y="40" width="124" height="16" fill="#0d47a1"/>
      ${Array.from({ length: 9 }, (_, k) => pack(24 + k * 13, 18 - (k % 2) * 4, 12, 40, k % 2 ? "#ff7043" : "#ffca28", k % 2 ? "#bf360c" : "#f57f17", null, i + "d" + k)).join("")}
      <rect x="18" y="52" width="124" height="58" rx="4" fill="#1976d2"/>
      ${logo(u, 34, 60, 92, 40)}`,
    Coffret: (u, i) => `
      <linearGradient id="c${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ef5350"/><stop offset="1" stop-color="#8e0000"/></linearGradient>
      <rect x="20" y="14" width="120" height="96" rx="6" fill="url(#c${i})"/>
      <rect x="28" y="40" width="58" height="62" rx="6" fill="rgba(200,230,255,.3)" stroke="rgba(255,255,255,.8)" stroke-width="2"/>
      <rect x="36" y="48" width="42" height="46" rx="3" fill="#fff8e1"/><circle cx="57" cy="66" r="10" fill="#ffd54f"/>
      ${pack(94, 44, 18, 54, "#ffca28", "#f57f17", null, i + "x")}${pack(114, 44, 18, 54, "#4fc3f7", "#0277bd", null, i + "y")}
      ${logo(u, 34, 16, 92, 22)}`,
    UPC: (u, i) => `
      <linearGradient id="u${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b2b2b"/><stop offset="1" stop-color="#0b0b0b"/></linearGradient>
      <linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b8892b"/><stop offset=".5" stop-color="#ffe08a"/><stop offset="1" stop-color="#b8892b"/></linearGradient>
      <rect x="12" y="16" width="136" height="92" rx="6" fill="url(#u${i})"/>
      <rect x="16" y="20" width="128" height="84" rx="4" fill="none" stroke="url(#g${i})" stroke-width="2"/>
      <rect x="12" y="84" width="136" height="6" fill="url(#g${i})"/>
      ${logo(u, 30, 28, 100, 46)}
      <text x="80" y="101" text-anchor="middle" font-size="8" font-weight="700" fill="#ffe08a" letter-spacing="2">ULTRA PREMIUM</text>`,
    "Pokébox": (u, i) => `
      <linearGradient id="t${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#90a4ae"/><stop offset=".45" stop-color="#eceff1"/><stop offset="1" stop-color="#78909c"/></linearGradient>
      <rect x="28" y="30" width="104" height="80" rx="10" fill="url(#t${i})"/>
      <rect x="24" y="22" width="112" height="22" rx="8" fill="#b0bec5"/>
      <rect x="24" y="22" width="112" height="22" rx="8" fill="none" stroke="#607d8b" stroke-width="1.5"/>
      <rect x="40" y="56" width="80" height="44" rx="6" fill="#263238"/>
      ${logo(u, 44, 60, 72, 36)}`,
    Peluches: () => `
      <ellipse cx="80" cy="104" rx="42" ry="6" fill="rgba(0,0,0,.25)"/>
      <circle cx="56" cy="34" r="12" fill="#ffb74d"/><circle cx="104" cy="34" r="12" fill="#ffb74d"/>
      <circle cx="56" cy="34" r="6" fill="#ffe0b2"/><circle cx="104" cy="34" r="6" fill="#ffe0b2"/>
      <ellipse cx="80" cy="76" rx="38" ry="30" fill="#ffb74d"/>
      <circle cx="80" cy="52" r="26" fill="#ffcc80"/>
      <circle cx="70" cy="50" r="3.5" fill="#3e2723"/><circle cx="90" cy="50" r="3.5" fill="#3e2723"/>
      <ellipse cx="80" cy="59" rx="6" ry="4" fill="#ffe0b2"/><path d="M76 61 Q80 64 84 61" stroke="#3e2723" stroke-width="1.5" fill="none"/>
      <ellipse cx="80" cy="84" rx="18" ry="14" fill="#ffe0b2"/>`,
    Classeur: (u, i) => `
      <rect x="40" y="10" width="86" height="102" rx="6" fill="#283593"/>
      <rect x="40" y="10" width="14" height="102" rx="4" fill="#1a237e"/>
      ${[30, 60, 90].map((y) => `<circle cx="47" cy="${y}" r="3" fill="#9fa8da"/>`).join("")}
      <rect x="62" y="22" width="56" height="78" rx="4" fill="rgba(255,255,255,.12)"/>
      ${logo(u, 64, 40, 52, 36)}
      <rect x="120" y="50" width="10" height="20" rx="3" fill="#ffca28"/>`,
    "Protège-cartes": (u, i) => `
      ${[0, 1, 2].map((k) => `<rect x="${44 + k * 10}" y="${14 + k * 6}" width="58" height="84" rx="4" fill="${["#7e57c2", "#5e35b1", "#4527a0"][k]}" stroke="rgba(255,255,255,.4)"/>`).join("")}
      <rect x="64" y="26" width="58" height="84" rx="4" fill="rgba(180,220,255,.25)" stroke="rgba(255,255,255,.8)"/>
      ${logo(u, 68, 48, 50, 34)}`,
    Figurines: () => `
      <ellipse cx="80" cy="104" rx="36" ry="8" fill="#455a64"/><rect x="44" y="96" width="72" height="8" fill="#546e7a"/>
      <ellipse cx="80" cy="96" rx="36" ry="8" fill="#78909c"/>
      <path d="M62 94 Q58 70 70 56 Q66 40 80 30 Q94 40 90 56 Q102 70 98 94 Z" fill="#26c6da"/>
      <path d="M70 56 Q80 50 90 56" stroke="#00838f" stroke-width="2" fill="none"/>
      <circle cx="75" cy="42" r="3" fill="#004d40"/><circle cx="86" cy="42" r="3" fill="#004d40"/>
      <path d="M90 60 Q112 52 116 34 Q104 44 92 50" fill="#4dd0e1"/>`,
  };
  SHAPES["Mini-tin"] = SHAPES["Pokébox"];
  SHAPES["Collection premium"] = SHAPES.UPC;
  SHAPES["Autre"] = SHAPES.Coffret;

  const BG = {
    Booster: ["#3a1d3f", "#1b1e2c"], Blister: ["#1d2f4f", "#1b1e2c"], Tripack: ["#3f1d1d", "#1b1e2c"], ETB: ["#2b1d4f", "#1b1e2c"],
    Display: ["#13294b", "#1b1e2c"], Coffret: ["#3f1d24", "#1b1e2c"], UPC: ["#3a3322", "#1b1e2c"], "Pokébox": ["#22313a", "#1b1e2c"],
    Peluches: ["#3f2f1d", "#1b1e2c"], Classeur: ["#1d2350", "#1b1e2c"], "Protège-cartes": ["#2b1d4f", "#1b1e2c"], Figurines: ["#1d3a3f", "#1b1e2c"],
  };

  // type : clé de SHAPES ; logoUrl : logo de l'extension ; realUrl : visuel réel (booster TCGdex)
  MG.visuel = function (type, logoUrl, realUrl, alt) {
    const i = ++uid;
    const [b1, b2] = BG[type] || ["#232738", "#1b1e2c"];
    const bg = `background: radial-gradient(circle at 50% 35%, ${b1}, ${b2} 75%)`;
    const draw = SHAPES[type] || SHAPES.Coffret;
    const svg = `<svg viewBox="0 0 160 120" role="img" aria-label="${esc(alt || type)}">${draw(logoUrl, i)}</svg>`;
    // Visuel réel par-dessus le dessin : s'il ne charge pas, le dessin reste visible
    const real = realUrl ? `<img class="visuel-real" src="${esc(realUrl)}" alt="${esc(alt || type)}" loading="lazy" onerror="this.remove()">` : "";
    return `<div class="visuel" style="${bg}">${svg}${real}</div>`;
  };
})(window.MG);
