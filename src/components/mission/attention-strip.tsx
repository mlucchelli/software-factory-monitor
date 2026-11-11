"use client";

import {
  CircleAlert,
  DoorClosed,
  ExternalLink,
  GitMerge,
  Hourglass,
  type LucideIcon,
  MessageCircleQuestion,
} from "lucide-react";
import type { AttentionItem, AttentionKind } from "@/lib/client/attention";
import { formatAgo, roleStyle, TONE_COLOR } from "@/lib/client/present";
import type { WorkflowStage } from "@/lib/client/workflow";
import { canAnswer } from "../needs-you-panel";
import type { Focus } from "./agent-node";

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  question: MessageCircleQuestion,
  merge: GitMerge,
  report: CircleAlert,
  stalled: Hourglass,
};

function focusOf(item: AttentionItem): Focus | null {
  if (item.kind === "merge") {
    return item.ticket ? { kind: "ticket", identifier: item.ticket } : null;
  }
  return item.sourceId.startsWith("session:")
    ? { kind: "session" }
    : { kind: "agent", id: item.sourceId };
}

/** Everything in this crew that waits on you, as one amber band that cannot be missed. */
export function AttentionStrip({
  items,
  gate,
  now,
  onFocus,
  onAnswer,
}: {
  items: AttentionItem[];
  /** A gate the initiative is paused at: the orchestrator waits for your go-ahead. */
  gate?: WorkflowStage;
  now: number;
  onFocus: (focus: Focus) => void;
  onAnswer: (item: AttentionItem) => void;
}) {
  const count = items.length + (gate ? 1 : 0);
  if (count === 0) {
    return null;
  }
  return (
    <section
      className="motion-rise relative overflow-hidden rounded-xl border border-status-warning/40 bg-status-warning/[0.06]"
      aria-label={`${count} waiting on you`}
    >
      <span
        className="motion-halo pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-status-warning"
        aria-hidden
      />
      <div className="flex min-w-0 items-stretch gap-2 overflow-x-auto p-2 pl-3">
        <div className="flex shrink-0 flex-col justify-center pr-2">
          <span className="text-2xl leading-none font-semibold text-status-warning tabular">
            {count}
          </span>
          <span className="text-[11px] whitespace-nowrap text-ink-secondary">
            waiting on you
          </span>
        </div>
        {gate && (
          <article className="motion-rise grid w-72 shrink-0 content-start gap-1 rounded-lg border border-status-warning/50 bg-surface px-3 py-2">
            <header className="flex min-w-0 items-center gap-1.5 text-[11px]">
              <DoorClosed
                className="size-3.5 shrink-0 text-status-warning"
                aria-hidden
              />
              <span className="truncate font-medium text-ink">
                Paused at {gate.step.label}
              </span>
            </header>
            <p className="text-xs text-ink-secondary">
              The orchestrator stops here until you give the go-ahead in its
              session.
            </p>
          </article>
        )}
        {items.map((item, index) => {
          const Icon = KIND_ICON[item.kind];
          const focus = focusOf(item);
          const answerable = canAnswer(item);
          return (
            <article
              key={item.id}
              className="motion-rise grid w-72 shrink-0 gap-1 rounded-lg border border-hairline bg-surface px-3 py-2"
              style={{ "--i": index } as React.CSSProperties}
            >
              <header className="flex min-w-0 items-center gap-1.5 text-[11px]">
                <Icon
                  className="size-3.5 shrink-0"
                  style={{ color: TONE_COLOR[item.tone] }}
                  aria-hidden
                />
                <span className="truncate font-medium text-ink">
                  {item.label}
                </span>
                <span className="ml-auto shrink-0 text-muted tabular">
                  {formatAgo(item.since, now).replace(" ago", "")}
                </span>
              </header>
              <p className="truncate text-xs text-ink-secondary">
                {item.kind !== "merge" && (
                  <span style={{ color: roleStyle(item.sourceType).color }}>
                    {roleStyle(item.sourceType).label} ·{" "}
                  </span>
                )}
                {item.title}
              </p>
              <p className="line-clamp-2 font-mono text-[11px] break-words text-ink">
                {item.detail}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                {answerable && (
                  <button
                    type="button"
                    onClick={() => onAnswer(item)}
                    className="rounded-md bg-status-warning px-2 py-0.5 text-xs font-medium text-page hover:brightness-110"
                  >
                    Answer
                  </button>
                )}
                {item.external && item.href && (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-ink ring-1 ring-hairline hover:bg-surface-raised"
                  >
                    Open PR
                    <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
                {focus && (
                  <button
                    type="button"
                    onClick={() => onFocus(focus)}
                    className="rounded-md px-2 py-0.5 text-xs text-ink-secondary ring-1 ring-hairline hover:bg-surface-raised hover:text-ink"
                  >
                    Show in graph
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
