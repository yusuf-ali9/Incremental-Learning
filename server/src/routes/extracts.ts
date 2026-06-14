import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db/db.js";
import { ai } from "../config.js";
import { AIError } from "../services/ai/provider.js";
import type { Extract, KnowledgeItem } from "../types.js";

export async function extractRoutes(app: FastifyInstance) {
  // Extracts for a source, each with its atoms.
  app.get<{ Querystring: { source_id?: string } }>(
    "/api/extracts",
    async (req) => {
      const { source_id } = req.query;
      const rows = source_id
        ? (db
            .prepare(
              "SELECT * FROM extracts WHERE source_id = ? ORDER BY created_at"
            )
            .all(source_id) as Extract[])
        : (db.prepare("SELECT * FROM extracts ORDER BY created_at").all() as Extract[]);

      const itemStmt = db.prepare(
        "SELECT * FROM knowledge_items WHERE extract_id = ? ORDER BY created_at"
      );
      return rows.map((e) => ({ ...e, items: itemStmt.all(e.id) }));
    }
  );

  app.post<{
    Body: {
      source_id: string;
      text: string;
      page?: number;
      anchor?: unknown;
      topic_id?: string;
    };
  }>("/api/extracts", async (req, reply) => {
    const { source_id, text, page, anchor, topic_id } = req.body;
    if (!source_id || !text?.trim()) {
      return reply.code(400).send({ error: "source_id and text are required" });
    }
    const id = nanoid();
    const created_at = new Date().toISOString();
    db.prepare(
      `INSERT INTO extracts (id, source_id, topic_id, text, page, anchor, understood, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
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
      const exists = db
        .prepare("SELECT id FROM extracts WHERE id = ?")
        .get(req.params.id);
      if (!exists) return reply.code(404).send({ error: "Extract not found" });
      db.prepare("UPDATE extracts SET understood = ? WHERE id = ?").run(
        req.body.understood ? 1 : 0,
        req.params.id
      );
      return { ok: true };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/extracts/:id",
    async (req) => {
      db.prepare("DELETE FROM extracts WHERE id = ?").run(req.params.id);
      return { ok: true };
    }
  );

  // Atomize: AI breaks the extract into atoms, created at the 'encounter' stage
  // and due immediately. Cloze/Socratic content is generated lazily on advance.
  app.post<{ Params: { id: string } }>(
    "/api/extracts/:id/atomize",
    async (req, reply) => {
      const extract = db
        .prepare("SELECT * FROM extracts WHERE id = ?")
        .get(req.params.id) as Extract | undefined;
      if (!extract) return reply.code(404).send({ error: "Extract not found" });

      let atoms: string[];
      try {
        atoms = await ai.atomize(extract.text);
      } catch (err) {
        if (err instanceof AIError) {
          return reply.code(502).send({ error: err.message });
        }
        throw err;
      }

      const now = new Date().toISOString();
      const insert = db.prepare(
        `INSERT INTO knowledge_items
           (id, extract_id, content, stage, ef, interval_days, repetitions, due_date, created_at)
         VALUES (?, ?, ?, 'encounter', 2.5, 0, 0, ?, ?)`
      );
      const created: KnowledgeItem[] = [];
      const tx = db.transaction(() => {
        for (const content of atoms) {
          const id = nanoid();
          insert.run(id, extract.id, content, now, now);
          created.push(
            db.prepare("SELECT * FROM knowledge_items WHERE id = ?").get(id) as KnowledgeItem
          );
        }
      });
      tx();

      return reply.code(201).send({ items: created });
    }
  );
}
