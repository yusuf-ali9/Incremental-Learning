import type { Db } from "./types.js";
import { bytesType } from "./sql.js";

// schema.sql is CREATE-IF-NOT-EXISTS only, so it never adds columns to an
// existing table. Add them by hand, idempotently, on both engines.
async function hasColumn(db: Db, table: string, column: string): Promise<boolean> {
  if (db.engine === "postgres") {
    const rows = await db.all(
      "SELECT column_name FROM information_schema.columns WHERE table_name = ?",
      table
    );
    return rows.some((r) => r.column_name === column);
  }
  const rows = await db.all(`PRAGMA table_info(${table})`); // PRAGMA can't be parameterized
  return rows.some((r) => r.name === column);
}

export async function migrate(db: Db): Promise<void> {
  async function addColumn(table: string, column: string, def: string) {
    if (!(await hasColumn(db, table, column))) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`);
    }
  }

  await addColumn(
    "sources",
    "topic_id",
    "topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL"
  );
  await addColumn("sources", "pdf_data", `pdf_data ${bytesType(db.engine)}`);
  await addColumn("knowledge_items", "status", "status TEXT NOT NULL DEFAULT 'active'");

  // Indexes on the added columns (created after the columns are guaranteed).
  await db.exec("CREATE INDEX IF NOT EXISTS idx_sources_topic ON sources(topic_id)");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_items_status ON knowledge_items(status)");
}
