"use client";

import { useEffect, useState } from "react";
import type { ActivityEvent, Snapshot, StreamItem } from "@/lib/claude/types";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function usePolling<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`${url} responded ${response.status}`);
        }
        const json = (await response.json()) as T;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    };
    load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  return { data, error };
}

export function useSnapshot() {
  return usePolling<Snapshot>("/api/snapshot", 4000);
}

function mergeEvents(
  current: ActivityEvent[],
  incoming: ActivityEvent[],
  limit: number,
): ActivityEvent[] {
  const seen = new Set(current.map((event) => event.id));
  const fresh = incoming.filter((event) => !seen.has(event.id));
  if (fresh.length === 0) {
    return current;
  }
  return [...current, ...fresh]
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .slice(-limit);
}

export function useActivity(backfillMinutes = 15, limit = 2000) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const merge = (incoming: ActivityEvent[]) =>
      setEvents((current) => mergeEvents(current, incoming, limit));

    fetch(`/api/activity?minutes=${backfillMinutes}`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((initial: ActivityEvent[]) => {
        if (!cancelled) {
          merge(initial);
        }
      })
      .catch(() => {});

    const source = new EventSource("/api/stream");
    source.addEventListener("ready", () => setConnected(true));
    source.addEventListener("activity", (message) => {
      merge(JSON.parse((message as MessageEvent<string>).data));
    });
    source.onerror = () => setConnected(false);

    return () => {
      cancelled = true;
      source.close();
    };
  }, [backfillMinutes, limit]);

  return { events, connected };
}

export function useSourceStream(sourceId: string | null, limit = 600) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setItems([]);
    setConnected(false);
    if (!sourceId) {
      return;
    }
    const source = new EventSource(
      `/api/sources/${encodeURIComponent(sourceId)}/stream`,
    );
    source.addEventListener("items", (message) => {
      setConnected(true);
      const incoming = JSON.parse(
        (message as MessageEvent<string>).data,
      ) as StreamItem[];
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        const fresh = incoming.filter((item) => !seen.has(item.id));
        return fresh.length === 0
          ? current
          : [...current, ...fresh].slice(-limit);
      });
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [sourceId, limit]);

  return { items, connected };
}
