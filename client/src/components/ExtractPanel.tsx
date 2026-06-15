import { useState } from "react";
import { api, type Extract } from "../api.js";
import type { SelectionRect } from "./PdfViewer.js";

interface PendingSelection {
  text: string;
  page: number;
  rects: SelectionRect[];
}

interface Props {
  sourceId: string;
  pending: PendingSelection | null;
  extracts: Extract[];
  onClearPending: () => void;
  onRefresh: () => void;
}

const STAGE_LABEL: Record<string, string> = {
  encounter: "Encounter",
  cloze: "Cloze",
  socratic: "Socratic",
};

export default function ExtractPanel({
  sourceId,
  pending,
  extracts,
  onClearPending,
  onRefresh,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveExtract() {
    if (!pending) return;
    await run("save", async () => {
      await api.createExtract({
        source_id: sourceId,
        text: pending.text,
        page: pending.page,
        anchor: { page: pending.page, rects: pending.rects },
      });
      onClearPending();
    });
  }

  const inactiveCount = extracts.reduce(
    (n, ex) => n + ex.items.filter((it) => it.status !== "active").length,
    0
  );

  return (
    <aside className="panel">
      <h2>Extracts</h2>

      {inactiveCount > 0 && (
        <button
          className="reactivate-all"
          disabled={busy === "reactivate"}
          onClick={() =>
            run("reactivate", () => api.reactivateSource(sourceId))
          }
          title="Bring suspended / dropped facts back into review"
        >
          ↺ Reactivate all ({inactiveCount} inactive)
        </button>
      )}

      {pending && (
        <div className="pending card">
          <div className="pending-label">Selected on page {pending.page}</div>
          <blockquote>{pending.text}</blockquote>
          <div className="row">
            <button className="primary" disabled={busy === "save"} onClick={saveExtract}>
              {busy === "save" ? "Saving…" : "Save extract"}
            </button>
            <button onClick={onClearPending}>Clear</button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {extracts.length === 0 && !pending && (
        <p className="muted">
          Select text in the PDF, then save it as an extract. Mark it understood
          and atomize it to start learning.
        </p>
      )}

      <ul className="extract-list">
        {extracts.map((ex) => (
          <li key={ex.id} className="card">
            <blockquote>{ex.text}</blockquote>
            <label className="check">
              <input
                type="checkbox"
                checked={ex.understood === 1}
                onChange={(e) =>
                  run("u" + ex.id, () => api.setUnderstood(ex.id, e.target.checked))
                }
              />
              Understood
            </label>
            {ex.items.length > 0 && ex.understood !== 1 && (
              <p className="muted small gate-hint">
                Tick “Understood” — atoms stay out of review until then (even in demo).
              </p>
            )}

            <div className="row">
              <button
                disabled={busy === "a" + ex.id}
                onClick={() => run("a" + ex.id, () => api.atomize(ex.id))}
                title="Use AI to break this into atomic facts"
              >
                {busy === "a" + ex.id ? "Atomizing…" : ex.items.length ? "Re-atomize" : "Atomize"}
              </button>
              <button
                className="danger"
                onClick={() => run("d" + ex.id, () => api.deleteExtract(ex.id))}
              >
                Delete
              </button>
            </div>

            {ex.items.length > 0 && (
              <ol className="atoms">
                {ex.items.map((it) => (
                  <li key={it.id} className={it.status !== "active" ? "atom-inactive" : ""}>
                    <span className={`stage stage-${it.stage}`}>{STAGE_LABEL[it.stage]}</span>
                    {it.status === "suspended" && <span className="stage stage-known">known</span>}
                    {it.status === "archived" && <span className="stage stage-archived">not in review</span>}{" "}
                    {it.content}
                    <div className="atom-actions">
                      <label className="check tiny-check" title="Tick to keep this fact in your review rotation; untick to remove it">
                        <input
                          type="checkbox"
                          checked={it.status === "active"}
                          onChange={(e) =>
                            run("s" + it.id, () =>
                              api.setItemStatus(it.id, e.target.checked ? "active" : "archived")
                            )
                          }
                        />
                        In review
                      </label>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
