// Async DB abstraction shared by the SQLite and Postgres backends.
// SQL is written with `?` placeholders (SQLite style); the Postgres backend
// translates them to `$1..$n`.
export type Engine = "sqlite" | "postgres";

export interface Querier {
  get(sql: string, ...params: unknown[]): Promise<any>;
  all(sql: string, ...params: unknown[]): Promise<any[]>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
}

export interface Db extends Querier {
  exec(sql: string): Promise<void>; // multi-statement, no params (schema/DDL)
  transaction<T>(fn: (tx: Querier) => Promise<T>): Promise<T>;
  engine: Engine;
}
