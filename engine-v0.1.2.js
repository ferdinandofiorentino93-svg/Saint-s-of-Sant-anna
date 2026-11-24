/**
 * Saints of Sant'Anna - Motore di gioco basato sul Regolamento Ufficiale v1.0.
 * Modulo puro, separato dalla UI. Non gestisce rete, account o storage.
 * I risultati D20 sono forniti dal server/chiamante per rendere le mosse verificabili.
 */

import { getAbilityRule } from "./ability-rules-v0.1.2.js";

export const RULES = Object.freeze({
  totalTurns: 9,
  openingHand: 5,
  cardsDrawnAtTurnStart: 1,
  maxBench: 5,
  substitutionsPerTurn: 3,
  legendarySubstitutionCost: 2,
  maxLegendariesInDeck: 3,
  breakTimeTurns: 3,
  eventTurns: Object.freeze([3, 6, 9]),
  d20Min: 1,
  d20Max: 20,
  emergencyGoalkeeperParry: 2,
  fieldRoles: Object.freeze(["goalkeeper", "defender", "midfielder", "attacker"]),
});

export class GameRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "GameRuleError";
    this.code = code;
  }
}

const fail = (code, message) => { throw new GameRuleError(code, message); };
const clone = (value) => structuredClone(value);
const isNumber = (value) => Number.isFinite(value);

function normalizeRole(role) {
  const aliases = {
    goalkeeper: "goalkeeper", portiere: "goalkeeper",
    defender: "defender", difensore: "defender",
    midfielder: "midfielder", centrocampista: "midfielder",
    attacker: "attacker", attaccante: "attacker", forward: "attacker",
  };
  return aliases[String(role ?? "").toLowerCase()] ?? role;
}

function normalizeType(card) {
  if (card.type) return card.type;
  if (card.category === "Giocatore") return "player";
  if (card.category === "Tattica") return "tactic";
  if (card.category === "Evento") return "event";
  return null;
}

function normalizeRarity(rarity) {
  const value = String(rarity ?? "Comune").toLowerCase();
  if (value.includes("legend") || value.includes("leggend")) return "legendary";
  if (value.includes("rare") || value.includes("rara")) return "rare";
  return "common";
}

/**
 * Converte le righe del foglio Cards in definizioni utilizzabili dal motore.
 * Esempio override giocatore: { PG01: { role: "goalkeeper", stats: { attack, defense, technique, fatigue, parry } } }.
 * Gli effetti descritti in testo restano sourceEffectText: non vengono interpretati arbitrariamente.
 */
export function normalizeCardCatalog(rows, playerOverrides = {}, effectOverrides = {}) {
  return rows.map((row) => {
    const override = playerOverrides[row.id] ?? {};
    const rowEffectIsStructured = row.effect && typeof row.effect === "object" ? row.effect : null;
    const effectData = effectOverrides[row.id] ?? override.effectData ?? row.effectData ?? rowEffectIsStructured ?? null;
    const stats = override.stats ?? row.stats;
    return {
      ...row,
      ...override,
      id: row.id,
      name: override.name ?? row.name,
      type: normalizeType({ ...row, ...override }),
      role: normalizeRole(override.role ?? row.role),
      rarity: normalizeRarity(override.rarity ?? row.rarity),
      stats: stats ? { ...stats } : undefined,
      baseCardId: override.baseCardId ?? row.baseCardId ?? row.upgradeOf ?? null,
      ability: override.ability ?? row.ability ?? null,
      effectData,
      sourceEffectText: typeof row.effect === "string" ? row.effect : row.sourceEffectText ?? null,
    };
  });
}

function makeCatalogMap(cards) {
  const entries = Array.isArray(cards) ? cards : Object.values(cards ?? {});
  const map = new Map();
  for (const raw of entries) {
    if (!raw?.id) fail("INVALID_CATALOG", "Ogni carta deve avere un ID.");
    if (map.has(raw.id)) fail("DUPLICATE_CARD_ID", `ID carta duplicato: ${raw.id}`);
    const card = { ...raw, type: normalizeType(raw), role: normalizeRole(raw.role), rarity: normalizeRarity(raw.rarity) };
    if (!["player", "tactic", "event"].includes(card.type)) fail("INVALID_CARD_TYPE", `Tipo non riconosciuto per la carta ${card.id}.`);
    if (card.type === "player") validatePlayerDefinition(card);
    map.set(card.id, card);
  }
  for (const card of map.values()) {
    if (card.type === "player" && card.rarity === "legendary") {
      const base = map.get(card.baseCardId);
      if (!base || base.type !== "player" || base.rarity !== "common" || base.role !== card.role) {
        fail("INVALID_LEGENDARY_BASE", `La Leggendaria ${card.id} deve indicare una carta Comune dello stesso ruolo come base.`);
      }
    }
  }
  return map;
}

function validatePlayerDefinition(card) {
  if (!RULES.fieldRoles.includes(card.role)) fail("PLAYER_ROLE_MISSING", `La carta giocatore ${card.id} deve avere un ruolo valido.`);
  const stats = card.stats ?? {};
  for (const stat of ["attack", "defense", "technique", "fatigue"]) {
    if (!isNumber(stats[stat]) || stats[stat] < 0) fail("PLAYER_STATS_MISSING", `La carta ${card.id} deve avere una statistica ${stat} numerica e non negativa.`);
  }
  if (stats.fatigue < 1) fail("INVALID_MAX_FATIGUE", `La Fatica massima di ${card.id} deve essere almeno 1.`);
  if (card.role === "goalkeeper" && (!isNumber(stats.parry) || stats.parry < 0)) {
    fail("GOALKEEPER_PARRY_MISSING", `Il portiere ${card.id} deve avere una statistica Parata.`);
  }
}

function shuffle(items, rng) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function resolveLineup(lineup) {
  if (Array.isArray(lineup)) {
    const result = {};
    for (const item of lineup) result[normalizeRole(item.role)] = item.cardId ?? item.id;
    return result;
  }
  const result = {};
  for (const [role, cardId] of Object.entries(lineup ?? {})) result[normalizeRole(role)] = cardId;
  return result;
}

function makeUnit(card, playerId, instanceNumber) {
  const stats = { ...card.stats };
  return {
    instanceId: `${playerId}:${card.id}:${instanceNumber}`,
    cardId: card.id,
    name: card.name ?? card.id,
    role: card.role,
    stats,
    fatigue: stats.fatigue,
    maxFatigue: stats.fatigue,
    modifiers: { attack: 0, defense: 0, technique: 0, parry: 0 },
    timedModifiers: [],
    abilityUses: {},
    shotTechniqueBonus: 0,
    legendaryOverlay: null,
    status: "active",
  };
}

