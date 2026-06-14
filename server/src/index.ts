import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_ENABLED, GROQ_MODEL, PORT } from "./config.js";
import { initDb } from "./db/index.js";
import { sourceRoutes } from "./routes/sources.js";
import { extractRoutes } from "./routes/extracts.js";
import { reviewRoutes } from "./routes/review.js";
import { topicRoutes } from "./routes/topics.js";
import { itemRoutes } from "./routes/items.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

await initDb(); // choose + initialize the DB backend before serving

const app = Fastify({ logger: { level: "info" } });

await app.register(multipart, {
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB PDFs
});

app.get("/api/health", async () => ({
  ok: true,
  ai_enabled: AI_ENABLED,
  model: GROQ_MODEL,
}));

await app.register(sourceRoutes);
await app.register(extractRoutes);
await app.register(reviewRoutes);
await app.register(topicRoutes);
await app.register(itemRoutes);

// In production, serve the built client. In dev, Vite serves it and proxies /api.
const clientDist = resolve(__dirname, "..", "..", "client", "dist");
if (existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html"); // SPA fallback
  });
}

try {
  // 0.0.0.0 so the server is reachable on Render (and still fine locally).
  await app.listen({ port: PORT, host: "0.0.0.0" });
  app.log.info(`SubMemo server on port ${PORT} (AI: ${AI_ENABLED ? "on" : "off"})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
