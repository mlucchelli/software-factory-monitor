import type { AgentInfo } from "@/lib/claude/types";
import type { Initiative, TrackerIssue } from "@/lib/initiatives";
import {
  isRetired,
  type PhaseStep,
  type StepState,
  stepState,
  TEAM_ROLES,
} from "./mission";
import { type TicketStage, ticketStage } from "./pipeline";

export interface TicketToken {
  issue: TrackerIssue;
  stage: TicketStage;
}

export interface AgentGroup {
  type: string;
  /** Most relevant first: running, then waiting on you, then most recent. */
  agents: AgentInfo[];
}

export interface WorkflowStage {
  step: PhaseStep;
  state: StepState;
  groups: AgentGroup[];
  tickets: TicketToken[];
  running: number;
  waitingOnYou: boolean;
}

const BUILD = "5";
const REVIEW = "6";
const WATCH = "7";

const STAGE_BY_MODE: Record<string, string> = {
  "initiative-manager:draft": "1",
  "initiative-manager:revise": "1",
  "tech-lead:review-plan": "2",
  "tech-lead:breakdown": "3",
  "tech-lead:review-pr": REVIEW,
  "designer:ui-preview": "4",
  "designer:iterate": "4",
  "designer:approve": "4",
};

const STAGE_BY_DEVELOPER_MODE: Record<string, string> = {
  implement: BUILD,
  iterate: REVIEW,
  release: WATCH,
};

const DEFAULT_STAGE: Record<string, string> = {
  "initiative-manager": "1",
  "tech-lead": "2",
  designer: "4",
};

/** The stage whose work the current phase is doing, for runs that follow the pipeline around. */
function currentStageKey(steps: PhaseStep[], phase?: number): string {
  if (phase === undefined) {
    return "0";
  }
  const current = [...steps]
    .reverse()
    .find((step) => !step.gate && step.after <= phase);
  return current?.key ?? "0";
}

export function agentStageKey(
  agent: AgentInfo,
  steps: PhaseStep[],
  phase?: number,
): string {
  if (agent.type === "initiative-manager" && agent.mode === "status") {
    return currentStageKey(steps, phase);
  }
  const byMode = STAGE_BY_MODE[`${agent.type}:${agent.mode}`];
  if (byMode) {
    return byMode;
  }
  if (agent.type.endsWith("-developer")) {
    return STAGE_BY_DEVELOPER_MODE[agent.mode ?? ""] ?? BUILD;
  }
  return DEFAULT_STAGE[agent.type] ?? currentStageKey(steps, phase);
}

function ticketStageKey(stage: TicketStage, phase?: number): string {
  switch (stage.step) {
    case 0:
      return phase !== undefined && phase >= 5 ? BUILD : "3";
    case 1:
      return BUILD;
    case 4:
      return WATCH;
    default:
      return REVIEW;
  }
}

function relevance(agent: AgentInfo, waiting: Set<string>): number {
  if (waiting.has(agent.id)) {
    return 0;
  }
  return agent.status === "running" ? 1 : 2;
}

/**
 * Lays the crew's team runs and tickets onto the pipeline: each run sits on the
 * stage its role and mode work in, and each ticket on the stage its PR has reached.
 */
export function buildWorkflow(
  initiative: Initiative | undefined,
  agents: AgentInfo[],
  now: number,
  waitingIds: Set<string>,
  steps: PhaseStep[],
): WorkflowStage[] {
  const phase = initiative?.phaseNumber;
  const byStage = new Map<string, Map<string, AgentInfo[]>>();
  for (const agent of agents) {
    if (!TEAM_ROLES.has(agent.type) || isRetired(agent, now)) {
      continue;
    }
    const key = agentStageKey(agent, steps, phase);
    const groups = byStage.get(key) ?? new Map<string, AgentInfo[]>();
    groups.set(agent.type, [...(groups.get(agent.type) ?? []), agent]);
    byStage.set(key, groups);
  }

  const ticketsByStage = new Map<string, TicketToken[]>();
  for (const issue of initiative?.children ?? []) {
    if (issue.state.type === "canceled") {
      continue;
    }
    const stage = ticketStage(
      issue,
      agents.filter((agent) => agent.ticket === issue.identifier),
    );
    const key = ticketStageKey(stage, phase);
    ticketsByStage.set(key, [
      ...(ticketsByStage.get(key) ?? []),
      { issue, stage },
    ]);
  }

  return steps.map((step) => {
    const state = stepState(step, phase, initiative?.previews);
    const groups: AgentGroup[] = [
      ...(byStage.get(step.key)?.entries() ?? []),
    ].map(([type, members]) => ({
      type,
      agents: members.sort(
        (a, b) =>
          relevance(a, waitingIds) - relevance(b, waitingIds) ||
          b.lastActivity - a.lastActivity,
      ),
    }));
    const tickets = ticketsByStage.get(step.key) ?? [];
    const members = groups.flatMap((group) => group.agents);
    const running = members.filter(
      (agent) => agent.status === "running",
    ).length;
    const waitingOnYou =
      (step.gate && state === "current") ||
      members.some((agent) => waitingIds.has(agent.id)) ||
      tickets.some((ticket) => ticket.stage.waitingOn === "you");
    return { step, state, groups, tickets, running, waitingOnYou };
  });
}

/** Short label for a gate diamond: "Gate A · plan" reads as "A". */
export function gateLetter(step: PhaseStep): string {
  return /gate\s+(\w+)/i.exec(step.label)?.[1] ?? step.label;
}

/**
 * The runs that belong to one initiative when its orchestrator session drives
 * several: those the registry names, those on its tickets, and their helpers.
 */
export function initiativeRuns(
  initiative: Initiative,
  agents: AgentInfo[],
): AgentInfo[] {
  const ids = new Set(initiative.agentIds);
  const tickets = new Set([
    initiative.key,
    ...initiative.children.map((child) => child.identifier),
  ]);
  const kept = new Set(
    agents
      .filter(
        (agent) =>
          ids.has(agent.id) ||
          (agent.ticket !== undefined && tickets.has(agent.ticket)),
      )
      .map((agent) => agent.id),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const agent of agents) {
      if (!kept.has(agent.id) && agent.parentId && kept.has(agent.parentId)) {
        kept.add(agent.id);
        grew = true;
      }
    }
  }
  return agents.filter((agent) => kept.has(agent.id));
}
