// Back-compat shim. The DB layer now lives in ./index.ts with pluggable
// SQLite (./sqlite.ts) and Postgres (./postgres.ts) backends. Existing imports
// of "../db/db.js" keep working.
export { db, initDb, DATA_DIR } from "./index.js";
