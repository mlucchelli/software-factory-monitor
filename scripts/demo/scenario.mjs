/*
 * The demo data: a fictional team ("Acme") part-way through one initiative,
 * with a second one paused at a gate, a finished one, and a plain session.
 * `buildScenario(now)` returns every file of a synthetic Claude home, with
 * timestamps relative to `now`, plus the runs the live ticker keeps moving.
 */

import { resetIds, Transcript } from "./records.mjs";

const MIN = 60_000;
const HOUR = 60 * MIN;

const REPOS = "/home/dev/repos";
const PROJECT = "-home-dev-repos";
const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-4-5";

export const SESSIONS = {
  savedReplies: "5f0c2a9e-1b7d-4c3a-9e21-0a1b2c3d4e01",
  bulkExport: "5f0c2a9e-1b7d-4c3a-9e21-0a1b2c3d4e02",
  flakyTest: "5f0c2a9e-1b7d-4c3a-9e21-0a1b2c3d4e03",
  auditLog: "5f0c2a9e-1b7d-4c3a-9e21-0a1b2c3d4e04",
};

const agentId = (n) => `a${n.toString(16).padStart(16, "0")}`;

const pr = (repository, number) =>
  `https://github.com/acme-inc/${repository}/pull/${number}`;

const issueUrl = (key) => `https://linear.app/acme/issue/${key}`;

function handBack(from, message) {
  return `<agent-message from="${from}">\n${message}\n</agent-message>`;
}

