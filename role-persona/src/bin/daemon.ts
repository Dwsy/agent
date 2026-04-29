#!/usr/bin/env bun
/**
 * role-persona daemon entry point.
 *
 * Usage:
 *   bun run src/bin/daemon.ts          # default port 3939
 *   PORT=8080 bun run src/bin/daemon.ts
 */

import { startDaemon } from "../transport/daemon.ts";

startDaemon();
