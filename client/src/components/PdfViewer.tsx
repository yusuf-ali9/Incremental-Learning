import { useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

// Worker setup for Vite.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  fileUrl: string;
  // Highlight rects for the currently visible page (re-rendered from saved extracts).
  highlights?: SelectionRect[];
  onSelect: (text: string, page: number, rects: SelectionRect[]) => void;
  onPageChange?: (page: number) => void;
}

const SCALE = 1.2; // fixed so stored highlight rects stay valid across sessions

export default function PdfViewer({
  fileUrl,
  highlights = [],
  onSelect,
  onPageChange,
}: Props) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const pageRef = useRef<HTMLDivElement>(null);

  function goto(p: number) {
    const clamped = Math.min(Math.max(1, p), numPages || 1);
    setPage(clamped);
    onPageChange?.(clamped);
  }

  function handleMouseUp() {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!sel || !text || !pageRef.current) return;

    const base = pageRef.current.getBoundingClientRect();
    const rects: SelectionRect[] = [];
    for (let i = 0; i < sel.rangeCount; i++) {
      const range = sel.getRangeAt(i);
      for (const r of Array.from(range.getClientRects())) {
        rects.push({
          x: r.left - base.left,
          y: r.top - base.top,
          w: r.width,
          h: r.height,
        });
      }
    }
    onSelect(text, page, rects);
  }

  return (
    <div className="pdf">
      <div className="pdf-toolbar">
        <button onClick={() => goto(page - 1)} disabled={page <= 1}>‹ Prev</button>
        <span>
          Page{" "}
          <input
            type="number"
            value={page}
            min={1}
            max={numPages || 1}
            onChange={(e) => goto(Number(e.target.value))}
          />{" "}
          / {numPages || "…"}
        </span>
        <button onClick={() => goto(page + 1)} disabled={page >= numPages}>Next ›</button>
      </div>

      <div className="pdf-canvas-wrap" onMouseUp={handleMouseUp}>
        <Document
          file={fileUrl}
          onLoadSuccess={(d) => setNumPages(d.numPages)}
          loading={<div className="muted">Loading PDF…</div>}
          error={<div className="error">Failed to load PDF.</div>}
        >
          <div ref={pageRef} className="pdf-page-rel">
            <Page pageNumber={page} scale={SCALE} renderTextLayer renderAnnotationLayer />
            {highlights.map((h, i) => (
              <div
                key={i}
                className="pdf-highlight"
                style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
              />
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
}
