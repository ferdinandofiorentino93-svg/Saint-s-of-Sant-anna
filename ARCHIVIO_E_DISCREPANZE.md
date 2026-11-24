# Archivio carte e discrepanze tra i due PDF

## Fonti principali

**TCG_SantAnna_Catalogo_Carte.pdf** (16 pagine)
- Pagine 3–12: 10 personaggi, ciascuno in versione Comune e Leggendaria (20 carte giocatore).
- Pagina 13: 10 tattiche offensive TO01–TO10.
- Pagina 14: 10 tattiche difensive TD01–TD10.
- Pagina 15: 10 carte Evento EV01–EV10.
- Pagina 16: note e voci da confermare.

**Archivio_Carte_TCG_SantAnna.pdf** (4 pagine)
- Pagina 2: San Flage Comune, San Zorro Comune, San Mauri Comune.
- Pagina 3: San Criminal Comune, San Lolli Leggendaria, San Zorro Leggendaria.
- Pagina 4: San Nicolò Leggendaria e San Mauri Leggendaria.
- Il documento dichiara che San Nicolò Comune e San Criminal Leggendaria non sono state completate in quello snapshot.

## Regola adottata per il database

Il catalogo a 16 pagine è il set principale del prototipo. Le otto versioni del documento a 4 pagine sono conservate in `data/archive-snapshot.json` come storico alternativo. I dati dello snapshot non sovrascrivono il catalogo principale.

## Discrepanze tracciate

| Carta | Catalogo riepilogativo | Archivio conversazione | Trattamento |
|---|---|---|---|
| San Criminal | Etichetta Difensore, ma statistica Parata e abilità di parata | Comune classificata Portiere | Ruolo sospeso; non selezionabile nel motore finché non confermato |
| San Flage Comune | ATT 7 · DIF 4 · TEC 7 · FAT 6; Protesta Infinita / Trascinatore della Folla | ATT 5 · DIF 5 · TEC 7 · FAT 6; Voce del Popolo / Giustizia in Campo | Entrambe le schede conservate |
| San Zorro Leggendario | Cannoniere Spietato / Finalizzatore Clinico | Pronta la Bomba / Artista del Gol | Entrambe le versioni abilità conservate |
| San Mauri Comune | Tre abilità: Baluardo, Resistenza, Aura Protettiva | Due abilità con descrizioni differenti | Entrambe le versioni conservate |
| San Mauri Leggendario | FAT 8 e quattro abilità: Aura Invincibile, Barriera Eterea, Guardiano della Squadra, Volontà Incalfibile | FAT 13 e quattro abilità differenti | Entrambe le schede conservate; Fatica discordante |
| San Lolli Leggendario | Dominio Assoluto +1 Attacco globale, altre tre abilità | Dominio Assoluto +2 Attacco globale e differenti testi delle abilità | Entrambe le versioni conservate |
| San Nicolò Comune | Scheda Comune completa | Dichiarata non completata nello snapshot | Catalogo principale usato nel prototipo |
| San Criminal Leggendaria | Scheda Leggendaria completa | Dichiarata non completata nello snapshot | Catalogo principale usato nel prototipo |

## Carte non incluse nel set principale

- **Pressione Costante**: citata nella nota di pagina 16 come carta vista in una tavola compatta precedente, ma non presente tra le 10 tattiche offensive del catalogo Excel. Resta in `data/draft-cards.json`, senza codice e rarità confermati.

## Fonti nel repository

- `data/catalog.json`: catalogo principale con 50 carte.
- `data/archive-snapshot.json`: 8 versioni storiche/alternative.
- `data/draft-cards.json`: carte bozza da confermare.
- `data/engine-catalog.json`: subset normalizzato usato dal motore; San Criminal è escluso finché il ruolo è ambiguo.
