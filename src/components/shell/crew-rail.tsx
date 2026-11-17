"use client";

import {
  Activity,
  Archive,
  ArchiveRestore,
  ChevronRight,
  CircleAlert,
  CircleDollarSign,
  Loader2,
  type LucideIcon,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radar,
  Rows3,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ARCHIVE_EXPLANATION,
  ARCHIVE_LABEL,
  type ArchiveReason,
  useRememberedOpen,
} from "@/lib/client/archive";
import {
  type Crew,
  type PhaseStep,
  type StepState,
  stepState,
} from "@/lib/client/mission";
import { formatAgo } from "@/lib/client/present";
import type { Launch, LaunchKind } from "./launch-store";
import {
  crewAttention,
  crewRuns,
  findCrew,
  useMonitorData,
} from "./monitor-data";

const STORAGE_KEY = "agents-monitor:rail-collapsed";
const ARCHIVED_OPEN_KEY = "agents-monitor:rail-archived-open";

const LINKS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Mission control", icon: Workflow },
  { href: "/live", label: "All sessions", icon: Activity },
  { href: "/initiatives", label: "Initiatives", icon: Rows3 },
  { href: "/costs", label: "Costs", icon: CircleDollarSign },
];

function isLinkActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/live") {
    return pathname.startsWith("/live") || pathname.startsWith("/agents");
  }
  return pathname.startsWith(href);
}

