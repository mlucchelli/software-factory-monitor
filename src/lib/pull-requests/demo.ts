import { readFile } from "node:fs/promises";
import path from "node:path";
import { demoDir } from "../claude/paths";
import type {
  CheckSummary,
  ListedPullRequest,
  PullRequestSource,
} from "./types";

type DemoPullRequest = ListedPullRequest & { checks?: CheckSummary };

async function read(): Promise<DemoPullRequest[]> {
  return JSON.parse(
    await readFile(path.join(demoDir, "pull-requests.json"), "utf8"),
  ) as DemoPullRequest[];
}

/** Pull requests from the file the demo generator writes. */
export function demoPullRequests(): PullRequestSource {
  return {
    async list(repository: string) {
      return (await read())
        .filter((pullRequest) => pullRequest.repository === repository)
        .map(({ checks: _checks, ...pullRequest }) => pullRequest);
    },
    async checks(repository: string, number: number) {
      const found = (await read()).find(
        (pullRequest) =>
          pullRequest.repository === repository &&
          pullRequest.number === number,
      );
      return found?.checks ?? { passed: 0, failing: 0, pending: 0 };
    },
  };
}
