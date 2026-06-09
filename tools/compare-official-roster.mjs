import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_JS = path.join(ROOT, "data.js");
const PRINTABLE_JS = path.join(ROOT, "printable-models.js");
const OFFICIAL_JS = path.join(ROOT, "official-data.js");
const OUT_DIR = path.join(ROOT, "reports", "external", "official");
const OUT_REPORT = path.join(OUT_DIR, "compare-official-roster.json");

const RANK_NAMES = {
  1: "Leader",
  2: "Sidekick",
  3: "Free Agent",
  5: "Henchman"
};

const DAMAGE_NAMES = {
  1: "Blood",
  2: "Stun"
};

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanRealName(value) {
  return String(value || "")
    .replace(/\s*\/\s*\d+\s*mm\s*$/i, "")
    .replace(/\s*\(\s*\d+\s*mm\s*\)\s*$/i, "")
    .trim();
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

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value)))]
    .sort((a, b) => a.localeCompare(b));
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function normSet(values) {
  return new Set(asArray(values).map(normalizeName).filter(Boolean));
}

function setDiff(left, right) {
  return [...left].filter(item => !right.has(item)).sort();
}

function valuesEqualSet(leftValues, rightValues) {
  const left = normSet(leftValues);
  const right = normSet(rightValues);
  return setDiff(left, right).length === 0 && setDiff(right, left).length === 0;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const match = String(value).match(/-?\d+/);
  return match ? Number(match[0]) : null;
}

function normalizeStrength(value) {
  const number = parseNumber(value);
  return number === null ? null : `${number}+`;
}

function normalizeStatValue(statName, value) {
  if (statName === "Strength") return normalizeStrength(value);
  const number = parseNumber(value);
  return number === null ? null : number;
}

function localStat(model, statName) {
  return normalizeStatValue(statName, model.stats?.[statName]);
}

function officialStat(character, statName) {
  const fields = {
    Attack: "attack",
    Defense: "defense",
    Strength: "strength",
    Movement: "movement",
    Willpower: "willpower",
    Endurance: "endurance",
    Special: "special"
  };
  return normalizeStatValue(statName, character[fields[statName]]);
}

function loadData() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);

  const dataSource = `${fs.readFileSync(DATA_JS, "utf8")}
window.__equipmentByFaction = typeof equipmentByFaction === "undefined" ? {} : equipmentByFaction;
window.__disabledLocalOnlyEquipmentByFaction = typeof disabledLocalOnlyEquipmentByFaction === "undefined" ? {} : disabledLocalOnlyEquipmentByFaction;
window.__factionCrewRules = typeof factionCrewRules === "undefined" ? {} : factionCrewRules;
`;
  vm.runInContext(dataSource, ctx, { filename: DATA_JS });

  if (fs.existsSync(PRINTABLE_JS)) {
    vm.runInContext(fs.readFileSync(PRINTABLE_JS, "utf8"), ctx, { filename: PRINTABLE_JS });
  }

  vm.runInContext(fs.readFileSync(OFFICIAL_JS, "utf8"), ctx, { filename: OFFICIAL_JS });
  return ctx.window;
}

function buildOfficialIndexes(sections) {
  const affiliationsById = new Map((sections.affiliations || []).map(item => [item.id, item]));
  const traitsById = new Map((sections.traits || []).map(item => [item.id, item]));
  const weaponsById = new Map((sections.weapons || []).map(item => [item.id, item]));
  const charactersById = new Map((sections.characters || []).map(item => [item.id, item]));

  const charactersByKey = new Map();
  for (const character of sections.characters || []) {
    const keys = [
      character.alias,
      character.name,
      `${character.alias || ""} ${character.name || ""}`,
      `${character.name || ""} ${character.alias || ""}`
    ].map(normalizeName).filter(Boolean);

    for (const key of keys) {
      if (!charactersByKey.has(key)) charactersByKey.set(key, []);
      charactersByKey.get(key).push(character);
    }
  }

  return { affiliationsById, traitsById, weaponsById, charactersById, charactersByKey };
}

function officialCharacterFactions(character, indexes) {
  return sortedUnique((character.affiliations || []).map(item => {
    const affiliation = indexes.affiliationsById.get(item.affiliation_id);
    return officialFactionDisplayName(affiliation?.name || "");
  }));
}

