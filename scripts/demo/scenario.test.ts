import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "@/lib/claude/types";
import type { Initiative } from "@/lib/initiatives";
import { buildScenario, SESSIONS } from "./scenario.mjs";

/*
 * End to end over the readers: the demo data is written to a temporary Claude
 * home and read back through the same code the API routes call. It guards the
 * transcript format the parsers expect and the demo itself.
 */

let home: string;
let snapshot: Snapshot;
let initiatives: Initiative[];

beforeAll(async () => {
  home = mkdtempSync(path.join(os.tmpdir(), "agents-monitor-"));
  const scenario = buildScenario(Date.now());
  for (const [file, content] of Object.entries(scenario.files)) {
    const target = path.join(home, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  vi.stubEnv("CLAUDE_HOME", home);
  vi.stubEnv("AGENTS_MONITOR_DEMO", "1");
  vi.stubEnv("TICKET_PREFIXES", "ENG");
  vi.resetModules();
  const transcripts = await import("@/lib/claude/transcripts");
  const { listInitiatives } = await import("@/lib/initiatives");
  snapshot = await transcripts.buildSnapshot(48);
  initiatives = await listInitiatives();
});

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

const agentsOf = (sessionId: string) =>
  snapshot.sessions.find((session) => session.id === sessionId)?.agents ?? [];

describe("the demo data, read through the monitor", () => {
  it("finds the four sessions", () => {
    expect(snapshot.sessions.map((session) => session.id).sort()).toEqual(
      Object.values(SESSIONS).sort(),
    );
  });

  it("gives each run its role, mode and ticket", () => {
    const runs = agentsOf(SESSIONS.savedReplies);
    expect(runs).toHaveLength(13);
    const reviewer = runs.find(
      (run) => run.type === "tech-lead" && run.round === 2,
    );
    expect(reviewer).toMatchObject({
      mode: "review-pr",
      ticket: "ENG-414",
    });
    // It only turns "running" once the demo's ticker appends to it.
    expect(reviewer?.status).toBe("idle");
  });

  it("reads the hand-back that needs input and the helper's parent", () => {
    const runs = agentsOf(SESSIONS.savedReplies);
    const ai = runs.find((run) => run.type === "ai-developer");
    expect(ai?.status).toBe("reported");
    expect(ai?.report?.status).toBe("NEEDS_INPUT");
    expect(ai?.report?.questions).toContain("top three");
    const helper = runs.find((run) => run.type === "Explore");
    expect(helper?.parentId).toBe(
      runs.find((run) => run.ticket === "ENG-415")?.id,
    );
  });

  it("sees the open question of the session paused at Gate A", () => {
    const session = snapshot.sessions.find(
      (candidate) => candidate.id === SESSIONS.bulkExport,
    );
    expect(session?.pending?.tool).toBe("AskUserQuestion");
    expect(session?.pending?.questions?.[0].options).toHaveLength(3);
  });

  it("estimates a cost for every transcript", () => {
    for (const session of snapshot.sessions) {
      expect(session.usage?.costUSD).toBeGreaterThan(0);
    }
  });

  it("joins registries, issues and pull requests", () => {
    const savedReplies = initiatives.find(
      (initiative) => initiative.key === "ENG-412",
    );
    expect(savedReplies).toMatchObject({
      phaseNumber: 5,
      previews: ["ENG-414"],
    });
    expect(savedReplies?.trackerError).toBeUndefined();
    const picker = savedReplies?.children.find(
      (child) => child.identifier === "ENG-414",
    );
    expect(picker?.pullRequests[0]).toMatchObject({
      number: 88,
      state: "open",
      checks: { passed: 6, failing: 0, pending: 0 },
    });
    expect(
      initiatives.find((initiative) => initiative.key === "ENG-398")
        ?.phaseNumber,
    ).toBe(2.5);
  });
});
