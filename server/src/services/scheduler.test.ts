import { describe, it, expect } from "vitest";
import { sm2 } from "./scheduler.js";
import type { SRState } from "../types.js";

const fresh: SRState = { ef: 2.5, interval_days: 0, repetitions: 0 };

describe("sm2 scheduler", () => {
  it("first 'good' review schedules 1 day", () => {
    const r = sm2(fresh, "good");
    expect(r.interval_days).toBe(1);
    expect(r.repetitions).toBe(1);
    expect(r.ef).toBeCloseTo(2.5, 5); // q=4 leaves EF unchanged
  });

  it("second 'good' review schedules 6 days", () => {
    const r1 = sm2(fresh, "good");
    const r2 = sm2(r1, "good");
    expect(r2.interval_days).toBe(6);
    expect(r2.repetitions).toBe(2);
  });

  it("third 'good' review multiplies by EF", () => {
    let s = sm2(fresh, "good"); // 1d, rep1
    s = sm2(s, "good"); // 6d, rep2
    s = sm2(s, "good"); // round(6 * 2.5) = 15
    expect(s.interval_days).toBe(15);
    expect(s.repetitions).toBe(3);
  });

  it("'easy' raises EF, 'hard' lowers it", () => {
    expect(sm2(fresh, "easy").ef).toBeGreaterThan(2.5);
    expect(sm2(fresh, "hard").ef).toBeLessThan(2.5);
  });

  it("EF never drops below 1.3", () => {
    let s = fresh;
    for (let i = 0; i < 20; i++) s = sm2(s, "hard");
    expect(s.ef).toBeGreaterThanOrEqual(1.3);
  });

  it("'again' lapses: resets repetitions and interval to 0", () => {
    let s = sm2(fresh, "good"); // rep1
    s = sm2(s, "good"); // rep2
    const lapsed = sm2(s, "again");
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.interval_days).toBe(0);
    expect(lapsed.ef).toBeLessThan(s.ef); // EF still decremented on lapse
  });
});
