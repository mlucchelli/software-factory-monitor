import { describe, expect, it } from "vitest";
import type { AgentInfo, SessionInfo, UsageStats } from "@/lib/claude/types";
import {
  costByRole,
  crewCost,
  HELPERS_KEY,
  inPaletteOrder,
  NO_TICKET,
  share,
} from "./costs";

const usage = (costUSD: number): UsageStats => ({
  costUSD,
  outputTokens: costUSD * 1000,
  contextTokens: 0,
  contextWindow: 200_000,
  toolCalls: 0,
});

const run = (type: string, costUSD: number, ticket?: string): AgentInfo => ({
  id: `${type}-${costUSD}`,
  sessionId: "s",
  project: "p",
  parentId: null,
  depth: 1,
  type,
  isFork: false,
  status: "idle",
  lastActivity: 0,
  ticket,
  usage: usage(costUSD),
});

const session = { usage: usage(2) } as SessionInfo;

const crew = crewCost({
  key: "ENG-1",
  title: "ENG-1",
  session,
  runs: [
    run("tech-lead", 3, "ENG-2"),
    run("tech-lead", 1, "ENG-3"),
    run("backend-developer", 4, "ENG-2"),
    run("Explore", 0.5),
  ],
});

describe("crewCost", () => {
  it("adds the orchestrator to the runs", () => {
    expect(crew.totalUSD).toBeCloseTo(10.5);
  });

  it("groups by role, largest first, ties in palette order, helpers together", () => {
    expect(
      crew.byRole.map((slice) => [slice.key, slice.costUSD, slice.runs]),
    ).toEqual([
      ["tech-lead", 4, 2],
      ["backend-developer", 4, 1],
      ["session", 2, 1],
      [HELPERS_KEY, 0.5, 1],
    ]);
  });

  it("groups by ticket and keeps runs without one visible", () => {
    expect(crew.byTicket).toEqual([
      { ticket: "ENG-2", costUSD: 7, runs: 2 },
      { ticket: "ENG-3", costUSD: 1, runs: 1 },
      { ticket: NO_TICKET, costUSD: 0.5, runs: 1 },
    ]);
  });

  it("counts a run with no usage as zero", () => {
    const empty = crewCost({
      key: "k",
      title: "k",
      runs: [{ ...run("designer", 0), usage: undefined }],
    });
    expect(empty.totalUSD).toBe(0);
    expect(empty.byRole[0].runs).toBe(1);
  });
});

describe("across crews", () => {
  it("sums roles and keeps the palette order whatever the amounts", () => {
    const other = crewCost({
      key: "b",
      title: "b",
      runs: [run("designer", 9)],
    });
    const total = costByRole([crew, other]);
    expect(total.map((slice) => slice.key)).toEqual([
      "session",
      "tech-lead",
      "designer",
      "backend-developer",
      HELPERS_KEY,
    ]);
    expect(inPaletteOrder(crew.byRole)[0].key).toBe("session");
  });

  it("formats a share and survives a zero total", () => {
    expect(share(1, 4)).toBe("25%");
    expect(share(0, 0)).toBe("–");
  });
});
