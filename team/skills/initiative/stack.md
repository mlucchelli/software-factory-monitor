This file is an example. Replace it with your own repositories and commands.

# Acme dev team — shared reference

Every agent in the initiative team (initiative-manager, tech-lead, designer, backend-developer, frontend-developer, ai-developer) reads this file first. It is the single source for the workspace map, per-repo definition of done, Linear and GitHub conventions, hard rules, and the report protocol. Developers also read `developer-workflow.md` next to this file.

## Workspace

Root: `$REPOS_ROOT` (not a git repo) — every repo is a sibling directory. GitHub org: `acme-inc`. **Agents act through the owner's GitHub account.**

Sessions always run from the root, so no repo's `CLAUDE.md`, `.claude/rules`, skills, or project agents load automatically. Read them by path — `<root>/<repo>/CLAUDE.md`, `<root>/<repo>/.claude/rules/*.md`, `<root>/<repo>/.claude/skills/<name>/SKILL.md` — and follow them as if loaded. Run git with `git -C <path>` and build tools from inside the worktree.

| Repo | What it is | Stack | PR base | Owner |
|---|---|---|---|---|
| `api` | Core backend: calls, SMS, contacts, AI agents, teams, billing | Spring Boot / Kotlin, PostgreSQL, RabbitMQ + SQS | `develop` | backend-developer |
| `desktop-app` | Main product app | Electron + React + TS, Vite, Biome, Vitest, Playwright, design-system submodule | `main` | frontend-developer |
| `web-app` | Web onboarding / signup | React 19, Vite, TanStack Router + Query, Tailwind + shadcn/ui | `main` | frontend-developer |
| `ai-studio` | Transcription, `POST /v1/generate`, evals, KB ingest | TypeScript, SQS, Langfuse, Vitest | `main` | ai-developer |
| `voice-agent-config` | AI voice agent config-as-code | ElevenLabs API/CLI, JSON | `main` | ai-developer |
| `agent-runtime` | Instruction-driven agent runtime | TypeScript, Mastra, SQS FIFO, Langfuse | `main` | ai-developer |
| `private-mcp`, `public-mcp` | MCP servers: internal gateway, and public server over the public API | TypeScript, Vitest | `main` | ai-developer |

The repo's own `CLAUDE.md` / `README.md` wins over this table when they disagree.

### Cross-repo contracts

