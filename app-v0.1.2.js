import { CATALOG, CARDS, CARD_BY_ID, canAutomateTactic, getAbilityRule } from "./catalog-v0.1.2.js";
import { abilityWindowLabel } from "./ability-rules-v0.1.2.js";
import { LocalMatch } from "./match-v0.1.2.js";
import { getActiveStats, getAbilityCost } from "./engine-v0.1.2.js";
import { setupOnline } from "./online-v0.1.2.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let localMatch = null;
let toastTimer = null;

const AUTOMATIC_ABILITY_NOTES = {
  'PG10-C:0': 'Peschi automaticamente 1 carta quando San Zorro tira in porta.',
  'PG10-C:1': 'Peschi automaticamente 1 carta aggiuntiva quando San Zorro segna.',
  'PG10-L:0': 'A ogni tiro: costo 3 Fatica, poi peschi 1 carta se la riserva è sufficiente.',
  'PG10-L:1': 'Quando San Zorro Leggendario segna: costo 2 Fatica e peschi 1 carta, se la riserva è sufficiente.',
  'PG02-C:1': 'Quando il portiere para, recupera automaticamente 2 Fatica.',
  'PG02-C:0': 'Quando subisci un gol, il motore applica il costo di 1 Fatica e pesca 1 carta se la riserva è sufficiente.',
  'PG02-L:2': 'Quando subisci un gol, il motore applica il costo di 1 Fatica e pesca 1 carta se la riserva è sufficiente.',
  'PG08-C:1': 'Quando San Bardelle segna, pesca automaticamente 1 carta.',
  'PG08-L:3': 'Quando San Bardelle segna, pesca 1 carta e recupera 1 Fatica.',
  'PG06-L:0': 'Passiva applicata nel calcolo dello Showdown (+1 Attacco per ogni alleato in campo) e al tiro avversario (−1).',
  'PG06-L:2': 'Quando un tuo giocatore segna, il motore applica il costo di 1 Fatica e pesca 1 carta se la riserva è sufficiente.',
  'PG09-L:0': 'Manuel Zulfio Leggendario non perde Fatica durante il mantenimento.',
  'PG09-L:2': 'Le abilità avversarie costano +1 Fatica, fino a un massimo di 3.'
};

const REACTIVE_ABILITY_NOTES = {
  'PG03-C:0': 'Reazione ai danni su un tuo Difensore: il prototipo non ha ancora una finestra di risposta ai danni.',
  'PG03-C:2': 'Reazione a un recupero Fatica: non ancora automatizzata.',
  'PG03-L:2': 'Reazione quando San Enrichetto subisce danni: non ancora automatizzata.',
  'PG04-L:1': 'Reazione quando un alleato perde Fatica per un effetto avversario: non ancora automatizzata.',
  'PG04-L:2': 'Effetto a inizio turno: la scelta e il lancio non sono ancora automatizzati.',
  'PG05-C:0': 'Rilancio reattivo di un dado per un effetto di una tua carta: non ancora automatizzato.',
  'PG05-L:1': 'Reazione quando San Zakaria viene scelto per un tiro: non ancora automatizzata.',
  'PG06-C:1': 'Reazione quando un alleato sta per entrare in Break Time: non ancora automatizzata.',
  'PG06-L:3': 'Abilità una volta per partita: gestione del prossimo costo abilità ancora da completare.',
  'PG07-C:0': 'Passiva reattiva quando l’avversario attiva un’abilità: non ancora automatizzata.',
  'PG07-C:1': 'Riduzione della Fatica persa per effetto avversario: non ancora automatizzata.',
  'PG07-L:0': 'Passiva reattiva quando l’avversario attiva un’abilità: non ancora automatizzata.',
  'PG07-L:1': 'Annullamento del prossimo effetto negativo: non ancora automatizzato.',
  'PG07-L:2': 'Bonus di squadra e riduzione della Fatica massima: non ancora automatizzati.',
  'PG07-L:3': 'Riduzione della Fatica persa per effetto avversario: non ancora automatizzata.',
  'PG08-L:2': 'Rilancio del D20 dopo il tiro: non ancora automatizzato.',
  'PG09-C:0': 'Effetto applicato quando Manuel Zulfio entra in campo: non ancora automatizzato.',
  'PG09-C:2': 'Reazione quando Manuel Zulfio dovrebbe andare in Break Time: non ancora automatizzata.',
  'PG09-C:3': 'Reazione quando uno dei due giocatori usa una Tattica: non ancora automatizzata.',
  'PG09-L:3': 'Reazione quando Manuel Zulfio dovrebbe essere eliminato: non ancora automatizzata.'
};

function showPanel(panelName) {
  $$('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${panelName}`));
  $$('.nav-link[data-panel]').forEach(link => link.classList.toggle('active', link.dataset.panel === panelName));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[char]));
}

