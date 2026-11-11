import type { AgentInfo } from "@/lib/claude/types";
import type { PullRequest, TrackerIssue } from "@/lib/initiatives";
import type { Tone } from "./present";

export const STAGE_STEPS = [
  "Planned",
  "Building",
  "In review",
  "Approved",
  "Merged",
] as const;

export type WaitingOn =
  | "you"
  | "tech lead"
  | "developer"
  | "CI"
  | "dependency"
  | "orchestrator"
  | "nobody";

export interface TicketStage {
  step: number;
  label: string;
  waitingOn: WaitingOn;
  tone: Tone;
  pullRequest?: PullRequest;
  since?: number;
}

const REVIEW_MODE = "review-pr";
const ATTENTION_REPORTS = new Set(["NEEDS_INPUT", "BLOCKED"]);

function latest(
  agents: AgentInfo[],
  matches: (agent: AgentInfo) => boolean,
): AgentInfo | undefined {
  return agents
    .filter(matches)
    .sort((a, b) => b.lastActivity - a.lastActivity)[0];
}

/** Derives where a ticket is and who it waits on from its PRs, its Linear state and its agents. */
export function ticketStage(
  issue: TrackerIssue,
  agents: AgentInfo[],
): TicketStage {
  const merged = issue.pullRequests.find(
    (pullRequest) => pullRequest.state === "merged",
  );
  const open = issue.pullRequests.find(
    (pullRequest) => pullRequest.state === "open",
  );
  const reviewer = latest(
    agents,
    (agent) => agent.type === "tech-lead" && agent.mode === REVIEW_MODE,
  );
  const developer = latest(
    agents,
    (agent) => agent.type !== "tech-lead" && agent.type !== "fork",
  );
  const round = reviewer?.round ? ` round ${reviewer.round}` : "";

  if (merged || issue.state.type === "completed") {
    return {
      step: 4,
      label: "Merged",
      waitingOn: "nobody",
      tone: "good",
      pullRequest: merged,
    };
  }

  const developerReport = developer?.report?.status;
  if (
    developer?.status === "reported" &&
    developerReport &&
    ATTENTION_REPORTS.has(developerReport)
  ) {
    return {
      step: open ? 2 : 1,
      label:
        developerReport === "BLOCKED"
          ? "Developer is blocked"
          : "Developer needs your input",
      waitingOn: "you",
      tone: developerReport === "BLOCKED" ? "critical" : "warning",
      pullRequest: open,
      since: developer.lastActivity,
    };
  }

  if (open) {
    const verdict =
      reviewer?.status === "reported" ? reviewer.report?.status : undefined;
    if (reviewer?.status === "running") {
      return {
        step: 2,
        label: `Review${round} in progress`,
        waitingOn: "tech lead",
        tone: "neutral",
        pullRequest: open,
      };
    }
    if (verdict === "APPROVED") {
      return {
        step: 3,
        label: `Approved${round} — ready for your merge`,
        waitingOn: "you",
        tone: "good",
        pullRequest: open,
        since: reviewer?.lastActivity,
      };
    }
    if (developer?.status === "running") {
      return {
        step: reviewer ? 2 : 1,
        label: reviewer ? `Fixing review${round}` : "Building",
        waitingOn: "developer",
        tone: "neutral",
        pullRequest: open,
      };
    }
    if (open.checks?.failing) {
      return {
        step: 2,
        label: `CI failing (${open.checks.failing})`,
        waitingOn: "developer",
        tone: "critical",
        pullRequest: open,
      };
    }
    if (open.checks?.pending) {
      return {
        step: 2,
        label: "CI running",
        waitingOn: "CI",
        tone: "neutral",
        pullRequest: open,
      };
    }
    if (verdict === "CHANGES_REQUESTED") {
      const fixesPushed =
        developer !== undefined &&
        reviewer !== undefined &&
        developer.lastActivity > reviewer.lastActivity;
      return {
        step: 2,
        label: fixesPushed
          ? "Fixes pushed — next review round pending"
          : `Changes requested${round}`,
        waitingOn: "orchestrator",
        tone: "serious",
        pullRequest: open,
      };
    }
    return {
      step: 2,
      label: "PR open — review not started",
      waitingOn: "orchestrator",
      tone: "neutral",
      pullRequest: open,
    };
  }

  if (developer?.status === "running") {
    return {
      step: 1,
      label: "Building — no PR yet",
      waitingOn: "developer",
      tone: "neutral",
    };
  }
  if (issue.state.name === "Blocked") {
    return {
      step: 0,
      label: "Blocked by a dependency",
      waitingOn: "dependency",
      tone: "neutral",
    };
  }
  return {
    step: 0,
    label: "Not started",
    waitingOn: "orchestrator",
    tone: "neutral",
  };
}
