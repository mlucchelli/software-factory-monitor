"use client";

import { useEffect, useRef, useState } from "react";
import type { PendingAction, Snapshot } from "@/lib/claude/types";
import type { Initiative } from "@/lib/initiatives";
import { ticketStage } from "./pipeline";
import {
  ATTENTION_STATUSES,
  humanizeStatus,
  projectName,
  reportTone,
  SESSION_ROLE,
  type Tone,
} from "./present";

export type AttentionKind = "question" | "merge" | "report" | "stalled";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  tone: Tone;
  label: string;
  sourceId: string;
  sourceType: string;
  title: string;
  context: string;
  ticket?: string;
  detail: string;
  since: number;
  href?: string;
  external?: boolean;
  /** The session shows a selection dialog in a terminal the monitor reaches, so it can be answered from the monitor. */
  answerable?: boolean;
}

const QUESTION_TOOL = "AskUserQuestion";
const STALLED_AFTER_MS = 90_000;
const IGNORE_OLDER_THAN_MS = 6 * 3_600_000;
const QUESTION_MAX_AGE_MS = 24 * 3_600_000;
const KIND_PRIORITY: Record<AttentionKind, number> = {
  question: 0,
  merge: 1,
  report: 2,
  stalled: 3,
};

interface Source {
  sourceId: string;
  sourceType: string;
  title: string;
  context: string;
  ticket?: string;
  href?: string;
  lastActivity: number;
}

function fromPending(
  pending: PendingAction | undefined,
  source: Source,
  now: number,
): AttentionItem | null {
  if (!pending) {
    return null;
  }
  const since = Date.parse(pending.since) || source.lastActivity;
  const maxAge =
    pending.tool === QUESTION_TOOL ? QUESTION_MAX_AGE_MS : IGNORE_OLDER_THAN_MS;
  if (now - since > maxAge) {
    return null;
  }
  if (pending.tool === QUESTION_TOOL) {
    return {
      ...source,
      id: `${source.sourceId}:question:${pending.since}`,
      kind: "question",
      tone: "warning",
      label: "Question waiting for your answer",
      detail: pending.summary,
      since,
    };
  }
  if (now - source.lastActivity < STALLED_AFTER_MS) {
    return null;
  }
  return {
    ...source,
    id: `${source.sourceId}:stalled:${pending.since}`,
    kind: "stalled",
    tone: "serious",
    label: "Waiting on a tool — permission prompt or long command",
    detail: `${pending.tool} · ${pending.summary}`,
    since,
  };
}

function mergeItems(
  snapshot: Snapshot | null,
  initiatives: Initiative[],
  now: number,
): AttentionItem[] {
  const agents = snapshot?.sessions.flatMap((session) => session.agents) ?? [];
  return initiatives.flatMap((initiative) =>
    initiative.children.flatMap((issue): AttentionItem[] => {
      const stage = ticketStage(
        issue,
        agents.filter((agent) => agent.ticket === issue.identifier),
      );
      const pullRequest = stage.pullRequest;
      if (stage.step !== 3 || stage.waitingOn !== "you" || !pullRequest) {
        return [];
      }
      return [
        {
          id: `merge:${issue.identifier}:${pullRequest.number}`,
          kind: "merge",
          tone: "good",
          label: "PR approved — ready for your merge",
          sourceId: pullRequest.url,
          sourceType: "tech-lead",
          title: `${issue.identifier} · ${pullRequest.repository}#${pullRequest.number}`,
          context: initiative.key,
          ticket: issue.identifier,
          detail: pullRequest.title,
          since: stage.since ?? now,
          href: pullRequest.url,
          external: true,
        },
      ];
    }),
  );
}

export function collectAttention(
  snapshot: Snapshot | null,
  now: number,
  initiatives: Initiative[] = [],
): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const session of snapshot?.sessions ?? []) {
    const project = projectName(session.cwd, session.project);
    const prompt = session.live?.prompt;
    if (prompt) {
      items.push({
        id: `session:${session.id}:prompt:${prompt.question ?? prompt.footer}`,
        kind: "question",
        tone: "warning",
        label: prompt.tabs
          ? "Question waiting for your answer"
          : "Waiting for your choice in the terminal",
        sourceId: `session:${session.id}`,
        sourceType: SESSION_ROLE,
        title: session.title ?? project,
        context: session.live?.name ?? project,
        detail:
          prompt.question ??
          prompt.options.map((option) => option.label).join(" · "),
        since: session.live?.updatedAt ?? session.lastActivity,
        answerable: session.live?.terminal !== undefined,
      });
    }
    const sessionItem = prompt
      ? null
      : fromPending(
          session.pending,
          {
            sourceId: `session:${session.id}`,
            sourceType: SESSION_ROLE,
            title: session.title ?? project,
            context: project,
            lastActivity: session.lastActivity,
          },
          now,
        );
    if (sessionItem) {
      items.push(sessionItem);
    }

    for (const agent of session.agents) {
      const source: Source = {
        sourceId: agent.id,
        sourceType: agent.type,
        title: agent.description ?? agent.id,
        context: session.title ?? project,
        ticket: agent.ticket,
        href: `/agents/${agent.id}`,
        lastActivity: agent.lastActivity,
      };
      const reportStatus = agent.report?.status;
      if (
        agent.status === "reported" &&
        reportStatus &&
        ATTENTION_STATUSES.has(reportStatus) &&
        now - agent.lastActivity < IGNORE_OLDER_THAN_MS
      ) {
        items.push({
          ...source,
          id: `${agent.id}:report:${agent.lastActivity}`,
          kind: "report",
          tone: reportTone(reportStatus),
          label: humanizeStatus(reportStatus),
          detail:
            agent.report?.questions ?? agent.report?.summary ?? "See report",
          since: agent.lastActivity,
        });
        continue;
      }
      const pendingItem = fromPending(agent.pending, source, now);
      if (pendingItem) {
        items.push(pendingItem);
      }
    }
  }

  items.push(...mergeItems(snapshot, initiatives, now));

  return items.sort(
    (a, b) =>
      KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind] || a.since - b.since,
  );
}

type Permission = NotificationPermission | "unsupported";

export function useAttentionNotifications(items: AttentionItem[]) {
  const [permission, setPermission] = useState<Permission>("default");
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    setPermission(
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission,
    );
  }, []);

  useEffect(() => {
    document.title =
      items.length > 0 ? `(${items.length}) Agents Monitor` : "Agents Monitor";
  }, [items.length]);

  useEffect(() => {
    const ids = new Set(items.map((item) => item.id));
    if (seen.current === null) {
      seen.current = ids;
      return;
    }
    if (permission === "granted") {
      for (const item of items) {
        if (!seen.current.has(item.id)) {
          new Notification(item.label, {
            body: `${item.title}\n${item.detail}`,
            tag: item.id,
          });
        }
      }
    }
    seen.current = ids;
  }, [items, permission]);

  const request = async () => {
    if (typeof Notification !== "undefined") {
      setPermission(await Notification.requestPermission());
    }
  };

  return { permission, request };
}
