"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamItem } from "@/lib/claude/types";

type ToolItem = Extract<StreamItem, { kind: "tool" }>;
type ResultItem = Extract<StreamItem, { kind: "result" }>;

const MAX_ITEMS = 4000;

function merge(
  current: StreamItem[],
  incoming: StreamItem[],
  where: "start" | "end",
): StreamItem[] {
  const seen = new Set(current.map((item) => item.id));
  const fresh = incoming.filter((item) => !seen.has(item.id));
  if (fresh.length === 0) {
    return current;
  }
  const next =
    where === "end" ? [...current, ...fresh] : [...fresh, ...current];
  return where === "end" ? next.slice(-MAX_ITEMS) : next.slice(0, MAX_ITEMS);
}

/**
 * One transcript as a conversation: the live tail over SSE, and older pages on
 * demand from the byte cursor the stream reports. Never reads the whole file.
 */
export function useChatStream(sourceId: string) {
  const [items, setItems] = useState<StreamItem[]>([]);
  const [connected, setConnected] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const loading = useRef(false);

  useEffect(() => {
    setItems([]);
    setConnected(false);
    setCursor(null);
    const source = new EventSource(
      `/api/sources/${encodeURIComponent(sourceId)}/stream`,
    );
    source.addEventListener("items", (message) => {
      setConnected(true);
      const incoming = JSON.parse(
        (message as MessageEvent<string>).data,
      ) as StreamItem[];
      setItems((current) => merge(current, incoming, "end"));
    });
    source.addEventListener("cursor", (message) => {
      const { before } = JSON.parse((message as MessageEvent<string>).data) as {
        before: number;
      };
      setCursor((current) => (current === null ? before : current));
    });
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [sourceId]);

  const loadOlder = useCallback(async () => {
    if (loading.current || cursor === null || cursor <= 0) {
      return;
    }
    loading.current = true;
    setLoadingOlder(true);
    setOlderError(null);
    try {
      const response = await fetch(
        `/api/sources/${encodeURIComponent(sourceId)}/history?before=${cursor}`,
        { cache: "no-store" },
      );
      const page = (await response.json()) as {
        items?: StreamItem[];
        cursor?: number;
        error?: string;
      };
      if (!response.ok || page.cursor === undefined) {
        throw new Error(page.error ?? `History failed (${response.status})`);
      }
      setItems((current) => merge(current, page.items ?? [], "start"));
      setCursor(page.cursor);
    } catch (caught) {
      setOlderError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      loading.current = false;
      setLoadingOlder(false);
    }
  }, [cursor, sourceId]);

  return {
    items,
    connected,
    hasOlder: cursor !== null && cursor > 0,
    loadingOlder,
    olderError,
    loadOlder,
  };
}

export interface ToolCall {
  item: ToolItem;
  result?: ResultItem;
}

export type ChatEntry =
  | { kind: "you"; id: string; ts: string; text: string }
  | {
      kind: "incoming";
      id: string;
      ts: string;
      text: string;
      /** Run id when the transcript names the sender. */
      from?: string;
      label: "Hand-back" | "Message" | "From the orchestrator";
    }
  | { kind: "system"; id: string; ts: string; text: string }
  | { kind: "reply"; id: string; ts: string; text: string }
  | { kind: "tools"; id: string; ts: string; calls: ToolCall[] }
  | {
      kind: "report";
      id: string;
      ts: string;
      status?: string;
      text: string;
    };

const AGENT_MESSAGE =
  /^<agent-message from="([^"]+)">\s*([\s\S]*?)\s*(?:<\/agent-message>)?\s*$/;
const HANDBACK_PREAMBLE = /^\[Subagent hand-back\][^\n]*\n?/;
const SYSTEM_PREFIXES = [
  "[SYSTEM NOTIFICATION",
  "[handback-send-enforce]",
  "Stop hook feedback:",
];
const RELAYS = [
  /^The coordinator sent a message while you were working:\s*/,
  /^The user sent a new message while you were working:\s*/,
  /^Another Claude session sent a message[^\n]*\n?/,
];

/** The harness indents every line of a hand-back report by two spaces. */
function dedent(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^ {2}/, ""))
    .join("\n")
    .trim();
}

function promptEntry(
  item: { id: string; ts: string; text: string },
  isSession: boolean,
): ChatEntry {
  const text = RELAYS.reduce(
    (current, pattern) => current.replace(pattern, ""),
    item.text.trim(),
  );
  const base = { id: item.id, ts: item.ts };
  const message = AGENT_MESSAGE.exec(text);
  if (message) {
    const body = message[2];
    const handback = HANDBACK_PREAMBLE.test(body);
    return {
      ...base,
      kind: "incoming",
      from: message[1],
      label: handback ? "Hand-back" : "Message",
      text: handback ? dedent(body.replace(HANDBACK_PREAMBLE, "")) : body,
    };
  }
  if (SYSTEM_PREFIXES.some((prefix) => text.startsWith(prefix))) {
    return { ...base, kind: "system", text };
  }
  if (isSession) {
    return {
      ...base,
      kind: "you",
      text,
    };
  }
  return {
    ...base,
    kind: "incoming",
    label: "From the orchestrator",
    text,
  };
}

/** Folds stream items into chat entries: consecutive tool calls become one row. */
export function chatEntries(
  items: StreamItem[],
  isSession: boolean,
): ChatEntry[] {
  const results = new Map<string, ResultItem>();
  for (const item of items) {
    if (item.kind === "result") {
      results.set(item.toolUseId, item);
    }
  }
  const entries: ChatEntry[] = [];
  for (const item of items) {
    switch (item.kind) {
      case "result":
        break;
      case "tool": {
        const call = { item, result: results.get(item.toolUseId) };
        const last = entries.at(-1);
        if (last?.kind === "tools") {
          last.calls.push(call);
        } else {
          entries.push({
            kind: "tools",
            id: item.id,
            ts: item.ts,
            calls: [call],
          });
        }
        break;
      }
      case "text":
        entries.push({
          kind: "reply",
          id: item.id,
          ts: item.ts,
          text: item.text,
        });
        break;
      case "report":
        entries.push({
          kind: "report",
          id: item.id,
          ts: item.ts,
          status: item.status,
          text: item.text,
        });
        break;
      case "prompt":
        entries.push(promptEntry(item, isSession));
        break;
    }
  }
  return entries;
}

/** The terminal takes one line: the message route joins lines with spaces before typing. */
export function asTyped(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/** Whether the transcript now holds a prompt with this text: the optimistic send landed. */
export function landed(
  entries: ChatEntry[],
  text: string,
  after: number,
): boolean {
  const wanted = asTyped(text);
  return entries.some(
    (entry) =>
      entry.kind === "you" &&
      Date.parse(entry.ts) >= after - 5_000 &&
      asTyped(entry.text) === wanted,
  );
}
