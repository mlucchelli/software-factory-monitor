"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentInfo, Snapshot } from "@/lib/claude/types";
import {
  type ArchiveReason,
  archiveReason,
  useArchivedByHand,
} from "@/lib/client/archive";
import { type AttentionItem, collectAttention } from "@/lib/client/attention";
import { useNow, usePolling, useSnapshot } from "@/lib/client/hooks";
import { type Crew, listCrews } from "@/lib/client/mission";
import { initiativeRuns } from "@/lib/client/workflow";
import type { Initiative } from "@/lib/initiatives";
import { DEFAULT_STEPS, type PhaseStep } from "@/lib/pipeline-definition";
import { LaunchDialog } from "./launch-dialog";
import { type Launch, type LaunchKind, useLaunchStore } from "./launch-store";

interface MonitorData {
  snapshot: Snapshot | null;
  error: string | null;
  initiatives: Initiative[];
  /** Initiatives come from Linear and GitHub, seconds after the snapshot. */
  initiativesLoaded: boolean;
  crews: Crew[];
  /** The /initiative pipeline, parsed from the installed skill. */
  steps: PhaseStep[];
  /** Initiative crews that left the active list, by crew key. */
  archived: ReadonlyMap<string, ArchiveReason>;
  setArchivedByHand: (key: string, archived: boolean) => void;
  now: number;
  /** Sessions started from this browser, newest last. */
  launches: Launch[];
  dismissLaunch: (launchName: string) => void;
  openLauncher: (kind: LaunchKind) => void;
}

/** A session started from the monitor gets a rail row before it has a team. */
function withLaunched(
  crews: Crew[],
  snapshot: Snapshot | null,
  launches: Launch[],
): Crew[] {
  const shown = new Set(crews.map((crew) => crew.session?.id));
  const extra: Crew[] = [];
  for (const launch of launches) {
    if (!launch.sessionId || shown.has(launch.sessionId)) {
      continue;
    }
    const session = snapshot?.sessions.find(
      (candidate) => candidate.id === launch.sessionId,
    );
    if (session) {
      shown.add(session.id);
      extra.push({
        key: `session:${session.id}`,
        title: session.live?.name ?? session.id.slice(0, 8),
        subtitle: session.title ?? launch.label,
        session,
      });
    }
  }
  return [...crews, ...extra];
}

const MonitorContext = createContext<MonitorData | null>(null);

export function MonitorDataProvider({ children }: { children: ReactNode }) {
  const { data: snapshot, error } = useSnapshot();
  const { data: initiatives, error: initiativesError } = usePolling<
    Initiative[]
  >("/api/initiatives", 30_000);
  const { data: pipeline } = usePolling<PhaseStep[]>("/api/pipeline", 300_000);
  const steps = pipeline ?? DEFAULT_STEPS;
  const now = useNow();
  const router = useRouter();
  const { launches, addLaunch, dismissLaunch } = useLaunchStore();
  const [launcher, setLauncher] = useState<LaunchKind | null>(null);
  const crews = useMemo(
    () =>
      withLaunched(listCrews(snapshot, initiatives ?? []), snapshot, launches),
    [snapshot, initiatives, launches],
  );
  const { archivedByHand, setArchivedByHand } = useArchivedByHand();
  const archived = useMemo(() => {
    const reasons = new Map<string, ArchiveReason>();
    for (const crew of crews) {
      const reason = archiveReason(crew.initiative, archivedByHand, steps);
      if (reason) {
        reasons.set(crew.key, reason);
      }
    }
    return reasons;
  }, [crews, archivedByHand, steps]);
  const followed = useRef(new Set<string>());
  const [follow, setFollow] = useState<string | null>(null);

  useEffect(() => {
    const launch = launches.find((item) => item.launchName === follow);
    const id = launch?.sessionId;
    if (
      !id ||
      followed.current.has(id) ||
      !snapshot?.sessions.some((session) => session.id === id)
    ) {
      return;
    }
    followed.current.add(id);
    setFollow(null);
    router.push(`/?crew=${encodeURIComponent(`session:${id}`)}&chat=1`);
  }, [launches, follow, snapshot, router]);
  const value = useMemo(
    () => ({
      snapshot,
      error,
      initiatives: initiatives ?? [],
      initiativesLoaded: initiatives !== null || initiativesError !== null,
      crews,
      steps,
      archived,
      setArchivedByHand,
      now,
      launches,
      dismissLaunch,
      openLauncher: setLauncher,
    }),
    [
      snapshot,
      error,
      initiatives,
      initiativesError,
      crews,
      steps,
      archived,
      setArchivedByHand,
      now,
      launches,
      dismissLaunch,
    ],
  );
  return (
    <MonitorContext.Provider value={value}>
      {children}
      {launcher && (
        <LaunchDialog
          kind={launcher}
          onClose={() => setLauncher(null)}
          onLaunched={(launch) => {
            addLaunch(launch);
            setFollow(launch.launchName);
          }}
        />
      )}
    </MonitorContext.Provider>
  );
}

export function useMonitorData(): MonitorData {
  const value = useContext(MonitorContext);
  if (!value) {
    throw new Error("useMonitorData must be used inside MonitorDataProvider");
  }
  return value;
}

/** Whether the crew's orchestrator session also drives another initiative. */
export function sharesSession(crew: Crew, crews: Crew[]): boolean {
  const id = crew.session?.id;
  return (
    id !== undefined &&
    crews.filter((other) => other.session?.id === id).length > 1
  );
}

/** The session runs that belong to this crew. */
export function crewRuns(crew: Crew, crews: Crew[]): AgentInfo[] {
  const all = crew.session?.agents ?? [];
  return crew.initiative && sharesSession(crew, crews)
    ? initiativeRuns(crew.initiative, all)
    : all;
}

/** A crew's session, its runs and its initiative's merges: what makes it wait on you. */
export function crewAttention(
  crew: Crew | undefined,
  crews: Crew[],
  snapshot: Snapshot | null,
  now: number,
): AttentionItem[] {
  const session = crew?.session;
  if (!crew || !session) {
    return [];
  }
  const sourceIds = new Set([
    `session:${session.id}`,
    ...crewRuns(crew, crews).map((agent) => agent.id),
  ]);
  return collectAttention(
    snapshot,
    now,
    crew.initiative ? [crew.initiative] : [],
  ).filter((item) => item.kind === "merge" || sourceIds.has(item.sourceId));
}

/**
 * `?crew=` takes a crew key, or the id of a session any crew runs in; without
 * one, the first crew still in the active list.
 */
export function findCrew(
  crews: Crew[],
  requested: string | null,
  archived: ReadonlyMap<string, ArchiveReason> = new Map(),
): Crew | undefined {
  const fallback = crews.find((crew) => !archived.has(crew.key)) ?? crews[0];
  if (!requested) {
    return fallback;
  }
  const sessionId = requested.startsWith("session:")
    ? requested.slice("session:".length)
    : undefined;
  return (
    crews.find((crew) => crew.key === requested) ??
    crews.find((crew) => sessionId && crew.session?.id === sessionId) ??
    fallback
  );
}
