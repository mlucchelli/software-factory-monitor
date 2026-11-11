"use client";

import { Check, Lock, Minus } from "lucide-react";
import type { StepState } from "@/lib/client/mission";
import { roleStyle } from "@/lib/client/present";
import { gateLetter, type WorkflowStage } from "@/lib/client/workflow";

type EdgeState = StepState | "waiting";

const EDGE_COLOR: Record<EdgeState, string> = {
  done: "color-mix(in srgb, var(--status-good) 55%, transparent)",
  current: "var(--axis)",
  waiting: "color-mix(in srgb, var(--status-warning) 45%, transparent)",
  upcoming: "transparent",
  skipped: "transparent",
};

const STATE_LABEL: Record<StepState, string> = {
  done: "Done",
  current: "In progress",
  upcoming: "Upcoming",
  skipped: "Skipped",
};

function edgeState(stage: WorkflowStage): EdgeState {
  if (stage.step.gate && stage.state === "current") {
    return "waiting";
  }
  return stage.state;
}

/** The track segment into a stage; it stretches, so a flowing comet has room to read. */
function TrackEdge({ state, order }: { state: EdgeState; order: number }) {
  const flowing = state === "current" || state === "waiting";
  const dashed = state === "upcoming" || state === "skipped";
  return (
    <span
      className={`relative mt-4 h-px min-w-1.5 flex-1 @3xl:mt-5 overflow-hidden ${
        dashed ? "border-t border-dashed border-axis" : ""
      }`}
      style={{ background: EDGE_COLOR[state] }}
      aria-hidden
    >
      {flowing && (
        <span
          className="comet"
          style={
            {
              "--comet":
                state === "waiting"
                  ? "var(--status-warning)"
                  : "var(--series-1)",
              "--comet-delay": `${order * 0.1}s`,
              "--comet-duration": "1.8s",
            } as React.CSSProperties
          }
        />
      )}
    </span>
  );
}

function StationIcon({ stage }: { stage: WorkflowStage }) {
  if (stage.state === "done") {
    return <Check className="size-3.5 text-status-good" aria-hidden />;
  }
  if (stage.state === "skipped") {
    return <Minus className="size-3.5 text-muted" aria-hidden />;
  }
  if (stage.state === "current") {
    const color = stage.waitingOnYou
      ? "var(--status-warning)"
      : "var(--series-1)";
    return (
      <span className="relative flex size-3">
        <span
          className={`absolute inset-0 rounded-full ${stage.waitingOnYou ? "motion-ripple" : "motion-breathe"}`}
          style={{ background: color }}
        />
        <span
          className="relative size-3 rounded-full"
          style={{ background: color }}
        />
      </span>
    );
  }
  return (
    <span className="font-mono text-[11px] text-muted">{stage.step.key}</span>
  );
}

function GateGlyph({ stage }: { stage: WorkflowStage }) {
  const waiting = stage.state === "current";
  const passed = stage.state === "done";
  const skipped = stage.state === "skipped";
  return (
    <span className="relative flex size-8 items-center justify-center @3xl:size-10">
      {waiting && (
        <span
          className="motion-ripple absolute inset-1.5 rotate-45 rounded-[5px] bg-status-warning @3xl:inset-2"
          aria-hidden
        />
      )}
      <span
        className={`absolute inset-1.5 rotate-45 rounded-[5px] transition-colors @3xl:inset-2 duration-300 ${
          waiting
            ? "bg-status-warning"
            : passed
              ? "bg-page ring-1 ring-status-good/70"
              : skipped
                ? "border border-dashed border-axis bg-page"
                : "bg-page ring-1 ring-axis"
        }`}
        aria-hidden
      />
      <span
        className={`relative text-[10px] font-semibold ${
          waiting ? "text-page" : passed ? "text-status-good" : "text-muted"
        }`}
      >
        {passed ? (
          <Check className="size-3" aria-hidden />
        ) : waiting ? (
          gateLetter(stage.step)
        ) : (
          <Lock className="size-2.5" aria-hidden />
        )}
      </span>
    </span>
  );
}