function activeStats(unit) {
  return unit.legendaryOverlay ? unit.legendaryOverlay.stats : unit.stats;
}
function activeFatigue(unit) {
  return unit.legendaryOverlay ? unit.legendaryOverlay.fatigue : unit.fatigue;
}
function activeMaxFatigue(unit) {
  return unit.legendaryOverlay ? unit.legendaryOverlay.maxFatigue : unit.maxFatigue;
}
function currentCardId(unit) {
  return unit.legendaryOverlay?.cardId ?? unit.cardId;
}
function removeOne(items, value) {
  const index = items.indexOf(value);
  if (index < 0) return false;
  items.splice(index, 1);
  return true;
}
function drawCards(player, count) {
  const drawn = [];
  for (let i = 0; i < count && player.deck.length > 0; i += 1) {
    const id = player.deck.shift();
    player.hand.push(id);
    drawn.push(id);
  }
  return drawn;
}
function getPlayer(state, playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) fail("PLAYER_NOT_FOUND", `Giocatore non trovato: ${playerId}`);
  return player;
}
function getCard(state, cardId) {
  const card = state.cardCatalog[cardId];
  if (!card) fail("CARD_NOT_FOUND", `Carta non presente nel catalogo: ${cardId}`);
  return card;
}
function assertActivePlayer(state, playerId) {
  if (state.status !== "active") fail("GAME_NOT_ACTIVE", "La partita non è in corso.");
  if (state.activePlayerId !== playerId) fail("NOT_ACTIVE_PLAYER", "Non è il turno di questo giocatore.");
  return getPlayer(state, playerId);
}
function spendSubstitutions(player, cost) {
  if (player.substitutionsRemaining < cost) fail("NOT_ENOUGH_SUBSTITUTIONS", `Sostituzioni insufficienti: servono ${cost}, disponibili ${player.substitutionsRemaining}.`);
  player.substitutionsRemaining -= cost;
}
function findFieldUnit(player, unitId) {
  const index = player.field.findIndex((unit) => unit.instanceId === unitId);
  if (index < 0) fail("FIELD_UNIT_NOT_FOUND", `Giocatore non trovato in campo: ${unitId}`);
  return { unit: player.field[index], index };
}

function enterBreakTime(state, player, unit, { duringUpkeep = false } = {}) {
  player.field.splice(player.field.indexOf(unit), 1);
  unit.status = "break_time";
  unit.modifiers = { attack: 0, defense: 0, technique: 0, parry: 0 };
  // Se entra durante l'upkeep, il turno corrente è già un turno intero fuori.
  // Se entra durante un'azione, il conteggio parte dal turno successivo.
  player.breakTime.push({
    unit: { ...unit, legendaryOverlay: null },
    turnsRemaining: RULES.breakTimeTurns,
    firstCountTurn: state.currentTurn + (duringUpkeep ? 0 : 1),
    readyToReturn: false,
  });
}
function exhaustLegendary(player, unit) {
  player.discardPile.push(unit.legendaryOverlay.cardId);
  unit.legendaryOverlay = null;
}
function reduceFatigue(state, player, unit, amount, options = {}) {
  if (!isNumber(amount) || amount < 0) fail("INVALID_FATIGUE_COST", "Il costo Fatica deve essere numerico e non negativo.");
  if (unit.legendaryOverlay) {
    unit.legendaryOverlay.fatigue = Math.max(0, unit.legendaryOverlay.fatigue - amount);
    if (unit.legendaryOverlay.fatigue === 0) exhaustLegendary(player, unit);
    return;
  }
  unit.fatigue = Math.max(0, unit.fatigue - amount);
  if (unit.fatigue === 0) enterBreakTime(state, player, unit, options);
}

function returnReadyBreakTime(state, upkeepEvents) {
  for (const player of state.players) {
    for (let i = 0; i < player.breakTime.length;) {
      const entry = player.breakTime[i];
      if (entry.readyToReturn && player.bench.length < RULES.maxBench) {
        entry.unit.fatigue = entry.unit.maxFatigue;
        entry.unit.status = "bench";
        entry.unit.modifiers = { attack: 0, defense: 0, technique: 0, parry: 0 };
        player.bench.push(entry.unit);
        player.breakTime.splice(i, 1);
        upkeepEvents.push({ playerId: player.id, type: "returned-from-break", cardId: entry.unit.cardId });
      } else i += 1;
    }
  }
}

function tickBreakTimeAtTurnEnd(state, completedTurn) {
  for (const player of state.players) {
    for (const entry of player.breakTime) {
      if (completedTurn >= entry.firstCountTurn && entry.turnsRemaining > 0) {
        entry.turnsRemaining -= 1;
        if (entry.turnsRemaining === 0) entry.readyToReturn = true;
      }
    }
  }
}

function applyTurnUpkeep(state) {
  const upkeepEvents = [];
  returnReadyBreakTime(state, upkeepEvents);

  // Regolamento: la Fatica diminuisce per tutti i giocatori in campo.
  for (const player of state.players) {
    for (const unit of [...player.field]) {
      // Macumba Eterna: Manuel Zulfio Leggendario non perde Fatica nel mantenimento.
      if (currentCardId(unit) === "PG09-L") continue;
      const before = unit.legendaryOverlay ? unit.legendaryOverlay.fatigue : unit.fatigue;
      reduceFatigue(state, player, unit, 1, { duringUpkeep: true });
      if (before > 0 && !player.field.some((x) => x.instanceId === unit.instanceId)) {
        upkeepEvents.push({ playerId: player.id, type: "break-time", cardId: unit.cardId });
      } else if (before === 1 && unit.legendaryOverlay === null) {
        upkeepEvents.push({ playerId: player.id, type: "legendary-exhausted", cardId: player.discardPile.at(-1) });
      }
    }
  }

  // Il giocatore attivo pesca una carta all'inizio del proprio turno.
  const active = getPlayer(state, state.activePlayerId);
  const drawn = drawCards(active, RULES.cardsDrawnAtTurnStart);

  // La panchina recupera 1 Fatica.
  for (const player of state.players) {
    for (const unit of player.bench) unit.fatigue = Math.min(unit.maxFatigue, unit.fatigue + 1);
  }

  // Le tre sostituzioni sono assegnate al giocatore di turno.
  active.substitutionsRemaining = RULES.substitutionsPerTurn;
  active.teamModifiers = { attack: 0, defense: 0 };
  for (const unit of active.field) {
    unit.modifiers = timedModifierTotals(unit);
    unit.abilityUses = {};
  }
  active.lastTacticTurn = null;
  active.turnFlags = { showdownResolved: false, shotResolved: false };

  // Il mazzo Eventi è separato e condiviso.
  if (RULES.eventTurns.includes(state.currentTurn)) {
    if (state.activeEvent) state.eventDiscard.push(state.activeEvent.id);
    const nextId = state.eventDeck.shift() ?? null;
    state.activeEvent = nextId ? clone(state.cardCatalog[nextId]) : null;
    if (state.activeEvent) upkeepEvents.push({ type: "event-revealed", cardId: nextId, turn: state.currentTurn });
  }
  state.turnLog.push({ turn: state.currentTurn, activePlayerId: active.id, drawn, events: upkeepEvents });
}

