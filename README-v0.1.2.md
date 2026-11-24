# Saints of Sant’Anna — build GitHub Pages v0.1.2

Questa è una build di miglioramento del prototipo locale. I file hanno il suffisso `-v0.1.2` per evitare di sovrascrivere la versione già pubblicata durante il caricamento dal telefono.

## Novità

- Fatica leggibile come riserva attuale/massima, con barra e stato critico.
- Panchina con Fatica visibile; recupera 1 punto a ogni mantenimento.
- Spiegazione del costo Fatica delle abilità: il costo viene sottratto al momento dell’attivazione.
- Pulsanti delle abilità manuali visibili anche quando non sono ancora attivabili, con il motivo e la finestra corretta.
- Corretto il passaggio del tiratore selezionato alle abilità che lo richiedono.
- Risultato Showdown distinto: totale Attacco, totale Difesa, differenziale, formazioni coinvolte e bonus.
- Risultato tiro distinto: D20 del tiratore, Tecnica, bonus, D20 del portiere, Parata, totali e verdetto Gol/Parata.
- Cronaca con esito e costo delle abilità.

## Regole implementate nel prototipo

La gestione della Fatica segue il regolamento consultato: tutti i giocatori in campo perdono 1 Fatica all’inizio di ogni turno; i giocatori in panchina recuperano 1 Fatica. Un Comune a 0 entra in Break Time per tre turni completi e rientra in panchina con Fatica piena. Se si esaurisce la Leggendaria, viene scartato il livello Leggendario e resta la Comune sottostante. Il costo delle abilità viene pagato subito.

Lo Showdown somma ATT della squadra attiva e DIF della squadra avversaria. Il tiro usa D20 + TEC + bonus; la parata usa D20 + PAR. È gol solo se il tiro è strettamente superiore alla parata.

## Limiti noti

Non tutte le abilità reattive/passive sono automatizzate. Quelle ancora mancanti sono marcate nella schermata della partita come **Reazione non automatizzata** o **Effetto non ancora automatizzato**. Le tattiche prive di `effectData` e gli Eventi restano catalogati ma non hanno ancora tutti gli effetti automatizzati. San Criminal resta escluso dal motore finché non viene risolta la discrepanza del suo ruolo nel catalogo ufficiale. Il multiplayer richiede ancora la configurazione del backend Supabase.

## File da caricare

Carica tutti i file contenuti nello ZIP direttamente nella radice del repository, senza creare sottocartelle. Apri prima `index-v0.1.2.html` per provare la nuova build senza sostituire la pagina già online. Dopo il test, si potrà decidere se renderla la pagina principale.
