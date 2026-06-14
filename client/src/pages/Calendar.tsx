import { useEffect, useState } from "react";
import { api, type CalendarMonth, type CalendarDayItem } from "../api.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export default function Calendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1); // 1-12
  const [data, setData] = useState<CalendarMonth | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [dayItems, setDayItems] = useState<CalendarDayItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(null);
    setDayItems([]);
    api.calendarMonth(year, month).then(setData).catch((e) => setError(e.message));
  }, [year, month]);

  function shift(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  }

  async function pickDay(dateStr: string) {
    setSelected(dateStr);
    try {
      const r = await api.calendarDay(dateStr);
      setDayItems(r.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="calendar-page">
      <div className="cal-head">
        <h1>Calendar</h1>
        <div className="cal-nav">
          <button onClick={() => shift(-1)}>‹</button>
          <span>{MONTHS[month - 1]} {year}</span>
          <button onClick={() => shift(1)}>›</button>
        </div>
        {data && data.overdue > 0 && (
          <span className="badge overdue">{data.overdue} overdue</span>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="cal-grid">
        {WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={`b${i}`} className="cal-cell empty" />;
          const dateStr = `${year}-${pad(month)}-${pad(d)}`;
          const count = data?.days[dateStr] ?? 0;
          const isToday = data?.today === dateStr;
          return (
            <button
              key={dateStr}
              className={`cal-cell ${isToday ? "today" : ""} ${selected === dateStr ? "selected" : ""} ${count ? "has-due" : ""}`}
              onClick={() => pickDay(dateStr)}
            >
              <span className="cal-day">{d}</span>
              {count > 0 && <span className="badge">{count}</span>}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="cal-day-list">
          <h2>
            Due on {selected}
            {data?.today === selected && data.overdue > 0 && " (incl. overdue)"}
          </h2>
          {dayItems.length === 0 ? (
            <p className="muted">Nothing scheduled.</p>
          ) : (
            <ul className="day-items">
              {dayItems.map((it) => (
                <li key={it.id} className="card">
                  <span className={`stage stage-${it.stage}`}>{it.stage}</span>{" "}
                  {it.content}
                  <div className="muted small">{it.source_title}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