function readCollapsed(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      return stored === "1";
    }
  } catch {}
  return window.innerWidth < 768;
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  } catch {}
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function useRailCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(readCollapsed()), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "[" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !isTyping(event.target)
      ) {
        setCollapsed((value) => {
          writeCollapsed(!value);
          return !value;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const toggle = () =>
    setCollapsed((value) => {
      writeCollapsed(!value);
      return !value;
    });
  return { collapsed, toggle };
}

const SEGMENT_COLOR: Record<StepState, string> = {
  done: "var(--status-good)",
  current: "var(--ink)",
  upcoming: "var(--axis)",
  skipped: "transparent",
};

function PhaseTicks({ crew, steps }: { crew: Crew; steps: PhaseStep[] }) {
  const initiative = crew.initiative;
  if (!initiative) {
    return null;
  }
  return (
    <span className="flex h-1 flex-1 items-center gap-px" aria-hidden>
      {steps.map((step) => {
        const state = stepState(
          step,
          initiative.phaseNumber,
          initiative.previews,
        );
        const waiting = step.gate && state === "current";
        return (
          <span
            key={step.key}
            className={`h-full rounded-full ${step.gate ? "w-1 shrink-0" : "flex-1"} ${
              state === "skipped" ? "ring-1 ring-axis ring-inset" : ""
            }`}
            style={{
              background: waiting
                ? "var(--status-warning)"
                : SEGMENT_COLOR[state],
            }}
          />
        );
      })}
    </span>
  );
}

function phaseLabel(crew: Crew, steps: PhaseStep[]): string {
  const initiative = crew.initiative;
  if (!initiative) {
    return "";
  }
  const current = steps.filter(
    (step) =>
      stepState(step, initiative.phaseNumber, initiative.previews) ===
      "current",
  );
  if (current.length === 0) {
    return initiative.phaseNumber === undefined ? "No phase yet" : "Closed";
  }
  return current.map((step) => step.label.split(" · ")[0]).join(" · ");
}

function StatusGlyph({
  waiting,
  running,
}: {
  waiting: boolean;
  running: boolean;
}) {
  if (waiting) {
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="motion-ripple absolute inset-0 rounded-full bg-status-warning" />
        <span className="relative size-2 rounded-full bg-status-warning" />
      </span>
    );
  }
  if (running) {
    return (
      <span className="relative flex size-2 shrink-0">
        <span className="motion-breathe absolute inset-0 rounded-full bg-status-good" />
        <span className="relative size-2 rounded-full bg-status-good" />
      </span>
    );
  }
  return (
    <span className="size-2 shrink-0 rounded-full ring-1 ring-muted ring-inset" />
  );
}

function crewShortName(crew: Crew): string {
  const digits = /-(\d+)$/.exec(crew.title)?.[1];
  return digits ?? crew.title.slice(0, 4);
}

function CrewRow({
  crew,
  selected,
  collapsed,
  waiting,
  running,
  lastActivity,
  now,
  archived,
  onArchiveByHand,
}: {
  crew: Crew;
  selected: boolean;
  collapsed: boolean;
  waiting: number;
  running: number;
  lastActivity?: number;
  now: number;
  archived?: ArchiveReason;
  /** Present when the row can be archived or unarchived by hand. */
  onArchiveByHand?: (archive: boolean) => void;
}) {
  const { steps } = useMonitorData();
  const subtitle = crew.subtitle ?? "No orchestrator session found";
  const meta = archived
    ? ARCHIVE_LABEL[archived]
    : crew.initiative
      ? phaseLabel(crew, steps)
      : `${crew.session?.agents.length ?? 0} agents${
          lastActivity ? ` · ${formatAgo(lastActivity, now)}` : ""
        }`;
  const label = `${crew.title} — ${subtitle}${
    archived ? ` — ${ARCHIVE_LABEL[archived]}` : ""
  }${waiting > 0 ? ` — ${waiting} waiting on you` : ""}`;
  const chat = !collapsed && crew.session?.live;
  const archiveAction = !collapsed && onArchiveByHand;
  return (
    <li
      className={`group/crew relative ${
        archived && !selected
          ? "opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100"
          : ""
      }`}
    >
      <Link
        href={`/?crew=${encodeURIComponent(crew.key)}`}
        scroll={false}
        aria-current={selected ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        title={collapsed ? label : undefined}
        className={`group relative flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
          selected ? "bg-surface-raised" : "hover:bg-surface"
        }`}
      >
        {selected && (
          <span
            className="motion-rise absolute inset-y-1.5 -left-2 w-0.5 rounded-full bg-ink"
            aria-hidden
          />
        )}
        {collapsed ? (
          <span className="relative mx-auto flex size-8 items-center justify-center rounded-md font-mono text-[10px] text-ink-secondary ring-1 ring-hairline">
            {crewShortName(crew)}
            <span className="absolute -top-0.5 -right-0.5">
              <StatusGlyph waiting={waiting > 0} running={running > 0} />
            </span>
          </span>
        ) : (
          <>
            <StatusGlyph waiting={waiting > 0} running={running > 0} />
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="flex min-w-0 items-baseline gap-1.5">
                <span className="max-w-[45%] shrink-0 truncate font-mono text-[11px] text-ink-secondary">
                  {crew.title}
                </span>
                <span
                  className={`min-w-0 truncate text-[13px] ${selected ? "text-ink" : "text-ink-secondary group-hover:text-ink"}`}
                >
                  {subtitle}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-2 text-[11px] text-muted">
                <PhaseTicks crew={crew} steps={steps} />
                <span
                  className="shrink-0 truncate"
                  title={archived ? ARCHIVE_EXPLANATION[archived] : undefined}
                >
                  {meta}
                </span>
              </span>
            </span>
            {waiting > 0 ? (
              <span
                className="shrink-0 rounded-full bg-status-warning px-1.5 text-[11px] font-semibold text-page tabular"
                title={`${waiting} waiting on you`}
              >
                {waiting}
              </span>
            ) : running > 0 ? (
              <span
                className="shrink-0 text-[11px] text-muted tabular"
                title={`${running} running`}
              >
                {running} live
              </span>
            ) : null}
          </>
        )}
      </Link>
      {(chat || archiveAction) && (
        <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 gap-1">
          {chat && (
            <Link
              href={`/?crew=${encodeURIComponent(crew.key)}&chat=1`}
              scroll={false}
              className={HOVER_ACTION}
              aria-label={`Chat with ${chat.name ?? crew.title}`}
              title="Open the conversation"
            >
              <MessagesSquare className="size-3.5" aria-hidden />
            </Link>
          )}
          {archiveAction &&
            (archived === "manual" ? (
              <button
                type="button"
                onClick={() => archiveAction(false)}
                className={HOVER_ACTION}
                aria-label={`Unarchive ${crew.title}`}
                title="Unarchive — move it back to Initiatives"
              >
                <ArchiveRestore className="size-3.5" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => archiveAction(true)}
                className={HOVER_ACTION}
                aria-label={`Archive ${crew.title}`}
                title="Archive — only in this browser; the registry and Linear are not touched"
              >
                <Archive className="size-3.5" aria-hidden />
              </button>
            ))}
        </span>
      )}
    </li>
  );
}

const HOVER_ACTION =
  "rounded-md bg-surface-raised p-1 text-muted opacity-0 ring-1 ring-hairline transition-opacity group-hover/crew:opacity-100 hover:text-ink focus-visible:opacity-100";

function ArchivedSection({
  count,
  collapsed,
  children,
}: {
  count: number;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  const { open, toggle } = useRememberedOpen(ARCHIVED_OPEN_KEY);
  if (count === 0) {
    return null;
  }
  const label = `${open ? "Hide" : "Show"} ${count} archived`;
  return (
    <div className="grid gap-0.5">
      {collapsed ? (
        <>
          <h2 className="sr-only">Archived</h2>
          <span className="mx-3 my-2 h-px bg-hairline" />
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="mx-auto flex items-center gap-0.5 rounded p-0.5 text-[10px] text-muted tabular hover:bg-surface hover:text-ink"
            aria-label={label}
            title={label}
          >
            <Archive className="size-3.5" aria-hidden />
            {count}
          </button>
        </>
      ) : (
        <h2>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex w-full items-center gap-1 rounded px-2 pt-3 pb-1 text-[10px] font-medium tracking-wider text-muted uppercase hover:text-ink"
          >
            <ChevronRight
              className={`size-3 transition-transform motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
              aria-hidden
            />
            Archived
            <span className="ml-auto font-normal tracking-normal tabular">
              {count}
            </span>
          </button>
        </h2>
      )}
      {open && <ul className="motion-rise grid gap-0.5">{children}</ul>}
    </div>
  );
}

function Section({
  label,
  collapsed,
  onAdd,
  addLabel,
  children,
}: {
  label: string;
  collapsed: boolean;
  onAdd: () => void;
  addLabel: string;
  children: React.ReactNode;
}) {
  const add = (
    <button
      type="button"
      onClick={onAdd}
      className={`rounded p-0.5 text-muted hover:bg-surface hover:text-ink ${collapsed ? "mx-auto" : "ml-auto"}`}
      aria-label={addLabel}
      title={addLabel}
    >
      <Plus className="size-3.5" aria-hidden />
    </button>
  );
  return (
    <div className="grid gap-0.5">
      {collapsed ? (
        <>
          <h2 className="sr-only">{label}</h2>
          <span className="mx-3 my-2 h-px bg-hairline" />
          {add}
        </>
      ) : (
        <div className="flex items-center px-2 pt-3 pb-1">
          <h2 className="text-[10px] font-medium tracking-wider text-muted uppercase">
            {label}
          </h2>
          {add}
        </div>
      )}
      <ul className="grid gap-0.5">{children}</ul>
    </div>
  );
}

function StartingRow({
  launch,
  collapsed,
  onDismiss,
}: {
  launch: Launch;
  collapsed: boolean;
  onDismiss: () => void;
}) {
  const failed = launch.failed !== undefined;
  const text = failed ? "Did not start" : "Starting…";
  return (
    <li
      className="motion-rise flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5"
      title={launch.failed ?? `Starting ${launch.tmuxName}`}
    >
      {failed ? (
        <CircleAlert
          className="size-3 shrink-0 text-status-critical"
          aria-hidden
        />
      ) : (
        <Loader2
          className="size-3 shrink-0 animate-spin text-muted motion-reduce:animate-none"
          aria-hidden
        />
      )}
      {!collapsed && (
        <>
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-[13px] text-ink-secondary">
              {launch.label}
            </span>
            <span
              className={`truncate text-[11px] ${failed ? "text-status-critical" : "text-muted"}`}
            >
              {text} · <span className="font-mono">{launch.tmuxName}</span>
            </span>
          </span>
          {failed && (
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 text-[11px] text-muted hover:text-ink"
            >
              Dismiss
            </button>
          )}
        </>
      )}
      {collapsed && <span className="sr-only">{text}</span>}
    </li>
  );
}

export function CrewRail({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const {
    crews,
    archived,
    setArchivedByHand,
    snapshot,
    now,
    launches,
    dismissLaunch,
    openLauncher,
    steps,
  } = useMonitorData();
  const inSnapshot = new Set(snapshot?.sessions.map((session) => session.id));
  const starting = launches.filter(
    (launch) =>
      launch.failed !== undefined ||
      !launch.sessionId ||
      !inSnapshot.has(launch.sessionId),
  );
  const startingOf = (kind: LaunchKind) =>
    starting
      .filter((launch) => launch.kind === kind)
      .map((launch) => (
        <StartingRow
          key={launch.tmuxName}
          launch={launch}
          collapsed={collapsed}
          onDismiss={() => dismissLaunch(launch.tmuxName)}
        />
      ));
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected =
    pathname === "/"
      ? findCrew(crews, searchParams.get("crew"), archived)?.key
      : undefined;

  const rows = crews.map((crew) => {
    const session = crew.session;
    const running =
      (session?.status === "running" ? 1 : 0) +
      crewRuns(crew, crews).filter((agent) => agent.status === "running")
        .length;
    const initiative = crew.initiative;
    const pausedAtGate = steps.some(
      (step) =>
        step.gate &&
        stepState(step, initiative?.phaseNumber, initiative?.previews) ===
          "current",
    );
    const reason = archived.get(crew.key);
    return {
      crew,
      running,
      waiting: reason
        ? 0
        : crewAttention(crew, crews, snapshot, now).length +
          (pausedAtGate ? 1 : 0),
      lastActivity: session?.lastActivity,
      archived: reason,
    };
  });
  const initiatives = rows.filter(
    (row) => row.crew.initiative && !row.archived,
  );
  const archivedRows = rows.filter((row) => row.archived);
  const sessions = rows.filter((row) => !row.crew.initiative);
  const renderRow = (row: (typeof rows)[number]) => (
    <CrewRow
      key={row.crew.key}
      crew={row.crew}
      selected={row.crew.key === selected}
      collapsed={collapsed}
      waiting={row.waiting}
      running={row.running}
      lastActivity={row.lastActivity}
      now={now}
      archived={row.archived}
      onArchiveByHand={
        row.crew.initiative &&
        (row.archived === undefined || row.archived === "manual")
          ? (archive) => setArchivedByHand(row.crew.key, archive)
          : undefined
      }
    />
  );

  return (
    <aside
      className={`sticky top-0 flex h-dvh shrink-0 flex-col border-r border-hairline bg-page transition-[width] duration-300 ease-out motion-reduce:transition-none ${
        collapsed ? "w-14" : "w-[272px]"
      }`}
      aria-label="Initiatives and sessions"
    >
      <div
        className={`flex h-12 shrink-0 items-center gap-2 border-b border-hairline ${collapsed ? "justify-center" : "px-3"}`}
      >
        {!collapsed && (
          <Link
            href="/"
            className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold tracking-tight"
          >
            <Radar className="size-4 shrink-0 text-ink-secondary" aria-hidden />
            <span className="truncate">Software Factory Monitor</span>
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={`${collapsed ? "Expand" : "Collapse"} sidebar  [`}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden />
          )}
        </button>
      </div>

      <nav className="grid gap-0.5 px-2 pt-2" aria-label="Views">
        {LINKS.map((link) => {
          const active = isLinkActive(link.href, pathname);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? link.label : undefined}
              title={collapsed ? link.label : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors ${
                collapsed ? "justify-center" : ""
              } ${active ? "bg-surface text-ink" : "text-muted hover:text-ink"}`}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {!collapsed && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2 pb-3">
        {!snapshot && (
          <p
            className={`px-2 pt-4 text-xs text-muted ${collapsed ? "sr-only" : ""}`}
          >
            Loading crews…
          </p>
        )}
        {snapshot && (
          <>
            <Section
              label="Initiatives"
              collapsed={collapsed}
              onAdd={() => openLauncher("initiative")}
              addLabel="New initiative"
            >
              {startingOf("initiative")}
              {initiatives.map(renderRow)}
            </Section>
            <Section
              label="Sessions"
              collapsed={collapsed}
              onAdd={() => openLauncher("session")}
              addLabel="New session"
            >
              {startingOf("session")}
              {sessions.map(renderRow)}
            </Section>
            <ArchivedSection count={archivedRows.length} collapsed={collapsed}>
              {archivedRows.map(renderRow)}
            </ArchivedSection>
          </>
        )}
      </div>
    </aside>
  );
}
