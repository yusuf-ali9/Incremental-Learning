import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Engine } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rawSchema = readFileSync(join(__dirname, "schema.sql"), "utf-8");

// Substitute the one engine-specific type: blob bytes for the stored PDF.
export function schemaFor(engine: Engine): string {
  return rawSchema.replaceAll("{{BYTES}}", engine === "postgres" ? "BYTEA" : "BLOB");
}

export const bytesType = (engine: Engine) => (engine === "postgres" ? "BYTEA" : "BLOB");
