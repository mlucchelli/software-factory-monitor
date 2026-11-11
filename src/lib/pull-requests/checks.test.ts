import { describe, expect, it } from "vitest";
import { pullRequestsFor } from "../initiatives";
import { summarizeChecks } from "./checks";

describe("summarizeChecks", () => {
  it("counts check runs and commit statuses alike", () => {
    expect(
      summarizeChecks([
        { conclusion: "SUCCESS" },
        { conclusion: "skipped" },
        { state: "FAILURE" },
        { conclusion: "", status: "IN_PROGRESS" },
        {},
      ]),
    ).toEqual({ passed: 2, failing: 1, pending: 2 });
  });
});

describe("pullRequestsFor", () => {
  const base = { url: "", state: "open", isDraft: false, repository: "api" };
  const listed = [
    { ...base, number: 1, title: "ENG-415: usage events", branch: "feature" },
    {
      ...base,
      number: 2,
      title: "Usage events",
      branch: "eng-415-usage-events",
    },
    { ...base, number: 3, title: "ENG-41: other", branch: "eng-41-other" },
  ];

  it("matches by title or branch and drops the branch from the result", () => {
    const matched = pullRequestsFor("ENG-415", listed);
    expect(matched.map((pullRequest) => pullRequest.number)).toEqual([1, 2]);
    expect(matched[0]).not.toHaveProperty("branch");
  });
});
