import { demoMode, linearApiKey } from "../config";
import { demoTracker } from "./demo";
import { linearTracker } from "./linear";
import type { IssueTracker } from "./types";

export type {
  IssueState,
  IssueTracker,
  IssueTree,
  TrackedIssue,
} from "./types";

/** The tracker this server reads. Another tracker is selected here. */
export function issueTracker(): IssueTracker {
  return demoMode ? demoTracker() : linearTracker(linearApiKey);
}
