import catalog from './catalog-data-v0.2.1.js';

export const CARDS = catalog.cards;
export const CARD_BY_ID = Object.fromEntries(CARDS.map(card => [card.id, card]));
export const EVENT_CARDS = CARDS.filter(card => card.type === 'event');
export const TACTIC_CARDS = CARDS.filter(card => card.type === 'tactic');
export const PLAYER_CARDS = CARDS.filter(card => card.type === 'player' && card.enginePlayable && card.role && card.version === 'Comune');
export const ROLES = [
  { id: 'goalkeeper', label: 'Portiere', short: 'POR' },
  { id: 'defender', label: 'Difensore', short: 'DIF' },
  { id: 'midfielder', label: 'Centrocampista', short: 'CEN' },
  { id: 'attacker', label: 'Attaccante', short: 'ATT' },
];
export const RULES = Object.freeze({ turns: 9, openingHand: 4, drawPerOwnTurn: 1, actionPoints: 3, maxActiveAbilities: 2, rankUpCost: 2, eventTurns: [3, 5, 7, 9], breakDownTurns: 3, maxBench: 5 });

const clone = value => structuredClone(value);
const shuffle = list => { const a = [...list]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
const activeCard = unit => CARD_BY_ID[unit.cardId];
export function isAutomaticAbility(cardId, index, ability) {
  return ability?.costFatigue===null || String(ability?.kind||'').toLowerCase().includes('passiva') || (cardId==='PG04-L'&&index===2);
}
const isLegendary = unit => activeCard(unit)?.version === 'Leggendaria';
const statOf = (unit, stat) => {
  const keys = { attack: 'Attacco', defense: 'Difesa', technique: 'Tecnica', parry: 'Parata' };
  return (activeCard(unit)?.stats?.[keys[stat]] ?? 0) + (unit.modifiers?.[stat] ?? 0) + (unit.debuffs?.[stat] ?? 0);
};
const fatigueOf = unit => unit.fatigue;
const addLog = (state, text, kind='info') => { state.log.unshift({ id: `${Date.now()}-${Math.random()}`, text, kind }); state.log = state.log.slice(0, 30); };
const playerOf = (state, id) => state.players.find(p => p.id === id);
const otherId = (state, id) => state.players.find(p => p.id !== id).id;
const unitById = (player, id) => Object.values(player.field).find(u => u?.instanceId === id) || player.bench.find(u => u.instanceId === id) || player.breakDown.find(b => b.unit.instanceId === id)?.unit;
const fieldUnits = player => Object.values(player.field).filter(Boolean);
const makeUnit = (card, ownerId, slot) => ({
  instanceId: `${ownerId}-${card.id}-${slot}`,
  baseCardId: card.id,
  cardId: card.id,
  name: card.name,
  role: card.role,
  fatigue: card.stats.Fatica,
  maxFatigue: card.stats.Fatica,
  commonFatigue: card.stats.Fatica,
  modifiers: { attack: 0, defense: 0, technique: 0, parry: 0 },
  debuffs: { attack: 0, defense: 0, technique: 0, parry: 0 },
  modifierExpiry: {},
  abilityUses: {},
  passiveUses: {},
  oncePerGame: {},
  flags: {},
});
const makeDeck = (lineup, selectedLegendaries=[]) => {
  const starters = new Set(Object.values(lineup));
  const remainingCommons = PLAYER_CARDS.filter(c => !starters.has(c.id)).map(c => c.id);
  const tactics = TACTIC_CARDS.map(c => c.id);
  const validLegendaries = selectedLegendaries.filter(id => {
    const card = CARD_BY_ID[id]; return card?.type === 'player' && card.version === 'Leggendaria' && starters.has(card.baseCardId);
  }).slice(0, 3);
  return shuffle([...remainingCommons, ...tactics, ...validLegendaries]);
};
const draw = (player, count=1, filterFn=()=>true) => {
  const taken=[];
  for(let i=0;i<count;i++){
    const idx=player.deck.findIndex(id=>filterFn(CARD_BY_ID[id]));
    if(idx<0) break;
    const [id]=player.deck.splice(idx,1); player.hand.push(id); taken.push(id);
  }
  return taken;
};
const findUnitInField = (player, id) => Object.values(player.field).find(u=>u?.instanceId===id);
const clampFatigue = unit => { unit.fatigue = Math.max(0, Math.min(unit.maxFatigue, unit.fatigue)); };

export function getLineupChoices() {
  return Object.fromEntries(ROLES.map(role => [role.id, PLAYER_CARDS.filter(c=>c.role===role.id)]));
}

function createPlayer(id, name, lineup, legendaries=[]) {
  const selected = ROLES.map(r=>lineup[r.id]);
  const cards = selected.map(id=>CARD_BY_ID[id]);
  if (cards.some((card,i)=>!card || card.type!=='player' || card.version!=='Comune' || card.role!==ROLES[i].id)) throw new Error('La formazione deve contenere un Comune valido per ogni ruolo.');
  if(new Set(selected).size!==4) throw new Error('Scegli quattro giocatori diversi.');
  const field = Object.fromEntries(ROLES.map((role,i)=>[role.id, makeUnit(cards[i],id,i+1)]));
  const player = { id, name, lineup: {...lineup}, field, bench:[], breakDown:[], deck:makeDeck(lineup,legendaries), hand:[], discard:[], goals:0, nextShowdownBonus:0, substitutions:3, modifiers:{attack:0,defense:0,technique:0}, flags:{}, turnActions:0, abilityUsesThisTurn:0, actionPoints:3 };
  const initial = draw(player,RULES.openingHand);
  return { player, initial };
}

function baseCPUSetup() {
  return {
    goalkeeper:'PG02-C', defender:'PG07-C', midfielder:'PG05-C', attacker:'PG08-C'
  };
}

export function createMatch({ lineup, legendaries=[], cpuLineup=baseCPUSetup(), cpuLegendaries=['PG02-L','PG07-L','PG08-L'], startingPlayerId='human' }) {
  const a=createPlayer('human','La tua squadra',lineup,legendaries);
  const b=createPlayer('cpu','Computer',cpuLineup,cpuLegendaries);
  const state={
    version:'0.2.1', status:'active', turn:1, totalTurns:RULES.turns,
    players:[a.player,b.player],
    attackerId:startingPlayerId,
    defenderId:startingPlayerId==='human'?'cpu':'human',
    actorId:startingPlayerId,
    phase:'actions', waitingFor:'attacker', pendingAction:null,
    ap:{ human:3,cpu:3 }, abilityCounts:{human:0,cpu:0},
    eventDeck:shuffle(EVENT_CARDS.map(c=>c.id)), eventDiscard:[], activeEvent:null,
    eventFlags:{}, showdown:null, shot:null, nextAttackBonus:{human:0,cpu:0},
    log:[], lastAction:null, setupDraws:{human:a.initial,cpu:b.initial},
    lastTurnWinner:null, extraTurn:false,
  };
  addLog(state,`Formazioni completate. Entrambe le squadre pescano 4 carte.`,'success');
  addLog(state,`${playerOf(state,'human').name}: ${a.initial.length} carte iniziali. ${playerOf(state,'cpu').name}: ${b.initial.length} carte iniziali.`);
  for(const p of state.players) for(const u of fieldUnits(p)) passiveOnUnitEnter(state,p,u);
  startTurnMaintenance(state,1);
  return state;
}

function currentTurnActivePlayer(state) { return state.attackerId; }
function allPlayers(state) { return state.players; }

function eventEffect(state, card) {
  state.eventFlags = {};
  if(!card) return;
  switch(card.id){
    case 'EV01': state.eventFlags.techniquePenalty = 2; break;
    case 'EV02': state.eventFlags.extraAbilityFatigue = 1; break;
    case 'EV03': state.eventFlags.trailingAttackBonus = 2; break;
    case 'EV04': state.eventFlags.blockOffensiveTactics = true; break;
    case 'EV05': state.eventFlags.blockCostThree = true; break;
    case 'EV06': state.extraTurn = true; break;
    case 'EV08': state.eventFlags.freeLegendaryFatigue = true; break;
    case 'EV10': state.eventFlags.blockEnemyTargets = true; break;
  }
  if(card.id==='EV09'){
    for(const p of state.players) for(const u of [...fieldUnits(p),...p.bench]) recoverFatigue(state,p,u,1,'Evento Staff Medico');
  }
  if(card.id==='EV07'){
    for(const p of state.players){
      for(const unit of fieldUnits(p)){
        const upgrade=CARD_BY_ID[`${unit.baseCardId.replace('-C','-L')}`];
        if(upgrade && p.deck.includes(upgrade.id)){
          p.deck.splice(p.deck.indexOf(upgrade.id),1); p.hand.push(upgrade.id);
        }
      }
    }
  }
}

function revealEvent(state) {
  if(!RULES.eventTurns.includes(state.turn)) return;
  state.extraTurn=false;
  if(state.activeEvent) state.eventDiscard.push(state.activeEvent.id);
  const id=state.eventDeck.shift();
  state.activeEvent=id?CARD_BY_ID[id]:null;
  eventEffect(state,state.activeEvent);
  if(state.activeEvent) addLog(state,`EVENTO · ${state.activeEvent.name}: ${state.activeEvent.effect}`,'event');
}

function passiveOnUnitEnter(state, player, unit) {
  if(activeCard(unit)?.id==='PG06-L') addLog(state,'PASSIVA · Dominio Assoluto: tutti gli alleati ricevono +1 Attacco; gli avversari −1 al tiro.','passive');
  if(activeCard(unit)?.id==='PG09-L') addLog(state,'PASSIVA · Macumba Eterna: Manuel non perde Fatica durante il mantenimento.','passive');
  if(activeCard(unit)?.id==='PG09-C' && !unit.flags.curseTarget){
    const enemy=playerOf(state,otherId(state,player.id));
    const target=fieldUnits(enemy).find(u=>u.role==='attacker') || fieldUnits(enemy)[0];
    if(target){ target.debuffs.attack-=1; target.debuffs.defense-=1; target.debuffs.technique-=1; unit.flags.curseTarget=target.instanceId; addLog(state,`Passiva · Maledizione del Risparmio: ${target.name} subisce −1 Attacco, −1 Difesa e −1 Tecnica finché Manuel resta in campo.`,'passive'); }
  }
}

function cleanModifiers(state) {
  for(const p of state.players) for(const u of fieldUnits(p)){
    for(const [key,expires] of Object.entries(u.modifierExpiry)) if(expires<=state.turn){
      const [stat,source]=key.split(':'); if(source==='turn') u.modifiers[stat]=0;
      delete u.modifierExpiry[key];
    }
  }
}

function fatigueResistance(unit, amount, source, state, player) {
  if(source!=='enemy-effect') return amount;
  const card=activeCard(unit);
  if(card?.id==='PG07-C' && !unit.passiveUses.resistenzaTurn?.includes(state.turn)){
    unit.passiveUses.resistenzaTurn=[...(unit.passiveUses.resistenzaTurn||[]),state.turn];
    return Math.max(0,amount-1);
  }
  if(card?.id==='PG07-L' && !unit.passiveUses.volontaTurn?.includes(state.turn)){
    unit.passiveUses.volontaTurn=[...(unit.passiveUses.volontaTurn||[]),state.turn];
    return Math.max(0,amount-1);
  }
  return amount;
}

function removePassiveOnExit(state, player, unit) {
  // La Maledizione del Risparmio dura soltanto finché Manuel Zulfio resta in campo.
  if(unit?.flags?.curseTarget){
    const enemy=playerOf(state,otherId(state,player.id));
    const target=unitById(enemy,unit.flags.curseTarget);
    if(target){
      target.debuffs.attack+=1;target.debuffs.defense+=1;target.debuffs.technique+=1;
      addLog(state,`PASSIVA · Maledizione del Risparmio termina: ${target.name} recupera le statistiche.`,'passive');
    }
    delete unit.flags.curseTarget;
  }
}

function sendToBreakDown(state, player, unit, source='ability') {
  const slot=unit.role;
  if(player.flags.cuoreFerro){player.flags.cuoreFerro=false;unit.fatigue=1;addLog(state,`TATTICA · Cuore di Ferro: ${unit.name} resta in campo con 1 Fatica.`, 'action');return;}
  // Passive "Fede Nera" is checked automatically when Manuel Zulfio would leave the field.
  if(activeCard(unit)?.id==='PG09-C'){
    const roll=rollDie(20);
    if(roll>=11){ unit.fatigue=1; addLog(state,`Passiva · Fede Nera: D20 ${roll}. Manuel Zulfio resta in campo con 1 Fatica.`,'passive'); return; }
    addLog(state,`Passiva · Fede Nera: D20 ${roll}. Manuel entra in Break Down.`,'passive');
  }
  if(activeCard(unit)?.id==='PG09-L' && !unit.oncePerGame.fedeAssoluta){
    const roll=rollDie(20); unit.oncePerGame.fedeAssoluta=true;
    if(roll>=11){ unit.fatigue=roll===20?2:1; if(roll===20) draw(player,1); addLog(state,`Passiva · Fede Assoluta: D20 ${roll}. Manuel resta in campo con ${unit.fatigue} Fatica${roll===20?' e pesca 1 carta':''}.`,'passive'); return; }
    addLog(state,`Passiva · Fede Assoluta: D20 ${roll}. Manuel entra in Break Down.`,'passive');
  }
  removePassiveOnExit(state,player,unit);
  player.field[slot]=null;
  const fullTurns=source==='maintenance'?RULES.breakDownTurns:RULES.breakDownTurns+1;
  player.breakDown.push({unit,turnsRemaining:RULES.breakDownTurns,enteredTurn:state.turn,returnOnTurn:state.turn+fullTurns});
  addLog(state,`${unit.name} raggiunge 0 Fatica ed entra in BREAK DOWN per 3 turni.`,'warning');
}

function reduceFatigue(state, player, unit, amount, source='maintenance') {
  if(!unit || amount<=0) return;
  const before=unit.fatigue;
  let actual=amount;
  if(source==='enemy-effect') actual=fatigueResistance(unit,amount,source,state,player);
  if(source==='maintenance' && activeCard(unit)?.id==='PG09-L') return;
  unit.fatigue=Math.max(0,unit.fatigue-actual);
  if(unit.fatigue!==before) addLog(state,`${unit.name}: Fatica ${before} → ${unit.fatigue}.`,'fatigue');
  if(unit.fatigue===0) sendToBreakDown(state,player,unit,source);
}

function recoverFatigue(state, player, unit, amount, source='recupero') {
  if(!unit) return;
  const before=unit.fatigue; unit.fatigue=Math.min(unit.maxFatigue,unit.fatigue+amount);
  if(unit.fatigue>before) addLog(state,`${source}: ${unit.name} recupera ${unit.fatigue-before} Fatica.`,'passive');
}

function onOpponentAbilityActivated(state, actorId) {
  const defender=playerOf(state,otherId(state,actorId));
  for(const unit of fieldUnits(defender)){
    const id=activeCard(unit)?.id;
    if(id==='PG07-C') { unit.modifiers.defense+=1; unit.modifierExpiry[`defense:turn`]=state.turn+1; addLog(state,`Passiva · Baluardo dell’Aura: San Mauri ottiene +1 Difesa.`,'passive'); }
    if(id==='PG07-L' && !unit.passiveUses.auraInvincibile?.includes(state.turn)){
      unit.passiveUses.auraInvincibile=[...(unit.passiveUses.auraInvincibile||[]),state.turn];
      unit.modifiers.defense+=2; unit.modifierExpiry[`defense:turn`]=state.turn+1; addLog(state,`Passiva · Aura Invincibile: San Mauri ottiene +2 Difesa.`,'passive');
    }
  }
}

function getAbilityCost(state, player, unit, ability) {
  let cost=Number(ability.costFatigue??0);
  if(state.eventFlags.extraAbilityFatigue) cost=Math.min(3,cost+state.eventFlags.extraAbilityFatigue);
  if(state.players.some(p=>p.id!==player.id&&fieldUnits(p).some(u=>activeCard(u)?.id==='PG09-L'))) cost=Math.min(3,cost+1);
  if(state.eventFlags.freeLegendaryFatigue && isLegendary(unit)) cost=0;
  return cost;
}

function drawTactics(player,count) { return draw(player,count,c=>c?.type==='tactic'); }

function supportedAbility(cardId,index) {
  return ({
    'PG02-L':[0], 'PG03-C':[1], 'PG03-L':[0,1], 'PG04-C':[0,1], 'PG04-L':[0],
    'PG05-C':[1], 'PG05-L':[0,2], 'PG06-C':[0], 'PG06-L':[1], 'PG07-C':[2],
    'PG07-L':[1,2], 'PG08-C':[0], 'PG08-L':[0,1], 'PG09-C':[1,3], 'PG09-L':[1]
  }[cardId]||[]).includes(index);
}

function applyAbility(state, player, unit, index, options={}) {
  const card=activeCard(unit), ability=card.abilities[index], targetPlayer=playerOf(state,otherId(state,player.id));
  const own=fieldUnits(player), enemy=fieldUnits(targetPlayer);
  const chooseOwn=()=>findUnitInField(player,options.targetId)||own[0];
  const chooseEnemy=()=>findUnitInField(targetPlayer,options.targetId)||enemy[0];
  const drawAny=(n=1)=>draw(player,n);
  const buff=(target,stat,amount)=>{target.modifiers[stat]=(target.modifiers[stat]||0)+amount;target.modifierExpiry[`${stat}:turn`]=state.turn+1;};
  let summary='';
  switch(`${card.id}:${index}`){
    case 'PG02-L:0': buff(unit,'defense',2); unit.modifierExpiry['defense:turn']=state.turn+2; summary='San Nicolò ottiene +2 Difesa per due turni.'; break;
    case 'PG03-C:1': { const t=chooseOwn(); recoverFatigue(state,player,t,1,'Non Smettere Mai'); summary=`${t.name} recupera 1 Fatica.`; break; }
    case 'PG03-L:0': { const roll=rollDie(20); if(roll>=11){const ids=options.targets?.length?options.targets.slice(0,3):[unit.instanceId];for(const id of ids){const t=findUnitInField(player,id);if(t){buff(t,'attack',1);buff(t,'technique',1);}}summary=`D20 ${roll}: bonus applicato a ${ids.length} giocatori.`;}else summary=`D20 ${roll}: nessun effetto.`; break; }
    case 'PG03-L:1': { const drawn=draw(player,1); const discardId=options.discardId; if(discardId&&player.hand.includes(discardId)){player.hand.splice(player.hand.indexOf(discardId),1);player.discard.push(discardId);} summary=`Pescata ${drawn.length} carta; ${discardId?'una carta scartata':'nessuna carta scartata'}.`; break; }
    case 'PG04-C:0': { const roll=rollDie(20);const n=roll>=16?2:roll>=11?1:0;const drawn=drawTactics(player,n);summary=`D20 ${roll}: pescate ${drawn.length} carte Tattica.`;break; }
    case 'PG04-C:1': { if(options.choice==='recover'){for(const t of [...own,...player.bench])if(t.instanceId!==unit.instanceId)recoverFatigue(state,player,t,2,'Trascinatore della Folla');summary='Gli altri tuoi giocatori recuperano fino a 2 Fatica.';}else{const t=chooseOwn();buff(t,'technique',3);summary=`${t.name} ottiene +3 Tecnica.`;}break; }
    case 'PG04-L:0': { if(options.choice==='recover'){const t=chooseOwn();recoverFatigue(state,player,t,2,'La Rivolta');summary=`${t.name} recupera 2 Fatica.`;}else if(options.choice==='draw'){const d=drawTactics(player,1);summary=`Pescata ${d.length} Carta Tattica.`;}else{const t=chooseOwn();buff(t,'technique',2);summary=`${t.name} ottiene +2 Tecnica.`;}break; }
    case 'PG05-C:1': { const roll=rollDie(6);const d=roll>=5?draw(player,1):[];summary=`D6 ${roll}: ${d.length?'peschi 1 carta':'nessun effetto'}.`;break; }
    case 'PG05-L:0': { const roll=rollDie(6);if(roll>=4){if(options.choice==='draw'){draw(player,1);summary=`D6 ${roll}: pescata 1 carta.`;}else{player.modifiers.technique+=2;summary=`D6 ${roll}: +2 Tecnica al prossimo tiro.`;}}else summary=`D6 ${roll}: nessun effetto.`;break; }
    case 'PG05-L:2': { const roll=rollDie(6);const d=roll===6?draw(player,2):[];summary=`D6 ${roll}: pescate ${d.length} carte.`;break; }
    case 'PG06-C:0': {const d=draw(player,1);summary=`Regista Sacro: pescata ${d.length} carta.`;break;}
    case 'PG06-L:1': {const t=chooseOwn();buff(t,'attack',2);buff(t,'technique',1);summary=`${t.name} ottiene +2 Attacco e +1 Tecnica.`;break;}
    case 'PG07-C:2': {const t=chooseOwn();buff(t,'defense',2);summary=`${t.name} ottiene +2 Difesa.`;break;}
    case 'PG07-L:1': {unit.flags.barrieraEterea=true;buff(unit,'defense',1);summary='Barriera Eterea pronta: annulla il prossimo effetto negativo e +1 Difesa.';break;}
    case 'PG07-L:2': {for(const t of own)buff(t,'defense',1);summary='Tutti gli alleati ottengono +1 Difesa fino alla fine del turno.';break;}
    case 'PG08-C:0': {unit.flags.occhioCecchino=true;summary='Occhio del Cecchino pronto: +3 Tecnica al tiro con almeno 5 punti di vantaggio.';break;}
    case 'PG08-L:0': {unit.flags.miraAssoluta=true;summary='Mira Assoluta pronta: +3 Tecnica al tiro di San Bardelle.';break;}
    case 'PG08-L:1': {unit.flags.frecciaNera=true;summary='Freccia Nera: +5 Tecnica al prossimo tiro se lo Showdown è vinto con almeno 6 punti.';break;}
    case 'PG09-C:1': {const t=chooseEnemy();const roll=rollDie(6);const n=roll>=4?2:1;reduceFatigue(state,targetPlayer,t,n,'enemy-effect');summary=`D6 ${roll}: ${t?.name||'Avversario'} perde ${n} Fatica.`;break;}
    case 'PG09-C:3': {const d=draw(player,1);const c=d.length?CARD_BY_ID[d[0]]:null;if(c?.type==='tactic'){draw(player,1);const discard=options.discardId||player.hand[0];if(discard&&player.hand.includes(discard)){player.hand.splice(player.hand.indexOf(discard),1);player.discard.push(discard);}}summary=`Niente è Troppo Costoso: pescata ${d.length} carta${d.length?'':' (mazzo esaurito)'}.`;break;}
    case 'PG09-L:1': {const t=chooseEnemy();reduceFatigue(state,targetPlayer,t,1,'enemy-effect');summary=`${t?.name||'Avversario'} perde 1 Fatica.`;break;}
    default: throw new Error('Questa abilità non è ancora automatizzata.');
  }
  return {summary, ability};
}

function onTacticPlayed(state, player, card) {
  // Triggered abilities with a Fatigue cost remain optional active actions.
  // Only abilities explicitly marked as passive are executed automatically.
  return;
}

function applyTactic(state, player, cardId, options={}) {
  const card=CARD_BY_ID[cardId]; const enemy=playerOf(state,otherId(state,player.id));
  const own=fieldUnits(player), foes=fieldUnits(enemy); let outcome='';
  switch(cardId){
    case 'TO01': player.flags.extraAbility=true; outcome='Ottieni una possibilità aggiuntiva di abilità in questo turno.'; break;
    case 'TO02': if(player.goals<=enemy.goals-2){player.modifiers.attack+=5;player.modifiers.technique+=2;outcome='+5 Attacco e +2 Tecnica per questo turno.';}else throw new Error('Giocabile solo se sei sotto di almeno 2 gol.');break;
    case 'TO03': for(const u of own)recoverFatigue(state,player,u,1,'Spirito di Squadra');outcome='Tutti i tuoi giocatori recuperano 1 Fatica.';break;
    case 'TO04': {const t=findUnitInField(player,options.targetId)||own[0];if(!t)throw new Error('Non ci sono bersagli.');t.flags.freeNextAbility=true;t.flags.endTurnFatigue=(t.flags.endTurnFatigue||0)+2;outcome=`La prossima abilità di ${t.name} non costerà Fatica; a fine turno perderà 2.`;break;}
    case 'TO05': {const mid=own.find(u=>u.role==='midfielder');if(!mid)throw new Error('Centrocampista non in campo.');player.modifiers.attack+=statOf(mid,'technique');outcome=`+${statOf(mid,'technique')} Attacco dalla Tecnica del Centrocampista.`;break;}
    case 'TO06': {const t=findUnitInField(player,options.targetId)||own[0];buffUnit(t,'technique',1,state.turn);outcome=`${t.name} ottiene +1 Tecnica.`;break;}
    case 'TO07': {const t=findUnitInField(player,options.targetId)||own[0];buffUnit(t,'attack',2,state.turn);buffUnit(t,'technique',1,state.turn);outcome=`${t.name} ottiene +2 Attacco e +1 Tecnica.`;break;}
    case 'TO08': {const t=findUnitInField(player,options.targetId)||own.find(u=>u.role==='attacker')||own[0];t.flags.shotBonus=(t.flags.shotBonus||0)+3;outcome=`${t.name} ottiene +3 Tecnica al prossimo tiro.`;break;}
    case 'TO09': player.modifiers.attack+=4;const df=own.find(u=>u.role==='defender');if(df)df.flags.endTurnFatigue=(df.flags.endTurnFatigue||0)+1;outcome='+4 Attacco; il tuo Difensore perderà 1 Fatica a fine turno.';break;
    case 'TO10': player.modifiers.attack+=2;outcome='+2 Attacco allo Showdown.';break;
    case 'TD01': player.flags.cuoreFerro=true;outcome='La prossima entrata in Break Down di un tuo giocatore viene evitata una volta.';break;
    case 'TD02': player.flags.rerollGoalkeeper=true;outcome='Il D20 del portiere potrà essere rilanciato e si terrà il risultato migliore.';break;
    case 'TD03': enemy.flags.blockAttackerShot=true;outcome='L’Attaccante avversario non potrà essere selezionato per il tiro di questo turno.';break;
    case 'TD04': {const t=findUnitInField(enemy,options.targetId)||foes.find(u=>u.role==='attacker')||foes[0];if(!t)throw new Error('Nessun bersaglio.');t.flags.noTechniqueShot=true;outcome=`La Tecnica di ${t.name} non verrà conteggiata nel prossimo tiro.`;break;}
    case 'TD05': state.pendingCounter=true;outcome='La prossima Tattica offensiva avversaria può essere annullata.';break;
    case 'TD06': player.flags.solidita=true;outcome='Se vinci lo Showdown difensivo, ottieni +2 al prossimo Showdown offensivo.';break;
    case 'TD07': {const d=draw(player,2);outcome=`Peschi ${d.length} carte.`;break;}
    case 'TD08': player.flags.reduceShotBonus=2;outcome='Il bonus al tiro ottenuto dal differenziale verrà ridotto di 2.';break;
    case 'TD09': {const t=findUnitInField(enemy,options.targetId)||foes.find(u=>u.role==='attacker')||foes[0];if(!t)throw new Error('Nessun bersaglio.');t.flags.noShotBonuses=true;outcome=`${t.name} non potrà ricevere bonus al tiro.`;break;}
    case 'TD10': player.modifiers.defense+=3;outcome='+3 Difesa allo Showdown.';break;
    default: throw new Error('Effetto Tattica non ancora automatizzato.');
  }
  player.discard.push(cardId);
  addLog(state,`TATTICA · ${card.name}: ${outcome}`,'action');
  onTacticPlayed(state,player,card);
}
function buffUnit(unit,stat,amount,turn){unit.modifiers[stat]=(unit.modifiers[stat]||0)+amount;unit.modifierExpiry[`${stat}:turn`]=turn+1;}

function spendAP(state, playerId, amount) {
  if(state.ap[playerId] < amount) throw new Error(`Punti Azione insufficienti: servono ${amount}, disponibili ${state.ap[playerId]}.`);
  state.ap[playerId]-=amount;
}
function prepareNextActor(state, actorId, action) {
  const previousPhase=state.phase;
  state.lastAction={actorId,action};
  state.pendingAction={actorId,action};
  if(actorId===state.attackerId){
    if(state.ap[state.defenderId]>0){
      state.phase='response';state.actorId=state.defenderId;state.waitingFor='response';
    } else if(state.ap[state.attackerId]>0){
      state.phase='actions';state.actorId=state.attackerId;state.waitingFor='attacker';state.pendingAction=null;
    } else {
      state.phase='showdown_ready';state.actorId=state.defenderId;state.waitingFor='showdown';state.pendingAction=null;
    }
  } else if(previousPhase==='response'){
    if(state.ap[state.attackerId]>0){
      state.phase='actions';state.actorId=state.attackerId;state.waitingFor='attacker';state.pendingAction=null;
    } else if(state.ap[state.defenderId]>0){
      state.phase='defense';state.actorId=state.defenderId;state.waitingFor='defense';state.pendingAction=null;
    } else {
      state.phase='showdown_ready';state.actorId=state.defenderId;state.waitingFor='showdown';state.pendingAction=null;
    }
  } else if(previousPhase==='defense'){
    if(state.ap[state.defenderId]>0){
      state.phase='defense';state.actorId=state.defenderId;state.waitingFor='defense';state.pendingAction=null;
    } else {
      state.phase='showdown_ready';state.actorId=state.defenderId;state.waitingFor='showdown';state.pendingAction=null;
    }
  }
}

export function finishAttackingPhase(state, actorId) {
  const next=clone(state);
  if(next.phase!=='actions'||next.actorId!==actorId||actorId!==next.attackerId) throw new Error('Non puoi chiudere la fase d’attacco adesso.');
  next.pendingAction=null;
  if(next.ap[next.defenderId]>0){next.phase='defense';next.actorId=next.defenderId;next.waitingFor='defense';}
  else {next.phase='showdown_ready';next.actorId=next.defenderId;next.waitingFor='showdown';}
  addLog(next,`${playerOf(next,actorId).name} chiude la fase d’attacco.`,'action');
  return next;
}

export function finishDefensePhase(state, actorId) {
  const next=clone(state);
  if(next.phase!=='defense'||next.actorId!==actorId||actorId!==next.defenderId) throw new Error('Non puoi chiudere la fase difensiva adesso.');
  next.pendingAction=null;next.phase='showdown_ready';next.waitingFor='showdown';
  addLog(next,`${playerOf(next,actorId).name} chiude la fase difensiva.`,'action');
  return next;
}

export function performAbility(state, actorId, unitId, abilityIndex, options={}) {
  const next=clone(state); if(!['actions','response','defense'].includes(next.phase))throw new Error('La finestra delle azioni è chiusa.');
  if(next.actorId!==actorId)throw new Error('Non è il momento di questo giocatore.');
  if(actorId===next.attackerId&&next.phase!=='actions')throw new Error('L’attaccante può agire soltanto nella fase d’attacco.');
  if(actorId===next.defenderId&&!['response','defense'].includes(next.phase))throw new Error('La difesa può agire soltanto nella fase difensiva.');
  const player=playerOf(next,actorId); const unit=findUnitInField(player,unitId); if(!unit)throw new Error('Il giocatore selezionato non è in campo.');
  const card=activeCard(unit), ability=card.abilities[abilityIndex]; if(!ability||isAutomaticAbility(card.id,abilityIndex,ability))throw new Error('Questa abilità è automatica: si attiva da sola quando si verifica la condizione.');
  if(!supportedAbility(card.id,abilityIndex))throw new Error('Effetto non ancora automatizzato in questa versione.');
  const abilityLimit=RULES.maxActiveAbilities+(player.flags.extraAbility?1:0);
  if(next.abilityCounts[actorId]>=abilityLimit)throw new Error('Hai già raggiunto il limite di abilità attive per questo turno.');
  const cost=getAbilityCost(next,player,unit,ability);
  if(next.eventFlags.blockCostThree && cost>=3)throw new Error('L’Evento Partita Nervosa impedisce le abilità da 3 Fatica.');
  if(cost>unit.fatigue)throw new Error(`${unit.name} non ha Fatica sufficiente: servono ${cost}, ne restano ${unit.fatigue}.`);
  if(next.eventFlags.blockEnemyTargets && (options.targetSide==='enemy' || ['PG09-C:1','PG09-L:1'].includes(`${card.id}:${abilityIndex}`)))throw new Error('L’Evento Arbitro Severissimo blocca le abilità contro l’avversario.');
  const abilityKey=`${card.id}:${abilityIndex}`;
  const oncePerTurn=/una volta per turno/i.test(`${ability.kind||''} ${ability.text||''}`);
  const oncePerGame=/una volta per partita/i.test(`${ability.kind||''} ${ability.text||''}`);
  if(oncePerTurn && unit.abilityUses[abilityKey]===next.turn)throw new Error('Questa abilità è già stata usata in questo turno.');
  if(oncePerGame && unit.oncePerGame[abilityKey])throw new Error('Questa abilità è già stata usata in questa partita.');
  spendAP(next,actorId,1);
  next.abilityCounts[actorId]+=1;
  const {summary}=applyAbility(next,player,unit,abilityIndex,options);
  if(oncePerTurn)unit.abilityUses[abilityKey]=next.turn;
  if(oncePerGame)unit.oncePerGame[abilityKey]=true;
  const free=unit.flags.freeNextAbility; if(free)delete unit.flags.freeNextAbility; else reduceFatigue(next,player,unit,cost,'ability');
  addLog(next,`ABILITÀ · ${player.name}: ${ability.name}. ${summary} (−${free?0:cost} Fatica, −1 PA).`,'action');
  onOpponentAbilityActivated(next,actorId);
  if(player.flags.extraAbility && next.abilityCounts[actorId]>RULES.maxActiveAbilities) delete player.flags.extraAbility;
  prepareNextActor(next,actorId,{type:'ability',name:ability.name});
  return next;
}

export function playTacticAction(state, actorId, cardId, options={}) {
  const next=clone(state); if(next.actorId!==actorId)throw new Error('Non è il momento di questo giocatore.');
  if(!['actions','response','defense'].includes(next.phase))throw new Error('La finestra delle Tattiche è chiusa.');
  const player=playerOf(next,actorId); const card=CARD_BY_ID[cardId];
  if(!card||card.type!=='tactic'||!player.hand.includes(cardId))throw new Error('La Tattica non è nella tua mano.');
  if(cardId.startsWith('TO')&&actorId!==next.attackerId)throw new Error('Le Tattiche offensive si giocano solo in attacco.');
  if(cardId.startsWith('TD')&&actorId!==next.defenderId)throw new Error('Le Tattiche difensive si giocano solo in risposta.');
  if(cardId.startsWith('TO')&&next.eventFlags.blockOffensiveTactics)throw new Error('L’Evento Contestazione del Pubblico blocca le Tattiche offensive.');
  spendAP(next,actorId,1); player.hand.splice(player.hand.indexOf(cardId),1);
  if(next.pendingCounter&&cardId.startsWith('TO')){
    next.pendingCounter=false;player.discard.push(cardId);addLog(next,`TATTICA ANNULLATA · ${card.name} neutralizzata da Lettura del Gioco.`,'action');
  } else applyTactic(next,player,cardId,options);
  prepareNextActor(next,actorId,{type:'tactic',name:card.name});
  return next;
}

export function rankUp(state, actorId, unitId, legendaryId) {
  const next=clone(state); if(actorId!==next.attackerId||next.phase!=='actions')throw new Error('Il Rank Up è consentito solo al giocatore in attacco.');
  const player=playerOf(next,actorId);const unit=findUnitInField(player,unitId);const card=CARD_BY_ID[legendaryId];
  if(!unit||!card||card.version!=='Leggendaria'||card.baseCardId!==unit.baseCardId)throw new Error('La Leggendaria non corrisponde a un giocatore Comune in campo.');
  if(!player.hand.includes(legendaryId))throw new Error('La carta Leggendaria non è nella tua mano.');
  spendAP(next,actorId,RULES.rankUpCost);player.hand.splice(player.hand.indexOf(legendaryId),1);player.discard.push(unit.cardId);
  removePassiveOnExit(next,player,unit);
  unit.commonFatigue=unit.fatigue;unit.cardId=legendaryId;unit.maxFatigue=card.stats.Fatica;unit.fatigue=card.stats.Fatica;unit.modifiers={attack:0,defense:0,technique:0,parry:0};unit.abilityUses={};unit.flags={};
  addLog(next,`RANK UP · ${card.name} entra in versione Leggendaria (costo 2 PA).`,'action');
  passiveOnUnitEnter(next,player,unit);
  prepareNextActor(next,actorId,{type:'rankup',name:card.name});return next;
}

export function recruitToBench(state, actorId, cardId) {
  const next=clone(state); if(next.actorId!==actorId||!['actions','response','defense'].includes(next.phase))throw new Error('Non è il momento di questo giocatore.');
  const p=playerOf(next,actorId),card=CARD_BY_ID[cardId];if(!card||card.type!=='player'||card.version!=='Comune'||!p.hand.includes(cardId))throw new Error('Carta giocatore non disponibile.');
  if(p.bench.length>=RULES.maxBench)throw new Error('Panchina piena.');
  spendAP(next,actorId,1);p.hand.splice(p.hand.indexOf(cardId),1);const u=makeUnit(card,actorId,Date.now());p.bench.push(u);addLog(next,`${card.name} entra in panchina.`,'action');prepareNextActor(next,actorId,{type:'recruit',name:card.name});return next;
}

export function substituteFromBench(state, actorId, benchUnitId, role) {
  const next=clone(state);if(next.actorId!==actorId||!['actions','response','defense'].includes(next.phase))throw new Error('Non è il momento di questo giocatore.');
  const p=playerOf(next,actorId);const idx=p.bench.findIndex(u=>u.instanceId===benchUnitId);if(idx<0)throw new Error('Giocatore non in panchina.');
  const incoming=p.bench[idx];if(incoming.role!==role)throw new Error('Il sostituto deve avere lo stesso ruolo.');
  const outgoing=p.field[role];if(outgoing){removePassiveOnExit(next,p,outgoing);p.field[role]=null;p.bench.push(outgoing);}p.bench.splice(idx,1);p.field[role]=incoming;spendAP(next,actorId,1);passiveOnUnitEnter(next,p,incoming);addLog(next,`${incoming.name} entra in campo al posto di ${outgoing?.name||'nessuno'}.`,'action');prepareNextActor(next,actorId,{type:'substitution',name:incoming.name});return next;
}

export function passResponse(state, actorId) {
  const next=clone(state); if(next.phase!=='response'||next.actorId!==actorId||actorId!==next.defenderId)throw new Error('Non è il momento di rispondere.');
  addLog(next,`${playerOf(next,actorId).name} passa la risposta.`);
  next.pendingAction=null;
  if(next.ap[next.attackerId]>0){next.phase='actions';next.actorId=next.attackerId;next.waitingFor='attacker';}
  else if(next.ap[next.defenderId]>0){next.phase='defense';next.actorId=next.defenderId;next.waitingFor='defense';}
  else {next.phase='showdown_ready';next.actorId=next.defenderId;next.waitingFor='showdown';}
  return next;
}

function cpuChooseAction(state) {
  const p=playerOf(state,'cpu');
  const isAttacking=state.actorId===state.attackerId && state.phase==='actions';
  if(isAttacking && state.ap.cpu>=RULES.rankUpCost){
    const leg=p.hand.find(id=>CARD_BY_ID[id]?.version==='Leggendaria'&&fieldUnits(p).some(u=>u.baseCardId===CARD_BY_ID[id].baseCardId&&!isLegendary(u)));
    if(leg){const u=fieldUnits(p).find(x=>x.baseCardId===CARD_BY_ID[leg].baseCardId&&!isLegendary(x));return {type:'rankup',unitId:u.instanceId,legendaryId:leg};}
  }
  const abilities=getAvailableActions(state,'cpu').filter(a=>a.ok);
  if(abilities.length){
    const preferred=abilities.find(a=>isAttacking?['PG06-L:1','PG04-C:1','PG08-L:0','PG07-C:2','PG02-L:0'].includes(`${CARD_BY_ID[unitById(p,a.unitId)?.cardId]?.id}:${a.index}`):['PG07-C:2','PG07-L:2','PG02-L:0','PG06-L:1'].includes(`${CARD_BY_ID[unitById(p,a.unitId)?.cardId]?.id}:${a.index}`));
    const a=preferred||abilities[0];return {type:'ability',unitId:a.unitId,index:a.index};
  }
  const prefix=isAttacking?'TO':'TD';
  const tacticPriority=isAttacking?['TO03','TO10','TO08','TO07','TO02']:['TD10','TD07','TD08','TD01','TD06'];
  const t=p.hand.find(id=>tacticPriority.includes(id)&&id.startsWith(prefix));
  if(t&&state.ap.cpu>0&&!(isAttacking&&state.eventFlags.blockOffensiveTactics))return {type:'tactic',cardId:t};
  return null;
}


function applyTurnEndFatigue(state) {
  for(const p of state.players){
    for(const unit of [...fieldUnits(p)]){
      const amount=unit.flags.endTurnFatigue||0;
      if(amount>0){delete unit.flags.endTurnFatigue;reduceFatigue(state,p,unit,amount,'ability');}
    }
  }
}

export function resolveShowdown(state) {
  const next=clone(state); if(next.phase!=='showdown_ready')throw new Error('Concludi prima le fasi di attacco e difesa.');
  const attacker=playerOf(next,next.attackerId),defender=playerOf(next,next.defenderId);
  cleanModifiers(next);
  const a=fieldUnits(attacker),d=fieldUnits(defender);
  const usedCarry=next.nextAttackBonus[attacker.id]||0;
  next.nextAttackBonus[attacker.id]=0;
  let attackTotal=a.reduce((s,u)=>s+statOf(u,'attack'),0)+attacker.modifiers.attack+usedCarry;
  let defenseTotal=d.reduce((s,u)=>s+statOf(u,'defense'),0)+defender.modifiers.defense;
  const lolli=a.find(u=>activeCard(u)?.id==='PG06-L'); if(lolli)attackTotal+=a.length;
  const trailing=attacker.goals<defender.goals; if(next.eventFlags.trailingAttackBonus&&trailing)attackTotal+=2;
  const difference=attackTotal-defenseTotal;
  const attackWins=difference>0;
  const defenseWins=difference<0;
  const shotBonus=attackWins?Math.floor(difference/2):0;
  if(defenseWins){
    const soliditaBonus=defender.flags.solidita?2:0;
    delete defender.flags.solidita;
    next.nextAttackBonus[defender.id]=Math.abs(difference)+soliditaBonus;
    addLog(next,`SHOWDOWN · La difesa vince di ${Math.abs(difference)}. Nessun tiro. Il margine passa al prossimo Showdown offensivo della difesa (+${next.nextAttackBonus[defender.id]}).`,'showdown');
    next.lastTurnWinner=defender.id;next.showdown={attackTotal,defenseTotal,difference,attackWins:false,defenseWins:true,shotBonus:0,carryover:usedCarry};applyTurnEndFatigue(next);next.phase='turn_end';return next;
  }
  if(attacker.flags.solidita)delete attacker.flags.solidita;
  const bonus=Math.max(0,shotBonus-(defender.flags.reduceShotBonus||0));delete defender.flags.reduceShotBonus;
  next.showdown={attackTotal,defenseTotal,difference,attackWins,defenseWins:false,shotBonus:bonus,carryover:usedCarry};
  addLog(next,`SHOWDOWN · Attacco ${attackTotal} contro Difesa ${defenseTotal}. ${difference>0?`Attacco avanti di ${difference}; bonus tiro +${bonus}.`:'Parità: nessun bonus, ma il tiro è consentito.'}`,'showdown');
  const eligibleShooter=a.find(u=>!(defender.flags.blockAttackerShot&&u.role==='attacker'));
  if(!eligibleShooter){
    next.shot={result:'no_shooter'};
    addLog(next,'TIRO ANNULLATO · Nessun giocatore disponibile per calciare. Il turno termina senza tiro.','warning');
    applyTurnEndFatigue(next);next.phase='turn_end';return next;
  }
  next.phase='shot';next.actorId=attacker.id;next.waitingFor='shot';return next;
}

export function resolveShot(state, shooterId) {
  const next=clone(state);if(next.phase!=='shot')throw new Error('Il tiro non è disponibile.');
  const attacker=playerOf(next,next.attackerId),defender=playerOf(next,next.defenderId);const shooter=findUnitInField(attacker,shooterId);
  if(!shooter)throw new Error('Scegli un giocatore in campo per il tiro.');
  if(defender.flags.blockAttackerShot&&shooter.role==='attacker')throw new Error('Fuorigioco Perfetto: l’attaccante non può tirare questo turno.');
  let shotRoll=rollDie(20),keeperRoll=rollDie(20);
  const realKeeper=fieldUnits(defender).find(u=>u.role==='goalkeeper');const keeper=realKeeper||fieldUnits(defender)[0];if(!keeper)throw new Error('Nessun giocatore disponibile per la parata.');const keeperParry=realKeeper?statOf(keeper,'parry'):2;
  let tech=statOf(shooter,'technique');
  if(next.eventFlags.techniquePenalty)tech-=next.eventFlags.techniquePenalty;
  if(shooter.flags.occhioCecchino&&next.showdown.difference>=5){tech+=3;delete shooter.flags.occhioCecchino;}
  if(shooter.flags.miraAssoluta){tech+=3;delete shooter.flags.miraAssoluta;}
  if(shooter.flags.frecciaNera&&next.showdown.difference>=6){tech+=5;delete shooter.flags.frecciaNera;}
  tech+=shooter.flags.shotBonus||0;delete shooter.flags.shotBonus;
  if(shooter.flags.noShotBonuses)tech=statOf(shooter,'technique');
  if(shooter.flags.noTechniqueShot)tech=0;
  const opponentPenalty=fieldUnits(defender).some(u=>activeCard(u)?.id==='PG06-L')?1:0;
  const totalShot=shotRoll+tech+next.showdown.shotBonus-opponentPenalty;
  let totalSave=keeperRoll+keeperParry;
  if(defender.flags.rerollGoalkeeper){const reroll=rollDie(20);if(reroll>keeperRoll){keeperRoll=reroll;totalSave=keeperRoll+keeperParry;}delete defender.flags.rerollGoalkeeper;}
  const goal=totalShot>totalSave;
  if(goal)attacker.goals+=1;
  next.shot={shooter:shooter.name,keeper:keeper.name,shotRoll,technique:tech,shotBonus:next.showdown.shotBonus,shotTotal:totalShot,keeperRoll,parry:keeperParry,saveTotal:totalSave,emergencyKeeper:!realKeeper,result:goal?'goal':'saved'};
  addLog(next,`${goal?'GOL':'PARATA'} · ${shooter.name}: D20 ${shotRoll} + Tecnica ${tech} + bonus ${next.showdown.shotBonus} = ${totalShot}; ${keeper.name}: D20 ${keeperRoll} + Parata ${keeperParry} = ${totalSave}.` ,goal?'goal':'save');
  // Le passive si attivano da sole quando si verifica la condizione, senza premere Attiva.
  for(const u of fieldUnits(attacker)){
    const id=activeCard(u)?.id;
    if(id==='PG10-C'){
      draw(attacker,1);
      addLog(next,'PASSIVA · Cannoniere Spietato: San Zorro è in campo; pescata 1 carta dopo il tiro.','passive');
      if(goal){draw(attacker,1);addLog(next,'PASSIVA · Finalizzatore Clinico: gol segnato; pescata 1 carta aggiuntiva.','passive');}
    }
    if(id==='PG10-L'){
      if(u.fatigue>=3){reduceFatigue(next,attacker,u,3,'ability');draw(attacker,1);addLog(next,'PASSIVA · Cannoniere Spietato Leggendario: tiro effettuato; −3 Fatica e pescata 1 carta.','passive');}
      else addLog(next,'PASSIVA · Cannoniere Spietato Leggendario: non si attiva, servono 3 Fatica.','passive');
    }
    if(goal&&id==='PG08-C'&&u.instanceId===shooter.instanceId){draw(attacker,1);addLog(next,'PASSIVA · MVP della Domenica: San Bardelle ha segnato; pescata 1 carta.','passive');}
    if(goal&&id==='PG08-L'&&u.instanceId===shooter.instanceId){draw(attacker,1);recoverFatigue(next,attacker,u,1,'MVP Naturale');addLog(next,'PASSIVA · MVP Naturale: San Bardelle ha segnato; pescata 1 carta e recuperata 1 Fatica.','passive');}
  }
  if(!goal&&activeCard(keeper)?.id==='PG02-C'){recoverFatigue(next,defender,keeper,2,'Mani di Fiducia');addLog(next,'PASSIVA · Mani di Fiducia: il portiere recupera 2 Fatica automaticamente.','passive');}
  applyTurnEndFatigue(next);
  next.phase='turn_end';return next;
}

export function advanceTurn(state) {
  const next=clone(state);
  if(next.phase!=='turn_end')throw new Error('Completa lo Showdown o il tiro prima di proseguire.');
  if(next.turn>=next.totalTurns){
    if(next.extraTurn && next.turn===9){next.totalTurns=10;next.extraTurn=false;addLog(next,'L’Evento Tempo Supplementare attiva un ultimo turno extra.','event');}
    else {next.phase='finished';next.status='finished';const [a,b]=next.players;next.winnerId=a.goals===b.goals?null:(a.goals>b.goals?a.id:b.id);addLog(next,a.goals===b.goals?'PARTITA TERMINATA · Pareggio.':`PARTITA TERMINATA · Vince ${next.winnerId==='human'?a.name:b.name}.`,'success');return next;}
  }
  next.turn+=1;
  next.attackerId=next.turn%2===1?'human':'cpu';next.defenderId=next.attackerId==='human'?'cpu':'human';next.actorId=next.attackerId;next.phase='actions';next.waitingFor='attacker';next.pendingAction=null;next.showdown=null;next.shot=null;next.ap={human:3,cpu:3};next.abilityCounts={human:0,cpu:0};
  for(const p of next.players){p.actionPoints=3;p.abilityUsesThisTurn=0;p.turnActions=0;p.modifiers={attack:0,defense:0,technique:0};p.flags={};for(const u of fieldUnits(p)){u.modifiers={attack:0,defense:0,technique:0,parry:0};u.modifierExpiry={};const curseTarget=u.flags.curseTarget;u.flags=curseTarget?{curseTarget}:{};}}
  startTurnMaintenance(next,next.turn);
  return next;
}

function startTurnMaintenance(state, turn) {
  if(turn>1){
    const active=playerOf(state,state.attackerId);const drawn=draw(active,RULES.drawPerOwnTurn);
    if(drawn.length)addLog(state,`${active.name} pesca ${drawn.length} carta all’inizio del turno ${turn}.`,'draw');
    revealEvent(state);
  }
  // Break Down counters advance; after three full turns the player returns to the bench.
  for(const p of state.players){
    for(let i=p.breakDown.length-1;i>=0;i--){
      const entry=p.breakDown[i];
      entry.turnsRemaining=Math.max(0,(entry.returnOnTurn??(entry.enteredTurn+RULES.breakDownTurns+1))-turn);
      if(turn>=(entry.returnOnTurn??(entry.enteredTurn+RULES.breakDownTurns+1))&&p.bench.length<RULES.maxBench){
        entry.unit.fatigue=entry.unit.maxFatigue;entry.unit.modifiers={attack:0,defense:0,technique:0,parry:0};entry.unit.flags={};
        p.bench.push(entry.unit);p.breakDown.splice(i,1);addLog(state,`${entry.unit.name} ha completato 3 turni di Break Down e torna in panchina.`,'success');
      }
    }
    for(const u of p.bench)u.fatigue=Math.min(u.maxFatigue,u.fatigue+1);
  }
  for(const p of state.players){
    for(const u of [...fieldUnits(p)]){
      if(activeCard(u)?.id==='PG09-L'){addLog(state,`PASSIVA · Macumba Eterna: ${u.name} non perde Fatica nel mantenimento.`,'passive');continue;}
      reduceFatigue(state,p,u,1,'maintenance');
    }
  }
  // Turn-start passive roll: Giustizia o Caos (paid triggered ability) resolves automatically.
  {const p=playerOf(state,state.attackerId);const unit=fieldUnits(p).find(u=>activeCard(u)?.id==='PG04-L');if(unit&&unit.fatigue>=3){const roll=rollDie(20);reduceFatigue(state,p,unit,3,'ability');if(roll<=5)reduceFatigue(state,p,unit,2,'ability');else if(roll<=10)recoverFatigue(state,p,unit,2,'Giustizia o Caos');else{const t=fieldUnits(p).find(u=>u.instanceId!==unit.instanceId)||unit;recoverFatigue(state,p,t,1+Math.floor(Math.random()*6),'Giustizia o Caos');}addLog(state,`AUTOMATICA · Giustizia o Caos: D20 ${roll}.`,'passive');}}
  addLog(state,`TURNO ${turn} · ${playerOf(state,state.attackerId).name} attacca. Entrambe le squadre perdono 1 Fatica in mantenimento.`,'turn');
}

export function getCard(cardId){return CARD_BY_ID[cardId]||null;}
export function canUseAbility(state,playerId,unitId,index){
  const p=playerOf(state,playerId),u=findUnitInField(p,unitId),a=u&&activeCard(u).abilities[index];
  if(!a||isAutomaticAbility(u?.cardId,index,a))return {ok:false,reason:'Effetto automatico'};
  if(state.actorId!==playerId)return {ok:false,reason:'Non è il tuo momento'};
  if(playerId===state.attackerId&&state.phase!=='actions')return {ok:false,reason:'Disponibile nella fase d’attacco'};
  if(playerId===state.defenderId&&!['response','defense'].includes(state.phase))return {ok:false,reason:'Disponibile nella fase difensiva'};
  if(!supportedAbility(u.cardId,index))return {ok:false,reason:'Effetto non automatizzato'};
  const cost=getAbilityCost(state,p,u,a);
  const abilityKey=`${activeCard(u).id}:${index}`;
  const oncePerTurn=/una volta per turno/i.test(`${a.kind||''} ${a.text||''}`);
  const oncePerGame=/una volta per partita/i.test(`${a.kind||''} ${a.text||''}`);
  if(oncePerTurn&&u.abilityUses[abilityKey]===state.turn)return {ok:false,reason:'Già usata in questo turno'};
  if(oncePerGame&&u.oncePerGame[abilityKey])return {ok:false,reason:'Già usata in questa partita'};
  if(state.ap[playerId]<1)return {ok:false,reason:'Punti Azione esauriti'};
  const limit=RULES.maxActiveAbilities+(p.flags.extraAbility?1:0);
  if(state.abilityCounts[playerId]>=limit)return {ok:false,reason:`Limite di ${limit} abilità nel turno raggiunto`};
  if(u.fatigue<cost)return {ok:false,reason:`Servono ${cost} Fatica`};
  if(state.eventFlags.blockCostThree&&cost>=3)return {ok:false,reason:'Evento: abilità da 3 Fatica bloccate'};
  if(state.eventFlags.blockEnemyTargets&&['PG09-C:1','PG09-L:1'].includes(`${u.cardId}:${index}`))return {ok:false,reason:'Evento: abilità contro avversari bloccate'};
  return {ok:true,cost};
}
export function getNextCpuAction(state){return cpuChooseAction(state);}
export function doCpuAction(state,action){
  if(!action){if(state.phase==='response')return passResponse(state,'cpu');if(state.phase==='actions')return finishAttackingPhase(state,'cpu');if(state.phase==='defense')return finishDefensePhase(state,'cpu');return state;}
  if(action.type==='ability')return performAbility(state,'cpu',action.unitId,action.index,{});
  if(action.type==='rankup')return rankUp(state,'cpu',action.unitId,action.legendaryId);
  if(action.type==='tactic')return playTacticAction(state,'cpu',action.cardId,{});
  return state;
}
export function rollDie(sides=20){return 1+Math.floor(Math.random()*sides);}
export function getUnitStats(unit){return {attack:statOf(unit,'attack'),defense:statOf(unit,'defense'),technique:statOf(unit,'technique'),parry:statOf(unit,'parry')};}
export function getPlayer(state,id){return playerOf(state,id);}
export function getFieldUnits(player){return fieldUnits(player);}
export function getAvailableActions(state,playerId){
  const p=playerOf(state,playerId);const result=[];
  for(const u of fieldUnits(p)){
    const card=activeCard(u);
    card.abilities.forEach((a,i)=>{if(!isAutomaticAbility(card.id,i,a)){const avail=canUseAbility(state,playerId,u.instanceId,i);result.push({type:'ability',unitId:u.instanceId,unitName:u.name,index:i,name:a.name,text:a.text,cost:avail.cost??a.costFatigue,ok:avail.ok,reason:avail.reason});}});
  }
  return result;
}
