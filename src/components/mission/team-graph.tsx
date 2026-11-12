"use client";

import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  History,
  Hourglass,
  type LucideIcon,
  Moon,
  UserRound,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ActivityEvent } from "@/lib/claude/types";
import { ciSummary } from "@/lib/client/mission";
import { formatAgo, roleStyle } from "@/lib/client/present";
import {
  HELPERS_SEAT,
  isWork,
  ORCHESTRATOR,
  type Packet,
  type PacketTone,
  packetFor,
  RUN_STATE_LABEL,
  type RunState,
  type Seat,
  seatKey,
  type Team,
  type TeamRun,
  YOU,
} from "@/lib/client/team";
import { InstanceRow, type NodeContext } from "./agent-node";
import { ChecksBadge, ContextGauge, NowLine } from "./metrics";

const HOP_MS = 800;
const FRESH_MS = 30_000;
const FOLD_MS = 8_000;
const REPLAY_MS = 10 * 60_000;
const REPLAY_GAP_MS = 900;
const SEAT_MIN_PX = 148;
const SEAT_GAP_PX = 12;

const PACKET_COLOR: Record<PacketTone, string> = {
  dispatch: "var(--series-1)",
  report: "var(--status-good)",
  reply: "var(--series-7)",
  warning: "var(--status-warning)",
  critical: "var(--status-critical)",
};

const STATE_ICON: Partial<Record<RunState, LucideIcon>> = {
  "waiting-tool": Hourglass,
  done: CircleCheck,
  failed: CircleX,
  changes: CircleAlert,
  idle: Moon,
};

const STATE_COLOR: Record<RunState, string> = {
  running: "var(--status-good)",
  "waiting-you": "var(--status-warning)",
  "waiting-tool": "var(--status-serious)",
  done: "var(--status-good)",
  failed: "var(--status-critical)",
  changes: "var(--status-serious)",
  idle: "var(--muted)",
};

export function StateGlyph({ state }: { state: RunState }) {
  if (state === "running" || state === "waiting-you") {
    return (
      <span className="relative flex size-2 shrink-0" aria-hidden>
        <span
          className={`absolute inset-0 rounded-full ${state === "running" ? "motion-breathe" : "motion-ripple"}`}
          style={{ background: STATE_COLOR[state] }}
        />
        <span
          className="relative size-2 rounded-full"
          style={{ background: STATE_COLOR[state] }}
        />
      </span>
    );
  }
  const Icon = STATE_ICON[state] ?? Moon;
  return (
    <Icon
      className="size-3 shrink-0"
      style={{ color: STATE_COLOR[state] }}
      aria-hidden
    />
  );
}

type Ping = { nonce: number; tone: PacketTone | "work" };

/**
 * Real traffic on the chart. Only events that arrive after the page opened
 * animate; the backfill is history, not traffic.
 */
