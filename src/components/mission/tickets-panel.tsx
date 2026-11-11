"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { STAGE_STEPS } from "@/lib/client/pipeline";
import { TONE_COLOR } from "@/lib/client/present";
import type { TicketToken } from "@/lib/client/workflow";
import type { NodeContext } from "./agent-node";
import { ChecksBadge } from "./metrics";

const STORAGE_KEY = "agents-monitor:tickets-open";

function TicketChip({
  ticket,
  context,
  index,
}: {
  ticket: TicketToken;
  context: NodeContext;
  index: number;
}) {
  const { stage, issue } = ticket;
  const yours = stage.waitingOn === "you";
  const selected =
    context.focus?.kind === "ticket" &&
    context.focus.identifier === issue.identifier;
  return (
    <li className="motion-rise" style={{ "--i": index } as React.CSSProperties}>
      <button
        type="button"
        onClick={() =>
          context.onFocus({ kind: "ticket", identifier: issue.identifier })
        }
        aria-pressed={selected}
        className={`grid w-full min-w-0 gap-0.5 rounded-md border px-2 py-1.5 text-left transition-colors ${
          selected
            ? "border-transparent bg-surface-raised ring-2 ring-ink/60"
            : yours
              ? "border-status-warning/50 bg-status-warning/5 hover:bg-status-warning/10"
              : "border-hairline hover:bg-surface-raised"
        }`}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: TONE_COLOR[stage.tone] }}
            aria-hidden
          />
          <span className="shrink-0 font-mono text-ink-secondary">
            {issue.identifier}
          </span>
          <span className="min-w-0 truncate text-ink">{issue.title}</span>
          {stage.pullRequest && (
            <span className="ml-auto shrink-0 text-muted">
              <ChecksBadge
                number={stage.pullRequest.number}
                checks={stage.pullRequest.checks}
              />
            </span>
          )}
        </span>
        <span
          className={`truncate text-[11px] ${yours ? "text-status-warning" : "text-muted"}`}
        >
          {stage.label}
        </span>
      </button>
    </li>
  );
}

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The initiative's tickets, folded to one summary line so the team keeps the room. */
export function TicketsPanel({
  tickets,
  context,
}: {
  tickets: TicketToken[];
  context: NodeContext;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(readOpen()), []);
  const focused = context.focus?.kind === "ticket";
  const expanded = open || focused;

  if (tickets.length === 0) {
    return null;
  }
  const toggle = () => {
    const next = !expanded;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {}
  };
  const sorted = [...tickets].sort(
    (a, b) =>
      Number(b.stage.waitingOn === "you") -
        Number(a.stage.waitingOn === "you") || b.stage.step - a.stage.step,
  );
  const counts = STAGE_STEPS.map(
    (_, step) => tickets.filter((ticket) => ticket.stage.step === step).length,
  );
  const yours = tickets.filter(
    (ticket) => ticket.stage.waitingOn === "you",
  ).length;

  return (
    <section
      className="rounded-xl border border-hairline bg-surface"
      aria-label="Tickets"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls="tickets-list"
        className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left"
      >
        <span className="text-[13px] font-semibold">Tickets</span>
        <span className="text-xs text-ink-secondary tabular">
          {tickets.length}
        </span>
        <span className="flex min-w-0 flex-wrap gap-x-3 text-[11px] text-muted tabular">
          {STAGE_STEPS.map((label, step) =>
            counts[step] > 0 ? (
              <span key={label}>
                <span className="text-ink">{counts[step]}</span>{" "}
                {label.toLowerCase()}
              </span>
            ) : null,
          )}
        </span>
        {yours > 0 && (
          <span className="rounded-full bg-status-warning px-2 text-[11px] font-medium text-page">
            {yours} waiting on you
          </span>
        )}
        <ChevronDown
          className={`ml-auto size-4 text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <div className="expand" data-open={expanded} id="tickets-list">
        <div inert={!expanded}>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,280px),1fr))] gap-1.5 border-t border-hairline p-2">
            {sorted.map((ticket, index) => (
              <TicketChip
                key={ticket.issue.identifier}
                ticket={ticket}
                context={context}
                index={index}
              />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
