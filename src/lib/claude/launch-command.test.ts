import { describe, expect, it } from "vitest";
import {
  displayCommand,
  initiativePrompt,
  launchArgv,
  parseLaunchRequest,
  tmuxSessionName,
} from "./launch-command";

describe("parseLaunchRequest", () => {
  it("accepts a session with a target and a prompt", () => {
    expect(
      parseLaunchRequest({ kind: "session", target: "api", prompt: "fix it" }),
    ).toEqual({ kind: "session", target: "api", prompt: "fix it" });
  });

  it("drops fields it does not know, such as a path", () => {
    const parsed = parseLaunchRequest({
      kind: "session",
      target: "api",
      prompt: "fix it",
      cwd: "/etc",
    });
    expect(parsed).not.toHaveProperty("cwd");
  });

  it("normalises a ticket and refuses a malformed one", () => {
    expect(
      parseLaunchRequest({
        kind: "initiative",
        mode: "resume",
        ticket: " eng-412 ",
      }),
    ).toEqual({ kind: "initiative", mode: "resume", ticket: "ENG-412" });
    expect(
      parseLaunchRequest({
        kind: "initiative",
        mode: "status",
        ticket: "ENG-412; rm -rf /",
      }),
    ).toBe("Expected a ticket like ENG-1234");
  });

  it("refuses an empty or oversized prompt", () => {
    expect(
      parseLaunchRequest({ kind: "session", target: "api", prompt: "  " }),
    ).toBe("Write the first prompt");
    expect(
      typeof parseLaunchRequest({
        kind: "initiative",
        mode: "new",
        requirement: "x".repeat(8001),
      }),
    ).toBe("string");
  });
});

describe("the command", () => {
  it("passes the prompt as one argv element, whatever it contains", () => {
    const prompt = `/initiative it's "urgent"; $(reboot) && echo`;
    const argv = launchArgv({
      launchName: "am-x-0000",
      cwd: "/repos",
      claudeBin: "/bin/claude",
      prompt,
    });
    expect(argv.at(-1)).toBe(prompt);
    expect(argv.slice(-3, -1)).toEqual(["--", "/bin/claude"]);
  });

  it("builds the skill's own argument forms", () => {
    expect(
      initiativePrompt({
        kind: "initiative",
        mode: "resume",
        ticket: "ENG-412",
      }),
    ).toBe("/initiative resume ENG-412");
  });

  it("keeps tmux names free of dots and colons", () => {
    expect(tmuxSessionName("Web.App:main", "ab12")).toBe(
      "am-web-app-main-ab12",
    );
    expect(tmuxSessionName("...", "ab12")).toBe("am-session-ab12");
  });

  it("quotes for display only what needs quoting", () => {
    expect(displayCommand("tmux", ["-c", "/a b", "it's"])).toBe(
      `tmux -c '/a b' 'it'\\''s'`,
    );
  });
});
