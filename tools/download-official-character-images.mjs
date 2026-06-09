import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_JS = path.join(ROOT, "data.js");
const PRINTABLE_JS = path.join(ROOT, "printable-models.js");
const OFFICIAL_JS = path.join(ROOT, "official-data.js");
const OUT_DIR = path.join(ROOT, "img", "official-characters");
const REPORT_PATH = path.join(ROOT, "reports", "external", "official", "download-official-character-images.json");

const dryRun = process.argv.includes("--dry-run");
const fillMissingLocal = process.argv.includes("--fill-missing-local");
const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const timeoutArg = process.argv.find(arg => arg.startsWith("--request-timeout="));
const requestTimeout = timeoutArg ? Number(timeoutArg.split("=")[1]) : 8000;
const placeholderPath = path.join(ROOT, "img", "no.png");
const placeholderHash = fs.existsSync(placeholderPath)
  ? crypto.createHash("sha256").update(fs.readFileSync(placeholderPath)).digest("hex")
  : "";

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeName(value).replace(/\s+/g, "-") || "unknown";
}

function cleanRealName(value) {
  return String(value || "")
    .replace(/\s*\/\s*\d+\s*mm\s*$/i, "")
    .replace(/\s*\(\s*\d+\s*mm\s*\)\s*$/i, "")
    .trim();
}

function localRealNameKey(model) {
  const real = cleanRealName(model.realname);
  if (!real || normalizeName(real) === "unknown") return "";
  return normalizeName(real);
}

function loadContext() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(DATA_JS, "utf8"), ctx, { filename: DATA_JS });
  vm.runInContext(fs.readFileSync(PRINTABLE_JS, "utf8"), ctx, { filename: PRINTABLE_JS });
  vm.runInContext(fs.readFileSync(OFFICIAL_JS, "utf8"), ctx, { filename: OFFICIAL_JS });
  return ctx.window;
}

function hasPrintableFile(model, printable) {
  if (model.print !== undefined && model.print !== null) {
    if (typeof model.print === "string") {
      return model.print.toLowerCase() === "yes" || model.print.toLowerCase() === "true";
    }
    return Boolean(model.print);
  }

  const imageFile = String(model.img || "").split("/").pop() || "";
  const printableIdentityKey = `${model.name || ""}||${model.realname || ""}||${model.base || ""}`;
  return printable.keys.has(printableIdentityKey)
    || printable.imageKeys.has(imageFile)
    || printable.names.has(model.name);
}

function officialCandidatesForLocalModel(model, officialByKey) {
  const keys = [
    normalizeName(model.name),
    normalizeName(`${model.name} ${cleanRealName(model.realname)}`)
  ].filter(Boolean);

  const seen = new Set();
  const matches = [];
  for (const key of keys) {
    const items = officialByKey.get(key) || [];
    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      matches.push(item);
    }
  }

  const localNameKey = normalizeName(model.name);
  const localRealKey = localRealNameKey(model);
  if (localNameKey.length >= 6 && localRealKey) {
    const localNameTokens = new Set(localNameKey.split(" "));
    for (const items of officialByKey.values()) {
      for (const item of items) {
        if (seen.has(item.id)) continue;
        const aliasKey = normalizeName(item.alias);
        const extraAliasTokens = aliasKey
          .split(" ")
          .filter(token => token && !localNameTokens.has(token));
        if (
          aliasKey.includes(localNameKey)
          && extraAliasTokens.length
          && extraAliasTokens.every(token => localRealKey.split(" ").includes(token))
        ) {
          seen.add(item.id);
          matches.push(item);
        }
      }
    }
  }

  const scored = matches
    .map(item => ({ item, score: scoreOfficialCandidate(model, item) }))
    .filter(item => item.score >= 70)
    .sort((a, b) => b.score - a.score || a.item.id - b.item.id);

  if (!scored.length) return [];
  const bestScore = scored[0].score;
  return scored.filter(item => item.score === bestScore).map(item => item.item);
}

function scoreOfficialCandidate(model, character) {
  const localNameKey = normalizeName(model.name);
  const localRealKey = localRealNameKey(model);
  const officialAliasKey = normalizeName(character.alias);
  const officialNameKey = normalizeName(character.name);
  const officialCombinedKey = normalizeName(`${character.alias || ""} ${character.name || ""}`);

  let score = 0;
  if (localNameKey && officialAliasKey === localNameKey) score += 120;
  if (localNameKey && officialNameKey === localNameKey) score += 90;
  if (localNameKey && officialCombinedKey === localNameKey) score += 70;
  if (localRealKey && officialNameKey === localRealKey) score += 45;
  if (localNameKey && localRealKey && officialAliasKey.includes(localNameKey)) {
    const localNameTokens = new Set(localNameKey.split(" "));
    const extraAliasTokens = officialAliasKey
      .split(" ")
      .filter(token => token && !localNameTokens.has(token));
    if (extraAliasTokens.length && extraAliasTokens.every(token => localRealKey.split(" ").includes(token))) {
      score += 180;
    }
  }
  if (Number(model.rep) === Number(character.reputation)) score += 20;
  if (Number(model.funding || 0) === Number(character.funding || 0)) score += 12;
  if (String(model.base || "").trim().toLowerCase() === String(character.bases_size || "").trim().toLowerCase()) score += 10;
  return score;
}

