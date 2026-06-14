// Shared domain types for SubMemo's engine and API.

export type SourceType = "pdf" | "web";

export interface Source {
  id: string;
  type: SourceType;
  title: string;
  file_path: string | null;
  topic_id: string | null;
  created_at: string;
}

export interface Topic {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface Extract {
  id: string;
  source_id: string;
  topic_id: string | null;
  text: string;
  page: number | null;
  anchor: string | null; // JSON: selection rects for re-highlighting
  understood: number; // 0 | 1 (SQLite has no boolean)
  created_at: string;
}

// The progression ladder. Chunking intentionally omitted for 1.0.
export type Stage = "encounter" | "cloze" | "socratic";
export const STAGE_ORDER: Stage[] = ["encounter", "cloze", "socratic"];

// Lifecycle of an atom outside the SR schedule.
//  active    — in the review rotation.
//  suspended — kept as a known/stored fact, no longer scheduled.
//  archived  — dropped during curation; hidden from review.
export type ItemStatus = "active" | "suspended" | "archived";

export interface KnowledgeItem {
  id: string;
  extract_id: string;
  content: string;
  stage: Stage;
  status: ItemStatus;
  cloze_text: string | null;
  cloze_answer: string | null;
  question: string | null;
  // SM-2 spaced-repetition state
  ef: number;
  interval_days: number;
  repetitions: number;
  due_date: string; // ISO date
  last_reviewed: string | null;
  created_at: string;
}

export type Grade = "again" | "hard" | "good" | "easy";

export interface ReviewLog {
  id: string;
  item_id: string;
  stage: Stage;
  grade: Grade;
  user_answer: string | null;
  ai_feedback: string | null;
  reviewed_at: string;
}

// Minimal SM-2 state the scheduler operates on.
export interface SRState {
  ef: number;
  interval_days: number;
  repetitions: number;
}
