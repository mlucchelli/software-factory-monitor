"use client";

import { ExternalLink, GitPullRequest } from "lucide-react";
import Link from "next/link";
import type { AgentInfo, Snapshot } from "@/lib/claude/types";
import { useNow, usePolling, useSnapshot } from "@/lib/client/hooks";
import { formatAgo } from "@/lib/client/present";
import type { Initiative, TrackerIssue } from "@/lib/initiatives";
import { Chip, Panel, RoleBadge, StatusPill } from "../ui";

interface Column {
  key: string;
  title: string;
  matches: (issue: TrackerIssue) => boolean;
}

const hasOpenPr = (issue: TrackerIssue) =>
  issue.pullRequests.some((pullRequest) => pullRequest.state === "open");

const COLUMNS: Column[] = [
  {
    key: "todo",
    title: "To do",
    matches: (issue) =>
      ["backlog", "unstarted", "triage"].includes(issue.state.type) &&
      issue.state.name !== "Blocked",
  },
  {
    key: "blocked",
    title: "Blocked",
    matches: (issue) => issue.state.name === "Blocked",
  },
  {
    key: "progress",
    title: "In progress",
    matches: (issue) =>
      issue.state.type === "started" &&
      issue.state.name !== "In Review" &&
      issue.state.name !== "Awaiting Release" &&
      !hasOpenPr(issue),
  },
  {
    key: "review",
    title: "In review",
    matches: (issue) =>
      issue.state.name === "In Review" ||
      (issue.state.type === "started" &&
        issue.state.name !== "Awaiting Release" &&
        hasOpenPr(issue)),
  },
  {
    key: "release",
    title: "Awaiting release",
    matches: (issue) => issue.state.name === "Awaiting Release",
  },
  {
    key: "done",
    title: "Done",
    matches: (issue) => issue.state.type === "completed",
  },
];

function splitTitle(title: string): { repo?: string; text: string } {
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(title);
  return match ? { repo: match[1], text: match[2] } : { text: title };
}