async function download(url, filePath) {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 BMG-Omsk-Crew-Importer" },
    signal: AbortSignal.timeout(requestTimeout)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (placeholderHash && hash === placeholderHash) {
    throw new Error("official-placeholder-image");
  }
  fs.writeFileSync(filePath, bytes);
  return bytes.length;
}

const windowData = loadContext();
const official = windowData.KM_OFFICIAL_DATA || {};
const characters = official.sections?.characters;

if (!Array.isArray(characters)) {
  throw new Error("official-data.js does not contain a complete top-level characters section yet. Re-run fetch/build after a full official download.");
}

const printable = {
  names: windowData.PRINTABLE_MODEL_NAMES || new Set(),
  keys: windowData.PRINTABLE_MODEL_KEYS || new Set(),
  imageKeys: windowData.PRINTABLE_MODEL_IMAGE_KEYS || new Set()
};

const officialByKey = new Map();
for (const character of characters) {
  const keys = [
    normalizeName(character.name),
    normalizeName(character.alias),
    normalizeName(`${character.name} ${character.alias || ""}`)
  ].filter(Boolean);

  for (const key of keys) {
    if (!officialByKey.has(key)) officialByKey.set(key, []);
    officialByKey.get(key).push(character);
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const downloaded = [];
const skipped = [];
let count = 0;

for (const model of windowData.models || []) {
  const localImagePath = model.img ? path.join(ROOT, model.img) : "";
  if (fillMissingLocal && (!model.img || fs.existsSync(localImagePath))) {
    skipped.push({ name: model.name, reason: model.img ? "local-image-exists" : "no-local-image-path" });
    continue;
  }

  if (!fillMissingLocal && hasPrintableFile(model, printable)) {
    skipped.push({ name: model.name, reason: "has-print" });
    continue;
  }

  const matches = officialCandidatesForLocalModel(model, officialByKey);
  if (matches.length !== 1) {
    skipped.push({ name: model.name, reason: matches.length ? "ambiguous-match" : "no-official-match", matches: matches.map(item => ({ id: item.id, name: item.name, alias: item.alias })) });
    continue;
  }

  const officialCharacter = matches[0];
  if (!officialCharacter.image) {
    skipped.push({ name: model.name, reason: "official-has-no-image", officialId: officialCharacter.id });
    continue;
  }

  const ext = path.extname(new URL(officialCharacter.image).pathname) || ".png";
  const fileName = `${officialCharacter.id}-${slugify(`${officialCharacter.name}-${officialCharacter.alias || ""}`)}${ext}`;
  const filePath = fillMissingLocal ? localImagePath : path.join(OUT_DIR, fileName);
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");

  if (fs.existsSync(filePath)) {
    downloaded.push({ name: model.name, officialId: officialCharacter.id, url: officialCharacter.image, path: relPath, status: "exists" });
    continue;
  }

  if (count >= limit) {
    skipped.push({ name: model.name, reason: "limit-reached" });
    continue;
  }

  if (dryRun) {
    downloaded.push({ name: model.name, officialId: officialCharacter.id, url: officialCharacter.image, path: relPath, status: "dry-run" });
    count += 1;
    continue;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    const bytes = await download(officialCharacter.image, filePath);
    downloaded.push({ name: model.name, officialId: officialCharacter.id, url: officialCharacter.image, path: relPath, status: "downloaded", bytes });
    count += 1;
  } catch (error) {
    skipped.push({
      name: model.name,
      officialId: officialCharacter.id,
      url: officialCharacter.image,
      path: relPath,
      reason: "download-failed",
      error: error?.message || String(error)
    });
  }
}

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({
  generatedAt: new Date().toISOString(),
  dryRun,
  fillMissingLocal,
  requestTimeout,
  downloaded,
  skipped
}, null, 2), "utf8");

console.log(`wrote ${REPORT_PATH}`);
console.log(JSON.stringify({ dryRun, fillMissingLocal, requestTimeout, downloaded: downloaded.length, skipped: skipped.length }, null, 2));
