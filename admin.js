const ADMIN_STANDARD_KEYS = new Set([
  "id",
  "name",
  "realname",
  "base",
  "rep",
  "funding",
  "print",
  "rank",
  "faction",
  "img",
  "stats",
  "traits",
  "weapons"
]);

const ADMIN_DEFAULT_STATS = {
  Attack: "",
  Defense: "",
  Strength: "",
  Movement: "",
  Willpower: "",
  Endurance: ""
};

const ADMIN_STORAGE_KEY = "bmg_admin_session_v1";
const ADMIN_STORAGE_DEBOUNCE_MS = 150;
const ADMIN_SOURCE_HANDLE_DB = "bmg_admin_handles";
const ADMIN_SOURCE_HANDLE_STORE = "fileHandles";
const ADMIN_SOURCE_HANDLE_KEY = "modelsJsonSource";
const ADMIN_DATA_JS_HANDLE_KEY = "dataJsSource";
const ADMIN_BACKUP_DIR_HANDLE_KEY = "modelsBackupDir";
const ADMIN_IMAGE_DIR_HANDLE_KEY = "imageDir";
const ADMIN_BACKUP_MANIFEST_NAME = "manifest.json";
const ADMIN_MAX_BACKUPS = 20;

const adminState = {
  models: [],
  selectedId: null,
  draftModel: null,
  dirty: false,
  sourceLabel: "",
  previewUrl: null,
  persistTimer: null,
  sessionRestored: false,
  lastSavedAt: null,
  sourceFileHandle: null,
  sourceFileName: "",
  sourceWriteSupported: false,
  dataJsFileHandle: null,
  dataJsFileName: "",
  backupDirHandle: null,
  backupDirName: "",
  imageDirHandle: null,
  imageDirName: "",
  pendingImageFile: null
};

const adminDom = {};
const adminPrintableNames = window.PRINTABLE_MODEL_NAMES || new Set();
const adminPrintableKeys = window.PRINTABLE_MODEL_KEYS || new Set();
const adminPrintableImageKeys = window.PRINTABLE_MODEL_IMAGE_KEYS || new Set();

document.addEventListener("DOMContentLoaded", () => {
  cacheAdminDom();
  bindAdminEvents();
  window.addEventListener("beforeunload", flushAdminSessionSave);
  restoreAdminSourceFileHandle();
  restoreAdminDataJsFileHandle();
  restoreAdminBackupDirHandle();
  restoreAdminImageDirHandle();
  updateAdminSourceButtons();

  if (restoreAdminSession()) return;
  loadInitialAdminModels();
});

function cacheAdminDom() {
  adminDom.sourceStatus = document.getElementById("sourceStatus");
  adminDom.searchInput = document.getElementById("searchInput");
  adminDom.factionFilter = document.getElementById("factionFilter");
  adminDom.listCount = document.getElementById("listCount");
  adminDom.dirtyState = document.getElementById("dirtyState");
  adminDom.modelList = document.getElementById("modelList");
  adminDom.editorEmptyState = document.getElementById("editorEmptyState");
  adminDom.editorPanel = document.getElementById("editorPanel");
  adminDom.reloadBundledBtn = document.getElementById("reloadBundledBtn");
  adminDom.bindSourceBtn = document.getElementById("bindSourceBtn");
  adminDom.saveToSourceBtn = document.getElementById("saveToSourceBtn");
  adminDom.bindDataJsBtn = document.getElementById("bindDataJsBtn");
  adminDom.buildDataJsBtn = document.getElementById("buildDataJsBtn");
  adminDom.bindBackupDirBtn = document.getElementById("bindBackupDirBtn");
  adminDom.createBackupBtn = document.getElementById("createBackupBtn");
  adminDom.versionHistoryBtn = document.getElementById("versionHistoryBtn");
  adminDom.bindImageDirBtn = document.getElementById("bindImageDirBtn");
  adminDom.uploadImageBtn = document.getElementById("uploadImageBtn");
  adminDom.resetSessionBtn = document.getElementById("resetSessionBtn");
  adminDom.loadJsonBtn = document.getElementById("loadJsonBtn");
  adminDom.downloadJsonBtn = document.getElementById("downloadJsonBtn");
  adminDom.downloadDataJsBtn = document.getElementById("downloadDataJsBtn");
  adminDom.newModelBtn = document.getElementById("newModelBtn");
  adminDom.duplicateModelBtn = document.getElementById("duplicateModelBtn");
  adminDom.deleteModelBtn = document.getElementById("deleteModelBtn");
  adminDom.jsonFileInput = document.getElementById("jsonFileInput");
  adminDom.imageFileInput = document.getElementById("imageFileInput");
  adminDom.backupHistoryModal = document.getElementById("backupHistoryModal");
  adminDom.backupHistoryList = document.getElementById("backupHistoryList");
  adminDom.closeBackupHistoryBtn = document.getElementById("closeBackupHistoryBtn");
}

function bindAdminEvents() {
  adminDom.searchInput.addEventListener("input", () => {
    renderAdminModelList();
    scheduleAdminSessionSave();
  });
  adminDom.factionFilter.addEventListener("change", () => {
    renderAdminModelList();
    scheduleAdminSessionSave();
  });
  adminDom.reloadBundledBtn.addEventListener("click", () => {
    if (!confirmLoseAdminDraft()) return;
    clearAdminStoredSession();
    loadInitialAdminModels(true);
  });
  adminDom.bindSourceBtn.addEventListener("click", bindAdminSourceFile);
  adminDom.saveToSourceBtn.addEventListener("click", saveAdminModelsToSourceFile);
  adminDom.bindDataJsBtn.addEventListener("click", bindAdminDataJsFile);
  adminDom.buildDataJsBtn.addEventListener("click", buildAndSaveAdminDataJs);
  adminDom.bindBackupDirBtn.addEventListener("click", bindAdminBackupDirectory);
  adminDom.createBackupBtn.addEventListener("click", () => createAdminBackupSnapshot("manual"));
  adminDom.versionHistoryBtn.addEventListener("click", openAdminBackupHistory);
  adminDom.resetSessionBtn.addEventListener("click", resetAdminLocalSession);
  adminDom.loadJsonBtn.addEventListener("click", () => adminDom.jsonFileInput.click());
  adminDom.downloadJsonBtn.addEventListener("click", downloadAdminModelsJson);
  adminDom.downloadDataJsBtn.addEventListener("click", downloadGeneratedAdminDataJs);
  adminDom.newModelBtn.addEventListener("click", createAdminModel);
  adminDom.duplicateModelBtn.addEventListener("click", duplicateAdminModel);
  adminDom.deleteModelBtn.addEventListener("click", deleteAdminModel);

  adminDom.jsonFileInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!confirmLoseAdminDraft()) {
      event.target.value = "";
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Файл должен содержать массив моделей.");
      loadAdminModels(parsed, `Загружено из ${file.name}`);
    } catch (error) {
      alert(`Не удалось загрузить JSON: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });

  adminDom.imageFileInput.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file || !adminState.draftModel) return;

    clearAdminPreviewUrl();
    adminState.previewUrl = URL.createObjectURL(file);
    adminState.pendingImageFile = file;

    const suggestedPath = `img/${file.name}`;
    adminState.draftModel.img = suggestedPath;
    markAdminDirty();
    renderAdminEditor();
    updateAdminImageButtons();
    event.target.value = "";
    return;

    alert("Превью обновлено. В поле img подставлен рекомендуемый путь. Сам файл пока нужно положить в проект вручную.");
    event.target.value = "";
  });

  adminDom.closeBackupHistoryBtn?.addEventListener("click", closeAdminBackupHistory);
  adminDom.backupHistoryModal?.addEventListener("click", event => {
    if (event.target.matches("[data-close-backup-history]")) {
      closeAdminBackupHistory();
    }
  });
}

async function loadInitialAdminModels(forceReload = false) {
  try {
    const response = await fetch(`./data-source/models.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    loadAdminModels(json, "Источник: data-source/models.json");
    return;
  } catch (error) {
    if (!forceReload && Array.isArray(window.models)) {
      loadAdminModels(window.models, "Источник: data.js (fallback)");
      return;
    }
    if (forceReload && Array.isArray(window.models)) {
      loadAdminModels(window.models, "Источник: data.js (fallback)");
      return;
    }
    adminDom.sourceStatus.textContent = "Не удалось автоматически загрузить модели. Используйте кнопку «Загрузить JSON».";
  }
}

