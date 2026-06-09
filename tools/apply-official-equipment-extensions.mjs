import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_JS = path.join(ROOT, "data.js");
const OFFICIAL_JS = path.join(ROOT, "official-data.js");
const REPORT_PATH = path.join(ROOT, "reports", "external", "official", "compare-official-roster.json");

const START = "// BEGIN OFFICIAL_EQUIPMENT_EXTENSIONS";
const END = "// END OFFICIAL_EQUIPMENT_EXTENSIONS";

const RANK_NAMES = {
  1: "Leader",
  2: "Sidekick",
  3: "Free Agent",
  5: "Henchman"
};

function stripGeneratedBlock(source) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);
  if (startIndex >= 0 && endIndex >= startIndex) {
    return `${source.slice(0, startIndex)}${source.slice(endIndex + END.length)}`;
  }
  return source;
}

function loadContext(source = fs.readFileSync(DATA_JS, "utf8")) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(`${source}\nwindow.__equipmentByFaction = equipmentByFaction;`, ctx, { filename: DATA_JS });
  vm.runInContext(fs.readFileSync(OFFICIAL_JS, "utf8"), ctx, { filename: OFFICIAL_JS });
  return ctx.window;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = String(value || "").trim();
    const key = normalizeName(text);
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

function officialFactionDisplayName(name) {
  const aliases = {
    "Law Forces": "GCPD",
    "Vigilantes": "Bat Family",
    "League of Assassins": "League of Shadows",
    "Riddler": "The Riddler",
    "Soldiers of Fortune": "Bane",
    "The Batman Who Laughs": "Batman Who Laughs",
    "The Court of Owls": "Court of Owls",
    "Royal Flush Gang": "Royal Flush"
  };
  return aliases[name] || name;
}

function displayCharacter(character) {
  return String(character?.alias || character?.name || "").trim();
}

function stripVersion(value) {
  return String(value || "").replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function characterLabels(ids, charactersById, { preferSharedName = false } = {}) {
  const characters = unique(ids).map(id => charactersById.get(Number(id))).filter(Boolean);
  if (!characters.length) return [];

  const sharedNames = unique(characters.map(character => character.name).filter(name => normalizeName(name) !== "unknown"));
  if (preferSharedName && sharedNames.length === 1) return sharedNames;

  const baseAliases = unique(characters.map(character => stripVersion(displayCharacter(character))));
  if (baseAliases.length === 1) return baseAliases;

  return unique(characters.map(displayCharacter));
}

function anyOfCondition(prefix, labels, suffix = "") {
  const parts = unique(labels).map(label => `${prefix}${label}${suffix}`);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return `Any of: ${parts.join(" | ")}`;
}

function suffixForDuplicate(item, localItem) {
  const targets = Array.isArray(localItem.targetModels) ? localItem.targetModels : [];
  const namedTarget = targets.find(target => !Object.values(RANK_NAMES).includes(target));
  if (namedTarget) return namedTarget;

  const anyOfCondition = (localItem.conditions || []).find(condition => String(condition).startsWith("Any of:"));
  if (anyOfCondition) {
    const labels = anyOfCondition
      .replace(/^Any of:\s*/i, "")
      .split(/\s*\|\s*/)
      .map(option => option.replace(/^Name:\s*/i, "").replace(/^Alias:\s*/i, "").replace(/\s+in crew$/i, "").trim())
      .filter(Boolean);
    if (labels[0]) return labels[0];
  }

  const nameCondition = (localItem.conditions || []).find(condition => /^Name:\s*/i.test(condition));
  if (nameCondition) return nameCondition.replace(/^Name:\s*/i, "").trim();

  const crewCondition = (localItem.conditions || []).find(condition => /^Alias:\s*/i.test(condition));
  if (crewCondition) return crewCondition.replace(/^Alias:\s*/i, "").replace(/\s+in crew$/i, "").trim();

  if (item.funding) return `$${item.funding}`;
  return `Official ${item.id}`;
}

function makeUniqueEquipmentName(item, localItem, usedNames) {
  if (!usedNames.has(normalizeName(localItem.name))) {
    usedNames.add(normalizeName(localItem.name));
    return localItem.name;
  }

  const suffix = suffixForDuplicate(item, localItem);
  let candidate = `${localItem.name} - ${suffix}`;
  let index = 2;
  while (usedNames.has(normalizeName(candidate))) {
    candidate = `${localItem.name} - ${suffix} ${index}`;
    index += 1;
  }
  usedNames.add(normalizeName(candidate));
  return candidate;
}

function officialEquipmentToLocal(item, faction, sections) {
  const charactersById = new Map((sections.characters || []).map(character => [character.id, character]));
  const equipmentById = new Map((sections.equipment || []).map(equipment => [equipment.id, equipment]));

  const rankTargets = unique((item.required_rank_ids || []).map(rankId => RANK_NAMES[rankId] || ""));
  const buyerLabels = characterLabels(item.required_character_ids || [], charactersById, { preferSharedName: true });
  const crewLabels = characterLabels(item.required_crew_character_ids || [], charactersById, { preferSharedName: true });
  const bannedLabels = characterLabels(item.banned_character_ids || [], charactersById, { preferSharedName: false });

  const conditions = [];
  const buyerCondition = anyOfCondition("Name: ", buyerLabels);
  if (buyerCondition) conditions.push(buyerCondition);
  const crewCondition = anyOfCondition("Alias: ", crewLabels, " in crew");
  if (crewCondition) conditions.push(crewCondition);
  for (const label of bannedLabels) {
    conditions.push(`Restricted: Name: ${label}`);
  }

  const conflictsWith = unique((item.banned_crew_equipment_ids || [])
    .map(id => equipmentById.get(Number(id))?.name)
    .filter(Boolean));

  const local = {
    name: item.name,
    officialId: item.id,
    fundingCost: Number(item.funding || 0),
    repCost: Number(item.reputation || 0),
    maxPerCrew: Number(item.max_count || 1),
    conditions,
    effects: [String(item.description || "Official Knight Models equipment.").trim()]
  };

  const targetModels = unique([...rankTargets, ...buyerLabels]);
  if (targetModels.length) local.targetModels = targetModels;
  if (conflictsWith.length) local.conflictsWith = conflictsWith;
  if (faction === "Any") local.globalEquipment = true;

  return local;
}

function officialEquipmentEntries(sections) {
  const affiliationsById = new Map((sections.affiliations || []).map(item => [item.id, item]));
  const entries = [];
  for (const item of sections.equipment || []) {
    const factions = item.required_affiliation_ids?.length
      ? item.required_affiliation_ids.map(id => officialFactionDisplayName(affiliationsById.get(id)?.name || `Affiliation ${id}`))
      : ["Any"];
    for (const faction of factions) {
      entries.push({ faction, item });
    }
  }
  return entries;
}

function buildBlock(extensions) {
  return `${START}
// Generated by tools/apply-official-equipment-extensions.mjs from the offline Knight Models snapshot.
const officialEquipmentByFactionExtensions = ${JSON.stringify(extensions, null, 2)};

for (const [faction, officialEquipmentItems] of Object.entries(officialEquipmentByFactionExtensions)) {
  if (!equipmentByFaction[faction]) equipmentByFaction[faction] = [];
  for (const officialEquipmentItem of officialEquipmentItems) {
    if (!equipmentByFaction[faction].some(item => item.name === officialEquipmentItem.name)) {
      equipmentByFaction[faction].push(officialEquipmentItem);
    }
  }
}
${END}`;
}

function insertOrReplaceBlock(source, block) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);
  if (startIndex >= 0 && endIndex >= startIndex) {
    return `${source.slice(0, startIndex)}${block}${source.slice(endIndex + END.length)}`;
  }

  const anchor = "const models = [";
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error("Could not find insertion point before const models.");
  }
  return `${source.slice(0, anchorIndex)}${block}\n\n${source.slice(anchorIndex)}`;
}

