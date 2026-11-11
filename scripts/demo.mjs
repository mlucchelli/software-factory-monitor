#!/usr/bin/env node
/*
 * `pnpm demo`: runs the monitor against generated data, so it can be seen
 * working with no Claude Code sessions, no Linear key and no GitHub login.
 *
 * It writes a synthetic Claude home under `.demo/`, starts Next with
 * `CLAUDE_HOME` pointed at it, and keeps appending tool calls to the runs that
 * are meant to be live, so the graph, the feed and the costs keep moving.
 * Nothing outside `.demo/` is read or written.
 */

import { spawn } from "node:child_process";
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildScenario } from "./demo/scenario.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const home = path.join(root, ".demo", "claude-home");
const port = process.env.PORT ?? "4310";
const TICK_MS = 4000;

rmSync(home, { recursive: true, force: true });
const scenario = buildScenario(Date.now());
for (const [file, content] of Object.entries(scenario.files)) {
  const target = path.join(home, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
for (const [file, at] of Object.entries(scenario.mtimes)) {
  utimesSync(path.join(home, file), at / 1000, at / 1000);
}
// The roster comes from the same role files the real team runs on.
cpSync(path.join(root, "team", "agents"), path.join(home, "agents"), {
  recursive: true,
});
// So is the pipeline: the monitor parses its phases and gates from the skill.
cpSync(path.join(root, "team", "skills"), path.join(home, "skills"), {
  recursive: true,
});
mkdirSync(path.join(home, "repos"), { recursive: true });

const next = spawn(
  "pnpm",
  [
    "exec",
    "next",
    process.argv.includes("--build") ? "start" : "dev",
    "-H",
    "127.0.0.1",
    "-p",
    port,
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CLAUDE_HOME: home,
      AGENTS_MONITOR_DEMO: "1",
      AGENTS_MONITOR_REPOS: path.join(home, "repos"),
      TICKET_PREFIXES: "ENG",
    },
  },
);

// Claude Code registers each running process in sessions/<pid>.json and the
// monitor checks the pid is alive, so the demo lends its own two processes.
const pids = [process.pid, next.pid];
mkdirSync(path.join(home, "sessions"), { recursive: true });
scenario.processes.forEach((entry, index) => {
  writeFileSync(
    path.join(home, "sessions", `${pids[index]}.json`),
    JSON.stringify({ pid: pids[index], ...entry, updatedAt: Date.now() }),
  );
});

/** Each tick, a live run either starts its next tool call or gets the result of the open one. */
let tick = 0;
const cursors = scenario.live.map(() => ({ step: 0, open: null }));
const timer = setInterval(() => {
  tick += 1;
  scenario.live.forEach((run, index) => {
    if (tick % (run.every ?? 1) !== index % (run.every ?? 1)) {
      return;
    }
    const cursor = cursors[index];
    const before = run.transcript.lines.length;
    const now = Date.now();
    if (cursor.open) {
      run.transcript.result(now, cursor.open.id, cursor.open.result);
      cursor.open = null;
    } else {
      const [name, input, result] = run.script[cursor.step % run.script.length];
      cursor.step += 1;
      cursor.open = { id: run.transcript.tool(now, name, input), result };
    }
    const added = run.transcript.lines.slice(before);
    appendFileSync(path.join(home, run.file), `${added.join("\n")}\n`);
  });
}, TICK_MS);

function stop() {
  clearInterval(timer);
  next.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => {
  clearInterval(timer);
  process.exit(code ?? 0);
});
