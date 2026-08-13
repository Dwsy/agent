/**
 * Run the explorer without Pi, for development and for checking the UI in a
 * browser. `PORT=7788 node scripts/serve.mjs`
 */

import { startServer } from "../src/server.ts";

const server = await startServer({ port: Number(process.env.PORT) || 0 });
console.log(`session-explorer listening on ${server.url}`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void server.close().then(() => process.exit(0));
  });
}
