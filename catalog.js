import catalog from "./catalog-data.js";

export const CATALOG = catalog;
export const CARDS = catalog.cards;
export const CARD_BY_ID = Object.fromEntries(CARDS.map(card => [card.id, card]));
export const PLAYER_CARDS = CARDS.filter(card => card.type === "player");
export const TACTIC_CARDS = CARDS.filter(card => card.type === "tactic");
export const EVENT_CARDS = CARDS.filter(card => card.type === "event");

/**
 * Adattatore esplicito tra il catalogo descrittivo dei PDF e il motore.
 * Le statistiche non stampate non vengono mostrate come dati di carta.
 * Per i portieri, technique=0 è un valore tecnico neutro interno: la carta usa Parata.
 */
export function buildEngineCatalog() {
  return CARDS.filter(card => card.type !== "player" || card.enginePlayable).map(card => {
    if (card.type === "player") {
      return {
        id: card.id,
        name: card.name,
        type: "player",
        rarity: card.rarity,
        role: card.role,
        baseCardId: card.baseCardId ?? null,
        stats: {
          attack: card.stats.Attacco,
          defense: card.stats.Difesa,
          technique: card.stats.Tecnica ?? 0,
          fatigue: card.stats.Fatica,
          ...(card.stats.Parata !== undefined ? { parry: card.stats.Parata } : {})
        },
        abilities: card.abilities,
        sourceEffectText: card.abilities.map(a => `${a.name}: ${a.text}`).join(" | ")
      };
    }
    return {
      id: card.id,
      name: card.name,
      type: card.type,
      rarity: card.rarity ?? "common",
      effectData: card.effectData ?? null,
      sourceEffectText: card.effect ?? null,
      motto: card.motto ?? null
    };
  });
}

export function commonCardForRole(role) {
  return PLAYER_CARDS.find(card => card.version === "Comune" && card.role === role && card.enginePlayable);
}

export function getCard(id) {
  return CARD_BY_ID[id] ?? null;
}

export function canAutomateTactic(card) {
  return Boolean(card?.type === "tactic" && card.effectData);
}
