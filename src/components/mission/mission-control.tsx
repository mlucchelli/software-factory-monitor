"use client";

import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  CircleCheck,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  crewAttention,
  crewRuns,
  findCrew,
  useMonitorData,
} from "@/components/shell/monitor-data";
import type { ActivityEvent } from "@/lib/claude/types";
import {
  ARCHIVE_EXPLANATION,
  ARCHIVE_LABEL,
  type ArchiveReason,
} from "@/lib/client/archive";
import {
  type AttentionItem,
  useAttentionNotifications,
} from "@/lib/client/attention";
import { useActivity } from "@/lib/client/hooks";
import type { Crew } from "@/lib/client/mission";
import { STAGE_STEPS } from "@/lib/client/pipeline";
import { TONE_COLOR } from "@/lib/client/present";
import { buildTeam } from "@/lib/client/team";
import { buildWorkflow } from "@/lib/client/workflow";
import { aboutRun } from "../chat/session-chat";
import type { Focus, NodeContext } from "./agent-node";
import { AttentionStrip } from "./attention-strip";
import { Conductor } from "./conductor";
import { FocusPanel } from "./focus-panel";
import { TeamGraph } from "./team-graph";
import { AnswerDialog } from "./terminal-actions";
import { TicketsPanel } from "./tickets-panel";
import { PipelineTrack } from "./workflow-graph";

const TICKER_EVENTS = 3;
const NO_ATTENTION: AttentionItem[] = [];

function groupEvents(events: ActivityEvent[]) {
  const bySource = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const list = bySource.get(event.sourceId) ?? [];
    list.push(event);
    bySource.set(event.sourceId, list.slice(-TICKER_EVENTS));
  }
  return bySource;
}

