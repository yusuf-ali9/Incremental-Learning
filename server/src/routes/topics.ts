import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db/db.js";
import type { Topic } from "../types.js";

// Topics/subtopics exist now so the 2.0 browser-extension capture flow is a
// no-op migration. The PDF app uses them lightly.
export async function topicRoutes(app: FastifyInstance) {
  app.get("/api/topics", async () => {
    return db.prepare("SELECT * FROM topics ORDER BY created_at").all() as Topic[];
  });

  app.post<{ Body: { name: string; parent_id?: string } }>(
    "/api/topics",
    async (req, reply) => {
      const { name, parent_id } = req.body;
      if (!name?.trim()) return reply.code(400).send({ error: "name is required" });
      const id = nanoid();
      const created_at = new Date().toISOString();
      db.prepare(
        "INSERT INTO topics (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)"
      ).run(id, name.trim(), parent_id ?? null, created_at);
      return reply.code(201).send({ id, name: name.trim(), parent_id: parent_id ?? null, created_at });
    }
  );

  // Delete a topic. Its sources fall back to ungrouped (ON DELETE SET NULL).
  app.delete<{ Params: { id: string } }>("/api/topics/:id", async (req, reply) => {
    const exists = db.prepare("SELECT id FROM topics WHERE id = ?").get(req.params.id);
    if (!exists) return reply.code(404).send({ error: "Topic not found" });
    db.prepare("DELETE FROM topics WHERE id = ?").run(req.params.id);
    return { ok: true };
  });
}
