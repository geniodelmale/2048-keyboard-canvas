const token = new URLSearchParams(location.search).get("token");
const endpoint = path => `${path}?token=${encodeURIComponent(token)}`;
const board = document.querySelector("#board");
const errorBox = document.querySelector("#error");
const undoButton = document.querySelector("#undo");
const dialog = document.querySelector("#restart-dialog");
const number = new Intl.NumberFormat("it-IT");
let state;
let pending = Promise.resolve();
let connected = false;
let storageError = false;
const cells = Array.from({ length: 16 }, () => {
    const cell = document.createElement("div");
    cell.className = "tile";
    board.append(cell);
    return cell;
});

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
}

function render(next) {
    cells.forEach((cell, index) => {
        const value = next.board[index];
        const spawned = value && index === next.spawnedIndex;
        cell.className = `tile${value >= 1024 ? " large" : ""}`;
        if (value && state && value !== state.board[index]) cell.classList.add("changed");
        if (spawned) cell.classList.add("spawned");
        cell.dataset.level = value ? Math.min(11, Math.log2(value)) : 0;
        cell.textContent = value || "";
        cell.setAttribute("aria-label", `Riga ${Math.floor(index / 4) + 1}, colonna ${index % 4 + 1}: ${value || "vuota"}${spawned ? " (nuova tessera)" : ""}`);
    });
    document.querySelector("#score").textContent = number.format(next.score);
    document.querySelector("#best").textContent = number.format(next.best);
    document.querySelector("#moves").textContent = `${next.moves} ${next.moves === 1 ? "mossa" : "mosse"}`;
    document.querySelector("#status").textContent = next.gameOver
        ? "Nessuna mossa. Undo o nuova partita."
        : next.won ? "2048 raggiunto! Puoi continuare." : "La prossima mossa e tua.";
    document.querySelector("#game-over").hidden = !next.gameOver;
    undoButton.disabled = !next.canUndo;
    state = next;
}

function command(action, direction) {
    pending = pending.then(async () => {
        const response = await fetch(endpoint("/command"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, direction }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Errore HTTP ${response.status}`);
        storageError = false;
        if (connected) errorBox.hidden = true;
        render(result);
    }).catch(error => {
        storageError = true;
        showError(`Mossa non confermata: ${error.message}`);
    });
    return pending;
}

function requestRestart() {
    if (!dialog.open) {
        dialog.returnValue = "";
        dialog.showModal();
    }
}
dialog.addEventListener("close", () => {
    if (dialog.returnValue === "restart") void command("new");
    board.focus({ preventScroll: true });
});
document.querySelector("#new").addEventListener("click", requestRestart);
undoButton.addEventListener("click", () => { void command("undo"); board.focus({ preventScroll: true }); });
document.querySelectorAll("[data-direction]").forEach(button => {
    button.addEventListener("click", () => {
        void command("move", button.dataset.direction);
        board.focus({ preventScroll: true });
    });
});
const keys = {
    ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
    a: "left", d: "right", w: "up", s: "down",
};
document.addEventListener("keydown", event => {
    if (dialog.open || event.isComposing || event.altKey
        || event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if ((event.ctrlKey || event.metaKey) && key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) void command("undo");
        return;
    }
    if (event.ctrlKey || event.metaKey) return;
    if (keys[key]) {
        event.preventDefault();
        void command("move", keys[key]);
    } else if (key === "u") {
        event.preventDefault();
        if (!event.repeat) void command("undo");
    } else if (key === "n") {
        event.preventDefault();
        if (!event.repeat) requestRestart();
    }
});
let start;
board.addEventListener("pointerdown", event => {
    board.focus({ preventScroll: true });
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    board.setPointerCapture(event.pointerId);
});
board.addEventListener("pointercancel", () => { start = undefined; });
board.addEventListener("pointerup", event => {
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    start = undefined;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    void command("move", direction);
});

const events = new EventSource(endpoint("/events"));
events.addEventListener("message", event => {
    try { render(JSON.parse(event.data)); }
    catch (error) { showError(`Stato del gioco non valido: ${error.message}`); }
});
events.addEventListener("open", () => {
    connected = true;
    if (!storageError) errorBox.hidden = true;
});
events.addEventListener("error", () => {
    connected = false;
    showError("Connessione interrotta. Riconnessione automatica in corso; la partita resta salvata.");
});
window.addEventListener("pagehide", () => events.close());
board.focus({ preventScroll: true });
