import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  closePhase,
  DEFAULT_STEPS,
  gatePosition,
  parsePipeline,
} from "./pipeline-definition";
import { phaseNumberOf } from "./registry";

const skill = readFileSync(
  path.join(__dirname, "../../team/skills/initiative/SKILL.md"),
  "utf8",
);

describe("parsePipeline", () => {
  it("reads the skill in team/ to exactly the built-in pipeline", () => {
    expect(parsePipeline(skill)).toEqual(DEFAULT_STEPS);
  });

  it("picks up a phase and a gate added to the skill", () => {
    const steps = parsePipeline(
      [
        "## Phase 0 — Intake",
        "## Phase 1 — Plan (one round)",
        "**Gate A — plan.** Show the plan. Never skip Gate A.",
        "## Phase 2 — Build",
        "## Gate QA — sign-off",
        "## Phase 3 — Ship",
        "- Never skip Gate Z.",
      ].join("\n"),
    );
    expect(steps?.map((step) => [step.key, step.label, step.after])).toEqual([
      ["0", "Intake", 0],
      ["1", "Plan", 1],
      ["gate-a", "Gate A · plan", 1.5],
      ["2", "Build", 2],
      ["gate-qa", "Gate QA · sign-off", 2.5],
      ["3", "Ship", 3],
    ]);
  });

  it("returns null for a text with no pipeline", () => {
    expect(parsePipeline("# Notes\n\nGate A is important.")).toBeNull();
  });
});

describe("positions", () => {
  it("finds a gate whatever its letters, and the closing phase", () => {
    expect(gatePosition(DEFAULT_STEPS, "UI")).toBe(4.3);
    expect(gatePosition(DEFAULT_STEPS, "z")).toBeUndefined();
    expect(closePhase(DEFAULT_STEPS)).toBe(8);
  });

  it("places a registry phase line on a custom pipeline", () => {
    const steps = parsePipeline(
      "## Phase 0 — Intake\n## Phase 1 — Build\n## Gate QA — sign-off\n## Phase 2 — Ship",
    );
    expect(phaseNumberOf("Gate QA — waiting", steps ?? [])).toBe(1.5);
  });
});
