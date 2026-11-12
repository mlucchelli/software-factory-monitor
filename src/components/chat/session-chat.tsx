"use client";

import { Info } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentInfo, SessionInfo } from "@/lib/claude/types";
import { asTyped, type ChatEntry, landed } from "@/lib/client/chat";
import { roleStyle, SESSION_ROLE } from "@/lib/client/present";
import { ChatComposer } from "./chat-composer";
import { ChatTranscript, type OutgoingMessage } from "./chat-view";

async function postMessage(sessionId: string, text: string) {
  const response = await fetch(`/api/sessions/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(json.error ?? `Request failed (${response.status})`);
  }
}

const drafts = new Map<string, string>();

/** A live session as a chat: its transcript, and a composer that types into its terminal. */
export function SessionChat({
  session,
  prefill,
  onPrefillUsed,
  onAnswer,
}: {
  session: SessionInfo;
  /** Text to start the composer with, e.g. a reference to a sub-agent. */
  prefill?: string;
  onPrefillUsed?: () => void;
  onAnswer?: () => void;
}) {
  const [draft, setDraftState] = useState(() => drafts.get(session.id) ?? "");
  const [outgoing, setOutgoing] = useState<OutgoingMessage[]>([]);
  const entriesRef = useRef<ChatEntry[]>([]);
  const agents = useMemo(
    () => new Map(session.agents.map((agent) => [agent.id, agent])),
    [session.agents],
  );

  const setDraft = useCallback(
    (text: string) => {
      drafts.set(session.id, text);
      setDraftState(text);
    },
    [session.id],
  );

  useEffect(() => {
    if (prefill) {
      setDraft(prefill);
      onPrefillUsed?.();
    }
  }, [prefill, onPrefillUsed, setDraft]);

  const reconcile = useCallback((entries: ChatEntry[]) => {
    entriesRef.current = entries;
    setOutgoing((list) => {
      const next = list.filter(
        (message) =>
          message.state === "failed" ||
          !landed(entries, message.text, message.at),
      );
      return next.length === list.length ? list : next;
    });
  }, []);

  const send = async (text: string) => {
    const message: OutgoingMessage = {
      id: `out-${Date.now()}`,
      text: asTyped(text),
      at: Date.now(),
      state: "sending",
    };
    setOutgoing((list) => [...list, message]);
    setDraft("");
    try {
      await postMessage(session.id, text);
      setOutgoing((list) =>
        list.map((item) =>
          item.id === message.id ? { ...item, state: "sent" } : item,
        ),
      );
      reconcile(entriesRef.current);
    } catch (caught) {
      setOutgoing((list) =>
        list.map((item) =>
          item.id === message.id
            ? {
                ...item,
                state: "failed",
                error:
                  caught instanceof Error ? caught.message : String(caught),
              }
            : item,
        ),
      );
    }
  };

  const live = session.live;
  const sending = outgoing.some((message) => message.state === "sending");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatTranscript
        sourceId={`session:${session.id}`}
        isSession
        roleType={SESSION_ROLE}
        agents={agents}
        outgoing={outgoing}
        onEntries={reconcile}
        onRetry={(message) => {
          setDraft(message.text);
          setOutgoing((list) => list.filter((item) => item.id !== message.id));
        }}
        onDismiss={(id) =>
          setOutgoing((list) => list.filter((item) => item.id !== id))
        }
        question={live?.prompt}
        onAnswer={live?.terminal ? onAnswer : undefined}
        working={session.status === "running"}
      />
      <ChatComposer
        live={live}
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        sending={sending}
      />
    </div>
  );
}

/**
 * A sub-agent's conversation, read-only: it has no terminal of its own, so the
 * only way to reach it is through the orchestrator that runs it.
 */
export function AgentConversation({
  agent,
  session,
  onAskOrchestrator,
}: {
  agent: AgentInfo;
  session?: SessionInfo;
  onAskOrchestrator?: () => void;
}) {
  const agents = useMemo(
    () => new Map((session?.agents ?? []).map((run) => [run.id, run])),
    [session?.agents],
  );
  const role = roleStyle(agent.type);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatTranscript
        sourceId={agent.id}
        isSession={false}
        roleType={agent.type}
        agents={agents}
        working={agent.status === "running"}
      />
      <div className="border-t border-hairline bg-page px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl items-start gap-2 text-[11px] text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span style={{ color: role.color }}>{role.label}</span> runs have no
            terminal of their own. Messages to them go through the orchestrator,
            which forwards them.
          </p>
          {onAskOrchestrator && (
            <button
              type="button"
              onClick={onAskOrchestrator}
              className="shrink-0 rounded-md px-2 py-0.5 text-ink-secondary ring-1 ring-hairline hover:bg-surface hover:text-ink"
            >
              Ask the orchestrator
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** What the orchestrator's composer starts with when you ask about one of its runs. */
export function aboutRun(agent: AgentInfo): string {
  const role = roleStyle(agent.type).label;
  const ticket = agent.ticket ? ` on ${agent.ticket}` : "";
  return `About the ${role.toLowerCase()} run ${agent.id}${ticket} ("${agent.description ?? agent.type}"): `;
}
