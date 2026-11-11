"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ActivityEvent } from "@/lib/claude/types";
import {
  formatAgo,
  formatClock,
  reportTone,
  roleStyle,
  type SourceInfo,
  sourceRole,
  TEAMS,
  TONE_COLOR,
  teamOf,
} from "@/lib/client/present";
import { Chip, eventIcon, eventLabel, RoleBadge, StatusPill } from "../ui";

const WINDOW_MS = 10 * 60_000;
const MINUTE_TICKS = 10;
const MAX_LANES = 16;

interface Lane {
  sourceId: string;
  events: ActivityEvent[];
  lastTs: string;
}

function markerShape(event: ActivityEvent, color: string): ReactNode {
  switch (event.kind) {
    case "report":
      return (
        <span
          className="block size-3 rotate-45 rounded-[2px] ring-2 ring-surface"
          style={{ background: TONE_COLOR[reportTone(event.reportStatus)] }}
        />
      );
    case "prompt":
      return (
        <span className="block size-2.5 rotate-45 border-2 border-ink-secondary bg-surface" />
      );
    case "text":
      return (
        <span
          className="block h-2 w-0.5 rounded-full opacity-60"
          style={{ background: color }}
        />
      );
    default:
      return (
        <span
          className="block h-5 w-0.5 rounded-full"
          style={{ background: color }}
        />
      );
  }
}

function Marker({
  event,
  color,
  position,
}: {
  event: ActivityEvent;
  color: string;
  position: number;
}) {
  const Icon = eventIcon(event);
  const tooltipSide = position > 60 ? "right-0" : "left-0";
  const onTop = event.kind === "report" || event.kind === "prompt";

  return (
    <button
      type="button"
      aria-label={`${eventLabel(event)}: ${event.summary}`}
      className={`group absolute top-1/2 flex h-6 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-[left] duration-1000 ease-linear focus:outline-none ${
        onTop ? "z-10" : ""
      }`}
      style={{ left: `${position}%` }}
    >
      {markerShape(event, color)}
      <span
        className={`pointer-events-none absolute bottom-full z-20 mb-2 hidden w-80 rounded-lg border border-hairline bg-surface-raised p-2.5 text-left shadow-xl group-hover:block group-focus:block ${tooltipSide}`}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
          <Icon className="size-3.5 text-ink-secondary" aria-hidden />
          {eventLabel(event)}
          <span className="ml-auto font-mono text-[11px] text-muted">
            {formatClock(event.ts)}
          </span>
        </span>
        <span className="mt-1 block break-words font-mono text-[11px] leading-relaxed text-ink-secondary">
          {event.summary}
        </span>
      </span>
    </button>
  );
}

function LaneLabel({
  source,
  lane,
  now,
}: {
  source?: SourceInfo;
  lane: Lane;
  now: number;
}) {
  const type =
    source?.type ??
    (lane.sourceId.startsWith("session:") ? "session" : "other");
  const content = (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center gap-2">
        <RoleBadge type={type} />
        {source?.ticket && <Chip>{source.ticket}</Chip>}
        <span className="ml-auto shrink-0 text-[11px] text-muted">
          {formatAgo(Date.parse(lane.lastTs), now)}
        </span>
      </div>
      <p className="truncate text-sm text-ink">
        {source?.title ?? lane.sourceId}
      </p>
      <div className="flex min-w-0 items-center gap-2">
        {source && (
          <StatusPill
            status={source.status}
            reportStatus={source.reportStatus}
          />
        )}
        <span className="truncate text-[11px] text-muted">
          {source?.project}
        </span>
      </div>
    </div>
  );
  return source?.href ? (
    <Link
      href={source.href}
      className="-m-1 block min-w-0 rounded-md p-1 hover:bg-surface-raised"
    >
      {content}
    </Link>
  ) : (
    content
  );
}

function tickPosition(minutesAgo: number): number {
  return ((MINUTE_TICKS - minutesAgo) / MINUTE_TICKS) * 100;
}

