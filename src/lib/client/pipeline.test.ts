import { describe, expect, it } from "vitest";
import type { AgentInfo } from "@/lib/claude/types";
import type { PullRequest, TrackerIssue } from "@/lib/initiatives";
import { isActive, isRetired, PHASE_STEPS, stepState } from "./mission";
import { ticketStage } from "./pipeline";

const NOW = Date.parse("2026-03-10T12:00:00Z");

function agent(overrides: Partial<AgentInfo>): AgentInfo {
  return {
    id: "a0000000000000001",
    sessionId: "s1",
    project: "p",
    parentId: null,
    depth: 1,
    type: "backend-developer",
    isFork: false,
    status: "idle",
    lastActivity: NOW,
    ...overrides,
  };
}

function issue(
  pullRequests: Partial<PullRequest>[] = [],
  state = "started",
): TrackerIssue {
  return {
    identifier: "ENG-414",
    title: "[web-app] Picker",
    url: "https://example.com/ENG-414",
    state: {
      name: state === "started" ? "In Progress" : "Blocked",
      type: state,
    },
    pullRequests: pullRequests.map((pullRequest) => ({
      number: 88,
      title: "ENG-414",
      url: "https://example.com/pr/88",
      state: "open",
      isDraft: false,
      repository: "web-app",
      ...pullRequest,
    })),
  };
}

const reviewer = (overrides: Partial<AgentInfo>) =>
  agent({ type: "tech-lead", mode: "review-pr", ...overrides });

describe("ticketStage", () => {
  it("is merged once a pull request merged", () => {
    expect(ticketStage(issue([{ state: "merged" }]), [])).toMatchObject({
      step: 4,
      waitingOn: "nobody",
    });
  });

  it("waits on you when the developer asks for input, even with a PR open", () => {
    const stage = ticketStage(issue([{}]), [
      agent({ status: "reported", report: { raw: "", status: "NEEDS_INPUT" } }),
    ]);
    expect(stage).toMatchObject({ waitingOn: "you", tone: "warning", step: 2 });
  });

  it("shows the review round while the reviewer runs", () => {
    const stage = ticketStage(issue([{}]), [
      reviewer({ status: "running", round: 2 }),
    ]);
    expect(stage.label).toBe("Review round 2 in progress");
    expect(stage.waitingOn).toBe("tech lead");
  });

  it("hands an approved pull request to you", () => {
    const stage = ticketStage(issue([{}]), [
      reviewer({ status: "reported", report: { raw: "", status: "APPROVED" } }),
    ]);
    expect(stage).toMatchObject({ step: 3, waitingOn: "you", tone: "good" });
  });

  it("puts failing checks before a stale review verdict", () => {
    const stage = ticketStage(
      issue([{ checks: { passed: 4, failing: 2, pending: 0 } }]),
      [
        reviewer({
          status: "reported",
          report: { raw: "", status: "CHANGES_REQUESTED" },
        }),
      ],
    );
    expect(stage.label).toBe("CI failing (2)");
    expect(stage.waitingOn).toBe("developer");
  });

  it("notices fixes pushed after changes were requested", () => {
    const stage = ticketStage(issue([{}]), [
      reviewer({
        status: "reported",
        report: { raw: "", status: "CHANGES_REQUESTED" },
        lastActivity: NOW - 60_000,
      }),
      agent({
        status: "reported",
        report: { raw: "", status: "DONE" },
        lastActivity: NOW,
      }),
    ]);
    expect(stage.label).toBe("Fixes pushed — next review round pending");
  });

  it("separates not started from blocked by a dependency", () => {
    expect(ticketStage(issue(), []).label).toBe("Not started");
    expect(ticketStage(issue([], "unstarted"), []).waitingOn).toBe(
      "dependency",
    );
  });
});

describe("stepState", () => {
  const step = (key: string) => {
    const found = PHASE_STEPS.find((candidate) => candidate.key === key);
    if (!found) {
      throw new Error(key);
    }
    return found;
  };

  it("marks a gate as current when the initiative is paused at it", () => {
    expect(stepState(step("gate-a"), 2.5)).toBe("current");
    expect(stepState(step("2"), 2.5)).toBe("done");
    expect(stepState(step("3"), 2.5)).toBe("upcoming");
  });

  it("skips the preview steps when no preview was recorded", () => {
    expect(stepState(step("4"), 5)).toBe("skipped");
    expect(stepState(step("4"), 5, ["ENG-414"])).toBe("done");
  });

  it("treats build, review and watch as one live stretch", () => {
    expect(stepState(step("5"), 6)).toBe("current");
    expect(stepState(step("6"), 6)).toBe("current");
    expect(stepState(step("7"), 6)).toBe("upcoming");
  });
});

describe("retiring runs", () => {
  it("keeps a run with an open question active for a day, not forever", () => {
    const pending = { tool: "AskUserQuestion", summary: "?", since: "" };
    expect(
      isActive(agent({ pending, lastActivity: NOW - 3_600_000 }), NOW),
    ).toBe(true);
    const old = agent({ pending, lastActivity: NOW - 25 * 3_600_000 });
    expect(isActive(old, NOW)).toBe(false);
    expect(isRetired(old, NOW)).toBe(true);
  });
});