function playerStatsMarkup(card) {
  const stats = card.stats ?? {};
  const entries = [
    ['ATT',stats.Attacco],['DIF',stats.Difesa],
    [stats.Parata !== undefined ? 'PAR' : 'TEC',stats.Parata ?? stats.Tecnica],['FAT',stats.Fatica]
  ];
  return `<div class="catalog-card-stats">${entries.map(([label,value]) => `<div><b>${value ?? '—'}</b><small>${label}</small></div>`).join('')}</div>`;
}

function openCardDialog(cardId) {
  const card = CARD_BY_ID[cardId];
  if (!card) return;
  let body = `<div class="dialog-kicker">${escapeHtml(card.id)} · ${escapeHtml(card.category ?? card.type ?? '')} ${card.version ? `· ${escapeHtml(card.version)}` : ''}</div>`;
  body += `<h2 class="dialog-title">${escapeHtml(card.name)}</h2>`;
  if (card.epithet) body += `<p class="muted-note">${escapeHtml(card.epithet)} · ${escapeHtml(card.roleLabel)}</p>`;
  if (card.type === 'player') body += playerStatsMarkup(card);
  if (card.abilities?.length) {
    body += card.abilities.map(ability => `<div class="dialog-ability"><strong>${escapeHtml(ability.name)}</strong><small>${escapeHtml(ability.kind)}</small><p>${escapeHtml(ability.text)}</p></div>`).join('');
  } else if (card.effect) {
    body += `<div class="dialog-ability"><strong>Effetto</strong><p>${escapeHtml(card.effect)}</p>${card.motto ? `<p><em>“${escapeHtml(card.motto)}”</em></p>` : ''}</div>`;
  }
  if (card.reviewNote) body += `<div class="archive-note">${escapeHtml(card.reviewNote)}</div>`;
  body += `<div class="dialog-source">Fonte: ${escapeHtml(card.source ?? 'Catalogo')}</div>`;
  $('#dialog-content').innerHTML = body;
  $('#card-dialog').showModal();
}

function renderCollection() {
  const query = ($('#card-search').value ?? '').trim().toLowerCase();
  const type = $('#card-filter').value;
  const rarity = $('#rarity-filter').value;
  const filtered = CARDS.filter(card => {
    const text = `${card.name} ${card.id} ${card.epithet ?? ''} ${card.effect ?? ''} ${(card.abilities ?? []).map(a => `${a.name} ${a.text}`).join(' ')}`.toLowerCase();
    const matchesType = type === 'all' || card.type === type;
    const matchesRarity = rarity === 'all' || card.version === rarity;
    return matchesType && matchesRarity && text.includes(query);
  });
  $('#collection-grid').innerHTML = filtered.map(card => {
    const typeLabel = card.type === 'player' ? card.roleLabel : card.type === 'tactic' ? card.subtype : 'Evento';
    const preview = card.abilities?.[0]?.text ?? card.effect ?? '';
    return `<article class="catalog-card" data-card-detail="${escapeHtml(card.id)}" tabindex="0" role="button" aria-label="Apri ${escapeHtml(card.name)}">
      <div class="catalog-card-top"><span>${escapeHtml(card.id)}</span><span class="rarity-tag">${escapeHtml(card.version ?? card.rarity ?? typeLabel)}</span></div>
      <h3>${escapeHtml(card.name)}</h3><div class="epithet">${escapeHtml(card.epithet ?? typeLabel)}</div>
      ${card.type === 'player' ? playerStatsMarkup(card) : ''}
      <div class="card-preview">${escapeHtml(preview)}</div>
    </article>`;
  }).join('') || '<p class="muted-note">Nessuna carta trovata con questi filtri.</p>';
}

