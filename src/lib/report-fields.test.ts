import { describe, expect, it } from "vitest";
import { looksLikeReport, reportFields } from "./report-fields";

const REPORT = `AGENT: frontend-developer
MODE: iterate
STATUS: DONE
TICKET: ENG-414
PR: https://github.com/acme-inc/web-app/pull/88
SUMMARY: Both review comments fixed.
Focus returns to the composer.
QUESTIONS: -
NEXT: Review round 2.`;

describe("reportFields", () => {
  it("splits the block by field and keeps continuation lines", () => {
    const fields = reportFields(REPORT);
    expect(fields.MODE).toBe("iterate");
    expect(fields.SUMMARY).toBe(
      "Both review comments fixed.\nFocus returns to the composer.",
    );
    expect(fields.NEXT).toBe("Review round 2.");
  });

  it("leaves out a field whose value is a dash", () => {
    expect(reportFields(REPORT).QUESTIONS).toBeUndefined();
  });

  it("does not start a field on an unknown uppercase word", () => {
    const fields = reportFields(
      "STATUS: DONE\nSUMMARY: ok\nNOTE: still summary",
    );
    expect(fields.SUMMARY).toBe("ok\nNOTE: still summary");
  });
});

describe("looksLikeReport", () => {
  it("accepts a hand-back block", () => {
    expect(looksLikeReport(REPORT)).toBe(true);
  });

  it("rejects a plain message, even one that mentions a status", () => {
    expect(looksLikeReport("Can you check the migration?")).toBe(false);
    expect(looksLikeReport("STATUS: DONE")).toBe(false);
  });
});
