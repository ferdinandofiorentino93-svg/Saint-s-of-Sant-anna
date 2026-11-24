# Roadmap

## 0.1 — Fondamenta (questa build)

- UI essenziale e responsive.
- Catalogo principale completo (50 carte) e snapshot alternativo separato (8 versioni).
- Regolamento sintetico in pagina HTML dedicata.
- Allenamento e partita locale contro CPU semplice.
- Motore centrale: upkeep, Fatica, Break Time, panchina, cambi, Rank Up, Showdown, D20, Parata, fine partita.
- Multiplayer predisposto con Supabase Auth, stanze, Realtime e Edge Functions.

## 0.2 — Automazione carte

- Definire una rappresentazione dati degli effetti con trigger, finestra, costo, bersagli, durata e frequenza.
- Implementare tutte le abilità dei 20 giocatori.
- Implementare tutte le 20 tattiche, incluse risposte difensive nel turno avversario.
- Automatizzare i 10 eventi, incluso Tempo Supplementare.
- Aggiungere test per ogni carta e per le interazioni.

## 0.3 — Multiplayer completo

- Completare l'installazione Supabase in un progetto reale.
- Provare riconnessione, abbandono temporaneo e rientro alla stessa stanza.
- Gestire timeout e abbandono volontario.
- Aggiungere notifiche di turno e indicatori di presenza.
- Verificare che lo stato privato non trapeli attraverso API, Realtime o log.

## 0.4 — Bilanciamento e UX

- Confermare il significato di 9 turni.
- Verificare il vantaggio del primo giocatore.
- Simulare partite e raccogliere statistiche su gol, Fatica, sostituzioni e carte.
- Rifinire deck builder e scelta della formazione.
- Migliorare il comportamento della CPU.

## 1.0 — Prima versione pubblicabile

- Regolamento consolidato e versionato.
- Tutte le carte implementate e testate.
- Multiplayer validato su più dispositivi.
- Gestione profilo, collezione e mazzi persistenti.
- Backup, logging tecnico e documentazione di rilascio.
