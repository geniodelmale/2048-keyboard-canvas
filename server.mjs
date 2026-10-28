import { createServer } from "node:http";
import { readFile, mkdir, rename, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { DIRECTIONS, move, newGame, undo, validateSave, viewState } from "./game.mjs";

const assets = new Map([
    ["/", ["index.html", "text/html; charset=utf-8"]],
    ["/app.mjs", ["app.mjs", "text/javascript; charset=utf-8"]],
    ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);
const root = dirname(fileURLToPath(import.meta.url));

export async function createGameStore(savePath) {
    let state;
    try {
        state = validateSave(JSON.parse(await readFile(savePath, "utf8")));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        state = newGame();
    }
    let queue = Promise.resolve();
    const listeners = new Set();
    async function persist(next) {
        await mkdir(dirname(savePath), { recursive: true });
        const temporary = `${savePath}.${randomUUID()}.tmp`;
        try {
            await writeFile(temporary, JSON.stringify(next), { flag: "wx" });
            await rename(temporary, savePath);
        } finally {
            await rm(temporary, { force: true });
        }
    }
    await persist(state);
    return {
        snapshot: () => viewState(state),
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        execute(action, direction) {
            const result = queue.then(async () => {
                let next;
                if (action === "move" && DIRECTIONS.includes(direction)) next = move(state, direction);
                else if (action === "undo") next = undo(state);
                else if (action === "new") next = newGame(state.best);
                else throw new Error("Comando non valido.");
                if (next !== state) {
                    await persist(next);
                    state = next;
                    for (const listener of listeners) listener(viewState(state));
                }
                return viewState(state);
            });
            // A failed write is returned to its caller, without poisoning the command queue.
            queue = result.then(() => undefined, () => undefined);
            return result;
        },
    };
}

export async function startGameServer(store) {
    const token = randomUUID();
    const clients = new Set();
    const unsubscribe = store.subscribe(state => {
        for (const client of clients) client.write(`data: ${JSON.stringify(state)}\n\n`);
    });
    let origin;
    function json(response, status, value) {
        response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify(value));
    }
    const server = createServer(async (request, response) => {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        if (request.headers.host !== new URL(origin).host) {
            json(response, 403, { error: "Host non consentito." });
            return;
        }
        const url = new URL(request.url, origin);
        if (url.searchParams.get("token") !== token) {
            json(response, 403, { error: "Accesso non autorizzato." });
            return;
        }
        try {
            if (request.method === "GET" && assets.has(url.pathname)) {
                const [file, type] = assets.get(url.pathname);
                const body = await readFile(join(root, file));
                response.writeHead(200, { "Content-Type": type });
                response.end(body);
            } else if (request.method === "GET" && url.pathname === "/state") {
                json(response, 200, store.snapshot());
            } else if (request.method === "GET" && url.pathname === "/events") {
                response.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    Connection: "keep-alive",
                });
                response.write(`data: ${JSON.stringify(store.snapshot())}\n\n`);
                clients.add(response);
                request.on("close", () => clients.delete(response));
            } else if (request.method === "POST" && url.pathname === "/command") {
                if ((request.headers.origin && request.headers.origin !== origin)
                    || request.headers["content-type"] !== "application/json") {
                    json(response, 403, { error: "Origine o contenuto non consentiti." });
                    return;
                }
                let body = "";
                for await (const chunk of request) {
                    body += chunk;
                    if (body.length > 1024) {
                        json(response, 413, { error: "Richiesta troppo grande." });
                        return;
                    }
                }
                let command;
                try { command = JSON.parse(body); }
                catch { json(response, 400, { error: "JSON non valido." }); return; }
                if (!command || !["move", "undo", "new"].includes(command.action)
                    || (command.action === "move" && !DIRECTIONS.includes(command.direction))) {
                    json(response, 400, { error: "Comando non valido." });
                    return;
                }
                json(response, 200, await store.execute(command.action, command.direction));
            } else {
                json(response, 404, { error: "Risorsa non trovata." });
            }
        } catch (error) {
            process.stderr.write(`[2048] ${error.stack ?? error}\n`);
            if (!response.headersSent) json(response, 500, { error: "Errore del gioco o del salvataggio. Riprova." });
            else response.end();
        }
    });
    try {
        await new Promise((resolve, reject) => {
            server.once("error", reject);
            server.listen(0, "127.0.0.1", resolve);
        });
    } catch (error) {
        unsubscribe();
        throw error;
    }
    origin = `http://127.0.0.1:${server.address().port}`;
    return {
        url: `${origin}/?token=${token}`,
        async close() {
            unsubscribe();
            for (const client of clients) client.end();
            clients.clear();
            const closed = new Promise((resolve, reject) =>
                server.close(error => error ? reject(error) : resolve()));
            server.closeAllConnections();
            await closed;
        },
    };
}
