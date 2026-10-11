/* ==========================================================
   MGTCG — devises.js   (V3)
   Affichage des prix dans la devise choisie (€, $, £, CHF, CA$, ¥).
   Les prix Cardmarket sont en euros : ils sont convertis avec le
   taux du jour de la Banque centrale européenne (frankfurter.app).
   Les montants que l'on saisit restent en euros.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const CURS = { EUR: "€ Euro", USD: "$ Dollar US", GBP: "£ Livre sterling", CHF: "CHF Franc suisse", CAD: "CA$ Dollar canadien", JPY: "¥ Yen" };
  const KEY = "mgtcg:devise", RATES = "mgtcg:taux";
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } };
  let cur = read(KEY);
  if (!CURS[cur]) cur = "EUR";
  let rates = read(RATES); // { date, at, rates: { USD: 1.1, … } }
  let loading = null;

  async function loadRates(force) {
    if (!force && rates && rates.rates && Date.now() - (rates.at || 0) < 12 * 3600e3) return rates;
    if (loading) return loading;
    loading = fetch("https://api.frankfurter.app/latest?from=EUR&to=" + Object.keys(CURS).filter((c) => c !== "EUR").join(","))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("taux"))))
      .then((d) => {
        const clean = {};
        for (const [c, v] of Object.entries((d && d.rates) || {})) if (CURS[c] && typeof v === "number" && v > 0 && v < 10000) clean[c] = v;
        if (Object.keys(clean).length) { rates = { date: String(d.date || "").slice(0, 10), at: Date.now(), rates: clean }; write(RATES, rates); }
        return rates;
      })
      .catch(() => rates)
      .finally(() => { loading = null; });
    return loading;
  }

  // Formate un montant en euros dans la devise choisie
  function money(n, o) {
    if (typeof n !== "number" || !isFinite(n)) return "—";
    let c = cur, v = n;
    if (c !== "EUR") {
      const r = rates && rates.rates && rates.rates[c];
      if (r) v = n * r; else c = "EUR"; // pas encore de taux : on reste en euros
    }
    const opts = { style: "currency", currency: c };
    if (c === "JPY") opts.maximumFractionDigits = 0;
    else if (o && o.round) opts.maximumFractionDigits = Math.abs(v) >= 100 ? 0 : 2;
    return v.toLocaleString("fr-FR", opts);
  }
  money.code = () => cur;
  money.isConverted = () => cur !== "EUR" && !!(rates && rates.rates && rates.rates[cur]);
  money.set = async (c) => {
    if (!CURS[c]) return;
    cur = c; write(KEY, c);
    if (c !== "EUR") await loadRates();
    renderNote();
    if (MG.route) MG.route();
  };
  MG.money = money;
  MG.CURRENCIES = CURS;

  // Petit rappel en bas de page quand les prix sont convertis
  function renderNote() {
    let el = document.getElementById("cur-note");
    const box = document.querySelector(".footer-inner");
    if (!box) return;
    if (!el) { el = document.createElement("div"); el.id = "cur-note"; el.className = "muted small cur-note"; box.appendChild(el); }
    el.textContent = money.isConverted()
      ? `Prix affichés en ${cur}, convertis depuis l'euro (taux BCE du ${new Date(rates.date + "T12:00:00").toLocaleDateString("fr-FR")}). Les montants que tu saisis restent en euros.`
      : cur !== "EUR" ? "Taux de change indisponible pour le moment : prix affichés en euros." : "";
    el.hidden = !el.textContent;
  }

  function mount() {
    const sel = document.getElementById("cur");
    if (sel) {
      sel.innerHTML = Object.entries(CURS).map(([c, l]) => `<option value="${c}" ${c === cur ? "selected" : ""} title="${l}">${l.split(" ")[0]}</option>`).join("");
      sel.addEventListener("change", () => money.set(sel.value));
    }
    renderNote();
    if (cur !== "EUR") loadRates().then(() => { renderNote(); if (MG.route && money.isConverted()) MG.route(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})(window.MG);
