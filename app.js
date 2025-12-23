// ===== Storage keys =====
const K_WHITELIST = "gc_whitelist_v1";
const K_LOGS = "gc_logs_v1";
const K_PIN = "gc_pin_v1";
const K_GUARD = "gc_guard_v1";

// ===== Helpers =====
function normPlate(p) {
  return (p || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, ""); // remove spaces, dashes, TR chars etc.
}

function nowISO() {
  return new Date().toISOString();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function toCSV(rows) {
  const esc = (v) => {
    const s = String(v ?? "");
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return rows.map(r => r.map(esc).join(",")).join("\n");
}

// Simple CSV parser with quote support
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = false; continue; }
      cur += ch;
      continue;
    }

    if (ch === '"') { inQuotes = true; continue; }
    if (ch === "," || ch === ";") { row.push(cur.trim()); cur = ""; continue; }
    if (ch === "\n") { row.push(cur.trim()); rows.push(row); row = []; cur = ""; continue; }
    if (ch === "\r") continue;
    cur += ch;
  }
  if (cur.length || row.length) { row.push(cur.trim()); rows.push(row); }
  return rows.filter(r => r.some(c => c !== ""));
}

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || ""); } catch { return fallback; }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ===== State =====
let whitelist = loadJSON(K_WHITELIST, []); // {plate, plate_norm, resident, block, active, notes}
let logs = loadJSON(K_LOGS, []);           // {time, dir, plate_input, plate_norm, authorized, resident, guard}

// PIN default
if (!localStorage.getItem(K_PIN)) localStorage.setItem(K_PIN, "1234");

// ===== UI =====
const el = (id) => document.getElementById(id);

const plateInput = el("plateInput");
const guardName = el("guardName");
const suggestions = el("suggestions");

const resultBox = el("result");
const statusText = el("statusText");
const detailText = el("detailText");

const btnIn = el("btnIn");
const btnOut = el("btnOut");
const btnClear = el("btnClear");

const btnExportLogs = el("btnExportLogs");
const btnAdmin = el("btnAdmin");
const adminPanel = el("adminPanel");
const btnCloseAdmin = el("btnCloseAdmin");

const csvFile = el("csvFile");
const btnExportWhitelist = el("btnExportWhitelist");
const btnClearLogs = el("btnClearLogs");
const btnClearAll = el("btnClearAll");

const newPin = el("newPin");
const btnSetPin = el("btnSetPin");

const logsTableBody = el("logsTable").querySelector("tbody");
const counts = el("counts");

// Load guard name
guardName.value = localStorage.getItem(K_GUARD) || "";
guardName.addEventListener("input", () => localStorage.setItem(K_GUARD, guardName.value.trim()));

// ===== Core logic =====
function findMatch(inputNorm) {
  if (!inputNorm) return null;
  return whitelist.find(w => w.plate_norm === inputNorm && (w.active !== false));
}

function computeSuggestions(inputNorm) {
  if (!inputNorm || inputNorm.length < 2) return [];
  // show matches by contains (useful for typing last digits)
  const hits = whitelist
    .filter(w => w.active !== false)
    .filter(w => w.plate_norm.includes(inputNorm))
    .slice(0, 5);
  return hits;
}

function setResult(mode, headline, detail) {
  resultBox.classList.remove("green", "red", "neutral");
  resultBox.classList.add(mode);
  statusText.textContent = headline;
  detailText.textContent = detail || "—";
  const enable = (mode === "green" || mode === "red") && normPlate(plateInput.value).length > 0;
  btnIn.disabled = !enable;
  btnOut.disabled = !enable;
}

function renderSuggestions(items) {
  suggestions.innerHTML = "";
  if (!items.length) return;
  items.forEach(w => {
    const div = document.createElement("div");
    div.className = "sug";
    div.innerHTML = `<b>${w.plate}</b><span>${[w.resident, w.block].filter(Boolean).join(" • ") || ""}</span>`;
    div.addEventListener("click", () => {
      plateInput.value = w.plate;
      onPlateChange();
    });
    suggestions.appendChild(div);
  });
}

function onPlateChange() {
  const raw = plateInput.value;
  const n = normPlate(raw);

  const sug = computeSuggestions(n);
  renderSuggestions(sug);

  if (!n) {
    setResult("neutral", "Type a plate…", "—");
    return;
  }

  const match = findMatch(n);
  if (match) {
    setResult("green", "AUTHORIZED", `${match.resident || ""} ${match.block ? "• " + match.block : ""}`.trim());
  } else {
    setResult("red", "NOT AUTHORIZED", "Not in whitelist (or inactive)");
  }
}

plateInput.addEventListener("input", onPlateChange);

btnClear.addEventListener("click", () => {
  plateInput.value = "";
  suggestions.innerHTML = "";
  setResult("neutral", "Type a plate…", "—");
  plateInput.focus();
});

function addLog(dir) {
  const raw = plateInput.value.trim();
  const n = normPlate(raw);
  const match = findMatch(n);
  const g = (guardName.value || "").trim();

  const entry = {
    time: nowISO(),
    dir,
    plate_input: raw,
    plate_norm: n,
    authorized: !!match,
    resident: match ? (match.resident || "") : "",
    guard: g
  };

  logs.unshift(entry);
  logs = logs.slice(0, 5000); // keep it sane
  saveJSON(K_LOGS, logs);

  renderLogs();
}

