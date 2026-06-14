import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type SourceSummary, type Topic } from "../api.js";

export default function Library() {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null); // topic id or "__ungrouped__"
  const navigate = useNavigate();

  function refresh() {
    Promise.all([api.listSources(), api.listTopics()])
      .then(([s, t]) => {
        setSources(s);
        setTopics(t);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(refresh, []);

  async function upload(file: File, topicId: string | null) {
    setUploading(true);
    setError(null);
    try {
      const { id } = await api.uploadSource(file, topicId);
      navigate(`/read/${id}`);
    } catch (err) {
      setError((err as Error).message);
      setUploading(false);
    }
  }

  async function newTopic() {
    const name = prompt("New topic name:")?.trim();
    if (!name) return;
    try {
      await api.createTopic(name);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function move(sourceId: string, topicId: string | null) {
    await api.moveSource(sourceId, topicId).catch((e) => setError(e.message));
    refresh();
  }

  const ungrouped = sources.filter((s) => !s.topic_id);

  function Card({ s }: { s: SourceSummary }) {
    return (
      <div
        className="source-card"
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/source-id", s.id)}
      >
        <Link to={`/read/${s.id}`} className="source-card-link">
          <div className="source-title">{s.title}</div>
          <div className="source-meta">
            <span>{s.extract_count} extracts</span>
            {s.due_count > 0 && <span className="badge">{s.due_count} to review</span>}
          </div>
        </Link>
        <div className="source-card-actions">
          <button
            className="danger small"
            onClick={async () => {
              if (!confirm("Delete this source and all its extracts?")) return;
              await api.deleteSource(s.id);
              refresh();
            }}
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  function dropProps(zoneId: string, topicId: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(zoneId);
      },
      onDragLeave: () => setDragOver((z) => (z === zoneId ? null : z)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(null);
        const id = e.dataTransfer.getData("text/source-id");
        if (id) move(id, topicId);
      },
    };
  }

  return (
    <div className="library">
      <div className="library-head">
        <h1>Library</h1>
        <div className="row">
          <button onClick={newTopic}>+ New topic</button>
          <label className="primary upload-btn">
            {uploading ? "Uploading…" : "+ Add PDF"}
            <input
              type="file"
              accept="application/pdf"
              hidden
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], null)}
            />
          </label>
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <p className="muted hint">Tip: drag a source card onto a topic to move it.</p>

      {topics.map((t) => {
        const ts = sources.filter((s) => s.topic_id === t.id);
        const due = ts.reduce((n, s) => n + s.due_count, 0);
        return (
          <section
            key={t.id}
            className={`topic-folder ${dragOver === t.id ? "drag-over" : ""}`}
            {...dropProps(t.id, t.id)}
          >
            <div className="topic-head">
              <h2>{t.name}{due > 0 && <span className="badge">{due} due</span>}</h2>
              <div className="row">
                <TopicUpload disabled={uploading} onFile={(f) => upload(f, t.id)} />
                <button
                  className="danger small"
                  onClick={async () => {
                    if (!confirm(`Delete topic "${t.name}"? Its sources become ungrouped.`)) return;
                    await api.deleteTopic(t.id);
                    refresh();
                  }}
                >
                  Delete topic
                </button>
              </div>
            </div>
            {ts.length === 0 ? (
              <p className="muted small">Drop sources here, or add a PDF.</p>
            ) : (
              <div className="source-grid">{ts.map((s) => <Card key={s.id} s={s} />)}</div>
            )}
          </section>
        );
      })}

      <section
        className={`topic-folder ungrouped ${dragOver === "__ungrouped__" ? "drag-over" : ""}`}
        {...dropProps("__ungrouped__", null)}
      >
        <div className="topic-head">
          <h2>Ungrouped</h2>
        </div>
        {ungrouped.length === 0 ? (
          <p className="muted small">No ungrouped sources.</p>
        ) : (
          <div className="source-grid">{ungrouped.map((s) => <Card key={s.id} s={s} />)}</div>
        )}
      </section>
    </div>
  );
}

function TopicUpload({ disabled, onFile }: { disabled: boolean; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <label className="small upload-btn-inline">
      + Add PDF
      <input
        ref={ref}
        type="file"
        accept="application/pdf"
        hidden
        disabled={disabled}
        onChange={(e) => {
          if (e.target.files?.[0]) onFile(e.target.files[0]);
          if (ref.current) ref.current.value = "";
        }}
      />
    </label>
  );
}