/** Le carte della formazione possono essere selezionate dalla collezione e non devono per forza stare nel mazzo di pesca. */
export function createGame(config) {
  const map = makeCatalogMap(config.cardCatalog ?? []);
  const cardCatalog = Object.fromEntries([...map.entries()].map(([id, card]) => [id, card]));
  if (!Array.isArray(config.players) || config.players.length !== 2) fail("TWO_PLAYERS_REQUIRED", "La partita richiede esattamente due giocatori.");
  const ids = config.players.map((p) => p.id);
  if (!ids[0] || !ids[1] || ids[0] === ids[1]) fail("INVALID_PLAYER_IDS", "I due giocatori devono avere ID distinti.");
  const rng = config.rng ?? Math.random;
  let sequence = 0;

  const players = config.players.map((source) => {
    const deck = [...(source.deck ?? [])];
    const lineup = resolveLineup(source.lineup);
    for (const role of RULES.fieldRoles) {
      const cardId = lineup[role];
      if (!cardId) fail("INCOMPLETE_LINEUP", `Manca un giocatore nel ruolo ${role}.`);
      const card = map.get(cardId);
      if (!card || card.type !== "player") fail("INVALID_LINEUP_CARD", `${cardId} non è una carta giocatore valida.`);
      if (card.rarity === "legendary") fail("LEGENDARY_STARTING_PLAYER", "La formazione iniziale deve utilizzare versioni Comuni.");
      if (card.role !== role) fail("LINEUP_ROLE_MISMATCH", `${card.name} non ricopre il ruolo ${role}.`);
      removeOne(deck, cardId); // evita che una carta schierata ricompaia nella mano se è stata inclusa nel deck
    }
    const distinctLineupIds = RULES.fieldRoles.map((role) => lineup[role]);
    if (new Set(distinctLineupIds).size !== 4) fail("DUPLICATE_STARTING_PLAYER", "La formazione iniziale deve contenere quattro carte giocatore distinte.");
    for (const cardId of deck) {
      const card = map.get(cardId);
      if (!card || !["player", "tactic"].includes(card.type)) fail("INVALID_DECK_CARD", `La carta ${cardId} non può essere inserita nel mazzo giocatore.`);
    }
    const legendaryCount = deck.filter((cardId) => map.get(cardId).type === "player" && map.get(cardId).rarity === "legendary").length;
    if (legendaryCount > RULES.maxLegendariesInDeck) fail("TOO_MANY_LEGENDARIES", `Il mazzo può contenere al massimo ${RULES.maxLegendariesInDeck} carte Leggendarie.`);
    const shuffledDeck = shuffle(deck, rng);
    if (shuffledDeck.length < RULES.openingHand) fail("INITIAL_DECK_TOO_SMALL", `${source.name ?? source.id} deve avere almeno ${RULES.openingHand} carte da pescare dopo la formazione iniziale.`);
    const player = {
      id: source.id,
      name: source.name ?? source.id,
      deck: shuffledDeck,
      hand: [],
      field: RULES.fieldRoles.map((role) => makeUnit(map.get(lineup[role]), source.id, ++sequence)),
      bench: [],
      breakTime: [],
      discardPile: [],
      goals: 0,
      substitutionsRemaining: 0,
      nextShowdownBonus: 0,
      nextShotTechniqueBonus: 0,
      lastTacticTurn: null,
      teamModifiers: { attack: 0, defense: 0 },
      turnFlags: { showdownResolved: false, shotResolved: false },
    };
    const opening = drawCards(player, RULES.openingHand);
    if (opening.length !== RULES.openingHand) fail("INITIAL_HAND_FAILED", `Impossibile pescare ${RULES.openingHand} carte per ${player.name}.`);
    return player;
  });

  const eventDeck = [...(config.eventDeck ?? [])];
  for (const id of eventDeck) if (map.get(id)?.type !== "event") fail("INVALID_EVENT_DECK", `${id} non è una carta Evento valida.`);
  const startingPlayerId = config.startingPlayerId ?? ids[0];
  if (!ids.includes(startingPlayerId)) fail("INVALID_STARTING_PLAYER", "Il giocatore iniziale non appartiene alla partita.");

  return {
    schemaVersion: 1,
    status: "setup",
    currentTurn: 0,
    activePlayerId: startingPlayerId,
    startingPlayerId,
    players,
    cardCatalog,
    eventDeck: shuffle(eventDeck, rng),
    eventDiscard: [],
    activeEvent: null,
    winnerId: null,
    result: null,
    turnLog: [],
    sequence,
  };
}

export function startGame(inputState) {
  const state = clone(inputState);
  if (state.status !== "setup") fail("GAME_ALREADY_STARTED", "La partita è già stata avviata.");
  state.status = "active";
  state.currentTurn = 1;
  state.activePlayerId = state.startingPlayerId;
  applyTurnUpkeep(state);
  return state;
}

function timedModifierTotals(unit) {
  const totals = { attack: 0, defense: 0, technique: 0, parry: 0 };
  for (const entry of unit.timedModifiers ?? []) totals[entry.stat] = (totals[entry.stat] ?? 0) + entry.amount;
  return totals;
}

export function getActiveStats(unit) {
  const stats = activeStats(unit);
  return {
    attack: stats.attack + (unit.modifiers?.attack ?? 0),
    defense: stats.defense + (unit.modifiers?.defense ?? 0),
    technique: stats.technique + (unit.modifiers?.technique ?? 0),
    parry: stats.parry === undefined ? undefined : stats.parry + (unit.modifiers?.parry ?? 0),
  };
}

export function recruitFromHandToBench(inputState, playerId, cardId) {
  const state = clone(inputState);
  const player = assertActivePlayer(state, playerId);
  const card = getCard(state, cardId);
  if (card.type !== "player" || card.rarity === "legendary") fail("INVALID_BENCH_RECRUIT", "In panchina si possono inserire giocatori normali pescati dalla mano.");
  if (!player.hand.includes(cardId)) fail("CARD_NOT_IN_HAND", `La carta ${cardId} non è nella mano.`);
  if (player.bench.length >= RULES.maxBench) fail("BENCH_FULL", "La panchina è piena: usa lo scambio che costa una sostituzione.");
  removeOne(player.hand, cardId);
  player.bench.push(makeUnit(card, playerId, ++state.sequence));
  return state;
}

