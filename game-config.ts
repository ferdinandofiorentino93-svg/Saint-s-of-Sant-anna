import catalog from './engine-catalog.json' with { type: 'json' };
import { createGame, startGame, getPublicState } from './engine.js';

export const EVENT_IDS = ['EV01','EV02','EV03','EV04','EV05','EV06','EV07','EV08','EV09','EV10'];

export function makeInitialState(hostId: string, guestId: string, hostSetup: any, guestSetup: any) {
  const players = [
    { ...hostSetup, id: hostId, name: hostSetup.name || 'Giocatore 1' },
    { ...guestSetup, id: guestId, name: guestSetup.name || 'Giocatore 2' }
  ];
  const setup = createGame({ cardCatalog: catalog, players, eventDeck: EVENT_IDS, startingPlayerId: hostId });
  return startGame(setup);
}

export function safePublicState(state: any) {
  const view = getPublicState(state, state.players[0].id);
  for (const player of view.players) delete player.hand;
  return view;
}

export function rollServerD20() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return 1 + (bytes[0] % 20);
}
