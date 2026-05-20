#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.join(projectRoot, "data.js");
const scriptPath = path.join(projectRoot, "script.js");

function printHelp() {
  console.log(`Usage: node tools/audit-localization.js [options]

Options:
  --lang <ru|en>          Language to audit. Default: ru
  --top <number>          Number of worst entries to print. Default: 20
  --min-score <number>    Minimum leftover-token score to flag. Default: 8
  --include-equipment     Include "Equipment List - ..." entries
  --json <path>           Write full JSON report to a file
  --help                  Show this message
`);
}

function parseArgs(argv) {
  const options = {
    lang: "ru",
    top: 20,
    minScore: 8,
    includeEquipment: false,
    json: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--include-equipment") {
      options.includeEquipment = true;
      continue;
    }

    if (arg === "--lang") {
      options.lang = argv[i + 1] || options.lang;
      i += 1;
      continue;
    }

    if (arg === "--top") {
      options.top = Number(argv[i + 1] || options.top);
      i += 1;
      continue;
    }

    if (arg === "--min-score") {
      options.minScore = Number(argv[i + 1] || options.minScore);
      i += 1;
      continue;
    }

    if (arg === "--json") {
      options.json = argv[i + 1] || null;
      i += 1;
      continue;
    }
  }

  return options;
}

function createDummyElement() {
  return {
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    style: {},
    innerHTML: "",
    textContent: "",
    value: "",
    dataset: {},
    title: "",
    placeholder: "",
    onclick: null,
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    querySelector() { return createDummyElement(); },
    querySelectorAll() { return []; },
    setAttribute() {},
    getAttribute() { return null; },
    focus() {},
    closest() { return null; },
    click() {},
    reset() {}
  };
}

function bootstrapProjectContext() {
  const dataText = fs.readFileSync(dataPath, "utf8");
  const scriptText = fs.readFileSync(scriptPath, "utf8");

  const context = {
    console,
    localStorage: {
      getItem() { return "ru"; },
      setItem() {},
      removeItem() {}
    },
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    },
    alert() {},
    confirm() { return true; },
    prompt() { return ""; },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: {
      addEventListener() {},
      getElementById() { return createDummyElement(); },
      querySelector() { return createDummyElement(); },
      querySelectorAll() { return []; },
      createElement() { return createDummyElement(); },
      body: createDummyElement()
    }
  };

  context.window = context;
  context.window.addEventListener = function () {};
  context.window.removeEventListener = function () {};

  vm.createContext(context);
  vm.runInContext(dataText, context, { timeout: 30000, filename: "data.js" });
  vm.runInContext(scriptText, context, { timeout: 30000, filename: "script.js" });

  return context;
}

function extractEnglishTokens(text) {
  return String(text || "").match(/[A-Za-z][A-Za-z'’-]*/g) || [];
}

function sanitizeAuditText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\{[A-Z0-9_+\- ]+\}/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ");
}

function normalizeToken(token) {
  return token.replace(/[’']/g, "'").toLowerCase();
}

function buildIgnoreSet() {
  return new Set([
    "los", "crt", "vp", "ko", "em", "swat", "faq", "pdf", "btg", "mk", "afk", "ecm", "dz", "d", "d6",
    "att", "def", "icon", "rof", "ammo", "mp", "x", "s", "scope", "loot", "objective", "resource",
    "speedforce", "tactical", "action", "actions", "rank", "boss", "cop", "plant", "blind", "poison",
    "steal", "clay", "sewer", "thwart", "elite", "audacity", "frozen", "cryo", "armor", "range",
    "robotman", "chief", "bane", "batman", "riddler", "followers", "coin", "twisted", "good",
    "hands", "back", "task", "cranial", "bomb", "activated", "ammo", "crates", "tachyon"
  ]);
}

function auditLocalization(options) {
  const context = bootstrapProjectContext();
  const ignore = buildIgnoreSet();
  const compendium = context.compendium || {};

  context.currentLang = options.lang;

  const flaggedEntries = [];
  const tokenCounts = new Map();
  let reviewedEntries = 0;

  for (const [key, body] of Object.entries(compendium)) {
    if (!options.includeEquipment && key.startsWith("Equipment List -")) continue;

    reviewedEntries += 1;

    const localizedTitle = String(context.localizeCompendiumTitle(key));
    const localizedBody = String(context.localizeCompendiumBody(body || ""));
    const combined = sanitizeAuditText(`${localizedTitle}\n${localizedBody}`);

    const filteredTokens = extractEnglishTokens(combined).filter(token => {
      const normalized = normalizeToken(token);
      if (ignore.has(normalized)) return false;
      if (/^[a-z]{1,2}$/.test(normalized)) return false;
      return true;
    });

    filteredTokens.forEach(token => {
      const normalized = normalizeToken(token);
      tokenCounts.set(normalized, (tokenCounts.get(normalized) || 0) + 1);
    });

    if (filteredTokens.length < options.minScore) continue;

    flaggedEntries.push({
      key,
      score: filteredTokens.length,
      leftoverTokens: Array.from(new Set(filteredTokens)).slice(0, 16),
      localizedTitle,
      localizedBody,
      originalBody: String(body || "")
    });
  }

  flaggedEntries.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const frequentTokens = Array.from(tokenCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 30)
    .map(([token, count]) => ({ token, count }));

  return {
    generatedAt: new Date().toISOString(),
    lang: options.lang,
    reviewedEntries,
    flaggedEntriesCount: flaggedEntries.length,
    minScore: options.minScore,
    top: options.top,
    frequentTokens,
    flaggedEntries
  };
}

function printReport(report) {
  console.log(`Localization audit for "${report.lang}"`);
  console.log(`Reviewed entries: ${report.reviewedEntries}`);
  console.log(`Flagged entries: ${report.flaggedEntriesCount} (score >= ${report.minScore})`);

  if (report.frequentTokens.length) {
    console.log("\nMost frequent leftover English tokens:");
    report.frequentTokens.slice(0, 15).forEach(({ token, count }) => {
      console.log(`- ${token}: ${count}`);
    });
  }

  if (report.flaggedEntries.length) {
    console.log(`\nTop ${Math.min(report.top, report.flaggedEntries.length)} flagged entries:`);
    report.flaggedEntries.slice(0, report.top).forEach(entry => {
      console.log(`\n[${entry.score}] ${entry.key}`);
      console.log(entry.leftoverTokens.join(", "));
    });
  }
}

function writeJsonReport(report, outputPath) {
  const absolutePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(projectRoot, outputPath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nJSON report written to: ${absolutePath}`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const report = auditLocalization(options);
  printReport(report);

  if (options.json) {
    writeJsonReport(report, options.json);
  }
}

main();