function loadAdminModels(rawModels, sourceLabel, options = {}) {
  clearAdminPreviewUrl();
  const cloned = deepClone(rawModels);
  const normalized = cloned.map((model, index) => normalizeAdminModel(model, index));
  ensureAdminStableIds(normalized);
  sortAdminModels(normalized);

  const requestedSelectedId = normalized.some(model => model.id === options.selectedId)
    ? options.selectedId
    : (normalized[0]?.id || null);
  const selectedModel = requestedSelectedId
    ? normalized.find(model => model.id === requestedSelectedId)
    : null;
  const restoredDraft = options.draftModel
    ? normalizeAdminModel(options.draftModel)
    : null;
  const canUseRestoredDraft = restoredDraft && restoredDraft.id === requestedSelectedId;

  adminState.models = normalized;
  adminState.sourceLabel = sourceLabel;
  adminState.selectedId = requestedSelectedId;
  adminState.draftModel = canUseRestoredDraft
    ? deepClone(restoredDraft)
    : (selectedModel ? deepClone(selectedModel) : null);
  adminState.dirty = Boolean(options.dirty && canUseRestoredDraft);
  adminState.sessionRestored = Boolean(options.restored);
  adminState.lastSavedAt = options.savedAt || null;

  adminDom.searchInput.value = options.search || "";
  renderAdminFactionFilter();
  adminDom.factionFilter.value = options.faction || "";
  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
  scheduleAdminSessionSave(true);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function canUseAdminStorage() {
  try {
    return typeof window.localStorage !== "undefined";
  } catch (error) {
    return false;
  }
}

function captureAdminSessionPayload() {
  return {
    version: 1,
    sourceLabel: adminState.sourceLabel,
    models: adminState.models,
    selectedId: adminState.selectedId,
    draftModel: adminState.draftModel,
    dirty: adminState.dirty,
    search: adminDom.searchInput?.value || "",
    faction: adminDom.factionFilter?.value || "",
    savedAt: new Date().toISOString()
  };
}

function flushAdminSessionSave() {
  if (adminState.persistTimer) {
    clearTimeout(adminState.persistTimer);
    adminState.persistTimer = null;
  }

  if (!canUseAdminStorage()) return;

  try {
    const payload = captureAdminSessionPayload();
    window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(payload));
    adminState.lastSavedAt = payload.savedAt;
  } catch (error) {
    console.warn("Failed to persist admin session", error);
  }
}

function scheduleAdminSessionSave(immediate = false) {
  if (!canUseAdminStorage()) return;

  if (adminState.persistTimer) {
    clearTimeout(adminState.persistTimer);
    adminState.persistTimer = null;
  }

  if (immediate) {
    flushAdminSessionSave();
    return;
  }

  adminState.persistTimer = setTimeout(() => {
    flushAdminSessionSave();
  }, ADMIN_STORAGE_DEBOUNCE_MS);
}

function clearAdminStoredSession() {
  if (adminState.persistTimer) {
    clearTimeout(adminState.persistTimer);
    adminState.persistTimer = null;
  }

  if (!canUseAdminStorage()) return;

  try {
    window.localStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch (error) {
    console.warn("Failed to clear admin session", error);
  }
}

function restoreAdminSession() {
  if (!canUseAdminStorage()) return false;

  try {
    const raw = window.localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return false;

    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.models) || !payload.models.length) {
      clearAdminStoredSession();
      return false;
    }

    loadAdminModels(payload.models, payload.sourceLabel || "Источник: локальная сессия", {
      selectedId: payload.selectedId,
      draftModel: payload.draftModel,
      dirty: payload.dirty,
      search: payload.search || "",
      faction: payload.faction || "",
      restored: true,
      savedAt: payload.savedAt || null
    });
    return true;
  } catch (error) {
    clearAdminStoredSession();
    console.warn("Failed to restore admin session", error);
    return false;
  }
}

function supportsAdminSourceWrite() {
  return typeof window.showOpenFilePicker === "function"
    && typeof window.indexedDB !== "undefined";
}

function openAdminHandleDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(ADMIN_SOURCE_HANDLE_DB, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ADMIN_SOURCE_HANDLE_STORE)) {
        db.createObjectStore(ADMIN_SOURCE_HANDLE_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
  });
}

async function saveAdminSourceHandle(handle, storageKey = ADMIN_SOURCE_HANDLE_KEY) {
  if (!supportsAdminSourceWrite() || !handle) return;
  const db = await openAdminHandleDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(ADMIN_SOURCE_HANDLE_STORE, "readwrite");
    tx.objectStore(ADMIN_SOURCE_HANDLE_STORE).put(handle, storageKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Failed to save source handle"));
    tx.onabort = () => reject(tx.error || new Error("Source handle transaction aborted"));
  });

  db.close();
}

async function loadAdminSourceHandle(storageKey = ADMIN_SOURCE_HANDLE_KEY) {
  if (!supportsAdminSourceWrite()) return null;
  const db = await openAdminHandleDb();

  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(ADMIN_SOURCE_HANDLE_STORE, "readonly");
    const request = tx.objectStore(ADMIN_SOURCE_HANDLE_STORE).get(storageKey);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Failed to load source handle"));
  });

  db.close();
  return handle;
}

async function clearAdminSourceHandleStorage(storageKey = ADMIN_SOURCE_HANDLE_KEY) {
  if (!supportsAdminSourceWrite()) return;
  const db = await openAdminHandleDb();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(ADMIN_SOURCE_HANDLE_STORE, "readwrite");
    tx.objectStore(ADMIN_SOURCE_HANDLE_STORE).delete(storageKey);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Failed to clear source handle"));
    tx.onabort = () => reject(tx.error || new Error("Source handle clear aborted"));
  });

  db.close();
}

async function restoreAdminSourceFileHandle() {
  adminState.sourceWriteSupported = supportsAdminSourceWrite();
  if (!adminState.sourceWriteSupported) {
    updateAdminSourceButtons();
    if (adminState.models.length) updateAdminStatus();
    return;
  }

  try {
    const handle = await loadAdminSourceHandle();
    if (!handle) {
      updateAdminSourceButtons();
      return;
    }

    adminState.sourceFileHandle = handle;
    adminState.sourceFileName = handle.name || "models.json";
  } catch (error) {
    console.warn("Failed to restore bound source file", error);
    adminState.sourceFileHandle = null;
    adminState.sourceFileName = "";
  }

  updateAdminSourceButtons();
  if (adminState.models.length) updateAdminStatus();
}

function updateAdminSourceButtons() {
  if (!adminDom.bindSourceBtn || !adminDom.saveToSourceBtn) return;

  const supported = supportsAdminSourceWrite();
  adminState.sourceWriteSupported = supported;

  if (!supported) {
    adminDom.bindSourceBtn.disabled = true;
    adminDom.saveToSourceBtn.disabled = true;
    adminDom.bindSourceBtn.textContent = "Прямая запись недоступна";
    adminDom.saveToSourceBtn.textContent = "Используйте Скачать models.json";
    return;
  }

  adminDom.bindSourceBtn.disabled = false;
  adminDom.saveToSourceBtn.disabled = !adminState.models.length;
  adminDom.bindSourceBtn.textContent = adminState.sourceFileHandle
    ? `Источник: ${adminState.sourceFileName || "models.json"}`
    : "Привязать models.json";
  adminDom.saveToSourceBtn.textContent = adminState.sourceFileHandle
    ? "Сохранить в источник"
    : "Привязать и сохранить";
}

async function ensureAdminSourcePermission(handle) {
  if (!handle) return false;
  if (typeof handle.queryPermission !== "function" || typeof handle.requestPermission !== "function") {
    return true;
  }

  const options = { mode: "readwrite" };
  let permission = await handle.queryPermission(options);
  if (permission !== "granted") {
    permission = await handle.requestPermission(options);
  }

  return permission === "granted";
}

async function bindAdminSourceFile() {
  if (!supportsAdminSourceWrite()) {
    alert("Этот браузер не поддерживает прямую запись в исходный файл. Используйте кнопку скачивания models.json.");
    return;
  }

  try {
    const handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "JSON files",
        accept: { "application/json": [".json"] }
      }]
    });

    const handle = handles?.[0];
    if (!handle) return;

    const hasPermission = await ensureAdminSourcePermission(handle);
    if (!hasPermission) {
      alert("Браузер не дал доступ на запись в выбранный файл.");
      return;
    }

    adminState.sourceFileHandle = handle;
    adminState.sourceFileName = handle.name || "models.json";
    await saveAdminSourceHandle(handle);
    updateAdminSourceButtons();
    updateAdminStatus();
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Failed to bind source file", error);
    alert(`Не удалось привязать исходный файл: ${error.message || error}`);
  }
}

async function saveAdminModelsToSourceFile() {
  if (!adminState.models.length) {
    alert("Нет моделей для сохранения.");
    return;
  }

  if (!supportsAdminSourceWrite()) {
    alert("Этот браузер не поддерживает прямую запись в файл. Используйте кнопку скачивания models.json.");
    return;
  }

  if (adminState.dirty) {
    saveAdminDraftModel();
    if (adminState.dirty) return;
  }

  if (!adminState.sourceFileHandle) {
    await bindAdminSourceFile();
    if (!adminState.sourceFileHandle) return;
  }

  try {
    const hasPermission = await ensureAdminSourcePermission(adminState.sourceFileHandle);
    if (!hasPermission) {
      alert("Нет разрешения на запись в привязанный файл.");
      return;
    }

    const writable = await adminState.sourceFileHandle.createWritable();
    await writable.write(JSON.stringify(adminState.models, null, 2));
    await writable.close();

    adminState.sourceFileName = adminState.sourceFileHandle.name || adminState.sourceFileName;
    adminState.sessionRestored = false;
    scheduleAdminSessionSave(true);
    updateAdminSourceButtons();
    updateAdminStatus();
    alert(`Изменения сохранены в ${adminState.sourceFileName}.`);
  } catch (error) {
    console.warn("Failed to save models to source file", error);
    alert(`Не удалось сохранить models.json: ${error.message || error}`);
  }
}

function slugifyAdminIdPart(value) {
  return String(value || "model")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "model";
}

