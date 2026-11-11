"use client";

import type { ActivityEvent, Snapshot } from "@/lib/claude/types";

function StatTile({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{caption}</p>
    </div>
  );
}

export function KpiRow({
  snapshot,
  events,
  now,
  waitingOnYou,
}: {
  snapshot: Snapshot | null;
  events: ActivityEvent[];
  now: number;
  waitingOnYou: number;
}) {
  const sessions = snapshot?.sessions ?? [];
  const agents = sessions.flatMap((session) => session.agents);
  const runningAgents = agents.filter(
    (agent) => agent.status === "running",
  ).length;
  const liveSessions = sessions.filter(
    (session) => session.status === "running",
  ).length;
  const minuteAgo = new Date(now - 60_000).toISOString();
  const toolsPerMinute = events.filter(
    (event) => event.kind === "tool" && event.ts >= minuteAgo,
  ).length;
  const ticketsInFlight = new Set(
    agents
      .filter((agent) => agent.status !== "idle" && agent.ticket)
      .map((agent) => agent.ticket),
  ).size;
  const loading = snapshot === null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="Agents running"
        value={loading ? "–" : String(runningAgents)}
        caption={loading ? "loading" : `of ${agents.length} in the window`}
      />
      <StatTile
        label="Live sessions"
        value={loading ? "–" : String(liveSessions)}
        caption={
          loading
            ? "loading"
            : `${sessions.length} sessions in ${snapshot.windowHours}h`
        }
      />
      <StatTile
        label="Tool calls / min"
        value={String(toolsPerMinute)}
        caption="across every agent"
      />
      <StatTile
        label="Waiting on you"
        value={loading ? "–" : String(waitingOnYou)}
        caption="questions, blocked reports, stalled tools"
      />
      <StatTile
        label="Tickets in flight"
        value={loading ? "–" : String(ticketsInFlight)}
        caption="with a running or reporting agent"
      />
    </div>
  );
}
