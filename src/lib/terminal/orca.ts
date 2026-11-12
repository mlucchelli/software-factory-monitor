import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { orcaBin } from "../config";
import type { KeyStep, TerminalHost } from "./ref";

/*
 * Orca (https://github.com/stablyai/orca) hosts agent terminals, on this
 * machine or headless on a server (`orca serve`). The monitor talks to it only
 * through its CLI, with `--json`, and only to the Orca running on the machine
 * the monitor itself runs on: the transcripts it reads live on that disk.
 *
 * Every value is passed as `--flag=value`. The CLI reads a separate argument
 * that starts with a dash as a flag, and a message can start with one.
 */

const execFileAsync = promisify(execFile);

const KEY_DELAY_MS = 350;
const HANDLE_PATTERN = /^term_[0-9a-f-]{8,64}$/;
const HANDLE_IN_ENV = /(?:^|[\s\0])ORCA_TERMINAL_HANDLE=(term_[0-9a-f-]{8,64})/;

interface Envelope<T> {
  ok?: boolean;
  result?: T;
  error?: { code?: string; message?: string };
}

/** Runs one CLI command and returns its `result`, or throws Orca's own error code. */
export async function orca<T>(args: string[]): Promise<T> {
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(orcaBin, [...args, "--json"], {
      timeout: 15_000,
      maxBuffer: 8 * 1024 * 1024,
    }));
  } catch (error) {
    // A refused command exits 1 with the same JSON envelope on stdout.
    const failed = error as NodeJS.ErrnoException & { stdout?: string };
    if (failed.code === "ENOENT") {
      throw new Error(`The Orca CLI (${orcaBin}) is not installed`);
    }
    if (!failed.stdout) {
      throw error;
    }
    stdout = failed.stdout;
  }
  let envelope: Envelope<T>;
  try {
    envelope = JSON.parse(stdout) as Envelope<T>;
  } catch {
    throw new Error("Orca answered with something that is not JSON");
  }
  if (!envelope.ok || envelope.result === undefined) {
    throw new Error(
      `Orca refused: ${envelope.error?.code ?? envelope.error?.message ?? "unknown error"}`,
    );
  }
  return envelope.result;
}

function assertHandle(handle: string) {
  if (!HANDLE_PATTERN.test(handle)) {
    throw new Error(`Invalid Orca terminal handle ${handle}`);
  }
}

/** The CLI arguments that type one step. Pure, so the quoting can be tested. */
export function sendArgs(handle: string, step: KeyStep): string[] {
  const base = ["terminal", "send", `--terminal=${handle}`];
  if ("literal" in step) {
    return [...base, `--text=${step.literal}`];
  }
  return step.key === "Enter" ? [...base, "--enter"] : [...base, "--text=\t"];
}

export const orcaHost: TerminalHost = {
  async capture(handle) {
    assertHandle(handle);
    const result = await orca<{ terminal?: { tail?: string[] } }>([
      "terminal",
      "read",
      `--terminal=${handle}`,
      "--screen",
    ]);
    return (result.terminal?.tail ?? []).join("\n").replace(/\s+$/, "");
  },

  async send(handle, steps) {
    assertHandle(handle);
    for (const step of steps) {
      await orca(sendArgs(handle, step));
      await new Promise((resolve) => setTimeout(resolve, KEY_DELAY_MS));
    }
  },
};

/** Finds the handle in the text of a process environment (`ps eww`, or /proc). */
export function handleInEnvironment(environment: string): string | undefined {
  return HANDLE_IN_ENV.exec(environment)?.[1];
}

/** A process keeps the environment it started with, so one look per pid is enough. */
const handleByPid = new Map<number, string | null>();

async function environmentOf(pid: number): Promise<string> {
  if (process.platform === "linux") {
    return readFile(`/proc/${pid}/environ`, "utf8");
  }
  const { stdout } = await execFileAsync(
    "ps",
    ["eww", "-o", "command=", "-p", String(pid)],
    { timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout;
}

/**
 * The Orca terminal each of these Claude processes runs in, if any. Orca
 * exports `ORCA_TERMINAL_HANDLE` into every terminal it starts and Claude
 * inherits it, so the process itself says where it lives.
 */
export async function orcaHandles(
  pids: number[],
): Promise<Map<number, string>> {
  await Promise.all(
    pids
      .filter((pid) => !handleByPid.has(pid))
      .map(async (pid) => {
        try {
          handleByPid.set(
            pid,
            handleInEnvironment(await environmentOf(pid)) ?? null,
          );
        } catch {
          // Not ours to read, or gone already: asked again on the next poll.
        }
      }),
  );
  const alive = new Set(pids);
  for (const pid of handleByPid.keys()) {
    if (!alive.has(pid)) {
      handleByPid.delete(pid);
    }
  }
  const found = new Map<number, string>();
  for (const pid of pids) {
    const handle = handleByPid.get(pid);
    if (handle) {
      found.set(pid, handle);
    }
  }
  return found;
}

/** POSIX single-quoting: the one form zsh, bash and fish all read the same way. */
export function shellQuote(part: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(part)
    ? part
    : `'${part.replace(/'/g, `'\\''`)}'`;
}

/**
 * The line Orca types into the new terminal's shell. tmux execs an argv, Orca
 * types a command, so here the prompt has to be quoted. Control characters
 * other than a line break are dropped: nothing else belongs in a prompt, and
 * none of them may reach a shell.
 */
export function claudeCommandLine(claudeBin: string, prompt: string): string {
  const clean = prompt.replace(
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to drop them
    /[\u0000-\u0009\u000b-\u001f\u007f]/g,
    " ",
  );
  return `${shellQuote(claudeBin)} ${shellQuote(clean)}`;
}

/** Makes sure Orca knows the folder, so `path:<cwd>` selects a workspace. */
async function registerWorkspace(cwd: string, isGit: boolean) {
  const { repos } = await orca<{ repos: { path: string }[] }>(["repo", "list"]);
  if (repos.some((repo) => repo.path === cwd)) {
    return;
  }
  await orca([
    "repo",
    "add",
    `--path=${cwd}`,
    ...(isGit ? [] : ["--kind=folder"]),
  ]);
}

export function createArgs(options: {
  cwd: string;
  title: string;
  command: string;
}): string[] {
  return [
    "terminal",
    "create",
    `--worktree=path:${options.cwd}`,
    `--title=${options.title}`,
    `--command=${options.command}`,
  ];
}

/** Starts a terminal in `cwd` that runs `command`, and returns its handle. */
export async function createOrcaTerminal(options: {
  cwd: string;
  isGit: boolean;
  title: string;
  command: string;
}): Promise<string> {
  await registerWorkspace(options.cwd, options.isGit);
  const result = await orca<{ terminal?: { handle?: string } }>(
    createArgs(options),
  );
  const handle = result.terminal?.handle;
  if (!handle) {
    throw new Error("Orca created no terminal");
  }
  assertHandle(handle);
  return handle;
}
