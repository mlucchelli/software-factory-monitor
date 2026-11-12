"use client";

import { useCallback, useEffect, useState } from "react";

export type LaunchKind = "session" | "initiative";

export interface Launch {
  launchName: string;
  kind: LaunchKind;
  /** What the rail shows while it starts: the repo, or the initiative argument. */
  label: string;
  at: number;
  sessionId?: string;
  failed?: string;
}

const STORAGE_KEY = "agents-monitor:launches";
const KEEP_MS = 24 * 60 * 60_000;
const POLL_MS = 1500;
const GIVE_UP_MS = 35_000;

function read(): Launch[] {
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    ) as Launch[];
    return stored.filter((launch) => Date.now() - launch.at < KEEP_MS);
  } catch {
    return [];
  }
}

function write(launches: Launch[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(launches));
  } catch {}
}

/**
 * Sessions started from this browser. A launch stays "starting" until the
 * server sees Claude Code register it, then carries its session id so the
 * session gets a rail row even before it has a team.
 */
export function useLaunchStore() {
  const [launches, setLaunches] = useState<Launch[]>([]);
  useEffect(() => setLaunches(read()), []);

  const update = useCallback((change: (current: Launch[]) => Launch[]) => {
    setLaunches((current) => {
      const next = change(current);
      write(next);
      return next;
    });
  }, []);

  const addLaunch = useCallback(
    (launch: Launch) =>
      update((current) => [
        ...current.filter((item) => item.launchName !== launch.launchName),
        launch,
      ]),
    [update],
  );

  const dismissLaunch = useCallback(
    (launchName: string) =>
      update((current) =>
        current.filter((item) => item.launchName !== launchName),
      ),
    [update],
  );

  const waiting = launches.some(
    (launch) => !launch.sessionId && !launch.failed,
  );
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const poll = async () => {
      const response = await fetch("/api/sessions", {
        cache: "no-store",
      }).catch(() => null);
      const body = response?.ok
        ? ((await response.json()) as {
            launch?: { launchName: string; sessionId?: string } | null;
          })
        : null;
      update((current) =>
        current.map((launch) => {
          if (launch.sessionId || launch.failed) {
            return launch;
          }
          if (
            body?.launch?.launchName === launch.launchName &&
            body.launch.sessionId
          ) {
            return { ...launch, sessionId: body.launch.sessionId };
          }
          return Date.now() - launch.at > GIVE_UP_MS
            ? {
                ...launch,
                failed:
                  "No session appeared in 35s. Check its terminal; the trust prompt may be waiting.",
              }
            : launch;
        }),
      );
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, update]);

  return { launches, addLaunch, dismissLaunch };
}
