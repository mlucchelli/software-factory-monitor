import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { orcaHandles } from "../terminal/orca";
import type { TerminalRef } from "../terminal/ref";
import { liveSessionsDir } from "./paths";
import { captureTerminal, parseScreenPrompt } from "./tmux";
import type { LiveProcess } from "./types";

interface SessionFile {
  pid?: number;
  sessionId?: string;
  name?: string;
  status?: string;
  tmux?: string;
  updatedAt?: number;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Claude Code stores the tmux target as `session:@window.%pane`; the pane id alone addresses it. */
function tmuxRef(tmux: string | undefined): TerminalRef | undefined {
  const pane = tmux ? /%\d+$/.exec(tmux)?.[0] : undefined;
  return pane ? { kind: "tmux", id: pane } : undefined;
}

const WAITING_STATUS = "waiting";

async function promptOnScreen(entry: LiveProcess) {
  if (entry.status !== WAITING_STATUS || !entry.terminal) {
    return undefined;
  }
  try {
    return parseScreenPrompt(await captureTerminal(entry.terminal));
  } catch {
    return undefined;
  }
}

/** Running Claude Code processes by session id, from the registry each process keeps in ~/.claude/sessions. */
export async function listLiveProcesses(): Promise<Map<string, LiveProcess>> {
  const live = new Map<string, LiveProcess>();
  let files: string[];
  try {
    files = (await readdir(liveSessionsDir)).filter((file) =>
      /^\d+\.json$/.test(file),
    );
  } catch {
    return live;
  }
  await Promise.all(
    files.map(async (file) => {
      try {
        const entry = JSON.parse(
          await readFile(path.join(liveSessionsDir, file), "utf8"),
        ) as SessionFile;
        if (!entry.pid || !entry.sessionId || !isAlive(entry.pid)) {
          return;
        }
        const current = live.get(entry.sessionId);
        if (current && (current.updatedAt ?? 0) > (entry.updatedAt ?? 0)) {
          return;
        }
        live.set(entry.sessionId, {
          pid: entry.pid,
          name: entry.name,
          status: entry.status,
          terminal: tmuxRef(entry.tmux),
          updatedAt: entry.updatedAt,
        });
      } catch {
        // A registry file being rewritten is read again on the next poll.
      }
    }),
  );
  // Orca wins over tmux: an Orca server started from inside tmux hands its
  // terminals the TMUX variable of the pane it was started in, which is not
  // where the session runs.
  const handles = await orcaHandles(
    [...live.values()].map((entry) => entry.pid),
  );
  for (const entry of live.values()) {
    const handle = handles.get(entry.pid);
    if (handle) {
      entry.terminal = { kind: "orca", id: handle };
    }
  }
  await Promise.all(
    [...live.values()].map(async (entry) => {
      entry.prompt = await promptOnScreen(entry);
    }),
  );
  return live;
}

export async function findLiveProcess(
  sessionId: string,
): Promise<LiveProcess | undefined> {
  return (await listLiveProcesses()).get(sessionId);
}
