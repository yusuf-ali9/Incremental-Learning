import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { db } from "../db/index.js";
import { ai } from "../config.js";
import { AIError } from "../services/ai/provider.js";
import { reviewSameStage } from "../services/progression.js";
import { promoteItem } from "./items.js";
import type { Grade, KnowledgeItem } from "../types.js";

const GRADES: Grade[] = ["again", "hard", "good", "easy"];

interface SessionItem extends KnowledgeItem {
  extract_text: string;
}
interface SourceGroup {
  id: string;
  title: string;
  items: SessionItem[];
}

export async function reviewRoutes(app: FastifyInstance) {
  // Review session grouped Topic -> Source(article) -> items. Gated by
  // understood = 1 AND status = 'active'. Demo ignores due_date.
  app.get<{ Querystring: { demo?: string } }>("/api/review/session", async (req) => {
    const demo = req.query.demo === "1" || req.query.demo === "true";
    const now = new Date().toISOString();
    const sql = `
      SELECT k.*, e.text AS extract_text,
             s.id AS source_id, s.title AS source_title,
             s.topic_id AS topic_id, t.name AS topic_name
      FROM knowledge_items k
      JOIN extracts e ON e.id = k.extract_id
      JOIN sources s ON s.id = e.source_id
      LEFT JOIN topics t ON t.id = s.topic_id
      WHERE e.understood = 1 AND k.status = 'active' ${demo ? "" : "AND k.due_date <= ?"}
      ORDER BY t.name, s.title, k.due_date ASC`;
    const rows = (demo ? await db.all(sql) : await db.all(sql, now)) as any[];

    const topics = new Map<string, { id: string; name: string; _src: Map<string, SourceGroup> }>();
    const ungrouped = new Map<string, SourceGroup>();

    for (const r of rows) {
      const item = r as SessionItem;
      const srcId = r.source_id as string;
      const srcTitle = r.source_title as string;
      if (r.topic_id) {
        let topic = topics.get(r.topic_id);
        if (!topic) {
          topic = { id: r.topic_id, name: r.topic_name, _src: new Map() };
          topics.set(r.topic_id, topic);
        }
        let src = topic._src.get(srcId);
        if (!src) {
          src = { id: srcId, title: srcTitle, items: [] };
          topic._src.set(srcId, src);
        }
        src.items.push(item);
      } else {
        let src = ungrouped.get(srcId);
        if (!src) {
          src = { id: srcId, title: srcTitle, items: [] };
          ungrouped.set(srcId, src);
        }
        src.items.push(item);
      }
    }

    return {
      demo,
      topics: [...topics.values()].map((t) => ({
        id: t.id,
        name: t.name,
        sources: [...t._src.values()],
      })),
      ungrouped: [...ungrouped.values()],
    };
  });

  // Socratic dialogue turn: AI grades a free answer against the current question
  // or follow-up. Does NOT change SR state.
  app.post<{ Params: { id: string }; Body: { user_answer: string; question?: string } }>(
    "/api/review/:id/socratic-answer",
    async (req, reply) => {
      const item = (await db.get(
        "SELECT * FROM knowledge_items WHERE id = ?",
        req.params.id
      )) as KnowledgeItem | undefined;
      if (!item) return reply.code(404).send({ error: "Item not found" });
      const question = req.body.question?.trim() || item.question;
      if (item.stage !== "socratic" || !question) {
        return reply.code(400).send({ error: "Item is not at the socratic stage" });
      }
      try {
        return await ai.gradeSocratic(question, req.body.user_answer ?? "");
      } catch (err) {
        if (err instanceof AIError) return reply.code(502).send({ error: err.message });
        throw err;
      }
    }
  );

  // Finalize a review. Normal mode reschedules SM-2 at the SAME stage (no
  // advance). Demo mode promotes the item (walks it forward), due now.
  app.post<{
    Params: { id: string };
    Body: { grade: Grade; user_answer?: string; ai_feedback?: string; demo?: boolean };
  }>("/api/review/:id/grade", async (req, reply) => {
    const { grade, user_answer, ai_feedback, demo } = req.body;
    if (!GRADES.includes(grade)) return reply.code(400).send({ error: "Invalid grade" });

    const item = (await db.get(
      "SELECT * FROM knowledge_items WHERE id = ?",
      req.params.id
    )) as KnowledgeItem | undefined;
    if (!item) return reply.code(404).send({ error: "Item not found" });

    const now = new Date();
    const reviewedStage = item.stage;
    let updated: KnowledgeItem;

    try {
      if (demo) {
        updated = await promoteItem(item.id, now, true);
      } else {
        const r = reviewSameStage(
          { stage: item.stage, ef: item.ef, interval_days: item.interval_days, repetitions: item.repetitions },
          grade,
          now
        );
        await db.run(
          `UPDATE knowledge_items
             SET ef = ?, interval_days = ?, repetitions = ?, due_date = ?, last_reviewed = ?
           WHERE id = ?`,
          r.ef,
          r.interval_days,
          r.repetitions,
          r.due_date,
          now.toISOString(),
          item.id
        );
        updated = (await db.get(
          "SELECT * FROM knowledge_items WHERE id = ?",
          item.id
        )) as KnowledgeItem;
      }
    } catch (err) {
      if (err instanceof AIError) return reply.code(502).send({ error: err.message });
      throw err;
    }

    await db.run(
      `INSERT INTO reviews (id, item_id, stage, grade, user_answer, ai_feedback, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      nanoid(),
      item.id,
      reviewedStage,
      grade,
      user_answer ?? null,
      ai_feedback ?? null,
      now.toISOString()
    );

    return { item: updated };
  });

  // ---- Calendar ----

  // Per-day due counts for a month + total overdue. Grouped by UTC date.
  app.get<{ Querystring: { year?: string; month?: string } }>("/api/calendar", async (req) => {
    const now = new Date();
    const year = Number(req.query.year) || now.getUTCFullYear();
    const month = Number(req.query.month) || now.getUTCMonth() + 1; // 1-12
    const mm = String(month).padStart(2, "0");
    const start = `${year}-${mm}-01`;
    const end =
      month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const today = now.toISOString().slice(0, 10);

    const rows = (await db.all(
      `SELECT substr(k.due_date, 1, 10) AS day, COUNT(*) AS c
       FROM knowledge_items k
       JOIN extracts e ON e.id = k.extract_id
       WHERE e.understood = 1 AND k.status = 'active'
         AND substr(k.due_date, 1, 10) >= ? AND substr(k.due_date, 1, 10) < ?
       GROUP BY day`,
      start,
      end
    )) as Array<{ day: string; c: number }>;

    const overdueRow = (await db.get(
      `SELECT COUNT(*) AS c FROM knowledge_items k
       JOIN extracts e ON e.id = k.extract_id
       WHERE e.understood = 1 AND k.status = 'active'
         AND substr(k.due_date, 1, 10) < ?`,
      today
    )) as { c: number };

    const days: Record<string, number> = {};
    for (const r of rows) days[r.day] = Number(r.c);
    return { year, month, today, days, overdue: Number(overdueRow.c) };
  });

  // Items due on a specific day. If it's today, also include overdue items.
  app.get<{ Querystring: { date?: string } }>("/api/calendar/day", async (req, reply) => {
    const date = req.query.date;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({ error: "date=YYYY-MM-DD required" });
    }
    const today = new Date().toISOString().slice(0, 10);
    const op = date === today ? "<=" : "=";
    const rows = await db.all(
      `SELECT k.id, k.content, k.stage, k.due_date, s.title AS source_title
       FROM knowledge_items k
       JOIN extracts e ON e.id = k.extract_id
       JOIN sources s ON s.id = e.source_id
       WHERE e.understood = 1 AND k.status = 'active'
         AND substr(k.due_date, 1, 10) ${op} ?
       ORDER BY k.due_date ASC`,
      date
    );
    return { date, items: rows };
  });
}
