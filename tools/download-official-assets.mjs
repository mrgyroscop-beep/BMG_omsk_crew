import fs from "node:fs";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_JS = path.join(ROOT, "data.js");
const DOWNLOAD_PS1 = path.join(ROOT, "tools", "download-url.ps1");
const OUT_DIR = path.join(ROOT, "reports", "external", "official");
const REPORT_PATH = path.join(OUT_DIR, "download-official-assets.json");

const START = "// BEGIN OFFICIAL_IMAGE_OVERRIDES";
const END = "// END OFFICIAL_IMAGE_OVERRIDES";

const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");
const includeDisabled = process.argv.includes("--include-disabled");
const onlyCards = process.argv.includes("--cards");
const onlyModels = process.argv.includes("--models");
const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const timeoutArg = process.argv.find(arg => arg.startsWith("--request-timeout="));
const requestTimeout = timeoutArg ? Number(timeoutArg.split("=")[1]) : 15000;
const concurrencyArg = process.argv.find(arg => arg.startsWith("--concurrency="));
const concurrency = Math.max(1, concurrencyArg ? Number(concurrencyArg.split("=")[1]) : 6);
const shouldDownloadCards = onlyModels ? false : true;
const shouldDownloadModels = onlyCards ? false : true;
const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

const placeholderPath = path.join(ROOT, "img", "no.png");
const placeholderHash = fs.existsSync(placeholderPath)
  ? crypto.createHash("sha256").update(fs.readFileSync(placeholderPath)).digest("hex")
  : "";

function stripGeneratedBlock(source) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);
  if (startIndex < 0 || endIndex < startIndex) return source;
  return `${source.slice(0, startIndex)}${source.slice(endIndex + END.length)}`;
}

function loadContext(source = fs.readFileSync(DATA_JS, "utf8")) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: DATA_JS });
  return ctx.window;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return normalizeName(value).replace(/\s+/g, "-") || "official";
}

function extensionFromUrl(url, fallback = ".png") {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.(png|jpe?g|webp)$/i.test(ext)) return ext;
  } catch {
    // Keep fallback.
  }
  return fallback;
}

function relPath(filePath) {
  return path.relative(ROOT, filePath).replace(/\\/g, "/");
}

function localPathExists(rel) {
  return Boolean(rel) && fs.existsSync(path.join(ROOT, rel));
}

function imageNeedsDownload(item) {
  if (!item.officialImage) return false;
  if (force) return true;
  if (!item.img || item.img === "img/no.png") return true;
  return !localPathExists(item.img);
}

function cardFilePath(card) {
  const ext = extensionFromUrl(card.officialImage, ".jpg");
  const id = card.officialId ?? card.id ?? "card";
  return path.join(ROOT, "img", "cards", "official", `${id}-${slugify(card.officialName || card.name || card.title)}${ext}`);
}

function modelFilePath(model) {
  const ext = extensionFromUrl(model.officialImage, ".png");
  const id = model.officialId ?? model.id ?? "model";
  const label = [model.officialName || model.realname, model.officialAlias || model.name].filter(Boolean).join("-");
  return path.join(ROOT, "img", "official-characters", `${id}-${slugify(label)}${ext}`);
}

function collectCardJobs(windowData) {
  if (!shouldDownloadCards) return [];

  const collections = [
    { name: "builder", items: windowData.BMG_BUILDER_CARDS || [] },
    { name: "mandatory", items: windowData.BMG_BUILDER_MANDATORY_CARDS || [] }
  ];
  const jobs = [];
  const seen = new Set();

  for (const collection of collections) {
    for (const card of collection.items) {
      if (!includeDisabled && card.disabledLocalOnlyCard) continue;
      if (!imageNeedsDownload(card)) continue;

      const officialId = Number(card.officialId);
      if (!Number.isFinite(officialId)) continue;

      const filePath = cardFilePath(card);
      const key = `card:${officialId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push({
        kind: "card",
        collection: collection.name,
        officialId,
        name: card.officialName || card.name || card.title || `Card ${officialId}`,
        url: card.officialImage,
        path: relPath(filePath),
        filePath
      });
    }
  }

  return jobs;
}

function collectModelJobs(windowData) {
  if (!shouldDownloadModels) return [];

  const jobs = [];
  const seen = new Set();
  for (const model of windowData.models || []) {
    if (!includeDisabled && model.disabledLocalOnlyModel) continue;
    if (!imageNeedsDownload(model)) continue;

    const officialId = Number(model.officialId);
    if (!Number.isFinite(officialId)) continue;

    const filePath = modelFilePath(model);
    const key = `model:${officialId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push({
      kind: "model",
      officialId,
      name: model.officialAlias || model.name || model.officialName || `Model ${officialId}`,
      url: model.officialImage,
      path: relPath(filePath),
      filePath
    });
  }
  return jobs;
}

function runPowerShellDownload(url, filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const timeoutSeconds = Math.max(10, Math.ceil(requestTimeout / 1000));
  return new Promise((resolve, reject) => {
    const child = spawn(POWERSHELL, [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      DOWNLOAD_PS1,
      url,
      filePath,
      String(timeoutSeconds)
    ], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error((stderr || stdout || `PowerShell exited with ${code}`).trim()));
      }
    });
  });
}

