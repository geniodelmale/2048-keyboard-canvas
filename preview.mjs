import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGameStore, startGameServer } from "./server.mjs";

const store = await createGameStore(join(fileURLToPath(new URL(".", import.meta.url)), "artifacts", "preview-save.json"));
const server = await startGameServer(store);
process.stdout.write(`${server.url}\n`);
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => { await server.close(); process.exit(0); });
}
