import type {
  ActivityEvent,
  AgentStatus,
  SessionStatus,
  Snapshot,
} from "@/lib/claude/types";

export interface RoleStyle {
  key: string;
  label: string;
  color: string;
}

export const SESSION_ROLE = "session";

export const ROLE_LEGEND: RoleStyle[] = [
  { key: "initiative-manager", label: "Manager", color: "var(--series-1)" },
  { key: "tech-lead", label: "Tech lead", color: "var(--series-2)" },
  { key: "designer", label: "Designer", color: "var(--series-8)" },
  { key: "backend-developer", label: "Backend", color: "var(--series-3)" },
  { key: "frontend-developer", label: "Frontend", color: "var(--series-4)" },
  { key: "ai-developer", label: "AI dev", color: "var(--series-5)" },
  { key: "fork", label: "Fork", color: "var(--series-6)" },
  { key: SESSION_ROLE, label: "Session", color: "var(--series-7)" },
];

const ROLE_BY_KEY = new Map(ROLE_LEGEND.map((role) => [role.key, role]));

export const OTHER_ROLE: RoleStyle = {
  key: "other",
  label: "Other",
  color: "var(--series-other)",
};

export function roleStyle(type: string): RoleStyle {
  return ROLE_BY_KEY.get(type) ?? { ...OTHER_ROLE, label: type };
}

export type Tone = "good" | "warning" | "serious" | "critical" | "neutral";

export const TONE_COLOR: Record<Tone, string> = {
  good: "var(--status-good)",
  warning: "var(--status-warning)",
  serious: "var(--status-serious)",
  critical: "var(--status-critical)",
  neutral: "var(--muted)",
};

export function reportTone(status?: string): Tone {
  switch (status) {
    case "DONE":
    case "APPROVED":
      return "good";
    case "NEEDS_INPUT":
      return "warning";
    case "CHANGES_REQUESTED":
      return "serious";
    case "BLOCKED":
      return "critical";
    default:
      return "neutral";
  }
}

export const ATTENTION_STATUSES = new Set(["NEEDS_INPUT", "BLOCKED"]);

export function humanizeStatus(status: string): string {
  const words = status.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface SourceInfo {
  id: string;
  type: string;
  title: string;
  project: string;
  ticket?: string;
  status: AgentStatus | SessionStatus;
  reportStatus?: string;
  href?: string;
}

export function projectName(cwd?: string, project?: string): string {
  if (cwd) {
    return cwd.split("/").filter(Boolean).at(-1) ?? cwd;
  }
  return project?.split("-").filter(Boolean).at(-1) ?? "unknown";
}

export function buildSources(
  snapshot: Snapshot | null,
): Map<string, SourceInfo> {
  const sources = new Map<string, SourceInfo>();
  for (const session of snapshot?.sessions ?? []) {
    const project = projectName(session.cwd, session.project);
    sources.set(`session:${session.id}`, {
      id: `session:${session.id}`,
      type: SESSION_ROLE,
      title: session.title ?? project,
      project,
      status: session.status,
    });
    for (const agent of session.agents) {
      sources.set(agent.id, {
        id: agent.id,
        type: agent.type,
        title: agent.description ?? agent.type,
        project: projectName(agent.cwd, agent.project),
        ticket: agent.ticket,
        status: agent.status,
        reportStatus:
          agent.status === "reported" ? agent.report?.status : undefined,
        href: `/agents/${agent.id}`,
      });
    }
  }
  return sources;
}

export function sourceRole(
  event: ActivityEvent,
  sources: Map<string, SourceInfo>,
): string {
  const known = sources.get(event.sourceId)?.type;
  if (known) {
    return known;
  }
  return event.sourceId.startsWith("session:") ? SESSION_ROLE : OTHER_ROLE.key;
}

export function formatAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) {
    return "now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

export function formatUsd(value?: number): string | undefined {
  return value === undefined ? undefined : `$${value.toFixed(2)}`;
}

export interface Team {
  key: string;
  label: string;
  roles: string[];
}

export const TEAMS: Team[] = [
  {
    key: "planning",
    label: "Planning",
    roles: ["initiative-manager", "tech-lead"],
  },
  { key: "backend", label: "Backend", roles: ["backend-developer"] },
  { key: "frontend", label: "Frontend", roles: ["frontend-developer"] },
  { key: "ai", label: "AI", roles: ["ai-developer"] },
  { key: "helpers", label: "Helpers", roles: ["fork"] },
  { key: "sessions", label: "Sessions", roles: [SESSION_ROLE] },
];

const HELPERS_TEAM = TEAMS.find((team) => team.key === "helpers") as Team;

export function teamOf(type: string): Team {
  return TEAMS.find((team) => team.roles.includes(type)) ?? HELPERS_TEAM;
}
