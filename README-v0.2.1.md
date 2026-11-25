# Saints of Sant'Anna · Playtest 0.2.1

Preview statica per GitHub Pages. Il file di ingresso è `index-v0.2.1.html`.

## File necessari

Tutti i file con suffisso `v0.2.1` devono restare nella stessa cartella del repository:

- `index-v0.2.1.html`
- `styles-v0.2.1.css`
- `app-v0.2.1.js`
- `engine-v0.2.1.js`
- `catalog-data-v0.2.1.js`

## Regole implementate nel motore

- Formazione iniziale di quattro giocatori: portiere, difensore, centrocampista e attaccante.
- Quattro carte iniziali per ciascuna squadra; eventi da un mazzo condiviso ai turni 3, 5, 7 e 9 (non al primo turno).
- Mantenimento: i giocatori in campo perdono 1 Fatica; la panchina recupera 1.
- Break Down per tre turni completi; al rientro il giocatore va in panchina.
- Tre Punti Azione per squadra; massimo due abilità attive per turno; Rank Up costa 2 PA ed è solo offensivo.
- Ogni azione offensiva apre una finestra di risposta; dopo la chiusura dell'attacco, la difesa può spendere i PA rimasti.
- Una vittoria difensiva impedisce il tiro e conserva l'intero margine per il successivo Showdown offensivo di quella squadra.
- Showdown e tiro sono rappresentati con confronti numerici e dadi D20 visibili.
- Le abilità marcate come passive sono gestite automaticamente dal motore; non compaiono tra i comandi manuali.

## Limiti del prototipo

Non tutte le abilità attive, reattive, tattiche ed Eventi hanno ancora un effetto automatizzato. Quelle non implementate sono contrassegnate nell'interfaccia come non automatizzate e non vengono presentate come azioni disponibili. Il multiplayer online richiede ancora la configurazione del servizio backend (Supabase).
