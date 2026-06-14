import type { Db } from "./types.js";
import { createSqliteDb, DATA_DIR } from "./sqlite.js";
import { createPostgresDb } from "./postgres.js";

export { DATA_DIR };
export type { Db, Querier, Engine } from "./types.js";

let impl: Db | null = null;

// Pick the backend: Postgres when DATABASE_URL is set (Render), else local
// SQLite. Must be awaited before the server handles requests.
export async function initDb(): Promise<void> {
  if (impl) return;
  const url = process.env.DATABASE_URL;
  impl = url ? await createPostgresDb(url) : await createSqliteDb();
  // eslint-disable-next-line no-console
  console.log(`[db] using ${impl.engine}`);
}

function need(): Db {
  if (!impl) throw new Error("DB not initialized — call initDb() first");
  return impl;
}

// Stable facade imported throughout the app; delegates to the chosen backend.
export const db: Db = {
  get: (sql, ...p) => need().get(sql, ...p),
  all: (sql, ...p) => need().all(sql, ...p),
  run: (sql, ...p) => need().run(sql, ...p),
  exec: (sql) => need().exec(sql),
  transaction: (fn) => need().transaction(fn),
  get engine() {
    return need().engine;
  },
};