function officialCharacterRanks(character) {
  return sortedUnique((character.rank_ids || []).map(id => RANK_NAMES[id] || `Rank ${id}`));
}

function officialTraitName(traitRef, indexes) {
  if (traitRef.alternate_name) return traitRef.alternate_name;
  return indexes.traitsById.get(traitRef.trait_id)?.name || `Trait ${traitRef.trait_id}`;
}

function officialCharacterTraits(character, indexes) {
  return sortedUnique((character.traits || []).map(item => officialTraitName(item, indexes)));
}

function officialWeaponTraitName(traitRef, indexes) {
  if (traitRef.alternate_name) return traitRef.alternate_name;
  return indexes.traitsById.get(traitRef.trait_id)?.name || `Trait ${traitRef.trait_id}`;
}

function officialWeaponSummary(weapon, indexes) {
  const damage = (weapon.damage || [])
    .map(item => `${item.count} ${DAMAGE_NAMES[item.damage_type_id] || `Damage ${item.damage_type_id}`}`)
    .join(", ");
  return {
    id: weapon.id,
    name: weapon.name,
    rof: weapon.rate_of_fire,
    ammo: weapon.ammunition,
    damage,
    traits: sortedUnique((weapon.traits || []).map(item => officialWeaponTraitName(item, indexes)))
  };
}

function officialCharacterWeapons(character, indexes) {
  return (character.weapon_ids || [])
    .map(id => indexes.weaponsById.get(id))
    .filter(Boolean)
    .map(weapon => officialWeaponSummary(weapon, indexes));
}

function localRealNameKey(model) {
  const real = cleanRealName(model.realname);
  if (!real || normalizeName(real) === "unknown") return "";
  return normalizeName(real);
}

function scoreCandidate(model, character, indexes) {
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

  const localRanks = normSet(model.rank || []);
  const officialRanks = normSet(officialCharacterRanks(character));
  if ([...localRanks].some(item => officialRanks.has(item))) score += 8;

  const localFactions = normSet(model.faction || []);
  const officialFactions = normSet(officialCharacterFactions(character, indexes));
  if ([...localFactions].some(item => officialFactions.has(item))) score += 8;

  return score;
}

function officialCandidatesForLocalModel(model, indexes) {
  const keys = [
    normalizeName(model.name),
    normalizeName(`${model.name || ""} ${cleanRealName(model.realname)}`)
  ].filter(Boolean);

  const seen = new Set();
  const candidates = [];
  for (const key of keys) {
    for (const character of indexes.charactersByKey.get(key) || []) {
      if (seen.has(character.id)) continue;
      seen.add(character.id);
      candidates.push(character);
    }
  }

  const localNameKey = normalizeName(model.name);
  const localRealKey = localRealNameKey(model);
  if (localNameKey.length >= 6 && localRealKey) {
    for (const character of indexes.charactersById.values()) {
      if (seen.has(character.id)) continue;
      const aliasKey = normalizeName(character.alias);
      if (!aliasKey) continue;
      const localNameTokens = new Set(localNameKey.split(" "));
      const extraAliasTokens = aliasKey
        .split(" ")
        .filter(token => token && !localNameTokens.has(token));
      if (
        aliasKey.includes(localNameKey)
        && extraAliasTokens.length
        && extraAliasTokens.every(token => localRealKey.split(" ").includes(token))
      ) {
        seen.add(character.id);
        candidates.push(character);
      }
    }
  }

  return candidates
    .map(character => ({ character, score: scoreCandidate(model, character, indexes) }))
    .filter(item => item.score >= 70)
    .sort((a, b) => b.score - a.score || a.character.id - b.character.id);
}

function chooseOfficialMatch(model, indexes) {
  if (model?.officialId !== undefined && model.officialId !== null && model.officialId !== "") {
    const character = indexes.charactersById.get(Number(model.officialId));
    if (character) {
      return {
        status: "matched",
        match: { character, score: 10000 },
        candidates: [{ character, score: 10000 }]
      };
    }
  }

  const candidates = officialCandidatesForLocalModel(model, indexes);
  if (!candidates.length) return { status: "unmatched", candidates: [] };
  const topScore = candidates[0].score;
  const top = candidates.filter(item => item.score === topScore);
  if (top.length > 1) return { status: "ambiguous", candidates: candidates.slice(0, 8) };
  return { status: "matched", match: candidates[0], candidates: candidates.slice(0, 8) };
}

