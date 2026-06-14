// Thin fetch wrapper around the local backend API.

export type Stage = "encounter" | "cloze" | "socratic";
export type Grade = "again" | "hard" | "good" | "easy";
export type ItemStatus = "active" | "suspended" | "archived";

export interface Topic {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface SourceSummary {
  id: string;
  type: "pdf" | "web";
  title: string;
  topic_id: string | null;
  created_at: string;
  extract_count: number;
  due_count: number;
}

export interface KnowledgeItem {
  id: string;
  extract_id: string;
  content: string;
  stage: Stage;
  status: ItemStatus;
  cloze_text: string | null;
  cloze_answer: string | null;
  question: string | null;
  ef: number;
  interval_days: number;
  repetitions: number;
  due_date: string;
  last_reviewed: string | null;
}

export interface Extract {
  id: string;
  source_id: string;
  text: string;
  page: number | null;
  understood: number;
  items: KnowledgeItem[];
}

export interface SessionItem extends KnowledgeItem {
  extract_text: string;
}
export interface SourceGroup {
  id: string;
  title: string;
  items: SessionItem[];
}
export interface TopicGroup {
  id: string;
  name: string;
  sources: SourceGroup[];
}
export interface Session {
  demo: boolean;
  topics: TopicGroup[];
  ungrouped: SourceGroup[];
}

export interface SocraticGrade {
  score: number;
  feedback: string;
  followUp: string;
}

export interface CalendarMonth {
  year: number;
  month: number;
  today: string;
  days: Record<string, number>;
  overdue: number;
}
export interface CalendarDayItem {
  id: string;
  content: string;
  stage: Stage;
  due_date: string;
  source_title: string;
}

async function req<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  health: () =>
    req<{ ok: boolean; ai_enabled: boolean; model: string }>("/api/health"),

  // Sources
  listSources: () => req<SourceSummary[]>("/api/sources"),
  getSource: (id: string) => req<{ id: string; title: string }>(`/api/sources/${id}`),
  uploadSource: (file: File, topicId?: string | null) => {
    const fd = new FormData();
    if (topicId) fd.append("topic_id", topicId);
    fd.append("file", file);
    return req<{ id: string }>("/api/sources", { method: "POST", body: fd });
  },
  moveSource: (id: string, topic_id: string | null) =>
    req<{ ok: boolean }>(`/api/sources/${id}`, json({ topic_id }, "PATCH")),
  deleteSource: (id: string) =>
    req<{ ok: boolean }>(`/api/sources/${id}`, { method: "DELETE" }),
  fileUrl: (id: string) => `/api/sources/${id}/file`,

  // Topics
  listTopics: () => req<Topic[]>("/api/topics"),
  createTopic: (name: string) => req<Topic>("/api/topics", json({ name })),
  deleteTopic: (id: string) =>
    req<{ ok: boolean }>(`/api/topics/${id}`, { method: "DELETE" }),

  // Extracts
  listExtracts: (sourceId: string) =>
    req<Extract[]>(`/api/extracts?source_id=${sourceId}`),
  createExtract: (body: { source_id: string; text: string; page?: number; anchor?: unknown }) =>
    req<{ id: string }>("/api/extracts", json(body)),
  setUnderstood: (id: string, understood: boolean) =>
    req<{ ok: boolean }>(`/api/extracts/${id}`, json({ understood }, "PATCH")),
  deleteExtract: (id: string) =>
    req<{ ok: boolean }>(`/api/extracts/${id}`, { method: "DELETE" }),
  atomize: (id: string) =>
    req<{ items: KnowledgeItem[] }>(`/api/extracts/${id}/atomize`, json({})),

  // Items (curation / progression control)
  promote: (id: string) => req<{ item: KnowledgeItem }>(`/api/items/${id}/promote`, json({})),
  setItemStatus: (id: string, status: ItemStatus) =>
    req<{ ok: boolean }>(`/api/items/${id}/status`, json({ status }, "PATCH")),

  // Review
  session: (demo: boolean) => req<Session>(`/api/review/session?demo=${demo ? 1 : 0}`),
  socraticAnswer: (id: string, user_answer: string, question?: string) =>
    req<SocraticGrade>(`/api/review/${id}/socratic-answer`, json({ user_answer, question })),
  grade: (id: string, body: { grade: Grade; user_answer?: string; ai_feedback?: string; demo: boolean }) =>
    req<{ item: KnowledgeItem }>(`/api/review/${id}/grade`, json(body)),

  // Calendar
  calendarMonth: (year: number, month: number) =>
    req<CalendarMonth>(`/api/calendar?year=${year}&month=${month}`),
  calendarDay: (date: string) =>
    req<{ date: string; items: CalendarDayItem[] }>(`/api/calendar/day?date=${date}`),
};
