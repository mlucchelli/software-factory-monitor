import os from "node:os";
import path from "node:path";

/*
 * Every setting the server reads from the environment, in one place.
 * Nothing here is sent to the browser. See `.env.example` for the meaning of
 * each variable.
 */

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Where Claude Code keeps its data. */
export const claudeHome =
  process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");

/** Parent folder of the git checkouts a session may be started in. */
export const reposRoot =
  process.env.AGENTS_MONITOR_REPOS || path.join(os.homedir(), "work", "repos");

/** The `claude` binary a launch runs. */
export const claudeBin =
  process.env.AGENTS_MONITOR_CLAUDE ||
  path.join(os.homedir(), ".local", "bin", "claude");

/**
 * Where a launch starts its session: a detached tmux session (the default) or
 * a terminal in the Orca running on this machine. Sessions that already run
 * are found in either, whatever this says.
 */
export const launchHost: "tmux" | "orca" =
  process.env.AGENTS_MONITOR_TERMINAL === "orca" ? "orca" : "tmux";

/** The `orca` binary. On Linux outside Orca the CLI is `orca-ide`. */
export const orcaBin = process.env.ORCA_BIN || "orca";

/**
 * Hosts, besides localhost, the pages may be served from and still type into
 * terminals: the name you open the monitor with when it runs on another
 * machine ("mini.tailnet.ts.net,mini:4310"). Empty means local only.
 */
export const allowedHosts = list(process.env.AGENTS_MONITOR_ALLOWED_HOSTS).map(
  (host) => host.toLowerCase(),
);

/** GitHub user or organisation whose repositories hold the pull requests. */
export const githubOwner = process.env.GITHUB_OWNER || undefined;

export const linearApiKey = process.env.LINEAR_API_KEY || undefined;

/**
 * Demo mode: issues and pull requests come from `<CLAUDE_HOME>/demo/*.json`
 * instead of Linear and GitHub, and nothing can be launched. `pnpm demo` sets
 * it together with a generated `CLAUDE_HOME`.
 */
export const demoMode = process.env.AGENTS_MONITOR_DEMO === "1";

/**
 * Ticket prefixes of your tracker ("ENG,OPS"). When empty, anything shaped
 * like `ABC-123` counts as a ticket, which also matches strings such as
 * `UTF-8` in a prompt, so setting it is recommended.
 */
export const ticketPrefixes = list(process.env.TICKET_PREFIXES).map((prefix) =>
  prefix.toUpperCase(),
);
