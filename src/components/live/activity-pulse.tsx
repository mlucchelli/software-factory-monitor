"use client";

import type { ActivityEvent } from "@/lib/claude/types";
import {
  formatClock,
  OTHER_ROLE,
  ROLE_LEGEND,
  type RoleStyle,
  type SourceInfo,
  sourceRole,
} from "@/lib/client/present";

const WINDOW_MS = 5 * 60_000;
const BUCKET_MS = 10_000;
const BUCKETS = WINDOW_MS / BUCKET_MS;

export function ActivityPulse({
  events,
  sources,
  now,
}: {
  events: ActivityEvent[];
  sources: Map<string, SourceInfo>;
  now: number;
}) {
  const end = Math.ceil(now / BUCKET_MS) * BUCKET_MS;
  const start = end - WINDOW_MS;
  const knownRoles = new Set(ROLE_LEGEND.map((role) => role.key));

  const buckets = Array.from(
    { length: BUCKETS },
    () => new Map<string, number>(),
  );
  for (const event of events) {
    const time = Date.parse(event.ts);
    if (time < start || time >= end) {
      continue;
    }
    const index = Math.floor((time - start) / BUCKET_MS);
    const role = sourceRole(event, sources);
    const key = knownRoles.has(role) ? role : OTHER_ROLE.key;
    buckets[index].set(key, (buckets[index].get(key) ?? 0) + 1);
  }

  const order: RoleStyle[] = [...ROLE_LEGEND, OTHER_ROLE];
  const totals = buckets.map((bucket) =>
    [...bucket.values()].reduce((sum, count) => sum + count, 0),
  );
  const peak = Math.max(1, ...totals);
  const present = order.filter((role) =>
    buckets.some((bucket) => bucket.has(role.key)),
  );

  return (
    <div>
      <div className="mb-3 flex min-h-5 flex-wrap gap-x-4 gap-y-1">
        {present.map((role) => (
          <span
            key={role.key}
            className="inline-flex items-center gap-1.5 text-xs text-ink-secondary"
          >
            <span
              className="size-2 rounded-full"
              style={{ background: role.color }}
              aria-hidden
            />
            {role.label}
          </span>
        ))}
        {present.length === 0 && (
          <span className="text-xs text-muted">Waiting for events…</span>
        )}
      </div>

      <div className="flex h-28 items-end gap-[2px] border-b border-axis">
        {buckets.map((bucket, index) => {
          const bucketStart = start + index * BUCKET_MS;
          const total = totals[index];
          const tooltipSide = index > BUCKETS * 0.6 ? "right-0" : "left-0";
          return (
            <button
              key={bucketStart}
              type="button"
              aria-label={`${total} events at ${formatClock(new Date(bucketStart).toISOString())}`}
              className="group relative flex h-full flex-1 flex-col-reverse gap-[2px] focus:outline-none"
            >
              {order
                .filter((role) => bucket.has(role.key))
                .map((role) => (
                  <span
                    key={role.key}
                    className="w-full rounded-[2px] transition-[height] duration-500"
                    style={{
                      height: `${((bucket.get(role.key) ?? 0) / peak) * 100}%`,
                      background: role.color,
                    }}
                  />
                ))}
              {total > 0 && (
                <span
                  className={`pointer-events-none absolute bottom-full z-20 mb-2 hidden w-44 rounded-lg border border-hairline bg-surface-raised p-2 text-left shadow-xl group-hover:block group-focus:block ${tooltipSide}`}
                >
                  <span className="block font-mono text-[11px] text-muted">
                    {formatClock(new Date(bucketStart).toISOString())}
                  </span>
                  {order
                    .filter((role) => bucket.has(role.key))
                    .map((role) => (
                      <span
                        key={role.key}
                        className="mt-1 flex items-center gap-1.5 text-xs text-ink"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: role.color }}
                          aria-hidden
                        />
                        {role.label}
                        <span className="ml-auto tabular text-ink-secondary">
                          {bucket.get(role.key)}
                        </span>
                      </span>
                    ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted tabular">
        <span>-5m</span>
        <span>now</span>
      </div>
    </div>
  );
}