- **api → desktop-app**: desktop types are generated from the live dev backend (`npm run generate:api-remote`, needs the owner's secrets). JSON is `snake_case`.
- **api ↔ ai-studio**: `POST /v1/generate`, and jobs over SQS with results POSTed back.
- **api → agent-runtime**: SQS FIFO jobs; the runtime calls back through the MCP servers.
- **voice-agent-config → api**: client/webhook tools and dynamic variables injected at call time.

Providers ship before consumers, backward compatible. A consumer blocked on a provider is unblocked when the provider PR is **merged and deployed to dev** if the consumer needs the live API (type generation, e2e), or merged if it only needs the contract. The spec says which.

## Worktrees

Never work in a repo's main checkout — the owner uses it to run and test the apps. One worktree per ticket, created by whoever owns the work:

```bash
R=$REPOS_ROOT
git -C $R/<repo> fetch origin
git -C $R/<repo> worktree add $R/<repo>-eng-NNNN -b eng-NNNN-<short-slug> origin/<base>
```

The branch must contain `eng-NNNN` so GitHub links the PR to Linear. Designer UI previews use `<repo>-eng-NNNN-ui` on branch `eng-NNNN-ui-preview`.

**Setup** (the worktree has no gitignored files): copy the env files from the main checkout (`cp $R/<repo>/.env* <worktree>/`) and, for Node repos, run `npm ci`; `desktop-app` also needs `git -C <worktree> submodule update --init --recursive`. Copied env files are gitignored — never `git add` them.

**Handing a branch to the owner.** Git refuses to check out a branch in two worktrees, so once a PR is approved the developer releases its worktree (`git worktree remove`) after everything is pushed. The owner then runs `git -C $R/<repo> fetch && git -C $R/<repo> switch <branch>` in the main checkout. If more changes are needed later, the developer recreates the worktree from the remote branch.

## Local services

The owner keeps apps running on known ports: api `:8080`, desktop-app `:3001`, web-app `:3002`. **Never start, stop, or kill a process you did not start.** When you need a server, pick a free port:

```bash
for p in $(seq 4100 4199); do lsof -iTCP:$p -sTCP:LISTEN >/dev/null || { echo $p; break; }; done
```

## Definition of done (run in the worktree before every push)

**Check the remote, not your own run.** A push that pushed nothing still exits 0, and CI then reports green for the *previous* head. Compare `git rev-parse HEAD` against `@{u}` and against `gh pr view <n> --json headRefOid` before claiming CI passed. The same goes for any edit you report as made: re-read the saved artifact — a PR body, a spec, a Linear comment.

| Repo | Checks |
|---|---|
| `api` | `./gradlew ktlintCheck`; `./gradlew unitTest --tests "<each touched test class>"`; `./gradlew integrationTest --tests "<class>"` for touched persistence/controllers/listeners (Docker must be up); migrations checked by hand against entities; confirm tests actually ran in `build/test-results/<task>/TEST-*.xml` — exit 0 can mean zero tests, and Gradle caches results, so pass `--rerun` before trusting a green run |
| `desktop-app` | `npm run typecheck`; `npx biome check <changed files>` (never the whole project); `npm run test`; ds-check skill (`desktop-app/.claude/skills/ds-check/SKILL.md`) with zero 🔴; `e2e/` searched for any `data-testid` change |
| `web-app` | `npm run typecheck`; `npm run lint`; `npm run build` |
| `ai-studio` | `npm run typecheck`; `npm run lint` (zero warnings); `npm run test:coverage`; `npm run build` |
| `voice-agent-config` | `find agents/ tools/ tests/ -name "*.json" \| xargs -I{} jq . {} > /dev/null`; CI creates the ElevenLabs PR branch itself; never PATCH a production Main branch |
| `agent-runtime`, `private-mcp`, `public-mcp` | `npm run lint && npm run build && npm test` |

A check that fails only on code you did not touch is pre-existing: note it in the PR under `Pre-existing failures` instead of fixing unrelated code.

## Linear

- Team **ENG**, IDs `ENG-NNNN`. Use the official Linear MCP; look up team, state, and label IDs with its list tools.
- **Initiative = parent issue** — description holds the plan (initiative-manager owns it).
- **Technical task = sub-issue** — one PR in one repo; description holds the spec (tech-lead owns it; developers update only its status fields). Title: `[<repo>] <deliverable>`. Create with `save_issue` + `parentId`; dependencies are "blocked by" relations plus `Blocked by:` in the spec Overview.
- **Never write a bare `#N` or a raw PR/issue URL into Linear prose** — Linear auto-links them, sometimes against the wrong repo. Write `owner/repo#N`, "PR 1234", or "item N", and re-read what you saved.
- **A status change uses `state`, never `description`.** Passing a full `description` to `save_issue` replaces the whole body, and a status report sent that way silently destroys the spec. Edit the body only when the spec itself is what you are changing, and re-read what you saved.
- Change only the sections you own. Rewrite from the copy you fetched at the start of your run; re-fetch first only when someone else may have edited it since.
- States: Backlog → To do → In Progress → In Review → Done, plus `Blocked` and `Canceled`. Developers set In Progress and In Review; a sub-issue waiting on a dependency is `Blocked`.

## GitHub

Because agents and the owner share one account, **every comment, review body, and inline comment an agent writes ends with a hidden marker** so the watcher can tell humans from agents:

```
<!-- acme-agent:<role> -->
```

Useful queries:

```bash
# unresolved review threads
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(first:30){nodes{author{login} body createdAt}}}}}}}' -F o=acme-inc -F r=<repo> -F n=<number>
# top-level comments and reviews
gh pr view <number> -R acme-inc/<repo> --comments
# failing checks and their logs
gh pr checks <number> -R acme-inc/<repo>
gh run view <run-id> -R acme-inc/<repo> --log-failed
# reply in a review thread
gh api graphql -f query='mutation($t:ID!,$b:String!){addPullRequestReviewThreadReply(input:{pullRequestReviewThreadId:$t,body:$b}){comment{url}}}' -F t=<threadId> -F b="<body>"
# resolve a thread (reviewer only)
gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -F id=<threadId>
```

Bots (`dependabot`, `renovate`, `github-actions`, anything ending in `[bot]`) are not review feedback — except failing checks, which are. An automated code-review app is review feedback: triage it like any reviewer. It skips items the PR description lists under `Out of scope`, so put deliberate deferrals there.

## Initiative state

The orchestrator keeps `~/.claude/initiatives/ENG-NNNN/registry.md` (the parent issue ID) with every sub-issue, its worktree, agent, PR, review round, and status. Agents may read it; only the orchestrator writes it. Linear and GitHub stay the source of truth.

## Status emojis

⚪ Not started · 🟡 In progress · 🔵 In review · 🟢 Done · 🔴 Blocked · ⚫ Dropped

## Language

Talk to the owner in their language. Write code, commits, PRs, review comments, Linear issues, plans, and specs in English.

## Hard rules (from the owner — never break)

- Never `git stash`. Worktrees to switch context; explicit `git add <paths>` to scope a commit.
- Never reset a database. Never run migrations or writes against production — prepare the command for the owner.
- Never publish messages to RabbitMQ or SQS queues.
- Never add `production`/`latest` labels to Langfuse prompt versions unless asked.
- Never touch personal scratch files (`plan.md`, `draft.md`, `*.csv`, `*.sql`) at repo roots.
- Tests never assert on log output.
- A squash-merged branch is dead: follow-up work starts a new branch from the base.
- Never merge a PR, never mark a draft ready, never force-push, never rewrite history on a branch under review.
- Never start, stop, or kill processes you did not start.
- HIPAA: content leaving api follows api's `hipaa` skill — fail closed, never fall back.
- Product LLM calls in Acme services use Gemini, never another provider's models. This governs the product, not the team's own models.
- Metrics and acceptance measurements come from structured data (columns, tool actions, events), never from classifying AI-generated text. Missing data means instrumentation work.

## Token budget

Every turn re-sends your whole context, so what you spend is context x turns, not what you write. A result pulled in early is paid for again in every later turn, and one extra turn costs about as much as a small file read.

- **Bound every command's output.** `git diff --stat` and `git show --numstat`, never a full diff; `gh pr view <n> -R <repo> --json <fields> -q '<jq>'`; `gh run view <id> -R <repo> --log-failed | tail -80`; `./gradlew -q`; `npm run <script> 2>&1 | tail -30`. Never run a watch or dev script (`test:watch`, `npm run dev`, `--watch`): it never exits and streams into your context until it is killed.
- **Locate before you read.** `rg -n "<symbol>" <dir>` first, then `Read` with `offset`/`limit` around the hit. Never read a file over ~400 lines whole, and never read the same file twice.
- **Linear costs ~13k tokens per fetch and the same per save.** Fetch an issue once per run and batch your edits into a single `save_issue` at the end — except a status the orchestrator is waiting on. Per-commit progress goes in the PR body, which is free to rewrite.
- **Batch independent calls into one message** instead of one per turn.
- **Never paste what already has an address.** Cite `path:line`, `ENG-NNNN`, `owner/repo#N`, a commit SHA or a review-thread id — in reports, Linear comments, PR bodies, and anything you hand another agent.
- **Write a document once.** Compose a PR body, spec, or comment in one pass and post it.
- **Your `## Report` is the only text anyone reads.** SUMMARY stays under 6 lines, states outcome and consequence, and never narrates the steps you took or restates the spec.

## Commits and PR titles

- Every commit is one line: `ENG-NNNN: short description` — no body, no trailers (the owner's rule; it overrides any default attribution).
- PR titles: desktop-app `type(area): summary (ENG-NNNN)` — release-please parses the squash title; every other repo `ENG-NNNN: summary`.
- PR descriptions end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Do your own work

- **Never release a worktree while a review of it is in flight** — the reviewer may be running suites inside it. Ask the reviewer first, or wait for its verdict.
- **A reviewer never writes to a worktree it is reviewing.** A verdict evidenced against a tree the reviewer itself altered is unfalsifiable, and it can overwrite work the developer has not pushed. Read, run, and report; if something must change, let the developer change it.
- **You are the one who does the task you were given. Never spawn another agent to do it for you.** Launching a read-only `Explore` for a broad search is fine. Handing over your implementation, your review or your spec is not.

## Report protocol

You run as a subagent: only the orchestrator (the main session running `/initiative`) reads your output, and it relays between agents and the owner. End every run with exactly this block (omit fields that don't apply to your role):

```
## Report
AGENT: <initiative-manager | tech-lead | designer | backend-developer | frontend-developer | ai-developer>
MODE: <mode>
STATUS: <DONE | APPROVED | CHANGES_REQUESTED | NEEDS_INPUT | BLOCKED>
TICKET: <ENG-NNNN or ->
PR: <url or ->
WORKTREE: <path or ->
PREVIEW: <start command + URL path, designer ui-preview only>
CHECKS: <one line per definition-of-done check: name + pass/fail (+ the failing test or rule when it failed)>
DEVIATIONS: <from the spec, with reason>
SUMMARY: <at most 6 lines: outcome, what it means for the next step, anything surprising>
QUESTIONS: <only when NEEDS_INPUT — max 4 per round, most important first, each block ready for AskUserQuestion:
  - question: <full question ending in "?">
    header: <≤ 12 chars>
    multiSelect: <true | false>
    options: <2–4 mutually exclusive "label — description" lines, your recommendation first with "(Recommended)" in the label>>
NEXT: <what the orchestrator should do next>
```
