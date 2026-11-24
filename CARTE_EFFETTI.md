# Stato di automazione delle carte

Il catalogo contiene tutti i testi, ma il motore non deve interpretare automaticamente una frase in italiano. Nel prototipo, una carta tattica è giocabile se possiede un `effectData` strutturato.

## Tattiche automatizzate nel prototipo

| Codice | Carta | Effetto codificato |
|---|---|---|
| TO03 | Spirito di Squadra | Recupera 1 Fatica a tutti i giocatori in campo |
| TO08 | Lancio Perfetto | Bonus +3 al prossimo tiro |
| TO10 | Accelerazione Improvvisa | +2 Attacco squadra per il turno |
| TD07 | Ritirata Strategica | Pesca 2 carte |
| TD10 | Muro Difensivo | +3 Difesa squadra per il turno |

## Tattiche catalogate ma non automatizzate

TO01, TO02, TO04, TO05, TO06, TO07, TO09, TD01, TD02, TD03, TD04, TD05, TD06, TD08, TD09. I testi completi sono in `data/catalog.json`.

## Abilità giocatore

Tutte le abilità sono archiviate nel catalogo, ma non sono ancora agganciate ai rispettivi trigger. Per implementarle serve una struttura comune che distingua almeno:
- tipo: passiva, attivata, reazione, trigger automatico;
- trigger: inizio turno, Showdown vinto/perso, tiro, gol, parata, perdita/recupero Fatica, ingresso in campo;
- costo Fatica;
- frequenza: una volta per turno, una volta per partita, nessun limite;
- finestra: prima/dopo Showdown, durante tiro, risposta a tattica;
- bersaglio e durata;
- priorità in caso di più abilità simultanee.

## Eventi

I testi dei dieci eventi sono catalogati. Il prototipo li rivela ai turni 3, 6 e 9, ma non applica ancora automaticamente ogni effetto. EV06 richiede inoltre l'estensione della partita oltre il turno 9.
