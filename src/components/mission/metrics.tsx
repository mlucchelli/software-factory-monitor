"use client";

import { GitPullRequest } from "lucide-react";
import type { ActivityEvent, UsageStats } from "@/lib/claude/types";
import { formatDuration, formatTokens } from "@/lib/client/mission";
import { formatUsd, TONE_COLOR } from "@/lib/client/present";
import type { CheckSummary } from "@/lib/initiatives";
import { eventIcon } from "../ui";

const CONTEXT_WARNING = 0.7;
const CONTEXT_CRITICAL = 0.85;

export function ContextGauge({ usage }: { usage: UsageStats }) {
  const ratio = Math.min(1, usage.contextTokens / usage.contextWindow);
  const color =
    ratio >= CONTEXT_CRITICAL
      ? TONE_COLOR.critical
      : ratio >= CONTEXT_WARNING
        ? TONE_COLOR.warning
        : "var(--ink-secondary)";
  return (
    <span
      className="flex items-center gap-1.5"
      title={`${usage.contextTokens.toLocaleString()} of ${usage.contextWindow.toLocaleString()} tokens in context`}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-raised">
        <span
          className="block h-full origin-left rounded-full transition-transform duration-500"
          style={{
            transform: `scaleX(${Math.max(0.03, ratio)})`,
            background: color,
          }}
        />
      </span>
      <span className="tabular" style={{ color }}>
        {formatTokens(usage.contextTokens)}
      </span>
    </span>
  );
}

export function Metrics({
  usage,
  running,
  lastActivity,
  now,
  children,
}: {
  usage?: UsageStats;
  running: boolean;
  lastActivity: number;
  now: number;
  children?: React.ReactNode;
}) {
  if (!usage) {
    return children ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {children}
      </div>
    ) : null;
  }
  const duration = usage.startedAt
    ? formatDuration((running ? now : lastActivity) - usage.startedAt)
    : undefined;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
      <span className="tabular text-ink-secondary" title="Estimated API cost">
        {formatUsd(usage.costUSD)}
      </span>
      <ContextGauge usage={usage} />
      {duration && (
        <span className="tabular" title={running ? "Running for" : "Ran for"}>
          {duration}
        </span>
      )}
      <span className="tabular">{usage.toolCalls} tools</span>
      {children}
    </div>
  );
}

export function ChecksBadge({
  number,
  checks,
}: {
  number: number;
  checks?: CheckSummary;
}) {
  return (
    <span className="inline-flex items-center gap-1 tabular">
      <GitPullRequest className="size-3" aria-hidden />#{number}
      {checks && (
        <span
          style={{
            color: checks.failing
              ? TONE_COLOR.critical
              : checks.pending
                ? TONE_COLOR.warning
                : TONE_COLOR.good,
          }}
        >
          {checks.failing
            ? `✗ ${checks.failing}`
            : checks.pending
              ? `… ${checks.pending}`
              : `✓ ${checks.passed}`}
        </span>
      )}
    </span>
  );
}

/** One activity line: what the run is doing right now. */
export function NowLine({
  event,
  live,
}: {
  event?: ActivityEvent;
  live: boolean;
}) {
  if (!event) {
    return null;
  }
  const Icon = eventIcon(event);
  return (
    <p
      key={event.id}
      className={`motion-rise flex min-w-0 items-center gap-1.5 font-mono text-[11px] ${
        live ? "text-ink" : "text-muted"
      }`}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      <span className="shrink-0">{event.tool ?? event.kind}</span>
      <span className="min-w-0 truncate">{event.summary}</span>
    </p>
  );
}

export function Ticker({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return null;
  }
  return (
    <ul className="grid gap-1">
      {events.map((event, index) => (
        <li key={event.id}>
          <NowLine event={event} live={index === events.length - 1} />
        </li>
      ))}
    </ul>
  );
}