function RoleDots({ stage }: { stage: WorkflowStage }) {
  if (stage.groups.length === 0 && stage.tickets.length === 0) {
    return null;
  }
  return (
    <span className="flex items-center gap-1.5">
      {stage.groups.map((group) => (
        <span
          key={group.type}
          className="inline-flex items-center gap-0.5 text-[10px] text-muted tabular"
          title={`${group.agents.length} ${roleStyle(group.type).label}`}
        >
          <span
            className="size-1.5 rounded-full"
            style={{ background: roleStyle(group.type).color }}
            aria-hidden
          />
          {group.agents.length}
        </span>
      ))}
      {stage.tickets.length > 0 && (
        <span
          className="text-[10px] text-muted tabular"
          title={`${stage.tickets.length} tickets`}
        >
          ◆{stage.tickets.length}
        </span>
      )}
    </span>
  );
}

function stationLabel(stage: WorkflowStage): string {
  if (!stage.step.gate) {
    return stage.step.label;
  }
  return stage.state === "current" ? "Waiting on you" : stage.step.label;
}

function Station({
  stage,
  order,
  open,
  onToggle,
}: {
  stage: WorkflowStage;
  order: number;
  open: boolean;
  onToggle: () => void;
}) {
  const gate = stage.step.gate;
  const hasContent = stage.groups.length > 0 || stage.tickets.length > 0;
  const active = stage.state === "current";
  const emphasized = open || active;
  const name = `${stage.step.label} — ${
    gate && active ? "waiting on you" : STATE_LABEL[stage.state].toLowerCase()
  }`;
  const label = stationLabel(stage);

  const glyph = gate ? (
    <GateGlyph stage={stage} />
  ) : (
    <span
      className={`relative flex size-8 items-center justify-center rounded-full border @3xl:size-10 transition-[background-color,border-color,box-shadow] duration-300 ${
        stage.waitingOnYou
          ? "border-status-warning/70 bg-status-warning/10"
          : active
            ? "border-[var(--series-1)]/60 bg-surface-raised"
            : stage.state === "done"
              ? "border-status-good/40 bg-page"
              : `border-hairline bg-page ${stage.state === "skipped" ? "border-dashed" : ""}`
      } ${open ? "shadow-[0_0_0_4px_var(--grid)]" : ""} ${
        hasContent ? "group-hover/station:bg-surface-raised" : ""
      }`}
    >
      <StationIcon stage={stage} />
      {stage.running > 0 && (
        <span
          className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-good px-1 text-[10px] leading-none font-semibold text-page tabular"
          title={`${stage.running} running`}
        >
          {stage.running}
        </span>
      )}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={!hasContent}
      aria-pressed={hasContent ? open : undefined}
      aria-label={`${name}${hasContent ? (open ? ", showing only its runs" : ", show only its runs") : ""}`}
      title={name}
      data-station={stage.step.key}
      className="group/station relative flex w-8 shrink-0 flex-col @3xl:w-10 items-center enabled:cursor-pointer"
      style={{ "--i": order } as React.CSSProperties}
    >
      {glyph}
      <span
        className={`mt-1.5 text-[11px] whitespace-nowrap transition-colors ${
          gate && active
            ? "font-medium text-status-warning"
            : emphasized
              ? "font-medium text-ink"
              : stage.state === "done"
                ? "text-ink-secondary"
                : "text-muted"
        } ${stage.state === "skipped" ? "line-through decoration-axis" : ""} ${
          emphasized ? "" : "hidden @4xl:inline"
        } ${hasContent ? "group-hover/station:text-ink" : ""}`}
      >
        {label}
      </span>
      <span className="mt-1 hidden h-3 @3xl:flex">
        <RoleDots stage={stage} />
      </span>
    </button>
  );
}

export function PipelineTrack({
  stages,
  selected,
  onSelect,
}: {
  stages: WorkflowStage[];
  selected?: string;
  onSelect: (key: string | undefined) => void;
}) {
  return (
    <ol className="relative flex items-start px-1" aria-label="Pipeline stages">
      {stages.map((stage, order) => (
        <li
          key={stage.step.key}
          className={`flex items-start ${order === 0 ? "shrink-0" : "min-w-0 flex-1"}`}
        >
          {order > 0 && <TrackEdge state={edgeState(stage)} order={order} />}
          <Station
            stage={stage}
            order={order}
            open={selected === stage.step.key}
            onToggle={() =>
              onSelect(selected === stage.step.key ? undefined : stage.step.key)
            }
          />
        </li>
      ))}
    </ol>
  );
}
