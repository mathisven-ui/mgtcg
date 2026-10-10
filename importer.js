/* ==========================================================
   MGTCG — importer.js   (V3)
   Importer sa collection depuis une autre appli ou un tableur :
   fichier CSV / Excel (.xlsx) ou tableau copié-collé.
   Tout se passe dans le navigateur : le fichier n'est envoyé nulle part.
   Créé par Mathis GILLIG.
   ========================================================== */
window.MG = window.MG || {};

(function (MG) {
  "use strict";

  const MAX_ROWS = 5000;
  const MAX_SIZE = 5 * 1024 * 1024;
  const ui = () => MG.ui;

  /* ---------------- Colonnes reconnues ---------------- */
  const FIELDS = [
    { k: "set", label: "Extension (nom ou code)", words: ["extension", "set", "setname", "setcode", "expansion", "edition", "exp", "expname", "serieextension", "collection"] },
    { k: "num", label: "Numéro de la carte", words: ["numero", "number", "num", "no", "n", "cardnumber", "nr", "collectornumber", "numerocarte", "localid", "id"] },
    { k: "name", label: "Nom de la carte", words: ["nom", "name", "cardname", "carte", "card", "productname", "nomcarte", "localname", "nameenglish"] },
    { k: "lang", label: "Langue", words: ["langue", "language", "lang", "langage", "idlanguage"] },
    { k: "variant", label: "Version (normale, reverse, holo…)", words: ["version", "variante", "variant", "printing", "finish", "foil", "isfoil", "reverse", "variance", "type"] },
    { k: "qty", label: "Quantité", words: ["quantite", "quantity", "qty", "count", "nombre", "qte", "amount"] },
    { k: "paid", label: "Prix d'achat", words: ["prixdachat", "prixachat", "purchaseprice", "pricepaid", "paid", "cost", "achat", "prixpaye", "buyprice", "costbasis"] },
    { k: "date", label: "Date d'achat", words: ["datedachat", "dateachat", "purchasedate", "date", "dateadded", "added", "acquired"] },
  ];

  // Codes officiels du jeu en ligne → identifiants TCGdex (ères récentes)
  const CODES = {
    SVI: "sv01", PAL: "sv02", OBF: "sv03", MEW: "sv03.5", PAR: "sv04", PAF: "sv04.5", TEF: "sv05", TWM: "sv06",
    SFA: "sv06.5", SCR: "sv07", SSP: "sv08", PRE: "sv08.5", JTG: "sv09", DRI: "sv10",
    SSH: "swsh1", RCL: "swsh2", DAA: "swsh3", CPA: "swsh3.5", VIV: "swsh4", SHF: "swsh4.5", BST: "swsh5",
    CRE: "swsh6", EVS: "swsh7", CEL: "cel25", FST: "swsh8", BRS: "swsh9", ASR: "swsh10", PGO: "swsh10.5",
    LOR: "swsh11", SIT: "swsh12", CRZ: "swsh12.5",
  };
  // Langues : textes courants + numéros utilisés par Cardmarket
  const LANG_WORDS = {
    fr: ["fr", "fra", "fre", "french", "francais", "2"], en: ["en", "eng", "english", "anglais", "1"],
    ja: ["ja", "jp", "jap", "jpn", "japanese", "japonais", "7"], de: ["de", "ger", "deu", "german", "deutsch", "allemand", "3"],
    es: ["es", "spa", "spanish", "espagnol", "espanol", "4"], it: ["it", "ita", "italian", "italien", "italiano", "5"],
    "pt-br": ["pt", "ptbr", "portuguese", "portugais", "portugues", "8"], ko: ["ko", "kr", "kor", "korean", "coreen", "10"],
    "zh-cn": ["zhcn", "chinese", "chinois", "chinoissimplifie", "schinese", "6"], "zh-tw": ["zhtw", "tchinese", "chinoistraditionnel", "11"],
    th: ["th", "thai"], id: ["id", "indonesian", "indonesien"],
  };

  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " et ").replace(/[^a-z0-9]/g, "");
  const normNum = (s) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^([A-Z]*)0+(\d)/, "$1$2");
  function normId(v) {
    let s = String(v).trim().toLowerCase().replace(/\s+/g, "").replace(/pt(\d)/g, ".$1");
    const m = s.match(/^sv(\d)(\D.*|)$/); // sv3.5 → sv03.5
    if (m) s = "sv0" + m[1] + m[2];
    return s;
  }
  function langOf(v, def) {
    const n = norm(v);
    if (!n) return def;
    for (const [code, words] of Object.entries(LANG_WORDS)) if (words.includes(n)) return code;
    return def;
  }
  function variantOf(v, header) {
    const n = norm(v);
    if (!n) return "normal";
    if (/reverse|revers|^rh$/.test(n)) return "reverse";
    if (/1st|first|1ere|premiere|1ed|edition1/.test(n)) return "firstEdition";
    if (/holo|foil|brillant/.test(n)) return "holo";
    if (/^(true|yes|oui|1|x|vrai)$/.test(n)) return /reverse|foil/.test(norm(header)) ? "reverse" : "holo";
    return "normal";
  }
  function money(v) {
    if (typeof v === "number") return isFinite(v) && v >= 0 ? v : null;
    let s = String(v ?? "").replace(/[^\d,.\-]/g, "");
    if (!s || s.startsWith("-")) return null;
    if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    else if (s.includes(",")) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
    const n = parseFloat(s);
    return isFinite(n) && n < 1e7 ? Math.round(n * 100) / 100 : null;
  }
  function dateOf(v) {
    const s = String(v ?? "").trim();
    if (!s) return "";
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (/^\d{5}(\.\d+)?$/.test(s)) { // date Excel (nombre de jours depuis 1900)
      const d = new Date(Date.UTC(1899, 11, 30) + parseFloat(s) * 864e5);
      return isNaN(d) ? "" : d.toISOString().slice(0, 10);
    }
    return "";
  }

  /* ---------------- Lecture des fichiers ---------------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/, 1)[0] || "";
    const count = (c) => first.split(c).length - 1;
    const sep = ["\t", ";", ","].sort((a, b) => count(b) - count(a))[0];
    const rows = []; let row = [], cell = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"' && cell === "") q = true;
      else if (c === sep) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); cell = ""; rows.push(row); row = [];
        if (rows.length > MAX_ROWS + 1) break;
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  // Petit lecteur de fichiers Excel (.xlsx = archive zip contenant du XML)
  async function parseXLSX(buf) {
    if (typeof DecompressionStream === "undefined") throw new Error("Ton navigateur ne sait pas lire les fichiers Excel : enregistre-le en CSV.");
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Fichier Excel illisible.");
    const files = {};
    let p = dv.getUint32(e + 16, true);
    for (let i = 0, n = dv.getUint16(e + 10, true); i < n && p + 46 <= u8.length; i++) {
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
      files[name] = { method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
      p += 46 + nl + xl + cl;
    }
    async function read(name) {
      const f = files[name];
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const raw = u8.subarray(start, start + f.size);
      if (f.method === 0) return new TextDecoder().decode(raw);
      if (f.method !== 8) throw new Error("Fichier Excel non pris en charge : enregistre-le en CSV.");
      return new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
    }
    const xml = (t) => new DOMParser().parseFromString(t, "application/xml");
    const tags = (node, t) => Array.from(node.getElementsByTagNameNS("*", t));
    const strings = [];
    const ss = await read("xl/sharedStrings.xml");
    if (ss) tags(xml(ss), "si").forEach((si) => strings.push(tags(si, "t").map((t) => t.textContent).join("")));
    const sheetName = files["xl/worksheets/sheet1.xml"] ? "xl/worksheets/sheet1.xml"
      : Object.keys(files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort()[0];
    if (!sheetName) throw new Error("Aucune feuille trouvée dans ce fichier Excel.");
    const doc = xml(await read(sheetName));
    const rows = [];
    for (const r of tags(doc, "row").slice(0, MAX_ROWS + 1)) {
      const row = [];
      tags(r, "c").forEach((c, i) => {
        const ref = (c.getAttribute("r") || "").replace(/\d+/g, "");
        let col = i;
        if (ref) { col = 0; for (const ch of ref) col = col * 26 + ch.charCodeAt(0) - 64; col--; }
        const t = c.getAttribute("t"), v = tags(c, "v")[0];
        let val = "";
        if (t === "s") val = strings[parseInt(v && v.textContent, 10)] ?? "";
        else if (t === "inlineStr") val = tags(c, "t").map((x) => x.textContent).join("");
        else if (t === "b") val = v && v.textContent === "1" ? "TRUE" : "FALSE";
        else val = v ? v.textContent : "";
        while (row.length < col) row.push("");
        row[col] = val;
      });
      rows.push(row);
    }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  function guessMapping(header) {
    const map = {};
    const used = new Set();
    for (const f of FIELDS) {
      let best = -1, score = 0;
      header.forEach((h, i) => {
        if (used.has(i)) return;
        const n = norm(h);
        if (!n) return;
        f.words.forEach((w) => {
          const s = n === w ? 3 : (w.length >= 4 && n.includes(w)) ? 2 : 0;
          if (s > score) { score = s; best = i; }
        });
      });
      if (best >= 0) { map[f.k] = best; used.add(best); }
    }
    return map;
  }

  /* ---------------- Page ---------------- */
  const S = { rows: null, header: null, map: {}, result: null, stop: [] };

  const R = (MG.routes = MG.routes || {});
  R.importer = function () {
    const { view, esc } = ui();
    S.rows = null; S.result = null;
    const lang = MG.store.lang;
    view().innerHTML = `
      <header class="page-head"><div>
        <h1>📥 Importer ma collection</h1>
        <p class="muted">Tu as déjà ta collection dans une autre appli ou dans un tableur ? Exporte-la en <b>CSV</b> ou en <b>Excel</b>, dépose le fichier ici, et MGTCG retrouve tes cartes automatiquement.</p>
      </div></header>
      <section class="tool-card">
        <h2>1. Ton fichier</h2>
        <div class="row imp-src">
          <label class="btn">📄 Choisir un fichier (CSV, Excel)<input type="file" id="imp-file" accept=".csv,.tsv,.txt,.xlsx,text/csv" hidden></label>
          <span class="muted small">ou</span>
          <button class="btn ghost" id="imp-paste-btn">📋 Coller un tableau</button>
          <button class="link-btn accent-link small" id="imp-model">Télécharger un modèle à remplir</button>
        </div>
        <div id="imp-paste" hidden>
          <textarea id="imp-text" rows="6" placeholder="Copie les lignes de ton tableau (avec la ligne des titres) et colle-les ici"></textarea>
          <button class="btn" id="imp-text-go">Lire le tableau</button>
        </div>
        <label class="imp-lang">Langue des cartes si le fichier ne la précise pas
          <select id="imp-lang">${MG.LANGS.map((l) => `<option value="${l.code}" ${l.code === lang ? "selected" : ""}>${esc(l.label)}</option>`).join("")}</select></label>
        <p class="muted small">🔒 Ton fichier reste sur ton appareil : il n'est envoyé nulle part. L'import <b>ajoute</b> des cartes, il ne supprime jamais rien.</p>
        <p class="form-msg" id="imp-msg" role="alert"></p>
      </section>
      <section class="tool-card" id="imp-step2" hidden></section>
      <section class="tool-card" id="imp-step3" hidden></section>`;

    const msg = (t) => { const m = document.getElementById("imp-msg"); m.textContent = t; m.className = "form-msg" + (t ? " err" : ""); };
    document.getElementById("imp-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (file.size > MAX_SIZE) return msg("Fichier trop gros (5 Mo maximum).");
      msg("");
      try {
        const rows = /\.xlsx$/i.test(file.name) ? await parseXLSX(await file.arrayBuffer()) : parseCSV(await file.text());
        loaded(rows, file.name);
      } catch (err) { msg(err.message || "Impossible de lire ce fichier. Essaie de l'enregistrer en CSV."); }
    });
    document.getElementById("imp-paste-btn").addEventListener("click", () => { document.getElementById("imp-paste").hidden = false; document.getElementById("imp-text").focus(); });
    document.getElementById("imp-text-go").addEventListener("click", () => {
      const t = document.getElementById("imp-text").value;
      if (t.length > MAX_SIZE) return msg("Tableau trop long.");
      loaded(parseCSV(t), "tableau collé");
    });
    document.getElementById("imp-model").addEventListener("click", () => {
      const csv = "﻿Langue;Extension;Numéro;Nom;Version;Quantité;Prix d'achat;Date d'achat\nFrançais;151;199;Dracaufeu ex;Normale;1;85,00;15/09/2026\nAnglais;MEW;25;Pikachu;Reverse;2;1,50;\n";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "mgtcg-modele-import.csv"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    function loaded(rows, label) {
      if (!rows || rows.length < 2) return msg("Je n'ai trouvé aucune ligne de cartes. Vérifie que la première ligne contient les titres des colonnes.");
      if (rows.length > MAX_ROWS + 1) { rows = rows.slice(0, MAX_ROWS + 1); ui().toast(`Seules les ${MAX_ROWS} premières lignes seront importées`); }
      msg("");
      S.header = rows[0].map((h) => String(h).trim());
      S.rows = rows.slice(1);
      S.map = guessMapping(S.header);
      renderMapping(label);
    }
  };

  function renderMapping(label) {
    const { esc } = ui();
    const el = document.getElementById("imp-step2");
    el.hidden = false;
    document.getElementById("imp-step3").hidden = true;
    const opts = (k) => `<option value="">— aucune —</option>` + S.header.map((h, i) => `<option value="${i}" ${S.map[k] === i ? "selected" : ""}>${esc(h || "Colonne " + (i + 1))}</option>`).join("");
    const preview = S.rows.slice(0, 5);
    el.innerHTML = `
      <h2>2. Vérifie les colonnes</h2>
      <p class="muted small">${esc(label)} · <b>${S.rows.length}</b> ligne${S.rows.length > 1 ? "s" : ""}. J'ai deviné à quoi correspond chaque colonne : corrige si besoin. Il faut au minimum l'<b>extension + le numéro</b>, ou le <b>nom</b> de la carte.</p>
      <div class="imp-map">${FIELDS.map((f) => `<label>${esc(f.label)}<select data-k="${f.k}">${opts(f.k)}</select></label>`).join("")}</div>
      <div class="table-wrap"><table class="table imp-prev"><thead><tr>${S.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${preview.map((r) => `<tr>${S.header.map((_, i) => `<td>${esc(String(r[i] ?? "").slice(0, 40))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="form-msg" id="imp-msg2" role="alert"></p>
      <button class="btn" id="imp-go">🔎 Retrouver mes cartes</button>`;
    el.querySelectorAll("select[data-k]").forEach((s) => s.addEventListener("change", () => {
      if (s.value === "") delete S.map[s.dataset.k]; else S.map[s.dataset.k] = parseInt(s.value, 10);
    }));
    el.querySelector("#imp-go").addEventListener("click", () => {
      const m = S.map;
      const err = el.querySelector("#imp-msg2");
      if (!((m.set != null && m.num != null) || m.name != null)) { err.textContent = "Choisis au moins les colonnes « Extension » + « Numéro », ou « Nom »."; err.className = "form-msg err"; return; }
      err.textContent = "";
      match();
    });
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- Recherche des cartes ---------------- */
  async function setIndex(lang, cache) {
    if (cache[lang]) return cache[lang];
    const list = (await MG.api.sets(lang).catch(() => [])) || [];
    const idx = { list, byId: new Map(), byName: new Map() };
    list.forEach((s) => { idx.byId.set(String(s.id).toLowerCase(), s); if (!idx.byName.has(norm(s.name))) idx.byName.set(norm(s.name), s); });
    cache[lang] = idx;
    return idx;
  }
  function findSet(idx, raw) {
    const v = String(raw ?? "").trim();
    if (!v) return null;
    const code = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (CODES[code] && idx.byId.has(CODES[code])) return idx.byId.get(CODES[code]);
    const id = normId(v);
    if (idx.byId.has(id)) return idx.byId.get(id);
    const n = norm(v);
    if (!n) return null;
    if (idx.byName.has(n)) return idx.byName.get(n);
    // « Écarlate et Violet – 151 », « SV: Flammes Obsidiennes »… : on cherche le nom d'extension à la fin
    const ends = idx.list.filter((s) => { const sn = norm(s.name); return sn.length >= 3 && n.endsWith(sn); }).sort((a, b) => norm(b.name).length - norm(a.name).length);
    if (ends.length) return ends[0];
    if (n.length >= 4) {
      const inc = idx.list.filter((s) => norm(s.name).includes(n));
      if (inc.length === 1) return inc[0];
    }
    return null;
  }
  const pool = async (items, n, fn) => {
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
  };

  async function match() {
    const { esc } = ui();
    const el = document.getElementById("imp-step3");
    el.hidden = false;
    const prog = (t) => { el.innerHTML = `<h2>3. Résultat</h2><p class="muted">⏳ ${esc(t)}</p>`; };
    prog("Lecture des extensions…");
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const def = document.getElementById("imp-lang").value;
    const m = S.map;
    const cell = (r, k) => (m[k] != null ? String(r[m[k]] ?? "").trim() : "");

    // 1. Lecture des lignes
    const items = [];
    S.rows.forEach((r, i) => {
      const it = { line: i + 2, raw: r, lang: langOf(cell(r, "lang"), def), setRaw: cell(r, "set"), numRaw: cell(r, "num"), name: cell(r, "name"),
        variant: variantOf(cell(r, "variant"), m.variant != null ? S.header[m.variant] : ""), paid: m.paid != null ? money(r[m.paid]) : null, date: dateOf(cell(r, "date")) };
      const qtyRaw = cell(r, "qty");
      if (qtyRaw !== "" && (parseFloat(qtyRaw.replace(",", ".")) || 0) <= 0) return; // quantité 0 = pas possédée
      const parts = it.numRaw.split("/");
      it.num = normNum(parts[0].trim().split(/\s+/).pop());
      it.total = parts[1] ? parseInt(parts[1], 10) || 0 : 0;
      if (!it.num && !it.name) return;
      items.push(it);
    });
    if (!items.length) { el.innerHTML = `<h2>3. Résultat</h2><p class="muted">Aucune ligne utilisable (vérifie les colonnes choisies).</p>`; return; }

    // 2. Extensions
    const cache = {};
    for (const lang of [...new Set(items.map((x) => x.lang))]) await setIndex(lang, cache);
    items.forEach((it) => { it.set = findSet(cache[it.lang], it.setRaw); });
    const setKeys = [...new Set(items.filter((x) => x.set).map((x) => x.lang + "|" + x.set.id))];
    const details = {};
    let done = 0;
    await pool(setKeys, 4, async (key) => {
      const [lang, id] = [key.slice(0, key.indexOf("|")), key.slice(key.indexOf("|") + 1)];
      try { details[key] = await MG.api.set(lang, id); } catch (e) { details[key] = null; }
      prog(`Lecture des extensions… ${++done} / ${setKeys.length}`);
    });

    // 3. Cartes dans l'extension
    const found = [], missing = [];
    const searches = new Map();
    for (const it of items) {
      if (it.set) {
        const d = details[it.lang + "|" + it.set.id];
        const cards = (d && d.cards) || [];
        let c = it.num ? cards.find((x) => normNum(x.localId) === it.num) : null;
        if (!c && it.name) { const same = cards.filter((x) => norm(x.name) === norm(it.name)); if (same.length === 1) c = same[0]; else if (same.length > 1 && !it.num) { missing.push([it, "Plusieurs cartes portent ce nom : ajoute le numéro"]); continue; } }
        if (c) { found.push([it, c.id]); continue; }
        missing.push([it, it.num ? `Numéro ${it.numRaw} introuvable dans « ${it.set.name} »` : "Carte introuvable dans l'extension"]);
      } else if (it.name) {
        const k = it.lang + "|" + norm(it.name);
        if (!searches.has(k)) searches.set(k, { lang: it.lang, q: it.name, res: null });
        it.search = k;
      } else missing.push([it, it.setRaw ? `Extension « ${it.setRaw} » non reconnue` : "Extension manquante"]);
    }
    // 4. Sans extension reconnue : recherche par nom (+ numéro)
    const toSearch = [...searches.values()].slice(0, 400);
    done = 0;
    await pool(toSearch, 3, async (s) => {
      try { s.res = (await MG.api.search(s.lang, s.q)) || []; } catch (e) { s.res = []; }
      prog(`Recherche par nom… ${++done} / ${toSearch.length}`);
    });
    for (const it of items.filter((x) => x.search)) {
      const res = (searches.get(it.search) || {}).res || [];
      let cands = res.filter((c) => norm(c.name) === norm(it.name));
      if (it.num) cands = cands.filter((c) => normNum(c.localId) === it.num);
      if (it.total && cands.length > 1) {
        const idx = cache[it.lang];
        cands = cands.filter((c) => { const s = idx.byId.get(c.id.slice(0, c.id.lastIndexOf("-")).toLowerCase()); return s && s.cardCount && s.cardCount.official === it.total; });
      }
      if (cands.length === 1) found.push([it, cands[0].id]);
      else missing.push([it, !cands.length ? (it.setRaw ? `Extension « ${it.setRaw} » non reconnue` : "Carte introuvable") : "Plusieurs cartes possibles : ajoute l'extension et le numéro"]);
    }

    // 5. Détails des cartes trouvées (prix, versions disponibles)
    const byLang = {};
    found.forEach(([it, id]) => { (byLang[it.lang] = byLang[it.lang] || new Set()).add(id); });
    const full = {};
    const total = found.length ? Object.values(byLang).reduce((t, s) => t + s.size, 0) : 0;
    done = 0;
    for (const [lang, set] of Object.entries(byLang)) {
      const ids = [...set];
      await new Promise((resolve) => {
        let n = 0;
        const stop = MG.loadQueue(ids, lang, (card, id) => {
          if (card) full[lang + "|" + card.id] = card;
          done++; n++;
          if (done % 10 === 0 || n === ids.length) prog(`Récupération des cartes et des prix… ${done} / ${total}`);
          if (n === ids.length) resolve();
        }, 6);
        S.stop.push(stop);
      });
    }
    S.stop = [];

    // 6. Regroupement (une carte peut apparaître sur plusieurs lignes)
    const entries = new Map();
    for (const [it, id] of found) {
      const key = it.lang + "|" + id;
      const card = full[key];
      if (!card) { missing.push([it, "Carte momentanément indisponible, réessaie plus tard"]); continue; }
      const av = card.variants || {};
      let v = it.variant;
      if (Object.keys(av).length && !av[v]) v = MG.VARIANTS.find((x) => av[x]) || "normal";
      const e = entries.get(key) || { lang: it.lang, card, variants: [], paid: null, lines: [] };
      if (!e.variants.includes(v)) e.variants.push(v);
      if (it.paid != null && !e.paid) e.paid = { price: it.paid, date: it.date };
      e.lines.push(it.line);
      entries.set(key, e);
    }
    S.result = { entries: [...entries.values()].sort((a, b) => a.lines[0] - b.lines[0]), missing: missing.sort((a, b) => a[0].line - b[0].line) };
    renderResult();
  }

  function renderResult() {
    const { esc, eur, toast } = ui();
    const el = document.getElementById("imp-step3");
    const { entries, missing } = S.result;
    const already = entries.filter((e) => MG.store.isOwned(e.lang, e.card.id)).length;
    const value = entries.reduce((t, e) => { const cm = e.card.cardmarket || {}; return t + (cm.trend || cm.avg || cm["trend-holo"] || 0); }, 0);
    const paidN = entries.filter((e) => e.paid).length;
    const flag = (l) => MG.flag ? MG.flag(l, (MG.LANGS.find((x) => x.code === l) || {}).label || l) : l;
    el.innerHTML = `
      <h2>3. Résultat</h2>
      <div class="imp-stats">
        <div><b>${entries.length}</b><span>carte${entries.length > 1 ? "s" : ""} trouvée${entries.length > 1 ? "s" : ""}</span></div>
        <div><b>${missing.length}</b><span>ligne${missing.length > 1 ? "s" : ""} non reconnue${missing.length > 1 ? "s" : ""}</span></div>
        <div><b>${eur(value)}</b><span>valeur estimée</span></div>
      </div>
      ${already ? `<p class="muted small">${already} carte${already > 1 ? "s sont" : " est"} déjà dans ta collection : les versions manquantes seront juste ajoutées.</p>` : ""}
      ${paidN ? `<label class="check"><input type="checkbox" id="imp-paid" checked> Garder les prix d'achat (${paidN} carte${paidN > 1 ? "s" : ""}, sans écraser ceux que tu as déjà saisis)</label>` : ""}
      ${entries.length ? `<button class="btn" id="imp-save">✅ Ajouter ${entries.length} carte${entries.length > 1 ? "s" : ""} à ma collection</button>` : ""}
      ${entries.length ? `<details class="imp-det"><summary>Voir les cartes trouvées</summary><div class="table-wrap"><table class="table"><thead><tr><th>Ligne</th><th>Carte</th><th>Extension</th><th>Version</th><th class="right">Prix</th></tr></thead><tbody>
        ${entries.slice(0, 500).map((e) => { const cm = e.card.cardmarket || {}; const p = cm.trend || cm.avg || cm["trend-holo"] || 0; return `<tr><td class="muted">${e.lines.slice(0, 3).join(", ")}${e.lines.length > 3 ? "…" : ""}</td><td>${flag(e.lang)} ${esc(e.card.name)} <span class="muted">#${esc(e.card.localId)}</span></td><td>${esc((e.card.set && e.card.set.name) || "")}</td><td>${e.variants.map((v) => esc(MG.VARIANT_LABELS[v] || v)).join(", ")}</td><td class="right">${p ? eur(p) : "—"}</td></tr>`; }).join("")}
      </tbody></table></div></details>` : ""}
      ${missing.length ? `<details class="imp-det" ${entries.length ? "" : "open"}><summary>⚠️ Lignes non reconnues (${missing.length})</summary>
        <p class="muted small">Corrige-les dans ton fichier (extension + numéro, ex : « 151 » et « 199 ») puis réimporte-le : les cartes déjà ajoutées ne seront pas en double. Tu peux aussi les ajouter à la main depuis la page de l'extension.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Ligne</th><th>Contenu</th><th>Problème</th></tr></thead><tbody>
        ${missing.slice(0, 300).map(([it, why]) => `<tr><td class="muted">${it.line}</td><td>${esc(it.raw.filter((c) => String(c).trim()).join(" · ").slice(0, 90))}</td><td class="small">${esc(why)}</td></tr>`).join("")}
        </tbody></table></div>
        <button class="btn ghost" id="imp-missing">⬇ Télécharger ces lignes (CSV)</button></details>` : ""}
      <p class="disclaimer">Prix Cardmarket indicatifs. Les quantités ne sont pas comptées : MGTCG retient quelles versions de chaque carte tu possèdes.</p>`;
    const save = el.querySelector("#imp-save");
    if (save) save.addEventListener("click", () => {
      const keepPaid = !el.querySelector("#imp-paid") || el.querySelector("#imp-paid").checked;
      const added = MG.store.bulkImport(entries.map((e) => ({ lang: e.lang, card: e.card, variants: e.variants, paid: keepPaid ? e.paid : null })));
      if (MG.store.recordHistory) MG.store.recordHistory();
      toast(`${added} nouvelle${added > 1 ? "s" : ""} carte${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""} ✓`);
      el.querySelector("#imp-save").outerHTML = `<p>✅ Import terminé : <b>${added}</b> nouvelle${added > 1 ? "s" : ""} carte${added > 1 ? "s" : ""} (et ${entries.length - added} mise${entries.length - added > 1 ? "s" : ""} à jour). <a class="btn" href="#/collection">Voir ma collection</a></p>`;
    });
    const dl = el.querySelector("#imp-missing");
    if (dl) dl.addEventListener("click", () => {
      const q = (c) => `"${String(c ?? "").replace(/"/g, '""')}"`;
      const csv = "﻿" + ["Ligne", ...S.header, "Problème"].map(q).join(";") + "\n" + missing.map(([it, why]) => [it.line, ...S.header.map((_, i) => it.raw[i]), why].map(q).join(";")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      a.download = "mgtcg-lignes-a-corriger.csv"; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#/importer")) { S.stop.forEach((f) => f()); S.stop = []; } });
  MG.importer = { parseCSV, parseXLSX, guessMapping, money, dateOf, normId, normNum };
})(window.MG);
