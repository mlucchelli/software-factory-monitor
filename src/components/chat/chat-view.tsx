"use client";

import {
  ArrowDown,
  ChevronRight,
  CircleAlert,
  Flag,
  Loader2,
  MessageCircleQuestion,
  Reply,
  UserRound,
} from "lucide-react";
import {
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AgentInfo, ScreenPrompt } from "@/lib/claude/types";
import {
  type ChatEntry,
  chatEntries,
  type ToolCall,
  useChatStream,
} from "@/lib/client/chat";
import { formatClock, roleStyle } from "@/lib/client/present";
import { looksLikeReport } from "@/lib/report-fields";
import { ToolRow } from "../stream/stream-view";
import { StatusPill } from "../ui";
import { Markdown } from "./markdown";
import { ReportCard } from "./report-card";

const STICK_PX = 96;
const LONG_MESSAGE = 1600;

export interface OutgoingMessage {
  id: string;
  text: string;
  at: number;
  state: "sending" | "sent" | "failed";
  error?: string;
}

function Collapsible({
  text,
  children,
}: {
  text: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(text.length <= LONG_MESSAGE);
  return (
    <div className="grid min-w-0 gap-1">
      <div
        className={open ? "" : "relative max-h-48 overflow-hidden"}
        style={
          open
            ? undefined
            : {
                maskImage: "linear-gradient(black 60%, transparent)",
                WebkitMaskImage: "linear-gradient(black 60%, transparent)",
              }
        }
      >
        {children}
      </div>
      {text.length > LONG_MESSAGE && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="w-fit text-[11px] text-ink-secondary hover:text-ink"
        >
          {open ? "Show less" : "Show the whole message"}
        </button>
      )}
    </div>
  );
}

