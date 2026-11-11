"use client";

import { useMemo, useState } from "react";
import { AnswerDialog } from "@/components/mission/terminal-actions";
import { NeedsYouPanel } from "@/components/needs-you-panel";
import { Panel } from "@/components/ui";
import {
  type AttentionItem,
  collectAttention,
  useAttentionNotifications,
} from "@/lib/client/attention";
import {
  useActivity,
  useNow,
  usePolling,
  useSnapshot,
} from "@/lib/client/hooks";
import { buildSources } from "@/lib/client/present";
import type { Initiative } from "@/lib/initiatives";
import { ActivityFeed } from "./activity-feed";
import { ActivityPulse } from "./activity-pulse";
import { KpiRow } from "./kpi-row";
import { SessionTree } from "./session-tree";
import { Swimlanes } from "./swimlanes";
import { TeamView } from "./team-view";

type Grouping = "team" | "session";

const GROUPINGS: { key: Grouping; label: string }[] = [
  { key: "team", label: "By team" },
  { key: "session", label: "By session" },
];

export function LiveDashboard() {
  const { data: snapshot, error } = useSnapshot();
  const { data: initiatives } = usePolling<Initiative[]>(
    "/api/initiatives",
    30_000,
  );
  const { events, connected } = useActivity();
  const now = useNow();
  const sources = useMemo(() => buildSources(snapshot), [snapshot]);
  const attention = useMemo(
    () => collectAttention(snapshot, now, initiatives ?? []),
    [snapshot, now, initiatives],
  );
  const notifications = useAttentionNotifications(attention);
  const [showIdle, setShowIdle] = useState(false);
  const [grouping, setGrouping] = useState<Grouping>("team");
  const [answering, setAnswering] = useState<AttentionItem | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">All sessions</h1>
          <p className="text-sm text-muted">
            Every Claude Code session and sub-agent on this machine, as it
            works.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-ink-secondary ring-1 ring-hairline">
          <span
            className="size-2 rounded-full"
            style={{
              background: connected
                ? "var(--status-good)"
                : "var(--status-critical)",
            }}
            aria-hidden
          />
          {connected ? "Streaming" : "Reconnecting…"}
        </span>
      </div>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm text-ink ring-1 ring-hairline">
          Snapshot failed: {error}
        </p>
      )}

      <NeedsYouPanel
        items={attention}
        now={now}
        permission={notifications.permission}
        onEnableNotifications={notifications.request}
        onAnswer={setAnswering}
      />
      {answering && (
        <AnswerDialog
          key={answering.id}
          sessionId={answering.sourceId.slice("session:".length)}
          title={answering.title}
          onClose={() => setAnswering(null)}
        />
      )}

      <KpiRow
        snapshot={snapshot}
        events={events}
        now={now}
        waitingOnYou={attention.length}
      />

      <Panel
        title="Agents at work"
        aside={
          <span className="text-xs text-muted">
            grouped by team · last 10 minutes
          </span>
        }
      >
        <Swimlanes events={events} sources={sources} now={now} />
      </Panel>

      <Panel
        title="Activity pulse"
        aside={
          <span className="text-xs text-muted">
            events per 10s · last 5 minutes
          </span>
        }
      >
        <ActivityPulse events={events} sources={sources} now={now} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <Panel
          title={grouping === "team" ? "Teams" : "Sessions & agents"}
          aside={
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg p-0.5 ring-1 ring-hairline">
                {GROUPINGS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setGrouping(option.key)}
                    aria-pressed={grouping === option.key}
                    className={`rounded-md px-2.5 py-0.5 text-xs transition-colors ${
                      grouping === option.key
                        ? "bg-surface-raised text-ink"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={showIdle}
                  onChange={(event) => setShowIdle(event.target.checked)}
                  className="accent-[var(--series-1)]"
                />
                Show idle
              </label>
            </div>
          }
        >
          {grouping === "team" ? (
            <TeamView snapshot={snapshot} now={now} showIdle={showIdle} />
          ) : (
            <SessionTree snapshot={snapshot} now={now} showIdle={showIdle} />
          )}
        </Panel>
        <Panel title="Live feed">
          <ActivityFeed events={events} sources={sources} />
        </Panel>
      </div>
    </div>
  );
}
