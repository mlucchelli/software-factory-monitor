/**
 * Where a session's terminal lives, so the monitor can read its screen and
 * type into it. tmux and Orca are the two hosts it knows; a session started in
 * a plain terminal window has no ref and stays read-only.
 *
 * To add another host (Zellij, a remote PTY service), add its kind here and an
 * implementation of `TerminalHost` next to `tmux.ts` and `orca.ts`.
 */
export type TerminalKind = "tmux" | "orca";

export interface TerminalRef {
  kind: TerminalKind;
  /** A tmux pane id (`%3`) or an Orca terminal handle (`term_…`). */
  id: string;
}

/** One keystroke group: a named key, or text typed as is. */
export type KeyStep = { key: "Enter" | "Tab" } | { literal: string };

export interface TerminalHost {
  /** The rendered screen, one line per row, trailing blank rows removed. */
  capture(id: string): Promise<string>;
  /** Types the steps in order, leaving the TUI time to redraw between them. */
  send(id: string, steps: KeyStep[]): Promise<void>;
}

/** How a ref reads in the interface: `tmux %3`, `orca term_6067c5d2`. */
export function terminalLabel(ref: TerminalRef): string {
  return ref.kind === "orca" ? `orca ${ref.id.slice(0, 13)}` : `tmux ${ref.id}`;
}
