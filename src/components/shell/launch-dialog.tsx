"use client";

import { Rocket, TerminalSquare, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Launch, LaunchKind } from "./launch-store";

interface Target {
  key: string;
  label: string;
  cwd: string;
  trusted: boolean;
}

type InitiativeMode = "new" | "resume" | "status";

interface Preview {
  cwd: string;
  command: string;
  launchName: string;
  suffix: string;
}

const LAST_REPO_KEY = "agents-monitor:last-launch-repo";

async function post(body: unknown) {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Partial<Preview> & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(json.error ?? `Request failed (${response.status})`);
  }
  return json as Preview;
}

const MODES: { key: InitiativeMode; label: string }[] = [
  { key: "new", label: "New requirement" },
  { key: "resume", label: "Resume" },
  { key: "status", label: "Status" },
];

/**
 * Starting a session spawns a process, so it always goes through a preview of
 * the exact command and working directory, and a second, deliberate click.
 */
export function LaunchDialog({
  kind: initialKind,
  onClose,
  onLaunched,
}: {
  kind: LaunchKind;
  onClose: () => void;
  onLaunched: (launch: Launch) => void;
}) {
  const [kind, setKind] = useState<LaunchKind>(initialKind);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [root, setRoot] = useState("");
  const [target, setTarget] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<InitiativeMode>("new");
  const [requirement, setRequirement] = useState("");
  const [ticket, setTicket] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLSelectElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch("/api/sessions", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { root: string; targets: Target[] }) => {
        setRoot(body.root);
        setTargets(body.targets);
        let last = "";
        try {
          last = window.localStorage.getItem(LAST_REPO_KEY) ?? "";
        } catch {}
        if (body.targets.some((candidate) => candidate.key === last)) {
          setTarget(last);
        }
      })
      .catch(() => setError("Could not load the repositories"));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const request = () =>
    kind === "session"
      ? { kind, target, prompt }
      : mode === "new"
        ? { kind, mode, requirement }
        : { kind, mode, ticket };

  const label =
    kind === "session"
      ? target
      : mode === "new"
        ? requirement.trim().split("\n")[0].slice(0, 60)
        : `${mode} ${ticket.trim().toUpperCase()}`;

  const review = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setPreview(await post({ ...request(), preview: true }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!preview) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const started = await post({ ...request(), suffix: preview.suffix });
      if (kind === "session") {
        try {
          window.localStorage.setItem(LAST_REPO_KEY, target);
        } catch {}
      }
      onLaunched({
        launchName: started.launchName,
        kind,
        label,
        at: Date.now(),
      });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  const edit = () => {
    setPreview(null);
    setError(null);
  };

  const field =
    "w-full rounded-md bg-page px-2.5 py-1.5 text-sm text-ink outline-none ring-1 ring-hairline focus:ring-axis";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16"
      role="dialog"
      aria-modal="true"
      aria-label={kind === "session" ? "New session" : "New initiative"}
    >
      <div className="motion-rise grid w-full max-w-xl gap-4 rounded-xl border border-hairline bg-surface p-4 shadow-2xl">
        <header className="flex items-center gap-2">
          <Rocket className="size-4 text-ink-secondary" aria-hidden />
          <div
            className="flex rounded-md p-0.5 ring-1 ring-hairline"
            role="tablist"
          >
            {(["session", "initiative"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={kind === option}
                onClick={() => {
                  setKind(option);
                  edit();
                }}
                className={`rounded px-2.5 py-1 text-xs ${
                  kind === option
                    ? "bg-surface-raised text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {option === "session" ? "New session" : "New initiative"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-muted hover:bg-surface-raised hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {!preview ? (
          <form onSubmit={review} className="grid gap-3">
            {kind === "session" ? (
              <>
                <label className="grid gap-1 text-xs text-ink-secondary">
                  Repository
                  <select
                    ref={first}
                    value={target}
                    onChange={(event) => setTarget(event.target.value)}
                    className={field}
                    required
                  >
                    <option value="" disabled>
                      {targets ? "Pick a repository" : "Loading…"}
                    </option>
                    {targets?.map((candidate) => (
                      <option key={candidate.key} value={candidate.key}>
                        {candidate.trusted
                          ? candidate.label
                          : `${candidate.label} — needs trust first`}
                      </option>
                    ))}
                  </select>
                  {targets?.find((candidate) => candidate.key === target)
                    ?.trusted === false && (
                    <span className="text-[11px] text-status-warning">
                      Claude has not been trusted in this folder yet, so it will
                      stop at its trust dialog before reading your prompt. The
                      monitor cannot answer that dialog: attach to the session
                      and choose, or open Claude there once yourself.
                    </span>
                  )}
                  <span className="text-[11px] text-muted">
                    Git checkouts directly under {root || "the repos folder"}.
                    Worktrees are not listed.
                  </span>
                </label>
                <label className="grid gap-1 text-xs text-ink-secondary">
                  First prompt
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    rows={4}
                    required
                    placeholder="What should the session start on?"
                    className={field}
                  />
                  <span className="text-[11px] text-muted">
                    Needed: a session has no transcript, and so no chat, until
                    its first prompt.
                  </span>
                </label>
              </>
            ) : (
              <>
                <div className="flex gap-1" role="radiogroup" aria-label="Kind">
                  {MODES.map((option) => (
                    // biome-ignore lint/a11y/useSemanticElements: a segmented control reads better than radio inputs here
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={mode === option.key}
                      onClick={() => setMode(option.key)}
                      className={`rounded-md px-2.5 py-1 text-xs ring-1 ${
                        mode === option.key
                          ? "bg-surface-raised text-ink ring-axis"
                          : "text-muted ring-hairline hover:text-ink"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {mode === "new" ? (
                  <label className="grid gap-1 text-xs text-ink-secondary">
                    Requirement
                    <textarea
                      value={requirement}
                      onChange={(event) => setRequirement(event.target.value)}
                      rows={6}
                      required
                      placeholder="The problem, who has it, and what success looks like. Links to Figma, Slack or tickets help."
                      className={field}
                    />
                    <span className="text-[11px] text-muted">
                      If the problem, who has it or what success looks like is
                      missing, the orchestrator asks for them before it launches
                      anyone.
                    </span>
                  </label>
                ) : (
                  <label className="grid gap-1 text-xs text-ink-secondary">
                    Parent ticket
                    <input
                      value={ticket}
                      onChange={(event) => setTicket(event.target.value)}
                      required
                      placeholder="ENG-1234"
                      pattern="[A-Za-z][A-Za-z0-9]*-[0-9]+"
                      className={`${field} font-mono`}
                    />
                  </label>
                )}
                <p className="text-[11px] text-muted">
                  Initiatives always run from {root || "the repos folder"}, as
                  the /initiative skill requires.
                </p>
              </>
            )}
            {error && <p className="text-xs text-status-critical">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink ring-1 ring-hairline hover:ring-axis disabled:opacity-50"
              >
                {busy ? "Checking…" : "Review the command"}
              </button>
            </div>
          </form>
        ) : (
          <div className="grid gap-3">
            <p className="text-xs text-ink-secondary">
              The monitor will run exactly this, in a new detached tmux session
              or Orca terminal. Claude starts with no extra flags, as if you
              typed it.
            </p>
            <dl className="grid gap-2 text-xs">
              <div className="grid gap-1">
                <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
                  Working directory
                </dt>
                <dd className="font-mono text-ink">{preview.cwd}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="flex items-center gap-1 text-[10px] font-medium tracking-wider text-muted uppercase">
                  <TerminalSquare className="size-3" aria-hidden />
                  Command
                </dt>
                <dd>
                  <pre className="max-h-60 overflow-auto rounded-md bg-black p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-[#d7d7d0] ring-1 ring-hairline">
                    {preview.command}
                  </pre>
                </dd>
              </div>
            </dl>
            {error && <p className="text-xs text-status-critical">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={edit}
                className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={start}
                disabled={busy}
                className="rounded-md bg-status-warning px-3 py-1.5 text-xs font-medium text-page hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Starting…" : "Start it"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
