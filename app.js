const plateInput = document.getElementById("plateInput");
const resultBox = document.getElementById("result");
const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const stats = document.getElementById("stats");

// Map: plate_norm -> { plateRaw, name, apartment }
let whitelist = new Map();
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
  // supports comma OR semicolon CSV (common in TR Excel)
  // does NOT fully handle quoted commas; fine for typical name/apartment data
  const delim = line.includes(";") && !line.includes(",") ? ";" : ",";
  return line.split(delim).map(s => s.trim());
}

function parseWhitelistCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  const map = new Map();
  if (lines.length === 0) return map;

  // Detect header if first line contains "plate"
  const first = splitLine(lines[0]).map(x => x.toLowerCase());
  const hasHeader = first.includes("plate") || first.includes("plaka");

  const startIdx = hasHeader ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.startsWith("#")) continue;

    const cols = splitLine(line);
    const plateRaw = cols[0] || "";
    const name = cols[1] || "";
    const apartment = cols[2] || "";

    const plate_norm = normPlate(plateRaw);
    if (!plate_norm) continue;

    // last one wins if duplicates
    map.set(plate_norm, { plateRaw: plateRaw.trim(), name: name.trim(), apartment: apartment.trim() });
  }

  return map;
}

async function loadWhitelist() {
  try {
    const res = await fetch("./whitelist.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("whitelist.csv not found");
    const text = await res.text();

    whitelist = parseWhitelistCSV(text);
    whitelistLoaded = true;

    stats.textContent = `Whitelist loaded: ${whitelist.size} plates`;
    setResult("neutral", "Waiting…", "Type a plate number");
  } catch (e) {
    whitelistLoaded = false;
    stats.textContent = "Whitelist NOT loaded. Make sure whitelist.csv exists in the same folder.";
    setResult("neutral", "Waiting…", "Whitelist not loaded");
  }
}

function checkPlate() {
  const n = normPlate(plateInput.value);

  if (!whitelistLoaded) {
    setResult("neutral", "Waiting…", "Whitelist not loaded");
    return;
  }

  if (!n) {
    setResult("neutral", "Waiting…", "Type a plate number");
    return;
  }

  const hit = whitelist.get(n);
  if (hit) {
    const info = [hit.name, hit.apartment].filter(Boolean).join(" • ");
    setResult("green", "YES", info ? `${info} • ${n}` : `Authorized • ${n}`);
  } else {
    setResult("red", "NO", `Not authorized • ${n}`);
  }
}

plateInput.addEventListener("input", checkPlate);

loadWhitelist().then(() => plateInput.focus());
