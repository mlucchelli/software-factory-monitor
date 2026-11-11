---
name: initiative
description: Run Acme's specialist dev team on an initiative end to end — initiative-manager plans it (Linear parent issue with mermaid), tech-lead validates the plan and splits it into sub-issues with technical specs, designer builds live UI previews for the owner to validate; backend/frontend/ai developers implement each spec as a draft PR; tech-lead reviews every PR adversarially and developers iterate on review comments and CI until approved. Use when the owner runs /initiative, or asks to "start an initiative", "plan and build this with the team", "resume ENG-NNNN", or "status of the initiative".
argument-hint: "<requirement text | ENG-NNNN> | resume ENG-NNNN | status ENG-NNNN"
---

# /initiative — orchestrate the dev team

You, the main session, are the orchestrator. Subagents cannot call each other, so every hand-off goes through you: launch agents, read their `## Report`, relay to the next agent, run the gates with the owner, and keep the registry.

Read `stack.md` in this skill's directory first — it is the contract every agent shares. Developers also follow `developer-workflow.md`.

Always run from `$REPOS_ROOT`. Before launching each phase, tell the owner in 2–4 lines what you are about to launch, on which tickets and repos, and why.

## The team

| Agent (`subagent_type`) | Model · effort (from its file) | Modes |
|---|---|---|
| `initiative-manager` | fable · medium — pass `model: "sonnet"` for `status` | `draft`, `revise`, `status` |
| `tech-lead` | opus · low | `review-plan`, `breakdown`, `review-pr` |
| `designer` | opus · medium | `ui-preview`, `iterate`, `approve` — desktop-app, web-app |
| `backend-developer` | sonnet · medium | `implement`, `iterate`, `release` — api |
| `frontend-developer` | sonnet · medium | `implement`, `iterate`, `release` — desktop-app, web-app |
| `ai-developer` | sonnet · medium | `implement`, `iterate`, `release` — ai-studio, voice-agent-config, agent-runtime, private-mcp, public-mcp |
| `general-purpose` acting as api's `backend-reviewer` | pass `model: "sonnet"` | rule check of api PRs, fed to the tech-lead |

Each agent's file sets its model; pass `model` on the Agent call only where the table says so, or to raise a developer to `"opus"` for one run — do that when the same run has already failed once on Sonnet, and say why in the registry log. A model set at launch holds for that instance, so `SendMessage` continues at the model it started with.

Each launch prompt states `MODE: <mode>`, the IDs / PR URL / round, and any relayed feedback or answers **verbatim**. Pass IDs, not documents: an agent fetches the spec, the plan, the diff and the review threads itself. Pasting a spec or a diff into a prompt buys nothing and every agent pays for it again on every later turn. Keep the rest of the prompt under ~15 lines, and prefer `SendMessage` to an instance that already holds the context over a fresh agent that has to load it again.

Agent instances — continue with `SendMessage` to keep context:
- **Planning tech-lead**: one instance for review-plan and breakdown.
- **Designer**: one instance per frontend sub-issue, reused across its preview and every feedback round.
- **Reviewer tech-lead**: a fresh instance per PR (independent from whoever wrote the spec), reused across that PR's rounds.
- **Developer**: one instance per sub-issue, reused for implement, iterate, and release.

## Cost

The team's bill is context re-sent per turn, not output: over a run of initiatives almost all of the cost is developer and tech-lead context. `stack.md` holds the rules every agent follows; yours:

- Launch the smallest agent that can do the job, and only when it is needed: `Explore` for a broad search, `general-purpose` for the api rule check, a specialist for real work. Never launch an agent to read one file or run one command you could run yourself.
- Relay decisions and IDs, not documents. A report's SUMMARY and QUESTIONS are what travels; never forward a whole report, spec, diff or CI log to another agent or paste one into Linear.
- One instance per job, reused: planning tech-lead across review-plan / breakdown, one designer per frontend sub-issue across its preview rounds, one reviewer per PR across its rounds, one developer per sub-issue across implement / iterate / release. A fresh agent re-reads `stack.md`, the spec and the repo rules before it does anything.
- Bound your own commands too (`--json` + `-q`, `--stat`, `| tail`), and keep the watcher to one instance over all open PRs.
- After an initiative closes, `python3 ~/.claude/skills/initiative/scripts/agent-cost.py` prints cost, turns, context peak and tool mix per role from the transcripts — use it to see which role drifted before changing any prompt.

## Registry

Create `~/.claude/initiatives/<PARENT>/registry.md` as soon as the parent issue exists; update it after every report and show it to the owner at every gate:

```markdown
# <PARENT> — <initiative name>

Phase: <n — name> · Updated: <YYYY-MM-DD HH:MM>

| Sub-issue | Repo | Specialist | Blocked by | Worktree | Agent ID | PR | Round | Status |
|---|---|---|---|---|---|---|---|---|

## Live previews
| Sub-issue | URL | Background task |

## Watcher
Task: <id> · PRs: <owner/repo#n …> · Iterations per PR: <…>

## Log
- <time> <event>
```