function useTraffic(
  events: ActivityEvent[],
  team: Team,
  sessionSource: string | undefined,
) {
  const seen = useRef<Set<string> | null>(null);
  const lastUp = useRef(new Map<string, number>());
  const teamRef = useRef(team);
  teamRef.current = team;
  const [packets, setPackets] = useState<Packet[]>([]);
  const [pings, setPings] = useState<Map<string, Ping>>(new Map());
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const timer of timers.current) {
        window.clearTimeout(timer);
      }
    },
    [],
  );

  const play = useRef<(event: ActivityEvent, delay: number) => void>(() => {});
  play.current = (event, delay) => {
    if (!sessionSource) {
      return;
    }
    const later = (ms: number, run: () => void) => {
      timers.current.push(window.setTimeout(run, ms));
    };
    const ping = (key: string, tone: Ping["tone"]) =>
      setPings((current) =>
        new Map(current).set(key, { nonce: Math.random(), tone }),
      );
    const current = teamRef.current;
    if (isWork(event)) {
      const node =
        event.sourceId === sessionSource
          ? ORCHESTRATOR
          : current.visible.get(event.sourceId);
      if (node) {
        later(delay, () => ping(node, "work"));
      }
      return;
    }
    const found = packetFor(event, current, sessionSource);
    if (!found || found.hops.length === 0) {
      return;
    }
    const at = Date.now() + delay;
    const packet = { ...found, id: `${found.id}@${at}` };
    if (
      packet.direction === "up" &&
      packet.tone !== "warning" &&
      packet.tone !== "critical"
    ) {
      const fold = `${packet.origin}:${packet.tone === "reply" ? "reply" : "report"}`;
      const previous = lastUp.current.get(fold);
      lastUp.current.set(fold, at);
      if (previous && Math.abs(at - previous) < FOLD_MS) {
        return;
      }
    }
    const travel = packet.hops.length * HOP_MS;
    later(delay, () => setPackets((list) => [...list, packet]));
    later(delay + travel, () => ping(packet.target, packet.tone));
    later(delay + travel + 100, () =>
      setPackets((list) => list.filter((item) => item.id !== packet.id)),
    );
  };

  const replay = () => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const since = Date.now() - REPLAY_MS;
    const messages = events.filter(
      (event) =>
        Date.parse(event.ts) >= since &&
        !isWork(event) &&
        packetFor(event, teamRef.current, sessionSource ?? "") !== null,
    );
    lastUp.current.clear();
    messages.forEach((event, index) => {
      play.current(event, index * REPLAY_GAP_MS);
    });
    return messages.length;
  };

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(events.map((event) => event.id));
      return;
    }
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const now = Date.now();
    const known = seen.current;
    const fresh = events.filter((event) => !known.has(event.id));
    for (const event of fresh) {
      known.add(event.id);
    }
    if (reduced || !sessionSource) {
      return;
    }
    for (const event of fresh) {
      if (now - Date.parse(event.ts) <= FRESH_MS) {
        play.current(event, 0);
      }
    }
  }, [events, sessionSource]);

  return { packets, pings, replay };
}

interface Edge {
  key: string;
  d: string;
}

function measureEdges(root: HTMLElement, team: Team): Edge[] {
  const box = root.getBoundingClientRect();
  const rect = (key: string) =>
    root
      .querySelector<HTMLElement>(`[data-node="${key}"]`)
      ?.getBoundingClientRect();
  const edges: Edge[] = [];
  for (const [child, parent] of team.parents) {
    const from = rect(parent);
    const to = rect(child);
    if (!from || !to) {
      continue;
    }
    if (parent === YOU || parent === ORCHESTRATOR) {
      const x1 = from.left + from.width / 2 - box.left;
      const y1 = from.bottom - box.top;
      const x2 = to.left + to.width / 2 - box.left;
      const y2 = to.top - box.top;
      const bend = Math.max(10, (y2 - y1) / 2);
      edges.push({
        key: child,
        d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
      });
      continue;
    }
    const x = from.left + 10 - box.left;
    const y1 = from.bottom - box.top;
    const yMid = to.top + Math.min(18, to.height / 2) - box.top;
    const x2 = to.left - box.left;
    const radius = Math.min(8, Math.max(0, x2 - x), Math.max(0, yMid - y1));
    edges.push({
      key: child,
      d: `M ${x} ${y1} L ${x} ${yMid - radius} Q ${x} ${yMid}, ${x + radius} ${yMid} L ${x2} ${yMid}`,
    });
  }
  return edges;
}

function useEdges(root: React.RefObject<HTMLDivElement | null>, team: Team) {
  const [edges, setEdges] = useState<Edge[]>([]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) {
      return;
    }
    const measure = () => {
      const next = measureEdges(element, team);
      setEdges((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // The top of the chart is pinned while the seats scroll sideways.
    const scroller = element.parentElement;
    scroller?.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      scroller?.removeEventListener("scroll", measure);
    };
  });
  return edges;
}

function Landing({ ping }: { ping?: Ping }) {
  if (!ping) {
    return null;
  }
  if (ping.tone === "work") {
    return null;
  }
  return (
    <span
      key={ping.nonce}
      className="motion-land pointer-events-none absolute -inset-1 rounded-xl ring-2"
      style={
        { "--tw-ring-color": PACKET_COLOR[ping.tone] } as React.CSSProperties
      }
      aria-hidden
    />
  );
}

