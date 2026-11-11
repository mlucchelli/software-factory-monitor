/*
 * Where pull requests and their checks come from. GitHub through the local
 * `gh` login is the one implemented (`github.ts`); GitLab or another forge
 * would be a second module returning the same `PullRequestSource`.
 */

export interface CheckSummary {
  passed: number;
  failing: number;
  pending: number;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  /** `open`, `closed` or `merged`. */
  state: string;
  isDraft: boolean;
  repository: string;
  mergedAt?: string | null;
  checks?: CheckSummary;
}

/** A pull request with its head branch, which is how it is matched to a ticket. */
export type ListedPullRequest = PullRequest & { branch: string };

export interface PullRequestSource {
  /** Every pull request of one repository, any state. */
  list(repository: string): Promise<ListedPullRequest[]>;
  checks(repository: string, number: number): Promise<CheckSummary>;
}
