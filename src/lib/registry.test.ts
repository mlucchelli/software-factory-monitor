import { describe, expect, it } from "vitest";
import {
  parseRegistry,
  phaseNumberOf,
  releaseOf,
  repositoriesFromTitle,
} from "./registry";

const REGISTRY = `# ENG-412 — Saved replies for the shared inbox

Phase: 5 — Build (R1)
Parent: https://linear.app/acme/issue/ENG-412

## Agents

| tech-lead | review-pr | ENG-414 | a0000000000000009 |
| tech-lead | review-pr | ENG-414 | a0000000000000009 |
| designer | ui-preview | ENG-414 | a0000000000000004 |

## Live previews

| Ticket | URL |
|---|---|
| ENG-414 | http://localhost:5180/preview |

## Log

- Gate A passed.
- ENG-413 merged.
`;

describe("parseRegistry", () => {
  const registry = parseRegistry("ENG-412", REGISTRY);

  it("reads the name, the phase and the parent", () => {
    expect(registry.name).toBe("Saved replies for the shared inbox");
    expect(registry.phase).toBe("5 — Build (R1)");
    expect(registry.phaseNumber).toBe(5);
    expect(registry.parentUrl).toBe("https://linear.app/acme/issue/ENG-412");
  });

  it("collects each agent id once", () => {
    expect(registry.agentIds).toEqual([
      "a0000000000000009",
      "a0000000000000004",
    ]);
  });

  it("lists previews without the table header, and the log lines", () => {
    expect(registry.previews).toEqual(["ENG-414"]);
    expect(registry.log).toEqual(["Gate A passed.", "ENG-413 merged."]);
  });

  it("survives an empty file", () => {
    expect(parseRegistry("ENG-1", "")).toMatchObject({
      agentIds: [],
      log: [],
      previews: [],
      phaseNumber: undefined,
    });
  });
});

describe("phaseNumberOf", () => {
  it("places a gate between the phases it separates", () => {
    expect(phaseNumberOf("Gate A — waiting for plan approval")).toBe(2.5);
    expect(phaseNumberOf("paused at gate UI")).toBe(4.3);
    expect(phaseNumberOf("Gate B")).toBe(4.6);
  });

  it("is not a number for free text", () => {
    expect(phaseNumberOf("thinking")).toBeNaN();
  });
});

describe("sub-issue titles", () => {
  it("reads one or several repositories from the prefix", () => {
    expect(repositoriesFromTitle("[api] CRUD endpoints")).toEqual(["api"]);
    expect(repositoriesFromTitle("[api + web-app] Export")).toEqual([
      "api",
      "web-app",
    ]);
    expect(repositoriesFromTitle("[api and web-app/infra] X")).toEqual([
      "api",
      "web-app",
      "infra",
    ]);
  });

  it("rejects anything that is not a repository name", () => {
    expect(repositoriesFromTitle("No prefix")).toEqual([]);
    expect(repositoriesFromTitle("[Spike: caching?] idea")).toEqual([]);
  });

  it("reads the release", () => {
    expect(releaseOf("[api] CRUD endpoints R2")).toBe("R2");
    expect(releaseOf("[api] CRUD endpoints")).toBeUndefined();
  });
});
