import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { KeyStep, TerminalHost } from "./ref";

const execFileAsync = promisify(execFile);

const KEY_DELAY_MS = 350;
const SCREEN_LINES = 60;
const PANE_PATTERN = /^%\d+$/;

function assertPane(pane: string) {
  if (!PANE_PATTERN.test(pane)) {
    throw new Error(`Invalid tmux pane ${pane}`);
  }
}

export const tmuxHost: TerminalHost = {
  async capture(pane) {
    assertPane(pane);
    const { stdout } = await execFileAsync(
      "tmux",
      ["capture-pane", "-p", "-t", pane, "-S", `-${SCREEN_LINES}`],
      { timeout: 5000 },
    );
    return stdout.replace(/\s+$/, "");
  },

  async send(pane, steps: KeyStep[]) {
    assertPane(pane);
    for (const step of steps) {
      const args =
        "key" in step
          ? ["send-keys", "-t", pane, step.key]
          : ["send-keys", "-t", pane, "-l", step.literal];
      await execFileAsync("tmux", args, { timeout: 5000 });
      await new Promise((resolve) => setTimeout(resolve, KEY_DELAY_MS));
    }
  },
};
