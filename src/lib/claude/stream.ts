import {
  asRecord,
  parseQuestions,
  parseReport,
  promptSummary,
  shortToolName,
  summarizeToolUse,
  type TranscriptRecord,
  userPromptText,
} from "./parse";
import type { StreamItem, ToolDetail } from "./types";

const TEXT_LIMIT = 6000;
const RESULT_LIMIT = 2500;
const DIFF_SIDE_LIMIT = 5000;
const REPORT_TOOL = "SubagentHandback";

interface Block {
  type?: string;
  id?: string;
  tool_use_id?: string;
  name?: string;
  text?: string;
  input?: Record<string, unknown>;
  content?: unknown;
  is_error?: boolean;
}

const ANSI_ESCAPE = new RegExp(
  `${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`,
  "g",
);

function clip(text: string, limit: number): string {
  return text.length > limit
    ? `${text.slice(0, limit)}\n… ${text.length - limit} more characters`
    : text;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toolDetail(
  name: string,
  input: Record<string, unknown> = {},
): ToolDetail | undefined {
  const file = str(input.file_path) ?? "";
  switch (name) {
    case "Edit":
      return {
        type: "diff",
        file,
        hunks: [
          {
            before: clip(str(input.old_string) ?? "", DIFF_SIDE_LIMIT),
            after: clip(str(input.new_string) ?? "", DIFF_SIDE_LIMIT),
          },
        ],
      };
    case "MultiEdit": {
      const edits = Array.isArray(input.edits) ? input.edits : [];
      return {
        type: "diff",
        file,
        hunks: edits.map((edit) => {
          const record = asRecord(edit);
          return {
            before: clip(str(record?.old_string) ?? "", DIFF_SIDE_LIMIT),
            after: clip(str(record?.new_string) ?? "", DIFF_SIDE_LIMIT),
          };
        }),
      };
    }
    case "Write":
      return {
        type: "write",
        file,
        content: clip(str(input.content) ?? "", DIFF_SIDE_LIMIT),
      };
    case "Bash":
      return { type: "command", text: clip(str(input.command) ?? "", 3000) };
    case "Agent":
    case "SendMessage":
      return {
        type: "message",
        text: clip(str(input.prompt) ?? str(input.message) ?? "", TEXT_LIMIT),
      };
    case "AskUserQuestion":
      return { type: "questions", questions: parseQuestions(input) };
    default:
      return undefined;
  }
}

function resultText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => {
      const block = asRecord(part);
      if (block?.type === "text") {
        return str(block.text) ?? "";
      }
      if (block?.type === "image") {
        return "[image]";
      }
      if (block?.type === "tool_reference") {
        return `[loaded ${str(block.tool_name) ?? "tool"}]`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Turns one transcript record into the items a live stream shows; thinking is never included. */
export function streamItems(record: TranscriptRecord): StreamItem[] {
  const ts = record.timestamp;
  const uuid = record.uuid;
  if (!ts || !uuid) {
    return [];
  }
  const content = record.message?.content;
  const blocks: Block[] = Array.isArray(content) ? (content as Block[]) : [];

  if (record.type === "user") {
    const items: StreamItem[] = blocks.flatMap((block, index): StreamItem[] =>
      block.type === "tool_result" && block.tool_use_id
        ? [
            {
              id: `${uuid}:${index}`,
              ts,
              kind: "result",
              toolUseId: block.tool_use_id,
              text: clip(
                resultText(block.content).replace(ANSI_ESCAPE, ""),
                RESULT_LIMIT,
              ),
              isError: block.is_error === true,
            },
          ]
        : [],
    );
    const prompt = userPromptText(record);
    if (prompt && promptSummary(prompt)) {
      items.push({
        id: `${uuid}:prompt`,
        ts,
        kind: "prompt",
        text: clip(prompt.trim(), TEXT_LIMIT),
      });
    }
    return items;
  }

  if (record.type !== "assistant") {
    return [];
  }

  return blocks.flatMap((block, index): StreamItem[] => {
    const id = `${uuid}:${index}`;
    if (block.type === "text" && block.text?.trim()) {
      return [{ id, ts, kind: "text", text: clip(block.text, TEXT_LIMIT) }];
    }
    if (block.type !== "tool_use" || !block.name || !block.id) {
      return [];
    }
    if (block.name === REPORT_TOOL) {
      const message = str(block.input?.message) ?? "";
      return [
        {
          id,
          ts,
          kind: "report",
          status: parseReport(message).status,
          text: clip(message, TEXT_LIMIT),
        },
      ];
    }
    return [
      {
        id,
        ts,
        kind: "tool",
        toolUseId: block.id,
        tool: shortToolName(block.name),
        summary: summarizeToolUse(block.name, block.input),
        detail: toolDetail(block.name, block.input),
      },
    ];
  });
}