function compareModel(model, character, indexes) {
  const differences = {};

  if (Number(model.rep) !== Number(character.reputation)) {
    differences.rep = { local: Number(model.rep), official: Number(character.reputation) };
  }
  if (Number(model.funding || 0) !== Number(character.funding || 0)) {
    differences.funding = { local: Number(model.funding || 0), official: Number(character.funding || 0) };
  }
  if (String(model.base || "").trim().toLowerCase() !== String(character.bases_size || "").trim().toLowerCase()) {
    differences.base = { local: model.base || "", official: character.bases_size || "" };
  }

  for (const statName of ["Attack", "Defense", "Strength", "Movement", "Willpower", "Endurance"]) {
    const localValue = localStat(model, statName);
    const officialValue = officialStat(character, statName);
    if (localValue !== null && officialValue !== null && localValue !== officialValue) {
      if (!differences.stats) differences.stats = {};
      differences.stats[statName] = { local: localValue, official: officialValue };
    }
  }

  const localRanks = sortedUnique(model.rank || []);
  const officialRanks = officialCharacterRanks(character);
  if (!valuesEqualSet(localRanks, officialRanks)) {
    differences.ranks = { local: localRanks, official: officialRanks };
  }

  const localFactions = sortedUnique(model.faction || []);
  const officialFactions = officialCharacterFactions(character, indexes);
  if (!valuesEqualSet(localFactions, officialFactions)) {
    differences.factions = { local: localFactions, official: officialFactions };
  }

  const localTraits = sortedUnique(model.traits || []);
  const officialTraits = officialCharacterTraits(character, indexes);
  const localTraitSet = normSet(localTraits);
  const officialTraitSet = normSet(officialTraits);
  const missingLocalTraits = setDiff(officialTraitSet, localTraitSet);
  const missingOfficialTraits = setDiff(localTraitSet, officialTraitSet);
  if (missingLocalTraits.length || missingOfficialTraits.length) {
    differences.traits = {
      missingLocal: officialTraits.filter(item => missingLocalTraits.includes(normalizeName(item))),
      missingOfficial: localTraits.filter(item => missingOfficialTraits.includes(normalizeName(item)))
    };
  }

  const localWeaponNames = sortedUnique((model.weapons || []).map(item => item.name));
  const officialWeapons = officialCharacterWeapons(character, indexes);
  const officialWeaponNames = sortedUnique(officialWeapons.map(item => item.name));
  if (!valuesEqualSet(localWeaponNames, officialWeaponNames)) {
    differences.weapons = {
      local: model.weapons || [],
      official: officialWeapons
    };
  }

  return differences;
}

function equipmentFactionName(affiliationId, indexes) {
  const affiliation = indexes.affiliationsById.get(affiliationId);
  return officialFactionDisplayName(affiliation?.name || `Affiliation ${affiliationId}`);
}

function equipmentDisabledKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isDisabledLocalOnlyEquipment(item, disabledLocalOnlyEquipmentByFaction) {
  const disabledNames = disabledLocalOnlyEquipmentByFaction?.[item.faction];
  if (!Array.isArray(disabledNames) || !disabledNames.length) return false;

  const itemKey = equipmentDisabledKey(item.name);
  return disabledNames.some(name => equipmentDisabledKey(name) === itemKey);
}

function localEquipmentEntries(equipmentByFaction, disabledLocalOnlyEquipmentByFaction) {
  const entries = [];
  for (const [faction, items] of Object.entries(equipmentByFaction || {})) {
    for (const item of items || []) {
      const entry = { faction, ...item };
      if (isDisabledLocalOnlyEquipment(entry, disabledLocalOnlyEquipmentByFaction)) {
        entry.disabledLocalOnly = true;
      }
      entries.push(entry);
    }
  }
  return entries;
}

function officialEquipmentEntries(officialEquipment, indexes) {
  const entries = [];
  for (const item of officialEquipment || []) {
    const factions = item.required_affiliation_ids?.length
      ? item.required_affiliation_ids.map(id => equipmentFactionName(id, indexes))
      : ["Any"];
    for (const faction of factions) {
      entries.push({ faction, ...item });
    }
  }
  return entries;
}

