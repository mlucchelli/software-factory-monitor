"use client";

import { ArrowDown, ChevronRight, CornerDownRight, Flag } from "lucide-react";
import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ActivityEvent,
  DiffHunk,
  StreamItem,
  ToolDetail,
} from "@/lib/claude/types";
import { useSourceStream } from "@/lib/client/hooks";
import { formatClock, roleStyle } from "@/lib/client/present";
import { eventIcon, StatusPill } from "../ui";

type ToolItem = Extract<StreamItem, { kind: "tool" }>;
type ResultItem = Extract<StreamItem, { kind: "result" }>;

const PREVIEW_LINES = 4;
const STICK_TO_BOTTOM_PX = 80;
const OPEN_BY_DEFAULT = new Set(["Edit", "MultiEdit", "Write"]);

type LineKind = "context" | "removed" | "added";

interface DiffLine {
  id: string;
  kind: LineKind;
  text: string;
}

const LINE_STYLE: Record<LineKind, { prefix: string; style?: CSSProperties }> =
  {
    context: { prefix: "  " },
    removed: {
      prefix: "- ",
      style: { background: "rgba(208, 59, 59, 0.16)", color: "#f1a9a9" },
    },
    added: {
      prefix: "+ ",
      style: { background: "rgba(12, 163, 12, 0.16)", color: "#9ee29e" },
    },
  };

const CONTEXT_LINES = 2;

