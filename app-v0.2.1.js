import {
  CARDS, CARD_BY_ID, ROLES, PLAYER_CARDS, RULES, isAutomaticAbility, createMatch, getPlayer,
  getFieldUnits, getUnitStats, getAvailableActions, canUseAbility,
  performAbility, playTacticAction, rankUp, recruitToBench,
  substituteFromBench, passResponse, finishAttackingPhase, finishDefensePhase, resolveShowdown, resolveShot,
  advanceTurn, getNextCpuAction, doCpuAction, getCard
} from './engine-v0.2.1.js';

const $ = (q, root=document) => root.querySelector(q);
const $$ = (q, root=document) => [...root.querySelectorAll(q)];
const state = { match:null, logExpanded:false, cpuBusy:false, dialogSubmit:null };
const CPU_LINEUP = { goalkeeper:'PG02-C', defender:'PG07-C', midfielder:'PG05-C', attacker:'PG08-C' };
const CPU_LEGENDARIES = ['PG02-L','PG07-L','PG08-L'];
const roleChoices = Object.fromEntries(ROLES.map(r=>[r.id,PLAYER_CARDS.filter(c=>c.role===r.id)]));

function esc(value='') { return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function roleLabel(role){return ROLES.find(r=>r.id===role)?.label||role;}
function shortRole(role){return ROLES.find(r=>r.id===role)?.short||'G';}
function cardStats(card){const s=card?.stats||{};return {att:s.Attacco??0,def:s.Difesa??0,tec:s.Tecnica??0,par:s.Parata??null,fat:s.Fatica??0};}
function fatiguePct(unit){return unit.maxFatigue?Math.max(0,Math.min(100,unit.fatigue/unit.maxFatigue*100)):0;}
function showToast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>el.classList.remove('show'),2500);}
function currentHumanActor(){return state.match?.actorId==='human';}
function currentHumanAttacks(){return state.match?.attackerId==='human';}
function currentHumanDefends(){return state.match?.defenderId==='human';}

function setupHTML(){
  const selectors=ROLES.map(role=>{
    const opts=roleChoices[role.id].map(c=>`<option value="${c.id}">${esc(c.name)} · ATT ${c.stats.Attacco} / DIF ${c.stats.Difesa}${c.stats.Tecnica!==undefined?` / TEC ${c.stats.Tecnica}`:''}${c.stats.Parata!==undefined?` / PAR ${c.stats.Parata}`:''}</option>`).join('');
    return `<label class="lineup-choice"><span class="role-chip">${role.short}</span><span class="lineup-label">${role.label}</span><select id="pick-${role.id}" data-role="${role.id}"><option value="" selected disabled>Seleziona un ${role.label.toLowerCase()}</option>${opts}</select><small id="preview-${role.id}">Seleziona il titolare</small></label>`;
  }).join('');
  $('#lineup-selectors').innerHTML=selectors;
  updateLegendaryOptions();
  $$('#lineup-selectors select').forEach(s=>s.addEventListener('change',()=>{refreshLineupOptions();updateLegendaryOptions();}));
}
function chosenLineup(){return Object.fromEntries(ROLES.map(r=>[r.id,$(`#pick-${r.id}`).value]));}
function refreshLineupOptions(){
  const chosen=chosenLineup();
  ROLES.forEach(r=>{
    const select=$(`#pick-${r.id}`);const current=select.value;
    [...select.options].forEach(opt=>{opt.disabled=ROLES.some(other=>other.id!==r.id&&chosen[other.id]===opt.value);});
    const card=CARD_BY_ID[current];$(`#preview-${r.id}`).textContent=card?.epithet||'';
  });
}
function updateLegendaryOptions(){
  const lineup=chosenLineup();
  const upgrades=ROLES.map(r=>CARD_BY_ID[lineup[r.id]]).map(c=>c?CARDS.find(x=>x.type==='player'&&x.version==='Leggendaria'&&x.baseCardId===c.id):null).filter(Boolean);
  $('#legendary-options').innerHTML=upgrades.map(c=>`<label class="legendary-option"><input type="checkbox" class="legendary-check" value="${c.id}"><span><b>${esc(c.name)}</b><small>${roleLabel(c.role)} · +${c.stats.Fatica} Fatica max</small></span></label>`).join('')||'<small>Scegli i quattro titolari per vedere le Leggendarie disponibili.</small>';
  $$('.legendary-check').forEach(ch=>ch.addEventListener('change',()=>{
    const checked=$$('.legendary-check:checked');if(checked.length>3){ch.checked=false;showToast('Puoi inserire al massimo 3 Leggendarie nel mazzo.');}
  }));
}