function IssueCard({
  issue,
  agents,
  now,
}: {
  issue: TrackerIssue;
  agents: AgentInfo[];
  now: number;
}) {
  const { repo, text } = splitTitle(issue.title);
  const cleaned = text.replace(/^R\d+\s*·\s*/, "");
  return (
    <article className="rounded-lg border border-hairline bg-page/40 p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={issue.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-[11px] text-ink-secondary hover:text-ink"
        >
          {issue.identifier}
          <ExternalLink className="size-3" aria-hidden />
        </a>
        {issue.release && <Chip>{issue.release}</Chip>}
        {repo && <Chip>{repo}</Chip>}
      </div>
      <p className="mt-1.5 break-words text-[13px] leading-snug text-ink">
        {cleaned}
      </p>
      {issue.pullRequests.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {issue.pullRequests.map((pullRequest) => (
            <a
              key={pullRequest.url}
              href={pullRequest.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary ring-1 ring-hairline hover:text-ink"
            >
              <GitPullRequest className="size-3" aria-hidden />
              {pullRequest.repository}#{pullRequest.number}
              <span className="text-muted">
                {pullRequest.isDraft ? "draft" : pullRequest.state}
              </span>
            </a>
          ))}
        </div>
      )}
      {agents.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-hairline pt-2">
          {agents.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/agents/${agent.id}`}
                className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-raised"
              >
                <RoleBadge type={agent.type} />
                <StatusPill
                  status={agent.status}
                  reportStatus={agent.report?.status}
                />
                <span className="ml-auto text-[11px] text-muted">
                  {formatAgo(agent.lastActivity, now)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function agentsByTicket(
  snapshot: Snapshot | null,
): Map<string, AgentInfo[]> {
  const map = new Map<string, AgentInfo[]>();
  for (const agent of snapshot?.sessions.flatMap((session) => session.agents) ??
    []) {
    if (agent.ticket) {
      map.set(agent.ticket, [...(map.get(agent.ticket) ?? []), agent]);
    }
  }
  return map;
}

export function InitiativeSection({
  initiative,
  byTicket,
  now,
}: {
  initiative: Initiative;
  byTicket: Map<string, AgentInfo[]>;
  now: number;
}) {
  const total = initiative.children.length;
  const done = initiative.children.filter(
    (issue) => issue.state.type === "completed",
  ).length;
  const planningAgents = byTicket.get(initiative.key) ?? [];

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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-3">
          {initiative.phase && (
            <p className="text-sm text-ink-secondary">
              <span className="text-muted">Phase · </span>
              {initiative.phase}
            </p>
          )}
          {total > 0 && (
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>Delivery</span>
                <span className="tabular">
                  {done} / {total} done
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-grid">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(done / total) * 100}%`,
                    background: "var(--series-1)",
                  }}
                />
              </div>
            </div>
          )}
          {initiative.trackerError && (
            <p className="rounded-lg px-3 py-2 text-xs text-ink-secondary ring-1 ring-hairline">
              Sub-issues unavailable — {initiative.trackerError}. Add{" "}
              <code className="font-mono text-ink">LINEAR_API_KEY</code> to{" "}
              <code className="font-mono text-ink">.env.local</code> and restart
              the dev server.
            </p>
          )}
          {initiative.githubError && (
            <p className="text-xs text-muted">
              GitHub: {initiative.githubError}
            </p>
          )}

          <div
            className="overflow-x-auto"
            hidden={initiative.children.length === 0}
          >
            <div className="grid min-w-[1080px] grid-cols-6 gap-3">
              {COLUMNS.map((column) => {
                const issues = initiative.children.filter(column.matches);
                return (
                  <div key={column.key} className="flex flex-col gap-2">
                    <p className="flex items-center justify-between text-xs font-medium text-ink-secondary">
                      {column.title}
                      <span className="tabular text-muted">
                        {issues.length}
                      </span>
                    </p>
                    {issues
                      .sort((a, b) =>
                        (a.release ?? "").localeCompare(b.release ?? ""),
                      )
                      .map((issue) => (
                        <IssueCard
                          key={issue.identifier}
                          issue={issue}
                          agents={byTicket.get(issue.identifier) ?? []}
                          now={now}
                        />
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-3">
          {planningAgents.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-secondary">
                Planning agents
              </p>
              <ul className="flex flex-col gap-1">
                {planningAgents.map((agent) => (
                  <li key={agent.id}>
                    <Link
                      href={`/agents/${agent.id}`}
                      className="flex items-center gap-2 rounded px-1 py-1 hover:bg-surface-raised"
                    >
                      <RoleBadge type={agent.type} />
                      <StatusPill
                        status={agent.status}
                        reportStatus={agent.report?.status}
                      />
                      <span className="ml-auto text-[11px] text-muted">
                        {formatAgo(agent.lastActivity, now)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-secondary">
              Orchestrator log
            </p>
            <ol className="flex max-h-[560px] flex-col gap-2 overflow-y-auto border-l border-hairline pl-3">
              {[...initiative.log].reverse().map((entry) => (
                <li
                  key={entry}
                  className="text-xs leading-relaxed text-ink-secondary"
                >
                  {entry}
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </Panel>
  );
}

export function InitiativesBoard() {
  const { data: initiatives, error } = usePolling<Initiative[]>(
    "/api/initiatives",
    30_000,
  );
  const { data: snapshot } = useSnapshot();
  const now = useNow(5000);
  const byTicket = agentsByTicket(snapshot);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Initiatives</h1>
        <p className="text-sm text-muted">
          /initiative registries, their Linear sub-issues, pull requests and the
          agents on each ticket.
        </p>
      </div>
      {error && <p className="text-sm text-muted">{error}</p>}
      {!initiatives && !error && (
        <p className="text-sm text-muted">Loading initiatives…</p>
      )}
      {initiatives?.length === 0 && (
        <p className="text-sm text-muted">
          No registries in ~/.claude/initiatives yet.
        </p>
      )}
      {initiatives?.map((initiative) => (
        <InitiativeSection
          key={initiative.key}
          initiative={initiative}
          byTicket={byTicket}
          now={now}
        />
      ))}
    </div>
  );
}
