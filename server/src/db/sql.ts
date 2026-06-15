import type { Engine } from "./types.js";
import { SCHEMA_SQL } from "./schema.js";

// Substitute the one engine-specific type: blob bytes for the stored PDF.
export function schemaFor(engine: Engine): string {
  return SCHEMA_SQL.replaceAll("{{BYTES}}", engine === "postgres" ? "BYTEA" : "BLOB");
}

export const bytesType = (engine: Engine) => (engine === "postgres" ? "BYTEA" : "BLOB");
