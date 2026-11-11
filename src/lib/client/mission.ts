import type { AgentInfo, SessionInfo, Snapshot } from "@/lib/claude/types";
import type { Initiative } from "@/lib/initiatives";
import type { PhaseStep } from "@/lib/pipeline-definition";
import { ticketStage } from "./pipeline";

export type { PhaseStep };

export type StepState = "done" | "current" | "upcoming" | "skipped";

const PREVIEW_STEPS = new Set(["4", "gate-ui"]);

/** Build, review and watch run per ticket in parallel, so phases 5–7 are one live stretch. */
export function stepState(
  step: PhaseStep,
  phase?: number,
  previews: string[] = [],
): StepState {
  if (phase === undefined) {
    return "upcoming";
  }
  if (PREVIEW_STEPS.has(step.key) && previews.length === 0) {
    return step.after < phase ? "skipped" : "upcoming";
  }
  const delivering = phase >= 5 && phase <= 7;
  if (delivering && step.after >= 5 && step.after <= 7) {
    return step.after <= phase ? "current" : "upcoming";
  }
  if (step.after < phase) {
    return "done";
  }
  return step.after === phase ? "current" : "upcoming";
}

export const PLANNING_ROLES = ["initiative-manager", "tech-lead", "designer"];
export const DELIVERY_ROLES = [
  "backend-developer",
  "frontend-developer",
  "ai-developer",
];
export const TEAM_ROLES = new Set([...PLANNING_ROLES, ...DELIVERY_ROLES]);

export interface Crew {
  key: string;
  title: string;
  subtitle?: string;
  initiative?: Initiative;
  session?: SessionInfo;
}

function initiativeSession(
  initiative: Initiative,
  sessions: SessionInfo[],
): SessionInfo | undefined {
  const ids = new Set(initiative.agentIds);
  const tickets = new Set(initiative.children.map((child) => child.identifier));
  let best: { session: SessionInfo; score: number } | undefined;
  for (const session of sessions) {
    const score = session.agents.filter(
      (agent) =>
        ids.has(agent.id) || (agent.ticket && tickets.has(agent.ticket)),
    ).length;
    if (
      score > 0 &&
      (!best ||
        score > best.score ||
        (score === best.score &&
          session.lastActivity > best.session.lastActivity))
    ) {
      best = { session, score };
    }
  }
  return best?.session;
}

/** One crew per initiative registry, plus any other session that launched team roles. */
export function listCrews(
  snapshot: Snapshot | null,
  initiatives: Initiative[],
): Crew[] {
  const sessions = snapshot?.sessions ?? [];
  const crews: Crew[] = initiatives.map((initiative) => ({
    key: initiative.key,
    title: initiative.key,
    subtitle: initiative.name ?? initiative.parent?.title,
    initiative,
    session: initiativeSession(initiative, sessions),
  }));
  const claimed = new Set(crews.map((crew) => crew.session?.id));
  for (const session of sessions) {
    if (
      !claimed.has(session.id) &&
      session.agents.some((agent) => TEAM_ROLES.has(agent.type))
    ) {
      crews.push({
        key: `session:${session.id}`,
        title: session.live?.name ?? session.id.slice(0, 8),
        subtitle: session.title,
        session,
      });
    }
  }
  return crews;
}

const RECENT_MS = 20 * 60_000;
const RETIRED_MS = 24 * 60 * 60_000;

export function isActive(agent: AgentInfo, now: number): boolean {
  if (now - agent.lastActivity > RETIRED_MS) {
    return false;
  }
  return (
    agent.status === "running" ||
    agent.pending !== undefined ||
    now - agent.lastActivity < RECENT_MS
  );
}

/**
 * A run nobody will resume. Its last tool call reads as if it were still in
 * flight, so keeping it on a seat makes a finished run look hung — and an agent
 * that died holding a pending question or a BLOCKED report would otherwise stay
 * "active" forever, showing a day-old status as a live alarm.
 */
export function isRetired(agent: AgentInfo, now: number): boolean {
  return now - agent.lastActivity > RETIRED_MS;
}

export function helpersOf(agent: AgentInfo, agents: AgentInfo[]): AgentInfo[] {
  return agents.filter((candidate) => candidate.parentId === agent.id);
}

export function ciSummary(
  agent: AgentInfo,
  initiative: Initiative | undefined,
  agents: AgentInfo[],
) {
  const issue = initiative?.children.find(
    (child) => child.identifier === agent.ticket,
  );
  if (!issue) {
    return undefined;
  }
  return ticketStage(
    issue,
    agents.filter((candidate) => candidate.ticket === issue.identifier),
  );
}

export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens);
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  return hours < 48
    ? `${hours}h ${minutes % 60}m`
    : `${Math.round(hours / 24)}d`;
}