function compareEquipment(localEntries, officialEntries) {
  const differences = [];
  const equipmentOfficialMatchKey = (faction, id) => `${normalizeName(faction)}||${Number(id)}`;
  const localByOfficialKey = new Map();
  for (const item of localEntries) {
    if (item.officialId !== undefined && item.officialId !== null) {
      localByOfficialKey.set(equipmentOfficialMatchKey(item.faction, item.officialId), item);
    }
  }

  const matchedOfficialKeys = new Set();
  const matchedLocalItems = new Set();
  const compareEquipmentCosts = (local, official) => {
    const diffs = {};
    if (Number(local.maxPerCrew ?? 1) !== Number(official.max_count ?? 1)) {
      diffs.maxPerCrew = { local: Number(local.maxPerCrew ?? 1), official: Number(official.max_count ?? 1) };
    }
    if (Number(local.fundingCost || 0) !== Number(official.funding || 0)) {
      diffs.fundingCost = { local: Number(local.fundingCost || 0), official: Number(official.funding || 0) };
    }
    if (Number(local.repCost || 0) !== Number(official.reputation || 0)) {
      diffs.repCost = { local: Number(local.repCost || 0), official: Number(official.reputation || 0) };
    }
    if (Object.keys(diffs).length) {
      differences.push({
        faction: local.faction,
        name: local.name,
        officialId: official.id,
        differences: diffs
      });
    }
  };

  for (const official of officialEntries) {
    const officialKey = equipmentOfficialMatchKey(official.faction, official.id);
    const local = localByOfficialKey.get(officialKey);
    if (!local) continue;
    matchedOfficialKeys.add(officialKey);
    matchedLocalItems.add(local);
    compareEquipmentCosts(local, official);
  }

  const localByKey = new Map();
  const officialByKey = new Map();

  for (const item of localEntries) {
    if (matchedLocalItems.has(item)) continue;
    const key = `${normalizeName(item.faction)}||${normalizeName(item.name)}`;
    if (!localByKey.has(key)) localByKey.set(key, []);
    localByKey.get(key).push(item);
  }

  for (const item of officialEntries) {
    if (matchedOfficialKeys.has(equipmentOfficialMatchKey(item.faction, item.id))) continue;
    const key = `${normalizeName(item.faction)}||${normalizeName(item.name)}`;
    if (!officialByKey.has(key)) officialByKey.set(key, []);
    officialByKey.get(key).push(item);
  }

  const missingLocal = [];
  const missingOfficial = [];
  const disabledLocalOnly = [];
  const ambiguous = [];

  for (const [key, officialItems] of officialByKey.entries()) {
    const localItems = localByKey.get(key) || [];
    if (!localItems.length) {
      missingLocal.push(...officialItems.map(item => ({
        id: item.id,
        faction: item.faction,
        name: item.name,
        maxPerCrew: item.max_count,
        fundingCost: item.funding,
        repCost: item.reputation,
        conditions: {
          required_character_ids: item.required_character_ids || [],
          required_crew_character_ids: item.required_crew_character_ids || [],
          required_rank_ids: item.required_rank_ids || [],
          banned_character_ids: item.banned_character_ids || []
        }
      })));
      continue;
    }

    if (localItems.length > 1 || officialItems.length > 1) {
      ambiguous.push({
        key,
        local: localItems.map(item => ({ faction: item.faction, name: item.name, maxPerCrew: item.maxPerCrew, fundingCost: item.fundingCost, repCost: item.repCost })),
        official: officialItems.map(item => ({ id: item.id, faction: item.faction, name: item.name, maxPerCrew: item.max_count, fundingCost: item.funding, repCost: item.reputation }))
      });
      continue;
    }

    const local = localItems[0];
    const official = officialItems[0];
    compareEquipmentCosts(local, official);
  }

  for (const [key, localItems] of localByKey.entries()) {
    if (!officialByKey.has(key)) {
      const localOnlyItems = localItems.filter(item => !item.disabledLocalOnly);
      const disabledItems = localItems.filter(item => item.disabledLocalOnly);
      missingOfficial.push(...localOnlyItems.map(item => ({
        faction: item.faction,
        name: item.name,
        maxPerCrew: item.maxPerCrew,
        fundingCost: item.fundingCost,
        repCost: item.repCost,
        conditions: item.conditions || []
      })));
      disabledLocalOnly.push(...disabledItems.map(item => ({
        faction: item.faction,
        name: item.name,
        maxPerCrew: item.maxPerCrew,
        fundingCost: item.fundingCost,
        repCost: item.repCost,
        conditions: item.conditions || []
      })));
    }
  }

  return { missingLocal, missingOfficial, disabledLocalOnly, differences, ambiguous };
}

