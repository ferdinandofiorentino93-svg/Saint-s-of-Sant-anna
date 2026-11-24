# Saints of Sant'Anna

Progetto web statico per il TCG calcistico **Saints of Sant'Anna**. La prima build combina il catalogo dei due PDF, il motore di gioco JavaScript e una UI responsive, sobria e facile da modificare.

## Cosa contiene

- **Home** con modalità di gioco.
- **Allenamento** contro un avversario passivo.
- **Partita single player contro CPU** con turni alternati, mosse base, Showdown e tiro.
- **Collezione** consultabile e filtrabile, con statistiche e testo delle abilità.
- **Regolamento** in una pagina HTML separata, breve e riassuntiva.
- **Multiplayer** predisposto per Supabase Auth, stanze private, Realtime e validazione delle mosse lato server.

## Avvio locale

Richiede Python 3 per il server statico e Node.js 20+ per i test.

```bash
npm test
npm run serve
```

Apri `http://localhost:8000`.

Non aprire `index.html` come file locale: i moduli JavaScript e gli import JSON usano ES modules e richiedono un server HTTP.

## Pubblicazione su GitHub Pages

1. Crea un repository GitHub, ad esempio `saints-of-santanna`.
2. Carica **tutto il contenuto** di questa cartella nella radice del repository.
3. In `Settings → Pages`, scegli `Deploy from a branch`, branch `main`, cartella `/ (root)`.
4. Seleziona `GitHub Actions` come source nella sezione Pages.
5. Il workflow `.github/workflows/pages.yml` pubblica automaticamente il contenuto del repository a ogni push su `main`.
6. Attendi il completamento del workflow e apri l'URL Pages mostrato da GitHub.

Il progetto non richiede una fase di build: è HTML, CSS, JavaScript e JSON. Il file `.nojekyll` e il workflow GitHub Actions per Pages sono già inclusi.

## Modalità di gioco

- **Allenamento**: la CPU fa da avversario passivo; non tenta il tiro. Serve per provare la gestione del turno, lo Showdown e le carte.
- **Contro il computer**: CPU essenziale che recluta una carta, può fare Rank Up, usa tattiche automatizzate e tenta il tiro.
- **Multiplayer**: la UI e le funzioni server-side sono predisposte, ma richiedono un progetto Supabase dell'utente e il deploy delle Edge Functions.

## Supabase — attivazione multiplayer

1. Crea un progetto Supabase.
2. Applica `supabase/migrations/202611240001_initial_multiplayer.sql` nell'SQL Editor.
3. Pubblica le funzioni `create-room`, `join-room`, `match-action`.
4. In `js/config.js`, inserisci `url` e `anonKey` (chiave pubblica / anon).
5. Nella configurazione delle Edge Functions assicurati che siano disponibili i secrets standard del progetto: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

**Non mettere la chiave `service_role` in `js/config.js`, nel repository o nel browser.** La chiave privilegiata è usata soltanto nelle Edge Functions. La tabella `match_states`, che contiene mani e stato completo, non è leggibile dai client. I client leggono solo `matches.public_state` e inviano azioni al server.

La modalità online non sarà attiva finché il tuo progetto Supabase non sarà configurato e le funzioni non saranno pubblicate.

## Archivio dati e fonti

- `TCG_SantAnna_Catalogo_Carte.pdf`: set principale con 20 carte giocatore (10 Comuni + 10 Leggendarie), 10 tattiche offensive, 10 tattiche difensive e 10 eventi.
- `Archivio_Carte_TCG_SantAnna.pdf`: snapshot di otto versioni con alcune abilità/statistiche alternative; non sovrascrive il catalogo principale.
- Pressione Costante è conservata come bozza separata.
- Le discrepanze sono descritte in `docs/ARCHIVIO_E_DISCREPANZE.md`.

## Limiti funzionali dichiarati

Questa è una prima build di prova, non ancora una versione competitiva completa. Il motore implementa il ciclo centrale del Regolamento v1.0 (upkeep, Fatica, Break Time, panchina, sostituzioni, Rank Up, Showdown, D20, Parata e fine partita). Solo cinque tattiche con effetto strutturato sono eseguibili nel prototipo (TO03, TO08, TO10, TD07, TD10). Le altre tattiche, le abilità individuali e gli effetti Evento sono presenti nel catalogo ma non sono ancora tutti automatizzati.

Le interpretazioni provvisorie del regolamento sono in `docs/INTERPRETAZIONI_REGOLE.md`. La struttura del codice è documentata in `docs/ARCHITETTURA.md`.
