// ===== Elements (check tab)
const plateInput = document.getElementById("plateInput");
const suggestionsEl = document.getElementById("suggestions");
const btnClear = document.getElementById("btnClear");
const btnScan = document.getElementById("btnScan");
const camInput = document.getElementById("camInput");

const clearImg = document.getElementById("clearImg");
const clearSvg = document.getElementById("clearSvg");

const resultBox = document.getElementById("result");
const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const stats = document.getElementById("stats");

// ===== Tabs
const tabBtns = [...document.querySelectorAll(".tabBtn[data-tab]")]; // only real tabs
const tabCheck = document.getElementById("tab-check");
const tabManage = document.getElementById("tab-manage");
const btnLock = document.getElementById("btnLock");

// ===== Manage tab elements
const apiBaseEl = document.getElementById("apiBase");
const apiKeyEl = document.getElementById("apiKey");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const btnReload = document.getElementById("btnReload");

const mPlate = document.getElementById("mPlate");
const mName = document.getElementById("mName");
const mApt = document.getElementById("mApt");
const btnAdd = document.getElementById("btnAdd");

const mSearch = document.getElementById("mSearch");
const btnExport = document.getElementById("btnExport");
const manageList = document.getElementById("manageList");
const modeInfo = document.getElementById("modeInfo");

// ===== Storage keys
const LS_API_BASE = "gc_api_base_v1";
const LS_API_KEY = "gc_api_key_v1";
const LS_LOCAL_OVERRIDES = "gc_local_overrides_v1"; // only used if no API

// ===== Manage PIN lock (session only)
const MANAGE_PIN = "1234";
const SS_MANAGE_UNLOCK = "gc_manage_unlocked_session_v1";

function isManageUnlocked() {
  return sessionStorage.getItem(SS_MANAGE_UNLOCK) === "1";
}
function lockManage() {
  sessionStorage.removeItem(SS_MANAGE_UNLOCK);
}
async function unlockManagePrompt() {
  const pin = prompt("Enter Manage PIN:");
  if (pin === null) return false;
  if (pin.trim() === MANAGE_PIN) {
    sessionStorage.setItem(SS_MANAGE_UNLOCK, "1");
    return true;
  }
  alert("Wrong PIN.");
  return false;
}

// ===== Data (plate_norm -> { plateRaw, name, apartment })
let whitelist = new Map();
let entries = [];
let whitelistLoaded = false;

// Mode: "api" or "local"
let dataMode = "local";

