import { orcaHost } from "./orca";
import type { KeyStep, TerminalHost, TerminalRef } from "./ref";
import { tmuxHost } from "./tmux";

const HOSTS: Record<TerminalRef["kind"], TerminalHost> = {
  tmux: tmuxHost,
  orca: orcaHost,
};

export function captureTerminal(ref: TerminalRef): Promise<string> {
  return HOSTS[ref.kind].capture(ref.id);
}

export function sendToTerminal(ref: TerminalRef, steps: KeyStep[]) {
  return HOSTS[ref.kind].send(ref.id, steps);
}
