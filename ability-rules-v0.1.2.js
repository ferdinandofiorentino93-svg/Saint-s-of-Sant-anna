/**
 * Abilità strutturate per la build locale 0.1.2.
 * I testi originali restano nel catalogo; qui vengono formalizzate solo le azioni
 * il cui effetto è sufficientemente esplicito nel catalogo ufficiale.
 */
export const ABILITY_RULES = Object.freeze({
  'PG03-C:1': { timing: 'ownTurn', effect: 'recoverAlly', target: 'ally', amount: 1 },
  'PG04-C:0': { timing: 'afterShowdownLoss', effect: 'protesta', die: 20, oncePerTurn: true },
  'PG04-C:1': { timing: 'afterShowdownWin', effect: 'flageCommon', requiresShowdownParticipation: true, choice: [
    { value: 'buff', label: '+3 Tecnica a un tuo giocatore' },
    { value: 'recoverTeam', label: '+2 Fatica a tutti gli altri tuoi giocatori' }
  ] },
  'PG04-L:0': { timing: 'afterShowdownWin', effect: 'flageLegendary', requiresShowdownParticipation: true, choice: [
    { value: 'recover', label: 'Un tuo giocatore recupera 2 Fatica' },
    { value: 'draw', label: 'Pesca 1 Carta Tattica' },
    { value: 'buff', label: '+2 Tecnica a un tuo giocatore' }
  ] },
  'PG05-C:1': { timing: 'afterTactic', effect: 'manoFortunata', die: 6, oncePerTurn: true },
  'PG05-L:0': { timing: 'ownTurn', effect: 'ruotaDestino', die: 6, choice: [
    { value: 'shot', label: '+2 Tecnica al tuo prossimo tiro' },
    { value: 'draw', label: 'Pesca 1 carta' }
  ], notice: 'La scelta di annullare una carta avversaria non è ancora gestita dal prototipo.', oncePerTurn: true },
  'PG05-L:2': { timing: 'afterTactic', effect: 'magoRabat', die: 6, oncePerTurn: true },
  'PG06-C:0': { timing: 'afterTactic', effect: 'registaSacro' },
  'PG03-L:0': { timing: 'preShowdown', effect: 'millenaria', die: 20, multiTarget: true, maxTargets: 3, oncePerTurn: true },
  'PG03-L:1': { timing: 'afterTactic', effect: 'maestroSognatori', discard: true },
  'PG06-L:1': { timing: 'preShowdown', effect: 'ispirazioneRegale', target: 'allyField', oncePerTurn: true },
  'PG07-C:2': { timing: 'preShowdown', effect: 'auraProtettiva', target: 'allyField', oncePerTurn: true },
  'PG02-L:0': { timing: 'ownTurn', effect: 'muraFede', oncePerTurn: false },
  'PG09-C:1': { timing: 'ownTurn', effect: 'ritualeMacumbe', target: 'enemy', die: 6, oncePerTurn: true },
  'PG09-L:1': { timing: 'ownTurn', effect: 'prezzoAnima', target: 'enemy', oncePerTurn: true },
  'PG08-C:0': { timing: 'afterShowdownWin', effect: 'shotBonus', amount: 3, minDifference: 5, requiredShooter: true, requiresShowdownParticipation: true, oncePerTurn: true },
  'PG08-L:0': { timing: 'beforeShot', effect: 'shotBonus', amount: 3, requiredShooter: true, oncePerTurn: true },
  'PG08-L:1': { timing: 'afterShowdownWin', effect: 'shotBonus', amount: 5, minDifference: 6, requiredShooter: true, requiresShowdownParticipation: true, oncePerTurn: true },
  'PG01-L:0': { timing: 'preShowdown', effect: 'maledizioneEterna', target: 'enemy', amount: 5 },
  'PG01-L:2': { timing: 'preShowdown', effect: 'vorticeAbissi', amount: 1 }
});

export function getAbilityRule(cardId, abilityIndex) {
  return ABILITY_RULES[`${cardId}:${abilityIndex}`] ?? null;
}

export function abilityWindowLabel(rule) {
  if (!rule) return 'Effetto non ancora automatizzato';
  return ({
    ownTurn: 'Attivabile durante il tuo turno',
    preShowdown: 'Prima dello Showdown',
    afterShowdownWin: 'Dopo aver vinto lo Showdown',
    afterShowdownLoss: 'Dopo aver perso lo Showdown',
    afterTactic: 'Dopo aver giocato una Tattica',
    beforeShot: 'Prima del tiro in porta',
    afterShot: 'Dopo il tiro in porta'
  })[rule.timing] ?? 'Attivabile nel proprio turno';
}