function abilityStatus(unit, card, ability, index, owner, match) {
  const key = `${card.id}:${index}`;
  if (AUTOMATIC_ABILITY_NOTES[key]) return { label: 'Automatica', kind: 'passive', enabled: false, reason: AUTOMATIC_ABILITY_NOTES[key] };
  if (REACTIVE_ABILITY_NOTES[key]) return { label: 'Reazione non automatizzata', kind: 'unconfigured', enabled: false, reason: REACTIVE_ABILITY_NOTES[key] };
  if (ability.costFatigue == null || String(ability.kind).toLowerCase().includes('passiva')) {
    return { label: 'Passiva', kind: 'passive', enabled: false, reason: 'Si attiva quando si verifica la condizione indicata sulla carta.' };
  }
  const rule = getAbilityRule(card.id, index);
  if (!rule) return { label: 'Effetto non ancora automatizzato', kind: 'unconfigured', enabled: false, reason: 'L’effetto è conservato nel catalogo, ma non è ancora gestito dal motore.' };
  if (owner.id !== match.humanId || !match.isHumanTurn) return { label: abilityWindowLabel(rule), kind: 'waiting', enabled: false, reason: 'Disponibile durante il tuo turno.' };
  const fatigue = unit.legendaryOverlay?.fatigue ?? unit.fatigue;
  const effectiveCost = getAbilityCost(match.state, owner.id, card.id, index) ?? ability.costFatigue;
  if (fatigue < effectiveCost) return { label: 'Fatica insufficiente', kind: 'waiting', enabled: false, reason: `Servono ${effectiveCost} Fatica; disponibili ${fatigue}.` };
  if (rule.oncePerTurn && unit.abilityUses?.[index] === match.state.currentTurn) return { label: 'Già usata', kind: 'waiting', enabled: false, reason: 'Limite: una volta per turno.' };
  const player = owner;
  const showdown = match.state.lastShowdown;
  if (rule.timing === 'preShowdown' && player.turnFlags.showdownResolved) return { label: 'Showdown già risolto', kind: 'waiting', enabled: false, reason: 'Questa abilità va usata prima dello Showdown.' };
  if (rule.timing === 'afterShowdownWin') {
    if (!showdown || showdown.turn !== match.state.currentTurn || showdown.attackerId !== player.id || showdown.difference <= 0) return { label: 'Dopo uno Showdown vinto', kind: 'waiting', enabled: false, reason: 'Vinci prima il tuo Showdown per attivarla.' };
    if (rule.minDifference && showdown.difference < rule.minDifference) return { label: `Vantaggio minimo ${rule.minDifference}`, kind: 'waiting', enabled: false, reason: `Il vantaggio attuale è ${showdown.difference}.` };
    if (rule.requiresShowdownParticipation && !showdown.attackerUnits?.some(entry => entry.instanceId === unit.instanceId)) return { label: 'Non ha partecipato', kind: 'waiting', enabled: false, reason: 'Questo giocatore doveva essere in campo durante lo Showdown.' };
    if (player.turnFlags.shotResolved) return { label: 'Tiro già effettuato', kind: 'waiting', enabled: false, reason: 'Questa abilità va attivata prima del tiro.' };
  }
  if (rule.timing === 'afterShowdownLoss' && (!showdown || showdown.turn !== match.state.currentTurn || showdown.attackerId !== player.id || showdown.difference >= 0)) return { label: 'Dopo uno Showdown perso', kind: 'waiting', enabled: false, reason: 'Attivabile quando perdi il tuo Showdown.' };
  if (rule.timing === 'afterTactic' && player.lastTacticTurn !== match.state.currentTurn) return { label: 'Dopo una Tattica', kind: 'waiting', enabled: false, reason: 'Gioca prima una Carta Tattica in questo turno.' };
  if (rule.timing === 'beforeShot' && (!player.turnFlags.showdownResolved || player.turnFlags.shotResolved)) return { label: 'Prima del tiro', kind: 'waiting', enabled: false, reason: 'Risolvi lo Showdown e attivala prima del tiro.' };
  if (rule.requiredShooter && $('#shot-player').value !== unit.instanceId) return { label: 'Seleziona come tiratore', kind: 'waiting', enabled: false, reason: 'Scegli questo giocatore nel menu Tiratore.' };
  return { label: 'Disponibile ora', kind: 'available', enabled: true, reason: abilityWindowLabel(rule), effectiveCost };
}

