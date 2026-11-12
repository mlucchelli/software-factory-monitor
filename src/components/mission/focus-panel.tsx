"use client";

import {
  ArrowUpRight,
  ExternalLink,
  GitBranch,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentInfo, SessionInfo } from "@/lib/claude/types";
import { ciSummary, helpersOf } from "@/lib/client/mission";
import { ticketStage } from "@/lib/client/pipeline";
import {
  formatAgo,
  humanizeStatus,
  roleStyle,
  SESSION_ROLE,
  TONE_COLOR,
} from "@/lib/client/present";
import type { Initiative } from "@/lib/initiatives";
import { AgentConversation, SessionChat } from "../chat/session-chat";
import { Chip, RoleBadge } from "../ui";
import { type Focus, RunGlyph } from "./agent-node";
import { ChecksBadge, Metrics } from "./metrics";

const WIDE_KEY = "agents-monitor:panel-wide";

/** Whether the panel is widened for reading a conversation; remembered per browser. */
function useWidePanel() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    try {
      setWide(window.localStorage.getItem(WIDE_KEY) === "1");
    } catch {}
  }, []);
  const toggleWide = () =>
    setWide((current) => {
      try {
        window.localStorage.setItem(WIDE_KEY, current ? "0" : "1");
      } catch {}
      return !current;
    });
  return { wide, toggleWide };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
        {label}
      </dt>
      <dd className="min-w-0 text-xs text-ink-secondary">{children}</dd>
    </div>
  );
}

