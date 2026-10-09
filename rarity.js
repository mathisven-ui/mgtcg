/* ==========================================================
   MGTCG — rarity.js
   Transforme le texte de rareté (dans n'importe quelle langue)
   en une icône comme sur les vraies cartes.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  // Ordre important : du plus précis au plus général
  const RULES = [
    { test: /ace ?spec/, icon: "ACE", cls: "r-ace", label: "ACE SPEC" },
    { test: /special illustration|illustration spéciale|sar\b|スペシャルアート/, icon: "★★", cls: "r-gold", label: "Illustration spéciale rare" },
    { test: /hyper|gold|secret|\bur\b|rare or\b/, icon: "★★★", cls: "r-gold", label: "Hyper rare" },
    { test: /illustration|\bar\b|アート/, icon: "★", cls: "r-gold", label: "Illustration rare" },
    { test: /shiny|chromatique|\bs\b|\bssr\b/, icon: "✦", cls: "r-shiny", label: "Chromatique" },
    { test: /ultra|\bsr\b|full art/, icon: "★★", cls: "r-silver", label: "Ultra rare" },
    { test: /double|\brr\b/, icon: "★★", cls: "r-black", label: "Double rare" },
    { test: /amazing|radiant|radieu|crown|couronne|legend|légende|prism|prisme|break|lv\.?x|star|étoile/, icon: "✧", cls: "r-special", label: "Rareté spéciale" },
    { test: /holo/, icon: "★", cls: "r-holo", label: "Rare holo" },
    { test: /uncommon|peu commune|\bu\b|non comune|infrecuente|incomum/, icon: "◆", cls: "r-unc", label: "Peu commune" },
    { test: /common|commune|\bc\b|comune|común|comum/, icon: "●", cls: "r-com", label: "Commune" },
    { test: /promo/, icon: "P", cls: "r-promo", label: "Promo" },
    { test: /rare|\br\b/, icon: "★", cls: "r-rare", label: "Rare" },
  ];

  MG.rarity = function (text) {
    if (!text || /^none$|sans rareté/i.test(text)) return { icon: "–", cls: "r-none", label: "Sans rareté" };
    const t = String(text).toLowerCase();
    for (const r of RULES) if (r.test.test(t)) return { icon: r.icon, cls: r.cls, label: text };
    return { icon: "•", cls: "r-none", label: text };
  };
})(window.MG);
