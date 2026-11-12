import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { claudeBin, launchHost, reposRoot } from "../config";
import {
  claudeCommandLine,
  createArgs,
  createOrcaTerminal,
} from "../terminal/orca";
import {
  displayCommand,
  initiativePrompt,
  type LaunchRequest,
  launchArgv,
  tmuxSessionName,
} from "./launch-command";
import { listLiveProcesses } from "./live-sessions";
import { liveSessionsDir } from "./paths";

const execFileAsync = promisify(execFile);

export { reposRoot };

const LAUNCH_TIMEOUT_MS = 30_000;

export interface LaunchTarget {
  key: string;
  label: string;
  cwd: string;
  /** Folder trust already accepted, so Claude starts on the prompt instead of its trust dialog. */
  trusted: boolean;
}

/** Folders whose trust dialog was already accepted, read from Claude Code's own config. */
async function trustedFolders(): Promise<Set<string>> {
  try {
    const config = JSON.parse(
      await readFile(path.join(os.homedir(), ".claude.json"), "utf8"),
    ) as { projects?: Record<string, { hasTrustDialogAccepted?: boolean }> };
    return new Set(
      Object.entries(config.projects ?? {})
        .filter(([, project]) => project.hasTrustDialogAccepted === true)
        .map(([folder]) => folder),
    );
  } catch {
    return new Set();
  }
}

/**
 * The only places a launch may run: each git checkout directly under the repos
 * root (a `.git` directory, so worktrees are left out), plus the root itself
 * for initiatives. The client names a key; the path always comes from here.
 */
export async function listLaunchTargets(): Promise<LaunchTarget[]> {
  const [entries, trusted] = await Promise.all([
    readdir(reposRoot, { withFileTypes: true }).catch(() => []),
    trustedFolders(),
  ]);
  const repos = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const cwd = path.join(reposRoot, entry.name);
        const git = await stat(path.join(cwd, ".git")).catch(() => null);
        return git?.isDirectory()
          ? {
              key: entry.name,
              label: entry.name,
              cwd,
              trusted: trusted.has(cwd),
            }
          : null;
      }),
  );
  return repos
    .filter((target): target is LaunchTarget => target !== null)
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface LaunchPlan {
  suffix: string;
  cwd: string;
  launchName: string;
  prompt: string;
  host: "tmux" | "orca";
  /** tmux: the argv it execs. Orca: the arguments of `orca terminal create`. */
  argv: string[];
  command: string;
  /** Whether `cwd` is a git checkout; Orca registers anything else as a folder. */
  isGit: boolean;
}

/** Resolves a request to the exact spawn, or an error the endpoint answers with 400. */
export async function planLaunch(
  request: LaunchRequest,
  suffix: string = randomBytes(2).toString("hex"),
): Promise<LaunchPlan | string> {
  let cwd: string;
  let label: string;
  let prompt: string;
  if (request.kind === "session") {
    const target = (await listLaunchTargets()).find(
      (candidate) => candidate.key === request.target,
    );
    if (!target) {
      return "That repository is not one the monitor can launch in";
    }
    cwd = target.cwd;
    label = target.key;
    prompt = request.prompt;
  } else {
    cwd = reposRoot;
    label = request.ticket ? `initiative-${request.ticket}` : "initiative";
    prompt = initiativePrompt(request);
  }
  const launchName = tmuxSessionName(label, suffix);
  const isGit = request.kind === "session";
  if (launchHost === "orca") {
    const argv = createArgs({
      cwd,
      title: launchName,
      command: claudeCommandLine(claudeBin, prompt),
    });
    return {
      suffix,
      cwd,
      launchName,
      prompt,
      host: "orca",
      argv,
      command: displayCommand("orca", argv),
      isGit,
    };
  }
  const argv = launchArgv({ launchName, cwd, claudeBin, prompt });
  return {
    suffix,
    cwd,
    launchName,
    prompt,
    host: "tmux",
    argv,
    command: displayCommand("tmux", argv),
    isGit,
  };
}

interface Pending {
  launchName: string;
  cwd: string;
  startedAt: number;
  sessionId?: string;
  /** Set for an Orca launch: the terminal the session will appear in. */
  orcaHandle?: string;
}

let pending: Pending | null = null;

/** The session Claude Code registered for a tmux session we started, if any yet. */
async function sessionIdFor(launchName: string): Promise<string | undefined> {
  const files = await readdir(liveSessionsDir).catch(() => []);
  for (const file of files.filter((name) => /^\d+\.json$/.test(name))) {
    try {
      const entry = JSON.parse(
        await readFile(path.join(liveSessionsDir, file), "utf8"),
      ) as { sessionId?: string; tmux?: string };
      if (entry.sessionId && entry.tmux?.startsWith(`${launchName}:`)) {
        return entry.sessionId;
      }
    } catch {
      // A file being rewritten is read again on the next poll.
    }
  }
  return undefined;
}

/** The session whose Claude process runs in the Orca terminal we created. */
async function sessionIdInOrca(handle: string): Promise<string | undefined> {
  for (const [sessionId, live] of await listLiveProcesses()) {
    if (live.terminal?.kind === "orca" && live.terminal.id === handle) {
      return sessionId;
    }
  }
  return undefined;
}

export interface LaunchStatus {
  launchName: string;
  startedAt: number;
  sessionId?: string;
  timedOut: boolean;
}

/** The launch in flight, resolved to its session once Claude Code writes its file. */
export async function launchStatus(): Promise<LaunchStatus | null> {
  if (!pending) {
    return null;
  }
  if (!pending.sessionId) {
    pending.sessionId = pending.orcaHandle
      ? await sessionIdInOrca(pending.orcaHandle)
      : await sessionIdFor(pending.launchName);
  }
  return {
    launchName: pending.launchName,
    startedAt: pending.startedAt,
    sessionId: pending.sessionId,
    timedOut:
      !pending.sessionId && Date.now() - pending.startedAt > LAUNCH_TIMEOUT_MS,
  };
}

/** Why a new launch must wait: one at a time, until the last one has a session or timed out. */
export async function busyReason(): Promise<string | null> {
  const status = await launchStatus();
  if (!status || status.sessionId || status.timedOut) {
    return null;
  }
  return `Still starting ${status.launchName}; try again once it shows up`;
}

/**
 * Spawns the plan. With tmux the argv is exec'd as an array and no shell ever
 * sees it. Orca types a command line into the new terminal's shell instead, so
 * that path quotes the prompt (see `claudeCommandLine`).
 */
export async function runLaunch(plan: LaunchPlan): Promise<void> {
  await access(plan.cwd);
  await access(claudeBin);
  pending = {
    launchName: plan.launchName,
    cwd: plan.cwd,
    startedAt: Date.now(),
  };
  try {
    if (plan.host === "orca") {
      pending.orcaHandle = await createOrcaTerminal({
        cwd: plan.cwd,
        isGit: plan.isGit,
        title: plan.launchName,
        command: claudeCommandLine(claudeBin, plan.prompt),
      });
    } else {
      await execFileAsync("tmux", plan.argv, { timeout: 5000 });
    }
  } catch (error) {
    pending = null;
    throw error;
  }
}
