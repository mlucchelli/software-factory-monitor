import type { ActivityEvent, AgentInfo } from "@/lib/claude/types";
import {
  DELIVERY_ROLES,
  isActive,
  isRetired,
  type PhaseStep,
  PLANNING_ROLES,
  TEAM_ROLES,
} from "./mission";
import { reportTone } from "./present";
import { agentStageKey } from "./workflow";

export const YOU = "you";
export const ORCHESTRATOR = "orch";
export const HELPERS_SEAT = "helpers";
export const SEAT_ROLES = [...PLANNING_ROLES, ...DELIVERY_ROLES];

export const seatKey = (role: string) => `seat:${role}`;

export type RunState =
  | "running"
  | "waiting-you"
  | "waiting-tool"
  | "done"
  | "failed"
  | "changes"
  | "idle";

const STALLED_AFTER_MS = 90_000;

/** One word of state for a run, in the order that matters to the person watching. */
export function runState(
  agent: AgentInfo,
  waitingIds: Set<string>,
  now: number,
): RunState {
  if (waitingIds.has(agent.id)) {
    return agent.pending?.tool === "AskUserQuestion" ||
      agent.status === "reported"
      ? "waiting-you"
      : "waiting-tool";
  }
  if (agent.status === "running") {
    return "running";
  }
  if (agent.pending && now - agent.lastActivity > STALLED_AFTER_MS) {
    return "waiting-tool";
  }
  if (agent.status === "reported") {
    const tone = reportTone(agent.report?.status);
    if (tone === "critical") {
      return "failed";
    }
    if (tone === "serious") {
      return "changes";
    }
    return tone === "good" ? "done" : "idle";
  }
  return "idle";
}

export const RUN_STATE_LABEL: Record<RunState, string> = {
  running: "Running",
  "waiting-you": "Needs you",
  "waiting-tool": "Waiting on a tool",
  done: "Done",
  failed: "Blocked",
  changes: "Changes requested",
  idle: "Idle",
};

export interface TeamRun {
  agent: AgentInfo;
  state: RunState;
  stageKey: string;
  stageLabel: string;
  helpers: TeamRun[];
}

export interface Seat {
  role: string;
  /** Runs worth a node of their own: live, waiting, or touched in the last 20 minutes. */
  shown: TeamRun[];
  /**
   * Everything else, listed on demand. Runs nobody will resume only ever land
   * here: as a node their last tool call would read as still in flight.
   */
  earlier: TeamRun[];
}

export interface Team {
  seats: Seat[];
  /** Node key → parent node key, for every node that can hold an edge. */
  parents: Map<string, string>;
  /** Run id → the node that stands for it on screen (itself, or its seat when folded away). */
  visible: Map<string, string>;
  byId: Map<string, AgentInfo>;
}

const MAX_SHOWN = 3;

function stageLabelOf(key: string, steps: PhaseStep[]): string {
  return steps.find((step) => step.key === key)?.label ?? key;
}

/**
 * The crew as an org chart: orchestrator, one seat per team role (empty seats
 * included), the runs in each seat, and the helpers each run spawned.
 */
export function buildTeam(
  agents: AgentInfo[],
  waitingIds: Set<string>,
  now: number,
  steps: PhaseStep[],
  phase?: number,
): Team {
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  const childrenOf = new Map<string, AgentInfo[]>();
  for (const agent of agents) {
    if (agent.parentId && byId.has(agent.parentId)) {
      childrenOf.set(agent.parentId, [
        ...(childrenOf.get(agent.parentId) ?? []),
        agent,
      ]);
    }
  }

  const toRun = (agent: AgentInfo): TeamRun => {
    const stageKey = agentStageKey(agent, steps, phase);
    return {
      agent,
      state: runState(agent, waitingIds, now),
      stageKey,
      stageLabel: stageLabelOf(stageKey, steps),
      helpers: (childrenOf.get(agent.id) ?? [])
        .filter((helper) => isActive(helper, now) || waitingIds.has(helper.id))
        .map(toRun),
    };
  };

  const byRecency = (a: TeamRun, b: TeamRun) =>
    rank(a) - rank(b) || b.agent.lastActivity - a.agent.lastActivity;
  const topLevel = agents.filter(
    (agent) => !agent.parentId || !byId.has(agent.parentId),
  );
  const seatOf = (agent: AgentInfo) =>
    TEAM_ROLES.has(agent.type) ? agent.type : HELPERS_SEAT;

  const roles = [...SEAT_ROLES];
  if (topLevel.some((agent) => seatOf(agent) === HELPERS_SEAT)) {
    roles.push(HELPERS_SEAT);
  }
  const seats = roles.map((role): Seat => {
    const runs = topLevel
      .filter((agent) => seatOf(agent) === role)
      .map(toRun)
      .sort(byRecency);
    const live = runs.filter(
      (run) =>
        run.state === "running" ||
        run.state.startsWith("waiting") ||
        isActive(run.agent, now),
    );
    const resumable = runs.filter((run) => !isRetired(run.agent, now));
    const shown = (live.length > 0 ? live : resumable.slice(0, 1)).slice(
      0,
      MAX_SHOWN,
    );
    const shownIds = new Set(shown.map((run) => run.agent.id));
    return {
      role,
      shown,
      earlier: runs.filter((run) => !shownIds.has(run.agent.id)),
    };
  });

  const parents = new Map<string, string>([[ORCHESTRATOR, YOU]]);
  const visible = new Map<string, string>();
  for (const seat of seats) {
    const key = seatKey(seat.role);
    parents.set(key, ORCHESTRATOR);
    const place = (run: TeamRun, parent: string) => {
      parents.set(run.agent.id, parent);
      visible.set(run.agent.id, run.agent.id);
      for (const helper of run.helpers) {
        place(helper, run.agent.id);
      }
    };
    for (const run of seat.shown) {
      place(run, key);
    }
    for (const run of seat.earlier) {
      visible.set(run.agent.id, key);
    }
  }
  for (const agent of agents) {
    if (!visible.has(agent.id)) {
      const parent = agent.parentId ? visible.get(agent.parentId) : undefined;
      visible.set(agent.id, parent ?? seatKey(seatOf(agent)));
    }
  }
  return { seats, parents, visible, byId };
}