function WorkBlip({ ping, color }: { ping?: Ping; color: string }) {
  if (ping?.tone !== "work") {
    return null;
  }
  return (
    <span
      key={ping.nonce}
      className="motion-blip pointer-events-none absolute top-2.5 left-2.5 size-2 rounded-full"
      style={{ background: color }}
      aria-hidden
    />
  );
}

function RunNode({
  run,
  context,
  ping,
  stageFilter,
}: {
  run: TeamRun;
  context: NodeContext;
  ping?: Ping;
  stageFilter?: string;
}) {
  const { agent, state } = run;
  const role = roleStyle(agent.type);
  const selected =
    context.focus?.kind === "agent" && context.focus.id === agent.id;
  const live = state === "running";
  const waiting = state === "waiting-you";
  const recede =
    state === "idle" || state === "done" ? "opacity-60 hover:opacity-100" : "";
  const filtered = stageFilter !== undefined && run.stageKey !== stageFilter;
  const stage = ciSummary(agent, context.initiative, context.agents);
  const event = context.eventsBySource.get(agent.id)?.at(-1) ?? agent.lastEvent;

  return (
    <button
      type="button"
      data-node={agent.id}
      onClick={() => context.onFocus({ kind: "agent", id: agent.id })}
      aria-pressed={selected}
      className={`motion-rise relative grid w-full min-w-0 gap-1 rounded-lg border bg-surface px-2.5 py-2 text-left transition-[opacity,background-color] duration-300 ${
        selected
          ? "border-transparent ring-2 ring-[var(--node-color)]"
          : waiting
            ? "border-status-warning/70"
            : state === "failed"
              ? "border-status-critical/60"
              : state === "waiting-tool"
                ? "border-status-serious/60"
                : "border-hairline hover:bg-surface-raised"
      } ${filtered ? "opacity-25" : recede}`}
      style={
        {
          "--node-color": role.color,
          boxShadow:
            live || waiting ? `inset 2px 0 0 ${role.color}` : undefined,
        } as React.CSSProperties
      }
    >
      <Landing ping={ping} />
      <WorkBlip ping={ping} color={role.color} />
      {live && (
        <span
          className="absolute inset-x-0 top-0 h-px overflow-hidden"
          aria-hidden
        >
          <span
            className="comet"
            style={
              {
                "--comet": role.color,
                "--comet-duration": "2.2s",
              } as React.CSSProperties
            }
          />
        </span>
      )}
      {waiting && (
        <span
          className="motion-halo pointer-events-none absolute inset-0 rounded-lg ring-1 ring-status-warning ring-inset"
          aria-hidden
        />
      )}
      <span className="flex min-w-0 items-center gap-1.5 text-[11px]">
        <StateGlyph state={state} />
        <span
          className={
            waiting
              ? "font-medium text-status-warning"
              : live
                ? "text-ink"
                : "text-muted"
          }
        >
          {RUN_STATE_LABEL[state]}
        </span>
        <span className="ml-auto shrink-0 text-[10px] text-muted tabular">
          {formatAgo(agent.lastActivity, context.now)}
        </span>
      </span>
      <span
        className="line-clamp-2 text-xs leading-snug text-ink"
        title={agent.description ?? agent.id}
      >
        {agent.description ?? agent.id}
      </span>
      {(live || waiting || state === "waiting-tool") && (
        <NowLine event={event} live={live} />
      )}
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted">
        <span
          className="rounded bg-surface-raised px-1 py-px text-ink-secondary"
          title="Pipeline stage this run works in"
        >
          {run.stageLabel}
        </span>
        {agent.ticket && <span className="font-mono">{agent.ticket}</span>}
        {agent.round !== undefined && agent.mode === "review-pr" && (
          <span className="tabular">R{agent.round}</span>
        )}
        {stage?.pullRequest && (
          <ChecksBadge
            number={stage.pullRequest.number}
            checks={stage.pullRequest.checks}
          />
        )}
        {agent.usage && (
          <span className="ml-auto">
            <ContextGauge usage={agent.usage} />
          </span>
        )}
      </span>
    </button>
  );
}

