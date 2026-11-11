import { readFile } from "node:fs/promises";
import path from "node:path";
import { demoDir } from "../claude/paths";
import type { IssueTracker, IssueTree } from "./types";

/** Issues from the file the demo generator writes, so the board works with no account. */
export function demoTracker(): IssueTracker {
  return {
    name: "the demo tracker",
    async fetchTree(key: string): Promise<IssueTree> {
      const trees = JSON.parse(
        await readFile(path.join(demoDir, "tracker.json"), "utf8"),
      ) as Record<string, IssueTree>;
      const tree = trees[key];
      if (!tree) {
        throw new Error(`${key} is not in the demo data`);
      }
      return tree;
    },
  };
}