function renderUnit(unit, owner, match) {
  const shownId = unit.legendaryOverlay?.cardId ?? unit.cardId;
  const card = CARD_BY_ID[shownId] ?? CARD_BY_ID[unit.cardId];
  const stats = getActiveStats(unit);
  if (owner.field.some(ally => (ally.legendaryOverlay?.cardId ?? ally.cardId) === 'PG06-L')) stats.attack += 1;
  const fatigue = unit.legendaryOverlay?.fatigue ?? unit.fatigue;
  const maxFatigue = unit.legendaryOverlay?.maxFatigue ?? unit.maxFatigue;
  const isHuman = owner.id === match.humanId;
  const canSwap = isHuman && match.isHumanTurn && !unit.legendaryOverlay;
  const replacements = canSwap ? owner.bench.filter(b => b.role === unit.role) : [];
  const actions = replacements.map(bench => `<button class="mini-action" data-action="substitute" data-out="${escapeHtml(unit.instanceId)}" data-in="${escapeHtml(bench.instanceId)}">Entra ${escapeHtml(bench.name)}</button>`).join('');
  const fatigueRatio = maxFatigue ? fatigue / maxFatigue : 0;
  const fatigueClass = fatigueRatio <= .25 ? 'low' : fatigueRatio <= .55 ? 'mid' : 'high';
  const abilityRows = (card?.abilities ?? []).map((ability, index) => {
    const state = abilityStatus(unit, card, ability, index, owner, match);
    const effectiveCost = ability.costFatigue == null ? null : getAbilityCost(match.state, owner.id, card.id, index) ?? ability.costFatigue;
    const cost = ability.costFatigue == null ? 'PASSIVA' : `COSTO ${effectiveCost} FAT.`;
    const hasManualRule = Boolean(getAbilityRule(card.id, index)) && ability.costFatigue != null;
    const action = hasManualRule
      ? `<button class="mini-action ability-trigger" data-action="activate-ability" data-unit="${escapeHtml(unit.instanceId)}" data-ability="${index}" ${state.enabled ? '' : 'disabled'}>${state.enabled ? `Attiva · ${state.effectiveCost ?? effectiveCost} Fatica` : 'Non disponibile ora'}</button>`
      : '';
    return `<div class="ability-entry"><div class="ability-entry-head"><strong>${escapeHtml(ability.name)}</strong><span class="ability-cost">${cost}</span></div><span class="ability-status ${state.kind}">${escapeHtml(state.label)}</span><p>${escapeHtml(ability.text)}</p>${action}${state.reason ? `<small class="ability-status ${state.kind}">${escapeHtml(state.reason)}</small>` : ''}</div>`;
  }).join('');
  return `<div class="unit-card">
    <div class="role-line"><span class="unit-role-tag">${escapeHtml(card?.roleLabel ?? unit.role)}</span>${unit.legendaryOverlay ? '<span class="rarity-tag">LEGGENDARIA</span>' : ''}</div>
    <h3>${escapeHtml(card?.name ?? unit.name)}</h3>
    <div class="unit-meta"><span>ATT <b>${stats.attack}</b></span><span>DIF <b>${stats.defense}</b></span><span>${unit.role === 'goalkeeper' ? 'PAR' : 'TEC'} <b>${unit.role === 'goalkeeper' ? (stats.parry ?? '—') : (stats.technique ?? '—')}</b></span></div>
    <div class="unit-meta"><span>FATICA ATTUALE</span><span class="fatigue-value">${fatigue} / ${maxFatigue}</span></div>
    <div class="fatigue-track ${fatigueClass}"><i style="width:${Math.max(0,Math.min(100,fatigueRatio*100))}%"></i></div>
    <div class="fatigue-caption"><span>${fatigue <= 1 ? '<span class="fatigue-warning">Riserva critica</span>' : '−1 al prossimo inizio turno'}</span><span>${fatigue === 0 ? 'Esaurito' : 'In campo'}</span></div>
    ${abilityRows ? `<details class="unit-abilities" ${isHuman ? 'open' : ''}><summary>ABILITÀ · ${(card?.abilities ?? []).length} · apri per consultare / attivare</summary>${abilityRows}</details>` : ''}
    ${actions ? `<div class="unit-actions">${actions}</div>` : ''}
  </div>`;
}

function renderBench(owner, isHuman, match) {
  if (!owner.bench.length) return '<span class="muted-note">Panchina vuota</span>';
  return owner.bench.map(unit => `<span class="bench-chip"><span class="bench-chip-info"><b>${escapeHtml(unit.name)}</b><small>${escapeHtml(unit.role)} · FATICA ${unit.fatigue}/${unit.maxFatigue}</small></span>${isHuman && match.isHumanTurn ? `<button data-action="open-card" data-card="${escapeHtml(unit.cardId)}" title="Apri scheda">ⓘ</button>` : ''}</span>`).join('');
}

function renderBreakTime(owner) {
  if (!owner.breakTime?.length) return '';
  return `<div class="breaktime-list"><strong>BREAK TIME</strong>${owner.breakTime.map(entry => `<div>${escapeHtml(entry.unit.name)} · ${entry.readyToReturn ? 'pronto al rientro' : `${entry.turnsRemaining} turni completi rimanenti`}</div>`).join('')}</div>`;
}

function renderHandCard(cardId, match) {
  const card = CARD_BY_ID[cardId];
  if (!card) return '';
  let action = '';
  if (match.isHumanTurn && card.type === 'player' && card.version === 'Comune' && card.enginePlayable) {
    action = match.human.bench.length < 5
      ? `<button class="button button-light" data-action="recruit" data-card="${card.id}">Aggiungi in panchina</button>`
      : '<div class="disabled-caption">Panchina piena</div>';
  } else if (match.isHumanTurn && card.type === 'player' && card.version === 'Leggendaria' && card.enginePlayable) {
    const baseUnit = match.human.field.find(unit => unit.cardId === card.baseCardId && !unit.legendaryOverlay);
    action = baseUnit && match.human.substitutionsRemaining >= 2
      ? `<button class="button button-light" data-action="upgrade" data-card="${card.id}" data-unit="${baseUnit.instanceId}">Rank Up · 2 cambi</button>`
      : '<div class="disabled-caption">Serve la Comune in campo e 2 cambi</div>';
  } else if (match.isHumanTurn && card.type === 'tactic' && canAutomateTactic(card) && !match.human.turnFlags.showdownResolved) {
    action = `<button class="button button-light" data-action="play-tactic" data-card="${card.id}">Gioca tattica</button>`;
  } else if (card.type === 'tactic') {
    action = `<div class="disabled-caption">${card.effectData ? 'Disponibile prima dello Showdown' : 'Effetto da automatizzare'}</div>`;
  } else if (card.type === 'player') {
    action = '<div class="disabled-caption">Scheda giocatore</div>';
  }
  const preview = card.effect ?? card.abilities?.[0]?.text ?? '';
  return `<article class="hand-card"><div class="hand-type">${escapeHtml(card.type === 'player' ? `${card.roleLabel} · ${card.version}` : `${card.subtype ?? 'EVENTO'} · ${card.rarity ?? ''}`)}</div><h4>${escapeHtml(card.name)}</h4><p>${escapeHtml(preview)}</p>${action}<button class="text-button" data-action="open-card" data-card="${card.id}">Dettagli →</button></article>`;
}

