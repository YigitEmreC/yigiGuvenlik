const plateInput = document.getElementById("plateInput");
const suggestionsEl = document.getElementById("suggestions");
const btnClear = document.getElementById("btnClear");

const resultBox = document.getElementById("result");
const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const stats = document.getElementById("stats");

// Map: plate_norm -> { plateRaw, name, apartment }
let whitelist = new Map();
let entries = [];
let whitelistLoaded = false;

function normPlate(p) {
  return (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normTextTR(s) {
  // makes searching Turkish names easier
  return (s || "")
    .toLowerCase()
    .replaceAll("ç","c")
    .replaceAll("ğ","g")
    .replaceAll("ı","i")
    .replaceAll("ö","o")
    .replaceAll("ş","s")
    .replaceAll("ü","u");
}

function setResult(state, title, sub) {
  resultBox.classList.remove("green", "red", "neutral");
  resultBox.classList.add(state);
  resultTitle.textContent = title;
  resultSub.textContent = sub || "";
}

function splitLine(line) {
  // TR Excel often uses ';'
  const delim = line.includes(";") && !line.includes(",") ? ";" : ",";
  return line.split(delim).map(s => s.trim());
}

function parseWhitelistCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const map = new Map();
  if (!lines.length) return map;

  const first = splitLine(lines[0]).map(x => x.toLowerCase());
  const hasHeader = first.includes("plate") || first.includes("plaka");
  const start = hasHeader ? 1 : 0;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("#")) continue;

    const cols = splitLine(line);
    const plateRaw = (cols[0] || "").trim();
    const name = (cols[1] || "").trim();
    const apartment = (cols[2] || "").trim();

    const plate_norm = normPlate(plateRaw);
    if (!plate_norm) continue;

    map.set(plate_norm, { plateRaw, name, apartment });
  }
  return map;
}

function buildEntries(map) {
  const arr = [];
  for (const [plate_norm, v] of map.entries()) {
    arr.push({
      plate_norm,
      plateRaw: v.plateRaw || plate_norm,
      name: v.name || "",
      apartment: v.apartment || "",
      nameSearch: normTextTR(v.name || ""),
      aptSearch: normTextTR(v.apartment || "")
    });
  }
  arr.sort((a,b) => a.plate_norm.localeCompare(b.plate_norm));
  return arr;
}

function renderSuggestions(list) {
  suggestionsEl.innerHTML = "";
  if (!list.length) return;

  for (const item of list) {
    const div = document.createElement("div");
    div.className = "sug";
    div.innerHTML = `
      <div class="sugLeft">${item.plateRaw}</div>
      <div class="sugRight">${[item.name, item.apartment].filter(Boolean).join(" • ")}</div>
    `;
    div.addEventListener("click", () => {
      plateInput.value = item.plateRaw;
      checkInput(true);
    });
    suggestionsEl.appendChild(div);
  }
}

function getSuggestions(raw) {
  const qNorm = normPlate(raw);
  const qText = normTextTR(raw.trim());

  // start suggesting after 2 chars
  if (raw.trim().length < 2) return [];

  const matches = [];
  for (const e of entries) {
    let score = 999;

    // plate-first matching
    if (qNorm) {
      if (e.plate_norm === qNorm) score = 0;
      else if (e.plate_norm.startsWith(qNorm)) score = 1;
      else if (e.plate_norm.includes(qNorm)) score = 2;
    }

    // name / apartment matching
    if (score === 999 && qText) {
      if (e.nameSearch.startsWith(qText)) score = 3;
      else if (e.nameSearch.includes(qText)) score = 4;
      else if (e.aptSearch.startsWith(qText)) score = 5;
      else if (e.aptSearch.includes(qText)) score = 6;
    }

    if (score !== 999) matches.push({ score, e });
  }

  matches.sort((a,b) => a.score - b.score);
  return matches.slice(0, 6).map(x => x.e);
}

function clearAll() {
  plateInput.value = "";
  renderSuggestions([]);
  setResult("neutral", "—", "Type a plate / name / apartment");
  plateInput.focus();
}

function checkInput(finalCheck = false) {
  if (!whitelistLoaded) {
    setResult("neutral", "—", "Whitelist not loaded");
    renderSuggestions([]);
    return;
  }

  const raw = plateInput.value || "";
  const qNorm = normPlate(raw);

  if (!raw.trim()) {
    setResult("neutral", "—", "Type a plate / name / apartment");
    renderSuggestions([]);
    return;
  }

  // EXACT plate => YES / GREEN
  const exact = whitelist.get(qNorm);
  if (exact) {
    const info = [exact.name, exact.apartment].filter(Boolean).join(" • ");
    setResult("green", "YES", info || "Authorized");
    renderSuggestions([]);
    return;
  }

  // partial => suggestions
  const sugs = getSuggestions(raw);
  renderSuggestions(sugs);

  if (sugs.length) {
    setResult("neutral", "…", "Pick a suggestion (or keep typing)");
  } else if (finalCheck) {
    setResult("red", "NO", "Not authorized");
  } else {
    setResult("neutral", "…", "No matches yet");
  }
}

plateInput.addEventListener("input", () => checkInput(false));
plateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkInput(true);
});

btnClear.addEventListener("click", clearAll);

async function loadWhitelist() {
  try {
    const url = new URL("whitelist.csv", window.location.href).toString();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

    const text = await res.text();
    whitelist = parseWhitelistCSV(text);
    entries = buildEntries(whitelist);
    whitelistLoaded = true;

    stats.textContent = `Whitelist loaded: ${whitelist.size} cars`;
    setResult("neutral", "—", "Type a plate / name / apartment");
  } catch (e) {
    whitelistLoaded = false;
    stats.textContent = `Whitelist NOT loaded: ${e.message}`;
    setResult("neutral", "—", "Whitelist not loaded");
  }
}

loadWhitelist().then(() => plateInput.focus());
