"use client";

import { Keyboard, Send, TerminalSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  LiveProcess,
  ScreenPrompt,
  ScreenPromptOption,
} from "@/lib/claude/types";
import { TONE_COLOR } from "@/lib/client/present";
import { terminalLabel } from "@/lib/terminal/ref";

interface TerminalState {
  live?: LiveProcess;
  prompt?: ScreenPrompt | null;
  screen?: string;
  error?: string;
}

const SCREEN_POLL_MS = 1500;

function useTerminal(sessionId: string, enabled: boolean) {
  const [state, setState] = useState<TerminalState>({});
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      const response = await fetch(`/api/sessions/${sessionId}/terminal`, {
        cache: "no-store",
      }).catch(() => null);
      const json = response
        ? ((await response.json().catch(() => ({}))) as TerminalState)
        : { error: "Monitor server unreachable" };
      if (!cancelled) {
        setState(json);
      }
    };
    load();
    const timer = setInterval(load, SCREEN_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [sessionId, enabled]);
  return state;
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
    screen?: string;
  };
  if (!response.ok) {
    throw new Error(json.error ?? `Request failed (${response.status})`);
  }
  return json.screen ?? "";
}

function Screen({ text, caption }: { text?: string; caption: string }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
        <TerminalSquare className="size-3" aria-hidden />
        {caption}
      </figcaption>
      <pre className="max-h-[340px] overflow-auto rounded-md bg-black p-2 font-mono text-[10.5px] leading-snug text-[#d7d7d0] ring-1 ring-hairline">
        {text ? text.split("\n").slice(-40).join("\n") : "…"}
      </pre>
    </figure>
  );
}

function isTextOption(option: ScreenPromptOption): boolean {
  return /^Type something/.test(option.label);
}

type Pending =
  | { type: "options"; numbers: number[]; advance: boolean; summary: string }
  | { type: "text"; number: number; text: string; summary: string };

function PromptForm({
  prompt,
  disabled,
  onPrepare,
}: {
  prompt: ScreenPrompt;
  disabled: boolean;
  onPrepare: (pending: Pending) => void;
}) {
  const initial = prompt.options
    .filter((option) => option.checked)
    .map((option) => option.number);
  const [picked, setPicked] = useState<number[]>(initial);
  const [text, setText] = useState("");
  const textOption = prompt.options.find(isTextOption);
  const choices = prompt.options.filter((option) => !isTextOption(option));
  const labelOf = (numbers: number[]) =>
    numbers
      .map(
        (number) =>
          prompt.options.find((option) => option.number === number)?.label,
      )
      .join(", ") || "nothing";

  return (
    <div className="grid content-start gap-2">
      {prompt.tabs && (
        <div className="flex flex-wrap gap-1">
          {prompt.tabs.map((tab) => (
            <span
              key={tab}
              className="rounded bg-surface-raised px-1.5 py-0.5 text-[11px] text-ink-secondary"
            >
              {tab}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-ink">
        {prompt.question ?? "Choose an option"}
      </p>
      {choices.map((option) => {
        const checked = prompt.multiSelect
          ? picked.includes(option.number)
          : false;
        const row =
          "grid w-full grid-cols-[22px_1fr] gap-2 rounded-md px-2 py-1.5 text-left ring-1 ring-hairline";
        const body = (
          <>
            <span className="font-mono text-xs text-muted">
              {prompt.multiSelect ? (checked ? "[✔]" : "[ ]") : option.number}
            </span>
            <span className="min-w-0">
              <span className="block text-sm text-ink">{option.label}</span>
              {option.description && (
                <span className="block text-xs text-muted">
                  {option.description}
                </span>
              )}
            </span>
          </>
        );
        return prompt.multiSelect ? (
          <button
            key={option.number}
            type="button"
            disabled={disabled}
            aria-pressed={checked}
            onClick={() =>
              setPicked((current) =>
                current.includes(option.number)
                  ? current.filter((number) => number !== option.number)
                  : [...current, option.number],
              )
            }
            className={`${row} ${checked ? "bg-surface-raised" : "hover:bg-page/60"}`}
          >
            {body}
          </button>
        ) : (
          <button
            key={option.number}
            type="button"
            disabled={disabled}
            onClick={() =>
              onPrepare({
                type: "options",
                numbers: [option.number],
                advance: false,
                summary: `press ${option.number} → ${option.label}`,
              })
            }
            className={`${row} hover:bg-page/60`}
          >
            {body}
          </button>
        );
      })}
      {prompt.multiSelect && (
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onPrepare({
              type: "options",
              numbers: picked,
              advance: true,
              summary: `select ${labelOf(picked)}, then Tab to continue`,
            })
          }
          className="justify-self-start rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-hairline enabled:hover:bg-page disabled:opacity-50"
        >
          Continue with {picked.length} selected
        </button>
      )}
      {textOption && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) {
              onPrepare({
                type: "text",
                number: textOption.number,
                text,
                summary: `type "${text.trim()}"`,
              });
            }
          }}
        >
          <input
            type="text"
            value={text}
            disabled={disabled}
            onChange={(event) => setText(event.target.value)}
            placeholder="Or type your own answer"
            className="min-w-0 flex-1 rounded-md bg-page px-2 py-1.5 text-sm text-ink outline-none ring-1 ring-hairline focus:ring-axis"
          />
          <button
            type="submit"
            disabled={disabled || !text.trim()}
            className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-hairline enabled:hover:bg-page disabled:opacity-50"
          >
            Use text
          </button>
        </form>
      )}
    </div>
  );
}

