import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SessionItem, type Session, type SourceGroup, type Stage } from "../api.js";
import ReviewCard from "../components/ReviewCard.js";
import DemoToggle from "../components/DemoToggle.js";

const UNGROUPED = "__ungrouped__";

export default function Review() {
  const [demo, setDemo] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [items, setItems] = useState<SessionItem[]>([]);
  const [pointer, setPointer] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (d: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setSession(await api.session(d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // (Re)load and reset navigation whenever the demo flag changes.
  useEffect(() => {
    setTopicId(null);
    setSourceId(null);
    reload(demo);
  }, [demo, reload]);

  // Build the topic list, folding "ungrouped" sources into a synthetic topic.
  const topicList = session
    ? [
        ...session.topics,
        ...(session.ungrouped.length
          ? [{ id: UNGROUPED, name: "Ungrouped", sources: session.ungrouped }]
          : []),
      ]
    : [];
  const topic = topicList.find((t) => t.id === topicId) ?? null;

  function selectSource(src: SourceGroup) {
    setSourceId(src.id);
    setItems([...src.items]);
    setPointer(0);
  }

  function finishSource() {
    setSourceId(null);
    reload(demo); // refresh counts after working through a source
  }

  function advance() {
    setPointer((p) => {
      if (p + 1 < items.length) return p + 1;
      finishSource();
      return p;
    });
  }

  function onGraded(updated: SessionItem, gradedStage: Stage) {
    setReviewed((n) => n + 1);
    if (demo && updated.stage !== gradedStage) {
      // Demo walk-through: re-surface the SAME item at its new stage.
      setItems((prev) =>
        prev.map((it, i) => (i === pointer ? { ...updated, extract_text: it.extract_text } : it))
      );
    } else {
      advance();
    }
  }

  const sumDue = (sources: SourceGroup[]) => sources.reduce((n, s) => n + s.items.length, 0);
  const totalDue = topicList.reduce((n, t) => n + sumDue(t.sources), 0);
  const current = sourceId ? items[pointer] : null;
  const source = topic?.sources.find((s) => s.id === sourceId) ?? null;

  return (
    <div className="review">
      <div className="review-head">
        <h1>Review</h1>
        <div className="review-controls">
          <span className="muted">{reviewed} reviewed</span>
          <DemoToggle demo={demo} onChange={setDemo} />
        </div>
      </div>

      {/* Breadcrumb */}
      {(topicId || sourceId) && (
        <div className="breadcrumb">
          <button className="link" onClick={() => { setTopicId(null); setSourceId(null); reload(demo); }}>
            Topics
          </button>
          {topic && (
            <>
              {" / "}
              <button className="link" onClick={finishSource} disabled={!sourceId}>
                {topic.name}
              </button>
            </>
          )}
          {source && <>{" / "}<span>{source.title}</span></>}
        </div>
      )}

      {loading && <p className="muted">Loading…</p>}
      {error && <div className="error">{error}</div>}

      {/* Empty */}
      {!loading && totalDue === 0 && (
        <div className="empty-review">
          <p className="big">🎉 Nothing due right now.</p>
          <p className="muted">
            {demo ? "No understood, atomized, active items exist yet." : "Turn on Demo mode to practice now, or check the Calendar."}
          </p>
          <Link to="/" className="primary">Back to Library</Link>
        </div>
      )}

      {/* Level 1: topics */}
      {!loading && totalDue > 0 && !topicId && (
        <ul className="nav-list">
          {topicList.map((t) => {
            const due = sumDue(t.sources);
            if (due === 0) return null;
            return (
              <li key={t.id}>
                <button className="nav-row" onClick={() => setTopicId(t.id)}>
                  <span>{t.name}</span>
                  <span className="badge">{due} due</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Level 2: sources within a topic */}
      {!loading && topicId && !sourceId && topic && (
        <ul className="nav-list">
          {topic.sources.map((s) =>
            s.items.length === 0 ? null : (
              <li key={s.id}>
                <button className="nav-row" onClick={() => selectSource(s)}>
                  <span>{s.title}</span>
                  <span className="badge">{s.items.length} due</span>
                </button>
              </li>
            )
          )}
        </ul>
      )}

      {/* Level 3: item review */}
      {!loading && current && (
        <>
          <div className="queue-meta muted">{items.length - pointer} left in this article{demo && " · demo"}</div>
          <ReviewCard key={`${current.id}:${current.stage}`} item={current} demo={demo} onGraded={onGraded} onNext={advance} />
        </>
      )}
    </div>
  );
}
