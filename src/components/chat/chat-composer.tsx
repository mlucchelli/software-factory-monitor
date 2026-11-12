"use client";

import { Send } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { LiveProcess } from "@/lib/claude/types";
import { roleStyle, SESSION_ROLE } from "@/lib/client/present";
import { terminalLabel } from "@/lib/terminal/ref";

/** Why the message route would refuse right now, in the words the composer shows. */
export function refusal(live?: LiveProcess): string | null {
  if (!live) {
    return "The session's process is not running, so there is no terminal to type into.";
  }
  if (!live.terminal) {
    return "This session is not running inside tmux or Orca, so the monitor cannot type into it.";
  }
  if (live.prompt) {
    return "The session is showing a question. Answer it above first.";
  }
  if (live.status !== "idle") {
    return `The session is ${live.status ?? "busy"}. You can write now; sending opens once it is idle.`;
  }
  return null;
}

/**
 * The message box. Pressing Enter here is the explicit act that types into the
 * named session's terminal, so the header always says which one it is.
 */
export function ChatComposer({
  live,
  draft,
  onDraftChange,
  onSend,
  sending,
}: {
  live?: LiveProcess;
  draft: string;
  onDraftChange: (text: string) => void;
  onSend: (text: string) => void;
  sending: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const [composing, setComposing] = useState(false);
  const reason = refusal(live);
  const canSend = !reason && !sending && draft.trim().length > 0;
  const color = roleStyle(SESSION_ROLE).color;

  useEffect(() => {
    const element = box.current;
    if (element) {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
    }
  });

  const send = () => {
    if (canSend) {
      onSend(draft);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !composing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="grid gap-1.5 border-t border-hairline bg-page px-4 pt-2.5 pb-3"
    >
      <div className="mx-auto grid w-full max-w-3xl gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: color }}
            aria-hidden
          />
          <span className="shrink-0">To</span>
          <span className="truncate font-medium text-ink">
            {live?.name ?? "this session"}
          </span>
          {live?.terminal && (
            <span className="shrink-0 font-mono">
              {terminalLabel(live.terminal)}
            </span>
          )}
          {live?.status && (
            <span className="ml-auto shrink-0">{live.status}</span>
          )}
        </span>
        <div
          className={`flex items-end gap-2 rounded-xl bg-surface px-3 py-2 ring-1 transition-shadow ${
            reason ? "ring-hairline" : "ring-axis focus-within:ring-ink/40"
          }`}
        >
          <textarea
            ref={box}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={onKeyDown}
            onCompositionStart={() => setComposing(true)}
            onCompositionEnd={() => setComposing(false)}
            rows={1}
            placeholder={
              reason && !live?.terminal
                ? "Read-only"
                : `Message ${live?.name ?? "the session"}`
            }
            disabled={!live?.terminal}
            aria-label={`Message to ${live?.name ?? "the session"}`}
            aria-describedby="composer-hint"
            className="max-h-[220px] min-h-6 flex-1 resize-none bg-transparent text-sm leading-6 text-ink outline-none placeholder:text-muted disabled:cursor-not-allowed"
          />
          {live?.terminal && (
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-page transition-opacity disabled:opacity-30"
              aria-label="Send"
            >
              <Send className="size-3.5" aria-hidden />
              {sending ? "Sending" : "Send"}
            </button>
          )}
        </div>
        <p id="composer-hint" className="text-[10px] text-muted">
          {reason ??
            "Enter sends · Shift+Enter adds a line · lines are joined into one when typed into the terminal"}
        </p>
      </div>
    </form>
  );
}