btnIn.addEventListener("click", () => addLog("IN"));
btnOut.addEventListener("click", () => addLog("OUT"));

function renderLogs() {
  counts.textContent = `Whitelist: ${whitelist.filter(w => w.active !== false).length} active • Logs: ${logs.length}`;

  logsTableBody.innerHTML = "";
  logs.slice(0, 20).forEach(l => {
    const tr = document.createElement("tr");
    const dt = new Date(l.time);
    tr.innerHTML = `
      <td>${dt.toLocaleString()}</td>
      <td>${l.dir}</td>
      <td>${l.plate_input || l.plate_norm}</td>
      <td>${l.authorized ? "YES" : "NO"}</td>
      <td>${l.resident || "—"}</td>
      <td>${l.guard || "—"}</td>
    `;
    logsTableBody.appendChild(tr);
  });
}

btnExportLogs.addEventListener("click", () => {
  const rows = [
    ["time_iso", "direction", "plate_input", "plate_normalized", "authorized", "resident", "guard"],
    ...logs.map(l => [l.time, l.dir, l.plate_input, l.plate_norm, l.authorized ? "YES" : "NO", l.resident, l.guard])
  ];
  downloadText(`gate-logs-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
});

// ===== Admin =====
function promptPin() {
  const pin = localStorage.getItem(K_PIN) || "1234";
  const entered = window.prompt("Enter Admin PIN:");
  return entered === pin;
}

btnAdmin.addEventListener("click", () => {
  if (!promptPin()) {
    alert("Wrong PIN.");
    return;
  }
  adminPanel.classList.remove("hidden");
});

btnCloseAdmin.addEventListener("click", () => adminPanel.classList.add("hidden"));

btnSetPin.addEventListener("click", () => {
  const p = (newPin.value || "").trim();
  if (!/^\d{4,10}$/.test(p)) {
    alert("PIN must be 4–10 digits.");
    return;
  }
  localStorage.setItem(K_PIN, p);
  newPin.value = "";
  alert("PIN updated.");
});

csvFile.addEventListener("change", async () => {
  const file = csvFile.files?.[0];
  if (!file) return;

  const text = await file.text();
  const rows = parseCSV(text);
  if (!rows.length) { alert("CSV is empty."); return; }

  // Detect header
  const header = rows[0].map(h => h.toLowerCase());
  const hasHeader = header.includes("plate") || header.includes("plaka");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  // Column indices (best-effort)
  const idxPlate = hasHeader ? header.indexOf("plate") : 0;
  const idxResident = hasHeader ? (header.indexOf("resident") !== -1 ? header.indexOf("resident") : header.indexOf("name")) : 1;
  const idxBlock = hasHeader ? header.indexOf("block") : 2;
  const idxActive = hasHeader ? header.indexOf("active") : 3;
  const idxNotes = hasHeader ? header.indexOf("notes") : 4;

  const imported = [];
  for (const r of dataRows) {
    const plate = (r[idxPlate] ?? r[0] ?? "").trim();
    if (!plate) continue;

    const plate_norm = normPlate(plate);
    if (!plate_norm) continue;

    const resident = (r[idxResident] ?? "").trim();
    const block = (r[idxBlock] ?? "").trim();
    const activeRaw = (r[idxActive] ?? "").trim().toLowerCase();
    const notes = (r[idxNotes] ?? "").trim();

    const active = (activeRaw === "" || activeRaw === "1" || activeRaw === "true" || activeRaw === "yes" || activeRaw === "y" || activeRaw === "aktif");

    imported.push({ plate, plate_norm, resident, block, active, notes });
  }

  // Deduplicate by plate_norm (last one wins)
  const map = new Map();
  imported.forEach(x => map.set(x.plate_norm, x));
  whitelist = Array.from(map.values()).sort((a,b) => a.plate_norm.localeCompare(b.plate_norm));

  saveJSON(K_WHITELIST, whitelist);
  alert(`Imported ${whitelist.length} plates.`);
  csvFile.value = "";
  onPlateChange();
  renderLogs();
});

btnExportWhitelist.addEventListener("click", () => {
  const rows = [
    ["plate","resident","block","active","notes"],
    ...whitelist.map(w => [w.plate, w.resident || "", w.block || "", w.active !== false ? "TRUE" : "FALSE", w.notes || ""])
  ];
  downloadText(`whitelist-${new Date().toISOString().slice(0,10)}.csv`, toCSV(rows));
});

btnClearLogs.addEventListener("click", () => {
  if (!confirm("Clear ALL logs?")) return;
  logs = [];
  saveJSON(K_LOGS, logs);
  renderLogs();
});

btnClearAll.addEventListener("click", () => {
  if (!confirm("Clear whitelist + logs?")) return;
  whitelist = [];
  logs = [];
  saveJSON(K_WHITELIST, whitelist);
  saveJSON(K_LOGS, logs);
  renderLogs();
  onPlateChange();
});

// Initial render
renderLogs();
onPlateChange();
