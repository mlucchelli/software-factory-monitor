"use client";

import { Pause, Play } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ActivityEvent } from "@/lib/claude/types";
import {
  formatClock,
  OTHER_ROLE,
  ROLE_LEGEND,
  roleStyle,
  type SourceInfo,
  sourceRole,
} from "@/lib/client/present";
import { eventIcon, eventLabel } from "../ui";

const VISIBLE_EVENTS = 150;

export function ActivityFeed({
  events,
  sources,
}: {
  events: ActivityEvent[];
  sources: Map<string, SourceInfo>;
}) {
  const [frozen, setFrozen] = useState<ActivityEvent[] | null>(null);
  const [hiddenRoles, setHiddenRoles] = useState<Set<string>>(new Set());

  const toggleRole = (key: string) =>
    setHiddenRoles((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  const shown = (frozen ?? events)
    .filter((event) => !hiddenRoles.has(sourceRole(event, sources)))
    .slice(-VISIBLE_EVENTS)
    .reverse();

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[...ROLE_LEGEND, OTHER_ROLE].map((role) => {
          const hidden = hiddenRoles.has(role.key);
          return (
            <button
              key={role.key}
              type="button"
              onClick={() => toggleRole(role.key)}
              aria-pressed={!hidden}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] ring-1 ring-hairline transition-opacity ${
                hidden ? "opacity-40" : "text-ink-secondary"
              }`}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: role.color }}
                aria-hidden
              />
              {role.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setFrozen(frozen ? null : events)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-secondary ring-1 ring-hairline hover:text-ink"
        >
          {frozen ? (
            <Play className="size-3.5" aria-hidden />
          ) : (
            <Pause className="size-3.5" aria-hidden />
          )}
          {frozen ? "Resume" : "Pause"}
        </button>
      </div>

      <ol className="flex max-h-[720px] flex-col gap-1.5 overflow-y-auto pr-1">
        {shown.length === 0 && (
          <li className="py-6 text-center text-sm text-muted">
            No events yet.
          </li>
        )}
        {shown.map((event) => {
          const source = sources.get(event.sourceId);
          const role = roleStyle(sourceRole(event, sources));
          const Icon = eventIcon(event);
          const title = source?.title ?? event.sourceId;
          return (
            <li
              key={event.id}
              className="rounded-md border-l-2 bg-page/40 px-2.5 py-1.5"
              style={{ borderColor: role.color }}
            >
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-muted tabular">
                  {formatClock(event.ts)}
                </span>
                {source?.href ? (
                  <Link
                    href={source.href}
                    className="min-w-0 truncate text-ink-secondary hover:text-ink"
                  >
                    {title}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate text-ink-secondary">
                    {title}
                  </span>
                )}
                <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-muted">
                  <Icon className="size-3" aria-hidden />
                  {eventLabel(event)}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 break-words font-mono text-[11px] text-ink">
                {event.summary}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