export function swapHandAndBench(inputState, playerId, handCardId, benchUnitId) {
  const state = clone(inputState);
  const player = assertActivePlayer(state, playerId);
  if (player.bench.length < RULES.maxBench) fail("BENCH_NOT_FULL", "Lo scambio mano-panchina è previsto quando la panchina è piena.");
  const card = getCard(state, handCardId);
  if (card.type !== "player" || card.rarity === "legendary") fail("INVALID_BENCH_RECRUIT", "Puoi scambiare solo una carta giocatore normale.");
  if (!player.hand.includes(handCardId)) fail("CARD_NOT_IN_HAND", `La carta ${handCardId} non è nella mano.`);
  const benchIndex = player.bench.findIndex((unit) => unit.instanceId === benchUnitId);
  if (benchIndex < 0) fail("BENCH_UNIT_NOT_FOUND", `Carta non trovata in panchina: ${benchUnitId}`);
  spendSubstitutions(player, 1);
  const [oldUnit] = player.bench.splice(benchIndex, 1);
  removeOne(player.hand, handCardId);
  player.hand.push(oldUnit.cardId);
  player.bench.push(makeUnit(card, playerId, ++state.sequence));
  return state;
}

export function substitute(inputState, playerId, fieldUnitId, benchUnitId) {
  const state = clone(inputState);
  const player = assertActivePlayer(state, playerId);
  const { unit: outgoing, index } = findFieldUnit(player, fieldUnitId);
  if (outgoing.legendaryOverlay) fail("LEGENDARY_OVERLAY_ACTIVE", "Una versione Leggendaria attiva non può essere sostituita prima di esaurirsi.");
  const benchIndex = player.bench.findIndex((unit) => unit.instanceId === benchUnitId);
  if (benchIndex < 0) fail("BENCH_UNIT_NOT_FOUND", `Carta non trovata in panchina: ${benchUnitId}`);
  const incoming = player.bench[benchIndex];
  if (incoming.role !== outgoing.role) fail("ROLE_MISMATCH", "La sostituzione deve mantenere lo stesso ruolo.");
  spendSubstitutions(player, 1);
  player.field[index] = incoming;
  player.bench.splice(benchIndex, 1);
  outgoing.status = "bench";
  outgoing.modifiers = { attack: 0, defense: 0, technique: 0, parry: 0 };
  player.bench.push(outgoing);
  return state;
}

export function playLegendary(inputState, playerId, legendaryCardId, commonUnitId) {
  const state = clone(inputState);
  const player = assertActivePlayer(state, playerId);
  const legendary = getCard(state, legendaryCardId);
  if (legendary.type !== "player" || legendary.rarity !== "legendary") fail("NOT_LEGENDARY_CARD", `${legendaryCardId} non è una carta Leggendaria.`);
  if (!player.hand.includes(legendaryCardId)) fail("CARD_NOT_IN_HAND", `La carta ${legendaryCardId} non è nella mano.`);
  const { unit } = findFieldUnit(player, commonUnitId);
  if (unit.legendaryOverlay) fail("LEGENDARY_ALREADY_ACTIVE", "Questo giocatore ha già una versione Leggendaria attiva.");
  if (unit.cardId !== legendary.baseCardId) fail("LEGENDARY_BASE_MISMATCH", "La versione Comune richiesta non è presente in campo.");
  spendSubstitutions(player, RULES.legendarySubstitutionCost);
  removeOne(player.hand, legendaryCardId);
  unit.abilityUses = {};
  unit.legendaryOverlay = {
    instanceId: `${playerId}:${legendaryCardId}:${++state.sequence}`,
    cardId: legendaryCardId,
    stats: { ...legendary.stats },
    fatigue: legendary.stats.fatigue,
    maxFatigue: legendary.stats.fatigue,
  };
  return state;
}

function effectTargets(player, effect) {
  if (effect.target === "team") return player.field;
  if (effect.target === "unit") {
    const unit = player.field.find((entry) => entry.instanceId === effect.unitId);
    if (!unit) fail("FIELD_UNIT_NOT_FOUND", `Giocatore bersaglio non in campo: ${effect.unitId}`);
    return [unit];
  }
  fail("INVALID_EFFECT_TARGET", "Il bersaglio deve essere 'unit' o 'team'.");
}

function applyStructuredEffect(state, player, effect) {
  if (!effect || typeof effect !== "object" || !effect.type) fail("TACTIC_EFFECT_NOT_CONFIGURED", "L'effetto è ancora descritto solo in testo e deve essere formalizzato prima dell'esecuzione.");
  switch (effect.type) {
    case "modifyTeamStat":
      if (!["attack", "defense"].includes(effect.stat) || !isNumber(effect.amount)) fail("INVALID_EFFECT", "modifyTeamStat richiede attack/defense e una quantità numerica.");
      player.teamModifiers[effect.stat] += effect.amount;
      break;
    case "modifyUnitStat": {
      if (!["attack", "defense", "technique", "parry"].includes(effect.stat) || !isNumber(effect.amount)) fail("INVALID_EFFECT", "Statistica o quantità non valida.");
      const [unit] = effectTargets(player, { target: "unit", unitId: effect.unitId });
      unit.modifiers[effect.stat] += effect.amount;
      break;
    }
    case "recoverFatigue": {
      if (!Number.isInteger(effect.amount) || effect.amount < 0) fail("INVALID_EFFECT", "Il recupero Fatica deve essere un intero non negativo.");
      for (const unit of effectTargets(player, effect)) {
        if (unit.legendaryOverlay) unit.legendaryOverlay.fatigue = Math.min(unit.legendaryOverlay.maxFatigue, unit.legendaryOverlay.fatigue + effect.amount);
        else unit.fatigue = Math.min(unit.maxFatigue, unit.fatigue + effect.amount);
      }
      break;
    }
    case "nextShotBonus":
      if (!isNumber(effect.amount)) fail("INVALID_EFFECT", "Il bonus al tiro deve essere numerico.");
      player.nextShotTechniqueBonus = (player.nextShotTechniqueBonus ?? 0) + effect.amount;
      break;
    case "drawCards":
      if (!Number.isInteger(effect.amount) || effect.amount < 1) fail("INVALID_EFFECT", "Il numero di carte da pescare deve essere un intero positivo.");
      player.lastEffectDraw = drawCards(player, effect.amount);
      break;
    default:
      fail("UNSUPPORTED_EFFECT", `Tipo di effetto non supportato: ${effect.type}`);
  }
}

export function playTactic(inputState, playerId, tacticCardId) {
  const state = clone(inputState);
  const player = assertActivePlayer(state, playerId);
  const card = getCard(state, tacticCardId);
  if (card.type !== "tactic") fail("NOT_TACTIC_CARD", `${tacticCardId} non è una carta Tattica.`);
  if (!player.hand.includes(tacticCardId)) fail("CARD_NOT_IN_HAND", `La carta ${tacticCardId} non è nella mano.`);
  if (player.turnFlags.showdownResolved) fail("TACTIC_TIMING_INVALID", "Le tattiche devono essere giocate prima dello Showdown.");
  applyStructuredEffect(state, player, card.effectData ?? card.effect);
  player.lastTacticTurn = state.currentTurn;
  removeOne(player.hand, tacticCardId);
  player.discardPile.push(tacticCardId);
  return state;
}

