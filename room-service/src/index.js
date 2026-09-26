const ROOM_TTL_SECONDS = 24 * 60 * 60;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_ROSTER_BYTES = 96 * 1024;
const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "0123456789";
const ROOM_CODE_PATTERN = /^(?:\d{6}|[A-HJ-NP-Z2-9]{6})$/u;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env.ALLOWED_ORIGINS);
    if (origin && !cors) return jsonError(403, "origin_forbidden", "Этот сайт не может обращаться к комнатам.");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const response = await routeRequest(request, env);
      applyHeaders(response.headers, cors);
      return response;
    } catch (error) {
      const status = Number(error?.status) || 500;
      const code = error?.code || "internal_error";
      const message = status >= 500 ? "Сервис комнат временно недоступен." : String(error?.message || "Ошибка комнаты.");
      if (status >= 500) {
        console.error(JSON.stringify({ event: "room_error", name: error?.name || "Error" }));
      }
      const response = jsonError(status, code, message);
      applyHeaders(response.headers, cors);
      return response;
    }
  }
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "rooms") {
    throw httpError(404, "not_found", "Маршрут не найден.");
  }

  if (request.method === "POST" && parts.length === 2) {
    return createRoom(request, env);
  }

  const code = normalizeRoomCode(parts[2]);
  if (request.method === "POST" && parts[3] === "join" && parts.length === 4) {
    return joinRoom(request, env, code);
  }
  if (parts.length !== 3) throw httpError(404, "not_found", "Маршрут не найден.");
  if (request.method === "GET") return readRoom(request, env, code);
  if (request.method === "PATCH") return updateRoom(request, env, code);
  if (request.method === "DELETE") return leaveRoom(request, env, code);
  throw httpError(405, "method_not_allowed", "Метод не поддерживается.");
}