function ToolGroup({ calls, color }: { calls: ToolCall[]; color: string }) {
  const [open, setOpen] = useState(false);
  const pending = calls.some((call) => call.result === undefined);
  const failed = calls.filter((call) => call.result?.isError).length;
  const names = [...new Set(calls.map((call) => call.item.tool))];
  const last = calls.at(-1)?.item;
  return (
    <div className="min-w-0 rounded-md ring-1 ring-hairline">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-muted hover:text-ink"
      >
        <ChevronRight
          className={`size-3.5 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
        {pending ? (
          <Loader2
            className="size-3 shrink-0 animate-spin motion-reduce:animate-none"
            style={{ color }}
            aria-label="Running"
          />
        ) : null}
        <span className="shrink-0 text-ink-secondary">
          {calls.length} tool call{calls.length === 1 ? "" : "s"}
        </span>
        <span className="min-w-0 truncate">
          {open ? names.join(", ") : `${last?.tool} · ${last?.summary}`}
        </span>
        {failed > 0 && (
          <span className="ml-auto shrink-0 text-status-critical">
            {failed} failed
          </span>
        )}
      </button>
      <div className="expand" data-open={open}>
        <div inert={!open}>
          <div className="grid gap-2 border-t border-hairline px-2.5 py-2">
            {calls.map((call) => (
              <ToolRow
                key={call.item.id}
                item={call.item}
                result={call.result}
                color={color}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function senderLabel(
  entry: Extract<ChatEntry, { kind: "incoming" }>,
  agents: Map<string, AgentInfo>,
) {
  const agent = entry.from ? agents.get(entry.from) : undefined;
  const role = roleStyle(agent?.type ?? (entry.from ? "other" : "session"));
  return {
    color: role.color,
    name: agent
      ? `${role.label} · ${agent.description ?? agent.id}`
      : entry.from
        ? entry.from
        : "Orchestrator",
  };
}

function Entry({
  entry,
  previous,
  color,
  agents,
  isSession,
}: {
  entry: ChatEntry;
  previous?: ChatEntry;
  color: string;
  agents: Map<string, AgentInfo>;
  isSession: boolean;
}) {
  switch (entry.kind) {
    case "you":
      return (
        <div className="flex justify-end">
          <div className="grid max-w-[85%] min-w-0 gap-1 rounded-2xl rounded-br-md bg-surface-raised px-3 py-2 ring-1 ring-hairline">
            <span className="flex items-center gap-1 text-[10px] text-muted">
              <UserRound className="size-3" aria-hidden />
              You · {formatClock(entry.ts)}
            </span>
            <p className="text-[13px] whitespace-pre-wrap break-words text-ink">
              {entry.text}
            </p>
          </div>
        </div>
      );
    case "incoming": {
      const sender = senderLabel(entry, agents);
      return (
        <div
          className="grid min-w-0 gap-1.5 rounded-lg bg-surface px-3 py-2 ring-1 ring-hairline"
          style={{ boxShadow: `inset 2px 0 0 ${sender.color}` }}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
            <Reply className="size-3 shrink-0" aria-hidden />
            <span className="shrink-0 font-medium text-ink-secondary">
              {entry.label}
            </span>
            <span className="min-w-0 truncate" style={{ color: sender.color }}>
              {entry.label === "From the orchestrator" ? "" : sender.name}
            </span>
            <span className="ml-auto shrink-0 tabular">
              {formatClock(entry.ts)}
            </span>
          </span>
          {looksLikeReport(entry.text) ? (
            <ReportCard text={entry.text} />
          ) : (
            <Collapsible text={entry.text}>
              <Markdown text={entry.text} />
            </Collapsible>
          )}
        </div>
      );
    }
    case "system":
      return (
        <p
          className="truncate text-center text-[10px] text-muted"
          title={entry.text}
        >
          {entry.text.split("\n")[0]}
        </p>
      );
    case "reply": {
      const continued =
        previous?.kind === "reply" || previous?.kind === "tools";
      return (
        <div className="grid min-w-0 gap-1">
          {!continued && (
            <span className="flex items-center gap-1.5 text-[10px] text-muted">
              <span
                className="size-1.5 rounded-full"
                style={{ background: color }}
                aria-hidden
              />
              {isSession ? "Session" : "Agent"} · {formatClock(entry.ts)}
            </span>
          )}
          <Collapsible text={entry.text}>
            <Markdown text={entry.text} />
          </Collapsible>
        </div>
      );
    }
    case "tools":
      return <ToolGroup calls={entry.calls} color={color} />;
    case "report":
      return (
        <div
          className="grid min-w-0 gap-1.5 rounded-lg bg-surface px-3 py-2 ring-1 ring-hairline"
          style={{ boxShadow: `inset 2px 0 0 ${color}` }}
        >
          <span className="flex items-center gap-2 text-[11px] text-muted">
            <Flag className="size-3" aria-hidden />
            Report handed back
            {entry.status && !looksLikeReport(entry.text) && (
              <StatusPill status="reported" reportStatus={entry.status} />
            )}
          </span>
          {looksLikeReport(entry.text) ? (
            <ReportCard text={entry.text} />
          ) : (
            <Collapsible text={entry.text}>
              <Markdown text={entry.text} />
            </Collapsible>
          )}
        </div>
      );
  }
}

function Outgoing({
  message,
  onRetry,
  onDismiss,
}: {
  message: OutgoingMessage;
  onRetry: (message: OutgoingMessage) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="flex justify-end">
      <div
        className={`grid max-w-[85%] min-w-0 gap-1 rounded-2xl rounded-br-md px-3 py-2 ring-1 ${
          message.state === "failed"
            ? "bg-status-critical/10 ring-status-critical/50"
            : "bg-surface-raised/60 ring-hairline"
        }`}
      >
        <span className="flex items-center gap-1 text-[10px] text-muted">
          {message.state === "failed" ? (
            <CircleAlert className="size-3 text-status-critical" aria-hidden />
          ) : (
            <Loader2
              className="size-3 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          )}
          {message.state === "sending"
            ? "Typing into the terminal…"
            : message.state === "sent"
              ? "Sent — waiting for it to show in the transcript"
              : "Not sent"}
        </span>
        <p className="text-[13px] whitespace-pre-wrap break-words text-ink-secondary">
          {message.text}
        </p>
        {message.state === "failed" && (
          <div className="grid gap-1">
            <p className="text-[11px] text-status-critical">{message.error}</p>
            <div className="flex gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="text-ink-secondary underline hover:text-ink"
              >
                Back to the composer
              </button>
              <button
                type="button"
                onClick={() => onDismiss(message.id)}
                className="text-muted hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionCard({
  prompt,
  onAnswer,
}: {
  prompt: ScreenPrompt;
  onAnswer?: () => void;
}) {
  return (
    <div className="motion-rise grid gap-2 rounded-lg border border-status-warning/60 bg-status-warning/[0.06] px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-status-warning">
        <MessageCircleQuestion className="size-3.5" aria-hidden />
        Waiting for your answer
      </span>
      {prompt.question && (
        <p className="text-[13px] text-ink">{prompt.question}</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {prompt.options.map((option) => (
          <button
            key={option.number}
            type="button"
            onClick={onAnswer}
            disabled={!onAnswer}
            title={option.description}
            className="rounded-md bg-surface px-2 py-1 text-left text-xs text-ink ring-1 ring-hairline enabled:hover:bg-surface-raised disabled:opacity-60"
          >
            <span className="mr-1 text-muted tabular">{option.number}.</span>
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted">
        {onAnswer
          ? "Picking an option opens the answer dialog, which shows the live terminal and asks you to confirm the keys."
          : "This session is not in tmux, so it has to be answered in its terminal."}
      </p>
    </div>
  );
}

/**
 * A transcript read as a conversation. It follows the live tail while you are
 * at the bottom, and holds still with a "new messages" pill when you are not.
 */
export function ChatTranscript({
  sourceId,
  isSession,
  roleType,
  agents,
  outgoing = [],
  onRetry,
  onDismiss,
  onEntries,
  question,
  onAnswer,
  working,
}: {
  sourceId: string;
  isSession: boolean;
  roleType: string;
  agents: Map<string, AgentInfo>;
  outgoing?: OutgoingMessage[];
  onRetry?: (message: OutgoingMessage) => void;
  onDismiss?: (id: string) => void;
  onEntries?: (entries: ChatEntry[]) => void;
  question?: ScreenPrompt;
  onAnswer?: () => void;
  working: boolean;
}) {
  const { items, connected, hasOlder, loadingOlder, olderError, loadOlder } =
    useChatStream(sourceId);
  const entries = useMemo(
    () => chatEntries(items, isSession),
    [items, isSession],
  );
  const color = roleStyle(roleType).color;
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const lastCount = useRef(0);
  const prependFrom = useRef<number | null>(null);
  const [unread, setUnread] = useState(0);

  const onEntriesRef = useRef(onEntries);
  onEntriesRef.current = onEntries;
  useLayoutEffect(() => {
    onEntriesRef.current?.(entries);
  }, [entries]);

  const tailId = entries.at(-1)?.id;
  const tailSize = outgoing.length + (question ? 1 : 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-anchors when the tail or its size changes
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    if (prependFrom.current !== null) {
      element.scrollTop += element.scrollHeight - prependFrom.current;
      prependFrom.current = null;
      lastCount.current = entries.length;
      return;
    }
    const added = Math.max(0, entries.length - lastCount.current);
    lastCount.current = entries.length;
    if (atBottom.current) {
      element.scrollTop = element.scrollHeight;
      setUnread(0);
    } else if (added > 0) {
      setUnread((count) => count + added);
    }
  }, [tailId, entries.length, tailSize]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICK_PX;
    if (atBottom.current) {
      setUnread(0);
    }
  };

  const jump = () => {
    const element = scroller.current;
    if (element) {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    }
    atBottom.current = true;
    setUnread(0);
  };

  const older = async () => {
    prependFrom.current = scroller.current?.scrollHeight ?? null;
    await loadOlder();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        role="log"
        aria-live="polite"
        aria-label="Conversation"
      >
        <div className="mx-auto grid max-w-3xl gap-3">
          {hasOlder ? (
            <button
              type="button"
              onClick={older}
              disabled={loadingOlder}
              className="mx-auto rounded-full px-3 py-1 text-[11px] text-muted ring-1 ring-hairline enabled:hover:text-ink"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          ) : (
            connected &&
            entries.length > 0 && (
              <p className="text-center text-[10px] text-muted">
                Start of the conversation
              </p>
            )
          )}
          {olderError && (
            <p className="text-center text-[11px] text-status-critical">
              {olderError}
            </p>
          )}
          {entries.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">
              {connected ? "Nothing in the recent transcript." : "Connecting…"}
            </p>
          )}
          {entries.map((entry, index) => (
            <Entry
              key={entry.id}
              entry={entry}
              previous={entries[index - 1]}
              color={color}
              agents={agents}
              isSession={isSession}
            />
          ))}
          {outgoing.map((message) => (
            <Outgoing
              key={message.id}
              message={message}
              onRetry={onRetry ?? (() => {})}
              onDismiss={onDismiss ?? (() => {})}
            />
          ))}
          {question && <QuestionCard prompt={question} onAnswer={onAnswer} />}
          {working && !question && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="relative flex size-1.5" aria-hidden>
                <span
                  className="motion-breathe absolute inset-0 rounded-full"
                  style={{ background: color }}
                />
                <span
                  className="relative size-1.5 rounded-full"
                  style={{ background: color }}
                />
              </span>
              Working…
            </p>
          )}
        </div>
      </div>
      {unread > 0 && (
        <button
          type="button"
          onClick={jump}
          className="motion-rise absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1 text-xs text-ink shadow-lg ring-1 ring-hairline"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          {unread} new message{unread === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