function renderShowdownResult(match) {
  const node = $('#showdown-result');
  const s = match.state.lastShowdown;
  if (!s || s.turn !== match.state.currentTurn) { node.hidden = true; node.innerHTML = ''; return; }
  const attacker = match.state.players.find(p => p.id === s.attackerId);
  const defender = match.state.players.find(p => p.id === s.defenderId);
  const winner = s.difference > 0 ? `${attacker.name} vince lo Showdown` : s.difference < 0 ? `${defender.name} vince lo Showdown` : 'Showdown in parità';
  const sideName = id => id === match.humanId ? 'LA TUA SQUADRA' : 'AVVERSARIO';
  node.hidden = false;
  node.innerHTML = `<div class="resolution-heading"><div><div class="eyebrow">FASE 2 · RISULTATO DELLO SHOWDOWN</div><h2>${escapeHtml(winner)}</h2></div><span class="resolution-badge">${s.difference > 0 ? 'Attacco superiore' : s.difference < 0 ? 'Difesa superiore' : 'Parità'}</span></div>
    <div class="showdown-scoreline"><div class="showdown-side"><small>${escapeHtml(sideName(attacker.id))} · ATTACCO</small><strong>${s.attackTotal}</strong></div><div class="showdown-vs">VS</div><div class="showdown-side"><small>${escapeHtml(sideName(defender.id))} · DIFESA</small><strong>${s.defenseTotal}</strong></div></div>
    <div class="showdown-difference"><span>Differenziale Attacco − Difesa</span><strong>${s.difference > 0 ? '+' : ''}${s.difference}</strong></div>
    ${(s.passiveAttackBonus || s.attackerTeamModifier || s.defenderTeamModifier) ? `<div class="bonus-explain">Modificatori inclusi: ${s.passiveAttackBonus ? `Dominio Assoluto +${s.passiveAttackBonus} Attacco` : ''}${s.attackerTeamModifier ? ` · Tattiche Attacco ${s.attackerTeamModifier > 0 ? '+' : ''}${s.attackerTeamModifier}` : ''}${s.defenderTeamModifier ? ` · Tattiche Difesa ${s.defenderTeamModifier > 0 ? '+' : ''}${s.defenderTeamModifier}` : ''}.</div>` : ''}
    <div class="showdown-rosters"><div><b>Attacco in campo</b>${(s.attackerUnits ?? []).map(u => `<span>${escapeHtml(u.name)} <strong>+${u.attack}</strong></span>`).join('')}</div><div><b>Difesa in campo</b>${(s.defenderUnits ?? []).map(u => `<span>${escapeHtml(u.name)} <strong>+${u.defense}</strong></span>`).join('')}</div></div>
    <div class="bonus-explain">Bonus Showdown: <b>+${s.defenderBonus}</b> al difensore (metà del differenziale assoluto, arrotondata per difetto). Si conserva per la sua prossima azione offensiva.</div>`;
}

function renderShotResult(match) {
  const node = $('#shot-result');
  const s = match.state.lastShot;
  if (!s || s.turn !== match.state.currentTurn) { node.hidden = true; node.innerHTML = ''; return; }
  const allUnits = [...match.state.players.flatMap(p => [...p.field, ...p.bench, ...p.breakTime.map(entry => entry.unit)])];
  const shooter = allUnits.find(u => u.instanceId === s.shooterUnitId);
  const goalkeeper = allUnits.find(u => u.instanceId === s.goalkeeperUnitId);
  const teamName = s.attackerId === match.humanId ? 'LA TUA SQUADRA' : 'AVVERSARIO';
  const verdict = s.result === 'goal' ? 'GOL!' : 'PARATA!';
  const extras = s.automaticEffects?.length ? `<div class="shot-extra">Abilità automatiche: ${s.automaticEffects.map(escapeHtml).join(' · ')}</div>` : '';
  node.hidden = false;
  node.innerHTML = `<div class="resolution-heading"><div><div class="eyebrow">FASE 3 · RISOLUZIONE DEL TIRO</div><h2>${escapeHtml(teamName)} · ${escapeHtml(shooter?.name ?? 'Tiratore')}</h2></div><span class="resolution-badge">D20 vs D20</span></div>
    <div class="shot-equation-grid"><div class="shot-side"><small>ATTACCANTE · VALORE TIRO</small><h3>Calcio in porta</h3><div class="dice-equation"><span class="dice-face">${s.shotRoll}</span><span class="dice-term">D20</span><span>+</span><span>Tecnica ${s.technique}</span>${s.showdownBonus ? `<span>+ Showdown ${s.showdownBonus}</span>` : ''}${s.tacticBonus ? `<span>+ Tattica ${s.tacticBonus}</span>` : ''}${s.abilityBonus ? `<span>+ Abilità ${s.abilityBonus}</span>` : ''}${s.opponentPenalty ? `<span>− Dominio avversario ${s.opponentPenalty}</span>` : ''}</div><div class="equation-total"><span>Totale tiro</span><strong>${s.shotTotal}</strong></div></div>
    <div class="shot-side"><small>DIFENSORE · VALORE PARATA</small><h3>${escapeHtml(goalkeeper?.name ?? 'Portiere')}</h3><div class="dice-equation"><span class="dice-face">${s.goalkeeperRoll}</span><span class="dice-term">D20</span><span>+</span><span>Parata ${s.parry}${s.emergencyGoalkeeper ? ' (emergenza)' : ''}</span></div><div class="equation-total"><span>Totale parata</span><strong>${s.saveTotal}</strong></div></div></div>
    <div class="shot-verdict"><strong>${verdict}</strong><p>${s.shotTotal} ${s.shotTotal > s.saveTotal ? '&gt;' : '&le;'} ${s.saveTotal} · ${s.shotTotal > s.saveTotal ? 'il tiro supera la parata' : 'la parata blocca il tiro'}</p></div>${extras}`;
}

