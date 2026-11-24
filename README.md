# Saints of Sant’Anna — GitHub Pages v0.1.1

Pacchetto statico per pubblicare il prototipo su GitHub Pages da smartphone.

## Caricamento

Estrai lo ZIP e carica **tutti i file contenuti in questa cartella direttamente nella radice** del repository GitHub, senza creare una sottocartella e senza appiattire ulteriormente i nomi. I file `.js`, `styles.css` e le due pagine HTML devono restare affiancati.

File principali:
- `index.html` — pagina iniziale
- `styles.css` — grafica
- `app.js` — interfaccia e pulsanti
- `catalog.js` e `catalog-data.js` — catalogo delle carte
- `engine.js`, `game-config.js`, `match.js` — motore e partita locale
- `regolamento.html` — regolamento
- `online.js` e `config.js` — predisposizione multiplayer

Dopo il commit, ricarica la pagina GitHub Pages. Se il browser mostra ancora la vecchia versione, esegui un aggiornamento forzato o apri il sito in una scheda in incognito.

## Funzioni della build

- Navigazione locale tra panoramica, collezione e multiplayer.
- Collezione filtrabile con dettaglio delle carte.
- Allenamento e partita contro CPU con il motore locale del prototipo.
- Regolamento in pagina separata.
- Multiplayer predisposto ma non attivo senza configurare e pubblicare il backend Supabase.

Questa è una build prototipale: alcune abilità individuali ed effetti delle carte non sono ancora automatizzati.
