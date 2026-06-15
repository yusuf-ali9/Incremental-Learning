import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { extname } from "node:path";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import type { Source } from "../types.js";

export async function sourceRoutes(app: FastifyInstance) {
  // Library list, with extract + active-due counts for badges.
  app.get("/api/sources", async () => {
    const now = new Date().toISOString();
    const rows = await db.all(
      `SELECT s.id, s.type, s.title, s.topic_id, s.created_at,
        (SELECT COUNT(*) FROM extracts e WHERE e.source_id = s.id) AS extract_count,
        (SELECT COUNT(*) FROM knowledge_items k
           JOIN extracts e ON e.id = k.extract_id
           WHERE e.source_id = s.id AND e.understood = 1 AND k.status = 'active'
             AND k.due_date <= ?) AS due_count
       FROM sources s ORDER BY s.created_at DESC`,
      now
    );
    // Postgres returns COUNT(*) (bigint) as a string — coerce so the client can
    // do arithmetic (e.g. the nav badge sums due_count).
    return rows.map((r) => ({
      ...r,
      extract_count: Number(r.extract_count),
      due_count: Number(r.due_count),
    }));
  });

  app.get<{ Params: { id: string } }>("/api/sources/:id", async (req, reply) => {
    const src = (await db.get(
      "SELECT id, type, title, topic_id, created_at FROM sources WHERE id = ?",
      req.params.id
    )) as Source | undefined;
    if (!src) return reply.code(404).send({ error: "Source not found" });
    return src;
  });

  // Stream the stored PDF. Prefer DB bytes; fall back to an old on-disk file.
  app.get<{ Params: { id: string } }>("/api/sources/:id/file", async (req, reply) => {
    const src = (await db.get(
      "SELECT pdf_data, file_path FROM sources WHERE id = ?",
      req.params.id
    )) as { pdf_data: Uint8Array | null; file_path: string | null } | undefined;
    if (!src) return reply.code(404).send({ error: "File not found" });
    if (src.pdf_data) {
      reply.type("application/pdf");
      return reply.send(Buffer.from(src.pdf_data));
    }
    if (src.file_path && existsSync(src.file_path)) {
      reply.type("application/pdf");
      return reply.send(createReadStream(src.file_path));
    }
    return reply.code(404).send({ error: "File not found" });
  });

  // Upload a PDF (multipart). Bytes are stored in the DB so they survive
  // restarts / ephemeral hosting.
  app.post("/api/sources", async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "No file uploaded" });
    if (extname(data.filename).toLowerCase() !== ".pdf") {
      return reply.code(400).send({ error: "Only PDF files are supported" });
    }
    const buffer = await data.toBuffer();

    const id = nanoid();
    const title =
      (data.fields?.title as any)?.value?.toString().trim() ||
      data.filename.replace(/\.pdf$/i, "");
    const topicId = (data.fields?.topic_id as any)?.value?.toString().trim() || null;
    const created_at = new Date().toISOString();

    await db.run(
      `INSERT INTO sources (id, type, title, pdf_data, topic_id, created_at)
       VALUES (?, 'pdf', ?, ?, ?, ?)`,
      id,
      title,
      buffer,
      topicId,
      created_at
    );
    return reply.code(201).send({ id, type: "pdf", title, topic_id: topicId, created_at });
  });

  // Assign / move / un-group a source. topic_id null => ungrouped.
  app.patch<{ Params: { id: string }; Body: { topic_id: string | null } }>(
    "/api/sources/:id",
    async (req, reply) => {
      const exists = await db.get("SELECT id FROM sources WHERE id = ?", req.params.id);
      if (!exists) return reply.code(404).send({ error: "Source not found" });
      const topicId = req.body.topic_id ?? null;
      if (topicId) {
        const topic = await db.get("SELECT id FROM topics WHERE id = ?", topicId);
        if (!topic) return reply.code(400).send({ error: "Topic not found" });
      }
      await db.run("UPDATE sources SET topic_id = ? WHERE id = ?", topicId, req.params.id);
      return { ok: true };
    }
  );

  // Reactivate every suspended/archived atom under a source (undo accidental
  // "Mark mastered" / "Remove"). Returns how many were flipped back to active.
  app.post<{ Params: { id: string } }>("/api/sources/:id/reactivate", async (req, reply) => {
    const exists = await db.get("SELECT id FROM sources WHERE id = ?", req.params.id);
    if (!exists) return reply.code(404).send({ error: "Source not found" });
    const res = await db.run(
      `UPDATE knowledge_items SET status = 'active'
       WHERE status != 'active'
         AND extract_id IN (SELECT id FROM extracts WHERE source_id = ?)`,
      req.params.id
    );
    return { reactivated: res.changes };
  });

  app.delete<{ Params: { id: string } }>("/api/sources/:id", async (req, reply) => {
    const exists = await db.get("SELECT id FROM sources WHERE id = ?", req.params.id);
    if (!exists) return reply.code(404).send({ error: "Source not found" });
    await db.run("DELETE FROM sources WHERE id = ?", req.params.id);
    return { ok: true };
  });
}