if (!fs.existsSync(REPORT_PATH)) {
  throw new Error(`Missing ${REPORT_PATH}. Run tools/compare-official-roster.mjs first.`);
}

const source = fs.readFileSync(DATA_JS, "utf8");
const baseSource = stripGeneratedBlock(source);
const windowData = loadContext(baseSource);
const sections = windowData.KM_OFFICIAL_DATA?.sections || {};
JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));

const baseEquipmentByFaction = windowData.__equipmentByFaction || {};
const baseCountsByKey = new Map();
const usedNamesByFaction = new Map();
for (const [faction, items] of Object.entries(baseEquipmentByFaction)) {
  if (!usedNamesByFaction.has(faction)) usedNamesByFaction.set(faction, new Set());
  for (const item of items || []) {
    const key = `${normalizeName(faction)}||${normalizeName(item.name)}`;
    baseCountsByKey.set(key, (baseCountsByKey.get(key) || 0) + 1);
    usedNamesByFaction.get(faction).add(normalizeName(item.name));
  }
}

const officialGroups = new Map();
for (const entry of officialEquipmentEntries(sections)) {
  const key = `${normalizeName(entry.faction)}||${normalizeName(entry.item.name)}`;
  if (!officialGroups.has(key)) officialGroups.set(key, []);
  officialGroups.get(key).push(entry);
}

const extensions = {};
for (const [key, officialEntries] of officialGroups.entries()) {
  const baseCount = baseCountsByKey.get(key) || 0;
  const missingEntries = officialEntries.slice(baseCount);
  for (const { faction, item } of missingEntries) {
    const localItem = officialEquipmentToLocal(item, faction, sections);
    if (!usedNamesByFaction.has(faction)) usedNamesByFaction.set(faction, new Set());
    localItem.name = makeUniqueEquipmentName(item, localItem, usedNamesByFaction.get(faction));
    if (!extensions[faction]) extensions[faction] = [];
    extensions[faction].push(localItem);
  }
}

const sortedExtensions = Object.fromEntries(Object.entries(extensions)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([faction, items]) => [faction, items.sort((a, b) => a.name.localeCompare(b.name))]));

const nextSource = insertOrReplaceBlock(source, buildBlock(sortedExtensions));
fs.writeFileSync(DATA_JS, nextSource, "utf8");

console.log(`updated ${DATA_JS}`);
console.log(JSON.stringify({
  factions: Object.keys(sortedExtensions).length,
  equipment: Object.values(sortedExtensions).reduce((sum, items) => sum + items.length, 0)
}, null, 2));
