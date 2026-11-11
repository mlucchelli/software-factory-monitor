"use client";

import {
  ChevronRight,
  CircleAlert,
  ExternalLink,
  GitPullRequest,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AgentInfo, SessionInfo, Snapshot } from "@/lib/claude/types";
import { ARCHIVE_LABEL, type ArchiveReason } from "@/lib/client/archive";
import { collectAttention } from "@/lib/client/attention";
import {
  STAGE_STEPS,
  type TicketStage,
  ticketStage,
  type WaitingOn,
} from "@/lib/client/pipeline";
import {
  ATTENTION_STATUSES,
  formatAgo,
  humanizeStatus,
  TONE_COLOR,
} from "@/lib/client/present";
import type { Initiative, TrackerIssue } from "@/lib/initiatives";
import { NeedsYouPanel } from "../needs-you-panel";
import { Chip, eventIcon, Panel, RoleBadge, StatusPill } from "../ui";

const NO_RELEASE = "Unscheduled";

function needsAttention(agent: AgentInfo): boolean {
  return (
    agent.status === "reported" &&
    agent.report?.status !== undefined &&
    ATTENTION_STATUSES.has(agent.report.status)
  );
}

function TreeList({ children }: { children: ReactNode }) {
  return (
    <ul className="ml-2.5 flex flex-col border-l border-axis pl-0">
      {children}
    </ul>
  );
}

function TreeItem({ children }: { children: ReactNode }) {
  return (
    <li className="relative min-w-0 pl-5 before:absolute before:left-0 before:top-[1.35rem] before:h-px before:w-4 before:bg-axis">
      {children}
    </li>
  );
}

function AgentBranch({
  agent,
  childrenOf,
  now,
}: {
  agent: AgentInfo;
  childrenOf: Map<string, AgentInfo[]>;
  now: number;
}) {
  const children = childrenOf.get(agent.id) ?? [];
  const attention = needsAttention(agent);
  const Icon = agent.lastEvent ? eventIcon(agent.lastEvent) : null;

  return (
    <TreeItem>
      <Link
        href={`/agents/${agent.id}`}
        className={`my-1 grid min-w-0 gap-1 rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-raised ${
          attention ? "ring-1" : ""
        }`}
        style={
          attention
            ? { boxShadow: `inset 0 0 0 1px ${TONE_COLOR.warning}` }
            : undefined
        }
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <RoleBadge type={agent.type} />
          <span className="min-w-0 flex-1 truncate text-sm text-ink">
            {agent.description ?? agent.id}
          </span>
          {agent.mode && <Chip>{agent.mode}</Chip>}
          <StatusPill
            status={agent.status}
            reportStatus={agent.report?.status}
          />
          <span className="w-14 text-right text-[11px] text-muted">
            {formatAgo(agent.lastActivity, now)}
          </span>
        </div>
        {attention && agent.report?.questions && (
          <p className="flex min-w-0 items-start gap-1.5 text-xs text-ink">
            <CircleAlert
              className="mt-0.5 size-3.5 shrink-0"
              style={{ color: TONE_COLOR.warning }}
              aria-hidden
            />
            <span className="line-clamp-2 break-words">
              {humanizeStatus(agent.report.status ?? "")}:{" "}
              {agent.report.questions}
            </span>
          </p>
        )}
        {agent.lastEvent && Icon && (
          <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
            <Icon className="size-3 shrink-0" aria-hidden />
            <span className="truncate font-mono">
              {agent.lastEvent.summary}
            </span>
          </p>
        )}
      </Link>
      {children.length > 0 && (
        <TreeList>
          {children.map((child) => (
            <AgentBranch
              key={child.id}
              agent={child}
              childrenOf={childrenOf}
              now={now}
            />
          ))}
        </TreeList>
      )}
    </TreeItem>
  );
}

const WAITING_LABEL: Record<WaitingOn, string> = {
  you: "Waiting on you",
  "tech lead": "Waiting on the tech lead",
  developer: "Waiting on the developer",
  CI: "Waiting on CI",
  dependency: "Waiting on a dependency",
  orchestrator: "Waiting on the orchestrator",
  nobody: "Done",
};

