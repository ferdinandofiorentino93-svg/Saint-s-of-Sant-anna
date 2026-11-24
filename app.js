import { CATALOG, CARDS, CARD_BY_ID, canAutomateTactic } from "./catalog.js";
import { LocalMatch } from "./match.js";
import { getActiveStats } from "./engine.js";
import { setupOnline } from "./online.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let localMatch = null;
let toastTimer = null;

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

function renderUnit(unit, owner, match) {
  const shownId = unit.legendaryOverlay?.cardId ?? unit.cardId;
  const card = CARD_BY_ID[shownId] ?? CARD_BY_ID[unit.cardId];
  const stats = getActiveStats(unit);
  const fatigue = unit.legendaryOverlay?.fatigue ?? unit.fatigue;
  const maxFatigue = unit.legendaryOverlay?.maxFatigue ?? unit.maxFatigue;
  const isHuman = owner.id === match.humanId;
  const canSwap = isHuman && match.isHumanTurn && !unit.legendaryOverlay;
  const replacements = canSwap ? owner.bench.filter(b => b.role === unit.role) : [];
  const actions = replacements.map(bench => `<button class="mini-action" data-action="substitute" data-out="${escapeHtml(unit.instanceId)}" data-in="${escapeHtml(bench.instanceId)}">Entra ${escapeHtml(bench.name)}</button>`).join('');
  return `<div class="unit-card">
    <h3>${escapeHtml(card?.name ?? unit.name)}</h3>
    <small>${escapeHtml(card?.roleLabel ?? unit.role)}${unit.legendaryOverlay ? ' · LEGGENDARIA' : ''}</small>
    <div class="unit-meta"><span>ATT ${stats.attack}</span><span>DIF ${stats.defense}</span><span>TEC ${stats.technique ?? '—'}</span></div>
    <div class="unit-meta"><span>FATICA ${fatigue}/${maxFatigue}</span><span>${unit.status === 'active' ? 'IN CAMPO' : escapeHtml(unit.status)}</span></div>
    <div class="fatigue-track"><i style="width:${Math.max(0,Math.min(100,(fatigue/maxFatigue)*100))}%"></i></div>
    ${actions ? `<div class="unit-actions">${actions}</div>` : ''}
  </div>`;
}

function renderBench(owner, isHuman, match) {
  if (!owner.bench.length) return '<span class="muted-note">Panchina vuota</span>';
  return owner.bench.map(unit => `<span class="bench-chip">${escapeHtml(unit.name)} · ${escapeHtml(unit.role)} ${isHuman && match.isHumanTurn ? `<button data-action="open-card" data-card="${escapeHtml(unit.cardId)}" title="Apri scheda">ⓘ</button>` : ''}</span>`).join('');
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
  $('#human-field').innerHTML = human.field.map(unit => renderUnit(unit,human,match)).join('') || '<p class="muted-note">Nessun giocatore in campo</p>';
  $('#cpu-field').innerHTML = cpu.field.map(unit => renderUnit(unit,cpu,match)).join('') || '<p class="muted-note">Nessun giocatore in campo</p>';
  $('#human-bench').innerHTML = renderBench(human,true,match);
  $('#cpu-bench').innerHTML = renderBench(cpu,false,match);
  $('#hand-count').textContent = `${human.hand.length} carte`;
  $('#hand-cards').innerHTML = human.hand.map(id => renderHandCard(id,match)).join('') || '<p class="muted-note">La mano è vuota.</p>';
  const active = pState.players.find(p => p.id === pState.activePlayerId);
  $('#turn-status').textContent = pState.status === 'finished'
    ? 'Partita conclusa'
    : isHumanTurn ? 'È il tuo turno. Puoi preparare la squadra, giocare le tattiche disponibili e risolvere lo Showdown.' : `${active?.name ?? 'Computer'} sta giocando…`;
  const event = pState.activeEvent;
  $('#match-event').hidden = !event;
  $('#match-event').innerHTML = event ? `<div><div class="eyebrow">EVENTO ATTIVO · TURNO ${pState.currentTurn}</div><strong>${escapeHtml(event.name)}</strong><p>${escapeHtml(event.sourceEffectText ?? event.effect ?? '')}</p></div><span>EFFETTO IN CATALOGO</span>` : '';
  $('#btn-showdown').disabled = !isHumanTurn || human.turnFlags.showdownResolved;
  $('#btn-shot').disabled = !isHumanTurn || !human.turnFlags.showdownResolved || human.turnFlags.shotResolved;
  $('#btn-end-turn').disabled = !isHumanTurn;
  const shooters = human.field.filter(unit => unit.role !== 'goalkeeper');
  $('#shot-player').innerHTML = shooters.map(unit => `<option value="${escapeHtml(unit.instanceId)}">${escapeHtml(unit.name)} · TEC ${getActiveStats(unit).technique}</option>`).join('');
  $('#shot-player').disabled = !isHumanTurn || !shooters.length;
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

$('#count-players').textContent = CARDS.filter(c => c.type === 'player').length;
$('#count-tactics').textContent = CARDS.filter(c => c.type === 'tactic').length;
$('#count-events').textContent = CARDS.filter(c => c.type === 'event').length;
renderCollection();
setupOnline({ toast, escapeHtml });