function findAnyUnit(player, unitId) {
  const fieldUnit = player.field.find(unit => unit.instanceId === unitId);
  if (fieldUnit) return fieldUnit;
  const benchUnit = player.bench.find(unit => unit.instanceId === unitId);
  if (benchUnit) return benchUnit;
  fail("ABILITY_TARGET_NOT_FOUND", "Il giocatore scelto non è disponibile.");
}

function recoverUnit(unit, amount) {
  if (unit.legendaryOverlay) unit.legendaryOverlay.fatigue = Math.min(unit.legendaryOverlay.maxFatigue, unit.legendaryOverlay.fatigue + amount);
  else unit.fatigue = Math.min(unit.maxFatigue, unit.fatigue + amount);
}

function drawTactics(player, state, count) {
  const drawn = [];
  for (let i = 0; i < count; i += 1) {
    const index = player.deck.findIndex(id => state.cardCatalog[id]?.type === "tactic");
    if (index < 0) break;
    const [id] = player.deck.splice(index, 1);
    player.hand.push(id);
    drawn.push(id);
  }
  return drawn;
}

function assertAbilityWindow(state, player, unit, rule) {
  if (rule.timing === "preShowdown" && player.turnFlags.showdownResolved) fail("ABILITY_WINDOW_CLOSED", "Questa abilità va usata prima dello Showdown.");
  if (rule.timing === "afterShowdownWin" && player.turnFlags.shotResolved) fail("ABILITY_WINDOW_CLOSED", "Il tiro è già stato effettuato.");
  if (rule.requiresShowdownParticipation) {
    const showdown = state.lastShowdown;
    if (!showdown?.attackerUnits?.some(entry => entry.instanceId === unit.instanceId)) fail("ABILITY_REQUIRES_PARTICIPATION", "Questo giocatore deve essere stato in campo durante lo Showdown vinto.");
  }
  if (rule.timing === "afterShowdownWin") {
    const s = state.lastShowdown;
    if (!s || s.turn !== state.currentTurn || s.attackerId !== player.id || s.difference <= 0) fail("ABILITY_CONDITION_NOT_MET", "Puoi usarla solo dopo aver vinto il tuo Showdown.");
    if (rule.minDifference && s.difference < rule.minDifference) fail("ABILITY_CONDITION_NOT_MET", `Servono almeno ${rule.minDifference} punti di vantaggio nello Showdown.`);
  }
  if (rule.timing === "afterShowdownLoss") {
    const s = state.lastShowdown;
    if (!s || s.turn !== state.currentTurn || s.attackerId !== player.id || s.difference >= 0) fail("ABILITY_CONDITION_NOT_MET", "Puoi usarla solo dopo aver perso il tuo Showdown.");
  }
  if (rule.timing === "afterTactic" && player.lastTacticTurn !== state.currentTurn) fail("ABILITY_CONDITION_NOT_MET", "Questa abilità si attiva dopo aver giocato una Tattica nel turno corrente.");
  if (rule.timing === "beforeShot" && (!player.turnFlags.showdownResolved || player.turnFlags.shotResolved)) fail("ABILITY_CONDITION_NOT_MET", "Questa abilità si attiva dopo lo Showdown e prima del tiro.");
}

function abilityNameForEffect(effect) {
  return ({
    buffAlly: "Ispirazione Regale",
    recoverAlly: "Non Smettere Mai"
  })[effect] ?? "Abilità";
}