/** Drops the lines both sides share, keeping a little context, so only the change is shown. */
function diffLines({ before, after }: DiffHunk): DiffLine[] {
  const old = before.split("\n");
  const next = after.split("\n");
  let head = 0;
  while (head < old.length && head < next.length && old[head] === next[head]) {
    head += 1;
  }
  let tail = 0;
  while (
    tail < old.length - head &&
    tail < next.length - head &&
    old[old.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1;
  }
  const lines: DiffLine[] = [];
  let counter = 0;
  const push = (kind: LineKind, texts: string[]) => {
    for (const text of texts) {
      counter += 1;
      lines.push({ id: `${kind}-${counter}`, kind, text });
    }
  };
  push("context", old.slice(Math.max(0, head - CONTEXT_LINES), head));
  push("removed", old.slice(head, old.length - tail));
  push("added", next.slice(head, next.length - tail));
  push(
    "context",
    old.slice(old.length - tail, old.length - tail + CONTEXT_LINES),
  );
  return lines;
}

function DiffLines({ hunk }: { hunk: DiffHunk }) {
  return (
    <code className="block py-1">
      {diffLines(hunk).map((line) => (
        <span
          key={line.id}
          className={`block whitespace-pre-wrap break-all px-2 ${
            line.kind === "context" ? "text-muted" : ""
          }`}
          style={LINE_STYLE[line.kind].style}
        >
          {LINE_STYLE[line.kind].prefix}
          {line.text}
        </span>
      ))}
    </code>
  );
}

function DetailBody({ detail }: { detail: ToolDetail }) {
  const box =
    "mt-1.5 max-h-[420px] overflow-auto rounded-md bg-page font-mono text-[11px] leading-relaxed ring-1 ring-hairline";
  switch (detail.type) {
    case "diff":
      return (
        <div className={box}>
          {detail.hunks.map((hunk, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: hunks never reorder
            <DiffLines key={index} hunk={hunk} />
          ))}
        </div>
      );
    case "write":
      return (
        <pre
          className={`${box} whitespace-pre-wrap break-all p-2`}
          style={{ color: "#9ee29e" }}
        >
          {detail.content}
        </pre>
      );
    case "command":
      return (
        <pre
          className={`${box} whitespace-pre-wrap break-all p-2 text-ink-secondary`}
        >
          <span className="text-muted">$ </span>
          {detail.text}
        </pre>
      );
    case "message":
      return (
        <pre
          className={`${box} whitespace-pre-wrap break-words p-2 font-sans text-xs text-ink-secondary`}
        >
          {detail.text}
        </pre>
      );
    case "questions":
      return (
        <div className={`${box} grid gap-2 p-2 font-sans text-xs`}>
          {detail.questions.map((question) => (
            <div key={question.question}>
              <p className="text-ink">{question.question}</p>
              <ul className="mt-1 grid gap-0.5 text-ink-secondary">
                {question.options.map((option) => (
                  <li key={option.label}>• {option.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      );
  }
}

function ResultBlock({ result }: { result: ResultItem }) {
  const [expanded, setExpanded] = useState(false);
  const lines = result.text.split("\n");
  const long = lines.length > PREVIEW_LINES;
  const shown =
    expanded || !long ? result.text : lines.slice(0, PREVIEW_LINES).join("\n");
  if (!result.text.trim()) {
    return null;
  }
  return (
    <div
      className="mt-1.5 rounded-md bg-page/60 px-2 py-1.5 ring-1 ring-hairline"
      style={
        result.isError
          ? { boxShadow: "inset 2px 0 0 var(--status-critical)" }
          : undefined
      }
    >
      <pre
        className={`whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed ${
          result.isError ? "text-[#f1a9a9]" : "text-muted"
        } ${expanded ? "max-h-[480px] overflow-auto" : ""}`}
      >
        {shown}
      </pre>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-[11px] text-ink-secondary hover:text-ink"
        >
          {expanded ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

export function ToolRow({
  item,
  result,
  color,
}: {
  item: ToolItem;
  result?: ResultItem;
  color: string;
}) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(item.tool));
  const Icon = eventIcon({ kind: "tool", tool: item.tool } as ActivityEvent);
  const pending = result === undefined;
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center gap-2 text-left"
        aria-expanded={open}
      >
        <Icon className="size-3.5 shrink-0" style={{ color }} aria-hidden />
        <span className="shrink-0 text-xs font-medium text-ink">
          {item.tool}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-secondary">
          {item.summary}
        </span>
        {pending && (
          <span
            className="size-1.5 shrink-0 animate-pulse rounded-full"
            style={{ background: "var(--status-warning)" }}
            title="Waiting for result"
          />
        )}
        {result?.isError && (
          <span className="shrink-0 text-[10px] font-medium text-[#f1a9a9]">
            error
          </span>
        )}
        <ChevronRight
          className={`size-3.5 shrink-0 text-muted transition-transform ${
            open ? "rotate-90" : ""
          }`}
          aria-hidden
        />
      </button>
      {open && item.detail && <DetailBody detail={item.detail} />}
      {open && result && <ResultBlock result={result} />}
    </div>
  );
}

function ItemRow({
  item,
  results,
  color,
}: {
  item: StreamItem;
  results: Map<string, ResultItem>;
  color: string;
}) {
  const body = (() => {
    switch (item.kind) {
      case "tool":
        return (
          <ToolRow
            item={item}
            result={results.get(item.toolUseId)}
            color={color}
          />
        );
      case "text":
        return (
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-ink">
            {item.text}
          </p>
        );
      case "prompt":
        return (
          <div className="rounded-md bg-surface-raised px-2.5 py-2 ring-1 ring-hairline">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
              <CornerDownRight className="size-3" aria-hidden />
              Prompt
            </p>
            <p className="line-clamp-[12] whitespace-pre-wrap break-words text-xs text-ink-secondary">
              {item.text}
            </p>
          </div>
        );
      case "report":
        return (
          <div
            className="rounded-md bg-surface-raised px-2.5 py-2 ring-1 ring-hairline"
            style={{ boxShadow: `inset 3px 0 0 ${color}` }}
          >
            <p className="mb-1 flex items-center gap-2 text-[11px] text-muted">
              <Flag className="size-3" aria-hidden />
              Report
              {item.status && (
                <StatusPill status="reported" reportStatus={item.status} />
              )}
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-ink-secondary">
              {item.text}
            </pre>
          </div>
        );
      default:
        return null;
    }
  })();
  if (!body) {
    return null;
  }
  return (
    <li className="grid grid-cols-[56px_minmax(0,1fr)] gap-2 py-1.5">
      <span className="pt-0.5 font-mono text-[10px] text-muted tabular">
        {formatClock(item.ts)}
      </span>
      {body}
    </li>
  );
}

export function StreamView({
  sourceId,
  roleType,
  className = "max-h-[70vh]",
}: {
  sourceId: string;
  roleType: string;
  className?: string;
}) {
  const { items, connected } = useSourceStream(sourceId);
  const container = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [detached, setDetached] = useState(false);
  const color = roleStyle(roleType).color;

  const { rows, results } = useMemo(() => {
    const byToolUse = new Map<string, ResultItem>();
    for (const item of items) {
      if (item.kind === "result") {
        byToolUse.set(item.toolUseId, item);
      }
    }
    return {
      rows: items.filter((item) => item.kind !== "result"),
      results: byToolUse,
    };
  }, [items]);

  useLayoutEffect(() => {
    const element = container.current;
    if (element && stick.current && items.length > 0) {
      element.scrollTop = element.scrollHeight;
    }
  }, [items]);

  const onScroll = () => {
    const element = container.current;
    if (!element) {
      return;
    }
    const atBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      STICK_TO_BOTTOM_PX;
    stick.current = atBottom;
    setDetached(!atBottom);
  };

  const jumpToLatest = () => {
    const element = container.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
    stick.current = true;
    setDetached(false);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={container}
        onScroll={onScroll}
        className={`overflow-y-auto pr-1 ${className}`}
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {connected
              ? "No activity in the recent transcript."
              : "Connecting…"}
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-hairline">
            {rows.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                results={results}
                color={color}
              />
            ))}
          </ol>
        )}
      </div>
      {detached && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-surface-raised px-3 py-1 text-xs text-ink shadow-lg ring-1 ring-hairline"
        >
          <ArrowDown className="size-3.5" aria-hidden />
          Jump to latest
        </button>
      )}
    </div>
  );
}
