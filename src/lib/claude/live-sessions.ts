import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { liveSessionsDir } from "./paths";
import { capturePane, parseScreenPrompt } from "./tmux";
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
function paneOf(tmux: string | undefined): string | undefined {
  return tmux ? /%\d+$/.exec(tmux)?.[0] : undefined;
}

const WAITING_STATUS = "waiting";

async function promptOnScreen(entry: LiveProcess) {
  if (entry.status !== WAITING_STATUS || !entry.tmuxPane) {
    return undefined;
  }
  try {
    return parseScreenPrompt(await capturePane(entry.tmuxPane));
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
          tmuxPane: paneOf(entry.tmux),
          updatedAt: entry.updatedAt,
        });
      } catch {
        // A registry file being rewritten is read again on the next poll.
      }
    }),
  );
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
