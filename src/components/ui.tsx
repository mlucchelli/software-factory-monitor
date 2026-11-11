"use client";

import {
  Bot,
  CircleAlert,
  CircleCheck,
  CircleX,
  CornerDownRight,
  FilePen,
  FileText,
  Flag,
  Globe,
  ListTodo,
  type LucideIcon,
  MessageCircleQuestion,
  MessageSquare,
  Moon,
  OctagonX,
  Search,
  Send,
  Terminal,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  ActivityEvent,
  AgentStatus,
  SessionStatus,
} from "@/lib/claude/types";
import {
  humanizeStatus,
  reportTone,
  roleStyle,
  TONE_COLOR,
  type Tone,
} from "@/lib/client/present";

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-hairline bg-surface p-4 ${className}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function RoleDot({ type }: { type: string }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ background: roleStyle(type).color }}
      aria-hidden
    />
  );
}

export function RoleBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary">
      <RoleDot type={type} />
      {roleStyle(type).label}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-md bg-surface-raised px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap text-ink-secondary ring-1 ring-hairline">
      {children}
    </span>
  );
}

const TONE_ICON: Record<Tone, LucideIcon> = {
  good: CircleCheck,
  warning: CircleAlert,
  serious: CircleX,
  critical: OctagonX,
  neutral: Flag,
};

export function StatusPill({
  status,
  reportStatus,
}: {
  status: AgentStatus | SessionStatus;
  reportStatus?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-hairline";

  if (status === "running") {
    return (
      <span className={`${base} text-ink`}>
        <span className="relative flex size-2">
          <span
            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
            style={{ background: TONE_COLOR.good }}
          />
          <span
            className="relative inline-flex size-2 rounded-full"
            style={{ background: TONE_COLOR.good }}
          />
        </span>
        Running
      </span>
    );
  }

  if (status === "reported" && reportStatus) {
    const tone = reportTone(reportStatus);
    const Icon = TONE_ICON[tone];
    return (
      <span className={`${base} text-ink`}>
        <Icon
          className="size-3.5"
          style={{ color: TONE_COLOR[tone] }}
          aria-hidden
        />
        {humanizeStatus(reportStatus)}
      </span>
    );
  }

  return (
    <span className={`${base} text-muted`}>
      <Moon className="size-3" aria-hidden />
      Idle
    </span>
  );
}

export function eventIcon(event: ActivityEvent): LucideIcon {
  if (event.kind === "report") {
    return Flag;
  }
  if (event.kind === "prompt") {
    return CornerDownRight;
  }
  if (event.kind === "text") {
    return MessageSquare;
  }
  const tool = event.tool ?? "";
  if (tool === "Bash") {
    return Terminal;
  }
  if (tool === "Read") {
    return FileText;
  }
  if (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") {
    return FilePen;
  }
  if (tool === "Grep" || tool === "Glob") {
    return Search;
  }
  if (tool === "Agent") {
    return Bot;
  }
  if (tool === "SendMessage") {
    return Send;
  }
  if (tool === "AskUserQuestion") {
    return MessageCircleQuestion;
  }
  if (tool.startsWith("linear")) {
    return ListTodo;
  }
  if (tool === "WebSearch" || tool === "WebFetch") {
    return Globe;
  }
  return Wrench;
}

export function eventLabel(event: ActivityEvent): string {
  switch (event.kind) {
    case "report":
      return event.reportStatus
        ? `Report · ${humanizeStatus(event.reportStatus)}`
        : "Report";
    case "prompt":
      return "Prompt";
    case "text":
      return "Message";
    default:
      return event.tool ?? "Tool";
  }
}
