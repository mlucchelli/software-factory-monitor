/*
 * The issue tracker behind the Initiatives board.
 *
 * Linear is the one implemented (`linear.ts`). To connect another tracker
 * (Jira, GitHub Issues, Shortcut), write a module that returns an
 * `IssueTracker` and pick it in `index.ts`. The rest of the app only sees the
 * shapes below.
 */

/**
 * Workflow state of an issue. `type` is the tracker-independent part and uses
 * Linear's vocabulary; map your tracker's states onto it:
 *
 * - `backlog`, `unstarted`: nobody is working on it
 * - `started`: in progress or in review
 * - `completed`: done; the initiative is archived when its parent reaches it
 * - `canceled`: dropped; also archives the initiative
 *
 * `name` is the label shown to the user. The pipeline treats the name
 * `Blocked` as "waiting on a dependency".
 */
export interface IssueState {
  name: string;
  type: string;
}

export interface TrackedIssue {
  /** The key people type and branches carry, such as `ENG-123`. */
  identifier: string;
  title: string;
  url: string;
  updatedAt?: string;
  state: IssueState;
}

/** A parent issue with its direct sub-issues: one initiative. */
export interface IssueTree extends TrackedIssue {
  children: TrackedIssue[];
}

export interface IssueTracker {
  /** Shown in error messages. */
  name: string;
  /** Reads the parent issue `key` and its sub-issues; throws with a message fit for the UI. */
  fetchTree(key: string): Promise<IssueTree>;
}
