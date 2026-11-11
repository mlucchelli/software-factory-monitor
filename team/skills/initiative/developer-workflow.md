# Developer workflow

Shared by backend-developer, frontend-developer, and ai-developer. Read `stack.md` first; your agent file adds the stack-specific rules. The orchestrator tells you the mode.

## Mode: implement

Input: sub-issue ID.

1. **Load context once**: the sub-issue spec (one `get_issue`), and only the parts of the parent plan and `~/.claude/initiatives/<parent>/registry.md` you need — the spec is the contract, the plan is background. Keep the spec's Commit History, Acceptance Criteria and contracts in your own notes; you will not fetch the issue again until step 7. Check the spec's `Blocked by` and `Unblocked when`: if a blocker is not satisfied and the spec does not allow building against the contract, report `BLOCKED`.
2. **Worktree**: create and set it up per `stack.md`. If the spec references an approved UI preview branch, bring over the approved component files — never the preview route or its fixtures:
   ```bash
   git -C <worktree> checkout eng-NNNN-ui-preview -- <component paths from the spec>
   ```
   Move the sub-issue to In Progress.
3. **Commit plan, in order.** For each commit in the spec's Commit History:
   - Write the code and tests for exactly that commit.
   - Run the definition-of-done checks for what you touched.
   - `git add <explicit paths>`, commit with one line `ENG-NNNN: short description` (no body, no trailer), and push (`git push -u origin <branch>` the first time).
   - Check `git show --numstat HEAD`: a deletion count on a file you believed you were creating means you overwrote it.
   - Track progress in the PR body (free to rewrite), not in the Linear spec — the spec is updated once, in step 7.
4. **Open the draft PR right after the first push**, so CI runs on every commit (for voice-agent-config, create the ElevenLabs PR branch first):
   ```bash
   gh pr create --draft --base <base> --title "<PR title format from stack.md>" --body-file <scratchpad>/pr.md
   ```
   The body follows the repo's `.github/pull_request_template.md` when it exists, plus the sections `Deviations from spec`, `Out of scope` (what the spec defers — review bots respect it), `Manual test` (copied from the spec), `Deploy steps (manual)` when any, and `Pre-existing failures` when any. In api, ops and deploy steps go in the template's ⚠️ NEW Environment Variables block rather than a separate section. Update the body as commits land.
5. **Deviations**: a small one forced by the code (a renamed method, an extra file) — proceed and record it in the PR and in `DEVIATIONS`. A design change (different table, contract, UX, or dropping a commit) — stop, push what is done, and report `NEEDS_INPUT` for the tech-lead with evidence.
6. **Finish**: run the full definition of done, then self-review — `git diff origin/<base>...HEAD --stat` for the shape, then read only the hunks you are unsure about (`git diff origin/<base>...HEAD -- <path>`) against your agent file's checklist — and fix what you find. Wait for CI without streaming it: poll with `Monitor` over `gh pr checks <n> -R acme-inc/<repo> --json name,state -q '[.[]|select(.state!="SUCCESS")]|length'` (up to 30 minutes), never `--watch`. On a failure, read only that job: `gh run view <id> -R <repo> --log-failed | tail -80`. Fix failures you caused; record pre-existing ones.
7. One `save_issue` (re-fetch first only if the orchestrator told you the spec was patched during your run): spec `Current Status` = `🔵 In review — PR #N`, `Last Updated`, and every commit's status in the same edit. Move the sub-issue to In Review and comment the PR link on it.
   **Edit those lines inside the body you fetched — never send a status report as the `description`.** A `description` replaces the whole issue: doing this once destroyed a spec's AC table, Error Handling and Commit History, and it was silent until a reviewer cited a criterion that no longer existed. Linear's description history is not reachable through the MCP, so recovery depended on another agent still holding the text. Re-read what you saved and confirm the AC table is still there.
8. Report `DONE` with PR, WORKTREE, CHECKS (including CI), and DEVIATIONS.

## Mode: iterate

Input: PR URL, round N, and the trigger — tech-lead review, human comments, failing CI, or merge conflict.

1. **Sync**: if your worktree was released, recreate it from the remote branch (`git -C $R/<repo> fetch origin <branch>` then `git -C $R/<repo> worktree add <worktree> <branch>` and `git -C <worktree> merge --ff-only origin/<branch>`). Confirm `git status` is clean.
2. **Gather in one batch** (queries in `stack.md`): unresolved, non-outdated review threads; top-level comments and reviews newer than your last round; failing checks (their logs only for the jobs that failed, `--log-failed | tail -80`); mergeability (`gh pr view <n> --json mergeable -q .mergeable`). Fetch each item once — the thread bodies you already have are your working copy.
3. **Triage every item**:
   - **Actionable now** — a concrete change that belongs in this PR.
   - **Not actionable** — a question, an opinion, or future work: answer it, don't change code.
   - **Disagree** — you have evidence the comment is wrong: reply with that evidence.
   - Humans outrank the tech-lead. When a human and the tech-lead conflict, report `NEEDS_INPUT`.
4. **Fix** the actionable items. Resolve conflicts with `git merge origin/<base>` — never rebase or force-push.
5. Run the definition of done, commit (`ENG-NNNN: address review round N` or a more specific one-liner), push, and wait for CI as in implement step 6.
6. **Reply to every item** you triaged: in its thread for inline comments, as one PR comment for top-level ones. Two or three lines each — what changed and the commit SHA, or why nothing changed; never quote the code back or re-explain the comment. End each reply with `<!-- acme-agent:<your-role> -->`. Don't resolve threads.
7. Comment on the sub-issue: `Round N — <a> fixed, <b> answered, <c> disputed`.
8. Report `DONE` (or `NEEDS_INPUT`) with the counts in SUMMARY.

## Mode: release

Input: sub-issue ID (the PR was approved and the owner wants to test it in his main checkout).

1. Confirm the worktree is clean and pushed: `git -C <worktree> status --porcelain` is empty and `git -C <worktree> rev-parse HEAD` equals `origin/<branch>`. If not, push first.
2. `git -C $R/<repo> worktree remove <worktree>` — keep the branch.
3. Report `DONE` with the exact command for the owner: `git -C $R/<repo> fetch && git -C $R/<repo> switch <branch>` — noting that his main checkout must be clean first, and for api that he restarts his local server after switching.

## Always

- Follow the Token budget in `stack.md`: bound command output, locate with `rg` before reading, one Linear fetch per run, batch independent calls, cite addresses instead of pasting content.
- Touch only your own worktree and your own sub-issue's status fields.
- Every GitHub comment you write ends with `<!-- acme-agent:<your-role> -->`.