const windowData = loadData();
const official = windowData.KM_OFFICIAL_DATA || {};
const sections = official.sections || {};
const indexes = buildOfficialIndexes(sections);

const localModels = windowData.models || [];
const matched = [];
const unmatchedLocal = [];
const disabledLocalOnlyModels = [];
const ambiguousLocal = [];
const modelDifferences = [];
const matchedOfficialIds = new Set();

for (const model of localModels) {
  if (model.disabledLocalOnlyModel) {
    disabledLocalOnlyModels.push({
      localName: model.name,
      localRealName: cleanRealName(model.realname),
      base: model.base || "",
      rep: model.rep,
      funding: model.funding || 0,
      rank: model.rank || [],
      faction: model.faction || []
    });
    continue;
  }

  const result = chooseOfficialMatch(model, indexes);
  if (result.status === "matched") {
    const character = result.match.character;
    matchedOfficialIds.add(character.id);
    const differences = compareModel(model, character, indexes);
    matched.push({
      localName: model.name,
      officialId: character.id,
      officialName: character.name,
      officialAlias: character.alias,
      score: result.match.score
    });
    if (Object.keys(differences).length) {
      modelDifferences.push({
        localName: model.name,
        localRealName: cleanRealName(model.realname),
        officialId: character.id,
        officialName: character.name,
        officialAlias: character.alias,
        score: result.match.score,
        differences
      });
    }
    continue;
  }

  const payload = {
    localName: model.name,
    localRealName: cleanRealName(model.realname),
    rep: model.rep,
    funding: model.funding || 0,
    rank: model.rank || [],
    faction: model.faction || [],
    candidates: result.candidates.map(item => ({
      id: item.character.id,
      name: item.character.name,
      alias: item.character.alias,
      rep: item.character.reputation,
      funding: item.character.funding,
      score: item.score
    }))
  };

  if (result.status === "ambiguous") ambiguousLocal.push(payload);
  else unmatchedLocal.push(payload);
}

const officialMissingLocal = (sections.characters || [])
  .filter(character => !matchedOfficialIds.has(character.id))
  .map(character => ({
    id: character.id,
    name: character.name,
    alias: character.alias,
    rep: character.reputation,
    funding: character.funding,
    rank: officialCharacterRanks(character),
    faction: officialCharacterFactions(character, indexes)
  }));

const localEquipment = localEquipmentEntries(
  windowData.__equipmentByFaction || {},
  windowData.__disabledLocalOnlyEquipmentByFaction || {}
);
const officialEquipment = officialEquipmentEntries(sections.equipment || [], indexes);
const equipment = compareEquipment(localEquipment, officialEquipment);

const report = {
  generatedAt: new Date().toISOString(),
  officialMeta: official.meta || {},
  counts: {
    localModels: localModels.length,
    activeLocalModels: localModels.filter(model => !model.disabledLocalOnlyModel).length,
    modelsDisabledLocalOnly: disabledLocalOnlyModels.length,
    officialCharacters: (sections.characters || []).length,
    matchedModels: matched.length,
    unmatchedLocalModels: unmatchedLocal.length,
    ambiguousLocalModels: ambiguousLocal.length,
    officialCharactersMissingLocal: officialMissingLocal.length,
    modelDifferences: modelDifferences.length,
    localEquipment: localEquipment.length,
    officialEquipment: officialEquipment.length,
    activeLocalEquipment: localEquipment.filter(item => !item.disabledLocalOnly).length,
    equipmentDisabledLocalOnly: equipment.disabledLocalOnly.length,
    equipmentMissingLocal: equipment.missingLocal.length,
    equipmentMissingOfficial: equipment.missingOfficial.length,
    equipmentDifferences: equipment.differences.length,
    equipmentAmbiguous: equipment.ambiguous.length
  },
  characters: {
    matched,
    differences: modelDifferences,
    unmatchedLocal,
    disabledLocalOnly: disabledLocalOnlyModels,
    ambiguousLocal,
    missingLocal: officialMissingLocal
  },
  equipment
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), "utf8");

console.log(`wrote ${OUT_REPORT}`);
console.log(JSON.stringify(report.counts, null, 2));