function buildAdminBaseId(model) {
  return [
    slugifyAdminIdPart(model.name),
    slugifyAdminIdPart(model.realname),
    slugifyAdminIdPart(model.base)
  ].join("-");
}

function ensureAdminStableIds(modelList) {
  const used = new Set();

  modelList.forEach((model, index) => {
    const rawBase = String(model.id || buildAdminBaseId(model) || `model-${index + 1}`).trim();
    let candidate = rawBase;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${rawBase}-${suffix++}`;
    }
    model.id = candidate;
    used.add(candidate);
  });
}

function sortAdminModels(modelList) {
  modelList.sort((a, b) => {
    const nameCompare = String(a.name || "").localeCompare(String(b.name || ""), "ru", { sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;
    return String(a.realname || "").localeCompare(String(b.realname || ""), "ru", { sensitivity: "base" });
  });
}

function normalizeAdminStringArray(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item).trim()).filter(Boolean);
  }
  if (!value) return [];
  return String(value)
    .split(/[\n,;]+/g)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeAdminNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAdminStatValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

function normalizeAdminWeapon(weapon = {}) {
  return {
    name: String(weapon.name || "").trim(),
    damage: weapon.damage ?? "",
    rof: weapon.rof ?? "",
    ammo: weapon.ammo ?? "",
    traits: weapon.traits ?? ""
  };
}

function buildAdminPrintableKey(model = {}) {
  return `${model.name || ""}||${String(model.realname || "").replace(/\s*\/\s*\d+mm$/i, "").trim()}||${model.base || ""}`;
}

function buildAdminImageKey(model = {}) {
  if (!model.img) return "";
  return String(model.img).replace(/\\/g, "/").split("/").pop() || "";
}

function inferAdminPrintValue(model = {}) {
  if (model.print !== undefined && model.print !== null) {
    if (typeof model.print === "string") {
      return model.print.toLowerCase() === "yes" || model.print.toLowerCase() === "true";
    }
    return Boolean(model.print);
  }

  return adminPrintableNames.has(model.name)
    || adminPrintableKeys.has(buildAdminPrintableKey(model))
    || adminPrintableImageKeys.has(buildAdminImageKey(model));
}

function normalizeAdminModel(model = {}, index = 0) {
  const normalized = deepClone(model);
  normalized.id = String(normalized.id || "").trim();
  normalized.name = String(normalized.name || `New Model ${index + 1}`).trim();
  normalized.realname = String(normalized.realname || "Unknown").trim();
  normalized.base = String(normalized.base || "30mm").trim();
  normalized.rep = normalizeAdminNumber(normalized.rep, 0);
  normalized.funding = normalizeAdminNumber(normalized.funding, 0);
  normalized.print = inferAdminPrintValue(normalized);
  normalized.rank = normalizeAdminStringArray(normalized.rank);
  normalized.faction = normalizeAdminStringArray(normalized.faction);
  normalized.img = String(normalized.img || "").trim();
  normalized.traits = normalizeAdminStringArray(normalized.traits);
  normalized.stats = { ...ADMIN_DEFAULT_STATS, ...(normalized.stats || {}) };
  Object.keys(normalized.stats).forEach(key => {
    normalized.stats[key] = normalizeAdminStatValue(normalized.stats[key]);
  });
  normalized.weapons = Array.isArray(normalized.weapons) ? normalized.weapons.map(normalizeAdminWeapon) : [];
  return normalized;
}

function updateAdminStatus() {
  const dirtyText = adminState.dirty
    ? "Есть несохранённые правки в редакторе"
    : "Локальная форма синхронизирована";

  adminDom.sourceStatus.textContent = `${adminState.sourceLabel} • ${adminState.models.length} моделей`;
  adminDom.dirtyState.textContent = dirtyText;
  adminDom.dirtyState.classList.toggle("is-dirty", adminState.dirty);
}

function renderAdminFactionFilter() {
  const currentValue = adminDom.factionFilter.value;
  const factions = [...new Set(adminState.models.flatMap(model => model.faction || []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru", { sensitivity: "base" }));

  adminDom.factionFilter.innerHTML = [
    `<option value="">Все фракции</option>`,
    ...factions.map(faction => `<option value="${escapeHtml(faction)}">${escapeHtml(faction)}</option>`)
  ].join("");

  if (factions.includes(currentValue)) {
    adminDom.factionFilter.value = currentValue;
  }
}

function getFilteredAdminModels() {
  const search = adminDom.searchInput.value.trim().toLowerCase();
  const faction = adminDom.factionFilter.value;

  return adminState.models.filter(model => {
    if (faction && !(model.faction || []).includes(faction)) return false;
    if (!search) return true;

    const haystack = [
      model.id,
      model.name,
      model.realname,
      model.base,
      ...(model.faction || []),
      ...(model.rank || [])
    ].join(" ").toLowerCase();

    return haystack.includes(search);
  });
}

function renderAdminModelList() {
  const items = getFilteredAdminModels();
  adminDom.listCount.textContent = `${items.length} из ${adminState.models.length} моделей`;

  if (!items.length) {
    adminDom.modelList.innerHTML = `<div class="model-list-item"><strong>Ничего не найдено</strong><div class="meta">Попробуйте другой поиск или фильтр.</div></div>`;
    return;
  }

  adminDom.modelList.innerHTML = items.map(model => {
    const activeClass = model.id === adminState.selectedId ? "is-active" : "";
    const factions = (model.faction || []).join(" • ") || "—";
    const ranks = (model.rank || []).join(" / ") || "—";

    return `
      <button class="model-list-item ${activeClass}" data-model-id="${escapeHtml(model.id)}">
        <strong>${escapeHtml(model.name)}</strong>
        <div class="meta">
          ${escapeHtml(model.realname || "Unknown")}<br>
          ${escapeHtml(ranks)} • ${escapeHtml(factions)}<br>
          ${escapeHtml(String(model.rep))} REP • $${escapeHtml(String(model.funding))}
        </div>
      </button>
    `;
  }).join("");

  adminDom.modelList.querySelectorAll("[data-model-id]").forEach(button => {
    button.addEventListener("click", () => selectAdminModel(button.dataset.modelId));
  });
}

function selectAdminModel(modelId) {
  if (adminState.selectedId === modelId && adminState.dirty) return;
  if (adminState.dirty && !confirm("Есть несохранённые правки формы. Переключиться без сохранения?")) return;

  const model = adminState.models.find(item => item.id === modelId);
  if (!model) return;

  clearAdminPreviewUrl();
  adminState.selectedId = model.id;
  adminState.draftModel = deepClone(model);
  adminState.dirty = false;

  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
}

function renderAdminEditor() {
  const model = adminState.draftModel;

  if (!model) {
    adminDom.editorEmptyState.hidden = false;
    adminDom.editorPanel.hidden = true;
    return;
  }

  adminDom.editorEmptyState.hidden = true;
  adminDom.editorPanel.hidden = false;

  const extraFields = getAdminExtraFields(model);
  const previewHtml = getAdminPreviewMarkup(model);
  const imageFolderLabel = supportsAdminImageWrite()
    ? (adminState.imageDirHandle ? `Папка img: ${escapeHtml(adminState.imageDirName || "img")}` : "Папка img не привязана")
    : "Прямая загрузка файлов недоступна в этом браузере";
  const pendingImageLabel = adminState.pendingImageFile
    ? `Выбран файл: ${escapeHtml(adminState.pendingImageFile.name)}`
    : "Новый файл изображения не выбран";
  const uploadDisabled = !supportsAdminImageWrite() || !adminState.pendingImageFile ? "disabled" : "";

  adminDom.editorPanel.innerHTML = `
    <div class="editor-head">
      <div>
        <h2>${escapeHtml(model.name || "Без имени")}</h2>
        <p class="mono">${escapeHtml(model.id)}</p>
      </div>
      <div class="editor-actions">
        <button id="saveModelBtn" class="admin-btn">Сохранить модель</button>
        <button id="resetModelBtn" class="admin-btn admin-btn-ghost">Сбросить форму</button>
      </div>
    </div>

    <div class="editor-scroll">
      <div class="editor-grid">
        <section class="editor-section two-col">
          <h3>Основное</h3>
          <div class="field-grid">
            <label class="field two-col">
              <span class="field-label">ID</span>
              <input id="field-id" class="admin-input mono" type="text" value="${escapeAttribute(model.id)}">
            </label>
            <label class="field two-col">
              <span class="field-label">Base</span>
              <input id="field-base" class="admin-input" type="text" value="${escapeAttribute(model.base)}">
            </label>

            <label class="field">
              <span class="field-label">Name</span>
              <input id="field-name" class="admin-input" type="text" value="${escapeAttribute(model.name)}">
            </label>

            <label class="field">
              <span class="field-label">Realname</span>
              <input id="field-realname" class="admin-input" type="text" value="${escapeAttribute(model.realname)}">
            </label>

            <label class="field two-col">
              <span class="field-label">REP</span>
              <input id="field-rep" class="admin-input" type="number" value="${escapeAttribute(String(model.rep))}">
            </label>

            <label class="field two-col">
              <span class="field-label">Funding</span>
              <input id="field-funding" class="admin-input" type="number" value="${escapeAttribute(String(model.funding))}">
            </label>

            <label class="field two-col">
              <span class="field-label">Print</span>
              <select id="field-print" class="admin-select">
                <option value="yes" ${model.print ? "selected" : ""}>yes</option>
                <option value="no" ${!model.print ? "selected" : ""}>no</option>
              </select>
            </label>

            <label class="field">
              <span class="field-label">Rank</span>
              <textarea id="field-rank" class="admin-textarea" rows="4">${escapeHtml((model.rank || []).join("\n"))}</textarea>
              <small>По одному значению на строку или через запятую.</small>
            </label>

            <label class="field">
              <span class="field-label">Faction</span>
              <textarea id="field-faction" class="admin-textarea" rows="4">${escapeHtml((model.faction || []).join("\n"))}</textarea>
              <small>По одному значению на строку или через запятую.</small>
            </label>
          </div>
        </section>

        <section class="editor-section two-col">
          <h3>Портрет</h3>
          <div class="image-panel">
            <div class="image-preview">${previewHtml}</div>
            <div class="image-inline-tools">
              <div class="image-actions">
                <button id="bindImageDirInlineBtn" class="admin-btn admin-btn-ghost" type="button">Привязать папку img</button>
                <button id="uploadImageInlineBtn" class="admin-btn" type="button" ${uploadDisabled}>Загрузить в img</button>
              </div>
              <small class="image-meta">${imageFolderLabel}<br>${pendingImageLabel}</small>
            </div>
            <div class="field-grid">
              <label class="field">
                <span class="field-label">Путь к изображению</span>
                <input id="field-img" class="admin-input mono" type="text" value="${escapeAttribute(model.img || "")}">
                <small>На этом этапе поле редактируется вручную. Кнопка ниже только подставляет рекомендуемый путь и показывает превью.</small>
              </label>

              <div class="field">
                <button id="chooseImageBtn" class="admin-btn admin-btn-ghost" type="button">Выбрать файл изображения</button>
              </div>
            </div>
          </div>
        </section>

        <section class="editor-section">
          <h3>Статы</h3>
          <div class="field-grid">
            ${renderAdminStatsFields(model.stats)}
          </div>
        </section>

        <section class="editor-section two-col">
          <h3>Трейты</h3>
          <label class="field">
            <textarea id="field-traits" class="admin-textarea" rows="14">${escapeHtml((model.traits || []).join("\n"))}</textarea>
            <small>Один трейт на строку.</small>
          </label>
        </section>

        <section class="editor-section two-col">
          <h3>Дополнительные поля</h3>
          <label class="field">
            <textarea id="field-extra-json" class="admin-textarea mono" rows="14">${escapeHtml(JSON.stringify(extraFields, null, 2))}</textarea>
            <small>Сюда попадают свойства, для которых пока нет отдельной формы: например <code>rivals</code> и похожие поля.</small>
          </label>
        </section>

        <section class="editor-section">
          <div class="weapon-card-head">
            <h3>Оружие</h3>
            <div class="weapon-actions">
              <button id="addWeaponBtn" class="admin-btn admin-btn-ghost" type="button">Добавить оружие</button>
            </div>
          </div>
          <div id="weaponsList" class="weapons-list">${renderAdminWeapons(model.weapons)}</div>
        </section>
      </div>
    </div>
  `;

  bindAdminEditorEvents();
}

function renderAdminStatsFields(stats) {
  return Object.entries(ADMIN_DEFAULT_STATS).map(([key]) => `
    <label class="field three-col">
      <span class="field-label">${escapeHtml(key)}</span>
      <input class="admin-input" type="text" data-stat-key="${escapeAttribute(key)}" value="${escapeAttribute(String(stats[key] ?? ""))}">
    </label>
  `).join("");
}

function renderAdminWeapons(weapons) {
  if (!weapons.length) {
    return `<div class="weapon-card"><div class="meta">У модели пока нет оружия.</div></div>`;
  }

  return weapons.map((weapon, index) => `
    <div class="weapon-card" data-weapon-index="${index}">
      <div class="weapon-card-head">
        <strong>${escapeHtml(weapon.name || `Weapon ${index + 1}`)}</strong>
        <div class="weapon-actions">
          <button class="admin-btn admin-btn-danger remove-weapon-btn" type="button" data-remove-weapon="${index}">Удалить</button>
        </div>
      </div>
      <div class="field-grid">
        <label class="field three-col">
          <span class="field-label">Name</span>
          <input class="admin-input" type="text" data-weapon-key="name" data-weapon-index="${index}" value="${escapeAttribute(String(weapon.name || ""))}">
        </label>
        <label class="field three-col">
          <span class="field-label">Damage</span>
          <input class="admin-input" type="text" data-weapon-key="damage" data-weapon-index="${index}" value="${escapeAttribute(String(weapon.damage ?? ""))}">
        </label>
        <label class="field three-col">
          <span class="field-label">ROF</span>
          <input class="admin-input" type="text" data-weapon-key="rof" data-weapon-index="${index}" value="${escapeAttribute(String(weapon.rof ?? ""))}">
        </label>
        <label class="field three-col">
          <span class="field-label">Ammo</span>
          <input class="admin-input" type="text" data-weapon-key="ammo" data-weapon-index="${index}" value="${escapeAttribute(String(weapon.ammo ?? ""))}">
        </label>
        <label class="field">
          <span class="field-label">Traits</span>
          <input class="admin-input" type="text" data-weapon-key="traits" data-weapon-index="${index}" value="${escapeAttribute(String(weapon.traits ?? ""))}">
        </label>
      </div>
    </div>
  `).join("");
}

function bindAdminEditorEvents() {
  const draft = adminState.draftModel;
  if (!draft) return;

  bindDraftField("field-id", value => draft.id = value.trim());
  bindDraftField("field-name", value => draft.name = value);
  bindDraftField("field-realname", value => draft.realname = value);
  bindDraftField("field-base", value => draft.base = value.trim());
  bindDraftField("field-rep", value => draft.rep = normalizeAdminNumber(value, 0));
  bindDraftField("field-funding", value => draft.funding = normalizeAdminNumber(value, 0));
  bindDraftField("field-print", value => draft.print = value === "yes");
  bindDraftField("field-img", value => draft.img = value.trim());
  bindDraftField("field-rank", value => draft.rank = normalizeAdminStringArray(value));
  bindDraftField("field-faction", value => draft.faction = normalizeAdminStringArray(value));
  bindDraftField("field-traits", value => draft.traits = normalizeAdminStringArray(value));

  adminDom.editorPanel.querySelectorAll("[data-stat-key]").forEach(input => {
    input.addEventListener("input", event => {
      draft.stats[event.target.dataset.statKey] = normalizeAdminStatValue(event.target.value);
      markAdminDirty();
    });
  });

  adminDom.editorPanel.querySelectorAll("[data-weapon-key]").forEach(input => {
    input.addEventListener("input", event => {
      const weaponIndex = Number(event.target.dataset.weaponIndex);
      const weaponKey = event.target.dataset.weaponKey;
      draft.weapons[weaponIndex][weaponKey] = event.target.value;
      markAdminDirty();
    });
  });

  adminDom.editorPanel.querySelectorAll("[data-remove-weapon]").forEach(button => {
    button.addEventListener("click", () => {
      const weaponIndex = Number(button.dataset.removeWeapon);
      draft.weapons.splice(weaponIndex, 1);
      markAdminDirty();
      renderAdminEditor();
    });
  });

  adminDom.editorPanel.querySelector("#addWeaponBtn").addEventListener("click", () => {
    draft.weapons.push(normalizeAdminWeapon({ name: "", damage: "", rof: "", ammo: "", traits: "" }));
    markAdminDirty();
    renderAdminEditor();
  });

  adminDom.editorPanel.querySelector("#chooseImageBtn").addEventListener("click", () => {
    adminDom.imageFileInput.click();
  });
  adminDom.editorPanel.querySelector("#bindImageDirInlineBtn")?.addEventListener("click", bindAdminImageDirectory);
  adminDom.editorPanel.querySelector("#uploadImageInlineBtn")?.addEventListener("click", uploadAdminPendingImage);

  adminDom.editorPanel.querySelector("#saveModelBtn").addEventListener("click", saveAdminDraftModel);
  adminDom.editorPanel.querySelector("#resetModelBtn").addEventListener("click", resetAdminDraftModel);
}

function bindDraftField(id, setter) {
  const field = adminDom.editorPanel.querySelector(`#${id}`);
  if (!field) return;
  field.addEventListener("input", event => {
    setter(event.target.value);
    markAdminDirty();
  });
}

function markAdminDirty() {
  adminState.dirty = true;
  updateAdminStatus();
}

function getAdminExtraFields(model) {
  const extra = {};
  Object.keys(model).forEach(key => {
    if (!ADMIN_STANDARD_KEYS.has(key)) {
      extra[key] = model[key];
    }
  });
  return extra;
}

function saveAdminDraftModel() {
  if (!adminState.draftModel) return;

  const extraField = adminDom.editorPanel.querySelector("#field-extra-json");
  let extraData = {};
  try {
    const raw = (extraField?.value || "").trim();
    if (raw) {
      extraData = JSON.parse(raw);
      if (Array.isArray(extraData) || typeof extraData !== "object" || extraData === null) {
        throw new Error("Дополнительные поля должны быть JSON-объектом.");
      }
    }
  } catch (error) {
    alert(`Ошибка в блоке дополнительных полей: ${error.message}`);
    return;
  }

  const originalId = adminState.selectedId;
  const draft = deepClone(adminState.draftModel);
  const nextId = String(draft.id || buildAdminBaseId(draft)).trim();
  if (!nextId) {
    alert("У модели должен быть непустой id.");
    return;
  }

  const duplicate = adminState.models.find(model => model.id === nextId && model.id !== originalId);
  if (duplicate) {
    alert(`ID "${nextId}" уже занят другой моделью.`);
    return;
  }

  const merged = normalizeAdminModel({ ...extraData, ...draft });
  merged.id = nextId;

  const index = adminState.models.findIndex(model => model.id === originalId);
  if (index === -1) {
    adminState.models.push(merged);
  } else {
    adminState.models[index] = merged;
  }

  ensureAdminStableIds(adminState.models);
  sortAdminModels(adminState.models);

  adminState.selectedId = merged.id;
  adminState.draftModel = deepClone(adminState.models.find(model => model.id === merged.id));
  adminState.dirty = false;

  renderAdminFactionFilter();
  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
}

function resetAdminDraftModel() {
  const original = adminState.models.find(model => model.id === adminState.selectedId);
  if (!original) return;
  clearAdminPreviewUrl();
  adminState.draftModel = deepClone(original);
  adminState.dirty = false;
  renderAdminEditor();
  updateAdminStatus();
}

function createAdminModel() {
  if (adminState.dirty && !confirmLoseAdminDraft()) return;

  const newModel = normalizeAdminModel({
    id: "",
    name: "New Model",
    realname: "Unknown",
    base: "30mm",
    rep: 0,
    funding: 0,
    print: false,
    rank: ["Henchman"],
    faction: ["Unknown"],
    img: "",
    stats: deepClone(ADMIN_DEFAULT_STATS),
    traits: [],
    weapons: []
  }, adminState.models.length);

  newModel.id = createUniqueAdminId(buildAdminBaseId(newModel));
  adminState.models.push(newModel);
  sortAdminModels(adminState.models);
  adminState.selectedId = newModel.id;
  adminState.draftModel = deepClone(newModel);
  adminState.dirty = true;

  renderAdminFactionFilter();
  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
}

function duplicateAdminModel() {
  const source = adminState.draftModel || adminState.models.find(model => model.id === adminState.selectedId);
  if (!source) return;
  if (adminState.dirty && !confirm("Есть несохранённые правки текущей формы. Создать копию всё равно?")) return;

  const copy = deepClone(source);
  copy.name = `${copy.name} Copy`;
  copy.id = createUniqueAdminId(buildAdminBaseId(copy));

  adminState.models.push(normalizeAdminModel(copy, adminState.models.length));
  sortAdminModels(adminState.models);
  adminState.selectedId = copy.id;
  adminState.draftModel = deepClone(adminState.models.find(model => model.id === copy.id));
  adminState.dirty = true;

  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
}

function deleteAdminModel() {
  const selected = adminState.models.find(model => model.id === adminState.selectedId);
  if (!selected) return;
  if (!confirm(`Удалить модель "${selected.name}"?`)) return;

  const index = adminState.models.findIndex(model => model.id === selected.id);
  adminState.models.splice(index, 1);

  clearAdminPreviewUrl();
  adminState.selectedId = adminState.models[Math.max(0, index - 1)]?.id || adminState.models[0]?.id || null;
  adminState.draftModel = adminState.selectedId
    ? deepClone(adminState.models.find(model => model.id === adminState.selectedId))
    : null;
  adminState.dirty = false;

  renderAdminFactionFilter();
  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
}

function confirmLoseAdminDraft() {
  return !adminState.dirty || confirm("Есть несохранённые правки формы. Продолжить без сохранения?");
}

function createUniqueAdminId(baseId) {
  const used = new Set(adminState.models.map(model => model.id));
  const cleanBase = String(baseId || "model").trim() || "model";
  let candidate = cleanBase;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${cleanBase}-${suffix++}`;
  }
  return candidate;
}

function downloadAdminModelsJson() {
  if (!adminState.models.length) {
    alert("Нет моделей для экспорта.");
    return;
  }

  if (adminState.dirty) {
    const shouldSave = confirm("В текущей форме есть несохранённые изменения. Применить их перед экспортом?");
    if (!shouldSave) return;
    saveAdminDraftModel();
    if (adminState.dirty) return;
  }

  const payload = JSON.stringify(adminState.models, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "models.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearAdminPreviewUrl() {
  if (adminState.previewUrl) {
    URL.revokeObjectURL(adminState.previewUrl);
    adminState.previewUrl = null;
  }
  adminState.pendingImageFile = null;
  updateAdminImageButtons();
}

function getAdminPreviewMarkup(model) {
  const src = adminState.previewUrl || model.img;
  if (!src) {
    return `<div class="image-placeholder">Пока нет изображения.<br>Можно выбрать файл для превью и подстановки пути.</div>`;
  }
  return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(model.name || "Model preview")}">`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function updateAdminStatus() {
  const dirtyText = adminState.dirty
    ? "Есть несохранённые правки в редакторе"
    : "Локальная форма синхронизирована";

  const restoredSuffix = adminState.sessionRestored ? " • восстановлена локальная сессия" : "";

  adminDom.sourceStatus.textContent = `${adminState.sourceLabel} • ${adminState.models.length} моделей${restoredSuffix}`;
  adminDom.dirtyState.textContent = dirtyText;
  adminDom.dirtyState.classList.toggle("is-dirty", adminState.dirty);
}

function selectAdminModel(modelId) {
  if (adminState.selectedId === modelId && adminState.dirty) return;
  if (adminState.dirty && !confirm("Есть несохранённые правки формы. Переключиться без сохранения?")) return;

  const model = adminState.models.find(item => item.id === modelId);
  if (!model) return;

  clearAdminPreviewUrl();
  adminState.selectedId = model.id;
  adminState.draftModel = deepClone(model);
  adminState.dirty = false;

  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
  scheduleAdminSessionSave(true);
}

function markAdminDirty() {
  adminState.dirty = true;
  updateAdminStatus();
  scheduleAdminSessionSave();
}

function saveAdminDraftModel() {
  if (!adminState.draftModel) return;

  const extraField = adminDom.editorPanel.querySelector("#field-extra-json");
  let extraData = {};
  try {
    const raw = (extraField?.value || "").trim();
    if (raw) {
      extraData = JSON.parse(raw);
      if (Array.isArray(extraData) || typeof extraData !== "object" || extraData === null) {
        throw new Error("Дополнительные поля должны быть JSON-объектом.");
      }
    }
  } catch (error) {
    alert(`Ошибка в блоке дополнительных полей: ${error.message}`);
    return;
  }

  const originalId = adminState.selectedId;
  const draft = deepClone(adminState.draftModel);
  const nextId = String(draft.id || buildAdminBaseId(draft)).trim();
  if (!nextId) {
    alert("У модели должен быть непустой id.");
    return;
  }

  const duplicate = adminState.models.find(model => model.id === nextId && model.id !== originalId);
  if (duplicate) {
    alert(`ID "${nextId}" уже занят другой моделью.`);
    return;
  }

  const merged = normalizeAdminModel({ ...extraData, ...draft });
  merged.id = nextId;

  const index = adminState.models.findIndex(model => model.id === originalId);
  if (index === -1) {
    adminState.models.push(merged);
  } else {
    adminState.models[index] = merged;
  }

  ensureAdminStableIds(adminState.models);
  sortAdminModels(adminState.models);

  adminState.selectedId = merged.id;
  adminState.draftModel = deepClone(adminState.models.find(model => model.id === merged.id));
  adminState.dirty = false;
  adminState.sessionRestored = false;

  renderAdminFactionFilter();
  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
  scheduleAdminSessionSave(true);
}

function resetAdminDraftModel() {
  const original = adminState.models.find(model => model.id === adminState.selectedId);
  if (!original) return;

  clearAdminPreviewUrl();
  adminState.draftModel = deepClone(original);
  adminState.dirty = false;
  renderAdminEditor();
  updateAdminStatus();
  scheduleAdminSessionSave(true);
}

function createAdminModel() {
  if (adminState.dirty && !confirmLoseAdminDraft()) return;

  const newModel = normalizeAdminModel({
    id: "",
    name: "New Model",
    realname: "Unknown",
    base: "30mm",
    rep: 0,
    funding: 0,
    print: false,
    rank: ["Henchman"],
    faction: ["Unknown"],
    img: "",
    stats: deepClone(ADMIN_DEFAULT_STATS),
    traits: [],
    weapons: []
  }, adminState.models.length);

  newModel.id = createUniqueAdminId(buildAdminBaseId(newModel));
  adminState.models.push(newModel);
  sortAdminModels(adminState.models);
  adminState.selectedId = newModel.id;
  adminState.draftModel = deepClone(newModel);
  adminState.dirty = true;
  adminState.sessionRestored = false;

  renderAdminFactionFilter();
  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
  scheduleAdminSessionSave(true);
}

function duplicateAdminModel() {
  const source = adminState.draftModel || adminState.models.find(model => model.id === adminState.selectedId);
  if (!source) return;
  if (adminState.dirty && !confirm("Есть несохранённые правки текущей формы. Создать копию всё равно?")) return;

  const copy = deepClone(source);
  copy.name = `${copy.name} Copy`;
  copy.id = createUniqueAdminId(buildAdminBaseId(copy));

  adminState.models.push(normalizeAdminModel(copy, adminState.models.length));
  sortAdminModels(adminState.models);
  adminState.selectedId = copy.id;
  adminState.draftModel = deepClone(adminState.models.find(model => model.id === copy.id));
  adminState.dirty = true;
  adminState.sessionRestored = false;

  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
  scheduleAdminSessionSave(true);
}

function deleteAdminModel() {
  const selected = adminState.models.find(model => model.id === adminState.selectedId);
  if (!selected) return;
  if (!confirm(`Удалить модель "${selected.name}"?`)) return;

  const index = adminState.models.findIndex(model => model.id === selected.id);
  adminState.models.splice(index, 1);

  clearAdminPreviewUrl();
  adminState.selectedId = adminState.models[Math.max(0, index - 1)]?.id || adminState.models[0]?.id || null;
  adminState.draftModel = adminState.selectedId
    ? deepClone(adminState.models.find(model => model.id === adminState.selectedId))
    : null;
  adminState.dirty = false;
  adminState.sessionRestored = false;

  renderAdminFactionFilter();
  renderAdminModelList();
  renderAdminEditor();
  updateAdminStatus();
  scheduleAdminSessionSave(true);
}

function downloadAdminModelsJson() {
  if (!adminState.models.length) {
    alert("Нет моделей для экспорта.");
    return;
  }

  if (adminState.dirty) {
    const shouldSave = confirm("В текущей форме есть несохранённые изменения. Применить их перед экспортом?");
    if (!shouldSave) return;
    saveAdminDraftModel();
    if (adminState.dirty) return;
  }

  const payload = JSON.stringify(adminState.models, null, 2);
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "models.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  scheduleAdminSessionSave(true);
}

function resetAdminLocalSession() {
  if (adminState.dirty && !confirmLoseAdminDraft()) return;

  const shouldReset = confirm("Сбросить локальную сессию и заново загрузить модели из исходника?");
  if (!shouldReset) return;

  clearAdminStoredSession();
  adminState.sessionRestored = false;
  loadInitialAdminModels(true);
}

function updateAdminStatus() {
  const dirtyText = adminState.dirty
    ? "Есть несохранённые правки в редакторе"
    : "Локальная форма синхронизирована";

  const restoredSuffix = adminState.sessionRestored ? " • восстановлена локальная сессия" : "";
  const sourceSuffix = adminState.sourceWriteSupported
    ? (adminState.sourceFileHandle ? ` • источник: ${adminState.sourceFileName || "models.json"}` : " • источник не привязан")
    : " • прямая запись недоступна";

  adminDom.sourceStatus.textContent = `${adminState.sourceLabel} • ${adminState.models.length} моделей${restoredSuffix}${sourceSuffix}`;
  adminDom.dirtyState.textContent = dirtyText;
  adminDom.dirtyState.classList.toggle("is-dirty", adminState.dirty);
  updateAdminSourceButtons();
}

async function restoreAdminDataJsFileHandle() {
  if (!supportsAdminSourceWrite()) {
    updateAdminDataJsButtons();
    return;
  }

  try {
    const handle = await loadAdminSourceHandle(ADMIN_DATA_JS_HANDLE_KEY);
    if (handle) {
      adminState.dataJsFileHandle = handle;
      adminState.dataJsFileName = handle.name || "data.js";
    }
  } catch (error) {
    console.warn("Failed to restore bound data.js file", error);
    adminState.dataJsFileHandle = null;
    adminState.dataJsFileName = "";
  }

  updateAdminDataJsButtons();
}

function updateAdminDataJsButtons() {
  if (!adminDom.bindDataJsBtn || !adminDom.buildDataJsBtn || !adminDom.downloadDataJsBtn) return;

  if (!supportsAdminSourceWrite()) {
    adminDom.bindDataJsBtn.disabled = true;
    adminDom.buildDataJsBtn.disabled = true;
    adminDom.downloadDataJsBtn.disabled = !adminState.models.length;
    adminDom.bindDataJsBtn.textContent = "Прямая запись недоступна";
    adminDom.buildDataJsBtn.textContent = "Скачать data.generated.js";
    return;
  }

  adminDom.bindDataJsBtn.disabled = false;
  adminDom.buildDataJsBtn.disabled = !adminState.models.length;
  adminDom.downloadDataJsBtn.disabled = !adminState.models.length;
  adminDom.bindDataJsBtn.textContent = adminState.dataJsFileHandle
    ? `data.js: ${adminState.dataJsFileName || "data.js"}`
    : "Привязать data.js";
  adminDom.buildDataJsBtn.textContent = adminState.dataJsFileHandle
    ? "Собрать и записать data.js"
    : "Привязать и собрать data.js";
}

async function bindAdminDataJsFile() {
  if (!supportsAdminSourceWrite()) {
    alert("Этот браузер не поддерживает прямую запись в data.js. Используйте скачивание data.generated.js.");
    return;
  }

  try {
    const handles = await window.showOpenFilePicker({
      multiple: false,
      types: [{
        description: "JavaScript files",
        accept: { "text/javascript": [".js"], "application/javascript": [".js"] }
      }]
    });

    const handle = handles?.[0];
    if (!handle) return;

    const hasPermission = await ensureAdminSourcePermission(handle);
    if (!hasPermission) {
      alert("Браузер не дал доступ на запись в выбранный data.js.");
      return;
    }

    adminState.dataJsFileHandle = handle;
    adminState.dataJsFileName = handle.name || "data.js";
    await saveAdminSourceHandle(handle, ADMIN_DATA_JS_HANDLE_KEY);
    updateAdminDataJsButtons();
    updateAdminStatus();
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Failed to bind data.js file", error);
    alert(`Не удалось привязать data.js: ${error.message || error}`);
  }
}

async function getAdminDataJsTemplateText() {
  if (adminState.dataJsFileHandle) {
    const file = await adminState.dataJsFileHandle.getFile();
    return await file.text();
  }

  try {
    const response = await fetch(`./data.js?ts=${Date.now()}`, { cache: "no-store" });
    if (response.ok) {
      return await response.text();
    }
  } catch (error) {
    console.warn("Failed to fetch data.js template", error);
  }

  throw new Error("Не удалось получить шаблон data.js. Привяжите исходный data.js вручную.");
}

async function buildAdminDataJsText() {
  const templateText = await getAdminDataJsTemplateText();
  const startMarker = "const models = [";
  const endMarker = "window.models = models;";

  const startIndex = templateText.indexOf(startMarker);
  if (startIndex < 0) {
    throw new Error("В шаблоне data.js не найдено начало массива models.");
  }

  const endIndex = templateText.indexOf(endMarker, startIndex);
  if (endIndex < 0) {
    throw new Error("В шаблоне data.js не найден конец массива models.");
  }

  const prefix = templateText.slice(0, startIndex);
  const suffix = templateText.slice(endIndex);
  const modelsBlock = `const models = ${JSON.stringify(adminState.models, null, 2)}\n\n`;

  return prefix + modelsBlock + suffix;
}

async function downloadGeneratedAdminDataJs() {
  if (!adminState.models.length) {
    alert("Нет моделей для сборки data.js.");
    return;
  }

  if (adminState.dirty) {
    saveAdminDraftModel();
    if (adminState.dirty) return;
  }

  try {
    const payload = await buildAdminDataJsText();
    const blob = new Blob([payload], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "data.generated.js";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn("Failed to build downloadable data.js", error);
    alert(`Не удалось собрать data.js: ${error.message || error}`);
  }
}

async function buildAndSaveAdminDataJs() {
  if (!adminState.models.length) {
    alert("Нет моделей для сборки data.js.");
    return;
  }

  if (!supportsAdminSourceWrite()) {
    await downloadGeneratedAdminDataJs();
    return;
  }

  if (adminState.dirty) {
    saveAdminDraftModel();
    if (adminState.dirty) return;
  }

  if (!adminState.dataJsFileHandle) {
    await bindAdminDataJsFile();
    if (!adminState.dataJsFileHandle) return;
  }

  try {
    const hasPermission = await ensureAdminSourcePermission(adminState.dataJsFileHandle);
    if (!hasPermission) {
      alert("Нет разрешения на запись в привязанный data.js.");
      return;
    }

    const payload = await buildAdminDataJsText();
    const writable = await adminState.dataJsFileHandle.createWritable();
    await writable.write(payload);
    await writable.close();

    adminState.dataJsFileName = adminState.dataJsFileHandle.name || adminState.dataJsFileName;
    updateAdminDataJsButtons();
    updateAdminStatus();
    alert(`data.js собран и сохранён в ${adminState.dataJsFileName}.`);
  } catch (error) {
    console.warn("Failed to build/save data.js", error);
    alert(`Не удалось собрать или сохранить data.js: ${error.message || error}`);
  }
}

function updateAdminStatus() {
  const dirtyText = adminState.dirty
    ? "Есть несохранённые правки в редакторе"
    : "Локальная форма синхронизирована";

  const restoredSuffix = adminState.sessionRestored ? " • восстановлена локальная сессия" : "";
  const modelsSourceSuffix = adminState.sourceWriteSupported
    ? (adminState.sourceFileHandle ? ` • models: ${adminState.sourceFileName || "models.json"}` : " • models.json не привязан")
    : " • прямая запись недоступна";
  const dataSourceSuffix = adminState.sourceWriteSupported
    ? (adminState.dataJsFileHandle ? ` • data: ${adminState.dataJsFileName || "data.js"}` : " • data.js не привязан")
    : "";

  adminDom.sourceStatus.textContent = `${adminState.sourceLabel} • ${adminState.models.length} моделей${restoredSuffix}${modelsSourceSuffix}${dataSourceSuffix}`;
  adminDom.dirtyState.textContent = dirtyText;
  adminDom.dirtyState.classList.toggle("is-dirty", adminState.dirty);
  updateAdminSourceButtons();
  updateAdminDataJsButtons();
}

function supportsAdminBackupWrite() {
  return typeof window.showDirectoryPicker === "function"
    && typeof window.indexedDB !== "undefined";
}

async function restoreAdminBackupDirHandle() {
  if (!supportsAdminBackupWrite()) {
    updateAdminBackupButtons();
    return;
  }

  try {
    const handle = await loadAdminSourceHandle(ADMIN_BACKUP_DIR_HANDLE_KEY);
    if (handle) {
      adminState.backupDirHandle = handle;
      adminState.backupDirName = handle.name || "backups";
    }
  } catch (error) {
    console.warn("Failed to restore backup directory handle", error);
    adminState.backupDirHandle = null;
    adminState.backupDirName = "";
  }

  updateAdminBackupButtons();
}

function updateAdminBackupButtons() {
  if (!adminDom.bindBackupDirBtn || !adminDom.createBackupBtn || !adminDom.versionHistoryBtn) return;

  if (!supportsAdminBackupWrite()) {
    adminDom.bindBackupDirBtn.disabled = true;
    adminDom.createBackupBtn.disabled = true;
    adminDom.versionHistoryBtn.disabled = true;
    adminDom.bindBackupDirBtn.textContent = "Бэкапы недоступны";
    return;
  }

  adminDom.bindBackupDirBtn.disabled = false;
  adminDom.createBackupBtn.disabled = !adminState.models.length;
  adminDom.versionHistoryBtn.disabled = !adminState.backupDirHandle;
  adminDom.bindBackupDirBtn.textContent = adminState.backupDirHandle
    ? `Бэкапы: ${adminState.backupDirName || "backups"}`
    : "Папка бэкапов";
}

function supportsAdminImageWrite() {
  return typeof window.showDirectoryPicker === "function"
    && typeof window.indexedDB !== "undefined";
}

async function restoreAdminImageDirHandle() {
  if (!supportsAdminImageWrite()) {
    updateAdminImageButtons();
    return;
  }

  try {
    const handle = await loadAdminSourceHandle(ADMIN_IMAGE_DIR_HANDLE_KEY);
    if (handle) {
      adminState.imageDirHandle = handle;
      adminState.imageDirName = handle.name || "img";
    }
  } catch (error) {
    console.warn("Failed to restore image directory handle", error);
    adminState.imageDirHandle = null;
    adminState.imageDirName = "";
  }

  updateAdminImageButtons();
}

function updateAdminImageButtons() {
  const bindButton = adminDom.editorPanel?.querySelector("#bindImageDirInlineBtn");
  const uploadButton = adminDom.editorPanel?.querySelector("#uploadImageInlineBtn");
  if (!bindButton || !uploadButton) return;

  if (!supportsAdminImageWrite()) {
    bindButton.disabled = true;
    uploadButton.disabled = true;
    bindButton.textContent = "Загрузка фото недоступна";
    uploadButton.textContent = "Используйте ручное копирование";
    return;
  }

  bindButton.disabled = false;
  uploadButton.disabled = !adminState.pendingImageFile || !adminState.draftModel;
  bindButton.textContent = adminState.imageDirHandle
    ? `img: ${adminState.imageDirName || "img"}`
    : "Привязать папку img";
  uploadButton.textContent = adminState.pendingImageFile
    ? `Загрузить: ${adminState.pendingImageFile.name}`
    : "Загрузить фото в img";
}

async function bindAdminImageDirectory() {
  if (!supportsAdminImageWrite()) {
    alert("Ваш браузер не поддерживает прямую запись файлов в папку проекта.");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "bmg-admin-image-dir",
      mode: "readwrite"
    });
    const granted = await ensureAdminSourcePermission(handle);
    if (!granted) {
      alert("Без разрешения на запись папку img привязать нельзя.");
      return;
    }

    adminState.imageDirHandle = handle;
    adminState.imageDirName = handle.name || "img";
    await saveAdminSourceHandle(handle, ADMIN_IMAGE_DIR_HANDLE_KEY);
    updateAdminStatus();
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Failed to bind image directory", error);
    alert(`Не удалось привязать папку img: ${error.message || error}`);
  }
}

function extractAdminImageFilename(imagePath) {
  const value = String(imagePath || "").trim();
  if (!value) return "";
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || "";
}

function buildAdminImageTargetName() {
  const draftPathName = extractAdminImageFilename(adminState.draftModel?.img || "");
  if (draftPathName) return draftPathName;
  return adminState.pendingImageFile?.name || "";
}

async function uploadAdminPendingImage() {
  if (!adminState.draftModel) {
    alert("Сначала выберите модель.");
    return;
  }

  if (!adminState.pendingImageFile) {
    alert("Сначала выберите файл изображения.");
    return;
  }

  if (!supportsAdminImageWrite()) {
    alert("Ваш браузер не поддерживает прямую запись файлов в папку проекта.");
    return;
  }

  if (!adminState.imageDirHandle) {
    await bindAdminImageDirectory();
    if (!adminState.imageDirHandle) return;
  }

  try {
    const granted = await ensureAdminSourcePermission(adminState.imageDirHandle);
    if (!granted) {
      alert("Нет разрешения на запись в папку img.");
      return;
    }

    const targetName = buildAdminImageTargetName();
    if (!targetName) {
      alert("Не удалось определить имя файла для сохранения.");
      return;
    }

    let fileExists = false;
    try {
      await adminState.imageDirHandle.getFileHandle(targetName);
      fileExists = true;
    } catch (error) {
      fileExists = false;
    }

    if (fileExists && !confirm(`Файл ${targetName} уже существует. Перезаписать его?`)) {
      return;
    }

    const targetHandle = await adminState.imageDirHandle.getFileHandle(targetName, { create: true });
    const writable = await targetHandle.createWritable();
    await writable.write(await adminState.pendingImageFile.arrayBuffer());
    await writable.close();

    adminState.draftModel.img = `img/${targetName}`;
    clearAdminPreviewUrl();
    renderAdminEditor();
    markAdminDirty();
    updateAdminStatus();
    alert(`Фотография сохранена в img/${targetName}`);
  } catch (error) {
    console.warn("Failed to upload image into img directory", error);
    alert(`Не удалось загрузить фото: ${error.message || error}`);
  }
}

function closeAdminBackupHistory() {
  if (adminDom.backupHistoryModal) {
    adminDom.backupHistoryModal.hidden = true;
  }
}

function buildAdminModelsJsonText() {
  return JSON.stringify(adminState.models, null, 2);
}

async function hashAdminText(text) {
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  }

  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function formatAdminBackupTimestamp(isoString) {
  try {
    return new Date(isoString).toLocaleString("ru-RU");
  } catch (error) {
    return isoString;
  }
}

function buildAdminBackupFilename(createdAt, hash) {
  const date = new Date(createdAt);
  const safe = Number.isNaN(date.getTime())
    ? "unknown-date"
    : [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-")
      + "_"
      + [
        String(date.getHours()).padStart(2, "0"),
        String(date.getMinutes()).padStart(2, "0"),
        String(date.getSeconds()).padStart(2, "0")
      ].join("");

  return `models-${safe}-${hash.slice(0, 8)}.json`;
}

async function readAdminHandleText(handle) {
  const file = await handle.getFile();
  return await file.text();
}

async function writeAdminHandleText(handle, text) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

async function loadAdminBackupManifest() {
  if (!adminState.backupDirHandle) {
    return { version: 1, entries: [] };
  }

  try {
    const handle = await adminState.backupDirHandle.getFileHandle(ADMIN_BACKUP_MANIFEST_NAME);
    const text = await readAdminHandleText(handle);
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.entries)) {
      return { version: 1, entries: [] };
    }
    return {
      version: parsed.version || 1,
      entries: parsed.entries
    };
  } catch (error) {
    return { version: 1, entries: [] };
  }
}

async function saveAdminBackupManifest(manifest) {
  if (!adminState.backupDirHandle) return;
  const handle = await adminState.backupDirHandle.getFileHandle(ADMIN_BACKUP_MANIFEST_NAME, { create: true });
  await writeAdminHandleText(handle, JSON.stringify(manifest, null, 2));
}

async function pruneAdminBackupManifest(manifest) {
  if (!adminState.backupDirHandle) return manifest;

  if (manifest.entries.length <= ADMIN_MAX_BACKUPS) {
    return manifest;
  }

  const trimmedEntries = manifest.entries.slice(0, ADMIN_MAX_BACKUPS);
  const removedEntries = manifest.entries.slice(ADMIN_MAX_BACKUPS);

  for (const entry of removedEntries) {
    try {
      await adminState.backupDirHandle.removeEntry(entry.filename);
    } catch (error) {
      console.warn("Failed to remove old backup entry", entry.filename, error);
    }
  }

  return {
    ...manifest,
    entries: trimmedEntries
  };
}

async function bindAdminBackupDirectory() {
  if (!supportsAdminBackupWrite()) {
    alert("Этот браузер не поддерживает выбор папки бэкапов.");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker();
    const hasPermission = await ensureAdminSourcePermission(handle);
    if (!hasPermission) {
      alert("Браузер не дал доступ к папке бэкапов.");
      return;
    }

    adminState.backupDirHandle = handle;
    adminState.backupDirName = handle.name || "backups";
    await saveAdminSourceHandle(handle, ADMIN_BACKUP_DIR_HANDLE_KEY);
    updateAdminBackupButtons();
    updateAdminStatus();
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.warn("Failed to bind backup directory", error);
    alert(`Не удалось привязать папку бэкапов: ${error.message || error}`);
  }
}

async function ensureAdminBackupDirectory(promptIfMissing = true) {
  if (adminState.backupDirHandle) {
    const hasPermission = await ensureAdminSourcePermission(adminState.backupDirHandle);
    if (hasPermission) return true;
  }

  if (!promptIfMissing) return false;

  await bindAdminBackupDirectory();
  if (!adminState.backupDirHandle) return false;
  return ensureAdminSourcePermission(adminState.backupDirHandle);
}

async function createAdminBackupSnapshot(reason = "manual") {
  if (!adminState.models.length) {
    alert("Нет моделей для создания бэкапа.");
    return null;
  }

  if (adminState.dirty) {
    saveAdminDraftModel();
    if (adminState.dirty) return null;
  }

  const canWrite = await ensureAdminBackupDirectory(reason === "manual");
  if (!canWrite) {
    if (reason === "manual") {
      alert("Папка бэкапов не привязана.");
    }
    return null;
  }

  const text = buildAdminModelsJsonText();
  const hash = await hashAdminText(text);
  let manifest = await loadAdminBackupManifest();

  if (manifest.entries.some(entry => entry.hash === hash)) {
    if (reason === "manual") {
      alert("Такой бэкап уже существует: содержимое не изменилось.");
    }
    return { skipped: true, hash };
  }

  const createdAt = new Date().toISOString();
  const filename = buildAdminBackupFilename(createdAt, hash);
  const handle = await adminState.backupDirHandle.getFileHandle(filename, { create: true });
  await writeAdminHandleText(handle, text);

  manifest.entries.unshift({
    filename,
    createdAt,
    hash,
    modelCount: adminState.models.length,
    reason,
    source: adminState.sourceFileName || "models.json"
  });

  manifest = await pruneAdminBackupManifest(manifest);
  await saveAdminBackupManifest(manifest);
  updateAdminBackupButtons();
  updateAdminStatus();

  if (reason === "manual") {
    alert(`Бэкап создан: ${filename}`);
  }

  return manifest.entries[0];
}

async function openAdminBackupHistory() {
  if (!adminState.backupDirHandle) {
    const canUse = await ensureAdminBackupDirectory(true);
    if (!canUse) return;
  }

  const manifest = await loadAdminBackupManifest();
  adminDom.backupHistoryModal.hidden = false;

  if (!manifest.entries.length) {
    adminDom.backupHistoryList.innerHTML = `<div class="backup-empty">Пока нет сохранённых версий. Создайте первый бэкап вручную или сохраните models.json.</div>`;
    return;
  }

  adminDom.backupHistoryList.innerHTML = manifest.entries.map(entry => `
    <div class="backup-entry">
      <div>
        <strong>${escapeHtml(entry.filename)}</strong>
        <div class="meta">
          ${escapeHtml(formatAdminBackupTimestamp(entry.createdAt))}<br>
          ${escapeHtml(String(entry.modelCount || 0))} моделей • ${escapeHtml(entry.reason || "save")}
        </div>
      </div>
      <div class="meta mono">${escapeHtml(entry.hash)}</div>
      <div class="backup-actions">
        <button class="admin-btn admin-btn-ghost admin-btn-small" type="button" data-backup-action="load" data-backup-file="${escapeAttribute(entry.filename)}">Загрузить</button>
        <button class="admin-btn admin-btn-ghost admin-btn-small" type="button" data-backup-action="restore" data-backup-file="${escapeAttribute(entry.filename)}">Восстановить в источник</button>
      </div>
    </div>
  `).join("");

  adminDom.backupHistoryList.querySelectorAll("[data-backup-action]").forEach(button => {
    button.addEventListener("click", async () => {
      const filename = button.dataset.backupFile;
      const action = button.dataset.backupAction;
      if (action === "load") {
        await loadAdminBackupIntoEditor(filename);
      } else if (action === "restore") {
        await restoreAdminBackupToSource(filename);
      }
    });
  });
}

async function loadAdminBackupIntoEditor(filename) {
  if (adminState.dirty && !confirmLoseAdminDraft()) return;
  if (!adminState.backupDirHandle) return;

  try {
    const handle = await adminState.backupDirHandle.getFileHandle(filename);
    const text = await readAdminHandleText(handle);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("Файл бэкапа не содержит массив моделей.");
    }

    closeAdminBackupHistory();
    loadAdminModels(parsed, `Источник: backup ${filename}`);
  } catch (error) {
    console.warn("Failed to load backup into editor", error);
    alert(`Не удалось загрузить бэкап: ${error.message || error}`);
  }
}

