"use client";

import { ArrowUpRight, Moon } from "lucide-react";
import Link from "next/link";
import type { ActivityEvent, AgentInfo } from "@/lib/claude/types";
import {
  formatAgo,
  humanizeStatus,
  reportTone,
  TONE_COLOR,
} from "@/lib/client/present";
import type { Initiative } from "@/lib/initiatives";
import { ContextGauge } from "./metrics";

export type Focus =
  | { kind: "session" }
  | { kind: "agent"; id: string }
  | { kind: "ticket"; identifier: string };

export interface NodeContext {
  agents: AgentInfo[];
  initiative?: Initiative;
  eventsBySource: Map<string, ActivityEvent[]>;
  waitingIds: Set<string>;
  now: number;
  focus: Focus | null;
  onFocus: (focus: Focus) => void;
}

export function RunGlyph({
  agent,
  waiting,
}: {
  agent: AgentInfo;
  waiting: boolean;
}) {
  if (waiting) {
    return (
      <span className="relative flex size-2 shrink-0" title="Waiting on you">
        <span className="motion-ripple absolute inset-0 rounded-full bg-status-warning" />
        <span className="relative size-2 rounded-full bg-status-warning" />
      </span>
    );
  }
  if (agent.status === "running") {
    return (
      <span className="relative flex size-2 shrink-0" title="Running">
        <span className="motion-breathe absolute inset-0 rounded-full bg-status-good" />
        <span className="relative size-2 rounded-full bg-status-good" />
      </span>
    );
  }
  if (agent.status === "reported") {
    return (
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ background: TONE_COLOR[reportTone(agent.report?.status)] }}
        title={agent.report?.status ? humanizeStatus(agent.report.status) : ""}
      />
    );
  }
  return <Moon className="size-2.5 shrink-0 text-muted" aria-label="Idle" />;
}

export function InstanceRow({
  agent,
  context,
}: {
  agent: AgentInfo;
  context: NodeContext;
}) {
  const { focus, onFocus, waitingIds, now } = context;
  const selected = focus?.kind === "agent" && focus.id === agent.id;
  const waiting = waitingIds.has(agent.id);
  const running = agent.status === "running";
  return (
    <li
      className={`group/row flex min-w-0 items-center rounded-md transition-colors ${
        selected ? "bg-surface-raised" : "hover:bg-surface-raised/70"
      }`}
    >
      <button
        type="button"
        onClick={() => onFocus({ kind: "agent", id: agent.id })}
        className="grid min-w-0 flex-1 gap-0.5 px-2 py-1.5 text-left"
        aria-pressed={selected}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted">
          <RunGlyph agent={agent} waiting={waiting} />
          {agent.ticket && (
            <span className="truncate font-mono text-ink-secondary">
              {agent.ticket}
            </span>
          )}
          {agent.round !== undefined && agent.mode === "review-pr" && (
            <span className="shrink-0 tabular">R{agent.round}</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-2 tabular">
            {agent.usage && <ContextGauge usage={agent.usage} />}
            {formatAgo(agent.lastActivity, now)}
          </span>
        </span>
        <span
          className={`truncate text-xs ${running || waiting ? "text-ink" : "text-ink-secondary"}`}
          title={agent.description}
        >
          {agent.description ?? agent.id}
        </span>
      </button>
      <Link
        href={`/agents/${agent.id}`}
        className="mr-1 shrink-0 rounded p-1 text-muted opacity-60 group-hover/row:opacity-100 hover:bg-surface hover:text-ink focus-visible:opacity-100"
        aria-label={`Open ${agent.description ?? agent.id} on its own page`}
        title="Open full page"
      >
        <ArrowUpRight className="size-3.5" aria-hidden />
      </Link>
    </li>
  );
}
