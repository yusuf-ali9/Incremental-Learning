import dotenv from "dotenv";
import { GroqProvider } from "./services/ai/groq.js";
import type { AIProvider } from "./services/ai/provider.js";

// override:true so editing server/.env actually replaces a stale system env var
// (e.g. swapping the Groq key). On Render there is no .env file, so the
// dashboard's env vars are used unchanged.
dotenv.config({ override: true });

export const PORT = Number(process.env.PORT ?? 5174);
export const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
export const DATABASE_URL = process.env.DATABASE_URL ?? "";

// Single place that picks the AI implementation. Swap here for Claude/etc.
export const ai: AIProvider = new GroqProvider(GROQ_API_KEY, GROQ_MODEL);

export const AI_ENABLED = GROQ_API_KEY.length > 0;
