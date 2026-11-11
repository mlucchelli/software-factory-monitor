<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## This project

Read-only monitor over local Claude Code state, with two write paths into a tmux pane (see `README.md` for both).

- `src/lib/claude/` is server-only: it reads `~/.claude`. Transcripts reach hundreds of MB — only ever read a file's head or tail (`jsonl.ts`), cache summaries by mtime + size (`transcripts.ts`), and fold whole-file numbers forward from the last byte offset (`usage.ts`).
- Live updates: `/api/stream` polls file sizes every 1.5s and pushes appended lines as SSE `activity` events; `/api/sources/<id>/stream` does the same for one transcript with full tool inputs, results and diffs; `/api/activity` backfills recent events on page load.
- Agent status: `running` when the transcript changed in the last 45s, `reported` when its latest `SubagentHandback` came after its latest prompt, `idle` otherwise.
- An open `AskUserQuestion` is absent from the transcript until it is answered, so a waiting session's question comes from `tmux capture-pane` (`tmux.ts`).
- Actions (`/api/sessions/<id>/keys`, `/api/sessions/<id>/message`) must pass `rejectForeignRequest`; keys also confirm the dialog is still on screen, and messages are refused unless the session is idle in tmux with no question showing. Answers go through the confirmation dialog; a chat message is confirmed by pressing Enter in a composer that names its target session. Do not relax these guards (queueing or messaging a busy session is a product decision, not a code change).
- The third write path, `POST /api/sessions`, starts `claude` in a new detached tmux session. It must pass `rejectForeignRequest`; its working directory comes only from the server-side allowlist in `launch.ts` (git checkouts directly under `AGENTS_MONITOR_REPOS`, and that folder itself for initiatives); its argv is built in `launch-command.ts` and passed to `execFile("tmux", argv)` — never a shell string; it adds no Claude flags; it keeps its preview-then-confirm step; and it allows one launch at a time. Do not add a fourth write path without the owner asking for it; in demo mode this one answers 403.
- The chat pages older history through `/api/sources/<id>/history?before=<offset>`, a byte cursor the stream reports; never read a transcript whole. Never write to `~/.claude`, Linear or GitHub. The server binds to `127.0.0.1` only.
- Colors: role colors are the validated categorical palette in `globals.css` (`--series-*`, fixed order in `present.ts`); status colors (`--status-*`) are reserved for state and always ship with an icon and a label.
- Environment is read only in `src/lib/config.ts`. Add a setting there and to `.env.example`, never as a `process.env` read elsewhere.
- Issues come through `IssueTracker` (`src/lib/trackers/`, Linear implemented) and pull requests through `PullRequestSource` (`src/lib/pull-requests/`, GitHub via `gh`). Components import neither; they see `Initiative` from `src/lib/initiatives.ts`.
- `pnpm demo` generates a Claude home under `.demo/` from `scripts/demo/scenario.mjs`. When a parser starts reading a new transcript field, add it to `scripts/demo/records.mjs` and to `scripts/demo/scenario.test.ts`, which reads the demo back through the real readers.
- The pipeline is data: `src/lib/pipeline-definition.ts` parses phases and gates from the skill and components take `steps` from `useMonitorData()`. Do not hardcode a phase list; if the skill in `team/` changes shape, update `DEFAULT_STEPS` until `pipeline-definition.test.ts` passes.
- `pnpm test:e2e` runs the Playwright smoke tests in `e2e/` against the demo. A new page gets a test there.
- Charts use the role palette in its fixed order (`inPaletteOrder` in `client/costs.ts`): a role keeps its color whatever its rank, and text stays in ink tokens.
- `team/` holds the role prompts and the `/initiative` skill the monitor displays. The monitor parses their report fields, `MODE:` lines, phase numbers and gate names; change those in both places.
- Checks before finishing: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`, and `pnpm test:e2e` when a page changed.
