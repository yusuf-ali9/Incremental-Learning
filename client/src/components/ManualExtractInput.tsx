import { useState } from "react";
import { api } from "../api.js";

interface Props {
  sourceId: string;
  onAdded: () => void;
}

export default function ManualExtractInput({ sourceId, onAdded }: Props) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await api.createExtract({ source_id: sourceId, text: trimmed });
      setText("");
      onAdded();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-extract">
      <textarea
        className="manual-extract-input"
        placeholder="Write your own extract — type a note, idea, or paraphrase, then add it as an extract."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button
          className="primary"
          disabled={busy || !text.trim()}
          onClick={add}
        >
          {busy ? "Adding…" : "Add extract"}
        </button>
      </div>
    </div>
  );
}
