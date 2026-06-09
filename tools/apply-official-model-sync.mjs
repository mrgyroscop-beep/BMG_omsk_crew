import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_JS = path.join(ROOT, "data.js");
const PRINTABLE_JS = path.join(ROOT, "printable-models.js");
const OFFICIAL_JS = path.join(ROOT, "official-data.js");

const START = "// BEGIN OFFICIAL_MODEL_SYNC";
const END = "// END OFFICIAL_MODEL_SYNC";

const RANK_NAMES = {
  1: "Leader",
  2: "Sidekick",
  3: "Free Agent",
  5: "Henchman"
};

const DAMAGE_ICONS = {
  1: "\u{1FA78}",
  2: "\u2605"
};

function stripGeneratedBlock(source) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);
  if (startIndex < 0 || endIndex < startIndex) return source;
  return `${source.slice(0, startIndex)}${source.slice(endIndex + END.length)}`;
}

function loadContext(source) {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: DATA_JS });

  if (fs.existsSync(PRINTABLE_JS)) {
    vm.runInContext(fs.readFileSync(PRINTABLE_JS, "utf8"), ctx, { filename: PRINTABLE_JS });
  }

  vm.runInContext(fs.readFileSync(OFFICIAL_JS, "utf8"), ctx, { filename: OFFICIAL_JS });
  return ctx.window;
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[вЂ™`]/g, "'")
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

function sortedUnique(values) {
  return [...new Set(values.filter(Boolean).map(value => String(value)))]
    .sort((a, b) => a.localeCompare(b));
}

function uniqueInOrder(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    if (!value) continue;
    const key = normalizeName(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(String(value));
  }
  return result;
}

function normSet(values) {
  const list = Array.isArray(values) ? values : [values];
  return new Set(list.map(normalizeName).filter(Boolean));
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

function officialCharacterRivals(character, indexes) {
  return sortedUnique((character.rival_affiliation_ids || []).map(id => {
    const affiliation = indexes.affiliationsById.get(id);
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
  return uniqueInOrder((character.traits || []).map(item => officialTraitName(item, indexes)));
}

function officialWeaponTraitName(traitRef, indexes) {
  if (traitRef.alternate_name) return traitRef.alternate_name;
  return indexes.traitsById.get(traitRef.trait_id)?.name || `Trait ${traitRef.trait_id}`;
}

function officialWeaponDamageText(weapon) {
  const parts = [];
  for (const damage of weapon.damage || []) {
    const icon = DAMAGE_ICONS[damage.damage_type_id] || `Damage ${damage.damage_type_id}`;
    const count = Number(damage.count || 0);
    if (!count) continue;
    parts.push(icon.length <= 2 ? icon.repeat(count) : `${count} ${icon}`);
  }
  return parts.join("") || "-";
}

function officialCharacterWeapons(character, indexes) {
  return (character.weapon_ids || [])
    .map(id => indexes.weaponsById.get(id))
    .filter(Boolean)
    .map(weapon => ({
      name: weapon.name,
      damage: officialWeaponDamageText(weapon),
      rof: weapon.rate_of_fire ?? "-",
      ammo: weapon.ammunition ?? "-",
      traits: uniqueInOrder((weapon.traits || []).map(item => officialWeaponTraitName(item, indexes))).join(" / ")
    }));
}

function slugifyModelIdPart(value) {
  const slug = String(value || "model")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "model";
}

function computeStableModelIds(modelList) {
  const usedIds = new Set();
  return modelList.map((model, index) => {
    const baseId = model.id
      ? String(model.id)
      : [
          slugifyModelIdPart(model.name),
          slugifyModelIdPart(model.realname),
          slugifyModelIdPart(model.base)
        ].join("-");

    let candidate = baseId || `model-${index + 1}`;
    let suffix = 2;
    while (usedIds.has(candidate)) {
      candidate = `${baseId}-${suffix++}`;
    }

    usedIds.add(candidate);
    return candidate;
  });
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
  if (model?.officialId !== undefined && model.officialId !== null && model.officialId !== "") {
    const character = indexes.charactersById.get(Number(model.officialId));
    if (character) return [{ character, score: 10000 }];
  }

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

function createOfficialModelPayload(character, indexes, options = {}) {
  const payload = {
    officialId: character.id,
    officialName: character.name || "",
    officialAlias: character.alias || "",
    realname: character.name || "Unknown",
    base: character.bases_size || "30mm",
    rep: Number(character.reputation || 0),
    funding: Number(character.funding || 0),
    rank: officialCharacterRanks(character),
    faction: officialCharacterFactions(character, indexes),
    rivals: officialCharacterRivals(character, indexes),
    stats: {
      Attack: Number(character.attack || 0),
      Defense: Number(character.defense || 0),
      Strength: character.strength ? `${character.strength}+` : "",
      Movement: Number(character.movement || 0),
      Willpower: Number(character.willpower || 0),
      Endurance: Number(character.endurance || 0),
      Special: Number(character.special || 0)
    },
    traits: officialCharacterTraits(character, indexes),
    weapons: officialCharacterWeapons(character, indexes),
    officialImage: character.image || "",
    officialBackground: character.background || "",
    eternal: Boolean(character.eternal),
    officialUpgradeIds: Array.isArray(character.upgrade_ids) ? [...character.upgrade_ids] : []
  };

  if (options.includeName) {
    payload.id = `km-${character.id}`;
    payload.name = character.alias || character.name || `Official Model ${character.id}`;
    payload.img = "img/no.png";
    payload.officialOnly = true;
  }

  return payload;
}

function chooseOfficialMatches(localModels, indexes) {
  const proposals = [];
  localModels.forEach((model, index) => {
    const candidates = officialCandidatesForLocalModel(model, indexes);
    if (!candidates.length) return;
    proposals.push({ index, model, ...candidates[0] });
  });

  const usedOfficialIds = new Set();
  const usedLocalIndexes = new Set();
  const matches = [];
  proposals
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .forEach(proposal => {
      if (usedLocalIndexes.has(proposal.index) || usedOfficialIds.has(proposal.character.id)) return;
      usedLocalIndexes.add(proposal.index);
      usedOfficialIds.add(proposal.character.id);
      matches.push(proposal);
    });

  return matches.sort((a, b) => a.index - b.index);
}

function buildBlock(updates, extensions) {
  return `${START}
// Generated by tools/apply-official-model-sync.mjs from the offline Knight Models snapshot.
const officialModelSyncUpdates = ${JSON.stringify(updates, null, 2)};
const officialModelExtensions = ${JSON.stringify(extensions, null, 2)};

function findOfficialModelSyncTarget(update) {
  const byIndex = models[update.index];
  if (byIndex && byIndex.name === update.matchName && (byIndex.realname || "") === update.matchRealname) {
    return byIndex;
  }

  return models.find(model => Number(model.officialId) === Number(update.officialId))
    || models.find(model =>
      model.name === update.matchName
      && (model.realname || "") === update.matchRealname
      && (model.base || "") === update.matchBase
    )
    || null;
}

for (const update of officialModelSyncUpdates) {
  const target = findOfficialModelSyncTarget(update);
  if (target) Object.assign(target, update.patch);
}

for (const officialModel of officialModelExtensions) {
  if (!models.some(model => Number(model.officialId) === Number(officialModel.officialId))) {
    models.push(officialModel);
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

  const anchor = "window.models = models;";
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error("Could not find insertion point before window.models = models.");
  }

  return `${source.slice(0, anchorIndex)}${block}\n\n${source.slice(anchorIndex)}`;
}

const source = fs.readFileSync(DATA_JS, "utf8");
const baseSource = stripGeneratedBlock(source);
const windowData = loadContext(baseSource);
const localModels = windowData.models || [];
const sections = windowData.KM_OFFICIAL_DATA?.sections || {};
const indexes = buildOfficialIndexes(sections);
const officialCharacters = sections.characters || [];
const stableModelIds = computeStableModelIds(localModels);

const matches = chooseOfficialMatches(localModels, indexes);
const matchedOfficialIds = new Set(matches.map(match => match.character.id));

const updates = matches.map(match => {
  const patch = createOfficialModelPayload(match.character, indexes);
  patch.id = stableModelIds[match.index];

  return {
    index: match.index,
    matchName: match.model.name || "",
    matchRealname: match.model.realname || "",
    matchBase: match.model.base || "",
    officialId: match.character.id,
    score: match.score,
    patch
  };
});

const extensions = officialCharacters
  .filter(character => !matchedOfficialIds.has(character.id))
  .map(character => createOfficialModelPayload(character, indexes, { includeName: true }));

const block = buildBlock(updates, extensions);
fs.writeFileSync(DATA_JS, insertOrReplaceBlock(source, block), "utf8");

console.log(`updated ${DATA_JS}`);
console.log(JSON.stringify({
  localModels: localModels.length,
  officialCharacters: officialCharacters.length,
  updates: updates.length,
  extensions: extensions.length
}, null, 2));
