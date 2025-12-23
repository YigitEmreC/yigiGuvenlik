const plateInput = document.getElementById("plateInput");
const resultBox = document.getElementById("result");
const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const stats = document.getElementById("stats");

let whitelistSet = new Set();
let whitelistLoaded = false;

function normPlate(p) {
  // Uppercase + remove spaces/dashes/symbols
  return (p || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function setResult(state, title, sub) {
  resultBox.classList.remove("green", "red", "neutral");
  resultBox.classList.add(state);
  resultTitle.textContent = title;
  resultSub.textContent = sub || "";
}

function parseWhitelistCSV(text) {
  // Accept formats:
  //  - one plate per line
  //  - OR plate,resident_name
  // ignores empty lines and lines starting with #
  const lines = text.split(/\r?\n/);
  const set = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // take first column (comma OR semicolon separated)
    const firstCol = trimmed.split(/[;,]/)[0].trim();
    const n = normPlate(firstCol);
    if (n) set.add(n);
  }
  return set;
}

async function loadWhitelist() {
  try {
    // cache:no-store helps when updating on GitHub Pages
    const res = await fetch("./whitelist.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("Whitelist file not found");
    const text = await res.text();

    whitelistSet = parseWhitelistCSV(text);
    whitelistLoaded = true;

    stats.textContent = `Whitelist loaded: ${whitelistSet.size} plates`;
    setResult("neutral", "Waiting…", "Type a plate number");
  } catch (e) {
    whitelistLoaded = false;
    stats.textContent = "Whitelist NOT loaded. Make sure whitelist.csv exists in the same folder.";
    setResult("neutral", "Waiting…", "Whitelist not loaded");
  }
}

function checkPlate() {
  const raw = plateInput.value;
  const n = normPlate(raw);

  if (!whitelistLoaded) {
    setResult("neutral", "Waiting…", "Whitelist not loaded");
    return;
  }

  if (!n) {
    setResult("neutral", "Waiting…", "Type a plate number");
    return;
  }

  if (whitelistSet.has(n)) {
    setResult("green", "YES", `Authorized • ${n}`);
  } else {
    setResult("red", "NO", `Not authorized • ${n}`);
  }
}

plateInput.addEventListener("input", checkPlate);

loadWhitelist().then(() => {
  plateInput.focus();
});
