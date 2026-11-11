"use client";

import {
  Bell,
  BellOff,
  CircleAlert,
  CircleCheck,
  GitMerge,
  Hourglass,
  type LucideIcon,
  MessageCircleQuestion,
} from "lucide-react";
import Link from "next/link";
import type { AttentionItem, AttentionKind } from "@/lib/client/attention";
import { formatAgo, TONE_COLOR } from "@/lib/client/present";
import { Chip, RoleBadge } from "./ui";

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  question: MessageCircleQuestion,
  merge: GitMerge,
  report: CircleAlert,
  stalled: Hourglass,
};

export function canAnswer(item: AttentionItem): boolean {
  return item.answerable === true && item.sourceId.startsWith("session:");
}

function AttentionRow({
  item,
  now,
  onAnswer,
}: {
  item: AttentionItem;
  now: number;
  onAnswer?: (item: AttentionItem) => void;
}) {
  const Icon = KIND_ICON[item.kind];
  const body = (
    <div className="grid min-w-0 grid-cols-[20px_1fr] gap-3">
      <Icon
        className="mt-0.5 size-5"
        style={{ color: TONE_COLOR[item.tone] }}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{item.label}</span>
          {item.kind !== "merge" && <RoleBadge type={item.sourceType} />}
          {item.ticket && <Chip>{item.ticket}</Chip>}
          <span className="ml-auto text-[11px] text-muted">
            waiting {formatAgo(item.since, now).replace(" ago", "")}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-secondary">
          {item.title}
          <span className="text-muted"> · {item.context}</span>
        </p>
        <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words font-mono text-xs text-ink">
          {item.detail}
        </p>
      </div>
    </div>
  );

  const className =
    "block rounded-lg border border-hairline bg-page/40 px-3 py-2.5 hover:bg-surface-raised";
  const style = { boxShadow: `inset 3px 0 0 ${TONE_COLOR[item.tone]}` };

  if (onAnswer && canAnswer(item)) {
    return (
      <button
        type="button"
        onClick={() => onAnswer(item)}
        className={`${className} w-full text-left`}
        style={style}
      >
        {body}
        <span
          className="mt-2 ml-8 inline-flex rounded-md px-2 py-0.5 text-xs font-medium text-page"
          style={{ background: TONE_COLOR.warning }}
        >
          Answer from here
        </span>
      </button>
    );
  }
  if (item.href && item.external) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noreferrer"
        className={className}
        style={style}
      >
        {body}
      </a>
    );
  }
  if (item.href) {
    return (
      <Link href={item.href} className={className} style={style}>
        {body}
      </Link>
    );
  }
  return (
    <div className={className} style={style}>
      {body}
    </div>
  );
}

export function NeedsYouPanel({
  items,
  now,
  permission,
  onEnableNotifications,
  onAnswer,
  title = "Needs you",
}: {
  items: AttentionItem[];
  now: number;
  permission?: NotificationPermission | "unsupported";
  onEnableNotifications?: () => void;
  onAnswer?: (item: AttentionItem) => void;
  title?: string;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-semibold tabular"
          style={{
            background:
              items.length > 0 ? TONE_COLOR.warning : "var(--surface-raised)",
            color: items.length > 0 ? "#0d0d0d" : "var(--muted)",
          }}
        >
          {items.length}
        </span>
        {permission && permission !== "unsupported" && (
          <button
            type="button"
            onClick={onEnableNotifications}
            disabled={permission !== "default"}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-secondary ring-1 ring-hairline enabled:hover:text-ink disabled:cursor-default"
          >
            {permission === "granted" ? (
              <Bell className="size-3.5" aria-hidden />
            ) : (
              <BellOff className="size-3.5" aria-hidden />
            )}
            {permission === "granted"
              ? "Notifications on"
              : permission === "denied"
                ? "Notifications blocked in browser"
                : "Enable notifications"}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <CircleCheck
            className="size-4"
            style={{ color: TONE_COLOR.good }}
            aria-hidden
          />
          Nothing is waiting on you.
        </p>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {items.map((item) => (
            <AttentionRow
              key={item.id}
              item={item}
              now={now}
              onAnswer={onAnswer}
            />
          ))}
        </div>
      )}
    </section>
  );
}
