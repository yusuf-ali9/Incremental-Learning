import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api.js";
import Library from "./pages/Library.js";
import Reader from "./pages/Reader.js";
import Review from "./pages/Review.js";
import Calendar from "./pages/Calendar.js";

export default function App() {
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [dueTotal, setDueTotal] = useState(0);
  const location = useLocation();

  useEffect(() => {
    api.health().then((h) => setAiEnabled(h.ai_enabled)).catch(() => setAiEnabled(false));
  }, []);

  // Refresh the due badge whenever we navigate.
  useEffect(() => {
    api
      .listSources()
      .then((s) => setDueTotal(s.reduce((n, x) => n + x.due_count, 0)))
      .catch(() => {});
  }, [location.pathname]);

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">SubMemo <span>1.0</span></Link>
        <nav>
          <Link to="/">Library</Link>
          <Link to="/review">
            Review{dueTotal > 0 && <span className="badge">{dueTotal}</span>}
          </Link>
          <Link to="/calendar">Calendar</Link>
        </nav>
        {aiEnabled === false && (
          <div className="ai-warn" title="Set GROQ_API_KEY in server/.env">
            AI off — set GROQ_API_KEY
          </div>
        )}
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/read/:id" element={<Reader />} />
          <Route path="/review" element={<Review />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
