import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_JS = path.join(ROOT, "data.js");
const OFFICIAL_JS = path.join(ROOT, "official-data.js");
const OUT_DIR = path.join(ROOT, "reports", "external", "official");
const OUT_REPORT = path.join(OUT_DIR, "compare-official-data.json");

const RANK_NAMES = {
  1: "Leader",
  2: "Sidekick",
  3: "Free Agent",
  5: "Henchman"
};

const CARD_NAME_ALIASES = new Map([
  ["kataykuchi", "katakiuchi"],
  ["diversion tactic", "divertion tactic"],
  ["you re expendable", "you re expendable"],
  ["your e expendable", "you re expendable"],
  ["suppressing fire", "supressing fire"],
  ["reclaim the lazarus pit", "lazarus pit"],
  ["profitable negotiation", "profitable negotation"],
  ["it s ok to be afraid", "it s ok to be afreid"],
  ["bwl special rules", "tbwl special rules"],
  ["batman who laughs special rules", "tbwl special rules"],
  ["the fear", "the fear pile"],
  ["objective cards keywords", "scarecrow cards keywords"],
  ["business counters", "business counters 1"],
  ["business counters continued", "business counters 2"]
]);

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalCardKey(value) {
  const key = normalizeName(value);
  return CARD_NAME_ALIASES.get(key) || key;
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

function loadLocalData() {
  const ctx = { window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(DATA_JS, "utf8"), ctx, { filename: DATA_JS });
  vm.runInContext(fs.readFileSync(OFFICIAL_JS, "utf8"), ctx, { filename: OFFICIAL_JS });
  return {
    builderCards: ctx.window.BMG_BUILDER_CARDS || [],
    mandatoryCards: ctx.window.BMG_BUILDER_MANDATORY_CARDS || [],
    models: ctx.window.models || [],
    official: ctx.window.KM_OFFICIAL_DATA || {}
  };
}

function asArray(value) {
  if (Array.isArray(value)) return value.flatMap(asArray);
  if (value === undefined || value === null || value === "") return [];
  return String(value)
    .replace(/ *& */gi, ",")
    .replace(/ *\/ */g, ",")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function uniqueInOrder(values) {
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

function normSet(values) {
  return new Set(asArray(values).map(normalizeName).filter(Boolean));
}

function sameSet(left, right) {
  const a = normSet(left);
  const b = normSet(right);
  if (a.size !== b.size) return false;
  return [...a].every(item => b.has(item));
}

function localCardVp(card) {
  if (card.vp !== undefined && card.vp !== null && card.vp !== "") return Number(card.vp);
  const match = String(card.value || "").match(/(-?\d+)\s*VP/i);
  return match ? Number(match[1]) : null;
}

function localCardCount(card) {
  if (card.count !== undefined && card.count !== null && card.count !== "") return Number(card.count);
  if (card.maxPerDeck !== undefined && card.maxPerDeck !== null && card.maxPerDeck !== "") return Number(card.maxPerDeck);
  return null;
}

function localCardFactions(card) {
  return asArray(card.faction || card.affiliation || card.crewIcon);
}

function localCardRequiredModels(card) {
  return asArray(card.requiredModels || card.requiredModel || card.requiredModelName || card.modelName || card.modelAlias || card.subtitle);
}

function localCardRequiredRanks(card) {
  return asArray(card.requiredRanks || card.requiredRank || card.rank || card.rankIcon);
}

function localCardRequiredTraits(card) {
  return asArray(card.requiredTraits || card.requiredTrait || card.traitRequirement || card.traitsRequired);
}

function localCardPreventingTraits(card) {
  return asArray(card.preventingTraits || card.preventingTrait || card.blockedTraits || card.preventedByTraits);
}

function buildOfficialIndexes(sections) {
  return {
    affiliationsById: new Map((sections.affiliations || []).map(item => [Number(item.id), item])),
    traitsById: new Map((sections.traits || []).map(item => [Number(item.id), item])),
    charactersById: new Map((sections.characters || []).map(item => [Number(item.id), item]))
  };
}

function officialCardFactions(card, indexes) {
  if (!card.affiliation_id) return [];
  const affiliation = indexes.affiliationsById.get(Number(card.affiliation_id));
  return affiliation ? [officialFactionDisplayName(affiliation.name)] : [`Affiliation ${card.affiliation_id}`];
}

function officialCardRanks(card) {
  return uniqueInOrder((card.rank_ids || []).map(id => RANK_NAMES[Number(id)] || `Rank ${id}`));
}

function displayCharacter(character) {
  return String(character?.alias || character?.name || "").trim();
}

function officialCardRequiredModels(card, indexes) {
  return uniqueInOrder((card.required_character_ids || [])
    .map(id => indexes.charactersById.get(Number(id)))
    .filter(Boolean)
    .map(displayCharacter));
}

function officialCardRequiredTraits(card, indexes) {
  const trait = indexes.traitsById.get(Number(card.trait_id));
  return trait ? [trait.name] : [];
}

function officialCardPreventingTraits(card, indexes) {
  const trait = indexes.traitsById.get(Number(card.preventing_trait_id));
  return trait ? [trait.name] : [];
}

function buildOfficialNameGroups(officialCards) {
  const groups = new Map();
  for (const card of officialCards) {
    const key = canonicalCardKey(card.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return groups;
}

function matchCollection(localCards, officialCards) {
  const officialById = new Map(officialCards.map(card => [Number(card.id), card]));
  const officialByName = buildOfficialNameGroups(officialCards);
  const usedOfficialIds = new Set();
  const matches = [];
  const missingOfficial = [];
  const ambiguous = [];

  localCards.forEach((localCard, index) => {
    const officialId = Number(localCard.officialId);
    if (Number.isFinite(officialId) && officialById.has(officialId)) {
      const officialCard = officialById.get(officialId);
      usedOfficialIds.add(officialCard.id);
      matches.push({ index, localCard, officialCard });
      return;
    }

    const key = canonicalCardKey(localCard.name || localCard.title);
    const candidates = officialByName.get(key) || [];
    if (candidates.length === 1 && !usedOfficialIds.has(candidates[0].id)) {
      usedOfficialIds.add(candidates[0].id);
      matches.push({ index, localCard, officialCard: candidates[0] });
      return;
    }

    if (candidates.length > 1) {
      ambiguous.push({
        key,
        local: { id: localCard.id || null, name: localCard.name || localCard.title || "" },
        official: candidates.map(card => ({ id: card.id, name: card.name, count: card.count, vp: card.vp }))
      });
      return;
    }

    missingOfficial.push({
      id: localCard.id || null,
      officialId: localCard.officialId ?? null,
      name: localCard.name || localCard.title || "",
      officialName: localCard.officialName || null,
      faction: localCard.faction || null,
      vp: localCard.vp ?? null
    });
  });

  const missingLocal = officialCards
    .filter(card => !usedOfficialIds.has(card.id))
    .map(card => ({ id: card.id, name: card.name, count: card.count, vp: card.vp, affiliation_id: card.affiliation_id }));

  return { matches, missingLocal, missingOfficial, ambiguous };
}

function cardDifferences(matches, indexes, { support = false } = {}) {
  const differences = [];
  for (const { localCard, officialCard } of matches) {
    const diffs = {};

    const localVp = localCardVp(localCard);
    if (!support && localVp !== Number(officialCard.vp || 0)) {
      diffs.vp = { local: localVp, official: Number(officialCard.vp || 0) };
    }

    const localCount = localCardCount(localCard);
    const officialCount = support ? 0 : Math.max(1, Number(officialCard.count || 1));
    if (!support && localCount !== officialCount) {
      diffs.count = { local: localCount, official: officialCount };
    }

    const officialFactions = officialCardFactions(officialCard, indexes);
    if (!sameSet(localCardFactions(localCard), officialFactions)) {
      diffs.faction = { local: localCardFactions(localCard), official: officialFactions };
    }

    const officialModels = officialCardRequiredModels(officialCard, indexes);
    if (!sameSet(localCardRequiredModels(localCard), officialModels)) {
      diffs.requiredModels = { local: localCardRequiredModels(localCard), official: officialModels };
    }

    const officialRanks = officialCardRanks(officialCard);
    if (!sameSet(localCardRequiredRanks(localCard), officialRanks)) {
      diffs.requiredRanks = { local: localCardRequiredRanks(localCard), official: officialRanks };
    }

    const officialTraits = officialCardRequiredTraits(officialCard, indexes);
    if (!sameSet(localCardRequiredTraits(localCard), officialTraits)) {
      diffs.requiredTraits = { local: localCardRequiredTraits(localCard), official: officialTraits };
    }

    const officialPreventingTraits = officialCardPreventingTraits(officialCard, indexes);
    if (!sameSet(localCardPreventingTraits(localCard), officialPreventingTraits)) {
      diffs.preventingTraits = { local: localCardPreventingTraits(localCard), official: officialPreventingTraits };
    }

    if (support && localCard.countsForDeck !== false) {
      diffs.countsForDeck = { local: localCard.countsForDeck, official: false };
    }

    if (Object.keys(diffs).length) {
      differences.push({
        name: localCard.name || localCard.title || officialCard.name,
        localId: localCard.id || null,
        officialId: officialCard.id,
        differences: diffs
      });
    }
  }
  return differences;
}

const { builderCards, mandatoryCards, models, official } = loadLocalData();
const officialSections = official.sections || {};
const officialCards = Array.isArray(officialSections.cards) ? officialSections.cards : [];
const officialBuilderCards = officialCards.filter(card => Number(card.count || 0) > 0);
const officialMandatoryCards = officialCards.filter(card => Number(card.count || 0) <= 0);
const officialAffiliations = Array.isArray(officialSections.affiliations) ? officialSections.affiliations : [];
const indexes = buildOfficialIndexes(officialSections);

const activeBuilderCards = builderCards.filter(card => !card.disabledLocalOnlyCard);
const disabledBuilderCards = builderCards.filter(card => card.disabledLocalOnlyCard);
const activeMandatoryCards = mandatoryCards.filter(card => !card.disabledLocalOnlyCard);
const disabledMandatoryCards = mandatoryCards.filter(card => card.disabledLocalOnlyCard);

const builderComparison = matchCollection(activeBuilderCards, officialBuilderCards);
const mandatoryComparison = matchCollection(activeMandatoryCards, officialMandatoryCards);
const builderDifferences = cardDifferences(builderComparison.matches, indexes);
const mandatoryDifferences = cardDifferences(mandatoryComparison.matches, indexes, { support: true });

const localFactionNames = new Set();
for (const model of models.filter(model => !model.disabledLocalOnlyModel)) {
  const factions = Array.isArray(model.faction) ? model.faction : String(model.faction || "").split(/\s*[\/,]\s*/);
  factions.filter(Boolean).forEach(faction => localFactionNames.add(faction));
}

const localFactionKeys = new Set([...localFactionNames].map(normalizeName));
const officialFactionKeys = new Set(officialAffiliations.map(item => normalizeName(officialFactionDisplayName(item.name))).filter(Boolean));
const affiliationMissingLocal = officialAffiliations
  .filter(item => !localFactionKeys.has(normalizeName(officialFactionDisplayName(item.name))))
  .map(item => ({ id: item.id, name: item.name, localAlias: officialFactionDisplayName(item.name), is_team: item.is_team, eternal: item.eternal }));
const affiliationMissingOfficial = [...localFactionNames]
  .filter(name => !officialFactionKeys.has(normalizeName(name)))
  .sort();

const report = {
  generatedAt: new Date().toISOString(),
  officialMeta: official.meta || {},
  counts: {
    localBuilderCards: builderCards.length,
    activeBuilderCards: activeBuilderCards.length,
    builderCardsDisabledLocalOnly: disabledBuilderCards.length,
    localMandatoryCards: mandatoryCards.length,
    activeMandatoryCards: activeMandatoryCards.length,
    mandatoryCardsDisabledLocalOnly: disabledMandatoryCards.length,
    officialBuilderCards: officialBuilderCards.length,
    officialMandatoryCards: officialMandatoryCards.length,
    officialCards: officialCards.length,
    localModels: models.length,
    officialAffiliations: officialAffiliations.length,
    localAffiliations: localFactionNames.size
  },
  cards: {
    builder: {
      missingLocal: builderComparison.missingLocal,
      missingOfficial: builderComparison.missingOfficial,
      differences: builderDifferences,
      ambiguous: builderComparison.ambiguous,
      disabledLocalOnly: disabledBuilderCards.map(card => ({ id: card.id || null, name: card.name || card.title || "" }))
    },
    mandatory: {
      missingLocal: mandatoryComparison.missingLocal,
      missingOfficial: mandatoryComparison.missingOfficial,
      differences: mandatoryDifferences,
      ambiguous: mandatoryComparison.ambiguous,
      disabledLocalOnly: disabledMandatoryCards.map(card => ({ id: card.id || null, name: card.name || card.title || "" }))
    }
  },
  affiliations: {
    missingLocal: affiliationMissingLocal,
    missingOfficial: affiliationMissingOfficial
  }
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_REPORT, JSON.stringify(report, null, 2), "utf8");
console.log(`wrote ${OUT_REPORT}`);
console.log(JSON.stringify({
  counts: report.counts,
  builderMissingLocal: builderComparison.missingLocal.length,
  builderMissingOfficial: builderComparison.missingOfficial.length,
  builderDifferences: builderDifferences.length,
  builderAmbiguous: builderComparison.ambiguous.length,
  mandatoryMissingLocal: mandatoryComparison.missingLocal.length,
  mandatoryMissingOfficial: mandatoryComparison.missingOfficial.length,
  mandatoryDifferences: mandatoryDifferences.length,
  mandatoryAmbiguous: mandatoryComparison.ambiguous.length,
  affiliationMissingLocal: affiliationMissingLocal.length,
  affiliationMissingOfficial: affiliationMissingOfficial.length
}, null, 2));