// ======================= Helpers =======================
function normPlate(p) {
  return (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normTextTR(s) {
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

    map.set(plate_norm, { plateRaw, name, apartment, deleted: false });
  }
  return map;
}

function buildEntries(map) {
  const arr = [];
  for (const [plate_norm, v] of map.entries()) {
    if (v.deleted) continue;
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
  if (raw.trim().length < 2) return [];

  const matches = [];
  for (const e of entries) {
    let score = 999;

    if (qNorm) {
      if (e.plate_norm === qNorm) score = 0;
      else if (e.plate_norm.startsWith(qNorm)) score = 1;
      else if (e.plate_norm.includes(qNorm)) score = 2;
    }

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

  const exact = whitelist.get(qNorm);
  if (exact && !exact.deleted) {
    const info = [exact.name, exact.apartment].filter(Boolean).join(" • ");
    setResult("green", "YES", info || "Authorized");
    renderSuggestions([]);
    return;
  }

  const sugs = getSuggestions(raw);
  renderSuggestions(sugs);

  if (sugs.length) setResult("neutral", "…", "Pick a suggestion (or keep typing)");
  else if (finalCheck) setResult("red", "NO", "Not authorized");
  else setResult("neutral", "…", "No matches yet");
}

// ======================= Tabs (PIN protected) =======================
async function showTab(name) {
  if (name === "manage" && !isManageUnlocked()) {
    const ok = await unlockManagePrompt();
    if (!ok) name = "check";
  }

  tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  tabCheck.classList.toggle("hidden", name !== "check");
  tabManage.classList.toggle("hidden", name !== "manage");
}

tabBtns.forEach(btn =>
  btn.addEventListener("click", async () => {
    await showTab(btn.dataset.tab);
  })
);

if (btnLock) {
  btnLock.addEventListener("click", async () => {
    lockManage();
    alert("Manage locked.");
    await showTab("check");
  });
}

// ======================= API / Local storage =======================
function getApiBase() {
  return (localStorage.getItem(LS_API_BASE) || "").trim().replace(/\/+$/,"");
}
function getApiKey() {
  return (localStorage.getItem(LS_API_KEY) || "").trim();
}

function apiEnabled() {
  return !!getApiBase() && !!getApiKey();
}

async function apiFetch(path, opts = {}) {
  const base = getApiBase();
  const key = getApiKey();
  const headers = {
    ...(opts.headers || {}),
    "X-App-Key": key,
  };
  const res = await fetch(base + path, { ...opts, headers });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(data?.error || data?.detail || `HTTP ${res.status}`);
  return data;
}

function loadLocalOverrides() {
  try {
    const obj = JSON.parse(localStorage.getItem(LS_LOCAL_OVERRIDES) || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function saveLocalOverrides(obj) {
  localStorage.setItem(LS_LOCAL_OVERRIDES, JSON.stringify(obj));
}

// ======================= Load whitelist =======================
async function loadFromApi() {
  const data = await apiFetch("/api/list", { method: "GET" });
  const map = new Map();
  for (const row of (data.results || [])) {
    const plateRaw = (row.plate || "").trim();
    const plate_norm = normPlate(plateRaw);
    if (!plate_norm) continue;
    map.set(plate_norm, {
      plateRaw,
      name: (row.name || "").trim(),
      apartment: (row.apt || "").trim(),
      deleted: false
    });
  }
  return map;
}

async function loadFromCsvWithLocalEdits() {
  const url = new URL("whitelist.csv", window.location.href).toString();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const text = await res.text();

  const base = parseWhitelistCSV(text);
  const overrides = loadLocalOverrides();

  for (const [k, v] of Object.entries(overrides)) {
    base.set(k, v);
  }
  return base;
}

async function loadWhitelist() {
  try {
    whitelistLoaded = false;
    stats.textContent = "Loading whitelist…";
    setResult("neutral", "—", "Loading…");

    if (apiEnabled()) {
      whitelist = await loadFromApi();
      dataMode = "api";
    } else {
      whitelist = await loadFromCsvWithLocalEdits();
      dataMode = "local";
    }

    entries = buildEntries(whitelist);
    whitelistLoaded = true;

    stats.textContent = `Whitelist loaded: ${entries.length} cars`;
    setResult("neutral", "—", "Type a plate / name / apartment");

    renderManageList();
    renderModeInfo();
  } catch (e) {
    whitelistLoaded = false;
    stats.textContent = `Whitelist NOT loaded: ${e.message}`;
    setResult("neutral", "—", "Whitelist not loaded");
    dataMode = "local";
    renderModeInfo();
  }
}

function renderModeInfo() {
  const base = getApiBase();
  if (dataMode === "api") {
    modeInfo.textContent = `Mode: Cloudflare API ✅ (${base})`;
  } else {
    modeInfo.textContent = `Mode: Local (whitelist.csv + this device edits) ⚠️`;
  }
}

// ======================= Manage tab =======================
function renderManageList() {
  if (!manageList) return;

  const q = normTextTR(mSearch.value || "");
  const filtered = entries.filter(e => {
    if (!q) return true;
    return (
      e.plate_norm.toLowerCase().includes(q) ||
      e.nameSearch.includes(q) ||
      e.aptSearch.includes(q)
    );
  });

  manageList.innerHTML = "";

  filtered.forEach(e => {
    const row = document.createElement("div");
    row.className = "rowItem";
    row.innerHTML = `
      <div class="left">${e.plateRaw}</div>
      <div class="right">${[e.name, e.apartment].filter(Boolean).join(" • ")}</div>
      <button class="delBtn" type="button">Delete</button>
    `;

    row.querySelector(".delBtn").addEventListener("click", async () => {
      const ok = confirm(`Delete ${e.plateRaw}?`);
      if (!ok) return;

      try {
        if (dataMode === "api" && apiEnabled()) {
          await apiFetch(`/api/delete?plate=${encodeURIComponent(e.plateRaw)}`, { method: "DELETE" });
        } else {
          const overrides = loadLocalOverrides();
          overrides[e.plate_norm] = { plateRaw: e.plateRaw, name: e.name, apartment: e.apartment, deleted: true };
          saveLocalOverrides(overrides);
        }
        await loadWhitelist();
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    });

    manageList.appendChild(row);
  });
}

mSearch.addEventListener("input", renderManageList);

btnAdd.addEventListener("click", async () => {
  const plateRaw = (mPlate.value || "").trim();
  const name = (mName.value || "").trim();
  const apartment = (mApt.value || "").trim();

  const k = normPlate(plateRaw);
  if (!k) return alert("Plate is required.");

  try {
    if (apiEnabled()) {
      await apiFetch("/api/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plate: plateRaw, name, apt: apartment })
      });
    } else {
      const overrides = loadLocalOverrides();
      overrides[k] = { plateRaw, name, apartment, deleted: false };
      saveLocalOverrides(overrides);
    }

    mPlate.value = "";
    mName.value = "";
    mApt.value = "";
    await loadWhitelist();
    alert("Saved.");
  } catch (err) {
    alert(`Save failed: ${err.message}`);
  }
});

btnExport.addEventListener("click", () => {
  const header = "plate,name,apartment\n";
  const rows = entries.map(e => {
    const safe = (s) => `"${String(s ?? "").replace(/"/g,'""')}"`;
    return [safe(e.plateRaw), safe(e.name), safe(e.apartment)].join(",");
  }).join("\n");

  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `whitelist-${dataMode}-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

// Settings save + reload
function syncSettingsUi() {
  apiBaseEl.value = getApiBase();
  apiKeyEl.value = getApiKey();
}
syncSettingsUi();

btnSaveSettings.addEventListener("click", () => {
  const base = (apiBaseEl.value || "").trim().replace(/\/+$/,"");
  const key = (apiKeyEl.value || "").trim();
  localStorage.setItem(LS_API_BASE, base);
  localStorage.setItem(LS_API_KEY, key);
  alert("Saved settings on this device.");
  loadWhitelist();
});

btnReload.addEventListener("click", () => loadWhitelist());

// ======================= Scan button (phone camera) =======================
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

async function doScan(file) {
  if (!apiEnabled()) {
    alert("To use scan, set API Base + APP_KEY in Manage tab.");
    await showTab("manage");
    return;
  }

  try {
    setResult("neutral", "…", "Scanning…");
    stats.textContent = "Scanning image…";

    const imageDataUrl = await fileToDataUrl(file);

    const data = await apiFetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl })
    });

    const plate = (data.plate || "").trim();
    if (!plate) {
      setResult("red", "NO", "Could not read plate. Try closer / straighter.");
      stats.textContent = "Scan failed (no plate).";
      return;
    }

    await showTab("check");
    plateInput.value = plate;
    checkInput(true);
    stats.textContent = `Whitelist loaded: ${entries.length} cars`;
  } catch (err) {
    setResult("red", "NO", `Scan error: ${err.message}`);
    stats.textContent = "Scan error.";
  }
}

btnScan.addEventListener("click", () => {
  camInput.value = "";
  camInput.click();
});

camInput.addEventListener("change", async () => {
  const file = camInput.files && camInput.files[0];
  if (!file) return;
  await doScan(file);
});

// ======================= Wiring (check tab) =======================
plateInput.addEventListener("input", () => checkInput(false));
plateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkInput(true);
});
btnClear.addEventListener("click", clearAll);

// Clear icon fallback
clearImg.addEventListener("error", () => {
  clearImg.style.display = "none";
  clearSvg.style.display = "block";
});

// ======================= Service worker (optional) =======================
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}

// Start
loadWhitelist().then(() => plateInput.focus());
