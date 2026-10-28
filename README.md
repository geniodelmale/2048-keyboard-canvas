# 2048 Canvas per GitHub Copilot Desktop

Estensione personale senza dipendenze esterne, con griglia 4 x 4, regole 2048,
comandi da tastiera, controlli su schermo e swipe. Il raggiungimento di 2048 non
interrompe la partita.

Quando non restano mosse, una scritta gigante **GAME OVER!** appare sopra
le tessere. Undo o una nuova partita rimuovono la scritta appena il gioco
torna giocabile; i comandi restano sempre accessibili.

La tessera generata dopo ogni mossa valida ha un bordo in evidenza,
un'etichetta **NUOVA** e una breve animazione. Il segnale resta fino alla
mossa valida successiva, anche ricaricando il canvas. Undo e nuova partita
lo rimuovono. Le tessere spostate o unite non ricevono questa evidenziazione.
I salvataggi precedenti restano compatibili; il segnale apparira dalla
prima nuova mossa. Con movimento ridotto attivo, bordo ed etichetta restano
visibili senza animazione.

## Installazione

Copia questa cartella in `%USERPROFILE%\.copilot\extensions\keyboard-2048`
(oppure nella cartella `extensions` di `COPILOT_HOME`, se configurato).
L'entry point deve restare `extension.mjs`.

Ricarica le estensioni dal runtime, se disponibile, oppure apri una nuova chat
in Copilot Desktop. Chiedi: **Apri il canvas keyboard-2048**.
Non occorrono `npm install`, un server esterno o un account aggiuntivo:
Copilot risolve automaticamente `@github/copilot-sdk/extension`.

## Comandi

| Comando | Azione |
|---|---|
| Frecce o WASD | Muovi le tessere |
| U oppure Ctrl+Z / Cmd+Z | Annulla l'ultima mossa valida |
| N | Richiedi una nuova partita, con conferma |
| Pulsanti direzionali / swipe | Muovi senza tastiera |

Clicca la griglia per assegnare il focus al canvas. Le scorciatoie funzionano
quando il focus e nel canvas, non nella casella di chat di Copilot.

Undo e a un solo livello: ripristina la griglia esatta prima della mossa,
elimina anche la tessera casuale appena generata e ripristina punteggio e
numero di mosse. Una mossa senza effetto non consuma Undo. Si puo annullare
anche dopo la fine della partita; il record raggiunto non viene abbassato.
Una nuova partita azzera Undo.

## Salvataggio e architettura

Ogni conversazione ha una partita separata, salvata atomicamente nel file
`2048-save.json` dentro `session.workspacePath`, fornito dall'SDK.
Punteggio, record della conversazione e Undo sopravvivono al caricamento del
canvas e al riavvio dell'estensione. Due pannelli della stessa conversazione
condividono lo stato e si aggiornano via Server-Sent Events.

Il server usa solo `127.0.0.1`, una porta assegnata dal sistema e un token
casuale per ogni pannello. Non invia dati a servizi esterni.
In caso di errore di scrittura, la mossa non viene applicata e l'interfaccia
mostra l'errore. I salvataggi danneggiati non vengono sovrascritti: rinominali
o recuperali prima di riaprire il canvas.

`extension.mjs` registra il canvas e le azioni `get_state`, `move`, `undo`,
`new_game`. `game.mjs` contiene il motore; `server.mjs` gestisce salvataggio,
HTTP e SSE; `index.html`, `style.css`, `app.mjs` sono l'interfaccia.

## Sviluppo locale

Con Node.js 22 o successivo:

```powershell
node --test game.test.mjs server.test.mjs
node preview.mjs
```

Il secondo comando stampa un URL locale per provare l'interfaccia senza
Copilot. Il salvataggio della preview e separato, in `artifacts\preview-save.json`.
Interrompi il server con Ctrl+C.