function startMatch(){
  const lineup=chosenLineup();
  if(Object.values(lineup).some(id=>!id)||new Set(Object.values(lineup)).size!==4){showToast('Scegli un giocatore diverso per ciascuno dei quattro ruoli.');return;}
  const legendaries=$$('.legendary-check:checked').map(c=>c.value);
  try{
    state.match=createMatch({lineup,legendaries,cpuLineup:CPU_LINEUP,cpuLegendaries:CPU_LEGENDARIES,startingPlayerId:'human'});
    $('#setup-view').hidden=true;$('#match-view').hidden=false;
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(error){showToast(error.message);}
}

function renderUnit(unit, ownerId){
  if(!unit)return '<div class="unit-empty"><span>RUOLO LIBERO</span><b>In attesa di un sostituto</b></div>';
  const card=getCard(unit.cardId), stats=getUnitStats(unit), fatPct=fatiguePct(unit);
  const team=getPlayer(state.match,ownerId);
  const hasDominio=getFieldUnits(team).some(u=>u.cardId==='PG06-L');
  if(hasDominio)stats.attack+=1; // Dominio Assoluto: +1 Attacco a ogni alleato finché San Lolli Leggendario è in campo.
  const passives=card.abilities.filter((a,i)=>isAutomaticAbility(card.id,i,a));
  const actives=card.abilities.filter((a,i)=>!isAutomaticAbility(card.id,i,a));
  return `<article class="unit-card ${ownerId==='human'?'unit-user':'unit-cpu'} ${unit.fatigue<=2?'unit-tired':''}">
    <div class="unit-card-top"><span class="role-tag">${shortRole(unit.role)}</span><span class="rarity-tag ${card.version==='Leggendaria'?'legendary':''}">${card.version==='Leggendaria'?'LEGGENDARIA':'COMUNE'}</span></div>
    <div class="unit-name">${esc(card.name)}</div><div class="unit-epithet">${esc(card.epithet||'')}</div>
    <div class="unit-stats"><span><small>ATT</small><b>${stats.attack}</b></span><span><small>DIF</small><b>${stats.defense}</b></span><span><small>TEC</small><b>${stats.technique}</b></span>${unit.role==='goalkeeper'?`<span><small>PAR</small><b>${stats.parry}</b></span>`:''}</div>
    <div class="fatigue-row"><div class="fatigue-label"><span>FATICA</span><b>${unit.fatigue}<small>/${unit.maxFatigue}</small></b></div><div class="fatigue-track"><i style="width:${fatPct}%"></i></div></div>
    ${passives.length?`<details class="passive-list"><summary><span>✦</span> ${passives.length} passiva${passives.length>1?'e':''} automatica${passives.length>1?'he':''}</summary><ul>${passives.map(a=>`<li><b>${esc(a.name)}</b><small>${esc(a.text)}</small></li>`).join('')}</ul></details>`:''}
    ${actives.length?`<div class="active-count">${actives.length} abilità attivabile/i · ${actives.map(a=>`${a.costFatigue}F`).join(' / ')}</div>`:''}
  </article>`;
}

function renderTeam(playerId){
  const p=getPlayer(state.match,playerId);const prefix=playerId==='human'?'human':'cpu';
  $(`#${prefix}-score`).textContent=p.goals;
  $(`#${prefix}-field-score`).textContent=`${p.goals} GOL`;
  $(`#${prefix}-field`).innerHTML=ROLES.map(r=>`<div class="field-slot"><div class="field-role">${r.label}</div>${renderUnit(p.field[r.id],playerId)}</div>`).join('');
  $(`#${prefix}-bench-count`).textContent=`${p.bench.length} / 5`;
  $(`#${prefix}-bench`).innerHTML=p.bench.length?p.bench.map(u=>`<div class="reserve-chip"><b>${esc(u.name)}</b><span>${shortRole(u.role)} · FAT ${u.fatigue}/${u.maxFatigue}</span>${`<button data-bench-in="${u.instanceId}" data-owner="${playerId}" class="mini-action" ${playerId!=='human'?'disabled':''}>${p.field[u.role]?'Sostituisci':'Schiera'}</button>`}</div>`).join(''):'<span class="empty-note">Nessun giocatore in panchina.</span>';
  $(`#${prefix}-breakdown`).innerHTML=p.breakDown.length?`<div class="breakdown-label">BREAK DOWN</div>${p.breakDown.map(x=>`<div class="breakdown-chip"><b>${esc(x.unit.name)}</b><span>${x.turnsRemaining} turn${x.turnsRemaining===1?'o':'i'} residui</span></div>`).join('')}`:'';
}

function renderHeader(){
  const m=state.match,att=getPlayer(m,m.attackerId),def=getPlayer(m,m.defenderId);
  $('#match-turn-title').textContent=`Turno ${m.turn}`;
  const phaseLabel={actions:`Attacca ${att.name}`,response:`Risposta di ${def.name}`,defense:`Fase difensiva · ${def.name}`,shot:'Tiro in porta',turn_end:'Turno concluso',finished:'Partita terminata'};
  $('#match-phase-subtitle').textContent=phaseLabel[m.phase]||`Attacco ${att.name} · difesa ${def.name}`;
  $('#turn-count').textContent=`${m.turn} / ${m.totalTurns}`;
  const guide=$('#turn-guide-main');
  if(guide)guide.textContent=m.turn===1?'Mano iniziale: 4 carte per squadra · −1 Fatica a tutti i giocatori in campo · +1 a chi è in panchina':'L’attaccante pesca 1 carta · −1 Fatica a tutti i giocatori in campo · +1 a chi è in panchina';
  const eventGuide=$('#turn-guide-event');
  if(eventGuide)eventGuide.textContent=[3,5,7,9].includes(m.turn)?'Nuovo Evento condiviso rivelato in questo turno. Break Down: 3 turni completi.':'Gli Eventi condivisi si rivelano nei turni 3, 5, 7 e 9 e restano attivi fino al successivo. Break Down: 3 turni completi.';
  $('#human-score-sub').textContent=m.attackerId==='human'?'IN ATTACCO':'IN DIFESA';
  $('#cpu-score-sub').textContent=m.attackerId==='cpu'?'IN ATTACCO':'IN DIFESA';
  $('#event-banner').hidden=!m.activeEvent;
  if(m.activeEvent)$('#event-banner').innerHTML=`<span class="event-icon">✦</span><div><small>EVENTO ATTIVO · MAZZO CONDIVISO</small><strong>${esc(m.activeEvent.name)}</strong><p>${esc(m.activeEvent.effect||'')}</p></div>`;
  $('#attack-ap').textContent=m.ap[m.attackerId];$('#defense-ap').textContent=m.ap[m.defenderId];
  const active=['actions','response','defense'].includes(m.phase)?1:m.phase==='shot'?3:m.phase==='showdown_ready'?2:0;
  ['upkeep','actions','showdown','shot'].forEach((id,i)=>{const el=$(`#phase-${id}`);const resolvedShowdown=!!m.showdown;el.classList.toggle('active',i===active || (i===2&&resolvedShowdown&&m.phase==='turn_end'));el.classList.toggle('done',m.phase==='turn_end'||m.phase==='finished'||(m.phase==='shot'&&i<3)||(m.phase==='showdown_ready'&&i<2)||(m.phase==='defense'&&i<1));});
}

function renderActionArea(){
  const m=state.match;
  const isActive=['actions','response','defense'].includes(m.phase);
  $('#action-station').hidden=!isActive;
  $('#response-banner').hidden=!(m.phase==='response'||m.phase==='defense');
  $('#action-footer').innerHTML='';
  if(!isActive)return;
  const humanActor=m.actorId==='human';
  const isAttack=m.phase==='actions';
  const isResponse=m.phase==='response';
  const isDefense=m.phase==='defense';
  $('#action-title').textContent=isAttack?'Fase d’attacco':isResponse?'Rispondi all’azione':'Fase difensiva';
  $('#action-description').textContent=isAttack
    ?'Hai 3 Punti Azione. Ogni mossa lascia alla difesa una finestra per rispondere.'
    :isResponse?'L’avversario ha appena agito. Puoi rispondere con una mossa difensiva oppure passare.'
    :'L’attacco è concluso. Usa i Punti Azione difensivi rimasti, poi calcoleremo lo Showdown.';
  if(isResponse||isDefense){
    const action=m.pendingAction?.action?.name||'azione';
    $('#response-banner').innerHTML=isResponse?`<b>RISPOSTA ALL’AZIONE</b><span>${esc(action)} · puoi spendere 1 PA per rispondere, oppure passare.</span>`:`<b>ULTIMA FASE · DIFESA</b><span>Puoi usare i PA difensivi rimasti. Il Rank Up non è consentito in difesa.</span>`;
  }
  const side=humanActor?`<span class="actor-pill human-pill">TOCCA A TE</span>`:`<span class="actor-pill cpu-pill">COMPUTER</span>`;
  const counts=m.abilityCounts.human;
  const currentPlayer=getPlayer(m,'human');
  const available=getAvailableActions(m,'human');
  const actorMayUse=humanActor;
  const usableAbilities=available.filter(a=>a.ok);
  const blockedAbilities=available.filter(a=>!a.ok);
  const abilityHtml=usableAbilities.map(a=>`<button class="ability-action" data-ability-unit="${a.unitId}" data-ability-index="${a.index}" ${!actorMayUse?'disabled':''}><span class="ability-action-meta"><b>${esc(a.name)}</b><small>${esc(a.unitName)} · −${a.cost??'?'} FAT · 1 PA</small></span><span class="ability-action-status">ATTIVA</span></button>`).join('');
  const blockedHtml=blockedAbilities.map(a=>`<div class="ability-action blocked"><span class="ability-action-meta"><b>${esc(a.name)}</b><small>${esc(a.unitName)} · ${esc(a.text||'')}</small></span><span class="ability-action-status">${esc(a.reason||'Non disponibile')}</span></div>`).join('');
  const passiveCount=getFieldUnits(currentPlayer).reduce((n,u)=>n+getCard(u.cardId).abilities.filter((a,i)=>isAutomaticAbility(u.cardId,i,a)).length,0);
  const actionLabel=isAttack?'Attacco':isResponse?'Risposta immediata':'Difesa finale';
  let html=`<div class="actor-row">${side}<span class="action-state">${actionLabel} · ${humanActor?m.ap.human: m.ap.cpu} PA · ${humanActor?counts:m.abilityCounts.cpu}/2 abilità</span></div>`;
  html+=`<div class="auto-passive-note"><span>✦</span><div><b>${passiveCount} passive nella tua formazione</b><small>Gli effetti passivi sono automatici e si attivano quando si verifica la loro condizione. Non richiedono PA.</small></div></div>`;
  if(actorMayUse){
    html+=`<details class="action-group action-fold" open><summary><b>Abilità utilizzabili (${usableAbilities.length})</b><small>1 PA · massimo 2 per turno</small></summary>${abilityHtml||'<p class="empty-note">Nessuna abilità utilizzabile adesso: controlla la Fatica e le condizioni delle carte.</p>'}</details>`;
    if(blockedAbilities.length)html+=`<details class="action-group action-fold"><summary><b>Altre abilità (${blockedAbilities.length})</b><small>Bloccate o non ancora automatizzate</small></summary>${blockedHtml}</details>`;
    if(isAttack){
      const rankups=currentPlayer.hand.filter(id=>CARD_BY_ID[id]?.version==='Leggendaria').map(id=>({id,card:CARD_BY_ID[id],unit:getFieldUnits(currentPlayer).find(u=>u.baseCardId===CARD_BY_ID[id].baseCardId&&!CARD_BY_ID[u.cardId].version.includes('Leggendaria'))})).filter(x=>x.unit);
      if(rankups.length)html+=`<details class="action-group action-fold"><summary><b>Rank Up (${rankups.length})</b><small>2 PA · solo attacco</small></summary>${rankups.map(x=>`<button class="ability-action rankup-action" data-rankup="${x.id}" data-unit="${x.unit.instanceId}" ${m.ap.human<2?'disabled':''}><span class="ability-action-meta"><b>${esc(x.card.name)} · Leggendaria</b><small>${esc(x.unit.name)} → versione Leggendaria</small></span><span class="ability-action-status">2 PA</span></button>`).join('')}</details>`;
      const tactics=currentPlayer.hand.filter(id=>id.startsWith('TO'));
      if(tactics.length)html+=`<details class="action-group action-fold"><summary><b>Tattiche offensive (${tactics.length})</b><small>1 PA</small></summary>${tactics.map(id=>{const c=CARD_BY_ID[id],locked=m.eventFlags.blockOffensiveTactics;return `<button class="ability-action tactic-action" data-tactic="${id}" ${m.ap.human<1||locked?'disabled':''}><span class="ability-action-meta"><b>${esc(c.name)}</b><small>${esc(c.effect)}</small></span><span class="ability-action-status">${locked?'BLOCCATA':'1 PA'}</span></button>`;}).join('')}</details>`;
    } else {
      const tactics=currentPlayer.hand.filter(id=>id.startsWith('TD'));
      if(tactics.length)html+=`<details class="action-group action-fold"><summary><b>Tattiche difensive (${tactics.length})</b><small>1 PA</small></summary>${tactics.map(id=>{const c=CARD_BY_ID[id];return `<button class="ability-action tactic-action" data-tactic="${id}" ${m.ap.human<1?'disabled':''}><span class="ability-action-meta"><b>${esc(c.name)}</b><small>${esc(c.effect)}</small></span><span class="ability-action-status">1 PA</span></button>`;}).join('')}</details>`;
    }
    const commonCards=isAttack?currentPlayer.hand.filter(id=>CARD_BY_ID[id]?.type==='player'&&CARD_BY_ID[id].version==='Comune'):[];
    if(commonCards.length&&currentPlayer.bench.length<5)html+=`<div class="action-group"><div class="action-group-head"><b>Rinforzi</b><small>1 PA</small></div>${commonCards.map(id=>`<button class="ability-action" data-recruit="${id}" ${m.ap.human<1?'disabled':''}><span class="ability-action-meta"><b>${esc(CARD_BY_ID[id].name)}</b><small>${roleLabel(CARD_BY_ID[id].role)}</small></span><span class="ability-action-status">RECLUTA</span></button>`).join('')}</div>`;
  }else html+=`<div class="cpu-wait"><span class="spinner"></span><div><b>Il Computer sta scegliendo la sua mossa</b><small>La fase si aggiorna automaticamente.</small></div></div>`;
  $('#action-content').innerHTML=html;
  if(isAttack&&humanActor)$('#action-footer').innerHTML=`<button id="finish-actions" class="btn btn-primary btn-wide">Concludi attacco e passa alla difesa <span>→</span></button>`;
  else if(isResponse&&humanActor)$('#action-footer').innerHTML=`<button id="pass-response" class="btn btn-outline btn-wide">Passa la risposta <span>→</span></button>`;
  else if(isDefense&&humanActor)$('#action-footer').innerHTML=`<button id="finish-defense" class="btn btn-primary btn-wide">Concludi la difesa e calcola lo Showdown <span>→</span></button>`;
}

function renderHand(){
  const m=state.match,p=getPlayer(m,'human');
  $('#hand-count').textContent=`${p.hand.length} carte`;
  $('#hand-grid').innerHTML=p.hand.length?p.hand.map(id=>{
    const c=CARD_BY_ID[id];const type=c.type==='tactic'?'TATTICA':c.type==='event'?'EVENTO':c.version==='Leggendaria'?'LEGGENDA':'GIOCATORE';
    const rankable=c.version==='Leggendaria'&&getFieldUnits(p).some(u=>u.baseCardId===c.baseCardId&&!CARD_BY_ID[u.cardId].version.includes('Leggendaria'));
    const canPlayTactic=(m.phase==='actions'&&m.actorId==='human'&&id.startsWith('TO'))||(['response','defense'].includes(m.phase)&&m.actorId==='human'&&id.startsWith('TD'));
    const canRecruit=c.type==='player'&&c.version==='Comune'&&m.actorId==='human'&&['actions','response'].includes(m.phase)&&p.bench.length<5;
    const playable=rankable||canPlayTactic||canRecruit;
    return `<article class="hand-card"><div class="hand-card-top"><span>${type}</span><span>${c.version||''}</span></div><b>${esc(c.name)}</b><p>${esc(c.effect||c.epithet||c.abilities?.map(a=>a.name).join(' · ')||'')}</p>${rankable?`<small>Rank Up · 2 PA</small>`:canPlayTactic?`<small>Giocabile · 1 PA</small>`:canRecruit?`<small>Rinforzo · 1 PA</small>`:`<small>Non giocabile in questa fase</small>`}</article>`;
  }).join(''):'<div class="empty-note hand-empty">Mano vuota. Le pescate automatiche e le passive compariranno qui.</div>';
}

function showdownBars(s){
  const max=Math.max(1,s.attackTotal,s.defenseTotal);
  const attackWidth=Math.max(3,Math.round(s.attackTotal/max*100));
  const defenseWidth=Math.max(3,Math.round(s.defenseTotal/max*100));
  return `<div class="showdown-bars">
    <div class="showdown-bar-row attack"><div><b>ATTACCO</b><strong>${s.attackTotal}</strong></div><div class="showdown-track"><i style="width:${attackWidth}%"></i></div></div>
    <div class="showdown-bar-row defense"><div><b>DIFESA</b><strong>${s.defenseTotal}</strong></div><div class="showdown-track"><i style="width:${defenseWidth}%"></i></div></div>
    <div class="showdown-difference"><span>DIFFERENZA</span><b>${s.difference>0?'+':''}${s.difference}</b></div>
  </div>`;
}

function renderShowdown(){
  const m=state.match;const panel=$('#showdown-panel');
  if(!m.showdown){panel.hidden=true;panel.innerHTML='';return;}
  const s=m.showdown;
  panel.hidden=false;
  if(s.defenseWins){panel.innerHTML=`<div class="resolution-top"><span class="eyebrow">03 · SHOWDOWN</span><span class="verdict-pill defense">VINCE LA DIFESA</span></div><h2>Attacco fermato.</h2>${showdownBars(s)}<div class="margin-callout"><b>+${Math.abs(s.difference)} al prossimo Showdown offensivo</b><span>Il margine completo viene conservato e aggiunto quando questa squadra attaccherà.</span></div><p class="no-shot-message">Niente tiro in porta: la vittoria difensiva chiude l’azione.</p>`;
  }else{panel.innerHTML=`<div class="resolution-top"><span class="eyebrow">03 · SHOWDOWN</span><span class="verdict-pill attack">${s.attackWins?'VINCE L’ATTACCO':'PARITÀ · TIRO CONSENTITO'}</span></div><h2>${s.attackWins?'L’attacco conquista il tiro.':'La parità lascia aperta l’occasione.'}</h2>${showdownBars(s)}<div class="margin-callout"><b>${s.attackWins?`Bonus al tiro: +${s.shotBonus}`:'Bonus al tiro: +0'}</b><span>${s.carryover?`Nel totale d’attacco era incluso il bonus accumulato di +${s.carryover}.`:s.attackWins?'Il bonus al tiro è metà del margine, arrotondato per difetto.':'Con la parità il tiro è consentito senza bonus.'}</span></div>`;}
}

function renderShot(){
  const m=state.match,p=getPlayer(m,m.attackerId),panel=$('#shot-panel');
  if(m.phase!=='shot'&&!m.shot){panel.hidden=true;panel.innerHTML='';return;}
  panel.hidden=false;
  if(m.shot){const s=m.shot;if(s.result==='no_shooter'){panel.innerHTML=`<div class="resolution-top"><span class="eyebrow">04 · TIRO IN PORTA</span><span class="verdict-pill defense">TIRO NON ESEGUITO</span></div><h2>Nessun tiratore disponibile.</h2><p class="shot-caption">La fase di tiro si chiude automaticamente e il turno termina senza bloccare la partita.</p>`;return;}panel.innerHTML=`<div class="resolution-top"><span class="eyebrow">04 · TIRO IN PORTA · D20</span><span class="verdict-pill ${s.result==='goal'?'goal':'save'}">${s.result==='goal'?'GOL':'PARATA'}</span></div><h2>${s.result==='goal'?'La rete si gonfia!':'Il portiere respinge!'}</h2><div class="dice-duel"><div class="dice-side"><small>TIRO · ${esc(s.shooter)}</small><div class="die">${s.shotRoll}</div><span>D20 ${s.shotRoll} + TEC ${s.technique} + BONUS ${s.shotBonus}</span><strong>${s.shotTotal}</strong></div><div class="dice-vs">VS</div><div class="dice-side"><small>PARATA · ${esc(s.keeper)}</small><div class="die keeper-die">${s.keeperRoll}</div><span>D20 ${s.keeperRoll} + PAR ${s.parry}${s.emergencyKeeper?' · emergenza':''}</span><strong>${s.saveTotal}</strong></div></div><p class="shot-caption">${s.shotTotal>s.saveTotal?'Il valore del tiro supera quello della parata.':'La parata è pari o superiore al tiro: niente gol.'}</p>`;return;}
  const eligible=getFieldUnits(p).filter(u=>!(getPlayer(m,m.defenderId).flags.blockAttackerShot&&u.role==='attacker'));
  if(!eligible.length){panel.innerHTML=`<div class="resolution-top"><span class="eyebrow">TIRO NON DISPONIBILE</span><span class="verdict-pill defense">NESSUN TIRATORE</span></div><h2>La squadra non ha giocatori disponibili per il tiro.</h2><p>Il turno termina senza tiro in porta.</p>`;return;}
  panel.innerHTML=`<div class="resolution-top"><span class="eyebrow">DUELLO FINALE</span><span class="verdict-pill attack">TIRO IN PORTA</span></div><h2>Chi calcia?</h2><p>Seleziona il tiratore. Il sistema lancerà un D20 per il tiro e uno per il portiere.</p><div class="shot-controls"><label>Tiratore<select id="shooter-select">${eligible.map(u=>`<option value="${u.instanceId}">${esc(u.name)} · TEC ${getUnitStats(u).technique}</option>`).join('')}</select></label><button id="take-shot" class="btn btn-primary" ${eligible.length?'':'disabled'}>Tira in porta <span>⚽</span></button></div>`;
}

function renderLog(){
  const logs=state.match.log;const view=state.logExpanded?logs:logs.slice(0,7);
  $('#match-log').innerHTML=view.map(item=>`<div class="log-item log-${item.kind}"><i></i><span>${esc(item.text)}</span></div>`).join('');
  $('#toggle-log').textContent=state.logExpanded?'Riduci':'Mostra tutto';
  $('#toggle-log').hidden=logs.length<=7;
}

function renderResult(){
  const m=state.match;const area=$('#match-result');
  if(m.phase!=='finished'){area.hidden=true;area.innerHTML='';return;}
  area.hidden=false;const human=getPlayer(m,'human'),cpu=getPlayer(m,'cpu');
  area.innerHTML=`<span class="eyebrow">FISCHIO FINALE</span><h2>${human.goals===cpu.goals?'Pareggio!':human.goals>cpu.goals?'Hai vinto!':'Il Computer ha vinto.'}</h2><p>Risultato finale: <b>${human.goals} – ${cpu.goals}</b></p><button id="new-match" class="btn btn-primary btn-wide">Nuova partita</button>`;
}

function render(){
  if(!state.match)return;
  if(state.match.phase==='showdown_ready')state.match=resolveShowdown(state.match);
  const m=state.match;
  renderHeader();renderTeam('human');renderTeam('cpu');renderActionArea();renderHand();renderShowdown();renderShot();renderLog();
  $('#next-turn-area').hidden=m.phase!=='turn_end';
  $('#action-station').hidden=!(m.phase==='actions'||m.phase==='response'||m.phase==='defense');
  if(m.phase==='turn_end')$('#action-station').hidden=true;
  renderResult();
  if(m.phase==='shot'&&m.attackerId==='cpu')driveCpu();
  if((m.phase==='actions'||m.phase==='response'||m.phase==='defense')&&m.actorId==='cpu')driveCpu();
}

function dialog(title,copy,fields,submit){
  const dlg=$('#action-dialog');$('#dialog-title').textContent=title;$('#dialog-copy').textContent=copy;$('#dialog-fields').innerHTML=fields;state.dialogSubmit=submit;dlg.showModal();
}
function closeDialog(){$('#action-dialog').close();state.dialogSubmit=null;}
function fieldOptions(playerId, roleFilter=null){
  const p=getPlayer(state.match,playerId);return getFieldUnits(p).filter(u=>!roleFilter||u.role===roleFilter).map(u=>`<option value="${u.instanceId}">${esc(u.name)} · ${roleLabel(u.role)}</option>`).join('');
}
function actionDialogForAbility(unitId,index){
  const player=getPlayer(state.match,'human'),unit=player.field?Object.values(player.field).find(u=>u?.instanceId===unitId):null;
  const card=CARD_BY_ID[unit.cardId],ability=card.abilities[index],key=`${card.id}:${index}`;
  let fields='';
  if(['PG03-C:1','PG04-C:1','PG04-L:0','PG06-L:1','PG07-C:2'].includes(key))fields+=`<label>Bersaglio<select name="targetId">${fieldOptions('human')}</select></label>`;
  if(['PG09-C:1','PG09-L:1'].includes(key))fields+=`<label>Bersaglio avversario<select name="targetId">${fieldOptions('cpu')}</select></label>`;
  if(['PG04-C:1','PG04-L:0','PG05-L:0'].includes(key)){
    const opts=key==='PG04-C:1'?[['buff','+3 Tecnica a un tuo giocatore'],['recover','Recupera 2 Fatica agli altri tuoi giocatori']]:key==='PG04-L:0'?[['recover','Un giocatore recupera 2 Fatica'],['draw','Pesca 1 Carta Tattica'],['buff','+2 Tecnica a un tuo giocatore']]:[['shot','+2 Tecnica al prossimo tiro'],['draw','Pesca 1 carta']];
    fields+=`<label>Effetto<select name="choice">${opts.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('')}</select></label>`;
  }
  if(key==='PG03-L:0')fields+=`<label>Giocatori da potenziare<select name="targets" multiple size="4">${fieldOptions('human')}</select><small class="field-help">D20 11+: seleziona fino a 3 giocatori. Con 1–10 non si applica il bonus.</small></label>`;
  if(key==='PG03-L:1'||key==='PG09-C:3')fields+=`<label>Carta da scartare (opzionale)<select name="discardId"><option value="">Nessuna</option>${player.hand.map(id=>`<option value="${id}">${esc(CARD_BY_ID[id].name)}</option>`).join('')}</select></label>`;
  dialog(ability.name,ability.text,fields,form=>{
    const fd=new FormData(form),options={};for(const [k,v] of fd.entries()){if(k==='targets'){options.targets=fd.getAll('targets');}else if(v)options[k]=v;}
    const isEnemy=['PG09-C:1','PG09-L:1'].includes(key);if(isEnemy)options.targetSide='enemy';
    applyHumanState(s=>performAbility(s,'human',unitId,index,options));
  });
}

function actionDialogForTactic(cardId){
  const card=CARD_BY_ID[cardId];let fields='';
  if(['TO04','TO06','TO07'].includes(cardId))fields=`<label>Giocatore<select name="targetId">${fieldOptions('human')}</select></label>`;
  if(cardId==='TO08')fields=`<label>Attaccante<select name="targetId">${fieldOptions('human','attacker')}</select></label>`;
  if(cardId==='TD04')fields=`<label>Giocatore avversario<select name="targetId">${fieldOptions('cpu')}</select></label>`;
  if(cardId==='TD09')fields=`<label>Attaccante avversario<select name="targetId">${fieldOptions('cpu','attacker')}</select></label>`;
  dialog(card.name,card.effect,fields,form=>{const fd=new FormData(form);applyHumanState(s=>playTacticAction(s,'human',cardId,Object.fromEntries(fd.entries())));});
}
function actionDialogForRankup(unitId,legendaryId){
  const unit=getPlayer(state.match,'human').field[ROLES.find(r=>getPlayer(state.match,'human').field[r.id]?.instanceId===unitId)?.id];
  const card=CARD_BY_ID[legendaryId];dialog(`Rank Up · ${card.name}`,`La versione Leggendaria sostituisce quella Comune. Costo: 2 Punti Azione.`, '', ()=>applyHumanState(s=>rankUp(s,'human',unitId,legendaryId)));
}

function applyHumanState(mutator){
  try{state.match=mutator(state.match);closeDialog();render();driveCpu();}
  catch(error){showToast(error.message);}
}

function handleActionClick(event){
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.abilityUnit!==undefined){actionDialogForAbility(target.dataset.abilityUnit,Number(target.dataset.abilityIndex));return;}
  if(target.dataset.tactic){actionDialogForTactic(target.dataset.tactic);return;}
  if(target.dataset.rankup){actionDialogForRankup(target.dataset.unit,target.dataset.rankup);return;}
  if(target.dataset.recruit){applyHumanState(s=>recruitToBench(s,'human',target.dataset.recruit));return;}
  if(target.dataset.benchIn){const p=getPlayer(state.match,'human');const bench=p.bench.find(u=>u.instanceId===target.dataset.benchIn);if(!bench)return;applyHumanState(s=>substituteFromBench(s,'human',target.dataset.benchIn,bench.role));return;}
  if(target.id==='finish-actions'){finishHumanActions();return;}
  if(target.id==='finish-defense'){finishHumanDefense();return;}
  if(target.id==='pass-response'){try{state.match=passResponse(state.match,'human');render();driveCpu();}catch(e){showToast(e.message);}return;}
  if(target.id==='take-shot'){const id=$('#shooter-select')?.value;if(!id){showToast('Scegli un tiratore.');return;}try{state.match=resolveShot(state.match,id);render();}catch(e){showToast(e.message);}return;}
  if(target.id==='next-turn'){try{state.match=advanceTurn(state.match);render();driveCpu();}catch(e){showToast(e.message);}return;}
  if(target.id==='new-match'||target.id==='back-to-setup'){resetToSetup();return;}
}

