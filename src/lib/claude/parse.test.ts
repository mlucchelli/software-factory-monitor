import { describe, expect, it } from "vitest";
import {
  extractEvents,
  findPendingToolUse,
  modeAndTicket,
  parseReport,
  promptSummary,
  shortToolName,
  summarizeToolUse,
  type TranscriptRecord,
} from "./parse";
import { ticketPattern } from "./ticket";

const assistant = (content: unknown[], uuid = "u1"): TranscriptRecord => ({
  type: "assistant",
  uuid,
  timestamp: "2026-03-10T12:00:00.000Z",
  message: { content },
});

const user = (content: unknown, uuid = "u2"): TranscriptRecord => ({
  type: "user",
  uuid,
  timestamp: "2026-03-10T12:00:05.000Z",
  message: { content },
});

describe("ticketPattern", () => {
  it("matches any ABC-123 shape when no prefix is configured", () => {
    expect(ticketPattern([]).exec("fix OPS-12 today")?.[0]).toBe("OPS-12");
  });

  it("keeps to the configured prefixes", () => {
    const pattern = ticketPattern(["ENG", "OPS"]);
    expect(pattern.exec("UTF-8 text for ENG-415")?.[0]).toBe("ENG-415");
    expect(pattern.exec("encode as UTF-8")).toBeNull();
  });

  it("ignores a prefix that is not a plain identifier", () => {
    expect(ticketPattern(["A|B.*"]).exec("ZZ-1")?.[0]).toBe("ZZ-1");
  });
});

describe("parseReport", () => {
  const raw = [
    "AGENT: tech-lead",
    "MODE: review-pr",
    "STATUS: CHANGES_REQUESTED (2 findings)",
    "TICKET: ENG-414 saved replies picker",
    "PR: -",
    "SUMMARY: Two findings.",
    "The focus is lost after inserting.",
    "QUESTIONS: -",
  ].join("\n");

  it("reads the fields and keeps multi-line values together", () => {
    const report = parseReport(raw);
    expect(report.agent).toBe("tech-lead");
    expect(report.mode).toBe("review-pr");
    expect(report.summary).toBe(
      "Two findings.\nThe focus is lost after inserting.",
    );
  });

  it("reduces the status to its keyword and the ticket to its id", () => {
    const report = parseReport(raw);
    expect(report.status).toBe("CHANGES_REQUESTED");
    expect(report.ticket).toBe("ENG-414");
  });

  it("treats a dash as an empty field", () => {
    const report = parseReport(raw);
    expect(report.pr).toBeUndefined();
    expect(report.questions).toBeUndefined();
  });
});

describe("prompts", () => {
  it("skips harness lines and strips the relay preamble", () => {
    expect(
      promptSummary("<system-reminder>noise</system-reminder>"),
    ).toBeNull();
    expect(
      promptSummary(
        "The coordinator sent a message while you were working: rebase first",
      ),
    ).toBe("rebase first");
  });

  it("reads the mode and the ticket from a launch prompt", () => {
    expect(modeAndTicket("MODE: review-pr\nTicket: ENG-414, round 2")).toEqual({
      mode: "review-pr",
      ticket: "ENG-414",
    });
  });
});

describe("tool summaries", () => {
  it("shortens MCP tool names", () => {
    expect(shortToolName("mcp__linear__save_issue")).toBe("linear.save_issue");
  });

  it("prefers a command's description to the command", () => {
    expect(
      summarizeToolUse("Bash", {
        command: "pnpm test",
        description: "Run tests",
      }),
    ).toBe("Run tests");
  });

  it("names the role and the job of a spawned agent", () => {
    expect(
      summarizeToolUse("Agent", {
        subagent_type: "designer",
        description: "Preview the picker",
      }),
    ).toBe("designer · Preview the picker");
  });
});

describe("extractEvents", () => {
  it("turns a hand-back into a report event with its status", () => {
    const [event] = extractEvents(
      assistant([
        {
          type: "tool_use",
          id: "t1",
          name: "SubagentHandback",
          input: {
            message: "STATUS: BLOCKED\nSUMMARY: No access to the repo.",
          },
        },
      ]),
      "a1",
      "s1",
    );
    expect(event).toMatchObject({
      kind: "report",
      reportStatus: "BLOCKED",
      summary: "No access to the repo.",
    });
  });

  it("ignores tool results and records without an id", () => {
    expect(
      extractEvents(
        user([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]),
        "a1",
        "s1",
      ),
    ).toEqual([]);
    expect(
      extractEvents({ type: "user", message: { content: "hi" } }, "a", "s"),
    ).toEqual([]);
  });
});

describe("findPendingToolUse", () => {
  const call = (id: string, name = "Bash") =>
    assistant([{ type: "tool_use", id, name, input: { command: "sleep 60" } }]);

  it("returns the call that has no result yet", () => {
    const pending = findPendingToolUse([
      call("t1"),
      user([{ type: "tool_result", tool_use_id: "t1", content: "done" }]),
      call("t2"),
    ]);
    expect(pending?.summary).toBe("sleep 60");
  });

  it("is empty once every call has its result", () => {
    expect(
      findPendingToolUse([
        call("t1"),
        user([{ type: "tool_result", tool_use_id: "t1", content: "done" }]),
      ]),
    ).toBeUndefined();
  });

  it("drops a call the user interrupted", () => {
    expect(
      findPendingToolUse([call("t1"), user("[Request interrupted by user]")]),
    ).toBeUndefined();
  });

  it("carries the options of an open question", () => {
    const pending = findPendingToolUse([
      assistant([
        {
          type: "tool_use",
          id: "q1",
          name: "AskUserQuestion",
          input: {
            questions: [
              {
                question: "Approve?",
                options: [{ label: "Yes" }, { label: "No" }],
              },
            ],
          },
        },
      ]),
    ]);
    expect(
      pending?.questions?.[0].options.map((option) => option.label),
    ).toEqual(["Yes", "No"]);
  });
});
