export type AgentStatus = "running" | "reported" | "idle";

export type SessionStatus = "running" | "idle";

export type ActivityKind = "tool" | "text" | "prompt" | "report";

export interface ActivityEvent {
  id: string;
  ts: string;
  sourceId: string;
  sessionId: string;
  kind: ActivityKind;
  tool?: string;
  summary: string;
  reportStatus?: string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface PendingQuestion {
  question: string;
  header?: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface PendingAction {
  tool: string;
  summary: string;
  since: string;
  questions?: PendingQuestion[];
}

export interface UsageStats {
  costUSD: number;
  outputTokens: number;
  contextTokens: number;
  contextWindow: number;
  toolCalls: number;
  startedAt?: number;
}

export interface ScreenPromptOption {
  number: number;
  label: string;
  description?: string;
  checked?: boolean;
  focused: boolean;
}

export interface ScreenPrompt {
  question?: string;
  tabs?: string[];
  multiSelect: boolean;
  options: ScreenPromptOption[];
  footer?: string;
}

export interface LiveProcess {
  pid: number;
  name?: string;
  status?: string;
  tmuxPane?: string;
  updatedAt?: number;
  prompt?: ScreenPrompt;
}

export interface AgentReport {
  raw: string;
  agent?: string;
  mode?: string;
  status?: string;
  ticket?: string;
  pr?: string;
  worktree?: string;
  summary?: string;
  questions?: string;
  next?: string;
}

export interface AgentInfo {
  id: string;
  sessionId: string;
  project: string;
  parentId: string | null;
  depth: number;
  type: string;
  description?: string;
  isFork: boolean;
  model?: string;
  mode?: string;
  ticket?: string;
  cwd?: string;
  branch?: string;
  status: AgentStatus;
  lastActivity: number;
  lastEvent?: ActivityEvent;
  report?: AgentReport;
  pending?: PendingAction;
  round?: number;
  usage?: UsageStats;
}

export interface SessionInfo {
  id: string;
  project: string;
  cwd?: string;
  branch?: string;
  title?: string;
  lastPrompt?: string;
  permissionMode?: string;
  costUSD?: number;
  linesAdded?: number;
  linesRemoved?: number;
  pending?: PendingAction;
  lastMessage?: { ts: string; text: string };
  status: SessionStatus;
  lastActivity: number;
  hasTranscript: boolean;
  usage?: UsageStats;
  live?: LiveProcess;
  agents: AgentInfo[];
}

export interface Snapshot {
  generatedAt: number;
  windowHours: number;
  sessions: SessionInfo[];
}

export interface AgentDetail {
  agent: AgentInfo;
  launchPrompt?: string;
  events: ActivityEvent[];
}

export interface DiffHunk {
  before: string;
  after: string;
}

export type ToolDetail =
  | { type: "diff"; file: string; hunks: DiffHunk[] }
  | { type: "write"; file: string; content: string }
  | { type: "command"; text: string }
  | { type: "message"; text: string }
  | { type: "questions"; questions: PendingQuestion[] };

interface StreamBase {
  id: string;
  ts: string;
}

export type StreamItem =
  | (StreamBase & { kind: "prompt" | "text"; text: string })
  | (StreamBase & {
      kind: "tool";
      toolUseId: string;
      tool: string;
      summary: string;
      detail?: ToolDetail;
    })
  | (StreamBase & {
      kind: "result";
      toolUseId: string;
      text: string;
      isError: boolean;
    })
  | (StreamBase & { kind: "report"; status?: string; text: string });
