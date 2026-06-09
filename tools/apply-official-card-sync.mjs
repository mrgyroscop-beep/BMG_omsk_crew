import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_JS = path.join(ROOT, "data.js");
const OFFICIAL_JS = path.join(ROOT, "official-data.js");

const START = "// BEGIN OFFICIAL_CARD_SYNC";
const END = "// END OFFICIAL_CARD_SYNC";

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
  vm.runInContext(fs.readFileSync(OFFICIAL_JS, "utf8"), ctx, { filename: OFFICIAL_JS });
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

function canonicalCardKey(value) {
  const key = normalizeName(value);
  return CARD_NAME_ALIASES.get(key) || key;
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

function normSet(values) {
  return new Set(asArray(values).map(normalizeName).filter(Boolean));
}

function overlaps(a, b) {
  const left = normSet(a);
  const right = normSet(b);
  return [...left].some(item => right.has(item));
}

function localCategory(card) {
  return String(card.category || card.deckType || "").toLowerCase();
}

function scoreCandidate(localCard, officialCard, indexes, kind) {
  const officialFactions = officialCardFactions(officialCard, indexes);
  const officialModels = officialCardRequiredModels(officialCard, indexes);
  const officialRanks = officialCardRanks(officialCard);
  const officialTraits = officialCardRequiredTraits(officialCard, indexes);

  const localFactions = localCardFactions(localCard);
  const localModels = localCardRequiredModels(localCard);
  const localRanks = localCardRequiredRanks(localCard);
  const localTraits = localCardRequiredTraits(localCard);

  let score = 100;
  if (localCardVp(localCard) === Number(officialCard.vp || 0)) score += 18;
  if (localCardCount(localCard) === Number(officialCard.count || 0)) score += 18;

  if (localFactions.length || officialFactions.length) {
    score += overlaps(localFactions, officialFactions) ? 45 : -20;
  }

  if (localModels.length || officialModels.length) {
    score += overlaps(localModels, officialModels) ? 70 : -25;
  }

  if (localRanks.length || officialRanks.length) {
    score += overlaps(localRanks, officialRanks) ? 26 : -8;
  }

  if (localTraits.length || officialTraits.length) {
    score += overlaps(localTraits, officialTraits) ? 30 : -8;
  }

  const category = localCategory(localCard);
  if (category === "character" && (officialModels.length || officialRanks.length || officialTraits.length)) score += 12;
  if ((category === "crew" || category === "faction") && officialFactions.length) score += 12;
  if (kind === "support" && (localCard.mandatory || localCard.countsForDeck === false || localCard.type === "Special Rules")) score += 20;

  return score;
}

function groupOfficialCardsByName(officialCards) {
  const groups = new Map();
  for (const card of officialCards) {
    const key = canonicalCardKey(card.name);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  return groups;
}

function chooseMatches(localCards, officialCards, indexes, kind) {
  const officialById = new Map(officialCards.map(card => [Number(card.id), card]));
  const officialByName = groupOfficialCardsByName(officialCards);
  const proposals = [];

  localCards.forEach((localCard, index) => {
    if (localCard.officialId !== undefined && localCard.officialId !== null && localCard.officialId !== "") {
      const officialCard = officialById.get(Number(localCard.officialId));
      if (officialCard) proposals.push({ index, localCard, officialCard, score: 10000 });
      return;
    }

    const candidates = officialByName.get(canonicalCardKey(localCard.name || localCard.title)) || [];
    for (const officialCard of candidates) {
      proposals.push({
        index,
        localCard,
        officialCard,
        score: scoreCandidate(localCard, officialCard, indexes, kind)
      });
    }
  });

  const usedLocalIndexes = new Set();
  const usedOfficialIds = new Set();
  const matches = [];
  proposals
    .filter(item => item.score >= 70)
    .sort((a, b) => b.score - a.score || a.index - b.index || a.officialCard.id - b.officialCard.id)
    .forEach(proposal => {
      if (usedLocalIndexes.has(proposal.index) || usedOfficialIds.has(proposal.officialCard.id)) return;
      usedLocalIndexes.add(proposal.index);
      usedOfficialIds.add(proposal.officialCard.id);
      matches.push(proposal);
    });

  return matches.sort((a, b) => a.index - b.index);
}

function officialCardCategory(card, indexes, kind) {
  if (kind === "support") return officialCardFactions(card, indexes).length ? "crew" : "general";
  if (
    officialCardRequiredModels(card, indexes).length ||
    officialCardRanks(card).length ||
    officialCardRequiredTraits(card, indexes).length
  ) {
    return "character";
  }
  return officialCardFactions(card, indexes).length ? "crew" : "general";
}

function createOfficialCardPayload(card, indexes, kind, { includeIdentity = false } = {}) {
  const factions = officialCardFactions(card, indexes);
  const requiredModels = officialCardRequiredModels(card, indexes);
  const requiredRanks = officialCardRanks(card);
  const requiredTraits = officialCardRequiredTraits(card, indexes);
  const preventingTraits = officialCardPreventingTraits(card, indexes);
  const isSupport = kind === "support";

  const payload = {
    officialId: Number(card.id),
    officialName: card.name || "",
    officialImage: card.image || "",
    officialObjectiveTypeId: card.objective_type_id ?? null,
    renderAsCardImage: true,
    type: isSupport ? "Special Rules" : "Objective",
    category: officialCardCategory(card, indexes, kind),
    isGeneral: !factions.length && !requiredModels.length && !requiredRanks.length && !requiredTraits.length,
    value: `${Number(card.vp || 0)} VP`,
    vp: Number(card.vp || 0),
    maxPerDeck: isSupport ? 1 : Math.max(1, Number(card.count || 1)),
    countsForDeck: !isSupport
  };

  if (factions.length) payload.faction = factions;
  if (requiredModels.length) payload.requiredModels = requiredModels;
  if (requiredRanks.length) payload.requiredRanks = requiredRanks;
  if (requiredTraits.length) payload.requiredTraits = requiredTraits;
  if (preventingTraits.length) payload.preventingTraits = preventingTraits;

  if (isSupport) {
    payload.mandatory = true;
    payload.text = {
      en: "Official Knight Models support card. Use the original card image for the full text.",
      ru: "Официальная служебная карта Knight Models. Полный текст смотри на оригинальном изображении карты."
    };
  } else {
    payload.text = {
      en: "Official Knight Models objective card. Use the original card image for the full text.",
      ru: "Официальная карта цели Knight Models. Полный текст смотри на оригинальном изображении карты."
    };
  }

  delete payload.text;

  if (includeIdentity) {
    payload.id = `km-card-${card.id}`;
    payload.name = card.name || `Official Card ${card.id}`;
    payload.img = "img/no.png";
    payload.officialOnly = true;
  }

  return payload;
}

function buildUpdates(matches, indexes, kind) {
  return matches.map(match => ({
    index: match.index,
    matchId: match.localCard.id || "",
    matchName: match.localCard.name || match.localCard.title || "",
    officialId: Number(match.officialCard.id),
    score: match.score,
    patch: createOfficialCardPayload(match.officialCard, indexes, kind)
  }));
}

function buildDisabled(localCards, matches) {
  const matchedIndexes = new Set(matches.map(match => match.index));
  return localCards
    .map((card, index) => ({ card, index }))
    .filter(item => !matchedIndexes.has(item.index))
    .map(({ card, index }) => ({
      index,
      id: card.id || "",
      name: card.name || card.title || ""
    }));
}

function buildBlock({ builderUpdates, builderExtensions, builderDisabled, mandatoryUpdates, mandatoryExtensions, mandatoryDisabled }) {
  return `${START}
// Generated by tools/apply-official-card-sync.mjs from the offline Knight Models snapshot.
const officialBuilderCardSyncUpdates = ${JSON.stringify(builderUpdates, null, 2)};
const officialBuilderCardExtensions = ${JSON.stringify(builderExtensions, null, 2)};
const disabledLocalOnlyBuilderCards = ${JSON.stringify(builderDisabled, null, 2)};
const officialMandatoryCardSyncUpdates = ${JSON.stringify(mandatoryUpdates, null, 2)};
const officialMandatoryCardExtensions = ${JSON.stringify(mandatoryExtensions, null, 2)};
const disabledLocalOnlyMandatoryCards = ${JSON.stringify(mandatoryDisabled, null, 2)};

function findOfficialCardSyncTarget(collection, update) {
  const byIndex = collection[update.index];
  if (byIndex && (byIndex.id || "") === update.matchId && (byIndex.name || byIndex.title || "") === update.matchName) {
    return byIndex;
  }

  return collection.find(card => Number(card.officialId) === Number(update.officialId))
    || collection.find(card => (card.id || "") === update.matchId && (card.name || card.title || "") === update.matchName)
    || null;
}

function applyOfficialCardSync(collection, updates, extensions, disabledItems) {
  for (const update of updates) {
    const target = findOfficialCardSyncTarget(collection, update);
    if (target) Object.assign(target, update.patch);
  }

  for (const officialCard of extensions) {
    if (!collection.some(card => Number(card.officialId) === Number(officialCard.officialId))) {
      collection.push(officialCard);
    }
  }

  for (const disabledCard of disabledItems) {
    const byIndex = collection[disabledCard.index];
    const target = byIndex && (byIndex.id || "") === disabledCard.id && (byIndex.name || byIndex.title || "") === disabledCard.name
      ? byIndex
      : collection.find(card => (card.id || "") === disabledCard.id && (card.name || card.title || "") === disabledCard.name);
    if (target) target.disabledLocalOnlyCard = true;
  }
}

applyOfficialCardSync(builderCards, officialBuilderCardSyncUpdates, officialBuilderCardExtensions, disabledLocalOnlyBuilderCards);
applyOfficialCardSync(builderMandatoryCards, officialMandatoryCardSyncUpdates, officialMandatoryCardExtensions, disabledLocalOnlyMandatoryCards);
${END}`;
}

function insertOrReplaceBlock(source, block) {
  const startIndex = source.indexOf(START);
  const endIndex = source.indexOf(END);
  if (startIndex >= 0 && endIndex >= startIndex) {
    return `${source.slice(0, startIndex)}${block}${source.slice(endIndex + END.length)}`;
  }

  const anchor = "window.BMG_BUILDER_MANDATORY_CARDS = builderMandatoryCards;";
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) {
    throw new Error("Could not find insertion point before card exports.");
  }

  return `${source.slice(0, anchorIndex)}${block}\n\n${source.slice(anchorIndex)}`;
}

const source = fs.readFileSync(DATA_JS, "utf8");
const baseSource = stripGeneratedBlock(source);
const windowData = loadContext(baseSource);
const sections = windowData.KM_OFFICIAL_DATA?.sections || {};
const indexes = buildOfficialIndexes(sections);

const builderCards = windowData.BMG_BUILDER_CARDS || [];
const mandatoryCards = windowData.BMG_BUILDER_MANDATORY_CARDS || [];
const officialCards = sections.cards || [];
const officialBuilderCards = officialCards.filter(card => Number(card.count || 0) > 0);
const officialMandatoryCards = officialCards.filter(card => Number(card.count || 0) <= 0);

const builderMatches = chooseMatches(builderCards, officialBuilderCards, indexes, "builder");
const mandatoryMatches = chooseMatches(mandatoryCards, officialMandatoryCards, indexes, "support");

const matchedBuilderOfficialIds = new Set(builderMatches.map(match => Number(match.officialCard.id)));
const matchedMandatoryOfficialIds = new Set(mandatoryMatches.map(match => Number(match.officialCard.id)));

const builderUpdates = buildUpdates(builderMatches, indexes, "builder");
const mandatoryUpdates = buildUpdates(mandatoryMatches, indexes, "support");
const builderExtensions = officialBuilderCards
  .filter(card => !matchedBuilderOfficialIds.has(Number(card.id)))
  .map(card => createOfficialCardPayload(card, indexes, "builder", { includeIdentity: true }));
const mandatoryExtensions = officialMandatoryCards
  .filter(card => !matchedMandatoryOfficialIds.has(Number(card.id)))
  .map(card => createOfficialCardPayload(card, indexes, "support", { includeIdentity: true }));

const builderDisabled = buildDisabled(builderCards, builderMatches);
const mandatoryDisabled = buildDisabled(mandatoryCards, mandatoryMatches);

const block = buildBlock({
  builderUpdates,
  builderExtensions,
  builderDisabled,
  mandatoryUpdates,
  mandatoryExtensions,
  mandatoryDisabled
});

fs.writeFileSync(DATA_JS, insertOrReplaceBlock(source, block), "utf8");

console.log(`updated ${DATA_JS}`);
console.log(JSON.stringify({
  localBuilderCards: builderCards.length,
  officialBuilderCards: officialBuilderCards.length,
  builderUpdates: builderUpdates.length,
  builderExtensions: builderExtensions.length,
  builderDisabled: builderDisabled.length,
  localMandatoryCards: mandatoryCards.length,
  officialMandatoryCards: officialMandatoryCards.length,
  mandatoryUpdates: mandatoryUpdates.length,
  mandatoryExtensions: mandatoryExtensions.length,
  mandatoryDisabled: mandatoryDisabled.length
}, null, 2));