function applyAbilityEffect(state, player, unit, rule, params) {
  const enemy = state.players.find(p => p.id !== player.id);
  const targetAlly = () => findAnyUnit(player, params.targetUnitId);
  const targetAllyField = () => {
    const target = player.field.find(u => u.instanceId === params.targetUnitId);
    if (!target) fail("ABILITY_TARGET_NOT_FOUND", "Scegli un tuo giocatore in campo.");
    return target;
  };
  const targetEnemy = () => {
    const target = enemy.field.find(u => u.instanceId === params.targetUnitId);
    if (!target) fail("ABILITY_TARGET_NOT_FOUND", "Scegli un giocatore avversario in campo.");
    return target;
  };
  const buff = (target, stat, amount) => { target.modifiers[stat] = (target.modifiers[stat] ?? 0) + amount; };
  switch (rule.effect) {
    case "recoverAlly": {
      const target = targetAlly();
      recoverUnit(target, rule.amount);
      state.lastAbility = { name: "Non Smettere Mai", outcome: `${target.name} recupera ${rule.amount} Fatica` };
      break;
    }
    case "flageCommon":
      if (params.choice === "buff") {
        const target = targetAllyField(); buff(target, "technique", 3);
        state.lastAbility = { name: "Trascinatore della Folla", outcome: `${target.name} ottiene +3 Tecnica fino alla fine del turno` };
      } else if (params.choice === "recoverTeam") {
        for (const ally of [...player.field, ...player.bench]) if (ally.instanceId !== unit.instanceId) recoverUnit(ally, 2);
        state.lastAbility = { name: "Trascinatore della Folla", outcome: "Gli altri tuoi giocatori recuperano fino a 2 Fatica" };
      } else fail("ABILITY_CHOICE_REQUIRED", "Scegli uno degli effetti di Trascinatore della Folla.");
      break;
    case "flageLegendary":
      if (params.choice === "recover") {
        const target = targetAlly(); recoverUnit(target, 2);
        state.lastAbility = { name: "La Rivolta", outcome: `${target.name} recupera fino a 2 Fatica` };
      } else if (params.choice === "draw") {
        const drawn = drawTactics(player, state, 1);
        state.lastAbility = { name: "La Rivolta", outcome: drawn.length ? "Peschi 1 Carta Tattica" : "Nessuna Carta Tattica disponibile nel mazzo" };
      } else if (params.choice === "buff") {
        const target = targetAllyField(); buff(target, "technique", 2);
        state.lastAbility = { name: "La Rivolta", outcome: `${target.name} ottiene +2 Tecnica fino alla fine del turno` };
      } else fail("ABILITY_CHOICE_REQUIRED", "Scegli l'effetto de La Rivolta.");
      break;
    case "protesta": {
      const roll = Number(params.roll);
      if (!Number.isInteger(roll) || roll < 1 || roll > 20) fail("INVALID_D20", "Il D20 deve essere compreso tra 1 e 20.");
      const count = roll >= 16 ? 2 : roll >= 11 ? 1 : 0;
      const drawn = count ? drawTactics(player, state, count) : [];
      state.lastAbility = { name: "Protesta Infinita", roll, outcome: count ? `Pescate ${drawn.length} carte Tattica` : "Nessun effetto" };
      break;
    }
    case "manoFortunata": {
      const roll = Number(params.roll);
      if (!Number.isInteger(roll) || roll < 1 || roll > 6) fail("INVALID_D6", "Il D6 deve essere compreso tra 1 e 6.");
      const drawn = roll >= 5 ? drawCards(player, 1) : [];
      state.lastAbility = { name: "Mano Fortunata", roll, outcome: drawn.length ? "Peschi 1 carta" : "Nessuna carta pescata" };
      break;
    }
    case "ruotaDestino": {
      const roll = Number(params.roll);
      if (!Number.isInteger(roll) || roll < 1 || roll > 6) fail("INVALID_D6", "Il D6 deve essere compreso tra 1 e 6.");
      if (roll >= 4) {
        if (params.choice === "shot") player.nextShotTechniqueBonus = (player.nextShotTechniqueBonus ?? 0) + 2;
        else if (params.choice === "draw") drawCards(player, 1);
        else fail("ABILITY_CHOICE_REQUIRED", "Con 4 o più scegli il bonus al tiro oppure una carta.");
      }
      state.lastAbility = { name: "Ruota del Destino", roll, outcome: roll >= 4 ? (params.choice === "shot" ? "+2 Tecnica al prossimo tiro" : "1 carta pescata") : "Nessun effetto" };
      break;
    }
    case "buffAlly": {
      const target = targetAllyField();
      if (rule.stat === "multiple") { buff(target, "attack", 2); buff(target, "technique", 1); }
      else buff(target, rule.stat, rule.amount);
      state.lastAbility = { name: abilityNameForEffect(rule.effect), outcome: `${target.name} riceve il bonus fino alla fine del turno` };
      break;
    }
    case "millenaria": {
      const roll = Number(params.roll);
      if (!Number.isInteger(roll) || roll < 1 || roll > 20) fail("INVALID_D20", "Il D20 deve essere compreso tra 1 e 20.");
      if (roll >= 11) {
        const ids = Array.isArray(params.targetUnitIds) ? [...new Set(params.targetUnitIds)].slice(0, 3) : [];
        if (!ids.length) fail("ABILITY_TARGET_REQUIRED", "Seleziona fino a tre tuoi giocatori in campo.");
        for (const id of ids) { const target = player.field.find(u => u.instanceId === id); if (!target) fail("ABILITY_TARGET_NOT_FOUND", "Uno dei bersagli non è in campo."); buff(target, "attack", 1); buff(target, "technique", 1); }
      }
      state.lastAbility = { name: "La Millenaria", roll, outcome: roll >= 11 ? "Bonus applicato ai giocatori selezionati" : "Nessun effetto" };
      break;
    }
    case "magoRabat": {
      const roll = Number(params.roll);
      if (!Number.isInteger(roll) || roll < 1 || roll > 6) fail("INVALID_D6", "Il D6 deve essere compreso tra 1 e 6.");
      const drawn = roll === 6 ? drawCards(player, 2) : [];
      state.lastAbility = { name: "Il Mago di Rabat", roll, outcome: drawn.length ? `Pescate ${drawn.length} carte` : "Nessun effetto" };
      break;
    }
    case "registaSacro": {
      const drawn = drawCards(player, 1);
      state.lastAbility = { name: "Regista Sacro", outcome: drawn.length ? "Peschi 1 carta" : "Mazzo esaurito: nessuna carta pescata" };
      break;
    }
    case "maestroSognatori": {
      if (!params.discardCardId || !player.hand.includes(params.discardCardId)) fail("DISCARD_CARD_REQUIRED", "Scegli una carta dalla mano da scartare.");
      drawCards(player, 1);
      if (!removeOne(player.hand, params.discardCardId)) fail("DISCARD_CARD_REQUIRED", "La carta scelta non è più nella tua mano.");
      player.discardPile.push(params.discardCardId);
      state.lastAbility = { name: "Maestro dei Sognatori", outcome: "Peschi 1 carta e ne scarti 1" };
      break;
    }
    case "ispirazioneRegale": {
      const target = targetAllyField(); buff(target, "attack", 2); buff(target, "technique", 1);
      state.lastAbility = { name: "Ispirazione Regale", outcome: `${target.name} ottiene +2 Attacco e +1 Tecnica fino alla fine del turno` };
      break;
    }
    case "auraProtettiva": {
      const target = targetAllyField(); buff(target, "defense", 2);
      state.lastAbility = { name: "Aura Protettiva", outcome: `${target.name} ottiene +2 Difesa fino alla fine del turno` };
      break;
    }
    case "muraFede": {
      buff(unit, "defense", 2);
      unit.timedModifiers ??= [];
      unit.timedModifiers.push({ stat: "defense", amount: 2, remainingOwnerTurns: 2, ownerId: player.id });
      state.lastAbility = { name: "Mura di Fede", outcome: `${unit.name} ottiene +2 Difesa per due turni` };
      break;
    }
    case "ritualeMacumbe": {
      const roll = Number(params.roll);
      if (!Number.isInteger(roll) || roll < 1 || roll > 6) fail("INVALID_D6", "Il D6 deve essere compreso tra 1 e 6.");
      const amount = roll >= 4 ? 2 : 1;
      const target = targetEnemy();
      const before = target.legendaryOverlay?.fatigue ?? target.fatigue;
      reduceFatigue(state, enemy, target, amount);
      state.lastAbility = { name: "Rituale delle Macumbe", roll, outcome: `${target.name} perde ${amount} Fatica${before > 0 && !enemy.field.some(u => u.instanceId === target.instanceId) ? " ed entra in Break Time" : ""}` };
      break;
    }
    case "prezzoAnima": {
      const target = targetEnemy();
      reduceFatigue(state, enemy, target, 1);
      const enteredBreak = !enemy.field.some(u => u.instanceId === target.instanceId);
      if (enteredBreak) drawCards(player, 1);
      state.lastAbility = { name: "Prezzo dell'Anima", outcome: enteredBreak ? "Il bersaglio entra in Break Time: peschi 1 carta" : "Il bersaglio perde 1 Fatica" };
      break;
    }
    case "maledizioneEterna": {
      const target = targetEnemy(); reduceFatigue(state, enemy, target, 5);
      state.lastAbility = { name: "Maledizione Eterna", outcome: `${target.name} perde fino a 5 Fatica` };
      break;
    }
    case "vorticeAbissi": {
      for (const target of [...enemy.field]) reduceFatigue(state, enemy, target, 1);
      state.lastAbility = { name: "Vortice degli Abissi", outcome: "Tutti i giocatori avversari perdono 1 Fatica" };
      break;
    }
    case "shotBonus":
      unit.shotTechniqueBonus = (unit.shotTechniqueBonus ?? 0) + rule.amount;
      state.lastAbility = { name: "Bonus al tiro", outcome: `${unit.name} ottiene +${rule.amount} Tecnica per il tiro successivo` };
      break;
    default: fail("ABILITY_EFFECT_UNSUPPORTED", "L'effetto di questa abilità non è ancora automatizzato.");
  }
}

