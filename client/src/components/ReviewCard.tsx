import { useState } from "react";
import {
  api,
  type Grade,
  type ItemStatus,
  type SessionItem,
  type Stage,
} from "../api.js";
import GradeBar from "./GradeBar.js";

interface Props {
  item: SessionItem;
  demo: boolean;
  onGraded: (updated: SessionItem, gradedStage: Stage) => void;
  onNext: () => void; // skip / promote / status change — leaves the queue
}

interface Turn {
  answer: string;
  score: number;
  feedback: string;
  followUp: string;
}

const NEXT_STAGE: Record<Stage, Stage | null> = {
  encounter: "cloze",
  cloze: "socratic",
  socratic: null,
};

export default function ReviewCard({ item, demo, onGraded, onNext }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [clozeInput, setClozeInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = turns.length ? turns[turns.length - 1].followUp : item.question;

  async function submitSocratic() {
    if (!answer.trim()) return;
    setWorking(true);
    setError(null);
    try {
      const g = await api.socraticAnswer(item.id, answer, currentQuestion ?? undefined);
      setTurns((t) => [...t, { answer, score: g.score, feedback: g.feedback, followUp: g.followUp }]);
      setAnswer("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function grade(g: Grade) {
    setWorking(true);
    setError(null);
    try {
      const res = await api.grade(item.id, {
        grade: g,
        demo,
        user_answer:
          item.stage === "cloze" ? clozeInput : item.stage === "socratic" ? turns.map((t) => t.answer).join(" | ") : undefined,
        ai_feedback: turns.length ? turns[turns.length - 1].feedback : undefined,
      });
      onGraded(res.item as SessionItem, item.stage);
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  }

  async function changeStatus(status: ItemStatus) {
    setWorking(true);
    try {
      await api.setItemStatus(item.id, status);
      onNext();
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  }

  async function promote() {
    setWorking(true);
    setError(null);
    try {
      await api.promote(item.id);
      onNext();
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
    }
  }

  const clozeDisplay = item.cloze_text?.replace(/\{\{\.\.\.\}\}/g, "_____") ?? item.content;
  const next = NEXT_STAGE[item.stage];

  return (
    <div className="review-card card">
      <div className="review-source">
        <span className={`stage stage-${item.stage}`}>{item.stage}</span>
      </div>

      {/* ENCOUNTER */}
      {item.stage === "encounter" && (
        <>
          <p className="prompt">{item.content}</p>
          <p className="hint muted">Rate how well you recalled this.</p>
          <GradeBar disabled={working} onGrade={grade} />
        </>
      )}

      {/* CLOZE */}
      {item.stage === "cloze" && (
        <>
          <p className="prompt">{clozeDisplay}</p>
          <input
            className="answer-input"
            placeholder="Type the missing word…"
            value={clozeInput}
            onChange={(e) => setClozeInput(e.target.value)}
            disabled={revealed}
          />
          {!revealed ? (
            <button className="primary" onClick={() => setRevealed(true)}>Reveal answer</button>
          ) : (
            <>
              <p className="reveal">Answer: <strong>{item.cloze_answer}</strong></p>
              <GradeBar disabled={working} onGrade={grade} />
            </>
          )}
        </>
      )}

      {/* SOCRATIC — multi-turn dialogue until you grade */}
      {item.stage === "socratic" && (
        <>
          <p className="prompt">{item.question ?? item.content}</p>

          {turns.map((t, i) => (
            <div key={i} className="socratic-turn">
              <p className="your-answer"><strong>You:</strong> {t.answer}</p>
              <p className="ai-feedback"><strong>Tutor ({t.score}/5):</strong> {t.feedback}</p>
              {t.followUp && <p className="followup"><em>Follow-up: {t.followUp}</em></p>}
            </div>
          ))}

          <textarea
            className="answer-input"
            rows={3}
            placeholder={turns.length ? "Answer the follow-up…" : "Answer in your own words…"}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="row">
            <button className="primary" disabled={working || !answer.trim()} onClick={submitSocratic}>
              {working ? "…" : turns.length ? "Answer follow-up" : "Submit answer"}
            </button>
          </div>
          <p className="hint muted">Grade whenever you're ready to finish this item.</p>
          <GradeBar disabled={working} onGrade={grade} />
        </>
      )}

      {/* Skip + (normal mode) stage controls */}
      <div className="card-controls">
        <button className="ghost" disabled={working} onClick={onNext}>Skip →</button>
        {!demo && (
          <div className="stage-controls">
            {next && (
              <button disabled={working} onClick={promote} title={`Move this fact to the ${next} stage`}>
                Promote to {next}
              </button>
            )}
            <button disabled={working} onClick={() => changeStatus("suspended")} title="Keep as a known fact; stop scheduling">
              Keep as known
            </button>
            <button className="danger" disabled={working} onClick={() => changeStatus("archived")} title="Drop from review">
              Drop
            </button>
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
