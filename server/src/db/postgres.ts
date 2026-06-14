import pg from "pg";
import type { Db, Querier } from "./types.js";
import { schemaFor } from "./sql.js";
import { migrate } from "./migrate.js";

// Translate SQLite-style `?` placeholders to Postgres `$1..$n`.
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

type Run = (text: string, params: unknown[]) => Promise<pg.QueryResult>;

function querier(run: Run): Querier {
  return {
    get: async (sql, ...p) => (await run(toPg(sql), p)).rows[0] ?? undefined,
    all: async (sql, ...p) => (await run(toPg(sql), p)).rows,
    run: async (sql, ...p) => ({ changes: (await run(toPg(sql), p)).rowCount ?? 0 }),
  };
}

// Production backend (Render). Activated when DATABASE_URL is set.
export async function createPostgresDb(connectionString: string): Promise<Db> {
  const local = /@(localhost|127\.0\.0\.1)/.test(connectionString);
  const pool = new pg.Pool({
    connectionString,
    ssl: local ? false : { rejectUnauthorized: false },
  });

  const base = querier((text, params) => pool.query(text, params as any[]));

  const db: Db = {
    ...base,
    engine: "postgres",
    exec: async (sql) => {
      await pool.query(sql); // multi-statement, no params
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      const tx = querier((text, params) => client.query(text, params as any[]));
      try {
        await client.query("BEGIN");
        const result = await fn(tx);
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  };

  await db.exec(schemaFor("postgres"));
  await migrate(db);
  return db;
}
