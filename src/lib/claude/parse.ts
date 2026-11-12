import { ticketPrefixes } from "../config";
import { type ReportField, reportFields } from "../report-fields";
import { ticketPattern } from "./ticket";
import type {
  ActivityEvent,
  AgentReport,
  PendingAction,
  PendingQuestion,
} from "./types";

export interface TranscriptRecord {
  type?: string;
  uuid?: string;
  timestamp?: string;
  cwd?: string;
  gitBranch?: string;
  message?: { model?: string; content?: unknown };
  [key: string]: unknown;
}

interface ContentBlock {
  type?: string;
  id?: string;
  tool_use_id?: string;
  name?: string;
  text?: string;
  input?: Record<string, unknown>;
}

const REPORT_TOOL = "SubagentHandback";

const HARNESS_PREFIXES = [
  "<system-reminder>",
  "<local-command",
  "<command-",
  "<task-notification>",
  "[Request interrupted",
];

const RELAY_PREFIXES = [
  /^The coordinator sent a message while you were working:\s*/,
  /^Another Claude session sent a message[^\n]*\n?/,
];

const TICKET_PATTERN = ticketPattern(ticketPrefixes);
const MODE_PATTERN = /\bMODE:\s*([a-z][\w-]*)/;

export function asRecord(value: unknown): TranscriptRecord | null {
  return value !== null && typeof value === "object"
    ? (value as TranscriptRecord)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function firstLine(text: string | undefined, max = 180): string | undefined {
  const line = text
    ?.split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  if (!line) {
    return undefined;
  }
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function contentBlocks(content: unknown): ContentBlock[] {
  return Array.isArray(content) ? (content as ContentBlock[]) : [];
}

export function shortToolName(name: string): string {
  const mcp = /^mcp__(.+?)__(.+)$/.exec(name);
  return mcp ? `${mcp[1]}.${mcp[2]}` : name;
}

export function summarizeToolUse(
  name: string,
  input: Record<string, unknown> = {},
): string {
  switch (name) {
    case "Bash":
      return (
        firstLine(asString(input.description)) ??
        firstLine(asString(input.command)) ??
        ""
      );
    case "Read":
    case "Write":
    case "Edit":
    case "NotebookEdit":
      return asString(input.file_path) ?? "";
    case "Grep":
    case "Glob":
      return asString(input.pattern) ?? "";
    case "Agent":
      return `${asString(input.subagent_type) ?? "agent"} · ${asString(input.description) ?? ""}`;
    case "SendMessage":
      return `→ ${asString(input.to) ?? "?"} · ${
        firstLine(asString(input.summary) ?? asString(input.message)) ?? ""
      }`;
    case "ToolSearch":
      return asString(input.query) ?? "";
    case "Skill":
      return asString(input.skill) ?? "";
    case "AskUserQuestion": {
      const questions = Array.isArray(input.questions) ? input.questions : [];
      const first = asRecord(questions[0]);
      return firstLine(asString(first?.question)) ?? "question";
    }
    default: {
      const serialized = JSON.stringify(input);
      return serialized.length > 180
        ? `${serialized.slice(0, 179)}…`
        : serialized;
    }
  }
}

const QUESTION_TOOL = "AskUserQuestion";

export function parseQuestions(
  input: Record<string, unknown> = {},
): PendingQuestion[] {
  const questions = Array.isArray(input.questions) ? input.questions : [];
  return questions.flatMap((value): PendingQuestion[] => {
    const question = asRecord(value);
    const text = asString(question?.question);
    if (!question || !text) {
      return [];
    }
    const options = Array.isArray(question.options) ? question.options : [];
    return [
      {
        question: text,
        header: asString(question.header),
        multiSelect: question.multiSelect === true,
        options: options.flatMap((option) => {
          const record = asRecord(option);
          const label = asString(record?.label);
          return label
            ? [{ label, description: asString(record?.description) }]
            : [];
        }),
      },
    ];
  });
}

export function parseReport(raw: string): AgentReport {
  const fields = reportFields(raw);
  const value = (key: ReportField) => fields[key];
  return {
    raw,
    agent: value("AGENT"),
    mode: value("MODE"),
    status: /^[A-Z_]+/.exec(value("STATUS") ?? "")?.[0],
    ticket: TICKET_PATTERN.exec(value("TICKET") ?? "")?.[0] ?? value("TICKET"),
    pr: value("PR"),
    worktree: value("WORKTREE"),
    summary: value("SUMMARY"),
    questions: value("QUESTIONS"),
    next: value("NEXT"),
  };
}

export function promptSummary(text: string): string | null {
  const trimmed = text.trim();
  if (
    !trimmed ||
    HARNESS_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
  ) {
    return null;
  }
  const withoutRelay = RELAY_PREFIXES.reduce(
    (current, pattern) => current.replace(pattern, ""),
    trimmed,
  );
  return firstLine(withoutRelay) ?? null;
}

export function modeAndTicket(text: string): {
  mode?: string;
  ticket?: string;
} {
  return {
    mode: MODE_PATTERN.exec(text)?.[1],
    ticket: TICKET_PATTERN.exec(text)?.[0],
  };
}

/** The prompt text a user record carries, ignoring tool results. */
export function userPromptText(record: TranscriptRecord): string | undefined {
  if (record.type !== "user") {
    return undefined;
  }
  const content = record.message?.content;
  if (typeof content === "string") {
    return content;
  }
  const texts = contentBlocks(content)
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text as string);
  return texts.length > 0 ? texts.join("\n") : undefined;
}

export function extractEvents(
  record: TranscriptRecord,
  sourceId: string,
  sessionId: string,
): ActivityEvent[] {
  const ts = record.timestamp;
  const uuid = record.uuid;
  if (!ts || !uuid) {
    return [];
  }
  const base = { ts, sourceId, sessionId };

  if (record.type === "user") {
    const text = userPromptText(record);
    const summary = text ? promptSummary(text) : null;
    return summary
      ? [{ ...base, id: `${uuid}:prompt`, kind: "prompt", summary }]
      : [];
  }

  if (record.type !== "assistant") {
    return [];
  }

  return contentBlocks(record.message?.content).flatMap(
    (block, index): ActivityEvent[] => {
      const id = `${uuid}:${index}`;
      if (block.type === "tool_use" && block.name === REPORT_TOOL) {
        const report = parseReport(asString(block.input?.message) ?? "");
        return [
          {
            ...base,
            id,
            kind: "report",
            tool: REPORT_TOOL,
            summary: firstLine(report.summary) ?? "report",
            reportStatus: report.status,
          },
        ];
      }
      if (block.type === "tool_use" && block.name) {
        return [
          {
            ...base,
            id,
            kind: "tool",
            tool: shortToolName(block.name),
            summary: summarizeToolUse(block.name, block.input),
          },
        ];
      }
      if (block.type === "text") {
        const summary = firstLine(block.text, 240);
        return summary ? [{ ...base, id, kind: "text", summary }] : [];
      }
      return [];
    },
  );
}

export function reportFromRecord(record: TranscriptRecord): AgentReport | null {
  if (record.type !== "assistant") {
    return null;
  }
  const block = contentBlocks(record.message?.content).find(
    (candidate) =>
      candidate.type === "tool_use" && candidate.name === REPORT_TOOL,
  );
  const message = asString(block?.input?.message);
  return message ? parseReport(message) : null;
}

/** The most recent tool call that has no result yet — the agent is still waiting on it. */
export function findPendingToolUse(
  records: TranscriptRecord[],
): PendingAction | undefined {
  const open = new Map<string, PendingAction>();
  for (const record of records) {
    const prompt = userPromptText(record)?.trim();
    if (
      prompt &&
      (promptSummary(prompt) !== null ||
        prompt.startsWith("[Request interrupted"))
    ) {
      // A new prompt or an interruption ends the previous turn: a Ctrl+C'd tool never gets a result.
      open.clear();
    }
    for (const block of contentBlocks(record.message?.content)) {
      if (
        record.type === "assistant" &&
        block.type === "tool_use" &&
        block.id &&
        block.name &&
        block.name !== REPORT_TOOL
      ) {
        open.set(block.id, {
          tool: shortToolName(block.name),
          summary: summarizeToolUse(block.name, block.input),
          since: record.timestamp ?? "",
          questions:
            block.name === QUESTION_TOOL
              ? parseQuestions(block.input)
              : undefined,
        });
      } else if (
        record.type === "user" &&
        block.type === "tool_result" &&
        block.tool_use_id
      ) {
        open.delete(block.tool_use_id);
      }
    }
  }
  return [...open.values()].at(-1);
}