## Handling reports

- `NEEDS_INPUT` → a design question from a developer goes to the planning tech-lead first. Anything the tech-lead can't decide, and every product question, goes to the owner with `AskUserQuestion`, using the agent's question blocks as-is (up to 4 per call). Never answer them yourself and never turn them into plain text. Relay the answers, including any notes, verbatim.
- `BLOCKED` → tell the owner what blocks and what unblocks it; never work around it.
- A failed run or a missing report → retry once, then escalate. **An agent killed by infrastructure — expired auth, a classifier outage, a transport error — is not a blocker and is never the owner's to fix: relaunch it onto its existing worktree and only escalate if the relaunch fails the same way.** Check first whether other agents have run since; if they have, the failure was transient and already over. Telling him to fix something that has already healed wastes his attention and stalls the ticket.
- Permission prompts stalling background agents → tell the owner which command, and suggest `/fewer-permission-prompts` after the run.

## Phase 0 — Intake

A plannable requirement has: the problem, who has it, what success looks like, constraints, and links (Figma, Slack, tickets). If the input lacks the first three, ask the owner for exactly those before launching anyone. Suggest linking this session to the parent issue with `/ticket-link` once it exists, so the session context is saved to Linear.

## Phase 1 — Plan

1. Launch `initiative-manager` `MODE: draft` with the requirement or Linear ID.
2. The manager always opens with a question round. For every `NEEDS_INPUT`, call `AskUserQuestion` immediately with its question blocks, then `SendMessage` the answers back verbatim. If a report contains a question anywhere outside `QUESTIONS`, still ask it with `AskUserQuestion` — never answer on the owner's behalf. Repeat until it reports `DONE` with the parent ID. Create the registry.

## Phase 2 — Plan review (max 3 rounds)

1. Launch the planning `tech-lead` `MODE: review-plan`.
2. `CHANGES_REQUESTED` → manager `MODE: revise` with "tech-lead round N comment" → tech-lead round N+1.
3. Unresolved after round 3 → put the disagreement to the owner.

**Gate A — plan.** Show the parent issue link, Workstreams table, and Decision Log. Changes go to the manager (`revise`) and back through one tech-lead round.

## Phase 3 — Breakdown

`SendMessage` the planning tech-lead `MODE: breakdown`. Fill the registry from its report.

## Phase 4 — UI preview (frontend sub-issues with `UI preview: required`)

1. Launch one `designer` `MODE: ui-preview` per sub-issue. Previews for different sub-issues run in parallel as separate designer instances.
2. From its `PREVIEW` line, **start the dev server yourself** with Bash `run_in_background` (so it outlives the agent), confirm the URL answers, and record it under Live previews.
3. **Gate UI.** Give the owner the URL and the designer's validation checklist, and ask with `AskUserQuestion`: approve, or changes (free text). Changes → `SendMessage` that designer `MODE: iterate` with his feedback verbatim; the server hot-reloads; ask again.
4. On approval: `SendMessage` the designer `MODE: approve` with the preview SHA; it writes the approved design into the spec. Stop only the server you started for it.

The designer builds the real components at the paths the spec names, so the developer wires them up rather than rebuilding them. A preview that fails ds-check is not approvable — say so and send it back instead of putting it to the owner.

## Gate B — start development

Show the sub-issues (ID, repo, specialist, blocked by, commits, preview approved) and ask which to start. The owner may approve a subset.

## Phase 5 — Build

1. Launch the specialist `MODE: implement` **in the background** for each approved sub-issue whose blockers are satisfied (`Unblocked when` in its spec).
2. Parallelism: different repos in parallel; the same repo only for sub-issues the spec marks `Parallel-safe with` each other; at most 3 developers at once.
3. `SendMessage` the manager `MODE: status` once after the first wave launches.
4. **Never create a file with `cat >` or `Write` without checking it does not already exist.** A developer once wrote a "new" test file over an existing one with 6 tests and caught it only in a post-commit `--numstat` (43 insertions, **106 deletions** on a file it believed it was creating). Read first, then append; and read `--numstat` after committing, because a deletion count on a file you thought was new is the tell.
6. **Scratch files are per ticket.** Agents share one scratchpad directory, so tell each developer to name its temporary files after its ticket (`pr-ENG-NNNN.md`, not `pr.md`). Two agents writing `pr.md` at once already came within one step of pushing a PR body into the wrong repo.
7. **Never let an agent edit the owner's personal config to unblock itself** — `.env`, untracked scratch files, anything outside the repo's tracked tree. When a build step needs a secret or a URL only he holds, hand him the exact commands and wait; do not have an agent write the secret for him.

## Phase 6 — Review (per PR, max 4 tech-lead rounds)