export function getAbilityCost(state, playerId, cardId, abilityIndex) {
  const ability = state.cardCatalog?.[cardId]?.abilities?.[abilityIndex];
  if (!ability || !Number.isInteger(ability.costFatigue)) return null;
  const opponent = state.players?.find(player => player.id !== playerId);
  const papaNeroActive = opponent?.field?.some(unit => currentCardId(unit) === "PG09-L");
  return papaNeroActive ? Math.max(ability.costFatigue, Math.min(3, ability.costFatigue + 1)) : ability.costFatigue;
}

export function activateAbility(inputState, playerId, unitId, abilityIndex, params = {}) {
  const state = clone(inputState);
  state.lastAbility = null;
  const player = assertActivePlayer(state, playerId);
  const { unit } = findFieldUnit(player, unitId);
  const cardId = currentCardId(unit);
  const card = getCard(state, cardId);
  const ability = card.abilities?.[abilityIndex];
  const rule = getAbilityRule(cardId, abilityIndex);
  if (!ability || !rule) fail("ABILITY_NOT_CONFIGURED", `L'abilità selezionata di ${card.name} non è ancora automatizzata.`);
  if (!isNumber(ability.costFatigue) || ability.costFatigue < 0) fail("PASSIVE_ABILITY", "Questa è un'abilità passiva: si attiva automaticamente quando si verifica la condizione.");
  assertAbilityWindow(state, player, unit, rule);
  if (rule.oncePerTurn && unit.abilityUses?.[abilityIndex] === state.currentTurn) fail("ABILITY_ALREADY_USED", "Hai già usato questa abilità in questo turno.");
  if (rule.requiredShooter && params.selectedShooterId !== unitId) fail("ABILITY_REQUIRES_SELECTED_SHOOTER", "Seleziona questo giocatore come tiratore prima di attivare l'abilità.");
  const effectiveCost = getAbilityCost(state, playerId, cardId, abilityIndex);
  if (activeFatigue(unit) < effectiveCost) fail("INSUFFICIENT_FATIGUE", `Fatica insufficiente: servono ${effectiveCost}, ne hai ${activeFatigue(unit)}.`);
  applyAbilityEffect(state, player, unit, { ...rule, stat: rule.effect === "buffAlly" ? (cardId === "PG06-L" ? "multiple" : cardId === "PG07-C" ? "defense" : rule.stat) : rule.stat }, params);
  reduceFatigue(state, player, unit, effectiveCost);
  unit.abilityUses ??= {};
  unit.abilityUses[abilityIndex] = state.currentTurn;
  state.lastAbility = state.lastAbility ?? { name: ability.name, outcome: "Abilità attivata" };
  state.lastAbility = { ...state.lastAbility, sourceName: unit.name, cost: effectiveCost, baseCost: ability.costFatigue, cardId, turn: state.currentTurn };
  return state;
}

function applyShotPassives(state, attacker, defender, shooter, goalkeeper, goal) {
  const shooterCardId = currentCardId(shooter);
  const keeperCardId = currentCardId(goalkeeper);
  const events = state.lastShot.automaticEffects;
  const addDraw = (player, amount, label) => {
    const drawn = drawCards(player, amount);
    if (drawn.length) events.push(`${label}: pescata ${drawn.length} carta/e`);
  };
  if (shooterCardId === "PG10-C") {
    addDraw(attacker, 1, "Cannoniere Spietato");
    if (goal) addDraw(attacker, 1, "Finalizzatore Clinico");
  }
  if (shooterCardId === "PG10-L") {
    if (activeFatigue(shooter) >= 3) { reduceFatigue(state, attacker, shooter, 3); events.push("Cannoniere Spietato: costo 3 Fatica"); addDraw(attacker, 1, "Cannoniere Spietato"); }
    else events.push("Cannoniere Spietato non attivato: Fatica insufficiente (3 richiesti)");
    if (goal && activeFatigue(shooter) >= 2) { reduceFatigue(state, attacker, shooter, 2); events.push("Finalizzatore Clinico: costo 2 Fatica"); addDraw(attacker, 1, "Finalizzatore Clinico"); }
    else if (goal) events.push("Finalizzatore Clinico non attivato: Fatica insufficiente (2 richiesti)");
  }
  if (goal && ["PG08-C", "PG08-L"].includes(shooterCardId)) {
    if (shooterCardId === "PG08-L") recoverUnit(shooter, 1);
    addDraw(attacker, 1, shooterCardId === "PG08-C" ? "MVP della Domenica" : "MVP Naturale");
  }
  if (goal && shooterCardId === "PG06-L") {
    if (activeFatigue(shooter) >= 1) { reduceFatigue(state, attacker, shooter, 1); addDraw(attacker, 1, "Leggenda Vivente"); }
    else events.push("Leggenda Vivente non attivata: Fatica insufficiente (1 richiesta)");
  }
  if (goal && ["PG02-C", "PG02-L"].includes(keeperCardId)) {
    if (activeFatigue(goalkeeper) >= 1) { reduceFatigue(state, defender, goalkeeper, 1); addDraw(defender, 1, "Cuore Invictus"); }
    else events.push("Cuore Invictus non attivato: Fatica insufficiente (1 richiesta)");
  }
  if (!goal && keeperCardId === "PG02-C") {
    recoverUnit(goalkeeper, 2);
    events.push("Mani di Fiducia: il portiere recupera 2 Fatica");
  }
}

export function resolveShowdown(inputState, attackingPlayerId) {
  const state = clone(inputState);
  const attacker = assertActivePlayer(state, attackingPlayerId);
  if (attacker.turnFlags.showdownResolved) fail("SHOWDOWN_ALREADY_RESOLVED", "Lo Showdown è già stato risolto in questo turno.");
  const defender = state.players.find((player) => player.id !== attackingPlayerId);
  const attackTotal = attacker.field.reduce((sum, unit) => sum + getActiveStats(unit).attack, attacker.teamModifiers.attack);
  const defenseTotal = defender.field.reduce((sum, unit) => sum + getActiveStats(unit).defense, defender.teamModifiers.defense);
  // Dominio Assoluto: con San Lolli Leggendario in campo, ogni alleato aggiunge +1 Attacco.
  const lolliDominion = attacker.field.some(unit => currentCardId(unit) === "PG06-L");
  const passiveAttackBonus = lolliDominion ? attacker.field.length : 0;
  const finalAttackTotal = attackTotal + passiveAttackBonus;
  const difference = finalAttackTotal - defenseTotal;
  const bonus = Math.floor(Math.abs(difference) / 2);
  defender.nextShowdownBonus = bonus;
  attacker.turnFlags.showdownResolved = true;
  state.lastShowdown = {
    turn: state.currentTurn, attackerId: attacker.id, defenderId: defender.id,
    attackTotal: finalAttackTotal, baseAttackTotal: attackTotal, passiveAttackBonus,
    attackerTeamModifier: attacker.teamModifiers.attack, defenderTeamModifier: defender.teamModifiers.defense,
    defenseTotal, difference, defenderBonus: bonus,
    winnerId: difference > 0 ? attacker.id : difference < 0 ? defender.id : null,
    attackerUnits: attacker.field.map(unit => ({ instanceId: unit.instanceId, name: unit.name, role: unit.role, attack: getActiveStats(unit).attack })),
    defenderUnits: defender.field.map(unit => ({ instanceId: unit.instanceId, name: unit.name, role: unit.role, defense: getActiveStats(unit).defense })),
  };
  return state;
}

