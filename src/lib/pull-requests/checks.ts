import type { CheckSummary } from "./types";

const PASSED_OUTCOMES = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const FAILED_OUTCOMES = new Set([
  "FAILURE",
  "ERROR",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);

export interface RawCheck {
  conclusion?: string;
  state?: string;
  status?: string;
}

/** Folds GitHub's check runs and commit statuses into three counts. */
export function summarizeChecks(checks: RawCheck[]): CheckSummary {
  const summary: CheckSummary = { passed: 0, failing: 0, pending: 0 };
  for (const check of checks) {
    const outcome = (
      check.conclusion ||
      check.state ||
      check.status ||
      ""
    ).toUpperCase();
    if (PASSED_OUTCOMES.has(outcome)) {
      summary.passed += 1;
    } else if (FAILED_OUTCOMES.has(outcome)) {
      summary.failing += 1;
    } else {
      summary.pending += 1;
    }
  }
  return summary;
}