function openAbilityDialog(unitId, abilityIndex) {
  const unit = matchUnitForAbility(unitId);
  if (!unit || !localMatch) return;
  const cardId = unit.legendaryOverlay?.cardId ?? unit.cardId;
  const card = CARD_BY_ID[cardId];
  const ability = card?.abilities?.[abilityIndex];
  const rule = getAbilityRule(cardId, abilityIndex);
  if (!ability || !rule) return;
  const controls = [];
  const field = (label, id, options) => `<label class="ability-field">${label}<select name="${id}" required>${options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select></label>`;
  if (rule.choice) controls.push(field('Scegli l’effetto', 'choice', rule.choice));
  const needsFlageTarget = ['flageCommon','flageLegendary'].includes(rule.effect);
  const flageTargetPool = [...localMatch.human.field, ...localMatch.human.bench];
  if (rule.target === 'ally' || rule.target === 'allyField' || needsFlageTarget) {
    let eligible = rule.target === 'allyField' || rule.effect === 'flageCommon'
      ? localMatch.human.field
      : rule.effect === 'flageLegendary' ? flageTargetPool
      : [...localMatch.human.field, ...localMatch.human.bench];
    controls.push(field('Giocatore bersaglio', 'targetUnitId', eligible.map(u => ({ value: u.instanceId, label: `${u.name} · ${u.role}` }))));
  }
  if (rule.target === 'enemy') controls.push(field('Giocatore avversario', 'targetUnitId', localMatch.cpu.field.map(u => ({ value: u.instanceId, label: `${u.name} · ${u.role}` }))));
  if (rule.multiTarget) controls.push(`<div class="ability-field">Seleziona fino a ${rule.maxTargets} giocatori (il bonus si applica con un D20 da 11 in su)<div class="ability-checks">${localMatch.human.field.map(u => `<label><input type="checkbox" name="targetUnitIds" value="${escapeHtml(u.instanceId)}"> ${escapeHtml(u.name)} · ${escapeHtml(u.role)}</label>`).join('')}</div></div>`);
  if (rule.discard) controls.push(field('Carta da scartare dopo la pescata', 'discardCardId', localMatch.human.hand.map(id => ({ value: id, label: CARD_BY_ID[id]?.name ?? id }))));
  const effectiveCost = getAbilityCost(localMatch.state, localMatch.humanId, cardId, abilityIndex) ?? ability.costFatigue;
  $('#ability-dialog-kicker').textContent = `${card.name} · COSTO ${effectiveCost} FATICA`;
  $('#ability-dialog-title').textContent = ability.name;
  $('#ability-dialog-description').textContent = `${ability.text}${rule.notice ? `\n\nNota: ${rule.notice}` : ''}`;
  $('#ability-form-controls').innerHTML = controls.join('') || '<p class="muted-note">Conferma per lanciare il dado e risolvere l’effetto.</p>';
  if (needsFlageTarget && rule.choice) {
    const choiceSelect = $('#ability-form').querySelector('[name=choice]');
    const targetSelect = $('#ability-form').querySelector('[name=targetUnitId]');
    const targetLabel = targetSelect?.closest('label');
    const syncTarget = () => {
      const noTarget = (rule.effect === 'flageCommon' && choiceSelect.value === 'recoverTeam') || (rule.effect === 'flageLegendary' && choiceSelect.value === 'draw');
      if (targetLabel) targetLabel.hidden = noTarget;
      if (targetSelect) {
        targetSelect.required = !noTarget;
        const previous = targetSelect.value;
        const targetPool = rule.effect === 'flageLegendary' && choiceSelect.value === 'recover' ? flageTargetPool : localMatch.human.field;
        targetSelect.innerHTML = targetPool.map(u => `<option value="${escapeHtml(u.instanceId)}">${escapeHtml(u.name)} · ${escapeHtml(u.role)}</option>`).join('');
        if ([...targetSelect.options].some(option => option.value === previous)) targetSelect.value = previous;
      }
    };
    choiceSelect?.addEventListener('change', syncTarget);
    syncTarget();
  }
  $('#ability-form').dataset.unit = unitId;
  $('#ability-form').dataset.ability = abilityIndex;
  $('#ability-dialog').showModal();
}

