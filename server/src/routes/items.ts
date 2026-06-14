import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { ai } from "../config.js";
import { AIError } from "../services/ai/provider.js";
import { promote } from "../services/progression.js";
import type { ItemStatus, KnowledgeItem } from "../types.js";

const STATUSES: ItemStatus[] = ["active", "suspended", "archived"];

/**
 * Advance an item to the next stage (manual "approve this transition", and the
 * auto-step demo mode uses). Lazily generates the cloze / Socratic question for
 * the stage being entered. Throws AIError if generation fails so the caller can
 * surface a 502 and leave the item where it was.
 */
export async function promoteItem(
  itemId: string,
  now: Date,
  demo: boolean
): Promise<KnowledgeItem> {
  const item = (await db.get(
    "SELECT * FROM knowledge_items WHERE id = ?",
    itemId
  )) as KnowledgeItem | undefined;
  if (!item) throw new Error("Item not found");

  const result = promote(
    { stage: item.stage, ef: item.ef, interval_days: item.interval_days, repetitions: item.repetitions },
    now,
    { demo }
  );

  let cloze_text = item.cloze_text;
  let cloze_answer = item.cloze_answer;
  let question = item.question;
  if (result.stage !== item.stage) {
    if (result.stage === "cloze" && !cloze_text) {
      const c = await ai.cloze(item.content);
      cloze_text = c.cloze_text;
      cloze_answer = c.answer;
    }
    if (result.stage === "socratic" && !question) {
      question = await ai.socraticQuestion(item.content);
    }
  }

  await db.run(
    `UPDATE knowledge_items
       SET stage = ?, ef = ?, interval_days = ?, repetitions = ?,
           due_date = ?, last_reviewed = ?, cloze_text = ?, cloze_answer = ?, question = ?
     WHERE id = ?`,
    result.stage,
    result.ef,
    result.interval_days,
    result.repetitions,
    result.due_date,
    now.toISOString(),
    cloze_text,
    cloze_answer,
    question,
    item.id
  );

  return (await db.get("SELECT * FROM knowledge_items WHERE id = ?", item.id)) as KnowledgeItem;
}

export async function itemRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>("/api/items/:id/promote", async (req, reply) => {
    try {
      const item = await promoteItem(req.params.id, new Date(), false);
      return { item };
    } catch (err) {
      if (err instanceof AIError) return reply.code(502).send({ error: err.message });
      if ((err as Error).message === "Item not found") {
        return reply.code(404).send({ error: "Item not found" });
      }
      throw err;
    }
  });

  app.patch<{ Params: { id: string }; Body: { status: ItemStatus } }>(
    "/api/items/:id/status",
    async (req, reply) => {
      if (!STATUSES.includes(req.body.status)) {
        return reply.code(400).send({ error: "Invalid status" });
      }
      const exists = await db.get("SELECT id FROM knowledge_items WHERE id = ?", req.params.id);
      if (!exists) return reply.code(404).send({ error: "Item not found" });
      await db.run(
        "UPDATE knowledge_items SET status = ? WHERE id = ?",
        req.body.status,
        req.params.id
      );
      return { ok: true };
    }
  );
}
