"use client";

import { useCallback, useEffect, useState } from "react";
import type { Initiative } from "@/lib/initiatives";
import { PHASE_STEPS } from "./mission";

/** Why an initiative left the active list, most authoritative first. */
export type ArchiveReason = "closed" | "done" | "canceled" | "manual";

const CLOSE_PHASE = PHASE_STEPS[PHASE_STEPS.length - 1].after;

export const ARCHIVE_LABEL: Record<ArchiveReason, string> = {
  closed: "Closed",
  done: "Done in Linear",
  canceled: "Canceled in Linear",
  manual: "Archived by you",
};

export const ARCHIVE_EXPLANATION: Record<ArchiveReason, string> = {
  closed: "The registry reached the Close phase.",
  done: "The parent issue is Done in Linear.",
  canceled: "The parent issue is Canceled in Linear.",
  manual:
    "You archived it from this browser. The registry and Linear still read as active.",
};

/**
 * Finished by the data alone: the registry reached Close, or Linear closed the
 * parent issue even though the registry was never updated.
 */
export function finishedReason(
  initiative: Initiative,
): Exclude<ArchiveReason, "manual"> | undefined {
  if (
    initiative.phaseNumber !== undefined &&
    initiative.phaseNumber >= CLOSE_PHASE
  ) {
    return "closed";
  }
  switch (initiative.parent?.state.type) {
    case "completed":
      return "done";
    case "canceled":
      return "canceled";
    default:
      return undefined;
  }
}

export function archiveReason(
  initiative: Initiative | undefined,
  archivedByHand: ReadonlySet<string>,
): ArchiveReason | undefined {
  if (!initiative) {
    return undefined;
  }
  return (
    finishedReason(initiative) ??
    (archivedByHand.has(initiative.key) ? "manual" : undefined)
  );
}

const ARCHIVED_KEY = "agents-monitor:archived-initiatives";

function readArchived(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(ARCHIVED_KEY) ?? "[]",
    );
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((key): key is string => typeof key === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeArchived(keys: Set<string>) {
  try {
    window.localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...keys]));
  } catch {}
}

/** Initiatives archived by hand, remembered per browser and kept in step across tabs. */
export function useArchivedByHand() {
  const [archived, setArchived] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    setArchived(readArchived());
    const onStorage = (event: StorageEvent) => {
      if (event.key === ARCHIVED_KEY) {
        setArchived(readArchived());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const setArchivedByHand = useCallback((key: string, value: boolean) => {
    setArchived((current) => {
      const next = new Set(current);
      if (value) {
        next.add(key);
      } else {
        next.delete(key);
      }
      writeArchived(next);
      return next;
    });
  }, []);
  return { archivedByHand: archived, setArchivedByHand };
}

/** A collapsible group's open state, remembered per browser; closed until opened. */
export function useRememberedOpen(storageKey: string) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(storageKey) === "1");
    } catch {}
  }, [storageKey]);
  const toggle = useCallback(() => {
    setOpen((value) => {
      try {
        window.localStorage.setItem(storageKey, value ? "0" : "1");
      } catch {}
      return !value;
    });
  }, [storageKey]);
  return { open, toggle };
}