async function restoreAdminBackupToSource(filename) {
  if (!adminState.backupDirHandle) return;

  const shouldRestore = confirm(`Восстановить ${filename} в привязанный models.json?`);
  if (!shouldRestore) return;

  if (!adminState.sourceFileHandle) {
    await bindAdminSourceFile();
    if (!adminState.sourceFileHandle) return;
  }

  try {
    await createAdminBackupSnapshot("pre-restore");

    const backupHandle = await adminState.backupDirHandle.getFileHandle(filename);
    const text = await readAdminHandleText(backupHandle);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("Файл бэкапа не содержит массив моделей.");
    }

    const hasPermission = await ensureAdminSourcePermission(adminState.sourceFileHandle);
    if (!hasPermission) {
      alert("Нет разрешения на запись в привязанный models.json.");
      return;
    }

    await writeAdminHandleText(adminState.sourceFileHandle, text);
    closeAdminBackupHistory();
    loadAdminModels(parsed, `Источник: backup ${filename}`);
    alert(`Бэкап ${filename} восстановлен в models.json.`);
  } catch (error) {
    console.warn("Failed to restore backup to source", error);
    alert(`Не удалось восстановить бэкап: ${error.message || error}`);
  }
}

async function saveAdminModelsToSourceFile() {
  if (!adminState.models.length) {
    alert("Нет моделей для сохранения.");
    return;
  }

  if (!supportsAdminSourceWrite()) {
    alert("Этот браузер не поддерживает прямую запись в файл. Используйте кнопку скачивания models.json.");
    return;
  }

  if (adminState.dirty) {
    saveAdminDraftModel();
    if (adminState.dirty) return;
  }

  if (!adminState.sourceFileHandle) {
    await bindAdminSourceFile();
    if (!adminState.sourceFileHandle) return;
  }

  try {
    const hasPermission = await ensureAdminSourcePermission(adminState.sourceFileHandle);
    if (!hasPermission) {
      alert("Нет разрешения на запись в привязанный файл.");
      return;
    }

    const payload = buildAdminModelsJsonText();
    await writeAdminHandleText(adminState.sourceFileHandle, payload);

    adminState.sourceFileName = adminState.sourceFileHandle.name || adminState.sourceFileName;
    adminState.sessionRestored = false;
    await createAdminBackupSnapshot("save-models");
    scheduleAdminSessionSave(true);
    updateAdminSourceButtons();
    updateAdminStatus();
    alert(`Изменения сохранены в ${adminState.sourceFileName}.`);
  } catch (error) {
    console.warn("Failed to save models to source file", error);
    alert(`Не удалось сохранить models.json: ${error.message || error}`);
  }
}

