"use client";

import Link from "next/link";
import type { AgentInfo, SessionInfo, Snapshot } from "@/lib/claude/types";
import { formatAgo, formatUsd, projectName } from "@/lib/client/present";
import { Chip, eventIcon, RoleBadge, StatusPill } from "../ui";

const RECENT_MS = 30 * 60_000;

function isRecent(timestamp: number, now: number) {
  return now - timestamp < RECENT_MS;
}

function AgentNode({
  agent,
  childrenOf,
  now,
}: {
  agent: AgentInfo;
  childrenOf: Map<string, AgentInfo[]>;
  now: number;
}) {
  const children = childrenOf.get(agent.id) ?? [];
  const Icon = agent.lastEvent ? eventIcon(agent.lastEvent) : null;

  return (
    <li className="min-w-0">
      <Link
        href={`/agents/${agent.id}`}
        className="grid min-w-0 gap-1 overflow-hidden rounded-lg px-2 py-2 transition-colors hover:bg-surface-raised"
      >
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge type={agent.type} />
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {agent.description ?? agent.id}
          </span>
          {agent.ticket && <Chip>{agent.ticket}</Chip>}
          {agent.mode && <Chip>{agent.mode}</Chip>}
          <StatusPill
            status={agent.status}
            reportStatus={agent.report?.status}
          />
          <span className="w-16 text-right text-[11px] text-muted">
            {formatAgo(agent.lastActivity, now)}
          </span>
        </div>
        {agent.lastEvent && Icon && (
          <div className="flex min-w-0 items-center gap-1.5 pl-3.5 text-[11px] text-muted">
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate font-mono">
              {agent.lastEvent.summary}
            </span>
          </div>
        )}
      </Link>
      {children.length > 0 && (
        <ul className="ml-3 min-w-0 border-l border-hairline pl-2">
          {children.map((child) => (
            <AgentNode
              key={child.id}
              agent={child}
              childrenOf={childrenOf}
              now={now}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SessionCard({
  session,
  now,
  showIdle,
}: {
  session: SessionInfo;
  now: number;
  showIdle: boolean;
}) {
  const visible = showIdle
    ? session.agents
    : session.agents.filter(
        (agent) => agent.status !== "idle" || isRecent(agent.lastActivity, now),
      );
  const ids = new Set(visible.map((agent) => agent.id));
  const childrenOf = new Map<string, AgentInfo[]>();
  const roots: AgentInfo[] = [];
  for (const agent of visible) {
    if (agent.parentId && ids.has(agent.parentId)) {
      childrenOf.set(agent.parentId, [
        ...(childrenOf.get(agent.parentId) ?? []),
        agent,
      ]);
    } else {
      roots.push(agent);
    }
  }
  const hidden = session.agents.length - visible.length;
  const project = projectName(session.cwd, session.project);
  const cost = formatUsd(session.costUSD);

  return (
    <article className="rounded-lg border border-hairline bg-page/40 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <StatusPill status={session.status} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-medium">
          {session.title ?? session.lastPrompt ?? session.id}
        </h3>
        <span className="text-[11px] text-muted">
          {formatAgo(session.lastActivity, now)}
        </span>
      </header>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="font-mono">{project}</span>
        {session.branch && (
          <span className="font-mono">⎇ {session.branch}</span>
        )}
        {cost && <span className="tabular">{cost}</span>}
        {session.linesAdded !== undefined && (
          <span className="tabular">
            +{session.linesAdded} / −{session.linesRemoved ?? 0}
          </span>
        )}
        <span>{session.agents.length} agents</span>
      </p>
      {roots.length > 0 && (
        <ul className="mt-2">
          {roots.map((agent) => (
            <AgentNode
              key={agent.id}
              agent={agent}
              childrenOf={childrenOf}
              now={now}
            />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="mt-1 px-2 text-[11px] text-muted">
          {hidden} idle agents hidden
        </p>
      )}
    </article>
  );
}

export function SessionTree({
  snapshot,
  now,
  showIdle,
}: {
  snapshot: Snapshot | null;
  now: number;
  showIdle: boolean;
}) {
  if (!snapshot) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Reading transcripts…
      </p>
    );
  }
  const sessions = showIdle
    ? snapshot.sessions
    : snapshot.sessions.filter(
        (session) =>
          session.status === "running" || isRecent(session.lastActivity, now),
      );
  if (sessions.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Nothing active in the last 30 minutes. Toggle “Show idle” to browse the
        window.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {sessions.map((session) => (
        <SessionCard
          key={`${session.project}/${session.id}`}
          session={session}
          now={now}
          showIdle={showIdle}
        />
      ))}
    </div>
  );
}
