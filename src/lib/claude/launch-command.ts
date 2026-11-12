/*
 * Pure pieces of the launch write path, kept free of I/O so they can be
 * checked on their own: what a request may ask for, and the exact argv the
 * server hands to `tmux`. Nothing here ever builds a shell string.
 */

export type InitiativeMode = "new" | "resume" | "status";

export type LaunchRequest =
  | { kind: "session"; target: string; prompt: string }
  | {
      kind: "initiative";
      mode: InitiativeMode;
      requirement?: string;
      ticket?: string;
    };

const TICKET = /^[A-Z][A-Z0-9]*-\d+$/;
const MAX_PROMPT = 8000;

/** Reads and bounds a request body; returns an error message instead of throwing. */
export function parseLaunchRequest(body: unknown): LaunchRequest | string {
  if (!body || typeof body !== "object") {
    return "Expected a JSON body";
  }
  const value = body as Record<string, unknown>;
  if (value.kind === "session") {
    if (typeof value.target !== "string" || !value.target) {
      return "Pick a repository";
    }
    if (typeof value.prompt !== "string" || !value.prompt.trim()) {
      return "Write the first prompt";
    }
    if (value.prompt.length > MAX_PROMPT) {
      return `The first prompt is longer than ${MAX_PROMPT} characters`;
    }
    return { kind: "session", target: value.target, prompt: value.prompt };
  }
  if (value.kind === "initiative") {
    const mode = value.mode;
    if (mode === "new") {
      if (typeof value.requirement !== "string" || !value.requirement.trim()) {
        return "Describe the requirement";
      }
      if (value.requirement.length > MAX_PROMPT) {
        return `The requirement is longer than ${MAX_PROMPT} characters`;
      }
      return { kind: "initiative", mode, requirement: value.requirement };
    }
    if (mode === "resume" || mode === "status") {
      const ticket =
        typeof value.ticket === "string"
          ? value.ticket.trim().toUpperCase()
          : "";
      if (!TICKET.test(ticket)) {
        return "Expected a ticket like ENG-1234";
      }
      return { kind: "initiative", mode, ticket };
    }
    return "Expected mode new, resume or status";
  }
  return "Expected kind session or initiative";
}

/** The first prompt of an initiative session: the skill's own argument forms. */
export function initiativePrompt(
  request: Extract<LaunchRequest, { kind: "initiative" }>,
): string {
  switch (request.mode) {
    case "new":
      return `/initiative ${request.requirement?.trim()}`;
    case "resume":
      return `/initiative resume ${request.ticket}`;
    case "status":
      return `/initiative status ${request.ticket}`;
  }
}

/** tmux target names cannot hold "." or ":"; keep them short and readable. */
export function tmuxSessionName(label: string, suffix: string): string {
  const safe = label
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `am-${safe || "session"}-${suffix}`;
}

/**
 * `tmux new-session` with a command and arguments execs them directly, without
 * a shell, so the prompt travels as one untouched argv element. No Claude
 * flags are added: the session starts exactly as `claude "<prompt>"` would.
 */
export function launchArgv(options: {
  launchName: string;
  cwd: string;
  claudeBin: string;
  prompt: string;
}): string[] {
  return [
    "new-session",
    "-d",
    "-s",
    options.launchName,
    "-c",
    options.cwd,
    "--",
    options.claudeBin,
    options.prompt,
  ];
}

/** How the argv reads as a command line, for the confirmation dialog only. */
export function displayCommand(binary: string, argv: string[]): string {
  const quote = (part: string) =>
    /^[A-Za-z0-9_@%+=:,./-]+$/.test(part)
      ? part
      : `'${part.replace(/'/g, `'\\''`)}'`;
  return [binary, ...argv].map(quote).join(" ");
}
