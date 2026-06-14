import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Db, Querier } from "./types.js";
import { schemaFor } from "./sql.js";
import { migrate } from "./migrate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// data/ lives at the repo root: server/src/db -> ../../../data
export const DATA_DIR = resolve(__dirname, "..", "..", "..", "data");

// Local default backend. node:sqlite is synchronous; we wrap it in the async
// interface so the rest of the app is engine-agnostic.
export async function createSqliteDb(): Promise<Db> {
  mkdirSync(DATA_DIR, { recursive: true });
  const raw = new DatabaseSync(join(DATA_DIR, "submemo.sqlite"));
  raw.exec("PRAGMA journal_mode = WAL;");
  raw.exec("PRAGMA foreign_keys = ON;");

  const q: Querier = {
    get: async (sql, ...p) => raw.prepare(sql).get(...(p as any)) ?? undefined,
    all: async (sql, ...p) => raw.prepare(sql).all(...(p as any)) as any[],
    run: async (sql, ...p) => ({ changes: Number(raw.prepare(sql).run(...(p as any)).changes) }),
  };

  const db: Db = {
    ...q,
    engine: "sqlite",
    exec: async (sql) => {
      raw.exec(sql);
    },
    transaction: async (fn) => {
      raw.exec("BEGIN");
      try {
        const result = await fn(q);
        raw.exec("COMMIT");
        return result;
      } catch (err) {
        raw.exec("ROLLBACK");
        throw err;
      }
    },
  };

  await db.exec(schemaFor("sqlite"));
  await migrate(db);
  return db;
}
