import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { initiativesDir } from "./claude/paths";
import {
  type ListedPullRequest,
  type PullRequest,
  type PullRequestSource,
  pullRequestSource,
} from "./pull-requests";
import {
  parseRegistry,
  type Registry,
  releaseOf,
  repositoriesFromTitle,
} from "./registry";
import { type IssueTracker, issueTracker, type TrackedIssue } from "./trackers";

export type { CheckSummary, PullRequest } from "./pull-requests";

const CACHE_TTL_MS = 60_000;

/** A sub-issue as the board shows it: the tracker's issue plus its pull requests. */
export interface TrackerIssue extends TrackedIssue {
  release?: string;
  pullRequests: PullRequest[];
}

export interface Initiative extends Registry {
  parent?: TrackedIssue;
  children: TrackerIssue[];
  /** Registry mtime — the most recently touched initiative leads the list. */
  touchedAt: number;
  trackerError?: string;
  githubError?: string;
}

const cache = new Map<string, { expires: number; value: unknown }>();

async function remember<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return hit.value as T;
  }
  const value = await compute();
  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, value });
  return value;
}

/** One repository failing (renamed, no access) must not hide the pull requests of the others. */
async function listPullRequests(
  source: PullRequestSource,
  titles: string[],
): Promise<{
  pullRequests: ListedPullRequest[];
  failedRepositories: string[];
}> {
  const repositories = [
    ...new Set(titles.flatMap((title) => repositoriesFromTitle(title))),
  ];
  const settled = await Promise.allSettled(
    repositories.map((repository) =>
      remember(`prs:${repository}`, () => source.list(repository)),
    ),
  );
  const failedRepositories: string[] = [];
  const pullRequests: ListedPullRequest[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      pullRequests.push(...result.value);
    } else {
      failedRepositories.push(repositories[index]);
    }
  });
  return { pullRequests, failedRepositories };
}

/** A pull request belongs to the ticket named in its title or its branch. */
export function pullRequestsFor(
  identifier: string,
  pullRequests: ListedPullRequest[],
): PullRequest[] {
  const branchKey = identifier.toLowerCase();
  return pullRequests
    .filter(
      (pullRequest) =>
        pullRequest.title.toUpperCase().includes(identifier) ||
        pullRequest.branch.toLowerCase().includes(branchKey),
    )
    .map(({ branch: _branch, ...pullRequest }) => pullRequest);
}

async function listRegistryKeys(): Promise<string[]> {
  try {
    const entries = await readdir(initiativesDir, { withFileTypes: true });
    return entries
      .filter(
        (entry) =>
          entry.isDirectory() && /^[A-Z][A-Z0-9]*-\d+$/.test(entry.name),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

async function loadInitiative(
  key: string,
  tracker: IssueTracker,
  source: PullRequestSource,
): Promise<Initiative> {
  const registryPath = path.join(initiativesDir, key, "registry.md");
  const markdown = await readFile(registryPath, "utf8").catch(() => "");
  const touchedAt = await stat(registryPath)
    .then((info) => info.mtimeMs)
    .catch(() => 0);
  const initiative: Initiative = {
    ...parseRegistry(key, markdown),
    children: [],
    touchedAt,
  };

  try {
    const { children, ...parent } = await remember(`tracker:${key}`, () =>
      tracker.fetchTree(key),
    );
    initiative.parent = parent;
    initiative.children = children.map((child) => ({
      ...child,
      release: releaseOf(child.title),
      pullRequests: [],
    }));
  } catch (error) {
    initiative.trackerError =
      error instanceof Error ? error.message : String(error);
    return initiative;
  }

  try {
    const { pullRequests, failedRepositories } = await listPullRequests(
      source,
      initiative.children.map((child) => child.title),
    );
    if (failedRepositories.length > 0) {
      initiative.githubError = `Could not read pull requests from: ${failedRepositories.join(", ")}`;
    }
    for (const child of initiative.children) {
      child.pullRequests = pullRequestsFor(child.identifier, pullRequests);
    }
    await Promise.all(
      initiative.children.flatMap((child) =>
        child.pullRequests
          .filter((pullRequest) => pullRequest.state === "open")
          .map(async (pullRequest) => {
            pullRequest.checks = await remember(
              `checks:${pullRequest.repository}#${pullRequest.number}`,
              () => source.checks(pullRequest.repository, pullRequest.number),
            );
          }),
      ),
    );
  } catch (error) {
    initiative.githubError =
      error instanceof Error ? error.message : String(error);
  }

  return initiative;
}

export async function listInitiatives(): Promise<Initiative[]> {
  const tracker = issueTracker();
  const source = pullRequestSource();
  const initiatives = await Promise.all(
    (await listRegistryKeys()).map((key) =>
      loadInitiative(key, tracker, source),
    ),
  );
  return initiatives.sort((a, b) => b.touchedAt - a.touchedAt);
}
