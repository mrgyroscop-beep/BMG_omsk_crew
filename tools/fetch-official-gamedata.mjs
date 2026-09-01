import fs from "node:fs";
import path from "node:path";

const SOURCE_URL = "https://app.knightmodels.com/gamedata/";
const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "reports", "external", "official");
const OUT_JSON = path.join(OUT_DIR, "knightmodels_gamedata.json");
const OUT_META = path.join(OUT_DIR, "knightmodels_gamedata.meta.json");

const args = new Set(process.argv.slice(2));
const maxAttempts = Number(process.env.KM_FETCH_ATTEMPTS || 3);
const quiet = args.has("--quiet");

fs.mkdirSync(OUT_DIR, { recursive: true });

function log(...parts) {
  if (!quiet) console.log(...parts);
}

async function fetchOnce(attempt) {
  const tempPath = `${OUT_JSON}.attempt-${attempt}.tmp`;
  const startedAt = new Date().toISOString();
  const res = await fetch(SOURCE_URL, {
    headers: {
      accept: "application/json",
      "user-agent": "Mozilla/5.0 BMG-Omsk-Crew-Importer"
    }
  });

  log(`attempt ${attempt}: HTTP ${res.status} ${res.headers.get("content-type") || ""} ${res.headers.get("content-encoding") || ""}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const file = fs.createWriteStream(tempPath, { encoding: "utf8" });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let chunks = 0;
  let lastLog = Date.now();
  let complete = false;
  let error = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        complete = true;
        break;
      }

      const text = decoder.decode(value, { stream: true });
      bytes += Buffer.byteLength(text, "utf8");
      chunks += 1;
      file.write(text);

      const now = Date.now();
      if (now - lastLog >= 10000) {
        log(`attempt ${attempt}: ${bytes} bytes, ${chunks} chunks`);
        lastLog = now;
      }
    }

    const tail = decoder.decode();
    if (tail) {
      bytes += Buffer.byteLength(tail, "utf8");
      file.write(tail);
    }
  } catch (err) {
    error = err;
  } finally {
    await new Promise(resolve => file.end(resolve));
  }

  let validJson = false;
  if (complete) {
    try {
      JSON.parse(fs.readFileSync(tempPath, "utf8"));
      validJson = true;
    } catch (err) {
      error = err;
      complete = false;
    }
  }

  return {
    attempt,
    tempPath,
    bytes,
    chunks,
    startedAt,
    finishedAt: new Date().toISOString(),
    complete,
    validJson,
    error: error ? String(error?.stack || error) : null
  };
}

const results = [];
let best = null;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    const result = await fetchOnce(attempt);
    results.push(result);
    log(`attempt ${attempt}: saved ${result.bytes} bytes${result.complete ? " complete" : " partial"}`);
    if (!best || result.bytes > best.bytes || (result.validJson && !best.validJson)) best = result;
    if (result.validJson) break;
  } catch (err) {
    const result = {
      attempt,
      bytes: 0,
      chunks: 0,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      complete: false,
      validJson: false,
      error: String(err?.stack || err)
    };
    results.push(result);
    log(`attempt ${attempt}: failed`, result.error);
  }
}

if (!best?.tempPath || !fs.existsSync(best.tempPath)) {
  fs.writeFileSync(OUT_META, JSON.stringify({ source: SOURCE_URL, results }, null, 2));
  throw new Error("No official gamedata payload was downloaded.");
}

if (best.validJson) {
  const payload = JSON.parse(fs.readFileSync(best.tempPath, "utf8"));
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
} else {
  fs.copyFileSync(best.tempPath, OUT_JSON);
}
fs.writeFileSync(OUT_META, JSON.stringify({
  source: SOURCE_URL,
  downloadedAt: new Date().toISOString(),
  bestAttempt: best.attempt,
  complete: best.complete,
  validJson: best.validJson,
  bytes: best.bytes,
  results
}, null, 2));

log(`best attempt ${best.attempt}: ${best.bytes} bytes; ${best.validJson ? "valid full JSON" : "partial JSON prefix"}`);
log(`wrote ${OUT_JSON}`);