async function download(url, filePath) {
  await runPowerShellDownload(url, filePath);
  const bytes = fs.readFileSync(filePath);
  if (bytes.length < 128) throw new Error(`image-too-small:${bytes.length}`);

  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  if (placeholderHash && hash === placeholderHash) throw new Error("official-placeholder-image");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, bytes);
  return bytes.length;
}

async function runJobs(jobs) {
  const downloaded = [];
  const skipped = [];
  let nextIndex = 0;
  let networkAttempts = 0;

  async function worker() {
    while (nextIndex < jobs.length) {
      const index = nextIndex;
      nextIndex += 1;
      const job = jobs[index];

      if (fs.existsSync(job.filePath) && !force) {
        downloaded.push({ ...job, filePath: undefined, status: "exists" });
        continue;
      }

      if (networkAttempts >= limit) {
        skipped.push({ ...job, filePath: undefined, reason: "limit-reached" });
        continue;
      }

      if (dryRun) {
        downloaded.push({ ...job, filePath: undefined, status: "dry-run" });
        networkAttempts += 1;
        continue;
      }

      networkAttempts += 1;
      try {
        const bytes = await download(job.url, job.filePath);
        downloaded.push({ ...job, filePath: undefined, status: "downloaded", bytes });
      } catch (error) {
        skipped.push({ ...job, filePath: undefined, reason: "download-failed", error: error?.message || String(error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));
  return { downloaded, skipped };
}

function buildOverrideBlock(cardOverrides, modelOverrides) {
  return `${START}
// Generated by tools/download-official-assets.mjs.
const officialCardImageOverrides = ${JSON.stringify(cardOverrides, null, 2)};
const officialModelImageOverrides = ${JSON.stringify(modelOverrides, null, 2)};

function applyOfficialImageOverrides(collection, overrides) {
  for (const item of collection || []) {
    const imagePath = overrides[String(item.officialId)];
    if (imagePath) item.img = imagePath;
  }
}

applyOfficialImageOverrides(builderCards, officialCardImageOverrides);
applyOfficialImageOverrides(builderMandatoryCards, officialCardImageOverrides);
applyOfficialImageOverrides(models, officialModelImageOverrides);
${END}`;
}

function insertOrReplaceBlock(source, block) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);
  if (startIndex >= 0 && endIndex >= startIndex) {
    return `${source.slice(0, startIndex)}${block}${source.slice(endIndex + END.length)}`;
  }

  const anchor = "window.models = models;";
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) throw new Error("Could not find insertion point before window.models = models.");
  return `${source.slice(0, anchorIndex)}${block}\n\n${source.slice(anchorIndex)}`;
}

function existingOverridesFromContext(windowData) {
  const cardOverrides = {};
  const modelOverrides = {};

  for (const card of [...(windowData.BMG_BUILDER_CARDS || []), ...(windowData.BMG_BUILDER_MANDATORY_CARDS || [])]) {
    if (card.officialId !== undefined && card.officialId !== null && card.img && card.img !== "img/no.png" && card.img.includes("/official/")) {
      cardOverrides[String(card.officialId)] = card.img;
    }
  }

  for (const model of windowData.models || []) {
    if (model.officialId !== undefined && model.officialId !== null && model.img && model.img !== "img/no.png" && model.img.includes("official-characters/")) {
      modelOverrides[String(model.officialId)] = model.img;
    }
  }

  return { cardOverrides, modelOverrides };
}

const source = fs.readFileSync(DATA_JS, "utf8");
const baseSource = stripGeneratedBlock(source);
const windowData = loadContext(baseSource);
const jobs = [...collectCardJobs(windowData), ...collectModelJobs(windowData)];
const selectedJobs = Number.isFinite(limit) ? jobs.slice(0, limit) : jobs;
const { downloaded, skipped } = await runJobs(selectedJobs);

const afterSourceWindowData = loadContext(baseSource);
const { cardOverrides, modelOverrides } = existingOverridesFromContext(afterSourceWindowData);
for (const job of jobs) {
  if (!fs.existsSync(job.filePath)) continue;
  const bytes = fs.readFileSync(job.filePath);
  if (bytes.length < 128) continue;
  if (job.kind === "card") cardOverrides[String(job.officialId)] = job.path;
  if (job.kind === "model") modelOverrides[String(job.officialId)] = job.path;
}
for (const item of downloaded) {
  if (item.status !== "downloaded" && item.status !== "exists") continue;
  if (item.kind === "card") cardOverrides[String(item.officialId)] = item.path;
  if (item.kind === "model") modelOverrides[String(item.officialId)] = item.path;
}

const block = buildOverrideBlock(cardOverrides, modelOverrides);
if (!dryRun) {
  fs.writeFileSync(DATA_JS, insertOrReplaceBlock(source, block), "utf8");
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(REPORT_PATH, JSON.stringify({
  generatedAt: new Date().toISOString(),
  dryRun,
  force,
  includeDisabled,
  requestTimeout,
  concurrency,
  requested: jobs.length,
  selected: selectedJobs.length,
  downloaded,
  skipped,
  overrides: {
    cards: Object.keys(cardOverrides).length,
    models: Object.keys(modelOverrides).length
  }
}, null, 2), "utf8");

console.log(`wrote ${REPORT_PATH}`);
console.log(JSON.stringify({
  dryRun,
  requested: jobs.length,
  selected: selectedJobs.length,
  downloaded: downloaded.length,
  skipped: skipped.length,
  cardOverrides: Object.keys(cardOverrides).length,
  modelOverrides: Object.keys(modelOverrides).length
}, null, 2));
