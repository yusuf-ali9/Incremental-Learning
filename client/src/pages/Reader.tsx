import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Extract } from "../api.js";
import PdfViewer, { type SelectionRect } from "../components/PdfViewer.js";
import ExtractPanel from "../components/ExtractPanel.js";

interface Pending {
  text: string;
  page: number;
  rects: SelectionRect[];
}

export default function Reader() {
  const { id } = useParams<{ id: string }>();
  const [title, setTitle] = useState("");
  const [extracts, setExtracts] = useState<Extract[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  function refresh() {
    if (!id) return;
    api.listExtracts(id).then(setExtracts).catch(() => {});
  }

  useEffect(() => {
    if (!id) return;
    api.getSource(id).then((s) => setTitle(s.title)).catch(() => {});
    refresh();
  }, [id]);

  // Re-render saved highlights for the visible page from each extract's anchor.
  const highlights = useMemo<SelectionRect[]>(() => {
    const out: SelectionRect[] = [];
    for (const ex of extracts) {
      if (ex.page !== currentPage) continue;
      const anchor = (ex as any).anchor;
      if (!anchor) continue;
      try {
        const parsed = typeof anchor === "string" ? JSON.parse(anchor) : anchor;
        if (Array.isArray(parsed?.rects)) out.push(...parsed.rects);
      } catch {
        /* ignore malformed anchor */
      }
    }
    return out;
  }, [extracts, currentPage]);

  if (!id) return null;

  return (
    <div className="reader">
      <div className="reader-main">
        <div className="reader-head">
          <Link to="/" className="back">← Library</Link>
          <h1>{title}</h1>
        </div>
        <PdfViewer
          fileUrl={api.fileUrl(id)}
          highlights={highlights}
          onPageChange={setCurrentPage}
          onSelect={(text, page, rects) => setPending({ text, page, rects })}
        />
      </div>
      <ExtractPanel
        sourceId={id}
        pending={pending}
        extracts={extracts}
        onClearPending={() => setPending(null)}
        onRefresh={refresh}
      />
    </div>
  );
}