export function resolveShot(inputState, { attackingPlayerId, shooterUnitId, shotRoll, goalkeeperRoll, emergencyGoalkeeperUnitId = null }) {
  const state = clone(inputState);
  const attacker = assertActivePlayer(state, attackingPlayerId);
  if (!attacker.turnFlags.showdownResolved) fail("SHOWDOWN_REQUIRED", "Prima del tiro deve essere risolto lo Showdown.");
  if (attacker.turnFlags.shotResolved) fail("SHOT_ALREADY_RESOLVED", "È già stato effettuato un tiro in questo turno.");
  for (const [name, roll] of [["shotRoll", shotRoll], ["goalkeeperRoll", goalkeeperRoll]]) {
    if (!Number.isInteger(roll) || roll < RULES.d20Min || roll > RULES.d20Max) fail("INVALID_D20", `${name} deve essere un risultato D20 tra 1 e 20.`);
  }
  const shooter = attacker.field.find((unit) => unit.instanceId === shooterUnitId);
  if (!shooter) fail("SHOOTER_NOT_IN_FIELD", "Il tiratore scelto non è in campo.");
  const defender = state.players.find((player) => player.id !== attackingPlayerId);
  let goalkeeper = defender.field.find((unit) => unit.role === "goalkeeper");
  let emergencyGoalkeeper = false;
  if (!goalkeeper) {
    emergencyGoalkeeper = true;
    goalkeeper = emergencyGoalkeeperUnitId ? defender.field.find((unit) => unit.instanceId === emergencyGoalkeeperUnitId) : defender.field[0];
    if (emergencyGoalkeeperUnitId && !goalkeeper) fail("EMERGENCY_GOALKEEPER_NOT_IN_FIELD", "Il portiere di emergenza scelto non è in campo.");
  }
  if (!goalkeeper) fail("NO_EMERGENCY_GOALKEEPER", "Non è disponibile alcun giocatore per occupare il ruolo di portiere.");
  const shooterStats = getActiveStats(shooter);
  const parry = emergencyGoalkeeper ? RULES.emergencyGoalkeeperParry : getActiveStats(goalkeeper).parry;
  if (!isNumber(parry)) fail("GOALKEEPER_PARRY_MISSING", "Manca la statistica Parata del portiere.");
  const usedShowdownBonus = attacker.nextShowdownBonus ?? 0;
  const usedTacticBonus = attacker.nextShotTechniqueBonus ?? 0;
  const usedUnitBonus = shooter.shotTechniqueBonus ?? 0;
  const opponentShotPenalty = defender.field.some(unit => currentCardId(unit) === "PG06-L") ? 1 : 0;
  const shotTotal = shotRoll + shooterStats.technique + usedShowdownBonus + usedTacticBonus + usedUnitBonus - opponentShotPenalty;
  const saveTotal = goalkeeperRoll + parry;
  const goal = shotTotal > saveTotal;
  if (goal) attacker.goals += 1;
  attacker.nextShowdownBonus = 0;
  attacker.nextShotTechniqueBonus = 0;
  shooter.shotTechniqueBonus = 0;
  attacker.turnFlags.shotResolved = true;
  state.lastShot = {
    turn: state.currentTurn, attackerId: attacker.id, defenderId: defender.id,
    shooterUnitId, goalkeeperUnitId: goalkeeper.instanceId, emergencyGoalkeeper,
    shotRoll, technique: shooterStats.technique, showdownBonus: usedShowdownBonus, tacticBonus: usedTacticBonus, abilityBonus: usedUnitBonus, opponentPenalty: opponentShotPenalty, shotTotal,
    goalkeeperRoll, parry, saveTotal, result: goal ? "goal" : "saved", automaticEffects: [],
  };
  applyShotPassives(state, attacker, defender, shooter, goalkeeper, goal);
  return state;
}

export function endPlayerTurn(inputState, playerId) {
  const state = clone(inputState);
  const current = assertActivePlayer(state, playerId);
  current.teamModifiers = { attack: 0, defense: 0 };
  for (const unit of current.field) {
    unit.timedModifiers = (unit.timedModifiers ?? []).map(mod => ({ ...mod, remainingOwnerTurns: mod.ownerId === playerId ? mod.remainingOwnerTurns - 1 : mod.remainingOwnerTurns })).filter(mod => mod.remainingOwnerTurns > 0);
    unit.modifiers = timedModifierTotals(unit);
  }
  // I tre turni di Break Time sono tre turni completi trascorsi fuori dal campo.
  tickBreakTimeAtTurnEnd(state, state.currentTurn);
  if (state.currentTurn >= RULES.totalTurns) {
    state.status = "finished";
    const [a, b] = state.players;
    state.result = a.goals === b.goals ? "draw" : "win";
    state.winnerId = a.goals === b.goals ? null : (a.goals > b.goals ? a.id : b.id);
    return state;
  }
  state.currentTurn += 1;
  state.activePlayerId = state.players.find((player) => player.id !== playerId).id;
  applyTurnUpkeep(state);
  return state;
}

export function getPublicState(state, viewerPlayerId) {
  if (!state.players.some((player) => player.id === viewerPlayerId)) fail("PLAYER_NOT_FOUND", "Visualizzatore non presente nella partita.");
  return {
    schemaVersion: state.schemaVersion,
    status: state.status,
    currentTurn: state.currentTurn,
    activePlayerId: state.activePlayerId,
    activeEvent: state.activeEvent ? { id: state.activeEvent.id, name: state.activeEvent.name, sourceEffectText: state.activeEvent.sourceEffectText ?? state.activeEvent.effect ?? null } : null,
    players: state.players.map((player) => ({
      id: player.id, name: player.name, goals: player.goals,
      field: clone(player.field),
      bench: player.bench.map((unit) => ({ instanceId: unit.instanceId, cardId: unit.cardId, role: unit.role, fatigue: unit.fatigue, maxFatigue: unit.maxFatigue })),
      breakTimeCount: player.breakTime.length,
      breakTime: player.breakTime.map((entry) => ({
        instanceId: entry.unit.instanceId,
        cardId: entry.unit.cardId,
        name: entry.unit.name,
        role: entry.unit.role,
        turnsRemaining: entry.turnsRemaining,
        readyToReturn: entry.readyToReturn,
      })),
      handCount: player.hand.length,
      deckCount: player.deck.length,
      substitutionsRemaining: player.substitutionsRemaining,
      nextShowdownBonus: player.nextShowdownBonus,
      hand: player.id === viewerPlayerId ? [...player.hand] : undefined,
    })),
    result: state.result,
    winnerId: state.winnerId,
  };
}