When a developer reports `DONE` with a PR:
1. api PRs: the session runs from the workspace root, where api's project agents don't load. Launch a `general-purpose` agent told to read `$REPOS_ROOT/api/.claude/agents/backend-reviewer.md` and act exactly as it says on the PR's changed files (`gh pr view <url> --json files`), reading them in the developer's worktree. Collect its findings.
2. Launch a fresh reviewer `tech-lead` `MODE: review-pr` with the sub-issue, PR URL, round 1, and the backend-reviewer findings. Reviews of different PRs run in parallel.
3. `CHANGES_REQUESTED` → `SendMessage` the developer `MODE: iterate` (trigger: tech-lead review, round N). On `DONE` → reviewer tech-lead round N+1.
4. **No `APPROVED` without a criterion-by-criterion verification.** The tech-lead's verdict must carry the spec's Acceptance Criteria and Error Handling rows one by one, each ✅ / ❌ / ⚠️ unverifiable with what proves it. Reject a verdict that asserts conformance in prose or leans on green CI — CI proves nothing about a criterion no test covers. A spec written before the AC section existed has none: tell the reviewer to derive them from the Overview's scope plus the Error Handling table, verify those, and say so in the verdict.
5. `APPROVED` → **hand off to the owner**: PR URL (still draft), manual test steps from the spec, deploy steps and env vars from the PR. For desktop-app, include the dev-backend preview URL from the preview-deploy PR comment. Ask whether he also wants to test in his local checkout; if so, `SendMessage` the developer `MODE: release` and give him the switch command it returns.
6. Still open after round 4 → bring the remaining threads to the owner.
7. **Propagate before closing the round.** A review finding is not done when the PR is fixed — it is done when every sub-issue that builds on that PR carries it. Before you mark a PR approved or merged, list the sub-issues whose `Blocked by` names it, and for each finding that outlives the PR (a deferred fix, a gap the reviewer accepted as out of scope, a contract the PR changed) `SendMessage` the planning tech-lead to patch those specs — and say which finding goes where. A developer must never be the one to discover that its spec predates a review of its own dependency.
   Patching means reconciling, not appending: a finding usually contradicts text the spec already has, so name the lines to rewrite. Then verify the issue's `updatedAt` actually moved before launching the developer.
   This has failed twice — a doc drift that outlived its PR, and a gap a reviewer accepted as out of scope reaching the dependent spec too late.

## Phase 7 — Watch

From the first PR onward, keep one watcher running with `Monitor` over every open PR:

```bash
~/.claude/skills/initiative/scripts/watch-prs.sh ~/.claude/initiatives/<PARENT>/watch <owner/repo#n> [<owner/repo#n> …]
```

It prints `BASELINE` once per PR, then a `CHANGED` line when state, failing checks, or human activity changes (agent comments carry the `acme-agent` marker and are ignored), and `ALL_CLOSED` when nothing is open. Restart it with the new list when a PR opens.

On `CHANGED`:
- **New human activity** → developer `MODE: iterate` (trigger: human comments), then a reviewer tech-lead round on the result.
- **New failing checks** → developer `MODE: iterate` (trigger: failing CI).
- **MERGED** → mark 🟢, run the propagation step (Phase 6.6) for every dependent sub-issue, then unblock dependents (back to Phase 5), remove the developer's worktree if it still exists, and run manager `MODE: status`. Propagation comes before the launch: a late review finding on the merged PR is exactly what the next developer's spec is missing.
- **CLOSED** without merge → ask the owner whether to drop (⚫) or reopen the work.

Limits per PR: 10 iterations, or 5 hours with no change → stop that PR's loop and tell the owner.

## Manager status cadence

Run `initiative-manager` `MODE: status` after Gate A, after Gate B, after the first build wave, on every merge, and on any blocker — not on every PR event.

## Phase 8 — Close

When every sub-issue is 🟢 or ⚫: final manager status; tell the owner the initiative is complete (closing the parent is his call); list leftover local branches and worktrees (UI preview branches included) and offer to remove them.

## resume / status

- `status ENG-NNNN` → manager `MODE: status`, then show the result and the registry.
- `resume ENG-NNNN` → read the registry, reconcile it with Linear (parent, sub-issues, comments) and GitHub (`gh pr list -R acme-inc/<repo> --search "eng-NNNN" --state all`), show the result to the owner, restart the watcher, and continue from the earliest incomplete phase with fresh agents (developers recover their state from the worktree, PR, and spec).

## Never

- Write plans, specs, code, or reviews yourself — delegate to the owning agent.
- Merge, mark a PR ready, deploy, run production migrations, or publish to queues.
- Skip Gate A, Gate UI, or Gate B.
- Write a bare `#N` or a raw PR/issue URL into Linear prose. Linear auto-links them: `#4` resolved to an unrelated repo's PR, and a raw URL got a `<pull-request>` tag nested inside the link the agent had written. Two agents hit this in one day. Use the full `owner/repo#N` or say "PR 1234" in words, and re-read the saved description afterwards — the corruption is only visible in the response payload.
- Kill a process you did not start.