function matchUnitForAbility(unitId) {
  return localMatch?.human.field.find(u => u.instanceId === unitId) ?? null;
}

function renderMatch(match) {
  const human = match.human;
  const cpu = match.cpu;
  const isHumanTurn = match.isHumanTurn;
  const pState = match.state;
  $('#match-mode-label').textContent = match.mode === 'training' ? 'ALLENAMENTO' : 'SINGLE PLAYER';
  $('#match-title').textContent = match.mode === 'training' ? 'Sessione di allenamento' : 'Sfida contro il computer';
  $('#turn-chip').textContent = `TURNO ${Math.min(pState.currentTurn,9)} / 9`;
  $('#human-score').textContent = human.goals;
  $('#cpu-score').textContent = cpu.goals;
  $('#human-name').textContent = human.name;
  $('#cpu-name').textContent = cpu.name;
  $('#human-subs').textContent = `${human.substitutionsRemaining} cambi`;
  $('#cpu-subs').textContent = `${cpu.substitutionsRemaining} cambi`;
  $('#human-bench-count').textContent = `${human.bench.length} / 5`;
  $('#cpu-bench-count').textContent = `${cpu.bench.length} / 5`;
  const previousShooter = $('#shot-player').value;
  const shooters = human.field.filter(unit => unit.role !== 'goalkeeper');
  $('#shot-player').innerHTML = shooters.map(unit => `<option value="${escapeHtml(unit.instanceId)}">${escapeHtml(unit.name)} · TEC ${getActiveStats(unit).technique}</option>`).join('');
  if (shooters.some(unit => unit.instanceId === previousShooter)) $('#shot-player').value = previousShooter;
  $('#shot-player').disabled = !isHumanTurn || !shooters.length;
  $('#human-field').innerHTML = human.field.map(unit => renderUnit(unit,human,match)).join('') || '<p class="muted-note">Nessun giocatore in campo</p>';
  $('#human-breaktime').innerHTML = renderBreakTime(human);
  $('#human-breaktime').hidden = !human.breakTime.length;
  $('#cpu-field').innerHTML = cpu.field.map(unit => renderUnit(unit,cpu,match)).join('') || '<p class="muted-note">Nessun giocatore in campo</p>';
  $('#cpu-breaktime').innerHTML = renderBreakTime(cpu);
  $('#cpu-breaktime').hidden = !cpu.breakTime.length;
  $('#human-bench').innerHTML = renderBench(human,true,match);
  $('#cpu-bench').innerHTML = renderBench(cpu,false,match);
  $('#hand-count').textContent = `${human.hand.length} carte`;
  $('#hand-cards').innerHTML = human.hand.map(id => renderHandCard(id,match)).join('') || '<p class="muted-note">La mano è vuota.</p>';
  const active = pState.players.find(p => p.id === pState.activePlayerId);
  $('#turn-status').textContent = pState.status === 'finished'
    ? 'Partita conclusa'
    : isHumanTurn
      ? !human.turnFlags.showdownResolved
        ? 'FASE 1 · Prepara la squadra: cambia i giocatori, controlla la Fatica e attiva le abilità disponibili. Quando sei pronto, risolvi lo Showdown.'
        : !human.turnFlags.shotResolved
          ? 'FASE 3 · Showdown risolto: scegli il tiratore, verifica la Tecnica e calcia in porta.'
          : 'AZIONE COMPLETATA · Tiro risolto. Puoi terminare il turno.'
      : `${active?.name ?? 'Computer'} sta giocando…`;
  const event = pState.activeEvent;
  $('#match-event').hidden = !event;
  $('#match-event').innerHTML = event ? `<div><div class="eyebrow">EVENTO ATTIVO · TURNO ${pState.currentTurn}</div><strong>${escapeHtml(event.name)}</strong><p>${escapeHtml(event.sourceEffectText ?? event.effect ?? '')}</p></div><span>EFFETTO IN CATALOGO</span>` : '';
  $('#btn-showdown').disabled = !isHumanTurn || human.turnFlags.showdownResolved;
  $('#btn-shot').disabled = !isHumanTurn || !human.turnFlags.showdownResolved || human.turnFlags.shotResolved;
  $('#btn-end-turn').disabled = !isHumanTurn;
  const showdownDone = Boolean(human.turnFlags.showdownResolved);
  const shotDone = Boolean(human.turnFlags.shotResolved);
  $('#phase-prepare').classList.toggle('active', isHumanTurn && !showdownDone);
  $('#phase-prepare').classList.toggle('done', showdownDone);
  $('#phase-showdown').classList.toggle('active', isHumanTurn && !showdownDone);
  $('#phase-showdown').classList.toggle('done', showdownDone);
  $('#phase-shot').classList.toggle('active', isHumanTurn && showdownDone && !shotDone);
  $('#phase-shot').classList.toggle('done', shotDone);
  renderShowdownResult(match);
  renderShotResult(match);
  $('#match-log').innerHTML = match.log.map(line => `<p>${escapeHtml(line)}</p>`).join('');
  const result = $('#match-result');
  result.hidden = pState.status !== 'finished';
  if (pState.status === 'finished') {
    const winner = pState.winnerId ? pState.players.find(p => p.id === pState.winnerId)?.name : null;
    result.innerHTML = `<strong>${winner ? `${escapeHtml(winner)} vince!` : 'Pareggio!'}</strong><p>Risultato finale ${human.goals} – ${cpu.goals}. Puoi tornare alla panoramica e avviare una nuova partita.</p><button class="button button-primary" data-action="new-match">Nuova partita</button>`;
  }
}

