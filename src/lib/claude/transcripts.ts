import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { readFirstRecord, readTail } from "./jsonl";
import { listLiveProcesses } from "./live-sessions";
import {
  asRecord,
  extractEvents,
  findPendingToolUse,
  modeAndTicket,
  promptSummary,
  reportFromRecord,
  type TranscriptRecord,
  userPromptText,
} from "./parse";
import { projectsDir } from "./paths";
import type {
  ActivityEvent,
  AgentDetail,
  AgentInfo,
  AgentReport,
  SessionInfo,
  Snapshot,
} from "./types";
import { scanUsage } from "./usage";

export interface TranscriptFile {
  path: string;
  project: string;
  sessionId: string;
  agentId: string | null;
  mtimeMs: number;
  size: number;
}

interface AgentMeta {
  agentType?: string;
  description?: string;
  parentAgentId?: string;
  spawnDepth?: number;
  isFork?: boolean;
  model?: string;
}

const RUNNING_WINDOW_MS = 45_000;
const AGENT_TAIL_BYTES = 256 * 1024;
const SESSION_TAIL_BYTES = 512 * 1024;
const DETAIL_TAIL_BYTES = 2 * 1024 * 1024;
const HEAD_BYTES = 256 * 1024;
const DETAIL_EVENT_LIMIT = 400;

async function statFile(
  file: string,
): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    const { mtimeMs, size } = await stat(file);
    return { mtimeMs, size };
  } catch {
    return null;
  }
}

async function listDir(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export async function listTranscripts(): Promise<TranscriptFile[]> {
  const found: TranscriptFile[] = [];
  const projects = await listDir(projectsDir);

  await Promise.all(
    projects
      .filter((project) => project.isDirectory())
      .map(async (project) => {
        const projectPath = path.join(projectsDir, project.name);
        const entries = await listDir(projectPath);

        await Promise.all(
          entries.map(async (entry) => {
            if (entry.isFile() && entry.name.endsWith(".jsonl")) {
              const file = path.join(projectPath, entry.name);
              const stats = await statFile(file);
              if (stats) {
                found.push({
                  path: file,
                  project: project.name,
                  sessionId: entry.name.slice(0, -".jsonl".length),
                  agentId: null,
                  ...stats,
                });
              }
              return;
            }
            if (!entry.isDirectory()) {
              return;
            }
            const subagentsDir = path.join(
              projectPath,
              entry.name,
              "subagents",
            );
            const subagents = await listDir(subagentsDir);
            await Promise.all(
              subagents
                .filter(
                  (file) =>
                    file.name.startsWith("agent-") &&
                    file.name.endsWith(".jsonl"),
                )
                .map(async (file) => {
                  const filePath = path.join(subagentsDir, file.name);
                  const stats = await statFile(filePath);
                  if (stats) {
                    found.push({
                      path: filePath,
                      project: project.name,
                      sessionId: entry.name,
                      agentId: file.name.slice(
                        "agent-".length,
                        -".jsonl".length,
                      ),
                      ...stats,
                    });
                  }
                }),
            );
          }),
        );
      }),
  );

  return found;
}

const summaryCache = new Map<string, { key: string; value: unknown }>();

async function cachedByFile<T>(
  file: TranscriptFile,
  compute: () => Promise<T>,
): Promise<T> {
  const key = `${file.mtimeMs}:${file.size}`;
  const hit = summaryCache.get(file.path);
  if (hit?.key === key) {
    return hit.value as T;
  }
  const value = await compute();
  summaryCache.set(file.path, { key, value });
  return value;
}

async function readMeta(file: TranscriptFile): Promise<AgentMeta> {
  const metaPath = file.path.replace(/\.jsonl$/, ".meta.json");
  try {
    return JSON.parse(await readFile(metaPath, "utf8")) as AgentMeta;
  } catch {
    return {};
  }
}

function toRecords(values: unknown[]): TranscriptRecord[] {
  return values
    .map(asRecord)
    .filter((record): record is TranscriptRecord => record !== null);
}

function isRunning(lastActivity: number, now: number): boolean {
  return now - lastActivity < RUNNING_WINDOW_MS;
}

/**
 * Claude Code also appends metadata lines (titles, modes, snapshots) to idle sessions, so file
 * mtime is not activity: only user and assistant messages are.
 */
function lastMessageAt(records: TranscriptRecord[]): number | undefined {
  let latest: number | undefined;
  for (const record of records) {
    if (
      (record.type === "user" || record.type === "assistant") &&
      record.timestamp
    ) {
      const time = Date.parse(record.timestamp);
      if (Number.isFinite(time) && (latest === undefined || time > latest)) {
        latest = time;
      }
    }
  }
  return latest;
}

function reviewRound(prompt: string | undefined): number | undefined {
  const match = prompt ? /\bround\s*(\d+)/i.exec(prompt) : null;
  return match ? Number(match[1]) : undefined;
}

function lastAssistantText(
  records: TranscriptRecord[],
): { ts: string; text: string } | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    const content = record.message?.content;
    if (
      record.type !== "assistant" ||
      !record.timestamp ||
      !Array.isArray(content)
    ) {
      continue;
    }
    const text = content
      .map((block) =>
        block && typeof block === "object" && block.type === "text"
          ? String(block.text ?? "")
          : "",
      )
      .join("\n")
      .trim();
    if (text) {
      return { ts: record.timestamp, text: text.slice(0, 2000) };
    }
  }
  return undefined;
}

