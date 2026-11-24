import { SUPABASE_CONFIG } from "./config.js";
import { DEFAULT_LINEUPS, defaultPlayerSetup } from "./game-config.js";
import { CARD_BY_ID, canAutomateTactic } from "./catalog.js";

const $ = selector => document.querySelector(selector);
let client = null;
let activeMatchId = null;
let activeRoomCode = null;
let realtimeChannel = null;
let currentUser = null;
let currentView = null;
let toastFn = () => {};
let escape = value => String(value ?? '');

function showFeedback(text) { $('#room-feedback').textContent = text; }
function setOnlineStatus(title, text, connected = false) {
  $('#online-status').innerHTML = `<span class="status-dot ${connected ? '' : 'status-dot-muted'}"></span><div><strong>${escape(title)}</strong><p>${escape(text)}</p></div>`;
}

async function ensureClient() {
  if (client) return client;
  if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) throw new Error("Configura URL e chiave pubblica in config.js.");
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    setOnlineStatus(currentUser ? `Accesso effettuato: ${currentUser.email}` : 'Nessun account collegato', currentUser ? 'Puoi creare una stanza o unirti a una partita.' : 'Accedi per utilizzare il multiplayer.', Boolean(currentUser));
  });
  const { data } = await client.auth.getSession();
  currentUser = data.session?.user ?? null;
  setOnlineStatus(currentUser ? `Accesso effettuato: ${currentUser.email}` : 'Supabase configurato · accesso richiesto', currentUser ? 'Puoi creare una stanza o unirti a una partita.' : 'Inserisci le credenziali per accedere.', Boolean(currentUser));
  return client;
}

async function invoke(name, body = {}) {
  const supabase = await ensureClient();
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function refreshMatch() {
  if (!activeMatchId) return;
  const data = await invoke('match-action', { matchId: activeMatchId, action: 'sync' });
  currentView = data.viewState;
  renderOnlineMatch(currentView);
}

function subscribeToMatch() {
  if (!client || !activeMatchId) return;
  if (realtimeChannel) client.removeChannel(realtimeChannel);
  realtimeChannel = client.channel(`match:${activeMatchId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${activeMatchId}` }, () => {
      refreshMatch().catch(error => showFeedback(error.message));
    })
    .subscribe();
}

function unitMarkup(unit) {
  const id = unit.legendaryOverlay?.cardId ?? unit.cardId;
  const card = CARD_BY_ID[id];
  const fatigue = unit.legendaryOverlay?.fatigue ?? unit.fatigue;
  const maxFatigue = unit.legendaryOverlay?.maxFatigue ?? unit.maxFatigue;
  return `<div class="unit-card"><h3>${escape(card?.name ?? unit.name)}</h3><small>${escape(card?.roleLabel ?? unit.role)}</small><div class="unit-meta"><span>FATICA ${fatigue}/${maxFatigue}</span><span>${escape(unit.status)}</span></div></div>`;
}

function renderOnlineMatch(viewState) {
  const container = $('#online-match-display');
  if (!viewState) { container.hidden = true; return; }
  container.hidden = false;
  const mine = viewState.players.find(p => p.id === currentUser?.id);
  const other = viewState.players.find(p => p.id !== currentUser?.id);
  const myTurn = viewState.activePlayerId === currentUser?.id && viewState.status === 'active';
  const shooters = (mine?.field ?? []).filter(u => u.role !== 'goalkeeper');
  const hand = mine?.hand ?? [];
  container.innerHTML = `
    <div class="online-match-head"><div><div class="eyebrow">STANZA ${escape(activeRoomCode ?? '')}</div><h2>Partita online</h2></div><div class="turn-chip">TURNO ${viewState.currentTurn} / 9</div></div>
    <div class="scoreboard"><div class="score-team"><span class="team-caption">LA TUA SQUADRA</span><strong>${mine?.goals ?? 0}</strong><small>${escape(mine?.name ?? 'Tu')}</small></div><div class="score-divider">VS</div><div class="score-team"><span class="team-caption">AVVERSARIO</span><strong>${other?.goals ?? 0}</strong><small>${escape(other?.name ?? 'Avversario')}</small></div></div>
    <div class="turn-status">${myTurn ? 'È il tuo turno.' : viewState.status === 'finished' ? 'Partita conclusa.' : `In attesa di ${escape(other?.name ?? 'avversario')}…`}</div>
    ${viewState.activeEvent ? `<div class="event-strip"><div><div class="eyebrow">EVENTO ATTIVO</div><strong>${escape(viewState.activeEvent.name)}</strong><p>${escape(viewState.activeEvent.sourceEffectText ?? '')}</p></div><span>CATALOGO</span></div>` : ''}
    <div class="field-grid"><section class="team-board"><div class="board-head"><h2>La tua formazione</h2></div><div class="unit-grid">${(mine?.field ?? []).map(unitMarkup).join('')}</div><div class="bench-head"><strong>Panchina</strong><span>${mine?.bench?.length ?? 0} / 5</span></div><div class="bench-list">${(mine?.bench ?? []).map(u => `<span class="bench-chip">${escape(u.cardId)} · ${escape(u.role)}</span>`).join('') || 'Vuota'}</div></section><section class="team-board opponent-board"><div class="board-head"><h2>Avversario</h2></div><div class="unit-grid">${(other?.field ?? []).map(unitMarkup).join('')}</div><div class="bench-head"><strong>Panchina</strong><span>${other?.bench?.length ?? 0} / 5</span></div></section></div>
    <div class="action-panel"><div class="action-head"><div><div class="eyebrow">AZIONI ONLINE</div><h2>Il tuo turno</h2></div></div><div class="action-buttons">
      <button class="button button-primary" data-online-action="showdown" ${!myTurn ? 'disabled' : ''}>Risolvi Showdown</button>
      <label class="shot-picker">Tiratore <select id="online-shooter" ${!myTurn ? 'disabled' : ''}>${shooters.map(u => `<option value="${escape(u.instanceId)}">${escape(u.name)}</option>`).join('')}</select></label>
      <button class="button button-dark" data-online-action="shot" ${!myTurn || !shooters.length ? 'disabled' : ''}>Tira in porta</button>
      <button class="button button-light" data-online-action="endTurn" ${!myTurn ? 'disabled' : ''}>Termina turno →</button>
    </div><div class="hand-header"><h3>La tua mano</h3><span>${hand.length} carte</span></div><div class="hand-grid">${hand.map(id => {
      const card = CARD_BY_ID[id]; if (!card) return '';
      const playable = card.type === 'tactic' && canAutomateTactic(card);
      return `<article class="hand-card"><div class="hand-type">${escape(card.category ?? card.type)}</div><h4>${escape(card.name)}</h4><p>${escape(card.effect ?? '')}</p>${playable ? `<button class="button button-light" data-online-action="playTactic" data-card="${escape(id)}" ${!myTurn ? 'disabled' : ''}>Gioca tattica</button>` : '<div class="disabled-caption">Solo catalogo nel prototipo online</div>'}</article>`;
    }).join('') || '<span class="muted-note">Nessuna carta in mano.</span>'}</div></div>
    <div class="setup-callout">La partita e i dadi sono gestiti lato server. Le tattiche senza effetto strutturato e le abilità individuali sono ancora in fase di automazione.</div>
  `;
}