export function AnswerDialog({
  sessionId,
  title,
  onClose,
}: {
  sessionId: string;
  title: string;
  onClose: () => void;
}) {
  const terminal = useTerminal(sessionId, true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answeredOnce, setAnsweredOnce] = useState(false);
  const prompt = terminal.prompt ?? undefined;
  const pane = terminal.live?.terminal
    ? terminalLabel(terminal.live.terminal)
    : undefined;
  const formKey = `${prompt?.question ?? ""}|${prompt?.tabs?.join() ?? ""}|${prompt?.options.map((option) => `${option.number}${option.checked ? "x" : ""}`).join()}`;

  const send = async () => {
    if (!pending || !prompt) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { summary: _summary, ...action } = pending;
      await post(`/api/sessions/${sessionId}/keys`, {
        question: prompt.question ?? null,
        action,
      });
      setAnsweredOnce(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPending(null);
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16"
      role="dialog"
      aria-modal="true"
      aria-label="Answer from the monitor"
    >
      <div className="grid w-full max-w-5xl gap-4 rounded-xl border border-hairline bg-surface p-4 shadow-2xl">
        <header className="flex min-w-0 items-center gap-2">
          <Keyboard className="size-4 text-ink-secondary" aria-hidden />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
            Answer {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {prompt ? (
            <PromptForm
              key={formKey}
              prompt={prompt}
              disabled={sending || pending !== null || !pane}
              onPrepare={setPending}
            />
          ) : (
            <p className="text-sm text-muted">
              {terminal.error ??
                (answeredOnce
                  ? "Answered — the dialog is gone from the terminal."
                  : terminal.screen === undefined
                    ? "Reading the terminal…"
                    : "No question is on the terminal screen.")}
            </p>
          )}
          <Screen
            text={terminal.screen}
            caption={
              pane
                ? `Live terminal · ${terminal.live?.name ?? ""} · ${pane}`
                : "Terminal"
            }
          />
        </div>

        {error && (
          <p
            className="rounded-md px-3 py-2 text-sm ring-1 ring-hairline"
            style={{ boxShadow: `inset 3px 0 0 ${TONE_COLOR.critical}` }}
          >
            {error}
          </p>
        )}

        <footer className="flex flex-wrap items-center justify-end gap-2">
          {pending ? (
            <>
              <span className="mr-auto text-sm text-ink-secondary">
                Will {pending.summary} in {pane}
              </span>
              <button
                type="button"
                onClick={() => setPending(null)}
                className="rounded-md px-3 py-1.5 text-sm text-muted hover:text-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-page disabled:opacity-50"
                style={{ background: TONE_COLOR.warning }}
              >
                <Send className="size-3.5" aria-hidden />
                {sending ? "Typing…" : "Confirm"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md bg-surface-raised px-3 py-1.5 text-sm ring-1 ring-hairline hover:bg-page"
            >
              {answeredOnce && !prompt ? "Done" : "Close"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