function updateAdminStatus() {
  const dirtyText = adminState.dirty
    ? "Есть несохранённые правки в редакторе"
    : "Локальная форма синхронизирована";

  const restoredSuffix = adminState.sessionRestored ? " • восстановлена локальная сессия" : "";
  const modelsSourceSuffix = adminState.sourceWriteSupported
    ? (adminState.sourceFileHandle ? ` • models: ${adminState.sourceFileName || "models.json"}` : " • models.json не привязан")
    : " • прямая запись недоступна";
  const dataSourceSuffix = adminState.sourceWriteSupported
    ? (adminState.dataJsFileHandle ? ` • data: ${adminState.dataJsFileName || "data.js"}` : " • data.js не привязан")
    : "";
  const backupSuffix = supportsAdminBackupWrite()
    ? (adminState.backupDirHandle ? ` • backups: ${adminState.backupDirName || "backups"}` : " • backups не привязаны")
    : "";

  adminDom.sourceStatus.textContent = `${adminState.sourceLabel} • ${adminState.models.length} моделей${restoredSuffix}${modelsSourceSuffix}${dataSourceSuffix}${backupSuffix}`;
  adminDom.dirtyState.textContent = dirtyText;
  adminDom.dirtyState.classList.toggle("is-dirty", adminState.dirty);
  updateAdminSourceButtons();
  updateAdminDataJsButtons();
  updateAdminBackupButtons();
  updateAdminImageButtons();
}