function AgentBody({
  agent,
  session,
  initiative,
  now,
  waiting,
  onFocus,
  onAskAbout,
}: {
  agent: AgentInfo;
  session: SessionInfo;
  initiative?: Initiative;
  now: number;
  waiting: boolean;
  onFocus: (focus: Focus) => void;
  onAskAbout?: (agent: AgentInfo) => void;
}) {
  const stage = ciSummary(agent, initiative, session.agents);
  const helpers = helpersOf(agent, session.agents);
  const parent = session.agents.find((other) => other.id === agent.parentId);
  const report = agent.status === "reported" ? agent.report : undefined;
  return (
    <>
      <div className="grid max-h-[38%] shrink-0 gap-3 overflow-y-auto border-b border-hairline px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {agent.mode && <Chip>{agent.mode}</Chip>}
          {agent.ticket && <Chip>{agent.ticket}</Chip>}
          {agent.model && <Chip>{agent.model}</Chip>}
          {agent.branch && (
            <span className="inline-flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted">
              <GitBranch className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{agent.branch}</span>
            </span>
          )}
        </div>
        <Metrics
          usage={agent.usage}
          running={agent.status === "running"}
          lastActivity={agent.lastActivity}
          now={now}
        >
          <span>last activity {formatAgo(agent.lastActivity, now)}</span>
        </Metrics>
        <dl className="grid gap-3">
          {waiting && agent.pending && (
            <Field label="Waiting on you">
              <span className="font-mono text-ink">
                {agent.pending.summary}
              </span>
            </Field>
          )}
          {report && (
            <Field
              label={`Report · ${humanizeStatus(report.status ?? "unknown")}`}
            >
              <p className="line-clamp-6 whitespace-pre-wrap">
                {report.summary ?? report.raw}
              </p>
              {report.questions && (
                <p className="mt-2 font-mono whitespace-pre-wrap text-ink">
                  {report.questions}
                </p>
              )}
            </Field>
          )}
          {stage && (
            <Field label="Ticket">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className="size-1.5 rounded-full"
                  style={{ background: TONE_COLOR[stage.tone] }}
                  aria-hidden
                />
                {stage.label}
                {stage.pullRequest && (
                  <a
                    href={stage.pullRequest.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted hover:text-ink"
                  >
                    <ChecksBadge
                      number={stage.pullRequest.number}
                      checks={stage.pullRequest.checks}
                    />
                  </a>
                )}
              </span>
            </Field>
          )}
          {(parent || helpers.length > 0) && (
            <Field label="Related runs">
              <ul className="grid gap-1">
                {parent && (
                  <li>
                    <button
                      type="button"
                      onClick={() => onFocus({ kind: "agent", id: parent.id })}
                      className="text-left hover:text-ink"
                    >
                      ↑ {roleStyle(parent.type).label} ·{" "}
                      {parent.description ?? parent.id}
                    </button>
                  </li>
                )}
                {helpers.map((helper) => (
                  <li key={helper.id}>
                    <button
                      type="button"
                      onClick={() => onFocus({ kind: "agent", id: helper.id })}
                      className="flex min-w-0 items-center gap-1.5 text-left hover:text-ink"
                    >
                      <RunGlyph agent={helper} waiting={false} />
                      <span className="truncate">
                        {helper.type} · {helper.description ?? helper.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Field>
          )}
        </dl>
      </div>
      <AgentConversation
        key={agent.id}
        agent={agent}
        session={session}
        onAskOrchestrator={
          onAskAbout && session.live?.tmuxPane
            ? () => onAskAbout(agent)
            : undefined
        }
      />
    </>
  );
}

function TicketBody({
  identifier,
  initiative,
  runs,
  onFocus,
  now,
}: {
  identifier: string;
  initiative?: Initiative;
  runs: AgentInfo[];
  onFocus: (focus: Focus) => void;
  now: number;
}) {
  const issue = initiative?.children.find(
    (child) => child.identifier === identifier,
  );
  if (!issue) {
    return <p className="p-4 text-sm text-muted">Ticket not found.</p>;
  }
  const agents = runs
    .filter((agent) => agent.ticket === identifier)
    .sort((a, b) => b.lastActivity - a.lastActivity);
  const stage = ticketStage(issue, agents);
  return (
    <div className="grid content-start gap-4 overflow-y-auto px-4 py-3">
      <p className="text-sm text-ink">{issue.title}</p>
      <dl className="grid gap-3">
        <Field label="Where it is">
          <span className="flex items-center gap-2">
            <span
              className="size-1.5 rounded-full"
              style={{ background: TONE_COLOR[stage.tone] }}
              aria-hidden
            />
            {stage.label}
            <span className="text-muted">· waiting on {stage.waitingOn}</span>
          </span>
        </Field>
        <Field label="Linear">
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            {issue.state.name}
            <ExternalLink className="size-3" aria-hidden />
          </a>
        </Field>
        {issue.pullRequests.length > 0 && (
          <Field label="Pull requests">
            <ul className="grid gap-1">
              {issue.pullRequests.map((pullRequest) => (
                <li key={pullRequest.url}>
                  <a
                    href={pullRequest.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 hover:text-ink"
                  >
                    <ChecksBadge
                      number={pullRequest.number}
                      checks={pullRequest.checks}
                    />
                    <span className="truncate">
                      {pullRequest.repository} · {pullRequest.state}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Field>
        )}
        <Field label={`Runs on this ticket · ${agents.length}`}>
          <ul className="grid gap-1">
            {agents.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  onClick={() => onFocus({ kind: "agent", id: agent.id })}
                  className="flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-raised hover:text-ink"
                >
                  <RunGlyph agent={agent} waiting={false} />
                  <span style={{ color: roleStyle(agent.type).color }}>
                    {roleStyle(agent.type).label}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {agent.mode ?? ""} {agent.description}
                  </span>
                  <span className="shrink-0 text-muted tabular">
                    {formatAgo(agent.lastActivity, now)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Field>
      </dl>
    </div>
  );
}

/**
 * Details on demand beside the graph: the graph stays visible, so the context of
 * which stage a run belongs to is never lost.
 */
export function FocusPanel({
  focus,
  session,
  initiative,
  now,
  waitingIds,
  onFocus,
  onClose,
  prefill,
  onPrefillUsed,
  onAnswerSession,
  onAskAbout,
}: {
  focus: Focus;
  session?: SessionInfo;
  initiative?: Initiative;
  now: number;
  waitingIds: Set<string>;
  onFocus: (focus: Focus) => void;
  onClose: () => void;
  prefill?: string;
  onPrefillUsed?: () => void;
  onAnswerSession?: () => void;
  onAskAbout?: (agent: AgentInfo) => void;
}) {
  const { wide, toggleWide } = useWidePanel();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const agent =
    focus.kind === "agent"
      ? session?.agents.find((candidate) => candidate.id === focus.id)
      : undefined;
  const type =
    focus.kind === "session" ? SESSION_ROLE : (agent?.type ?? "other");
  const title =
    focus.kind === "session"
      ? (session?.title ?? "Orchestrator")
      : focus.kind === "ticket"
        ? focus.identifier
        : (agent?.description ?? agent?.id ?? "Run not found");
  const color =
    focus.kind === "ticket" ? "var(--ink-secondary)" : roleStyle(type).color;

  return (
    <aside
      key={focus.kind === "agent" ? focus.id : focus.kind}
      className={`motion-slide-in fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-hairline bg-page shadow-2xl shadow-black/60 transition-[width] duration-300 ease-out motion-reduce:transition-none @min-[60rem]:sticky @min-[60rem]:top-0 @min-[60rem]:z-auto @min-[60rem]:h-dvh @min-[60rem]:max-w-none @min-[60rem]:shrink-0 @min-[60rem]:shadow-none ${
        wide
          ? "max-w-[min(100%,820px)] @min-[60rem]:w-[min(820px,62cqw)]"
          : "max-w-[480px] @min-[60rem]:w-[400px] @7xl:w-[460px]"
      }`}
      aria-label="Details"
    >
      <header
        className="flex min-w-0 items-start gap-2 border-b border-hairline px-4 py-3"
        style={{ boxShadow: `inset 0 2px 0 ${color}` }}
      >
        <div className="grid min-w-0 flex-1 gap-1">
          <div className="flex min-w-0 items-center gap-2">
            {focus.kind === "ticket" ? (
              <span className="text-[11px] font-medium text-ink-secondary">
                Ticket
              </span>
            ) : (
              <RoleBadge type={type} />
            )}
            {agent && (
              <span className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
                <RunGlyph agent={agent} waiting={waitingIds.has(agent.id)} />
                {waitingIds.has(agent.id)
                  ? "Needs you"
                  : agent.status === "reported" && agent.report?.status
                    ? humanizeStatus(agent.report.status)
                    : agent.status === "running"
                      ? "Running"
                      : "Idle"}
              </span>
            )}
          </div>
          <h2 className="text-sm leading-snug font-semibold" title={title}>
            {title}
          </h2>
        </div>
        {agent && (
          <Link
            href={`/agents/${agent.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-secondary ring-1 ring-hairline hover:bg-surface hover:text-ink"
          >
            Full page
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        )}
        {focus.kind !== "ticket" && (
          <button
            type="button"
            onClick={toggleWide}
            className="shrink-0 rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
            aria-label={wide ? "Narrow the panel" : "Widen the panel"}
            aria-pressed={wide}
            title={wide ? "Narrow the panel" : "Widen the panel for reading"}
          >
            {wide ? (
              <Minimize2 className="size-4" aria-hidden />
            ) : (
              <Maximize2 className="size-4" aria-hidden />
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
          aria-label="Close details"
          title="Close  Esc"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      {focus.kind === "session" && session && (
        <>
          <div className="border-b border-hairline px-4 py-3">
            <Metrics
              usage={session.usage}
              running={session.status === "running"}
              lastActivity={session.lastActivity}
              now={now}
            >
              {session.live?.tmuxPane && (
                <span>tmux {session.live.tmuxPane}</span>
              )}
            </Metrics>
          </div>
          <SessionChat
            key={session.id}
            session={session}
            prefill={prefill}
            onPrefillUsed={onPrefillUsed}
            onAnswer={onAnswerSession}
          />
        </>
      )}
      {focus.kind === "agent" &&
        (agent && session ? (
          <AgentBody
            agent={agent}
            session={session}
            initiative={initiative}
            now={now}
            waiting={waitingIds.has(agent.id)}
            onFocus={onFocus}
            onAskAbout={onAskAbout}
          />
        ) : (
          <p className="p-4 text-sm text-muted">
            This run is no longer in the snapshot.
          </p>
        ))}
      {focus.kind === "ticket" && (
        <TicketBody
          identifier={focus.identifier}
          initiative={initiative}
          runs={session?.agents ?? []}
          onFocus={onFocus}
          now={now}
        />
      )}
    </aside>
  );
}
