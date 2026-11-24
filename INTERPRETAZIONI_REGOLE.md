# Regolamento v1.0 — regole e interpretazioni del motore

## Regole riportate dal documento ufficiale

- Obiettivo: segnare più gol dell'avversario.
- Durata: 9 turni.
- Formazione iniziale: 1 Portiere, 1 Difensore, 1 Centrocampista, 1 Attaccante; poi 5 carte in mano per giocatore.
- Mazzo: giocatori e tattiche; massimo 3 Leggendarie. Il mazzo Eventi è separato.
- Inizio turno: tutti i giocatori in campo perdono 1 Fatica; il giocatore attivo pesca 1 carta; la panchina recupera 1 Fatica; i contatori Break Time avanzano.
- Panchina: massimo 5 giocatori. Se piena, è possibile scambiare una carta dalla mano con una in panchina; l'operazione costa 1 sostituzione.
- Sostituzioni: 3 per turno. Una carta Leggendaria costa 2 sostituzioni.
- Leggendaria: richiede la Comune corrispondente in campo e si sovrappone ad essa. A Fatica 0 viene scartata definitivamente.
- Break Time: il giocatore normale a Fatica 0 resta fuori 3 turni completi, recupera tutta la Fatica e torna in panchina.
- Showdown: somma Attacco in campo contro somma Difesa in campo. Il bonus è `floor(abs(Attacco - Difesa) / 2)` e viene usato nel prossimo Showdown offensivo del difensore.
- Tiro: D20 + Tecnica + Bonus Showdown. Parata: D20 + Parata. È gol se il Tiro è superiore alla Parata.
- Portiere di Emergenza: qualsiasi altro giocatore può occupare il ruolo; Parata fissa 2.
- Eventi: rivelati ai turni 3, 6 e 9; restano attivi fino al prossimo Evento salvo diversa indicazione.

## Interpretazioni necessarie per il prototipo

1. **Nove turni totali alternati**: A-B-A-B-A-B-A-B-A. Il primo giocatore ha 5 turni e il secondo 4. La formulazione del regolamento non chiarisce se il turno sia un turno giocatore o un ciclo completo; verificare prima del gioco competitivo.
2. **Upkeep**: viene applicato a entrambe le squadre; pesca e tre sostituzioni spettano al giocatore attivo.
3. **Formazione iniziale**: i quattro giocatori sono scelti dalla collezione e non devono stare nel mazzo. Se la carta è presente anche nel mazzo, una copia viene rimossa.
4. **Sostituzioni ordinarie**: nel prototipo mantengono il ruolo.
5. **Leggendaria sovrapposta**: il motore mantiene la Leggendaria in campo fino a esaurimento; quando si esaurisce, la Comune sottostante torna attiva con la Fatica che aveva al momento della sovrapposizione.
6. **Break Time**: vengono conteggiati tre turni completi fuori dal campo. Se si entra durante l'upkeep, il turno corrente conta come primo; se si entra durante un'azione, il conteggio parte dal turno successivo.
7. **Un solo Showdown e un solo tiro per turno**: limite tecnico adottato perché il documento non quantifica quante occasioni di tiro esistano in ciascun turno.
8. **Finestra delle tattiche**: il motore locale permette le tattiche automatizzate prima dello Showdown; le reazioni difensive durante il turno avversario non sono ancora implementate.
9. **Turno 1**: l'upkeep viene applicato anche al primo turno; il primo giocatore pesca quindi una carta dopo la mano iniziale di 5.

## Questioni da definire

- Il significato preciso di 9 turni (9 turni giocatore o 9 round completi).
- Quante azioni offensive/occasioni di tiro sono consentite per turno.
- Se un portiere può essere scelto come tiratore.
- Finestre di risposta e priorità per tattiche difensive.
- Interazione tra eventi e abilità passive.
- Gestione del Tempo Supplementare (EV06), che estende la partita oltre il turno 9.
- Il ruolo definitivo di San Criminal.

Queste interpretazioni sono necessarie per il test; non riscrivono il regolamento cartaceo.