function StageRow({ stage }: { stage: TicketStage }) {
  const currentColor =
    stage.tone === "neutral" ? "var(--ink)" : TONE_COLOR[stage.tone];
  const checks = stage.pullRequest?.checks;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
      <ol
        className="flex items-center"
        aria-label={`Stage ${STAGE_STEPS[stage.step]}`}
      >
        {STAGE_STEPS.map((name, index) => (
          <li key={name} className="flex items-center" title={name}>
            {index > 0 && (
              <span
                className={`h-px w-4 ${index <= stage.step ? "bg-ink-secondary" : "bg-axis"}`}
              />
            )}
            <span
              className={`block rounded-full ${index === stage.step ? "size-3 ring-2 ring-surface" : "size-2"} ${
                index < stage.step ? "bg-ink-secondary" : ""
              } ${index > stage.step ? "bg-axis" : ""}`}
              style={
                index === stage.step ? { background: currentColor } : undefined
              }
            />
          </li>
        ))}
      </ol>
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {STAGE_STEPS[stage.step]}
      </span>
      <span className="text-xs text-ink">{stage.label}</span>
      {stage.waitingOn !== "nobody" && (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-hairline ${
            stage.waitingOn === "you"
              ? "font-semibold text-ink"
              : "text-ink-secondary"
          }`}
        >
          <span
            className="size-1.5 rounded-full"
            style={{
              background:
                stage.waitingOn === "you" ? TONE_COLOR.warning : "var(--muted)",
            }}
            aria-hidden
          />
          {WAITING_LABEL[stage.waitingOn]}
        </span>
      )}
      {checks && (
        <span className="text-[11px] text-muted tabular">
          CI {checks.passed} passed
          {checks.failing > 0 && ` · ${checks.failing} failing`}
          {checks.pending > 0 && ` · ${checks.pending} running`}
        </span>
      )}
    </div>
  );
}

function IssueBranch({
  issue,
  agents,
  childrenOf,
  now,
}: {
  issue: TrackerIssue;
  agents: AgentInfo[];
  childrenOf: Map<string, AgentInfo[]>;
  now: number;
}) {
  const repo = /^\[([^\]]+)\]/.exec(issue.title)?.[1];
  const title = issue.title
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^R\d+\s*·\s*/, "");
  const running = agents.some((agent) => agent.status === "running");

  return (
    <TreeItem>
      <div className="my-1 grid min-w-0 gap-1.5 rounded-lg border border-hairline bg-page/40 px-3 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-xs text-ink hover:underline"
          >
            {issue.identifier}
            <ExternalLink className="size-3 text-muted" aria-hidden />
          </a>
          {repo && <Chip>{repo}</Chip>}
          <span className="rounded-full px-2 py-0.5 text-[11px] text-ink-secondary ring-1 ring-hairline">
            {issue.state.name}
          </span>
          {issue.pullRequests.map((pullRequest) => (
            <a
              key={pullRequest.url}
              href={pullRequest.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary ring-1 ring-hairline hover:text-ink"
            >
              <GitPullRequest className="size-3" aria-hidden />#
              {pullRequest.number}
              <span className="text-muted">
                {pullRequest.isDraft ? "draft" : pullRequest.state}
              </span>
            </a>
          ))}
          <span className="ml-auto text-[11px] text-muted">
            {agents.length === 0
              ? "no agent yet"
              : `${agents.length} agent${agents.length > 1 ? "s" : ""}${running ? " · working" : ""}`}
          </span>
        </div>
        <p className="break-words text-sm text-ink-secondary">{title}</p>
        <StageRow stage={ticketStage(issue, agents)} />
      </div>
      {agents.length > 0 && (
        <TreeList>
          {agents.map((agent) => (
            <AgentBranch
              key={agent.id}
              agent={agent}
              childrenOf={childrenOf}
              now={now}
            />
          ))}
        </TreeList>
      )}
    </TreeItem>
  );
}

function GroupBranch({
  title,
  caption,
  defaultOpen,
  children,
}: {
  title: string;
  caption: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  return (
    <TreeItem>
      <details open={defaultOpen} className="group/branch">
        <summary className="my-1 flex cursor-pointer list-none items-center gap-2 rounded-lg px-2.5 py-2 hover:bg-surface-raised">
          <ChevronRight
            className="size-4 text-muted transition-transform group-open/branch:rotate-90"
            aria-hidden
          />
          <span className="text-sm font-semibold">{title}</span>
          <span className="text-xs text-muted">{caption}</span>
        </summary>
        <TreeList>{children}</TreeList>
      </details>
    </TreeItem>
  );
}

function SessionRoot({
  sessions,
  now,
}: {
  sessions: SessionInfo[];
  now: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="min-w-0 rounded-lg border border-hairline bg-page/40 px-3 py-2"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Workflow className="size-4 text-ink-secondary" aria-hidden />
            <span className="text-[11px] text-muted">Orchestrator</span>
            <span className="min-w-0 flex-1 truncate text-sm text-ink">
              {session.title ?? session.id}
            </span>
            <StatusPill status={session.status} />
            <span className="text-[11px] text-muted">
              {formatAgo(session.lastActivity, now)}
            </span>
          </div>
          {session.lastMessage && (
            <div className="mt-2 border-t border-hairline pt-2">
              <p className="mb-1 text-[11px] text-muted">
                Latest from the orchestrator ·{" "}
                {formatAgo(Date.parse(session.lastMessage.ts), now)}
              </p>
              <p className="line-clamp-[12] whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-secondary">
                {session.lastMessage.text
                  .replaceAll("**", "")
                  .replaceAll("`", "")}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function InitiativeTree({
  initiative,
  snapshot,
  now,
  archived,
}: {
  initiative: Initiative;
  snapshot: Snapshot | null;
  now: number;
  /** An archived initiative's leftover questions and reports are history, not waiting on you. */
  archived?: ArchiveReason;
}) {
  const allAgents =
    snapshot?.sessions.flatMap((session) => session.agents) ?? [];
  const tickets = new Set([
    initiative.key,
    ...initiative.children.map((issue) => issue.identifier),
  ]);
  const byId = new Map(allAgents.map((agent) => [agent.id, agent]));

  const childrenOf = new Map<string, AgentInfo[]>();
  for (const agent of allAgents) {
    if (agent.parentId && byId.has(agent.parentId)) {
      childrenOf.set(agent.parentId, [
        ...(childrenOf.get(agent.parentId) ?? []),
        agent,
      ]);
    }
  }

  const rootsFor = (ticket: string) =>
    allAgents
      .filter(
        (agent) =>
          agent.ticket === ticket &&
          !(agent.parentId && byId.get(agent.parentId)?.ticket === ticket),
      )
      .sort((a, b) => b.lastActivity - a.lastActivity);

  const related = allAgents.filter(
    (agent) => agent.ticket && tickets.has(agent.ticket),
  );
  const sessionIds = new Set(
    related
      .filter((agent) => agent.ticket === initiative.key)
      .map((agent) => agent.sessionId),
  );
  const orchestrators = (snapshot?.sessions ?? []).filter((session) =>
    sessionIds.has(session.id),
  );
  const runningCount = related.filter(
    (agent) => agent.status === "running",
  ).length;
  const relatedSources = new Set([
    ...related.map((agent) => agent.id),
    ...orchestrators.map((session) => `session:${session.id}`),
  ]);
  const attentionItems = archived
    ? []
    : collectAttention(snapshot, now, [initiative]).filter(
        (item) =>
          relatedSources.has(item.sourceId) ||
          (item.ticket !== undefined && tickets.has(item.ticket)),
      );

  const releases = new Map<string, TrackerIssue[]>();
  for (const issue of [...initiative.children].sort((a, b) =>
    a.identifier.localeCompare(b.identifier, undefined, { numeric: true }),
  )) {
    const release = issue.release ?? NO_RELEASE;
    releases.set(release, [...(releases.get(release) ?? []), issue]);
  }
  const releaseKeys = [...releases.keys()].sort((a, b) =>
    a === NO_RELEASE ? 1 : b === NO_RELEASE ? -1 : a.localeCompare(b),
  );
  const firstOpenRelease = releaseKeys.find((release) =>
    releases.get(release)?.some((issue) => issue.state.type !== "completed"),
  );

  const total = initiative.children.length;
  const done = initiative.children.filter(
    (issue) => issue.state.type === "completed",
  ).length;
  const planning = rootsFor(initiative.key);

  return (
    <Panel
      title={`${initiative.key} · ${initiative.name ?? initiative.parent?.title ?? ""}`}
      aside={
        initiative.parent && (
          <a
            href={initiative.parent.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
          >
            Linear <ExternalLink className="size-3" aria-hidden />
          </a>
        )
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="text-xs text-muted">Phase</p>
          <p className="text-sm text-ink">{initiative.phase ?? "—"}</p>
          {archived && (
            <p className="text-xs text-muted">
              Archived · {ARCHIVE_LABEL[archived]}
            </p>
          )}
          {total > 0 && (
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded-full bg-grid">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(done / total) * 100}%`,
                    background: "var(--series-1)",
                  }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted tabular">
                {done} / {total} tickets done
              </p>
            </div>
          )}
        </div>
        <div>
          <p className="text-xs text-muted">Agents working</p>
          <p className="text-2xl font-semibold">{runningCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted">Waiting on you</p>
          <p className="flex items-center gap-1.5 text-2xl font-semibold">
            {attentionItems.length}
            {attentionItems.length > 0 && (
              <CircleAlert
                className="size-5"
                style={{ color: TONE_COLOR.warning }}
                aria-hidden
              />
            )}
          </p>
        </div>
      </div>

      {initiative.trackerError && (
        <p className="mb-3 rounded-lg px-3 py-2 text-xs text-ink-secondary ring-1 ring-hairline">
          Sub-issues unavailable — {initiative.trackerError}.
        </p>
      )}

      {attentionItems.length > 0 && (
        <div className="mb-3">
          <NeedsYouPanel items={attentionItems} now={now} />
        </div>
      )}

      {orchestrators.length > 0 && (
        <SessionRoot sessions={orchestrators} now={now} />
      )}

      <TreeList>
        <GroupBranch
          title="Planning"
          caption={`${planning.length} agent${planning.length === 1 ? "" : "s"}`}
          defaultOpen={planning.some((agent) => agent.status !== "idle")}
        >
          {planning.length === 0 && (
            <TreeItem>
              <p className="my-2 text-xs text-muted">
                No planning agents in the monitored window.
              </p>
            </TreeItem>
          )}
          {planning.map((agent) => (
            <AgentBranch
              key={agent.id}
              agent={agent}
              childrenOf={childrenOf}
              now={now}
            />
          ))}
        </GroupBranch>

        {releaseKeys.map((release) => {
          const issues = releases.get(release) ?? [];
          const releaseDone = issues.filter(
            (issue) => issue.state.type === "completed",
          ).length;
          const releaseAgents = issues.flatMap((issue) =>
            rootsFor(issue.identifier),
          );
          const working = releaseAgents.filter(
            (agent) => agent.status === "running",
          ).length;
          return (
            <GroupBranch
              key={release}
              title={release}
              caption={`${releaseDone}/${issues.length} done · ${working} agent${working === 1 ? "" : "s"} working`}
              defaultOpen={release === firstOpenRelease}
            >
              {issues.map((issue) => (
                <IssueBranch
                  key={issue.identifier}
                  issue={issue}
                  agents={rootsFor(issue.identifier)}
                  childrenOf={childrenOf}
                  now={now}
                />
              ))}
            </GroupBranch>
          );
        })}
      </TreeList>
    </Panel>
  );
}