async function createRoom(request, env) {
  const input = await readJson(request);
  const roster = validateRoster(input?.roster);
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = unixTime();
  await env.DB.prepare("DELETE FROM match_rooms WHERE expires_at <= ?").bind(now).run();

  let roomCode = "";
  for (let attempt = 0; attempt < 12 && !roomCode; attempt += 1) {
    const candidate = randomRoomCode();
    try {
      await env.DB.prepare(
        `INSERT INTO match_rooms
          (id, room_code, host_token_hash, host_roster_json, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        crypto.randomUUID(),
        candidate,
        tokenHash,
        JSON.stringify(roster),
        now,
        now,
        now + ROOM_TTL_SECONDS,
      ).run();
      roomCode = candidate;
    } catch {
      // Retry the rare active-room code collision.
    }
  }
  if (!roomCode) throw httpError(503, "room_capacity", "Не удалось подобрать код комнаты. Повторите позже.");

  const row = await selectRoom(env.DB, roomCode);
  return json({ room: roomResponse(row, "host"), token }, 201);
}

async function joinRoom(request, env, roomCode) {
  const input = await readJson(request);
  const roster = validateRoster(input?.roster);
  const existing = await activeRoom(env.DB, roomCode);
  if (existing.status === "finished") throw httpError(404, "room_not_found", "Комната закрыта.");
  if (existing.guest_token_hash) throw httpError(409, "room_full", "В комнате уже находятся два игрока.");

  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = unixTime();
  const result = await env.DB.prepare(
    `UPDATE match_rooms
     SET guest_token_hash = ?, guest_roster_json = ?, guest_ready = 0, host_ready = 0,
         status = 'preparing', version = version + 1, updated_at = ?
     WHERE room_code = ? AND guest_token_hash IS NULL AND status = 'waiting' AND expires_at > ?`,
  ).bind(tokenHash, JSON.stringify(roster), now, roomCode, now).run();
  if (result.meta.changes !== 1) throw httpError(409, "room_full", "К комнате уже подключился другой игрок.");

  const row = await selectRoom(env.DB, roomCode);
  return json({ room: roomResponse(row, "guest"), token });
}

async function readRoom(request, env, roomCode) {
  const row = await activeRoom(env.DB, roomCode);
  const side = await authenticateRoom(request, row);
  return json({ room: roomResponse(row, side) });
}

async function updateRoom(request, env, roomCode) {
  const row = await activeRoom(env.DB, roomCode);
  const side = await authenticateRoom(request, row);
  const input = await readJson(request);
  const expectedVersion = Number(input?.expectedVersion);
  const ready = input?.ready;
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || typeof ready !== "boolean") {
    throw httpError(400, "invalid_request", "Некорректное обновление комнаты.");
  }
  if (expectedVersion !== row.version) throw httpError(409, "version_conflict", "Комната уже обновилась.");
  if (!row.guest_token_hash) throw httpError(409, "opponent_required", "Сначала дождитесь второго игрока.");
  if (row.status === "active") throw httpError(409, "match_started", "Матч уже начался.");

  const otherReady = side === "host" ? row.guest_ready === 1 : row.host_ready === 1;
  const nextStatus = ready && otherReady ? "active" : "preparing";
  const now = unixTime();
  const result = await env.DB.prepare(
    `UPDATE match_rooms
     SET ${side}_ready = ?, status = ?, version = version + 1, updated_at = ?
     WHERE room_code = ? AND version = ?`,
  ).bind(ready ? 1 : 0, nextStatus, now, roomCode, expectedVersion).run();
  if (result.meta.changes !== 1) throw httpError(409, "version_conflict", "Комната уже обновилась.");

  const updated = await selectRoom(env.DB, roomCode);
  return json({ room: roomResponse(updated, side) });
}

async function leaveRoom(request, env, roomCode) {
  const row = await activeRoom(env.DB, roomCode);
  const side = await authenticateRoom(request, row);
  const now = unixTime();
  if (side === "host") {
    await env.DB.prepare(
      "UPDATE match_rooms SET status = 'finished', version = version + 1, updated_at = ? WHERE room_code = ?",
    ).bind(now, roomCode).run();
  } else {
    await env.DB.prepare(
      `UPDATE match_rooms
       SET guest_token_hash = NULL, guest_roster_json = NULL, guest_ready = 0, host_ready = 0,
           status = 'waiting', version = version + 1, updated_at = ?
       WHERE room_code = ?`,
    ).bind(now, roomCode).run();
  }
  return json({ ok: true });
}

async function authenticateRoom(request, row) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw httpError(401, "room_token_required", "Не найден ключ участника комнаты.");
  const tokenHash = await hashToken(token);
  if (tokenHash === row.host_token_hash) return "host";
  if (tokenHash === row.guest_token_hash) return "guest";
  throw httpError(403, "room_forbidden", "Этот браузер не является участником комнаты.");
}

function roomResponse(row, side) {
  if (!row) throw new Error("Room row is missing.");
  return {
    code: row.room_code,
    you: side,
    status: row.status,
    version: row.version,
    expiresAt: new Date(row.expires_at * 1000).toISOString(),
    host: {
      roster: parseRoster(row.host_roster_json),
      ready: row.host_ready === 1
    },
    guest: row.guest_token_hash ? {
      roster: parseRoster(row.guest_roster_json),
      ready: row.guest_ready === 1
    } : null
  };
}

function validateRoster(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "invalid_roster", "Ростер имеет неверный формат.");
  }
  if (typeof value.faction !== "string" || value.faction.length > 100) {
    throw httpError(400, "invalid_roster", "В ростере не указана фракция.");
  }
  if (!Array.isArray(value.models) || value.models.length < 1 || value.models.length > 100) {
    throw httpError(400, "invalid_roster", "В ростере должно быть от 1 до 100 моделей.");
  }
  if (!Array.isArray(value.cards) || value.cards.length > 100) {
    throw httpError(400, "invalid_roster", "Некорректный список карт ростера.");
  }
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).byteLength > MAX_ROSTER_BYTES) {
    throw httpError(413, "roster_too_large", "Ростер слишком большой.");
  }
  return JSON.parse(serialized);
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) throw httpError(413, "payload_too_large", "Запрос слишком большой.");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw httpError(413, "payload_too_large", "Запрос слишком большой.");
  }
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw httpError(400, "invalid_json", "Не удалось прочитать запрос.");
  }
}

function selectRoom(database, roomCode) {
  return database.prepare("SELECT * FROM match_rooms WHERE room_code = ?").bind(roomCode).first();
}

async function activeRoom(database, roomCode) {
  const row = await selectRoom(database, roomCode);
  if (!row || row.expires_at <= unixTime() || row.status === "finished") {
    throw httpError(404, "room_not_found", "Комната не найдена или уже закрыта.");
  }
  return row;
}

function parseRoster(document) {
  if (!document) throw new Error("Room roster is missing.");
  return JSON.parse(document);
}

function normalizeRoomCode(value) {
  const code = String(value || "").toUpperCase().replace(/[^A-Z0-9]/gu, "");
  if (!ROOM_CODE_PATTERN.test(code)) throw httpError(400, "invalid_room_code", "Введите шестизначный код комнаты.");
  return code;
}

function randomRoomCode() {
  let code = "";
  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = new Uint8Array((ROOM_CODE_LENGTH - code.length) * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= 250) continue;
      code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}

async function hashToken(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(origin, configuredOrigins = "") {
  if (!origin) return {};
  const allowed = String(configuredOrigins).split(",").map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(origin)) return null;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function applyHeaders(headers, extra = {}) {
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  Object.entries(extra || {}).forEach(([key, value]) => headers.set(key, value));
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function jsonError(status, code, message) {
  return json({ error: { code, message } }, status);
}

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}
