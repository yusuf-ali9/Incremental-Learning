import "dotenv/config";
import { GroqProvider } from "./services/ai/groq.js";
import type { AIProvider } from "./services/ai/provider.js";

export const PORT = Number(process.env.PORT ?? 5174);
export const GROQ_API_KEY = process.env.GROQ_API_KEY ?? "";
export const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

// Single place that picks the AI implementation. Swap here for Claude/etc.
export const ai: AIProvider = new GroqProvider(GROQ_API_KEY, GROQ_MODEL);

export const AI_ENABLED = GROQ_API_KEY.length > 0;
