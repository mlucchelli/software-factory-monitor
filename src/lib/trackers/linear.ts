import type { IssueTracker, IssueTree, TrackedIssue } from "./types";

const ENDPOINT = "https://api.linear.app/graphql";

const TREE_QUERY = `query Tree($id: String!) {
  issue(id: $id) {
    identifier title url updatedAt state { name type }
    children(first: 100) {
      nodes { identifier title url updatedAt state { name type } }
    }
  }
}`;

interface TreeResponse {
  errors?: { message: string }[];
  data?: {
    issue: (TrackedIssue & { children: { nodes: TrackedIssue[] } }) | null;
  };
}

/** Linear over its GraphQL API, read-only, with a personal API key. */
export function linearTracker(apiKey: string | undefined): IssueTracker {
  return {
    name: "Linear",
    async fetchTree(key: string): Promise<IssueTree> {
      if (!apiKey) {
        throw new Error("LINEAR_API_KEY is not set in .env.local");
      }
      const response = await fetch(ENDPOINT, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: apiKey },
        body: JSON.stringify({ query: TREE_QUERY, variables: { id: key } }),
      });
      if (!response.ok) {
        throw new Error(`Linear responded ${response.status}`);
      }
      const payload = (await response.json()) as TreeResponse;
      if (payload.errors?.length) {
        throw new Error(payload.errors[0].message);
      }
      const issue = payload.data?.issue;
      if (!issue) {
        throw new Error(`${key} not found in Linear`);
      }
      return { ...issue, children: issue.children.nodes };
    },
  };
}
