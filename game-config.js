import { CARDS, buildEngineCatalog } from "./catalog.js";

export const ENGINE_CATALOG = buildEngineCatalog();
export const EVENT_DECK = CARDS.filter(c => c.type === "event").map(c => c.id);

export const DEFAULT_LINEUPS = {
  human: {
    goalkeeper: "PG02-C", // San Nicolò
    defender: "PG03-C",  // San Enrichetto
    midfielder: "PG04-C", // San Flage
    attacker: "PG10-C"   // San Zorro
  },
  cpu: {
    goalkeeper: "PG02-C", // San Nicolò
    defender: "PG07-C",  // San Mauri
    midfielder: "PG05-C", // San Zakaria
    attacker: "PG08-C"   // San Bardelle
  }
};

export function defaultPlayerSetup(playerId, name, lineup) {
  const selected = new Set(Object.values(lineup));
  const common = CARDS.filter(c => c.type === "player" && c.version === "Comune" && c.enginePlayable && !selected.has(c.id)).map(c => c.id);
  const eligibleLegendaries = CARDS
    .filter(c => c.type === "player" && c.version === "Leggendaria" && c.enginePlayable && selected.has(c.baseCardId))
    .slice(0, 3)
    .map(c => c.id);
  const tactics = CARDS.filter(c => c.type === "tactic").map(c => c.id);
  return { id: playerId, name, lineup, deck: [...common, ...eligibleLegendaries, ...tactics] };
}

export function makeGameConfig({ humanId = "human", cpuId = "cpu", humanName = "Tu", cpuName = "Computer", startingPlayerId = humanId } = {}) {
  return {
    cardCatalog: ENGINE_CATALOG,
    players: [
      defaultPlayerSetup(humanId, humanName, DEFAULT_LINEUPS.human),
      defaultPlayerSetup(cpuId, cpuName, DEFAULT_LINEUPS.cpu)
    ],
    eventDeck: EVENT_DECK,
    startingPlayerId
  };
}
