"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  type CostSlice,
  type CrewCost,
  costByRole,
  crewCost,
  inPaletteOrder,
  share,
} from "@/lib/client/costs";
import { formatTokens } from "@/lib/client/mission";
import { formatUsd } from "@/lib/client/present";
import { crewRuns, useMonitorData } from "../shell/monitor-data";
import { Panel } from "../ui";

function Legend({ slices }: { slices: CostSlice[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-secondary">
      {slices.map((slice) => (
        <li key={slice.key} className="flex items-center gap-1.5">
          <span
            className="size-2 shrink-0 rounded-sm"
            style={{ background: slice.color }}
            aria-hidden
          />
          {slice.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * One bar split by role. `scale` is the amount a full-width bar stands for, so
 * bars of different crews share one axis and their lengths compare.
 */
function RoleBar({
  slices,
  total,
  scale,
}: {
  slices: CostSlice[];
  total: number;
  scale: number;
}) {
  const ordered = inPaletteOrder(slices).filter((slice) => slice.costUSD > 0);
  return (
    <div
      className="flex h-3 gap-0.5"
      style={{ width: `${scale > 0 ? (total / scale) * 100 : 0}%` }}
      role="img"
      aria-label={ordered
        .map((slice) => `${slice.label} ${formatUsd(slice.costUSD)}`)
        .join(", ")}
    >
      {ordered.map((slice) => (
        <span
          key={slice.key}
          className="h-full min-w-0.5 rounded-sm transition-opacity hover:opacity-80"
          style={{ flexGrow: slice.costUSD, background: slice.color }}
          title={`${slice.label} · ${formatUsd(slice.costUSD)} · ${share(slice.costUSD, total)} · ${slice.runs} ${slice.runs === 1 ? "run" : "runs"}`}
        />
      ))}
    </div>
  );
}

function RoleTable({ slices, total }: { slices: CostSlice[]; total: number }) {
  return (
    <table className="w-full text-xs">
      <thead className="text-left text-muted">
        <tr>
          <th className="py-1 font-normal">Role</th>
          <th className="py-1 text-right font-normal">Runs</th>
          <th className="py-1 text-right font-normal">Output</th>
          <th className="py-1 text-right font-normal">Cost</th>
          <th className="py-1 text-right font-normal">Share</th>
        </tr>
      </thead>
      <tbody>
        {slices.map((slice) => (
          <tr key={slice.key} className="border-t border-hairline">
            <td className="py-1.5">
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2 shrink-0 rounded-sm"
                  style={{ background: slice.color }}
                  aria-hidden
                />
                {slice.label}
              </span>
            </td>
            <td className="py-1.5 text-right tabular text-ink-secondary">
              {slice.runs}
            </td>
            <td className="py-1.5 text-right tabular text-ink-secondary">
              {formatTokens(slice.outputTokens)}
            </td>
            <td className="py-1.5 text-right tabular">
              {formatUsd(slice.costUSD)}
            </td>
            <td className="py-1.5 text-right tabular text-ink-secondary">
              {share(slice.costUSD, total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CrewCard({ cost, scale }: { cost: CrewCost; scale: number }) {
  const topTicket = cost.byTicket[0]?.costUSD ?? 0;
  return (
    <section
      className="rounded-xl border border-hairline bg-surface p-4"
      data-testid="crew-cost"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="min-w-0 truncate text-sm font-semibold tracking-tight">
          <Link
            href={`/?crew=${encodeURIComponent(cost.key)}`}
            className="hover:underline"
          >
            {cost.title}
          </Link>
          {cost.subtitle && (
            <span className="ml-2 font-normal text-ink-secondary">
              {cost.subtitle}
            </span>
          )}
        </h3>
        <p className="shrink-0 text-lg font-semibold tabular">
          {formatUsd(cost.totalUSD)}
        </p>
      </div>
      <div className="mt-3">
        <RoleBar slices={cost.byRole} total={cost.totalUSD} scale={scale} />
      </div>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <RoleTable slices={cost.byRole} total={cost.totalUSD} />
        <table className="w-full self-start text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th className="py-1 font-normal">Ticket</th>
              <th className="py-1 text-right font-normal">Runs</th>
              <th className="w-1/3 py-1 font-normal" />
              <th className="py-1 text-right font-normal">Cost</th>
            </tr>
          </thead>
          <tbody>
            {cost.byTicket.map((ticket) => (
              <tr key={ticket.ticket} className="border-t border-hairline">
                <td className="py-1.5 font-mono">{ticket.ticket}</td>
                <td className="py-1.5 text-right tabular text-ink-secondary">
                  {ticket.runs}
                </td>
                <td className="py-1.5 pl-3">
                  <span
                    className="block h-1.5 rounded-sm bg-[var(--ink-secondary)]"
                    style={{
                      width: `${topTicket > 0 ? (ticket.costUSD / topTicket) * 100 : 0}%`,
                    }}
                  />
                </td>
                <td className="py-1.5 text-right tabular">
                  {formatUsd(ticket.costUSD)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CostsView() {
  const { crews, snapshot } = useMonitorData();
  const costs = useMemo(
    () =>
      crews
        .map((crew) =>
          crewCost({
            key: crew.key,
            title: crew.title,
            subtitle: crew.subtitle,
            session: crew.session,
            runs: crewRuns(crew, crews),
          }),
        )
        .filter((cost) => cost.totalUSD > 0)
        .sort((a, b) => b.totalUSD - a.totalUSD),
    [crews],
  );
  const roles = useMemo(() => costByRole(costs), [costs]);
  const total = costs.reduce((sum, cost) => sum + cost.totalUSD, 0);
  const scale = costs[0]?.totalUSD ?? 0;
  const topRole = [...roles].sort((a, b) => b.costUSD - a.costUSD)[0];

  return (
    <div className="grid gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          What each initiative and each role spent, estimated from transcript
          token usage at list prices
          {snapshot
            ? `, over the last ${snapshot.windowHours} hours of sessions`
            : ""}
          . These are not billed amounts.
        </p>
      </header>

      {costs.length === 0 ? (
        <p className="rounded-xl border border-hairline bg-surface p-6 text-sm text-muted">
          {snapshot
            ? "No session with a team has token usage in this window."
            : "Loading…"}
        </p>
      ) : (
        <>
          <Panel title="All crews by role" aside={<Legend slices={roles} />}>
            <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
              <div>
                <p className="text-xs text-muted">Total</p>
                <p
                  className="text-3xl font-semibold tracking-tight tabular"
                  data-testid="total-cost"
                >
                  {formatUsd(total)}
                </p>
              </div>
              {topRole && (
                <div>
                  <p className="text-xs text-muted">Largest role</p>
                  <p className="text-lg font-semibold tracking-tight">
                    {topRole.label}{" "}
                    <span className="font-normal text-ink-secondary tabular">
                      {share(topRole.costUSD, total)}
                    </span>
                  </p>
                </div>
              )}
            </div>
            <div className="mt-4">
              <RoleBar slices={roles} total={total} scale={total} />
            </div>
            <div className="mt-4 max-w-xl">
              <RoleTable slices={roles} total={total} />
            </div>
          </Panel>

          <div className="grid gap-4">
            <h2 className="text-sm font-semibold tracking-tight">
              By initiative
              <span className="ml-2 font-normal text-muted">
                bars share one scale; the longest is {formatUsd(scale)}
              </span>
            </h2>
            {costs.map((cost) => (
              <CrewCard key={cost.key} cost={cost} scale={scale} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
