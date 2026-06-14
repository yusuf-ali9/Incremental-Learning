import { describe, it, expect } from "vitest";
import { promote, reviewSameStage, type StageState } from "./progression.js";

const at = (stage: StageState["stage"]): StageState => ({
  stage,
  ef: 2.5,
  interval_days: 0,
  repetitions: 0,
});

const NOW = new Date("2026-06-14T12:00:00.000Z");

describe("reviewSameStage (normal grading)", () => {
  it("never advances the stage", () => {
    expect(reviewSameStage(at("encounter"), "good", NOW).stage).toBe("encounter");
    expect(reviewSameStage(at("cloze"), "easy", NOW).stage).toBe("cloze");
  });

  it("reschedules into the future with SM-2 on a pass", () => {
    const r = reviewSameStage(at("encounter"), "good", NOW);
    expect(new Date(r.due_date).getTime()).toBeGreaterThan(NOW.getTime());
    expect(r.interval_days).toBe(1); // first 'good'
  });

  it("a lapse ('again') keeps the stage and makes it due ~now", () => {
    const r = reviewSameStage(at("cloze"), "again", NOW);
    expect(r.stage).toBe("cloze");
    expect(r.interval_days).toBe(0);
    expect(new Date(r.due_date).getTime()).toBe(NOW.getTime());
  });
});

describe("promote (explicit / demo advancement)", () => {
  it("advances encounter -> cloze and resets the interval modestly", () => {
    const r = promote(at("encounter"), NOW);
    expect(r.stage).toBe("cloze");
    expect(r.interval_days).toBe(1);
    expect(r.ef).toBe(2.5); // ease carries across stages
  });

  it("advances cloze -> socratic", () => {
    expect(promote(at("cloze"), NOW).stage).toBe("socratic");
  });

  it("socratic is terminal — promote keeps it at socratic", () => {
    expect(promote(at("socratic"), NOW).stage).toBe("socratic");
  });

  it("normal promote is due in the future; demo promote is due now", () => {
    expect(new Date(promote(at("encounter"), NOW).due_date).getTime()).toBeGreaterThan(
      NOW.getTime()
    );
    expect(promote(at("encounter"), NOW, { demo: true }).due_date).toBe(NOW.toISOString());
  });
});