function finishHumanActions(){
  try{state.match=finishAttackingPhase(state.match,'human');render();driveCpu();}
  catch(e){showToast(e.message);}
}
function finishHumanDefense(){
  try{state.match=finishDefensePhase(state.match,'human');render();driveCpu();}
  catch(e){showToast(e.message);}
}

async function driveCpu(){
  if(state.cpuBusy||!state.match)return;
  state.cpuBusy=true;
  try{
    let guard=0;
    while(guard++<30){
      const m=state.match;
      if(m.phase==='finished'||m.phase==='turn_end')break;
      if(m.phase==='showdown_ready'){state.match=resolveShowdown(m);render();continue;}
      if(m.phase==='shot'){
        if(m.attackerId==='cpu'){
          await wait(550);const p=getPlayer(state.match,'cpu');const shooter=getFieldUnits(p).filter(u=>u.role!=='goalkeeper').sort((a,b)=>getUnitStats(b).technique-getUnitStats(a).technique)[0]||getFieldUnits(p)[0];
          if(shooter){state.match=resolveShot(state.match,shooter.instanceId);render();}
        }
        break;
      }
      if(['response','defense','actions'].includes(m.phase)&&m.actorId==='human')break;
      if(m.phase==='response'&&m.actorId==='cpu'){
        await wait(280);const action=getNextCpuAction(state.match);
        if(action)state.match=doCpuAction(state.match,action);else state.match=passResponse(state.match,'cpu');
        render();continue;
      }
      if(m.phase==='defense'&&m.actorId==='cpu'){
        await wait(280);const action=getNextCpuAction(state.match);
        if(action)state.match=doCpuAction(state.match,action);else state.match=finishDefensePhase(state.match,'cpu');
        render();continue;
      }
      if(m.phase==='actions'&&m.actorId==='cpu'){
        await wait(300);const action=getNextCpuAction(state.match);
        if(action)state.match=doCpuAction(state.match,action);else state.match=finishAttackingPhase(state.match,'cpu');
        render();continue;
      }
      break;
    }
  }catch(error){showToast(`Computer: ${error.message}`);}
  finally{state.cpuBusy=false;}
}
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function resetToSetup(){
  state.match=null;$('#match-view').hidden=true;$('#setup-view').hidden=false;window.scrollTo({top:0,behavior:'smooth'});
}

function wire(){
  $('#start-game').addEventListener('click',startMatch);
  $('#back-to-setup').addEventListener('click',resetToSetup);
  $('#match-view').addEventListener('click',handleActionClick);
  $('#toggle-log').addEventListener('click',()=>{state.logExpanded=!state.logExpanded;renderLog();});
  $('#dialog-cancel').addEventListener('click',closeDialog);$('#dialog-x').addEventListener('click',closeDialog);
  $('#action-form').addEventListener('submit',event=>{event.preventDefault();const submit=state.dialogSubmit;if(submit)submit(event.currentTarget);});
}

setupHTML();wire();
