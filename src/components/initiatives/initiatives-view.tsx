"use client";

import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useMonitorData } from "@/components/shell/monitor-data";
import {
  ARCHIVE_LABEL,
  type ArchiveReason,
  finishedReason,
  useRememberedOpen,
} from "@/lib/client/archive";
import { useNow, usePolling, useSnapshot } from "@/lib/client/hooks";
import type { Initiative } from "@/lib/initiatives";
import { InitiativeTree } from "./initiative-tree";
import { agentsByTicket, InitiativeSection } from "./initiatives-board";

type ViewMode = "tree" | "board";

const ARCHIVED_OPEN_KEY = "agents-monitor:initiatives-archived-open";

const MODES: { key: ViewMode; label: string }[] = [
  { key: "tree", label: "Agent tree" },
  { key: "board", label: "Board" },
];

export function InitiativesView() {
  const { data: initiatives, error } = usePolling<Initiative[]>(
    "/api/initiatives",
    30_000,
  );
  const { data: snapshot } = useSnapshot();
  const now = useNow(5000);
  const [mode, setMode] = useState<ViewMode>("tree");
  const byTicket = agentsByTicket(snapshot);
  const { openLauncher, archived } = useMonitorData();
  const archivedGroup = useRememberedOpen(ARCHIVED_OPEN_KEY);
  const reasonOf = (initiative: Initiative): ArchiveReason | undefined =>
    archived.get(initiative.key) ?? finishedReason(initiative);
  const active = initiatives?.filter((initiative) => !reasonOf(initiative));
  const archivedInitiatives = initiatives?.filter((initiative) =>
    reasonOf(initiative),
  );
  const render = (initiative: Initiative) =>
    mode === "tree" ? (
      <InitiativeTree
        key={initiative.key}
        initiative={initiative}
        snapshot={snapshot}
        now={now}
        archived={reasonOf(initiative)}
      />
    ) : (
      <InitiativeSection
        key={initiative.key}
        initiative={initiative}
        byTicket={byTicket}
        now={now}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Initiatives</h1>
          <p className="text-sm text-muted">
            Each /initiative with its agents: planning, every ticket and the
            agents working it, live.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openLauncher("initiative")}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink ring-1 ring-hairline hover:bg-surface"
          >
            <Plus className="size-4" aria-hidden />
            New initiative
          </button>
          <div className="flex rounded-lg p-0.5 ring-1 ring-hairline">
            {MODES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMode(option.key)}
                aria-pressed={mode === option.key}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  mode === option.key
                    ? "bg-surface-raised text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
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

      {active?.map(render)}

      {archivedInitiatives && archivedInitiatives.length > 0 && (
        <section className="grid gap-4" aria-label="Archived initiatives">
          <h2>
            <button
              type="button"
              onClick={archivedGroup.toggle}
              aria-expanded={archivedGroup.open}
              className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-left text-sm text-muted hover:text-ink"
            >
              <ChevronRight
                className={`size-4 transition-transform motion-reduce:transition-none ${archivedGroup.open ? "rotate-90" : ""}`}
                aria-hidden
              />
              Archived
              <span className="tabular">· {archivedInitiatives.length}</span>
              <span className="ml-2 truncate text-xs">
                {archivedInitiatives
                  .map((initiative) => {
                    const reason = reasonOf(initiative);
                    return `${initiative.key} ${reason ? ARCHIVE_LABEL[reason].toLowerCase() : ""}`;
                  })
                  .join(" · ")}
              </span>
            </button>
          </h2>
          {archivedGroup.open && (
            <div className="motion-rise grid gap-4 opacity-80">
              {archivedInitiatives.map(render)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
