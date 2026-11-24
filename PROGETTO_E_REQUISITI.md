# Saints of Sant'Anna — progetto funzionale

## Visione

Saints of Sant'Anna è un gioco di carte calcistico accessibile dal browser su desktop e smartphone. La prima iterazione punta a una presentazione elegante e leggibile, senza effetti grafici pesanti: prima si stabilizzano flusso, regole e dati; successivamente si rifiniscono illustrazioni, animazioni e bilanciamento.

## Obiettivi prodotto

1. Rendere immediatamente comprensibile come avviare una partita.
2. Permettere di esplorare tutte le carte del catalogo e le relative abilità.
3. Offrire un allenamento sicuro per provare le azioni senza pressione competitiva.
4. Permettere una partita completa contro una CPU semplice.
5. Predisporre il gioco online tra due utenti autenticati.
6. Conservare il regolamento in una pagina separata e sintetica.

## Modalità

### Allenamento

- Partita locale sul browser.
- L'avversario è un allenatore passivo: risolve il proprio Showdown, ma non effettua il tiro.
- Consente di testare mano, inserimento in panchina, sostituzioni, Rank Up, Showdown e tiro.
- Stato temporaneo: non vengono creati account o progressi persistenti.

### Single player contro CPU

- Partita locale di nove turni secondo l'interpretazione attuale del motore.
- La CPU può reclutare un giocatore, effettuare Rank Up, usare tattiche con effetto già strutturato, risolvere Showdown e tentare il tiro.
- La CPU è deliberatamente semplice: non simula ancora tutte le abilità individuali e le reazioni difensive.

### Multiplayer

- Account via Supabase Auth.
- Creazione di una stanza con codice a sei caratteri e ingresso dell'avversario tramite codice.
- Sincronizzazione tramite Supabase Realtime.
- Le mosse passano da Edge Functions: il client invia una richiesta di azione, il server controlla il turno, applica il motore e genera i D20.
- Lo stato completo (mani, mazzi e dettagli privati) rimane in una tabella non leggibile dai client; Realtime espone soltanto una proiezione pubblica.

## Mappa delle schermate

| Schermata | Contenuti | Azioni principali |
|---|---|---|
| Home | Identità del gioco, tre modalità, riepilogo archivio | Allenamento, CPU, multiplayer, collezione, regole |
| Collezione | 50 carte del catalogo principale; ricerca e filtri | Aprire una carta e leggere statistiche/abilità |
| Regolamento | Sintesi delle 10 regole fondamentali | Tornare al gioco |
| Partita | Turno, evento, punteggio, campo, panchina, mano, cronaca | Reclutare, sostituire, Rank Up, tattica, Showdown, tiro, fine turno |
| Multiplayer | Account, creazione stanza, ingresso tramite codice | Accedere, creare, unirsi, giocare in tempo reale |

## Principi UI

- Palette: blu notte, avorio e oro spento.
- Titoli editoriali con serif; testi funzionali in sans-serif.
- Layout responsive, pulsanti chiari, nessun elemento decorativo che sottragga spazio alla partita.
- Le carte devono privilegiare leggibilità di nome, ruolo, statistiche e testo dell'abilità.
- Le animazioni sono rimandate: non sono necessarie per validare il gioco.

## Principi del modello dati

- Ogni versione Comune e Leggendaria è una carta indipendente nel catalogo.
- `baseCardId` collega la Leggendaria alla Comune richiesta dal regolamento per il Rank Up.
- Il catalogo principale e lo snapshot storico restano separati.
- I campi ambigui o mancanti restano marcati, non completati per supposizione.
- Gli effetti in linguaggio naturale sono visualizzabili anche quando non sono ancora eseguibili dal motore.

## Criteri di accettazione della prima build

- La home presenta tutte e tre le modalità.
- La pagina Regolamento è raggiungibile senza entrare in partita.
- La collezione visualizza 50 carte e permette ricerca/filtro.
- Allenamento e CPU avviano una partita usando `js/engine.js`.
- Il motore completa una partita di nove turni e calcola il risultato.
- I test automatizzati passano.
- Il multiplayer non finge di essere collegato quando mancano le credenziali Supabase; dopo la configurazione dispone di autenticazione, stanze, azioni server-side e aggiornamenti realtime.
