import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import type { Topic } from "../types.js";

// Topics group sources (articles) on the Library page. The source is the
// "subtopic" level in Review.
export async function topicRoutes(app: FastifyInstance) {
  app.get("/api/topics", async () => {
    return (await db.all("SELECT * FROM topics ORDER BY created_at")) as Topic[];
  });

  app.post<{ Body: { name: string; parent_id?: string } }>(
    "/api/topics",
    async (req, reply) => {
      const { name, parent_id } = req.body;
      if (!name?.trim()) return reply.code(400).send({ error: "name is required" });
      const id = nanoid();
      const created_at = new Date().toISOString();
      await db.run(
        "INSERT INTO topics (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)",
        id,
        name.trim(),
        parent_id ?? null,
        created_at
      );
      return reply.code(201).send({ id, name: name.trim(), parent_id: parent_id ?? null, created_at });
    }
  );

  // Delete a topic. Its sources fall back to ungrouped (ON DELETE SET NULL).
  app.delete<{ Params: { id: string } }>("/api/topics/:id", async (req, reply) => {
    const exists = await db.get("SELECT id FROM topics WHERE id = ?", req.params.id);
    if (!exists) return reply.code(404).send({ error: "Topic not found" });
    await db.run("DELETE FROM topics WHERE id = ?", req.params.id);
    return { ok: true };
  });
}
