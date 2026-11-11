import type { AgentInfo, SessionInfo } from "@/lib/claude/types";
import { TEAM_ROLES } from "./mission";
import { OTHER_ROLE, ROLE_LEGEND, roleStyle, SESSION_ROLE } from "./present";

/*
 * Where the money of a crew went: by role and by ticket. Costs are the
 * per-transcript estimates from `usage.ts` (token usage at list prices), so
 * these are sums of estimates, not billed amounts.
 */

export const HELPERS_KEY = "helpers";

export interface CostSlice {
  key: string;
  label: string;
  color: string;
  costUSD: number;
  runs: number;
  outputTokens: number;
}

export interface TicketCost {
  ticket: string;
  costUSD: number;
  runs: number;
}

export interface CrewCost {
  key: string;
  title: string;
  subtitle?: string;
  totalUSD: number;
  /** Largest first; a role with no run is left out. */
  byRole: CostSlice[];
  /** Largest first; runs with no ticket are under "No ticket". */
  byTicket: TicketCost[];
}

export const NO_TICKET = "No ticket";

/** Roles in the palette's fixed order, so a role keeps its color whatever its rank. */
const SLICE_ORDER = [
  SESSION_ROLE,
  ...ROLE_LEGEND.map((role) => role.key).filter((key) => TEAM_ROLES.has(key)),
  HELPERS_KEY,
];

function sliceKey(agent: AgentInfo): string {
  return TEAM_ROLES.has(agent.type) ? agent.type : HELPERS_KEY;
}

function sliceStyle(key: string): { label: string; color: string } {
  if (key === SESSION_ROLE) {
    return { label: "Orchestrator", color: roleStyle(SESSION_ROLE).color };
  }
  if (key === HELPERS_KEY) {
    return { label: "Helpers", color: OTHER_ROLE.color };
  }
  return roleStyle(key);
}

export function crewCost(crew: {
  key: string;
  title: string;
  subtitle?: string;
  session?: SessionInfo;
  runs: AgentInfo[];
}): CrewCost {
  const slices = new Map<string, CostSlice>();
  const add = (key: string, costUSD: number, outputTokens: number) => {
    const slice = slices.get(key) ?? {
      key,
      ...sliceStyle(key),
      costUSD: 0,
      runs: 0,
      outputTokens: 0,
    };
    slice.costUSD += costUSD;
    slice.outputTokens += outputTokens;
    slice.runs += 1;
    slices.set(key, slice);
  };
  if (crew.session?.usage) {
    add(
      SESSION_ROLE,
      crew.session.usage.costUSD,
      crew.session.usage.outputTokens,
    );
  }
  const tickets = new Map<string, TicketCost>();
  for (const run of crew.runs) {
    const costUSD = run.usage?.costUSD ?? 0;
    add(sliceKey(run), costUSD, run.usage?.outputTokens ?? 0);
    const ticket = run.ticket ?? NO_TICKET;
    const entry = tickets.get(ticket) ?? { ticket, costUSD: 0, runs: 0 };
    entry.costUSD += costUSD;
    entry.runs += 1;
    tickets.set(ticket, entry);
  }
  // Equal amounts fall back to the palette order, so the table does not reshuffle between polls.
  const byRole = inPaletteOrder([...slices.values()]).sort(
    (a, b) => b.costUSD - a.costUSD,
  );
  return {
    key: crew.key,
    title: crew.title,
    subtitle: crew.subtitle,
    totalUSD: byRole.reduce((sum, slice) => sum + slice.costUSD, 0),
    byRole,
    byTicket: [...tickets.values()].sort((a, b) => b.costUSD - a.costUSD),
  };
}

/** Every crew's slices folded into one, in the palette's fixed order. */
export function costByRole(crews: CrewCost[]): CostSlice[] {
  const totals = new Map<string, CostSlice>();
  for (const slice of crews.flatMap((crew) => crew.byRole)) {
    const total = totals.get(slice.key) ?? {
      ...slice,
      costUSD: 0,
      runs: 0,
      outputTokens: 0,
    };
    total.costUSD += slice.costUSD;
    total.runs += slice.runs;
    total.outputTokens += slice.outputTokens;
    totals.set(slice.key, total);
  }
  return inPaletteOrder([...totals.values()]);
}

export function inPaletteOrder(slices: CostSlice[]): CostSlice[] {
  return [...slices].sort(
    (a, b) => SLICE_ORDER.indexOf(a.key) - SLICE_ORDER.indexOf(b.key),
  );
}

export function share(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";
}
