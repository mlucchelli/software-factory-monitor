"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { AgentDetail } from "@/lib/claude/types";
import { useNow, usePolling } from "@/lib/client/hooks";
import { formatAgo, projectName, roleStyle } from "@/lib/client/present";
import { StreamView } from "../stream/stream-view";
import { Chip, Panel, RoleBadge, StatusPill } from "../ui";

export function AgentDetailView({ id }: { id: string }) {
  const { data: detail, error } = usePolling<AgentDetail>(
    `/api/agents/${id}`,
    5000,
  );
  const now = useNow();

  if (error && !detail) {
    return <p className="text-sm text-muted">{error}</p>;
  }
  if (!detail) {
    return <p className="text-sm text-muted">Loading agent…</p>;
  }

  const { agent, launchPrompt } = detail;
  const role = roleStyle(agent.type);
  const report = agent.report;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/?crew=${encodeURIComponent(`session:${agent.sessionId}`)}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to its pipeline
      </Link>

      <header
        className="rounded-xl border border-hairline bg-surface p-4"
        style={{ boxShadow: `inset 3px 0 0 ${role.color}` }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge type={agent.type} />
          <StatusPill status={agent.status} reportStatus={report?.status} />
          {agent.ticket && <Chip>{agent.ticket}</Chip>}
          {agent.mode && <Chip>{agent.mode}</Chip>}
          {agent.isFork && <Chip>fork</Chip>}
          <span className="ml-auto text-xs text-muted">
            last activity {formatAgo(agent.lastActivity, now)}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {agent.description ?? agent.id}
        </h1>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
          <span>{agent.id}</span>
          {agent.model && <span>{agent.model}</span>}
          <span>{projectName(agent.cwd, agent.project)}</span>
          {agent.branch && <span>⎇ {agent.branch}</span>}
          <span>depth {agent.depth}</span>
          {agent.parentId && (
            <Link href={`/agents/${agent.parentId}`} className="hover:text-ink">
              parent {agent.parentId}
            </Link>
          )}
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-4">
          {report && (
            <Panel
              title="Latest report"
              aside={
                <StatusPill status="reported" reportStatus={report.status} />
              }
            >
              <dl className="grid gap-3 text-sm">
                {report.summary && (
                  <div>
                    <dt className="text-xs text-muted">Summary</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-ink-secondary">
                      {report.summary}
                    </dd>
                  </div>
                )}
                {report.questions && (
                  <div>
                    <dt className="text-xs text-muted">Questions</dt>
                    <dd className="mt-1 whitespace-pre-wrap font-mono text-xs text-ink-secondary">
                      {report.questions}
                    </dd>
                  </div>
                )}
                {report.next && (
                  <div>
                    <dt className="text-xs text-muted">Next</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-ink-secondary">
                      {report.next}
                    </dd>
                  </div>
                )}
                {report.pr && (
                  <div>
                    <dt className="text-xs text-muted">Pull request</dt>
                    <dd className="mt-1 font-mono text-xs text-ink-secondary">
                      {report.pr}
                    </dd>
                  </div>
                )}
              </dl>
            </Panel>
          )}
          {launchPrompt && (
            <Panel title="Launch prompt">
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-secondary">
                {launchPrompt}
              </pre>
            </Panel>
          )}
        </div>

        <Panel
          title="Live stream"
          aside={
            <span className="text-xs text-muted">
              tools, messages and diffs · thinking hidden
            </span>
          }
        >
          <StreamView
            key={agent.id}
            sourceId={agent.id}
            roleType={agent.type}
            className="max-h-[900px]"
          />
        </Panel>
      </div>
    </div>
  );
}