function startMatch(mode) {
  showPanel('match');
  try {
    localMatch = new LocalMatch({ mode, onUpdate: renderMatch });
    if (mode === 'training') toast('Allenamento avviato: il Computer farà da avversario passivo.');
    else toast('Partita avviata. Buona fortuna!');
  } catch (error) {
    toast(error.message);
    showPanel('home');
  }
}

$$('[data-panel]').forEach(button => button.addEventListener('click', () => showPanel(button.dataset.panel)));
$$('[data-start]').forEach(button => button.addEventListener('click', () => startMatch(button.dataset.start)));
$('#card-search').addEventListener('input', renderCollection);
$('#card-filter').addEventListener('change', renderCollection);
$('#rarity-filter').addEventListener('change', renderCollection);
$('#collection-grid').addEventListener('click', event => {
  const card = event.target.closest('[data-card-detail]');
  if (card) openCardDialog(card.dataset.cardDetail);
});
$('#collection-grid').addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    const card = event.target.closest('[data-card-detail]');
    if (card) { event.preventDefault(); openCardDialog(card.dataset.cardDetail); }
  }
});
$('#dialog-close').addEventListener('click', () => $('#card-dialog').close());
$('#card-dialog').addEventListener('click', event => { if (event.target === $('#card-dialog')) $('#card-dialog').close(); });

$('#panel-match').addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || !localMatch) return;
  const action = target.dataset.action;
  try {
    if (action === 'recruit') localMatch.recruit(target.dataset.card);
    else if (action === 'substitute') localMatch.changePlayer(target.dataset.out,target.dataset.in);
    else if (action === 'upgrade') localMatch.upgrade(target.dataset.card,target.dataset.unit);
    else if (action === 'play-tactic') localMatch.playTactic(target.dataset.card);
    else if (action === 'activate-ability') openAbilityDialog(target.dataset.unit, Number(target.dataset.ability));
    else if (action === 'showdown') localMatch.showdown();
    else if (action === 'shot') localMatch.shot($('#shot-player').value);
    else if (action === 'end-turn') localMatch.endTurn();
    else if (action === 'open-card') openCardDialog(target.dataset.card);
    else if (action === 'new-match') startMatch(localMatch.mode);
  } catch (error) { toast(error.message); }
});
$('#btn-showdown').addEventListener('click', () => { try { localMatch?.showdown(); } catch(e) { toast(e.message); } });
$('#btn-shot').addEventListener('click', () => { try { localMatch?.shot($('#shot-player').value); } catch(e) { toast(e.message); } });
$('#btn-end-turn').addEventListener('click', () => { try { localMatch?.endTurn(); } catch(e) { toast(e.message); } });
$('#shot-player').addEventListener('change', () => { if (localMatch) renderMatch(localMatch); });

$('#ability-dialog-close').addEventListener('click', () => $('#ability-dialog').close());
$('#ability-cancel').addEventListener('click', () => $('#ability-dialog').close());
$('#ability-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!localMatch) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const params = {};
  if (data.has('choice')) params.choice = data.get('choice');
  if (data.has('targetUnitId')) params.targetUnitId = data.get('targetUnitId');
  if (data.has('discardCardId')) params.discardCardId = data.get('discardCardId');
  if (data.has('targetUnitIds')) params.targetUnitIds = data.getAll('targetUnitIds');
  params.selectedShooterId = $('#shot-player').value;
  try {
    localMatch.activateAbility(form.dataset.unit, Number(form.dataset.ability), params);
    $('#ability-dialog').close();
  } catch (error) { toast(error.message); }
});

$('#count-players').textContent = CARDS.filter(c => c.type === 'player').length;
$('#count-tactics').textContent = CARDS.filter(c => c.type === 'tactic').length;
$('#count-events').textContent = CARDS.filter(c => c.type === 'event').length;
renderCollection();
setupOnline({ toast, escapeHtml });
