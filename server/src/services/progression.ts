import type { Grade, SRState, Stage } from "../types.js";
import { STAGE_ORDER } from "../types.js";
import { addDays, sm2 } from "./scheduler.js";

export interface StageState extends SRState {
  stage: Stage;
}

export interface ProgressionResult {
  stage: Stage;
  ef: number;
  interval_days: number;
  repetitions: number;
  due_date: string;
}

export function nextStage(stage: Stage): Stage {
  const i = STAGE_ORDER.indexOf(stage);
  return i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : stage;
}

export function isTerminal(stage: Stage): boolean {
  return STAGE_ORDER.indexOf(stage) === STAGE_ORDER.length - 1;
}

/**
 * Normal-mode grading. Reschedules the item with SM-2 **at the same stage** — it
 * does NOT advance. Advancement is now an explicit user action (`promote`).
 */
export function reviewSameStage(
  state: StageState,
  grade: Grade,
  now: Date = new Date()
): ProgressionResult {
  const sr = sm2(state, grade);
  return {
    stage: state.stage,
    ef: sr.ef,
    interval_days: sr.interval_days,
    repetitions: sr.repetitions,
    due_date: addDays(now, sr.interval_days),
  };
}

/**
 * Advance an item to the next stage (the "approve this transition" action, and
 * the auto-step used by demo mode). EF carries across stages; the interval
 * resets modestly. The terminal stage (socratic) cannot advance further.
 *
 * `demo` only affects timing: a promoted item is due immediately so you can keep
 * walking it forward; otherwise it's due in one day.
 */
export function promote(
  state: StageState,
  now: Date = new Date(),
  opts: { demo?: boolean } = {}
): ProgressionResult {
  const due_date = opts.demo ? now.toISOString() : addDays(now, 1);

  if (isTerminal(state.stage)) {
    // Nothing to advance into — keep the item where it is.
    return {
      stage: state.stage,
      ef: state.ef,
      interval_days: state.interval_days,
      repetitions: state.repetitions,
      due_date,
    };
  }

  return {
    stage: nextStage(state.stage),
    ef: state.ef, // keep the learned ease
    interval_days: 1, // reset interval modestly for the new stage
    repetitions: 1,
    due_date,
  };
}