function Branch({
  run,
  context,
  pings,
  stageFilter,
}: {
  run: TeamRun;
  context: NodeContext;
  pings: Map<string, Ping>;
  stageFilter?: string;
}) {
  return (
    <div className="grid gap-2">
      <RunNode
        run={run}
        context={context}
        ping={pings.get(run.agent.id)}
        stageFilter={stageFilter}
      />
      {run.helpers.length > 0 && (
        <div className="grid gap-2 pl-4">
          {run.helpers.map((helper) => (
            <Branch
              key={helper.agent.id}
              run={helper}
              context={context}
              pings={pings}
              stageFilter={stageFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function seatLabel(role: string): string {
  return role === HELPERS_SEAT ? "Helpers" : roleStyle(role).label;
}

function SeatColumn({
  seat,
  context,
  pings,
  stageFilter,
  index,
}: {
  seat: Seat;
  context: NodeContext;
  pings: Map<string, Ping>;
  stageFilter?: string;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const key = seatKey(seat.role);
  const role = roleStyle(seat.role === HELPERS_SEAT ? "other" : seat.role);
  const all = [...seat.shown, ...seat.earlier];
  const running = all.filter((run) => run.state === "running").length;
  const waiting = all.filter((run) => run.state === "waiting-you").length;
  const empty = all.length === 0;
  const working = running > 0 || waiting > 0;
  const focusInside =
    context.focus?.kind === "agent" &&
    seat.earlier.some(
      (run) =>
        context.focus?.kind === "agent" && run.agent.id === context.focus.id,
    );
  const expanded = open || focusInside;
  const filtered =
    stageFilter !== undefined &&
    !all.some((run) => run.stageKey === stageFilter);
  const ping = pings.get(key);

  return (
    <div
      className={`motion-rise grid min-w-0 content-start gap-2 transition-opacity duration-300 ${filtered ? "opacity-30" : ""}`}
      style={{ "--i": index } as React.CSSProperties}
    >
      <div
        data-node={key}
        className={`relative flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 ${
          empty
            ? "border-dashed border-hairline bg-page opacity-60"
            : waiting > 0
              ? "border-status-warning/60 bg-surface"
              : working
                ? "border-axis bg-surface-raised"
                : "border-hairline bg-surface"
        }`}
        style={{
          boxShadow: empty
            ? undefined
            : `inset 0 2px 0 ${working ? role.color : `color-mix(in srgb, ${role.color} 35%, transparent)`}`,
        }}
      >
        <Landing ping={ping} />
        <span
          className="size-2 shrink-0 rounded-full"
          style={{
            background: empty ? "transparent" : role.color,
            boxShadow: empty ? `inset 0 0 0 1px ${role.color}` : undefined,
          }}
          aria-hidden
        />
        <span className="grid min-w-0 flex-1">
          <span
            className={`truncate text-[13px] font-semibold ${working ? "text-ink" : "text-ink-secondary"}`}
          >
            {seatLabel(seat.role)}
          </span>
          <span className="truncate text-[11px] text-muted">
            {empty
              ? "No run yet"
              : [
                  waiting > 0 ? `${waiting} need you` : "",
                  running > 0 ? `${running} running` : "",
                  !working ? "idle" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
          </span>
        </span>
        {all.length > 1 && (
          <span
            className="shrink-0 rounded-full px-1.5 font-mono text-[10px] text-ink ring-1 ring-hairline tabular"
            title={`${all.length} runs in this seat`}
          >
            ×{all.length}
          </span>
        )}
      </div>
      {!empty && (
        <div className="grid gap-2 pl-5">
          {seat.shown.map((run) => (
            <Branch
              key={run.agent.id}
              run={run}
              context={context}
              pings={pings}
              stageFilter={stageFilter}
            />
          ))}
          {seat.earlier.length > 0 && (
            <div className="rounded-lg border border-hairline bg-page">
              <button
                type="button"
                onClick={() => setOpen(!expanded)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-muted hover:text-ink"
              >
                {seat.earlier.length} earlier run
                {seat.earlier.length === 1 ? "" : "s"}
                <ChevronDown
                  className={`ml-auto size-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>
              <div className="expand" data-open={expanded}>
                <div inert={!expanded}>
                  <ul className="grid max-h-72 gap-px overflow-y-auto border-t border-hairline p-1">
                    {seat.earlier.map((run) => (
                      <InstanceRow
                        key={run.agent.id}
                        agent={run.agent}
                        context={context}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function edgeStyle(
  key: string,
  seats: Seat[],
  runsById: Map<string, TeamRun>,
  attention: number,
  sessionRunning: boolean,
): { stroke: string; dash?: string; flow?: "down" | "up" } {
  const quiet = { stroke: "var(--axis)" };
  if (key === ORCHESTRATOR) {
    if (attention > 0) {
      return { stroke: "var(--status-warning)", flow: "up" };
    }
    return sessionRunning ? { stroke: "var(--series-7)", flow: "down" } : quiet;
  }
  if (key.startsWith("seat:")) {
    const seat = seats.find((candidate) => seatKey(candidate.role) === key);
    const runs = seat ? [...seat.shown, ...seat.earlier] : [];
    if (runs.length === 0) {
      return { stroke: "var(--grid)", dash: "3 4" };
    }
    if (runs.some((run) => run.state === "waiting-you")) {
      return { stroke: "var(--status-warning)", flow: "up" };
    }
    if (runs.some((run) => run.state === "running")) {
      return {
        stroke: roleStyle(seat?.role ?? "other").color,
        flow: "down",
      };
    }
    return quiet;
  }
  const run = runsById.get(key);
  if (!run) {
    return quiet;
  }
  if (run.state === "waiting-you") {
    return { stroke: "var(--status-warning)", flow: "up" };
  }
  if (run.state === "running") {
    return { stroke: roleStyle(run.agent.type).color, flow: "down" };
  }
  if (run.state === "waiting-tool") {
    return { stroke: "var(--status-serious)", dash: "2 3" };
  }
  return quiet;
}

export function TeamGraph({
  team,
  context,
  events,
  sessionSource,
  sessionRunning,
  attention,
  orchestrator,
  stageFilter,
}: {
  team: Team;
  context: NodeContext;
  events: ActivityEvent[];
  sessionSource?: string;
  sessionRunning: boolean;
  attention: number;
  orchestrator: ReactNode;
  stageFilter?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const edges = useEdges(root, team);
  const { packets, pings, replay } = useTraffic(events, team, sessionSource);
  const [replayed, setReplayed] = useState<number | null>(null);
  const startReplay = () => {
    const count = replay() ?? 0;
    setReplayed(count);
    window.setTimeout(
      () => setReplayed(null),
      Math.max(2500, count * REPLAY_GAP_MS + 1500),
    );
  };
  const edgeByKey = new Map(edges.map((edge) => [edge.key, edge]));
  const runsById = new Map<string, TeamRun>();
  const collect = (run: TeamRun) => {
    runsById.set(run.agent.id, run);
    run.helpers.forEach(collect);
  };
  for (const seat of team.seats) {
    seat.shown.forEach(collect);
  }

  // One row of seats at any width: a narrow pane scrolls sideways instead of
  // wrapping, because a second row puts cards under the edges of the first.
  const minWidth =
    team.seats.length * SEAT_MIN_PX + (team.seats.length - 1) * SEAT_GAP_PX;

  return (
    <div className="-m-1.5 overflow-x-auto p-1.5 [container-type:inline-size]">
      <div ref={root} className="relative" style={{ minWidth }}>
        <svg
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          aria-hidden
        >
          <title>Team edges and messages</title>
          {edges.map((edge) => {
            const style = edgeStyle(
              edge.key,
              team.seats,
              runsById,
              attention,
              sessionRunning,
            );
            return (
              <g key={edge.key}>
                <path
                  d={edge.d}
                  fill="none"
                  stroke={style.stroke}
                  strokeOpacity={style.flow ? 0.45 : 1}
                  strokeDasharray={style.dash}
                  strokeWidth={1}
                />
                {style.flow && (
                  <path
                    d={edge.d}
                    fill="none"
                    stroke={style.stroke}
                    strokeWidth={1.25}
                    strokeLinecap="round"
                    className={
                      style.flow === "up" ? "flow-dash-up" : "flow-dash-slow"
                    }
                  />
                )}
              </g>
            );
          })}
          {packets.flatMap((packet) =>
            packet.hops.flatMap((hop, index) => {
              const edge = edgeByKey.get(hop);
              if (!edge) {
                return [];
              }
              return [
                <PacketDot
                  key={`${packet.id}:${hop}`}
                  path={edge.d}
                  delay={index * HOP_MS}
                  up={packet.direction === "up"}
                  color={PACKET_COLOR[packet.tone]}
                />,
              ];
            }),
          )}
        </svg>

        <div className="relative flex flex-col items-center gap-7">
          {/* Stays centred in the visible pane while the seats scroll under it. */}
          <div className="sticky left-0 flex w-[100cqw] flex-col items-center gap-7 self-start">
            {sessionSource && (
              <button
                type="button"
                onClick={startReplay}
                disabled={replayed !== null}
                className="absolute top-0 right-0 z-10 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted ring-1 ring-hairline enabled:hover:bg-surface enabled:hover:text-ink motion-reduce:hidden"
                title="Play back the messages this team exchanged in the last 10 minutes"
              >
                <History className="size-3.5" aria-hidden />
                {replayed === null
                  ? "Replay last 10 min"
                  : replayed === 0
                    ? "No messages in 10 min"
                    : `Replaying ${replayed} message${replayed === 1 ? "" : "s"}`}
              </button>
            )}
            <div
              data-node={YOU}
              className={`relative flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
                attention > 0
                  ? "border-status-warning/70 bg-status-warning/10 text-status-warning"
                  : "border-hairline bg-surface text-ink-secondary"
              }`}
            >
              <Landing ping={pings.get(YOU)} />
              <UserRound className="size-3.5" aria-hidden />
              You
              {attention > 0 && (
                <span className="rounded-full bg-status-warning px-1.5 text-[10px] font-semibold text-page tabular">
                  {attention}
                </span>
              )}
            </div>
            <div data-node={ORCHESTRATOR} className="relative w-full max-w-3xl">
              <Landing ping={pings.get(ORCHESTRATOR)} />
              {orchestrator}
            </div>
          </div>
          <div
            className="grid w-full items-start"
            style={{
              gridTemplateColumns: `repeat(${team.seats.length}, minmax(0, 1fr))`,
              columnGap: SEAT_GAP_PX,
            }}
          >
            {team.seats.map((seat, index) => (
              <SeatColumn
                key={seat.role}
                seat={seat}
                context={context}
                pings={pings}
                stageFilter={stageFilter}
                index={index}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PacketDot({
  path,
  delay,
  up,
  color,
}: {
  path: string;
  delay: number;
  up: boolean;
  color: string;
}) {
  const motion = useRef<SVGAnimateMotionElement>(null);
  const fade = useRef<SVGAnimateElement>(null);
  useEffect(() => {
    motion.current?.beginElementAt(delay / 1000);
    fade.current?.beginElementAt(delay / 1000);
  }, [delay]);
  const duration = `${HOP_MS / 1000}s`;
  return (
    <g opacity={0}>
      <circle r={6} fill={color} opacity={0.25} />
      <circle r={3} fill={color} />
      <animateMotion
        ref={motion}
        begin="indefinite"
        dur={duration}
        path={path}
        keyPoints={up ? "1;0" : "0;1"}
        keyTimes="0;1"
        calcMode="linear"
        fill="freeze"
      />
      <animate
        ref={fade}
        attributeName="opacity"
        begin="indefinite"
        dur={duration}
        values="0;1;1;0"
        keyTimes="0;0.15;0.85;1"
        fill="remove"
      />
    </g>
  );
}