async function summarizeAgent(file: TranscriptFile): Promise<AgentInfo> {
  const summary = await cachedByFile(file, async () => {
    const meta = await readMeta(file);
    const head = asRecord(
      await readFirstRecord(file.path, file.size, HEAD_BYTES),
    );
    const headPrompt = head ? userPromptText(head) : undefined;
    const records = toRecords(
      await readTail(file.path, file.size, AGENT_TAIL_BYTES),
    );

    let cwd: string | undefined;
    let branch: string | undefined;
    let model: string | undefined;
    let lastEvent: ActivityEvent | undefined;
    let latestPrompt = headPrompt;
    let report: AgentReport | undefined;
    let reportIndex = -1;
    let promptIndex = -1;

    records.forEach((record, index) => {
      cwd = record.cwd ?? cwd;
      branch = record.gitBranch ?? branch;
      if (record.type === "assistant" && record.message?.model) {
        model = record.message.model;
      }
      const prompt = userPromptText(record);
      if (prompt && promptSummary(prompt)) {
        promptIndex = index;
        if (modeAndTicket(prompt).mode) {
          latestPrompt = prompt;
        }
      }
      const recordReport = reportFromRecord(record);
      if (recordReport) {
        report = recordReport;
        reportIndex = index;
      }
      const events = extractEvents(record, file.agentId ?? "", file.sessionId);
      lastEvent = events.at(-1) ?? lastEvent;
    });

    const pending = findPendingToolUse(records);
    const fromPrompt = latestPrompt ? modeAndTicket(latestPrompt) : {};
    const reportIsCurrent = report !== undefined && reportIndex > promptIndex;

    return {
      meta,
      cwd,
      branch,
      model: model ?? (meta.model !== "inherit" ? meta.model : undefined),
      mode: fromPrompt.mode ?? report?.mode,
      ticket:
        (reportIsCurrent ? report?.ticket : undefined) ?? fromPrompt.ticket,
      lastEvent,
      report,
      reportIsCurrent,
      pending,
      round: reviewRound(latestPrompt),
      lastMessageAt: lastMessageAt(records),
    };
  });
  const lastActivity = summary.lastMessageAt ?? file.mtimeMs;
  const usage = await scanUsage(file.path, file.size);

  return {
    id: file.agentId ?? "",
    sessionId: file.sessionId,
    project: file.project,
    parentId: summary.meta.parentAgentId ?? null,
    depth: summary.meta.spawnDepth ?? 1,
    type: summary.meta.agentType ?? "agent",
    description: summary.meta.description,
    isFork: summary.meta.isFork ?? false,
    model: summary.model,
    mode: summary.mode,
    ticket: summary.ticket,
    cwd: summary.cwd,
    branch: summary.branch,
    status: isRunning(lastActivity, Date.now())
      ? "running"
      : summary.reportIsCurrent
        ? "reported"
        : "idle",
    lastActivity,
    lastEvent: summary.lastEvent,
    report: summary.report,
    pending: summary.pending,
    round: summary.round,
    usage,
  };
}

async function summarizeSession(
  file: TranscriptFile,
): Promise<Omit<SessionInfo, "agents">> {
  const summary = await cachedByFile(file, async () => {
    const records = toRecords(
      await readTail(file.path, file.size, SESSION_TAIL_BYTES),
    );
    let cwd: string | undefined;
    let branch: string | undefined;
    let title: string | undefined;
    let lastPrompt: string | undefined;
    let permissionMode: string | undefined;
    let costUSD: number | undefined;
    let linesAdded: number | undefined;
    let linesRemoved: number | undefined;

    for (const record of records) {
      cwd = record.cwd ?? cwd;
      branch = record.gitBranch ?? branch;
      if (record.type === "ai-title" && typeof record.aiTitle === "string") {
        title = record.aiTitle;
      }
      if (
        record.type === "last-prompt" &&
        typeof record.lastPrompt === "string"
      ) {
        lastPrompt = record.lastPrompt;
      }
      if (
        record.type === "permission-mode" &&
        typeof record.permissionMode === "string"
      ) {
        permissionMode = record.permissionMode;
      }
      if (record.type === "cost-state") {
        costUSD = Number(record.totalCostUSD) || costUSD;
        linesAdded = Number(record.totalLinesAdded) || linesAdded;
        linesRemoved = Number(record.totalLinesRemoved) || linesRemoved;
      }
    }

    return {
      cwd,
      branch,
      title,
      lastPrompt,
      permissionMode,
      costUSD,
      linesAdded,
      linesRemoved,
      pending: findPendingToolUse(records),
      lastMessage: lastAssistantText(records),
      lastMessageAt: lastMessageAt(records),
    };
  });
  const { lastMessageAt: messageAt, ...fields } = summary;
  const lastActivity = messageAt ?? file.mtimeMs;
  const usage = await scanUsage(file.path, file.size);

  return {
    id: file.sessionId,
    project: file.project,
    ...fields,
    usage,
    status: isRunning(lastActivity, Date.now()) ? "running" : "idle",
    lastActivity,
    hasTranscript: true,
  };
}