export function Swimlanes({
  events,
  sources,
  now,
}: {
  events: ActivityEvent[];
  sources: Map<string, SourceInfo>;
  now: number;
}) {
  const start = now - WINDOW_MS;
  const startIso = new Date(start).toISOString();

  const bySource = new Map<string, Lane>();
  for (const event of events) {
    if (event.ts < startIso) {
      continue;
    }
    const lane = bySource.get(event.sourceId) ?? {
      sourceId: event.sourceId,
      events: [],
      lastTs: event.ts,
    };
    lane.events.push(event);
    lane.lastTs = event.ts > lane.lastTs ? event.ts : lane.lastTs;
    bySource.set(event.sourceId, lane);
  }
  const lanes = [...bySource.values()]
    .sort((a, b) => b.lastTs.localeCompare(a.lastTs))
    .slice(0, MAX_LANES);

  if (lanes.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted">
        No agent activity in the last 10 minutes. Lanes appear as soon as a
        session or sub-agent calls a tool.
      </p>
    );
  }

  const ticks = Array.from(
    { length: MINUTE_TICKS + 1 },
    (_, index) => MINUTE_TICKS - index,
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[260px_1fr] gap-4 pb-1">
          <span />
          <div className="relative h-4 text-[10px] text-muted tabular">
            {ticks.map((minutesAgo) => (
              <span
                key={minutesAgo}
                className={`absolute ${
                  minutesAgo === 0
                    ? "-translate-x-full"
                    : minutesAgo === MINUTE_TICKS
                      ? ""
                      : "-translate-x-1/2"
                }`}
                style={{ left: `${tickPosition(minutesAgo)}%` }}
              >
                {minutesAgo === 0 ? "now" : `-${minutesAgo}m`}
              </span>
            ))}
          </div>
        </div>

        {TEAMS.map((team) => {
          const teamLanes = lanes.filter(
            (lane) =>
              teamOf(
                sources.get(lane.sourceId)?.type ??
                  sourceRole(lane.events[0], sources),
              ).key === team.key,
          );
          if (teamLanes.length === 0) {
            return null;
          }
          const runningInTeam = teamLanes.filter(
            (lane) => sources.get(lane.sourceId)?.status === "running",
          ).length;
          return (
            <section key={team.key} className="mt-3 first:mt-1">
              <h3 className="flex items-baseline gap-2 border-t border-axis pt-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                {team.label}
                <span className="font-normal normal-case tracking-normal text-muted">
                  {runningInTeam} running · {teamLanes.length} active
                </span>
              </h3>
              {teamLanes.map((lane) => {
                const source = sources.get(lane.sourceId);
                const role = roleStyle(
                  source?.type ?? sourceRole(lane.events[0], sources),
                );
                const running = source?.status === "running";
                return (
                  <div
                    key={lane.sourceId}
                    className="grid grid-cols-[260px_1fr] items-center gap-4 border-t border-hairline py-2"
                  >
                    <LaneLabel source={source} lane={lane} now={now} />
                    <div className="relative h-12">
                      {ticks.map((minutesAgo) => (
                        <span
                          key={minutesAgo}
                          className="absolute inset-y-0 w-px bg-grid"
                          style={{ left: `${tickPosition(minutesAgo)}%` }}
                        />
                      ))}
                      <span
                        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 opacity-40"
                        style={{ background: role.color }}
                      />
                      {running && (
                        <span
                          className="lane-sweep absolute right-0 top-1/2 h-6 w-24 -translate-y-1/2 rounded-full"
                          style={{
                            background: `linear-gradient(to left, ${role.color}, transparent)`,
                          }}
                        />
                      )}
                      {lane.events.map((event) => (
                        <Marker
                          key={event.id}
                          event={event}
                          color={role.color}
                          position={Math.min(
                            100,
                            Math.max(
                              0,
                              ((Date.parse(event.ts) - start) / WINDOW_MS) *
                                100,
                            ),
                          )}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