async function runOnlineAction(action, payload = {}) {
  if (!activeMatchId) throw new Error('Nessuna partita online attiva.');
  const data = await invoke('match-action', { matchId: activeMatchId, action, ...payload });
  currentView = data.viewState;
  renderOnlineMatch(currentView);
}

export function setupOnline({ toast, escapeHtml }) {
  toastFn = toast ?? toastFn;
  escape = escapeHtml ?? escape;
  const hasConfig = Boolean(SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey);
  if (!hasConfig) {
    setOnlineStatus('Connessione non configurata', 'Inserisci URL e chiave pubblica in config.js. Il multiplayer si abilita dopo la configurazione e il deploy delle Edge Functions.');
    ['online-login','online-signup','online-create-room','online-join-room','online-logout'].forEach(id => { $(`#${id}`).disabled = true; });
  }

  $('#online-login').addEventListener('click', async () => {
    try {
      const supabase = await ensureClient();
      const { error } = await supabase.auth.signInWithPassword({ email: $('#online-email').value.trim(), password: $('#online-password').value });
      if (error) throw error;
      toastFn('Accesso effettuato.');
    } catch (error) { showFeedback(error.message); }
  });
  $('#online-signup').addEventListener('click', async () => {
    try {
      const supabase = await ensureClient();
      const { error } = await supabase.auth.signUp({ email: $('#online-email').value.trim(), password: $('#online-password').value });
      if (error) throw error;
      showFeedback('Registrazione inviata. Se il progetto richiede conferma email, controlla la posta.');
    } catch (error) { showFeedback(error.message); }
  });
  $('#online-logout').addEventListener('click', async () => {
    try { const supabase = await ensureClient(); const { error } = await supabase.auth.signOut(); if (error) throw error; showFeedback('Sessione chiusa.'); }
    catch (error) { showFeedback(error.message); }
  });
  $('#online-create-room').addEventListener('click', async () => {
    try {
      if (!currentUser) throw new Error('Accedi prima di creare una stanza.');
      const setup = defaultPlayerSetup(currentUser.id, currentUser.email ?? 'Giocatore', DEFAULT_LINEUPS.human);
      const data = await invoke('create-room', { playerSetup: setup });
      activeMatchId = data.matchId; activeRoomCode = data.roomCode;
      showFeedback(`Stanza creata. Codice da condividere: ${data.roomCode}`);
      subscribeToMatch();
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(data.roomCode).catch(() => {});
    } catch (error) { showFeedback(error.message); }
  });
  $('#online-join-room').addEventListener('click', async () => {
    try {
      if (!currentUser) throw new Error('Accedi prima di entrare in una stanza.');
      const setup = defaultPlayerSetup(currentUser.id, currentUser.email ?? 'Giocatore', DEFAULT_LINEUPS.cpu);
      const data = await invoke('join-room', { roomCode: $('#online-room-code').value.trim().toUpperCase(), playerSetup: setup });
      activeMatchId = data.matchId; activeRoomCode = data.roomCode;
      currentView = data.viewState; renderOnlineMatch(currentView); subscribeToMatch();
      showFeedback(`Sei entrato nella stanza ${data.roomCode}.`);
    } catch (error) { showFeedback(error.message); }
  });
  $('#online-match-display').addEventListener('click', async event => {
    const button = event.target.closest('[data-online-action]');
    if (!button || button.disabled) return;
    try {
      const action = button.dataset.onlineAction;
      const payload = action === 'shot' ? { shooterUnitId: $('#online-shooter').value } : action === 'playTactic' ? { cardId: button.dataset.card } : {};
      await runOnlineAction(action,payload);
    } catch (error) { showFeedback(error.message); }
  });
}
