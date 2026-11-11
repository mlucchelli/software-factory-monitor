import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type RawCheck, summarizeChecks } from "./checks";
import type { ListedPullRequest, PullRequestSource } from "./types";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 20_000;

interface ListedRow {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  headRefName: string;
  mergedAt: string | null;
}

/**
 * GitHub through the `gh` CLI, so the monitor holds no token of its own.
 * GitHub search lags behind new pull requests, so each repository is listed
 * directly instead.
 */
export function githubPullRequests(
  owner: string | undefined,
): PullRequestSource {
  const repo = (repository: string) => {
    if (!owner) {
      throw new Error("GITHUB_OWNER is not set in .env.local");
    }
    return `${owner}/${repository}`;
  };
  return {
    async list(repository: string): Promise<ListedPullRequest[]> {
      const { stdout } = await execFileAsync(
        "gh",
        [
          "pr",
          "list",
          "-R",
          repo(repository),
          "--state",
          "all",
          "--limit",
          "200",
          "--json",
          "number,title,url,state,isDraft,headRefName,mergedAt",
        ],
        { timeout: TIMEOUT_MS },
      );
      return (JSON.parse(stdout) as ListedRow[]).map((row) => ({
        number: row.number,
        title: row.title,
        url: row.url,
        state: row.state.toLowerCase(),
        isDraft: row.isDraft,
        mergedAt: row.mergedAt,
        repository,
        branch: row.headRefName,
      }));
    },
    async checks(repository: string, number: number) {
      const { stdout } = await execFileAsync(
        "gh",
        [
          "pr",
          "view",
          String(number),
          "-R",
          repo(repository),
          "--json",
          "statusCheckRollup",
        ],
        { timeout: TIMEOUT_MS },
      );
      const { statusCheckRollup = [] } = JSON.parse(stdout) as {
        statusCheckRollup?: RawCheck[];
      };
      return summarizeChecks(statusCheckRollup);
    },
  };
}
