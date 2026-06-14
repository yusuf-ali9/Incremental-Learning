import type { FastifyInstance } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { extname, join } from "node:path";
import { nanoid } from "nanoid";
import { db } from "../db/db.js";
import { UPLOADS_DIR } from "../db/db.js";
import type { Source } from "../types.js";

export async function sourceRoutes(app: FastifyInstance) {
  // Library list, with extract + due-item counts for badges.
  app.get("/api/sources", async () => {
    const now = new Date().toISOString();
    return db
      .prepare(
        `SELECT s.*,
          (SELECT COUNT(*) FROM extracts e WHERE e.source_id = s.id) AS extract_count,
          (SELECT COUNT(*) FROM knowledge_items k
             JOIN extracts e ON e.id = k.extract_id
             WHERE e.source_id = s.id AND e.understood = 1 AND k.due_date <= ?) AS due_count
         FROM sources s ORDER BY s.created_at DESC`
      )
      .all(now);
  });

  app.get<{ Params: { id: string } }>("/api/sources/:id", async (req, reply) => {
    const src = db
      .prepare("SELECT * FROM sources WHERE id = ?")
      .get(req.params.id) as Source | undefined;
    if (!src) return reply.code(404).send({ error: "Source not found" });
    return src;
  });

  // Stream the stored PDF to the viewer.
  app.get<{ Params: { id: string } }>(
    "/api/sources/:id/file",
    async (req, reply) => {
      const src = db
        .prepare("SELECT * FROM sources WHERE id = ?")
        .get(req.params.id) as Source | undefined;
      if (!src || !src.file_path) {
        return reply.code(404).send({ error: "File not found" });
      }
      reply.type("application/pdf");
      return reply.send(createReadStream(src.file_path));
    }
  );

  // Upload a PDF (multipart). The file is copied into data/uploads.
  app.post("/api/sources", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "No file uploaded" });
    if (extname(data.filename).toLowerCase() !== ".pdf") {
      return reply.code(400).send({ error: "Only PDF files are supported" });
    }

    const id = nanoid();
    const filePath = join(UPLOADS_DIR, `${id}.pdf`);
    await pipeline(data.file, createWriteStream(filePath));

    const title =
      (data.fields?.title as any)?.value?.toString().trim() ||
      data.filename.replace(/\.pdf$/i, "");
    const topicId = (data.fields?.topic_id as any)?.value?.toString().trim() || null;
    const created_at = new Date().toISOString();

    db.prepare(
      `INSERT INTO sources (id, type, title, file_path, topic_id, created_at)
       VALUES (?, 'pdf', ?, ?, ?, ?)`
    ).run(id, title, filePath, topicId, created_at);

    return reply.code(201).send({ id, type: "pdf", title, topic_id: topicId, created_at });
  });

  // Assign / move / un-group a source. topic_id null => ungrouped.
  app.patch<{ Params: { id: string }; Body: { topic_id: string | null } }>(
    "/api/sources/:id",
    async (req, reply) => {
      const exists = db.prepare("SELECT id FROM sources WHERE id = ?").get(req.params.id);
      if (!exists) return reply.code(404).send({ error: "Source not found" });
      const topicId = req.body.topic_id ?? null;
      if (topicId) {
        const topic = db.prepare("SELECT id FROM topics WHERE id = ?").get(topicId);
        if (!topic) return reply.code(400).send({ error: "Topic not found" });
      }
      db.prepare("UPDATE sources SET topic_id = ? WHERE id = ?").run(topicId, req.params.id);
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/sources/:id",
    async (req, reply) => {
      const src = db
        .prepare("SELECT * FROM sources WHERE id = ?")
        .get(req.params.id) as Source | undefined;
      if (!src) return reply.code(404).send({ error: "Source not found" });
      db.prepare("DELETE FROM sources WHERE id = ?").run(req.params.id);
      if (src.file_path) await unlink(src.file_path).catch(() => {});
      return { ok: true };
    }
  );
}
