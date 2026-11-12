"use client";

import {
  CornerDownRight,
  MessageCircleQuestion,
  MessagesSquare,
} from "lucide-react";
import type { ActivityEvent, AgentInfo, SessionInfo } from "@/lib/claude/types";
import { formatAgo, roleStyle, SESSION_ROLE } from "@/lib/client/present";
import { Chip } from "../ui";
import type { Focus } from "./agent-node";
import { ContextGauge, NowLine } from "./metrics";

/** The orchestrator session: the one run that drives every stage, so it sits above the graph. */
export function Conductor({
  session,
  helpers,
  events,
  now,
  selected,
  waiting,
  onFocus,
  onAnswer,
}: {
  session: SessionInfo;
  helpers: AgentInfo[];
  events: ActivityEvent[];
  now: number;
  selected: boolean;
  waiting: boolean;
  onFocus: (focus: Focus) => void;
  onAnswer?: () => void;
}) {
  const role = roleStyle(SESSION_ROLE);
  const running = session.status === "running";
  const live = session.live;
  const fallback: ActivityEvent | undefined = session.lastMessage
    ? {
        id: "last",
        ts: session.lastMessage.ts,
        sourceId: session.id,
        sessionId: session.id,
        kind: "text",
        summary: session.lastMessage.text.split("\n")[0],
      }
    : undefined;

  return (
    <div
      className={`relative flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 overflow-hidden rounded-xl border px-3 py-2 transition-colors ${
        selected
          ? "border-transparent bg-surface-raised ring-2 ring-[var(--series-7)]"
          : waiting
            ? "border-status-warning/60 bg-status-warning/5"
            : "border-hairline bg-surface"
      }`}
    >
      {running && (
        <span
          className="absolute inset-x-0 top-0 h-px overflow-hidden"
          aria-hidden
        >
          <span
            className="comet"
            style={{ "--comet": role.color } as React.CSSProperties}
          />
        </span>
      )}
      <button
        type="button"
        onClick={() => onFocus({ kind: "session" })}
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative flex size-2.5 shrink-0" aria-hidden>
          {running && (
            <span
              className="motion-breathe absolute inset-0 rounded-full"
              style={{ background: role.color }}
            />
          )}
          <span
            className="relative size-2.5 rounded-full"
            style={{ background: role.color }}
          />
        </span>
        <span className="shrink-0 text-[13px] font-semibold">Orchestrator</span>
        <span className="hidden shrink-0 @3xl:inline">
          <Chip>
            {live
              ? `${live.name ?? live.pid}${live.tmuxPane ? ` · tmux ${live.tmuxPane}` : ""}`
              : "process not running"}
          </Chip>
        </span>
        <span className="min-w-0 flex-1">
          <NowLine event={events.at(-1) ?? fallback} live={running} />
        </span>
        <span className="hidden shrink-0 items-center gap-3 text-[11px] text-muted @2xl:flex">
          {session.usage && <ContextGauge usage={session.usage} />}
          <span className="tabular">
            {formatAgo(session.lastActivity, now)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={() => onFocus({ kind: "session" })}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-secondary ring-1 ring-hairline hover:bg-surface-raised hover:text-ink"
        title="Open the conversation with this session"
      >
        <MessagesSquare className="size-3.5" aria-hidden />
        Chat
      </button>
      {waiting && onAnswer && (
        <button
          type="button"
          onClick={onAnswer}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-status-warning px-2 py-1 text-xs font-medium text-page hover:brightness-110"
        >
          <MessageCircleQuestion className="size-3.5" aria-hidden />
          Answer
        </button>
      )}
      {helpers.length > 0 && (
        <span className="flex w-full min-w-0 flex-wrap gap-1.5 pl-5">
          {helpers.map((helper) => (
            <button
              key={helper.id}
              type="button"
              onClick={() => onFocus({ kind: "agent", id: helper.id })}
              className="inline-flex max-w-xs min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] text-ink-secondary ring-1 ring-hairline hover:text-ink"
            >
              <CornerDownRight className="size-3 shrink-0" aria-hidden />
              <span className="shrink-0">{helper.type}</span>
              <span className="truncate text-muted">{helper.description}</span>
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