export function buildScenario(now) {
  resetIds();
  /** @type {Record<string, string>} */
  const files = {};
  const live = [];

  const addAgent = (session, id, meta, transcript) => {
    const dir = `projects/${PROJECT}/${session}/subagents`;
    files[`${dir}/agent-${id}.jsonl`] = transcript.toString();
    files[`${dir}/agent-${id}.meta.json`] = JSON.stringify({
      spawnDepth: 1,
      isFork: false,
      model: transcript.model,
      ...meta,
    });
    return `${dir}/agent-${id}.jsonl`;
  };

  /** One finished run: launch prompt, a few tool calls, a hand-back. */
  const finishedRun = ({
    cwd,
    branch,
    model,
    start,
    prompt,
    steps,
    report,
  }) => {
    const t = new Transcript({ cwd, branch, model });
    t.prompt(start, prompt);
    let at = start + 20_000;
    for (const [name, input, result] of steps) {
      t.tool(at, name, input, result);
      at += 45_000;
    }
    const message = t.report(at, report);
    return { transcript: t, message, end: at };
  };

  // ── ENG-412 · Saved replies ──────────────────────────────────────────────
  const s1 = new Transcript({ cwd: REPOS, branch: undefined, model: OPUS });
  const S1 = SESSIONS.savedReplies;
  const t0 = now - 5 * HOUR;
  s1.meta(t0, {
    type: "ai-title",
    aiTitle: "Saved replies for the shared inbox",
  });
  s1.meta(t0, { type: "permission-mode", permissionMode: "default" });
  s1.prompt(
    t0,
    "/initiative Agents answer the same ten questions all day. Let them save a reply once and insert it from the composer, and suggest the right one from the conversation.",
  );
  s1.say(
    t0 + 30_000,
    "Intake is complete: the problem, the audience and the success measure are clear. Starting the plan with the initiative manager.",
  );

  const spawn = (at, role, description) =>
    s1.tool(
      at,
      "Agent",
      { subagent_type: role, description, prompt: "…" },
      "Launched in the background.",
    );

  // Manager · draft
  spawn(t0 + MIN, "initiative-manager", "Draft the ENG-412 plan");
  const manager = finishedRun({
    cwd: REPOS,
    model: OPUS,
    start: t0 + MIN,
    prompt:
      "MODE: draft\nRequirement: saved replies for the shared inbox.\nWrite the initiative plan as parent issue ENG-412.",
    steps: [
      ["Grep", { pattern: "composer" }, "14 files"],
      [
        "mcp__linear__save_issue",
        { title: "Saved replies for the shared inbox" },
        "ENG-412 created",
      ],
    ],
    report: {
      AGENT: "initiative-manager",
      MODE: "draft",
      STATUS: "DONE",
      TICKET: "ENG-412",
      SUMMARY:
        "Plan written as ENG-412: two releases, five sub-issues across api, web-app and ai-studio.",
      QUESTIONS: "-",
      NEXT: "Tech lead plan review.",
    },
  });
  addAgent(
    S1,
    agentId(1),
    { agentType: "initiative-manager", description: "Draft the ENG-412 plan" },
    manager.transcript,
  );
  s1.prompt(manager.end + 2000, handBack(agentId(1), manager.message));

  // Tech lead · review-plan
  spawn(manager.end + MIN, "tech-lead", "Review the ENG-412 plan");
  const planReview = finishedRun({
    cwd: REPOS,
    model: OPUS,
    start: manager.end + MIN,
    prompt:
      "MODE: review-plan\nTicket: ENG-412, round 1. Validate the plan against the codebase.",
    steps: [
      ["Read", { file_path: `${REPOS}/api/src/inbox/ReplyController.kt` }, "…"],
      ["Grep", { pattern: "ComposerToolbar" }, "3 files"],
    ],
    report: {
      AGENT: "tech-lead",
      MODE: "review-plan",
      STATUS: "APPROVED",
      TICKET: "ENG-412",
      SUMMARY:
        "The plan holds. One change: analytics events move to their own sub-issue so the CRUD endpoints can ship first.",
      QUESTIONS: "-",
      NEXT: "Gate A.",
    },
  });
  addAgent(
    S1,
    agentId(2),
    { agentType: "tech-lead", description: "Review the ENG-412 plan" },
    planReview.transcript,
  );
  s1.prompt(planReview.end + 2000, handBack(agentId(2), planReview.message));
  s1.say(
    planReview.end + 10_000,
    "Gate A: the plan is approved by the tech lead. Do you approve it?",
  );
  s1.prompt(planReview.end + 6 * MIN, "Approved. Go ahead with the breakdown.");

  // Tech lead · breakdown
  const breakdownStart = planReview.end + 7 * MIN;
  spawn(breakdownStart, "tech-lead", "Break ENG-412 into sub-issues");
  const breakdown = finishedRun({
    cwd: REPOS,
    model: OPUS,
    start: breakdownStart,
    prompt:
      "MODE: breakdown\nTicket: ENG-412. Create the sub-issues with a technical spec each.",
    steps: [
      [
        "mcp__linear__save_issue",
        { title: "[api] Saved replies CRUD endpoints R1" },
        "ENG-413 created",
      ],
      [
        "mcp__linear__save_issue",
        { title: "[web-app] Saved replies picker in the composer R1" },
        "ENG-414 created",
      ],
      [
        "mcp__linear__save_issue",
        { title: "[api] Usage events for saved replies R1" },
        "ENG-415 created",
      ],
    ],
    report: {
      AGENT: "tech-lead",
      MODE: "breakdown",
      STATUS: "DONE",
      TICKET: "ENG-412",
      SUMMARY:
        "Five sub-issues, ENG-413 to ENG-417, each with acceptance criteria and a test plan.",
      QUESTIONS: "-",
      NEXT: "UI preview for ENG-414.",
    },
  });
  addAgent(
    S1,
    agentId(3),
    { agentType: "tech-lead", description: "Break ENG-412 into sub-issues" },
    breakdown.transcript,
  );
  s1.prompt(breakdown.end + 2000, handBack(agentId(3), breakdown.message));

  // Designer · ui-preview
  spawn(breakdown.end + MIN, "designer", "Preview the saved replies picker");
  const preview = finishedRun({
    cwd: `${REPOS}/web-app-eng-414-preview`,
    branch: "eng-414-preview",
    model: OPUS,
    start: breakdown.end + MIN,
    prompt:
      "MODE: ui-preview\nTicket: ENG-414. Build a live preview of the picker from the real components.",
    steps: [
      ["Read", { file_path: `${REPOS}/web-app/src/inbox/Composer.tsx` }, "…"],
      [
        "Write",
        {
          file_path: `${REPOS}/web-app-eng-414-preview/src/preview/SavedRepliesPicker.tsx`,
          content: "export function SavedRepliesPicker() {}",
        },
        "Written",
      ],
      [
        "Bash",
        {
          command: "pnpm dev --port 5180",
          description: "Start the preview server",
        },
        "ready on http://localhost:5180",
      ],
    ],
    report: {
      AGENT: "designer",
      MODE: "ui-preview",
      STATUS: "DONE",
      TICKET: "ENG-414",
      PREVIEW: "http://localhost:5180/preview/saved-replies",
      SUMMARY:
        "Picker opens from the composer toolbar or with '/', filters as you type and inserts on Enter.",
      QUESTIONS: "-",
      NEXT: "Gate UI.",
    },
  });
  addAgent(
    S1,
    agentId(4),
    { agentType: "designer", description: "Preview the saved replies picker" },
    preview.transcript,
  );
  s1.prompt(preview.end + 2000, handBack(agentId(4), preview.message));
  s1.prompt(
    preview.end + 9 * MIN,
    "The preview is good. Start development on R1.",
  );

  // Backend · ENG-413 (merged) and its review
  const buildStart = preview.end + 10 * MIN;
  spawn(buildStart, "backend-developer", "Implement ENG-413");
  const crud = finishedRun({
    cwd: `${REPOS}/api-eng-413`,
    branch: "eng-413-saved-replies-crud",
    model: SONNET,
    start: buildStart,
    prompt:
      "MODE: implement\nTicket: ENG-413. Implement the spec commit by commit behind a draft PR.",
    steps: [
      [
        "Write",
        {
          file_path: `${REPOS}/api-eng-413/src/replies/SavedReplyController.kt`,
          content: "class SavedReplyController",
        },
        "Written",
      ],
      [
        "Bash",
        {
          command: "./gradlew test --tests '*SavedReply*'",
          description: "Run the saved reply tests",
        },
        "BUILD SUCCESSFUL, 18 tests",
      ],
      [
        "Bash",
        { command: "gh pr create --draft", description: "Open the draft PR" },
        pr("api", 231),
      ],
    ],
    report: {
      AGENT: "backend-developer",
      MODE: "implement",
      STATUS: "DONE",
      TICKET: "ENG-413",
      PR: pr("api", 231),
      WORKTREE: `${REPOS}/api-eng-413`,
      CHECKS: "passing",
      SUMMARY: "CRUD endpoints with per-workspace scoping and 18 tests.",
      QUESTIONS: "-",
      NEXT: "Review.",
    },
  });
  addAgent(
    S1,
    agentId(5),
    { agentType: "backend-developer", description: "Implement ENG-413" },
    crud.transcript,
  );
  s1.prompt(crud.end + 2000, handBack(agentId(5), crud.message));

  spawn(crud.end + MIN, "tech-lead", "Review PR for ENG-413");
  const crudReview = finishedRun({
    cwd: `${REPOS}/api`,
    branch: "main",
    model: OPUS,
    start: crud.end + MIN,
    prompt: `MODE: review-pr\nTicket: ENG-413, round 1. Review ${pr("api", 231)} against the spec.`,
    steps: [
      [
        "Bash",
        { command: "gh pr diff 231", description: "Read the diff" },
        "+412 −9",
      ],
      [
        "Bash",
        {
          command: "./gradlew test",
          description: "Run the suite on the branch",
        },
        "BUILD SUCCESSFUL",
      ],
    ],
    report: {
      AGENT: "tech-lead",
      MODE: "review-pr",
      STATUS: "APPROVED",
      TICKET: "ENG-413",
      PR: pr("api", 231),
      SUMMARY: "Every acceptance criterion verified. Ready to merge.",
      QUESTIONS: "-",
      NEXT: "Owner merges.",
    },
  });
  addAgent(
    S1,
    agentId(6),
    { agentType: "tech-lead", description: "Review PR for ENG-413" },
    crudReview.transcript,
  );
  s1.prompt(crudReview.end + 2000, handBack(agentId(6), crudReview.message));

  // Frontend · ENG-414, reported 12 minutes ago after fixing review round 1
  const pickerStart = now - 95 * MIN;
  spawn(pickerStart, "frontend-developer", "Implement ENG-414");
  const picker = new Transcript({
    cwd: `${REPOS}/web-app-eng-414`,
    branch: "eng-414-saved-replies-picker",
    model: SONNET,
  });
  picker.prompt(
    pickerStart,
    "MODE: implement\nTicket: ENG-414. Start from the approved UI preview.",
  );
  picker.tool(
    pickerStart + MIN,
    "Edit",
    {
      file_path: `${REPOS}/web-app-eng-414/src/inbox/Composer.tsx`,
      old_string: "<Toolbar />",
      new_string: "<Toolbar>\n  <SavedRepliesButton />\n</Toolbar>",
    },
    "Edited",
  );
  picker.tool(
    pickerStart + 9 * MIN,
    "Bash",
    { command: "pnpm test picker", description: "Run the picker tests" },
    "12 passed",
  );
  picker.report(pickerStart + 20 * MIN, {
    AGENT: "frontend-developer",
    MODE: "implement",
    STATUS: "DONE",
    TICKET: "ENG-414",
    PR: pr("web-app", 88),
    WORKTREE: `${REPOS}/web-app-eng-414`,
    CHECKS: "passing",
    SUMMARY: "Picker wired into the composer, keyboard navigation included.",
    QUESTIONS: "-",
    NEXT: "Review.",
  });
  picker.prompt(
    now - 30 * MIN,
    "MODE: iterate\nTicket: ENG-414. Review round 1 requested changes: the picker loses focus after inserting, and the empty state has no action.",
  );
  picker.tool(
    now - 28 * MIN,
    "Edit",
    {
      file_path: `${REPOS}/web-app-eng-414/src/inbox/SavedRepliesPicker.tsx`,
      old_string: "onSelect(reply)",
      new_string: "onSelect(reply);\ncomposerRef.current?.focus()",
    },
    "Edited",
  );
  picker.tool(
    now - 18 * MIN,
    "Bash",
    {
      command: "pnpm test picker && git push",
      description: "Run the tests and push the fixes",
    },
    "14 passed · pushed",
  );
  const pickerMessage = picker.report(now - 12 * MIN, {
    AGENT: "frontend-developer",
    MODE: "iterate",
    STATUS: "DONE",
    TICKET: "ENG-414",
    PR: pr("web-app", 88),
    WORKTREE: `${REPOS}/web-app-eng-414`,
    CHECKS: "passing",
    SUMMARY:
      "Both review comments fixed: focus returns to the composer, and the empty state links to settings.",
    QUESTIONS: "-",
    NEXT: "Review round 2.",
  });
  addAgent(
    S1,
    agentId(7),
    { agentType: "frontend-developer", description: "Implement ENG-414" },
    picker,
  );

  // Tech lead · ENG-414 round 1 (changes requested), then round 2 running now
  const round1 = finishedRun({
    cwd: `${REPOS}/web-app`,
    branch: "main",
    model: OPUS,
    start: now - 70 * MIN,
    prompt: `MODE: review-pr\nTicket: ENG-414, round 1. Review ${pr("web-app", 88)} against the spec and the approved preview.`,
    steps: [
      [
        "Bash",
        { command: "gh pr diff 88", description: "Read the diff" },
        "+268 −14",
      ],
      [
        "Bash",
        { command: "pnpm test", description: "Run the suite on the branch" },
        "341 passed",
      ],
    ],
    report: {
      AGENT: "tech-lead",
      MODE: "review-pr",
      STATUS: "CHANGES_REQUESTED",
      TICKET: "ENG-414",
      PR: pr("web-app", 88),
      SUMMARY:
        "Two findings: focus is lost after inserting a reply, and the empty state offers no way to create one.",
      QUESTIONS: "-",
      NEXT: "Developer iterates.",
    },
  });
  addAgent(
    S1,
    agentId(8),
    { agentType: "tech-lead", description: "Review PR for ENG-414" },
    round1.transcript,
  );
  s1.prompt(round1.end + 2000, handBack(agentId(8), round1.message));
  s1.prompt(now - 12 * MIN + 2000, handBack(agentId(7), pickerMessage));

  spawn(now - 9 * MIN, "tech-lead", "Review PR for ENG-414, round 2");
  const round2 = new Transcript({
    cwd: `${REPOS}/web-app`,
    branch: "main",
    model: OPUS,
  });
  round2.prompt(
    now - 9 * MIN,
    `MODE: review-pr\nTicket: ENG-414, round 2. Verify the two fixes on ${pr("web-app", 88)} and re-check every criterion.`,
  );
  round2.tool(
    now - 8 * MIN,
    "Bash",
    { command: "gh pr diff 88", description: "Read the new commits" },
    "+41 −6",
  );
  round2.tool(
    now - 5 * MIN,
    "Read",
    { file_path: `${REPOS}/web-app-eng-414/src/inbox/SavedRepliesPicker.tsx` },
    "…",
  );
  live.push({
    file: addAgent(
      S1,
      agentId(9),
      { agentType: "tech-lead", description: "Review PR for ENG-414, round 2" },
      round2,
    ),
    transcript: round2,
    script: [
      [
        "Bash",
        { command: "pnpm test picker", description: "Run the picker tests" },
        "14 passed",
      ],
      [
        "Read",
        { file_path: `${REPOS}/web-app-eng-414/src/inbox/EmptyState.tsx` },
        "…",
      ],
      ["Grep", { pattern: "composerRef" }, "4 matches"],
      [
        "Bash",
        { command: "pnpm lint", description: "Lint the branch" },
        "No issues",
      ],
      [
        "Read",
        { file_path: `${REPOS}/web-app-eng-414/src/inbox/Composer.test.tsx` },
        "…",
      ],
    ],
  });

  // Backend · ENG-415 running now, with an Explore helper
  spawn(now - 26 * MIN, "backend-developer", "Implement ENG-415");
  const events = new Transcript({
    cwd: `${REPOS}/api-eng-415`,
    branch: "eng-415-usage-events",
    model: SONNET,
  });
  events.prompt(
    now - 26 * MIN,
    "MODE: implement\nTicket: ENG-415. Emit usage events when a saved reply is created, inserted or deleted.",
  );
  events.tool(
    now - 24 * MIN,
    "Agent",
    {
      subagent_type: "Explore",
      description: "Find the event publishers",
      prompt: "…",
    },
    "Events are published through AnalyticsPublisher in three services.",
  );
  events.tool(
    now - 15 * MIN,
    "Write",
    {
      file_path: `${REPOS}/api-eng-415/src/replies/SavedReplyEvents.kt`,
      content: "sealed interface SavedReplyEvent",
    },
    "Written",
  );
  events.tool(
    now - 7 * MIN,
    "Bash",
    { command: "gh pr create --draft", description: "Open the draft PR" },
    pr("api", 236),
  );
  live.push({
    file: addAgent(
      S1,
      agentId(10),
      { agentType: "backend-developer", description: "Implement ENG-415" },
      events,
    ),
    transcript: events,
    script: [
      [
        "Edit",
        {
          file_path: `${REPOS}/api-eng-415/src/replies/SavedReplyService.kt`,
          old_string: "repository.save(reply)",
          new_string:
            "repository.save(reply)\npublisher.publish(SavedReplyCreated(reply.id))",
        },
        "Edited",
      ],
      [
        "Bash",
        {
          command: "./gradlew test --tests '*SavedReplyEvents*'",
          description: "Run the event tests",
        },
        "2 tests failed",
      ],
      [
        "Read",
        {
          file_path: `${REPOS}/api-eng-415/src/test/replies/SavedReplyEventsTest.kt`,
        },
        "…",
      ],
      [
        "Edit",
        {
          file_path: `${REPOS}/api-eng-415/src/test/replies/SavedReplyEventsTest.kt`,
          old_string: "verify(publisher)",
          new_string: "verify(publisher, timeout(500))",
        },
        "Edited",
      ],
      [
        "Bash",
        {
          command: "./gradlew test --tests '*SavedReplyEvents*'",
          description: "Run the event tests",
        },
        "BUILD SUCCESSFUL, 9 tests",
      ],
      [
        "Bash",
        {
          command:
            "git commit -am 'Publish usage events for saved replies' && git push",
          description: "Commit and push",
        },
        "pushed",
      ],
    ],
  });
  const explore = finishedRun({
    cwd: `${REPOS}/api-eng-415`,
    branch: "eng-415-usage-events",
    model: HAIKU,
    start: now - 24 * MIN,
    prompt:
      "Find every place the API publishes analytics events and how they are tested.",
    steps: [
      ["Grep", { pattern: "AnalyticsPublisher" }, "11 files"],
      [
        "Read",
        {
          file_path: `${REPOS}/api-eng-415/src/analytics/AnalyticsPublisher.kt`,
        },
        "…",
      ],
    ],
    report: {
      AGENT: "Explore",
      STATUS: "DONE",
      SUMMARY:
        "Events go through AnalyticsPublisher; three services call it and each has a publisher test.",
    },
  });
  addAgent(
    S1,
    agentId(11),
    {
      agentType: "Explore",
      description: "Find the event publishers",
      parentAgentId: agentId(10),
      spawnDepth: 2,
    },
    explore.transcript,
  );

  // AI dev · ENG-416 needs input
  spawn(now - 40 * MIN, "ai-developer", "Implement ENG-416");
  const suggest = new Transcript({
    cwd: `${REPOS}/ai-studio-eng-416`,
    branch: "eng-416-suggest-reply",
    model: SONNET,
  });
  suggest.prompt(
    now - 40 * MIN,
    "MODE: implement\nTicket: ENG-416. Suggest a saved reply from the last messages of the conversation.",
  );
  suggest.tool(
    now - 37 * MIN,
    "Read",
    { file_path: `${REPOS}/ai-studio-eng-416/src/generate/router.py` },
    "…",
  );
  suggest.tool(
    now - 22 * MIN,
    "Bash",
    {
      command: "pytest evals/suggest_reply -q",
      description: "Run the suggestion evals",
    },
    "top-1 71%, top-3 93% over 120 conversations",
  );
  const suggestMessage = suggest.report(now - 4 * MIN, {
    AGENT: "ai-developer",
    MODE: "implement",
    STATUS: "NEEDS_INPUT",
    TICKET: "ENG-416",
    WORKTREE: `${REPOS}/ai-studio-eng-416`,
    SUMMARY:
      "The ranking works: the right reply is first in 71% of the eval conversations and in the top three in 93%.",
    QUESTIONS:
      "Show one suggestion (wrong 29% of the time) or the top three as chips? The spec says one; the evals favour three.",
    NEXT: "Finish the endpoint once the product decision is made.",
  });
  addAgent(
    S1,
    agentId(12),
    { agentType: "ai-developer", description: "Implement ENG-416" },
    suggest,
  );
  s1.prompt(now - 4 * MIN + 2000, handBack(agentId(12), suggestMessage));
  s1.say(
    now - 3 * MIN,
    "The AI developer needs a product decision on ENG-416: show a single suggested reply, or the top three as chips? The evals put the right reply first 71% of the time and in the top three 93%. Development on ENG-414 and ENG-415 continues meanwhile.",
  );

  // Helper under the orchestrator
  const ruleCheck = finishedRun({
    cwd: `${REPOS}/api`,
    branch: "main",
    model: HAIKU,
    start: now - 50 * MIN,
    prompt: `Check that the migration in ${pr("api", 231)} follows the naming rule in docs/migrations.md.`,
    steps: [
      [
        "Bash",
        {
          command: "gh pr diff 231 --name-only",
          description: "List the changed files",
        },
        "V412__saved_replies.sql",
      ],
    ],
    report: {
      AGENT: "general-purpose",
      STATUS: "DONE",
      SUMMARY: "The migration name follows the rule.",
    },
  });
  spawn(now - 50 * MIN, "general-purpose", "Check the migration naming rule");
  addAgent(
    S1,
    agentId(13),
    {
      agentType: "general-purpose",
      description: "Check the migration naming rule",
    },
    ruleCheck.transcript,
  );
  s1.meta(now - 3 * MIN, {
    type: "cost-state",
    totalCostUSD: 0,
    totalLinesAdded: 721,
    totalLinesRemoved: 29,
  });

  files[`projects/${PROJECT}/${S1}.jsonl`] = s1.toString();
  live.push({
    file: `projects/${PROJECT}/${S1}.jsonl`,
    transcript: s1,
    every: 9,
    script: [
      [
        "Bash",
        {
          command: "scripts/watch-prs.sh ENG-412",
          description: "Check the open pull requests",
        },
        "api#236 draft · web-app#88 checks passing",
      ],
      ["Read", { file_path: "~/.claude/initiatives/ENG-412/registry.md" }, "…"],
    ],
  });

  files["initiatives/ENG-412/registry.md"] =
    `# ENG-412 — Saved replies for the shared inbox

Phase: 5 — Build (R1)
Parent: ${issueUrl("ENG-412")}

## Agents

| Role | Mode | Ticket | Agent |
|---|---|---|---|
| initiative-manager | draft | ENG-412 | ${agentId(1)} |
| tech-lead | review-plan | ENG-412 | ${agentId(2)} |
| tech-lead | breakdown | ENG-412 | ${agentId(3)} |
| designer | ui-preview | ENG-414 | ${agentId(4)} |
| backend-developer | implement | ENG-413 | ${agentId(5)} |
| tech-lead | review-pr | ENG-413 | ${agentId(6)} |
| frontend-developer | implement | ENG-414 | ${agentId(7)} |
| tech-lead | review-pr R1 | ENG-414 | ${agentId(8)} |
| tech-lead | review-pr R2 | ENG-414 | ${agentId(9)} |
| backend-developer | implement | ENG-415 | ${agentId(10)} |
| ai-developer | implement | ENG-416 | ${agentId(12)} |

## Live previews

| Ticket | URL |
|---|---|
| ENG-414 | http://localhost:5180/preview/saved-replies |

## Log

- Intake complete; plan drafted as ENG-412.
- Plan review round 1: approved with one change (analytics split out).
- Gate A passed.
- Breakdown: ENG-413 to ENG-417.
- Gate UI passed for ENG-414. Gate B: R1 started.
- ENG-413 approved in round 1 and merged.
- ENG-414 review round 1: changes requested. Fixes pushed, round 2 running.
- ENG-416 needs a product decision: one suggestion or three.
`;

  // ── ENG-398 · Bulk export, paused at Gate A with an open question ─────────
  const s2 = new Transcript({ cwd: REPOS, model: OPUS });
  const S2 = SESSIONS.bulkExport;
  const b0 = now - 100 * MIN;
  s2.meta(b0, { type: "ai-title", aiTitle: "Bulk export of contacts" });
  s2.prompt(
    b0,
    "/initiative Admins need to export all contacts of a workspace as CSV, including custom fields, without asking support.",
  );
  s2.tool(
    b0 + MIN,
    "Agent",
    {
      subagent_type: "initiative-manager",
      description: "Draft the ENG-398 plan",
      prompt: "…",
    },
    "Launched in the background.",
  );
  const exportPlan = finishedRun({
    cwd: REPOS,
    model: OPUS,
    start: b0 + MIN,
    prompt:
      "MODE: draft\nRequirement: bulk export of contacts.\nWrite the initiative plan as parent issue ENG-398.",
    steps: [
      [
        "mcp__linear__save_issue",
        { title: "Bulk export of contacts" },
        "ENG-398 created",
      ],
    ],
    report: {
      AGENT: "initiative-manager",
      MODE: "draft",
      STATUS: "DONE",
      TICKET: "ENG-398",
      SUMMARY:
        "Plan written: an async export job, a download page and an email when it is ready.",
      QUESTIONS: "-",
      NEXT: "Plan review.",
    },
  });
  addAgent(
    S2,
    agentId(21),
    { agentType: "initiative-manager", description: "Draft the ENG-398 plan" },
    exportPlan.transcript,
  );
  s2.prompt(exportPlan.end + 2000, handBack(agentId(21), exportPlan.message));
  s2.tool(
    exportPlan.end + MIN,
    "Agent",
    {
      subagent_type: "tech-lead",
      description: "Review the ENG-398 plan",
      prompt: "…",
    },
    "Launched in the background.",
  );
  const exportReview = finishedRun({
    cwd: REPOS,
    model: OPUS,
    start: exportPlan.end + MIN,
    prompt:
      "MODE: review-plan\nTicket: ENG-398, round 2. Validate the revised plan against the codebase.",
    steps: [
      ["Grep", { pattern: "ExportJob" }, "No matches"],
      ["Read", { file_path: `${REPOS}/api/src/jobs/JobRunner.kt` }, "…"],
    ],
    report: {
      AGENT: "tech-lead",
      MODE: "review-plan",
      STATUS: "APPROVED",
      TICKET: "ENG-398",
      SUMMARY:
        "Feasible with the existing job runner. Exports above 200k rows need streaming, now in the plan.",
      QUESTIONS: "-",
      NEXT: "Gate A.",
    },
  });
  addAgent(
    S2,
    agentId(22),
    { agentType: "tech-lead", description: "Review the ENG-398 plan" },
    exportReview.transcript,
  );
  s2.prompt(
    exportReview.end + 2000,
    handBack(agentId(22), exportReview.message),
  );
  s2.say(
    exportReview.end + 8000,
    "Gate A: the plan for ENG-398 passed the tech lead's review in round 2.",
  );
  s2.tool(exportReview.end + 12_000, "AskUserQuestion", {
    questions: [
      {
        header: "Gate A",
        question:
          "The ENG-398 plan is ready: async export job, download page, email on completion. Approve it?",
        multiSelect: false,
        options: [
          {
            label: "Approve",
            description: "Go on to the breakdown into sub-issues.",
          },
          {
            label: "Approve without the email",
            description: "Drop the email notification from the first release.",
          },
          {
            label: "Revise",
            description: "Send it back to the manager with your comments.",
          },
        ],
      },
    ],
  });
  files[`projects/${PROJECT}/${S2}.jsonl`] = s2.toString();
  files["initiatives/ENG-398/registry.md"] =
    `# ENG-398 — Bulk export of contacts

Phase: Gate A — waiting for plan approval
Parent: ${issueUrl("ENG-398")}

## Agents

| Role | Mode | Ticket | Agent |
|---|---|---|---|
| initiative-manager | draft | ENG-398 | ${agentId(21)} |
| tech-lead | review-plan R2 | ENG-398 | ${agentId(22)} |

## Log

- Intake complete; plan drafted as ENG-398.
- Plan review round 1: changes requested (large exports). Round 2: approved.
- Stopped at Gate A.
`;

  // ── ENG-371 · finished ───────────────────────────────────────────────────
  const s4 = new Transcript({ cwd: REPOS, model: OPUS });
  const S4 = SESSIONS.auditLog;
  const a0 = now - 30 * HOUR;
  s4.meta(a0, {
    type: "ai-title",
    aiTitle: "Audit log for workspace settings",
  });
  s4.prompt(a0, "/initiative status ENG-371");
  s4.tool(
    a0 + MIN,
    "Agent",
    {
      subagent_type: "initiative-manager",
      description: "Close ENG-371",
      prompt: "…",
    },
    "Launched in the background.",
  );
  const close = finishedRun({
    cwd: REPOS,
    model: OPUS,
    start: a0 + MIN,
    prompt:
      "MODE: status\nTicket: ENG-371. Every sub-issue is merged; write the closing status.",
    steps: [
      ["mcp__linear__get_issue", { id: "ENG-371" }, "3 of 3 sub-issues done"],
    ],
    report: {
      AGENT: "initiative-manager",
      MODE: "status",
      STATUS: "DONE",
      TICKET: "ENG-371",
      SUMMARY:
        "All three sub-issues merged. The audit log is live for every workspace.",
      QUESTIONS: "-",
      NEXT: "-",
    },
  });
  addAgent(
    S4,
    agentId(31),
    { agentType: "initiative-manager", description: "Close ENG-371" },
    close.transcript,
  );
  s4.prompt(close.end + 2000, handBack(agentId(31), close.message));
  s4.say(
    close.end + 9000,
    "ENG-371 is closed: three pull requests merged, nothing left open.",
  );
  files[`projects/${PROJECT}/${S4}.jsonl`] = s4.toString();
  files["initiatives/ENG-371/registry.md"] =
    `# ENG-371 — Audit log for workspace settings

Phase: 8 — Close
Parent: ${issueUrl("ENG-371")}

## Agents

| Role | Mode | Ticket | Agent |
|---|---|---|---|
| initiative-manager | status | ENG-371 | ${agentId(31)} |

## Log

- ENG-372, ENG-373 and ENG-374 merged.
- Closed.
`;

  // ── A plain session outside any initiative ───────────────────────────────
  const s3 = new Transcript({
    cwd: `${REPOS}/web-app`,
    branch: "fix-flaky-date-picker",
    model: SONNET,
  });
  const S3 = SESSIONS.flakyTest;
  const f0 = now - 14 * MIN;
  s3.meta(f0, { type: "ai-title", aiTitle: "Fix the flaky date picker test" });
  s3.prompt(
    f0,
    "DatePicker.test.tsx fails about one run in ten on CI. Find out why and fix it.",
  );
  s3.tool(
    f0 + MIN,
    "Bash",
    {
      command: "pnpm test DatePicker --repeat 30",
      description: "Reproduce the flaky test",
    },
    "3 of 30 runs failed",
  );
  s3.say(
    f0 + 3 * MIN,
    "The test formats today's date in local time while the fixture is in UTC, so it fails when CI runs within a few hours of midnight UTC.",
  );
  s3.tool(
    f0 + 4 * MIN,
    "Edit",
    {
      file_path: `${REPOS}/web-app/src/ui/DatePicker.test.tsx`,
      old_string: "new Date()",
      new_string: "new Date('2026-03-10T12:00:00Z')",
    },
    "Edited",
  );
  files[`projects/-home-dev-repos-web-app/${S3}.jsonl`] = s3.toString();
  live.push({
    file: `projects/-home-dev-repos-web-app/${S3}.jsonl`,
    transcript: s3,
    every: 4,
    script: [
      [
        "Bash",
        {
          command: "pnpm test DatePicker --repeat 30",
          description: "Run the test thirty times",
        },
        "30 of 30 runs passed",
      ],
      ["Grep", { pattern: "new Date\\(\\)", glob: "**/*.test.tsx" }, "6 files"],
      ["Read", { file_path: `${REPOS}/web-app/src/ui/Calendar.test.tsx` }, "…"],
      [
        "Edit",
        {
          file_path: `${REPOS}/web-app/src/ui/Calendar.test.tsx`,
          old_string: "new Date()",
          new_string: "new Date('2026-03-10T12:00:00Z')",
        },
        "Edited",
      ],
    ],
  });

  // ── Tracker and pull requests ────────────────────────────────────────────
  const issue = (identifier, title, name, type, updatedAgo) => ({
    identifier,
    title,
    url: issueUrl(identifier),
    state: { name, type },
    updatedAt: new Date(now - updatedAgo).toISOString(),
  });
  files["demo/tracker.json"] = JSON.stringify(
    {
      "ENG-412": {
        ...issue(
          "ENG-412",
          "Saved replies for the shared inbox",
          "In Progress",
          "started",
          3 * MIN,
        ),
        children: [
          issue(
            "ENG-413",
            "[api] Saved replies CRUD endpoints R1",
            "Done",
            "completed",
            80 * MIN,
          ),
          issue(
            "ENG-414",
            "[web-app] Saved replies picker in the composer R1",
            "In Review",
            "started",
            9 * MIN,
          ),
          issue(
            "ENG-415",
            "[api] Usage events for saved replies R1",
            "In Progress",
            "started",
            7 * MIN,
          ),
          issue(
            "ENG-416",
            "[ai-studio] Suggest a saved reply from the conversation R2",
            "In Progress",
            "started",
            4 * MIN,
          ),
          issue(
            "ENG-417",
            "[web-app] Settings page to manage saved replies R2",
            "Blocked",
            "unstarted",
            4 * HOUR,
          ),
        ],
      },
      "ENG-398": {
        ...issue(
          "ENG-398",
          "Bulk export of contacts",
          "Todo",
          "unstarted",
          60 * MIN,
        ),
        children: [],
      },
      "ENG-371": {
        ...issue(
          "ENG-371",
          "Audit log for workspace settings",
          "Done",
          "completed",
          30 * HOUR,
        ),
        children: [
          issue(
            "ENG-372",
            "[api] Record settings changes R1",
            "Done",
            "completed",
            3 * 24 * HOUR,
          ),
          issue(
            "ENG-373",
            "[web-app] Audit log page R1",
            "Done",
            "completed",
            2 * 24 * HOUR,
          ),
          issue(
            "ENG-374",
            "[api] Export the audit log R1",
            "Done",
            "completed",
            31 * HOUR,
          ),
        ],
      },
    },
    null,
    2,
  );

  const pull = (repository, number, title, branch, state, extra = {}) => ({
    repository,
    number,
    title,
    branch,
    state,
    url: pr(repository, number),
    isDraft: false,
    mergedAt: null,
    ...extra,
  });
  files["demo/pull-requests.json"] = JSON.stringify(
    [
      pull(
        "api",
        231,
        "ENG-413: saved replies CRUD endpoints",
        "eng-413-saved-replies-crud",
        "merged",
        { mergedAt: new Date(now - 80 * MIN).toISOString() },
      ),
      pull(
        "web-app",
        88,
        "ENG-414: saved replies picker in the composer",
        "eng-414-saved-replies-picker",
        "open",
        { checks: { passed: 6, failing: 0, pending: 0 } },
      ),
      pull(
        "api",
        236,
        "ENG-415: usage events for saved replies",
        "eng-415-usage-events",
        "open",
        { isDraft: true, checks: { passed: 3, failing: 0, pending: 2 } },
      ),
      pull(
        "api",
        214,
        "ENG-372: record settings changes",
        "eng-372-record-changes",
        "merged",
        { mergedAt: new Date(now - 3 * 24 * HOUR).toISOString() },
      ),
      pull(
        "web-app",
        79,
        "ENG-373: audit log page",
        "eng-373-audit-log-page",
        "merged",
        { mergedAt: new Date(now - 2 * 24 * HOUR).toISOString() },
      ),
      pull(
        "api",
        219,
        "ENG-374: export the audit log",
        "eng-374-export",
        "merged",
        { mergedAt: new Date(now - 31 * HOUR).toISOString() },
      ),
    ],
    null,
    2,
  );

  return {
    files,
    live,
    /** Registry mtimes order the initiatives: the one in progress leads. */
    mtimes: {
      "initiatives/ENG-412/registry.md": now - 3 * MIN,
      "initiatives/ENG-398/registry.md": now - 60 * MIN,
      "initiatives/ENG-371/registry.md": now - 30 * HOUR,
    },
    /** Sessions shown as running processes, with the status Claude Code would report. */
    processes: [
      { sessionId: S1, name: "initiative-eng-412", status: "busy" },
      { sessionId: S3, name: "web-app", status: "busy" },
    ],
  };
}
