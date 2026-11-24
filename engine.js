/**
 * Saints of Sant'Anna - Motore di gioco basato sul Regolamento Ufficiale v1.0.
 * Modulo puro, separato dalla UI. Non gestisce rete, account o storage.
 * I risultati D20 sono forniti dal server/chiamante per rendere le mosse verificabili.
 */

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
  for (const unit of active.field) unit.modifiers = { attack: 0, defense: 0, technique: 0, parry: 0 };
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
      player.nextShowdownBonus += effect.amount;
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
  removeOne(player.hand, tacticCardId);
  player.discardPile.push(tacticCardId);
  return state;
}

export function activateAbility(inputState, playerId, unitId) {
  const state = clone(inputState);
  const player = assertActivePlayer(state, playerId);
  const { unit } = findFieldUnit(player, unitId);
  const card = getCard(state, unit.legendaryOverlay?.cardId ?? unit.cardId);
  const ability = card.ability;
  if (!ability || !isNumber(ability.costFatigue) || ability.costFatigue < 0) fail("ABILITY_NOT_CONFIGURED", `L'abilità di ${card.name} non è definita con costo Fatica.`);
  if (activeFatigue(unit) < ability.costFatigue) fail("INSUFFICIENT_FATIGUE", "Fatica insufficiente per attivare l'abilità.");
  applyStructuredEffect(state, player, ability.effect);
  reduceFatigue(state, player, unit, ability.costFatigue);
  return state;
}

export function resolveShowdown(inputState, attackingPlayerId) {
  const state = clone(inputState);
  const attacker = assertActivePlayer(state, attackingPlayerId);
  if (attacker.turnFlags.showdownResolved) fail("SHOWDOWN_ALREADY_RESOLVED", "Lo Showdown è già stato risolto in questo turno.");
  const defender = state.players.find((player) => player.id !== attackingPlayerId);
  const attackTotal = attacker.field.reduce((sum, unit) => sum + getActiveStats(unit).attack, attacker.teamModifiers.attack);
  const defenseTotal = defender.field.reduce((sum, unit) => sum + getActiveStats(unit).defense, defender.teamModifiers.defense);
  const difference = attackTotal - defenseTotal;
  const bonus = Math.floor(Math.abs(difference) / 2);
  defender.nextShowdownBonus = bonus;
  attacker.turnFlags.showdownResolved = true;
  state.lastShowdown = { turn: state.currentTurn, attackerId: attacker.id, defenderId: defender.id, attackTotal, defenseTotal, difference, defenderBonus: bonus };
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
  const usedBonus = attacker.nextShowdownBonus;
  const shotTotal = shotRoll + shooterStats.technique + usedBonus;
  const saveTotal = goalkeeperRoll + parry;
  const goal = shotTotal > saveTotal;
  if (goal) attacker.goals += 1;
  attacker.nextShowdownBonus = 0;
  attacker.turnFlags.shotResolved = true;
  state.lastShot = {
    turn: state.currentTurn, attackerId: attacker.id, defenderId: defender.id,
    shooterUnitId, goalkeeperUnitId: goalkeeper.instanceId, emergencyGoalkeeper,
    shotRoll, technique: shooterStats.technique, showdownBonus: usedBonus, shotTotal,
    goalkeeperRoll, parry, saveTotal, result: goal ? "goal" : "saved",
  };
  return state;
}

export function endPlayerTurn(inputState, playerId) {
  const state = clone(inputState);
  const current = assertActivePlayer(state, playerId);
  current.teamModifiers = { attack: 0, defense: 0 };
  for (const unit of current.field) unit.modifiers = { attack: 0, defense: 0, technique: 0, parry: 0 };
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
