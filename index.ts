import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser, adminClient } from '../_shared/auth.ts';
import { safePublicState, rollServerD20 } from '../_shared/game-config.ts';
import {
  getPublicState, resolveShowdown, resolveShot, endPlayerTurn,
  recruitFromHandToBench, substitute, playLegendary, playTactic
} from '../_shared/engine.js';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const matchId = body.matchId;
    if (!matchId) return jsonResponse({ error: 'matchId mancante.' }, 400);
    const admin = adminClient();
    const { data: match, error: matchError } = await admin.from('matches').select('*').eq('id', matchId).single();
    if (matchError || !match) return jsonResponse({ error: 'Partita non trovata.' }, 404);
    if (![match.host_id, match.guest_id].includes(user.id)) return jsonResponse({ error: 'Non sei un partecipante di questa partita.' }, 403);
    const { data: stored, error: stateError } = await admin.from('match_states').select('state').eq('match_id', matchId).single();
    if (stateError || !stored?.state) return jsonResponse({ error: 'La partita non è ancora stata avviata.' }, 409);
    let state = stored.state;

    if (body.action === 'sync') return jsonResponse({ viewState: getPublicState(state, user.id), version: match.version });
    if (match.status !== 'active') return jsonResponse({ error: 'La partita non è attiva.' }, 409);
    if (state.activePlayerId !== user.id) return jsonResponse({ error: 'Non è il tuo turno.' }, 403);

    switch (body.action) {
      case 'showdown':
        state = resolveShowdown(state, user.id);
        break;
      case 'shot':
        if (!body.shooterUnitId) return jsonResponse({ error: 'Seleziona un tiratore.' }, 400);
        state = resolveShot(state, {
          attackingPlayerId: user.id,
          shooterUnitId: body.shooterUnitId,
          shotRoll: rollServerD20(),
          goalkeeperRoll: rollServerD20()
        });
        break;
      case 'endTurn':
        state = endPlayerTurn(state, user.id);
        break;
      case 'recruit':
        state = recruitFromHandToBench(state, user.id, body.cardId);
        break;
      case 'substitute':
        state = substitute(state, user.id, body.fieldUnitId, body.benchUnitId);
        break;
      case 'playLegendary':
        state = playLegendary(state, user.id, body.cardId, body.commonUnitId);
        break;
      case 'playTactic':
        state = playTactic(state, user.id, body.cardId);
        break;
      default:
        return jsonResponse({ error: 'Azione non riconosciuta o non ancora disponibile.' }, 400);
    }

    const nextPublic = safePublicState(state);
    const { error: persistError } = await admin.rpc('persist_match_state', {
      p_match_id: matchId,
      p_expected_version: match.version,
      p_state: state,
      p_public_state: nextPublic,
      p_current_turn: state.currentTurn,
      p_active_player_id: state.activePlayerId,
      p_status: state.status
    });
    if (persistError) {
      if (String(persistError.message).includes('VERSION_CONFLICT')) return jsonResponse({ error: 'La partita è stata aggiornata dall’avversario. Sincronizzo lo stato: riprova la mossa.' }, 409);
      throw persistError;
    }
    return jsonResponse({ viewState: getPublicState(state, user.id), version: match.version + 1 });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Errore durante l’azione.' }, 400);
  }
});
