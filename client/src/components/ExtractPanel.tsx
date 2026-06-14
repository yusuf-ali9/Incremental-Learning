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

  return (
    <aside className="panel">
      <h2>Extracts</h2>

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
                    {it.status === "archived" && <span className="stage stage-archived">dropped</span>}{" "}
                    {it.content}
                    <div className="atom-actions">
                      {it.status === "active" ? (
                        <>
                          <button className="tiny" onClick={() => run("k" + it.id, () => api.setItemStatus(it.id, "suspended"))}>
                            Keep as known
                          </button>
                          <button className="tiny danger" onClick={() => run("x" + it.id, () => api.setItemStatus(it.id, "archived"))}>
                            Drop
                          </button>
                        </>
                      ) : (
                        <button className="tiny" onClick={() => run("r" + it.id, () => api.setItemStatus(it.id, "active"))}>
                          Restore
                        </button>
                      )}
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
