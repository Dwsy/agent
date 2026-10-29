/**
 * SQLite access for the explorer, in whichever runtime Pi loads the extension.
 *
 * Pi Desktop runs extensions inside a Bun binary; the CLI runs them under Node.
 * The two need different drivers:
 *
 * - Bun: the built-in bun:sqlite module. Installed native packages do not work
 *   here: better-sqlite3 aborts on Bun, and node-sqlite3-wasm cannot read
 *   WAL-mode databases, which the Pi sessions.db is.
 * - Node: better-sqlite3, installed with this extension.
 *
 * Only the query shape the explorer uses is exposed. A query that matches no
 * row returns undefined from both drivers.
 */

import { createRequire } from "node:module";

export type SqlValue = string | number | bigint | null;
export type SqlRow = Record<string, unknown>;

export interface SqlStatement {
  get(...params: SqlValue[]): SqlRow | undefined;
  all(...params: SqlValue[]): SqlRow[];
}

export interface SqlDatabase {
  prepare(sql: string): SqlStatement;
  close(): void;
}

/** The subset of both drivers that this adapter touches. */
interface RawStatement {
  get(...params: SqlValue[]): SqlRow | null | undefined;
  all(...params: SqlValue[]): SqlRow[];
}

interface RawDatabase {
  prepare(sql: string): RawStatement;
  close(): void;
}

const requireFromHere = createRequire(import.meta.url);

function adapt(db: RawDatabase): SqlDatabase {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        get: (...params) => statement.get(...params) ?? undefined,
        all: (...params) => statement.all(...params),
      };
    },
    close: () => db.close(),
  };
}

/** Open an existing database file read-only. Throws when it cannot be opened. */
export function openReadOnly(path: string): SqlDatabase {
  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
    const { Database } = requireFromHere("bun:sqlite") as {
      Database: new (file: string, options: { readonly: boolean }) => RawDatabase;
    };
    return adapt(new Database(path, { readonly: true }));
  }

  const BetterSqlite3 = requireFromHere("better-sqlite3") as new (
    file: string,
    options: { readonly: boolean; fileMustExist: boolean },
  ) => RawDatabase;
  return adapt(new BetterSqlite3(path, { readonly: true, fileMustExist: true }));
}