export async function buildSnapshot(windowHours: number): Promise<Snapshot> {
  const now = Date.now();
  const since = now - windowHours * 3_600_000;
  const [files, liveProcesses] = await Promise.all([
    listTranscripts(),
    listLiveProcesses(),
  ]);

  const groups = new Map<
    string,
    { main?: TranscriptFile; agents: TranscriptFile[]; latest: number }
  >();
  for (const file of files) {
    const key = `${file.project}/${file.sessionId}`;
    const group = groups.get(key) ?? { agents: [], latest: 0 };
    if (file.agentId) {
      group.agents.push(file);
    } else {
      group.main = file;
    }
    group.latest = Math.max(group.latest, file.mtimeMs);
    groups.set(key, group);
  }

  const sessions = await Promise.all(
    [...groups.values()]
      .filter((group) => group.latest >= since)
      .map(async (group): Promise<SessionInfo> => {
        const agents = (
          await Promise.all(group.agents.map(summarizeAgent))
        ).sort((a, b) => b.lastActivity - a.lastActivity);
        const reference = group.main ?? group.agents[0];
        const base = group.main
          ? await summarizeSession(group.main)
          : {
              id: reference.sessionId,
              project: reference.project,
              status: "idle" as const,
              lastActivity: 0,
              hasTranscript: false,
            };
        const lastActivity = Math.max(
          base.lastActivity,
          ...agents.map((agent) => agent.lastActivity),
        );
        const anyRunning =
          base.status === "running" ||
          agents.some((agent) => agent.status === "running");
        return {
          ...base,
          cwd: base.cwd ?? agents.find((agent) => agent.cwd)?.cwd,
          branch: base.branch ?? agents.find((agent) => agent.branch)?.branch,
          status: anyRunning ? "running" : "idle",
          lastActivity,
          live: liveProcesses.get(base.id),
          agents,
        };
      }),
  );

  sessions.sort((a, b) => b.lastActivity - a.lastActivity);
  return { generatedAt: now, windowHours, sessions };
}

export async function getAgentDetail(
  agentId: string,
): Promise<AgentDetail | null> {
  const file = (await listTranscripts()).find(
    (candidate) => candidate.agentId === agentId,
  );
  if (!file) {
    return null;
  }
  const agent = await summarizeAgent(file);
  const head = asRecord(
    await readFirstRecord(file.path, file.size, HEAD_BYTES),
  );
  const launchPrompt = head ? userPromptText(head) : undefined;
  const events = toRecords(
    await readTail(file.path, file.size, DETAIL_TAIL_BYTES),
  )
    .flatMap((record) => extractEvents(record, agentId, file.sessionId))
    .slice(-DETAIL_EVENT_LIMIT);

  return {
    agent,
    launchPrompt: launchPrompt?.slice(0, 8000),
    events,
  };
}

const RECENT_TAIL_BYTES = 512 * 1024;

export async function recentActivity(
  minutes: number,
): Promise<ActivityEvent[]> {
  const cutoff = Date.now() - minutes * 60_000;
  const cutoffIso = new Date(cutoff).toISOString();
  const files = (await listTranscripts()).filter(
    (file) => file.mtimeMs >= cutoff,
  );
  const perFile = await Promise.all(
    files.map(async (file) => {
      const sourceId = file.agentId ?? `session:${file.sessionId}`;
      return toRecords(await readTail(file.path, file.size, RECENT_TAIL_BYTES))
        .filter((record) => (record.timestamp ?? "") >= cutoffIso)
        .flatMap((record) => extractEvents(record, sourceId, file.sessionId));
    }),
  );
  return perFile.flat().sort((a, b) => a.ts.localeCompare(b.ts));
}

/** A source is an agent id, or `session:<id>` for a session's own transcript. */
export async function findTranscript(
  sourceId: string,
): Promise<TranscriptFile | undefined> {
  const sessionId = sourceId.startsWith("session:")
    ? sourceId.slice("session:".length)
    : undefined;
  return (await listTranscripts()).find((file) =>
    sessionId
      ? file.agentId === null && file.sessionId === sessionId
      : file.agentId === sourceId,
  );
}

/** A session's open tool call and running process, read fresh for an action about to act on them. */
export async function getSessionState(sessionId: string) {
  const [file, liveProcesses] = await Promise.all([
    findTranscript(`session:${sessionId}`),
    listLiveProcesses(),
  ]);
  if (!file) {
    return null;
  }
  const session = await summarizeSession(file);
  return { pending: session.pending, live: liveProcesses.get(sessionId) };
}
