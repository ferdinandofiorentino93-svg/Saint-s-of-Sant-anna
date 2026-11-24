# Attivazione multiplayer con Supabase

Il multiplayer è predisposto nel repository, ma non è attivo finché non vengono inseriti i dati di un progetto Supabase e pubblicate le funzioni server-side.

## 1. Crea un progetto

Crea un progetto Supabase e conserva il Project URL e la chiave pubblica (anon/publishable key). Non condividere la chiave privilegiata.

## 2. Applica la migrazione

Apri SQL Editor nel dashboard Supabase ed esegui il contenuto di:

`supabase/migrations/202611240001_initial_multiplayer.sql`

La migrazione crea:
- `matches`: metadati e vista pubblica della partita;
- `match_states`: stato completo e configurazioni private, senza policy di lettura per gli utenti;
- `persist_match_state`: salvataggio atomico con confronto della versione.

## 3. Pubblica le Edge Functions

Con Supabase CLI installata e collegata al progetto:

```bash
supabase link --project-ref IL_TUO_PROJECT_REF
supabase functions deploy create-room
supabase functions deploy join-room
supabase functions deploy match-action
```

Le funzioni usano i secrets standard del progetto (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). La chiave `service_role` non deve comparire mai nel frontend.

## 4. Configura la web app

Apri `js/config.js` e inserisci:

```js
export const SUPABASE_CONFIG = {
  url: "https://IL-TUO-PROGETTO.supabase.co",
  anonKey: "LA_TUA_CHIAVE_PUBBLICA"
};
```

Questa è configurazione pubblica, necessaria al client per Auth e per chiamare le Edge Functions. Le autorizzazioni sono comunque controllate dalle policy e dalle funzioni.

## 5. Impostazioni Auth

Nel dashboard Supabase abilita l'autenticazione Email/Password. Per il test puoi disattivare la conferma email; prima di un rilascio pubblico configura le impostazioni di conferma e recupero password.

## 6. Flusso partita online

1. L'host autenticato crea una stanza.
2. L'avversario inserisce il codice e si unisce.
3. `join-room` costruisce la partita sul server usando il catalogo condiviso.
4. Ogni client sottoscrive gli aggiornamenti della riga pubblica `matches`.
5. Le azioni vengono inviate a `match-action`; il server verifica appartenenza alla stanza e giocatore attivo, genera i dadi e invoca il motore.
6. `persist_match_state` salva stato e vista pubblica con controllo versione.
7. Il client che riceve un aggiornamento richiede la propria vista privata; la mano dell'avversario non viene esposta.

## Nota tecnica

Il progetto usa Postgres Changes per aggiornare la riga pubblica della partita. È una soluzione semplice per due giocatori; per volumi maggiori si può passare a Realtime Broadcast con autorizzazione dei canali.
