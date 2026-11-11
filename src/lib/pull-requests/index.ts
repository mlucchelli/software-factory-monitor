import { demoMode, githubOwner } from "../config";
import { demoPullRequests } from "./demo";
import { githubPullRequests } from "./github";
import type { PullRequestSource } from "./types";

export type {
  CheckSummary,
  ListedPullRequest,
  PullRequest,
  PullRequestSource,
} from "./types";

export function pullRequestSource(): PullRequestSource {
  return demoMode ? demoPullRequests() : githubPullRequests(githubOwner);
}
