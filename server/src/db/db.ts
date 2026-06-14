import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// data/ lives at the repo root: server/src/db -> ../../../data
export const DATA_DIR = resolve(__dirname, "..", "..", "..", "data");
export const UPLOADS_DIR = join(DATA_DIR, "uploads");
const DB_PATH = join(DATA_DIR, "submemo.sqlite");

mkdirSync(UPLOADS_DIR, { recursive: true });

const raw = new DatabaseSync(DB_PATH);
raw.exec("PRAGMA journal_mode = WAL;");
raw.exec("PRAGMA foreign_keys = ON;");

// Apply schema (idempotent — every statement is CREATE ... IF NOT EXISTS).
const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
raw.exec(schema);

// Lightweight migrations for databases created by an earlier version. CREATE IF
// NOT EXISTS won't add columns to a pre-existing table, so add them by hand.
function addColumnIfMissing(table: string, column: string, definition: string) {
  const cols = raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    raw.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}
addColumnIfMissing("sources", "topic_id", "topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL");
addColumnIfMissing(
  "knowledge_items",
  "status",
  "status TEXT NOT NULL DEFAULT 'active'"
);

// Indexes on the 1.1 columns — created here, after the columns are guaranteed
// to exist (on both fresh and upgraded databases).
raw.exec("CREATE INDEX IF NOT EXISTS idx_sources_topic ON sources(topic_id)");
raw.exec("CREATE INDEX IF NOT EXISTS idx_items_status ON knowledge_items(status)");

// Loose statement type: node:sqlite returns `Record<string, SQLOutputValue>`,
// which won't cast directly to our domain interfaces. Returning `any` here lets
// call sites cast results (e.g. `.get(id) as Source`) cleanly.
interface Stmt {
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
}

// Small adapter so call sites read like better-sqlite3 (prepare/run/get/all +
// a transaction helper). node:sqlite has no built-in transaction wrapper.
export const db = {
  prepare: (sql: string): Stmt => raw.prepare(sql) as unknown as Stmt,
  exec: (sql: string) => raw.exec(sql),
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: Parameters<T>): ReturnType<T> => {
      raw.exec("BEGIN");
      try {
        const result = fn(...args);
        raw.exec("COMMIT");
        return result;
      } catch (err) {
        raw.exec("ROLLBACK");
        throw err;
      }
    }) as T;
  },
};