const RANK: Record<RunState, number> = {
  "waiting-you": 0,
  running: 1,
  "waiting-tool": 2,
  failed: 3,
  changes: 4,
  idle: 5,
  done: 6,
};

function rank(run: TeamRun): number {
  return RANK[run.state];
}

/** The edges from `from` up to the root, as node keys with their parents. */
export function pathToRoot(team: Team, from: string): string[] {
  const path: string[] = [];
  let current: string | undefined = from;
  while (current && current !== YOU) {
    path.push(current);
    current = team.parents.get(current);
  }
  return path;
}

export type PacketTone =
  | "dispatch"
  | "report"
  | "reply"
  | "warning"
  | "critical";

export interface Packet {
  id: string;
  /** Child node keys of the edges to travel, in travel order. */
  hops: string[];
  direction: "down" | "up";
  tone: PacketTone;
  /** The node that lights up when the packet lands. */
  target: string;
  /** The node it left from, to fold a hand-back and its delivery into one message. */
  origin: string;
}

const AGENT_MESSAGE = /<agent-message from="(a[0-9a-f]{16})"/;
const SEND_TARGET = /^→ (\S+) ·/;
const SPAWN_ROLE = /^(\S+) ·/;

function downTo(
  team: Team,
  node: string,
  id: string,
  tone: PacketTone,
): Packet {
  const hops = pathToRoot(team, node)
    .reverse()
    .filter((key) => key !== ORCHESTRATOR);
  return {
    id,
    hops,
    direction: "down",
    tone,
    target: node,
    origin: ORCHESTRATOR,
  };
}

function upFrom(
  team: Team,
  node: string,
  id: string,
  tone: PacketTone,
): Packet {
  const hops = pathToRoot(team, node).filter((key) => key !== ORCHESTRATOR);
  return {
    id,
    hops,
    direction: "up",
    tone,
    target: ORCHESTRATOR,
    origin: node,
  };
}

/**
 * Turns one transcript event into a message on the chart, only for the events
 * that are communication: the orchestrator dispatching or spawning, a run
 * messaging or handing back, you prompting the orchestrator, or the
 * orchestrator asking you. Anything else returns null.
 */
export function packetFor(
  event: ActivityEvent,
  team: Team,
  sessionSource: string,
): Packet | null {
  const fromOrchestrator = event.sourceId === sessionSource;
  const node = team.visible.get(event.sourceId);

  if (fromOrchestrator && event.kind === "tool") {
    if (event.tool === "SendMessage") {
      const target = team.visible.get(
        SEND_TARGET.exec(event.summary)?.[1] ?? "",
      );
      return target ? downTo(team, target, event.id, "dispatch") : null;
    }
    if (event.tool === "Agent") {
      const role = SPAWN_ROLE.exec(event.summary)?.[1] ?? "";
      const seat = seatKey(TEAM_ROLES.has(role) ? role : HELPERS_SEAT);
      return team.parents.has(seat)
        ? downTo(team, seat, event.id, "dispatch")
        : null;
    }
    if (event.tool === "AskUserQuestion") {
      return {
        id: event.id,
        hops: [ORCHESTRATOR],
        direction: "up",
        tone: "warning",
        target: YOU,
        origin: ORCHESTRATOR,
      };
    }
    return null;
  }

  if (fromOrchestrator && event.kind === "text") {
    return {
      id: event.id,
      hops: [ORCHESTRATOR],
      direction: "up",
      tone: "reply",
      target: YOU,
      origin: ORCHESTRATOR,
    };
  }

  if (fromOrchestrator && event.kind === "prompt") {
    const sender = AGENT_MESSAGE.exec(event.summary)?.[1];
    if (sender) {
      const from = team.visible.get(sender);
      return from ? upFrom(team, from, event.id, "report") : null;
    }
    return {
      id: event.id,
      hops: [ORCHESTRATOR],
      direction: "down",
      tone: "dispatch",
      target: ORCHESTRATOR,
      origin: YOU,
    };
  }

  if (!node) {
    return null;
  }
  if (event.kind === "report") {
    const tone = reportTone(event.reportStatus);
    return upFrom(
      team,
      node,
      event.id,
      tone === "warning"
        ? "warning"
        : tone === "critical"
          ? "critical"
          : "report",
    );
  }
  if (event.kind === "tool" && event.tool === "SendMessage") {
    return upFrom(team, node, event.id, "report");
  }
  return null;
}

/** Whether an event is plain work on a node, which only makes that node blink. */
export function isWork(event: ActivityEvent): boolean {
  return (
    event.kind === "tool" &&
    event.tool !== "SendMessage" &&
    event.tool !== "Agent" &&
    event.tool !== "AskUserQuestion"
  );
}
