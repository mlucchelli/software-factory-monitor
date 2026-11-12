"use client";

import { ExternalLink, GitPullRequest } from "lucide-react";
import { reportFields } from "@/lib/report-fields";
import { StatusPill } from "../ui";
import { Markdown } from "./markdown";

function PullRequestLink({ value }: { value: string }) {
  const url = /https:\/\/\S+/.exec(value)?.[0];
  const number = /\/pull\/(\d+)/.exec(value)?.[1] ?? /#(\d+)/.exec(value)?.[1];
  const label = number ? `#${number}` : value;
  const body = (
    <>
      <GitPullRequest className="size-3" aria-hidden />
      {label}
    </>
  );
  const shape =
    "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-ink ring-1 ring-hairline";
  if (!url) {
    return <span className={shape}>{body}</span>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`${shape} hover:bg-surface-raised`}
      title={url}
    >
      {body}
      <ExternalLink className="size-3 text-muted" aria-hidden />
    </a>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-[11px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 font-mono break-words text-ink-secondary">
        {value}
      </dd>
    </div>
  );
}

/**
 * A hand-back report laid out by field: what happened first, the question that
 * waits on someone set apart, and the bookkeeping underneath.
 */
export function ReportCard({ text }: { text: string }) {
  const fields = reportFields(text);
  const waits = fields.QUESTIONS !== undefined;
  return (
    <div className="grid min-w-0 gap-2" data-testid="report-card">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {fields.STATUS && (
          <StatusPill status="reported" reportStatus={fields.STATUS} />
        )}
        {fields.MODE && (
          <span className="rounded bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] text-ink-secondary">
            {fields.MODE}
          </span>
        )}
        {fields.TICKET && (
          <span className="font-mono text-[11px] text-ink-secondary">
            {fields.TICKET}
          </span>
        )}
        {fields.PR && <PullRequestLink value={fields.PR} />}
        {fields.CHECKS && (
          <span className="text-[11px] text-muted">
            checks {fields.CHECKS.split("\n")[0]}
          </span>
        )}
      </div>
      {fields.SUMMARY && <Markdown text={fields.SUMMARY} />}
      {waits && (
        <div className="grid gap-1 rounded-md border border-status-warning/50 bg-status-warning/[0.06] px-2.5 py-2">
          <span className="text-[11px] font-medium text-ink-secondary">
            Question
          </span>
          <Markdown text={fields.QUESTIONS ?? ""} />
        </div>
      )}
      {fields.DEVIATIONS && (
        <div className="grid gap-1 rounded-md px-2.5 py-2 ring-1 ring-hairline">
          <span className="text-[11px] font-medium text-ink-secondary">
            Deviations from the spec
          </span>
          <Markdown text={fields.DEVIATIONS} />
        </div>
      )}
      <dl className="grid min-w-0 gap-1">
        {fields.NEXT && <Detail label="Next" value={fields.NEXT} />}
        {fields.WORKTREE && <Detail label="Worktree" value={fields.WORKTREE} />}
        {fields.PREVIEW && <Detail label="Preview" value={fields.PREVIEW} />}
      </dl>
      <details className="text-[11px] text-muted">
        <summary className="w-fit cursor-pointer hover:text-ink">
          Report as written
        </summary>
        <pre className="mt-1 overflow-x-auto font-mono whitespace-pre-wrap break-words text-ink-secondary">
          {text}
        </pre>
      </details>
    </div>
  );
}
