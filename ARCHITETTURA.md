# Architettura del progetto

## Obiettivo della prima build

Realizzare una web app statica, elegante e modificabile, che consenta di consultare il catalogo, apprendere il regolamento e provare il flusso di una partita prima di completare tutte le abilità e gli effetti speciali.

## Struttura

- `index.html`: home, collezione, partita locale e schermata multiplayer.
- `regolamento.html`: pagina indipendente con la sintesi del Regolamento Ufficiale v1.0.
- `css/styles.css`: stile unico, responsive, sobrio (blu notte, avorio, dettagli oro spento).
- `js/engine.js`: motore puro di gioco, derivato dal motore creato in precedenza.
- `js/catalog.js`: adattatore dal catalogo descrittivo al motore.
- `js/game-config.js`: formazioni e mazzi di prova.
- `js/match.js`: orchestrazione della partita locale e comportamento CPU.
- `js/online.js`: autenticazione, stanze e aggiornamenti Supabase.
- `data/catalog.json`: catalogo principale (20 giocatori, 20 tattiche, 10 eventi).
- `data/archive-snapshot.json`: otto versioni del PDF Archivio, conservate come storico alternativo.
- `data/draft-cards.json`: carte non confermate, fuori dal set principale.
- `supabase/`: migrazione SQL e funzioni server-side per stanze e mosse.
- `tests/`: test automatici per catalogo, regole e privacy della mano.

## Separazione delle responsabilità

Il motore non conosce HTML, CSS o DOM. La UI invoca le funzioni del motore e visualizza lo stato restituito. In modalità locale il browser genera i D20. In multiplayer, il browser invia solo l'azione richiesta; l'Edge Function controlla utente, turno e stato, genera i D20 sul server, esegue il motore e salva la nuova versione.

## Dati e provenienza

Il catalogo di gioco è basato su `TCG_SantAnna_Catalogo_Carte.pdf` (16 pagine): pagine 3–12 per i personaggi, 13–14 per le tattiche e 15 per gli eventi. `Archivio_Carte_TCG_SantAnna.pdf` (4 pagine) è trattato come snapshot storico di otto versioni, non come sostituzione del catalogo principale.

I due documenti hanno discrepanze reali: San Criminal ha etichetta Difensore ma statistica Parata; San Flage Comune, San Zorro Leggendario, San Mauri e San Lolli Leggendario presentano versioni diverse tra catalogo e snapshot. Le differenze sono documentate in `ARCHIVIO_E_DISCREPANZE.md` e non vengono fuse.

## Stato funzionale

### Già presente nel prototipo
- Catalogo consultabile e filtrabile.
- Schede con statistiche, abilità, ruolo e versione.
- Allenamento contro un avversario passivo.
- Partita locale di nove turni contro una CPU essenziale.
- Preparazione di mano, panchina, sostituzioni, Rank Up, upkeep Fatica, Break Time, Showdown, tiro, parata e risultato.
- Multiplayer predisposto con Supabase Auth, stanze private, stato pubblico e privato separati, Realtime e validazione server-side.

### Parziale / non ancora automatizzato
- Le abilità individuali dei personaggi sono conservate integralmente nel catalogo, ma i loro trigger e costi non sono tutti collegati al motore.
- Sono automatizzate nel prototipo solo alcune tattiche che corrispondono agli effetti strutturati già supportati dal motore: TO03, TO08, TO10, TD07 e TD10.
- Gli eventi vengono rivelati ai turni 3, 6 e 9 e descritti nella partita; non tutti i loro effetti modificano ancora lo stato del motore.
- La CPU usa una strategia basilare; non simula ancora tutte le abilità o tattiche di risposta.
- La partita multiplayer richiede un progetto Supabase configurato e le Edge Functions pubblicate.

## Decisioni provvisorie

Le regole del PDF non specificano alcune finestre e casi. Le interpretazioni implementate sono riportate in `docs/INTERPRETAZIONI_REGOLE.md`; devono essere confermate prima del bilanciamento competitivo.
