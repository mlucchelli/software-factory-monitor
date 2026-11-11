/*
 * Parsing of an initiative registry (`~/.claude/initiatives/<KEY>/registry.md`),
 * the file the /initiative orchestrator keeps. Pure, so it is tested on its own.
 */

import {
  DEFAULT_STEPS,
  gatePosition,
  type PhaseStep,
} from "./pipeline-definition";

const AGENT_ID_PATTERN = /\ba[0-9a-f]{16}\b/g;

export interface Registry {
  key: string;
  name?: string;
  phase?: string;
  phaseNumber?: number;
  parentUrl?: string;
  agentIds: string[];
  log: string[];
  /** Sub-issues with a live preview URL recorded under "## Live previews". */
  previews: string[];
}

/** "5 — Build (R2)" gives 5; a paused initiative names the gate it stopped at instead. */
export function phaseNumberOf(
  phase: string,
  steps: readonly PhaseStep[] = DEFAULT_STEPS,
): number {
  const step = /^\d+/.exec(phase)?.[0];
  if (step) {
    return Number(step);
  }
  const gate = /\bgate\s+([a-z]{1,3})\b/i.exec(phase)?.[1];
  return (gate ? gatePosition(steps, gate) : undefined) ?? Number.NaN;
}

/** The sub-issues named in the "## Live previews" table, ignoring its header rows. */
export function previewsOf(markdown: string): string[] {
  const section =
    markdown.split(/^## Live previews\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) => line.split("|")[1]?.trim() ?? "")
    .filter((cell) => /^[A-Z]+-\d+/.test(cell));
}

export function parseRegistry(
  key: string,
  markdown: string,
  steps: readonly PhaseStep[] = DEFAULT_STEPS,
): Registry {
  const name = /^#\s+\S+\s+—\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  const phase = /^Phase:\s*(.+)$/m.exec(markdown)?.[1]?.trim();
  const parentUrl = /^Parent:\s*(\S+)/m.exec(markdown)?.[1];
  const logSection = markdown.split(/^## Log\s*$/m)[1] ?? "";
  const log = logSection
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
  const phaseNumber = phase ? phaseNumberOf(phase, steps) : Number.NaN;
  const agentIds = [...new Set(markdown.match(AGENT_ID_PATTERN) ?? [])];
  return {
    key,
    name,
    previews: previewsOf(markdown),
    phase,
    phaseNumber: Number.isFinite(phaseNumber) ? phaseNumber : undefined,
    parentUrl,
    agentIds,
    log,
  };
}

/**
 * The repositories a sub-issue touches, from its title prefix:
 * "[api] …" gives ["api"], "[api + web-app] …" gives both.
 */
export function repositoriesFromTitle(title: string): string[] {
  const prefix = /^\[([^\]]+)\]/.exec(title)?.[1];
  if (!prefix) {
    return [];
  }
  return prefix
    .split(/[+,/&]|\s+and\s+/i)
    .map((token) => token.trim())
    .filter((token) => /^[a-z0-9._-]+$/.test(token));
}

/** The release a sub-issue is slotted in, from an "R2" in its title. */
export function releaseOf(title: string): string | undefined {
  return /\bR(\d+)\b/.exec(title)?.[0];
}
