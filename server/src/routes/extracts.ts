import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { ai } from "../config.js";
import { AIError } from "../services/ai/provider.js";
import type { Extract, KnowledgeItem } from "../types.js";

export async function extractRoutes(app: FastifyInstance) {
  // Extracts for a source, each with its atoms.
  app.get<{ Querystring: { source_id?: string } }>("/api/extracts", async (req) => {
    const { source_id } = req.query;
    const rows = (source_id
      ? await db.all("SELECT * FROM extracts WHERE source_id = ? ORDER BY created_at", source_id)
      : await db.all("SELECT * FROM extracts ORDER BY created_at")) as Extract[];

    return Promise.all(
      rows.map(async (e) => ({
        ...e,
        items: await db.all(
          "SELECT * FROM knowledge_items WHERE extract_id = ? ORDER BY created_at",
          e.id
        ),
      }))
    );
  });

  app.post<{
    Body: { source_id: string; text: string; page?: number; anchor?: unknown; topic_id?: string };
  }>("/api/extracts", async (req, reply) => {
    const { source_id, text, page, anchor, topic_id } = req.body;
    if (!source_id || !text?.trim()) {
      return reply.code(400).send({ error: "source_id and text are required" });
    }
    const id = nanoid();
    const created_at = new Date().toISOString();
    await db.run(
      `INSERT INTO extracts (id, source_id, topic_id, text, page, anchor, understood, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      id,
      source_id,
      topic_id ?? null,
      text.trim(),
      page ?? null,
      anchor ? JSON.stringify(anchor) : null,
      created_at
    );
    return reply.code(201).send({ id });
  });

  // Mark understood / not understood. Not-understood gates atoms from review.
  app.patch<{ Params: { id: string }; Body: { understood: boolean } }>(
    "/api/extracts/:id",
    async (req, reply) => {
      const exists = await db.get("SELECT id FROM extracts WHERE id = ?", req.params.id);
      if (!exists) return reply.code(404).send({ error: "Extract not found" });
      await db.run(
        "UPDATE extracts SET understood = ? WHERE id = ?",
        req.body.understood ? 1 : 0,
        req.params.id
      );
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>("/api/extracts/:id", async (req) => {
    await db.run("DELETE FROM extracts WHERE id = ?", req.params.id);
    return { ok: true };
  });

  // Atomize: AI breaks the extract into atoms, created at the 'encounter' stage
  // and due immediately. Cloze/Socratic content is generated lazily on advance.
  app.post<{ Params: { id: string } }>("/api/extracts/:id/atomize", async (req, reply) => {
    const extract = (await db.get(
      "SELECT * FROM extracts WHERE id = ?",
      req.params.id
    )) as Extract | undefined;
    if (!extract) return reply.code(404).send({ error: "Extract not found" });

    let atoms: string[];
    try {
      atoms = await ai.atomize(extract.text);
    } catch (err) {
      if (err instanceof AIError) return reply.code(502).send({ error: err.message });
      throw err;
    }

    const now = new Date().toISOString();
    const created = await db.transaction(async (tx) => {
      const out: KnowledgeItem[] = [];
      for (const content of atoms) {
        const id = nanoid();
        await tx.run(
          `INSERT INTO knowledge_items
             (id, extract_id, content, stage, ef, interval_days, repetitions, due_date, created_at)
           VALUES (?, ?, ?, 'encounter', 2.5, 0, 0, ?, ?)`,
          id,
          extract.id,
          content,
          now,
          now
        );
        out.push((await tx.get("SELECT * FROM knowledge_items WHERE id = ?", id)) as KnowledgeItem);
      }
      return out;
    });

    return reply.code(201).send({ items: created });
  });
}