function TopBar({
  crew,
  attention,
  connected,
  notifications,
  ticketCounts,
  archive,
  onUnarchive,
}: {
  crew: Crew;
  attention: number;
  connected: boolean;
  notifications: ReturnType<typeof useAttentionNotifications>;
  ticketCounts: string[];
  archive?: ArchiveReason;
  onUnarchive?: () => void;
}) {
  const initiative = crew.initiative;
  const permission = notifications.permission;
  return (
    <header className="sticky top-0 z-30 flex h-12 min-w-0 items-center gap-3 border-b border-hairline bg-page/85 px-4 backdrop-blur">
      {initiative?.parentUrl ? (
        <a
          href={initiative.parentUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-ink-secondary hover:text-ink"
        >
          {crew.title}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        <span className="shrink-0 font-mono text-xs text-ink-secondary">
          {crew.title}
        </span>
      )}
      <h1 className="min-w-0 shrink truncate text-sm font-semibold tracking-tight">
        {initiative?.name ?? crew.subtitle ?? "Session"}
      </h1>
      {initiative?.phase && (
        <span
          className="hidden min-w-0 flex-1 truncate text-xs text-muted @3xl:block"
          title={initiative.phase}
        >
          {initiative.phase}
        </span>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-3 text-[11px] text-muted">
        {ticketCounts.length > 0 && (
          <span className="hidden tabular @5xl:inline">
            {ticketCounts.join(" · ")}
          </span>
        )}
        {archive && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-ink-secondary ring-1 ring-hairline"
            title={ARCHIVE_EXPLANATION[archive]}
          >
            <Archive className="size-3" aria-hidden />
            {archive === "manual" ? "" : "Archived · "}
            {ARCHIVE_LABEL[archive]}
            <span className="sr-only"> — {ARCHIVE_EXPLANATION[archive]}</span>
          </span>
        )}
        {onUnarchive && (
          <button
            type="button"
            onClick={onUnarchive}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted hover:bg-surface hover:text-ink"
            title="Move it back to Initiatives — only in this browser"
          >
            <ArchiveRestore className="size-3.5" aria-hidden />
            Unarchive
          </button>
        )}
        {attention === 0 && !archive && (
          <span className="hidden items-center gap-1 @2xl:inline-flex">
            <CircleCheck
              className="size-3.5"
              style={{ color: TONE_COLOR.good }}
              aria-hidden
            />
            Nothing waits on you
          </span>
        )}
        <span
          className="inline-flex items-center gap-1.5"
          title={connected ? "Streaming live activity" : "Reconnecting…"}
        >
          <span
            className="size-1.5 rounded-full"
            style={{
              background: connected
                ? "var(--status-good)"
                : "var(--status-critical)",
            }}
            aria-hidden
          />
          <span className="hidden @xl:inline">
            {connected ? "Live" : "Reconnecting"}
          </span>
        </span>
        {permission !== "unsupported" && (
          <button
            type="button"
            onClick={notifications.request}
            disabled={permission !== "default"}
            className="rounded-md p-1 text-muted enabled:hover:bg-surface enabled:hover:text-ink"
            aria-label={
              permission === "granted"
                ? "Notifications on"
                : permission === "denied"
                  ? "Notifications blocked in the browser"
                  : "Enable notifications"
            }
            title={
              permission === "granted"
                ? "Notifications on"
                : permission === "denied"
                  ? "Notifications blocked in the browser"
                  : "Enable notifications"
            }
          >
            {permission === "granted" ? (
              <Bell className="size-3.5" aria-hidden />
            ) : (
              <BellOff className="size-3.5" aria-hidden />
            )}
          </button>
        )}
      </span>
    </header>
  );
}

/**
 * An archived crew reads as one with no live session: its last runs and their
 * questions are history, not something waiting on you.
 */
function CrewView({ crew, openChat }: { crew: Crew; openChat: boolean }) {
  const { snapshot, now, crews, steps, archived, setArchivedByHand } =
    useMonitorData();
  const archive = archived.get(crew.key);
  const session = archive ? undefined : crew.session;
  const { events, connected } = useActivity(10);
  const [focus, setFocus] = useState<Focus | null>(
    openChat && session ? { kind: "session" } : null,
  );
  const [prefill, setPrefill] = useState<string | undefined>();
  const clearPrefill = useCallback(() => setPrefill(undefined), []);
  const hasSession = session !== undefined;
  useEffect(() => {
    if (openChat && hasSession) {
      setFocus({ kind: "session" });
    }
  }, [openChat, hasSession]);
  const [stageFilter, setStageFilter] = useState<string | undefined>();
  const [answering, setAnswering] = useState<AttentionItem | null>(null);
  const agents = useMemo(
    () => (archive ? [] : crewRuns(crew, crews)),
    [archive, crew, crews],
  );

  const attention = useMemo(
    () => (archive ? NO_ATTENTION : crewAttention(crew, crews, snapshot, now)),
    [archive, crew, crews, snapshot, now],
  );
  const notifications = useAttentionNotifications(attention);
  const waitingIds = useMemo(
    () => new Set(attention.map((item) => item.sourceId)),
    [attention],
  );
  const stages = useMemo(
    () => buildWorkflow(crew.initiative, agents, now, waitingIds, steps),
    [crew.initiative, agents, now, waitingIds, steps],
  );
  const team = useMemo(
    () =>
      buildTeam(agents, waitingIds, now, steps, crew.initiative?.phaseNumber),
    [agents, waitingIds, now, steps, crew.initiative?.phaseNumber],
  );
  const tickets = useMemo(
    () => stages.flatMap((stage) => stage.tickets),
    [stages],
  );
  const eventsBySource = useMemo(() => groupEvents(events), [events]);
  const onFocus = useCallback((next: Focus) => setFocus(next), []);
  const onClose = useCallback(() => setFocus(null), []);

  const ticketCounts = useMemo(() => {
    if (tickets.length === 0) {
      return [];
    }
    return [
      `${tickets.length} tickets`,
      ...STAGE_STEPS.flatMap((label, step) => {
        const count = tickets.filter(
          (ticket) => ticket.stage.step === step,
        ).length;
        return count > 0 ? [`${count} ${label.toLowerCase()}`] : [];
      }),
    ];
  }, [tickets]);

  const context: NodeContext = {
    agents,
    initiative: crew.initiative,
    eventsBySource,
    waitingIds,
    now,
    focus,
    onFocus,
  };
  const sessionPrompt = session
    ? attention.find((item) => item.sourceId === `session:${session.id}`)
    : undefined;
  const waitingGate = archive
    ? undefined
    : stages.find((stage) => stage.step.gate && stage.state === "current");
  const waitingCount = attention.length + (waitingGate ? 1 : 0);
  const filterLabel = stages.find((stage) => stage.step.key === stageFilter)
    ?.step.label;

  const orchestrator = session ? (
    <Conductor
      session={session}
      helpers={[]}
      events={eventsBySource.get(`session:${session.id}`) ?? []}
      now={now}
      selected={focus?.kind === "session"}
      waiting={sessionPrompt !== undefined}
      onFocus={onFocus}
      onAnswer={
        sessionPrompt?.answerable
          ? () => setAnswering(sessionPrompt)
          : undefined
      }
    />
  ) : archive ? (
    <p className="rounded-xl border border-dashed border-hairline bg-page px-3 py-2 text-center text-xs text-muted">
      Orchestrator — this initiative is archived ({ARCHIVE_LABEL[archive]}), so
      its runs are not shown. Pipeline and tickets come from the registry and
      Linear.
    </p>
  ) : (
    <p className="rounded-xl border border-dashed border-hairline bg-page px-3 py-2 text-center text-xs text-muted">
      Orchestrator — no session in the last 48 hours. Seats and pipeline come
      from the registry and Linear.
    </p>
  );

  return (
    <div className="flex min-h-dvh min-w-0">
      {answering && (
        <AnswerDialog
          key={answering.id}
          sessionId={answering.sourceId.slice("session:".length)}
          title={answering.title}
          onClose={() => setAnswering(null)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          crew={crew}
          attention={waitingCount}
          connected={connected}
          notifications={notifications}
          ticketCounts={ticketCounts}
          archive={archive}
          onUnarchive={
            archive === "manual"
              ? () => setArchivedByHand(crew.key, false)
              : undefined
          }
        />
        <div className="@container grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 p-4">
          <AttentionStrip
            items={attention}
            gate={waitingGate}
            now={now}
            onFocus={onFocus}
            onAnswer={setAnswering}
          />
          {crew.initiative && (
            <div className="grid gap-1">
              <PipelineTrack
                stages={stages}
                selected={stageFilter}
                onSelect={setStageFilter}
              />
              {filterLabel && (
                <p className="text-center text-[11px] text-muted">
                  Showing the runs working in {filterLabel}.{" "}
                  <button
                    type="button"
                    onClick={() => setStageFilter(undefined)}
                    className="underline hover:text-ink"
                  >
                    Show the whole team
                  </button>
                </p>
              )}
            </div>
          )}
          <TeamGraph
            team={team}
            context={context}
            events={events}
            sessionSource={session ? `session:${session.id}` : undefined}
            sessionRunning={session?.status === "running"}
            attention={waitingCount}
            orchestrator={orchestrator}
            stageFilter={stageFilter}
          />
          <TicketsPanel tickets={tickets} context={context} />
          <p className="text-[11px] text-muted">
            Costs are estimates from transcript token usage at list prices.
            Messages animate as they happen: blue down for a dispatch or your
            message, green up for a report, violet up for a reply to you, amber
            for anything that waits on you.
          </p>
        </div>
      </div>
      {focus && (
        <FocusPanel
          focus={focus}
          session={session}
          initiative={crew.initiative}
          now={now}
          waitingIds={waitingIds}
          onFocus={onFocus}
          onClose={onClose}
          prefill={prefill}
          onPrefillUsed={clearPrefill}
          onAnswerSession={
            sessionPrompt?.answerable
              ? () => setAnswering(sessionPrompt)
              : undefined
          }
          onAskAbout={(agent) => {
            setPrefill(aboutRun(agent));
            setFocus({ kind: "session" });
          }}
        />
      )}
    </div>
  );
}

export function MissionControl() {
  const { crews, archived, snapshot, error, initiativesLoaded } =
    useMonitorData();
  const searchParams = useSearchParams();
  const requested = searchParams.get("crew");
  const crew = findCrew(crews, requested, archived);

  if (error && !snapshot) {
    return (
      <p className="m-4 rounded-lg px-3 py-2 text-sm ring-1 ring-hairline">
        Snapshot failed: {error}
      </p>
    );
  }
  if (!snapshot || (!initiativesLoaded && crew?.key !== requested)) {
    return <p className="m-4 text-sm text-muted">Loading crews…</p>;
  }
  if (!crew) {
    return (
      <p className="m-4 rounded-xl border border-hairline bg-surface p-6 text-sm text-muted">
        No /initiative team in the last 48 hours.{" "}
        <Link href="/live" className="underline hover:text-ink">
          See every session
        </Link>
        .
      </p>
    );
  }
  return (
    <CrewView
      key={crew.key}
      crew={crew}
      openChat={searchParams.get("chat") === "1"}
    />
  );
}
