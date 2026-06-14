import type { Grade, SRState } from "../types.js";

// SM-2 (SuperMemo-2). Public, well-documented, behind this small interface so a
// future FSRS implementation can replace it without touching the engine.
export interface Scheduler {
  next(state: SRState, grade: Grade): SRState;
}

// README grades -> SM-2 quality. Again is the only "fail" (q < 3).
export const GRADE_QUALITY: Record<Grade, number> = {
  again: 2,
  hard: 3,
  good: 4,
  easy: 5,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Core SM-2 step. Pure function — the correctness backbone, unit-tested.
export function sm2(state: SRState, grade: Grade): SRState {
  const q = GRADE_QUALITY[grade];

  // EF is updated on every review and floored at 1.3.
  let ef = state.ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;

  let repetitions = state.repetitions;
  let interval_days: number;

  if (q < 3) {
    // Lapse: restart the repetition count, re-show very soon.
    repetitions = 0;
    interval_days = 0;
  } else {
    if (repetitions === 0) interval_days = 1;
    else if (repetitions === 1) interval_days = 6;
    else interval_days = Math.round(state.interval_days * ef);
    repetitions += 1;
  }

  return { ef: round2(ef), interval_days, repetitions };
}

// The swappable scheduler instance. Replace with an FSRS implementation later.
export const scheduler: Scheduler = { next: sm2 };

// Compute an ISO due date `days` from `from`. Fractional days supported so a
// lapse (0 days) becomes "due now".
export function addDays(from: Date, days: number): string {
  const d = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}
