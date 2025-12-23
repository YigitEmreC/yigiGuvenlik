const plateInput = document.getElementById("plateInput");
const suggestionsEl = document.getElementById("suggestions");
const resultBox = document.getElementById("result");
const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const stats = document.getElementById("stats");

// Map: plate_norm -> { plateRaw, name, apartment }
let whitelist = new Map();
let entries = []; // array version for searching
let whitelistLoaded = false;

function normPlate(p) {
  return (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function setResult(state, title, sub) {
  resultBox.classList.remove("green", "red", "neutral");
  resultBox.classList.add(state);
  resultTitle.textContent = title;
  resultSub.textContent = sub || "";
}

function splitLine(line) {
  // TR Excel sometimes uses ; instead of ,
  const delim = line.includes(";") && !line.includes(",") ? ";" : ",";
  return line.split(delim).map(s => s.trim());
}

function parseWhitelistCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const map = new Map();
  if (lines.length === 0) return map;

  const first = splitLine(lines[0]).map(x => x.toLowerCase());
  const hasHeader = first.includes("plate") || first.includes("plaka");
  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
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

function buildEntriesFromMap(map) {
  const arr = [];
  for (const [plate_norm, v] of map.entries()) {
    arr.push({
      plate_norm,
      plateRaw: v.plateRaw,
      name: v.name,
      apartment: v.apartment,
      nameLower: (v.name || "").toLowerCase(),
      aptLower: (v.apartment || "").toLowerCase()
    });
  }
  return arr;
}

function renderSuggestions(list) {
  suggestionsEl.innerHTML = "";
  if (!list.length) return;

  for (const item of list) {
    const div = document.createElement("div");
    div.className = "sug";
    div.innerHTML = `
      <div class="sugTop">${item.plateRaw || item.plate_norm}</div>
      <div class="sugBottom">${[item.name, item.apartment].filter(Boolean).join(" • ")}</div>
    `;
    div.addEventListener("click", () => {
      plateInput.value = item.plateRaw || item.plate_norm;
      checkInput(true); // force check as "selected"
    });
    suggestionsEl.appendChild(div);
  }
}

function scoreMatch(qNorm, qTextLower, e) {
  // Lower score = better
  // Plate scoring
  if (qNorm) {
    if (e.plate_norm === qNorm) return 0;
    if (e.plate_norm.startsWith(qNorm)) return 1;
    if (e.plate_norm.includes(qNorm)) return 2;
  }

  // Name/apartment scoring
  if (qTextLower) {
    if (e.nameLower && e.nameLower.startsWith(qTextLower)) return 3;
    if (e.nameLower && e.nameLower.includes(qTextLower)) return 4;
    if (e.aptLower && e.aptLower.startsWith(qTextLower)) return 5;
    if (e.aptLower && e.aptLower.includes(qTextLower)) return 6;
  }

  return 999;
}

function findSuggestions(qNorm, qTextLower) {
  // Keep it fast: compute score + filter out non-matches
  const scored = [];
  for (const e of entries) {
    const s = scoreMatch(qNorm, qTextLower, e);
    if (s !== 999) scored.push({ s, e });
  }

  scored.sort((a, b) => {
    if (a.s !== b.s) return a.s - b.s;
    // tie-breaker: closer length match for plate
    return a.e.plate_norm.length - b.e.plate_norm.length;
  });

  return scored.slice(0, 6).map(x => x.e);
}

function checkInput(selected = false) {
  const raw = (plateInput.value || "").trim();
  const qNorm = normPlate(raw);
  const qTextLower = raw.toLowerCase();

  if (!whitelistLoaded) {
    setResult("neutral", "Waiting…", "Whitelist not loaded");
    renderSuggestions([]);
    return;
  }

  if (!raw) {
    setResult("neutral", "Waiting…", "Type plate / name / apartment");
    renderSuggestions([]);
    return;
  }

  // Exact plate match → GREEN
  const exact = whitelist.get(qNorm);
  if (exact) {
    const info = [exact.name, exact.apartment].filter(Boolean).join(" • ");
    setResult("green", "YES", info ? info : "Authorized");
    renderSuggestions([]);
    return;
  }

  // Not exact → show “Did you mean…”
  const sugs = findSuggestions(qNorm, qTextLower);
  renderSuggestions(sugs);

  // If user tapped a suggestion (selected=true) or query is quite specific but no hits → RED
  if (selected || (qNorm.length >= 5 && sugs.length === 0)) {
    setResult("red", "NO", "Not authorized");
  } else if (sugs.length > 0) {
    setResult("neutral", "Did you mean…", "Tap one of the suggestions");
  } else {
    setResult("neutral", "Keep typing…", "No suggestions yet");
  }
}

plateInput.addEventListener("input", () => checkInput(false));
plateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkInput(true); // treat Enter as a “final check”
});

async function loadWhitelist() {
  try {
    const url = new URL("whitelist.csv", window.location.href).toString();
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

    const text = await res.text();
    whitelist = parseWhitelistCSV(text);
    entries = buildEntriesFromMap(whitelist);
    whitelistLoaded = true;

    stats.textContent = `Whitelist loaded: ${whitelist.size} cars`;
    setResult("neutral", "Waiting…", "Type plate / name / apartment");
  } catch (e) {
    whitelistLoaded = false;
    stats.textContent = `Whitelist NOT loaded: ${e.message}`;
    setResult("neutral", "Waiting…", "Whitelist not loaded");
  }
}

loadWhitelist().then(() => plateInput.focus());
