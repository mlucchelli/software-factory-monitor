import { describe, expect, it } from "vitest";
import {
  claudeCommandLine,
  createArgs,
  handleInEnvironment,
  sendArgs,
  shellQuote,
} from "./orca";

const HANDLE = "term_6067c5d2-b500-421c-9da5-e752521fafc8";

describe("sendArgs", () => {
  it("glues text to its flag, so a message starting with a dash stays text", () => {
    expect(sendArgs(HANDLE, { literal: "--force is what I meant" })).toEqual([
      "terminal",
      "send",
      `--terminal=${HANDLE}`,
      "--text=--force is what I meant",
    ]);
  });

  it("sends Enter and Tab as keys, never as part of a text", () => {
    expect(sendArgs(HANDLE, { key: "Enter" }).at(-1)).toBe("--enter");
    expect(sendArgs(HANDLE, { key: "Tab" }).at(-1)).toBe("--text=\t");
  });
});

describe("handleInEnvironment", () => {
  it("reads the handle out of `ps eww` output", () => {
    expect(
      handleInEnvironment(
        `claude fix it TERM=xterm ORCA_TERMINAL_HANDLE=${HANDLE} ORCA_TAB_ID=9868`,
      ),
    ).toBe(HANDLE);
  });

  it("reads it out of a NUL-separated /proc environ", () => {
    expect(
      handleInEnvironment(`HOME=/home/dev\0ORCA_TERMINAL_HANDLE=${HANDLE}\0`),
    ).toBe(HANDLE);
  });

  it("ignores a look-alike variable and a process outside Orca", () => {
    expect(
      handleInEnvironment(`NOT_ORCA_TERMINAL_HANDLE=${HANDLE}`),
    ).toBeUndefined();
    expect(
      handleInEnvironment("claude TERM=xterm TMUX=/tmp/x"),
    ).toBeUndefined();
  });
});

describe("claudeCommandLine", () => {
  it("quotes a prompt so the shell passes it through untouched", () => {
    expect(
      claudeCommandLine("/usr/bin/claude", 'it\'s $HOME; rm -rf `x` "y"'),
    ).toBe(`/usr/bin/claude 'it'\\''s $HOME; rm -rf \`x\` "y"'`);
  });

  it("keeps line breaks and drops other control characters", () => {
    expect(claudeCommandLine("claude", "one\ntwo\u0003\u001b[A")).toBe(
      "claude 'one\ntwo  [A'",
    );
  });

  it("quotes a binary path with a space", () => {
    expect(shellQuote("/Users/a b/claude")).toBe("'/Users/a b/claude'");
  });
});

describe("createArgs", () => {
  it("selects the workspace by path and glues every value to its flag", () => {
    expect(
      createArgs({
        cwd: "/repos/api",
        title: "am-api-1a2b",
        command: "claude hi",
      }),
    ).toEqual([
      "terminal",
      "create",
      "--worktree=path:/repos/api",
      "--title=am-api-1a2b",
      "--command=claude hi",
    ]);
  });
});
