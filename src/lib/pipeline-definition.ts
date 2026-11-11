/*
 * The pipeline the monitor draws: the phases of the /initiative skill and the
 * gates where it stops for you. It is parsed from the skill's own `SKILL.md`,
 * so a phase or gate added there shows up here without a code change.
 * `DEFAULT_STEPS` is what the skill in `team/` parses to; it is used when no
 * skill is installed, and a test keeps the two equal.
 *
 * No imports: the server parses with it and the browser reads its types.
 */

export interface PhaseStep {
  /** "3" for a phase, "gate-a" for a gate. */
  key: string;
  label: string;
  gate: boolean;
  /** Position on the pipeline: the phase number, or a fraction past the phase a gate closes. */
  after: number;
}

export const DEFAULT_STEPS: PhaseStep[] = [
  { key: "0", label: "Intake", gate: false, after: 0 },
  { key: "1", label: "Plan", gate: false, after: 1 },
  { key: "2", label: "Plan review", gate: false, after: 2 },
  { key: "gate-a", label: "Gate A · plan", gate: true, after: 2.5 },
  { key: "3", label: "Breakdown", gate: false, after: 3 },
  { key: "4", label: "UI preview", gate: false, after: 4 },
  { key: "gate-ui", label: "Gate UI", gate: true, after: 4.3 },
  {
    key: "gate-b",
    label: "Gate B · start development",
    gate: true,
    after: 4.6,
  },
  { key: "5", label: "Build", gate: false, after: 5 },
  { key: "6", label: "Review", gate: false, after: 6 },
  { key: "7", label: "Watch", gate: false, after: 7 },
  { key: "8", label: "Close", gate: false, after: 8 },
];

/** "## Phase 2 — Plan review (max 3 rounds)" */
const PHASE_HEADING = /^##\s+Phase\s+(\d+)\s+—\s+(.+?)\s*(?:\(.*\))?\s*$/;

/**
 * A gate is declared where a line opens with it: as a heading
 * ("## Gate B — start development") or as a step ("3. **Gate UI.** Give…",
 * "**Gate A — plan.** Show…"). A gate named mid-sentence is a mention.
 */
const GATE_LINE =
  /^(?:##\s+|\d+\.\s+)?\*{0,2}Gate\s+([A-Z]{1,3})\b(?:\s+—\s+([^.*\n]+))?/;

/**
 * Reads the steps out of the skill's markdown, in document order. Gates that
 * follow the same phase share the interval before the next one: one gate sits
 * at +0.5, two at +0.3 and +0.6. Returns null when the text has no pipeline.
 */
export function parsePipeline(markdown: string): PhaseStep[] | null {
  const found: { phase?: number; gate?: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split("\n")) {
    const phase = PHASE_HEADING.exec(line);
    if (phase) {
      found.push({ phase: Number(phase[1]), label: phase[2] });
      continue;
    }
    const gate = GATE_LINE.exec(line);
    if (gate && found.length > 0 && !seen.has(gate[1])) {
      seen.add(gate[1]);
      const detail = gate[2]?.trim();
      found.push({
        gate: gate[1],
        label: detail ? `Gate ${gate[1]} · ${detail}` : `Gate ${gate[1]}`,
      });
    }
  }
  if (found.filter((item) => item.phase !== undefined).length < 2) {
    return null;
  }

  const steps: PhaseStep[] = [];
  let lastPhase = 0;
  for (let index = 0; index < found.length; index += 1) {
    const item = found[index];
    if (item.phase !== undefined) {
      lastPhase = item.phase;
      steps.push({
        key: String(item.phase),
        label: item.label,
        gate: false,
        after: item.phase,
      });
      continue;
    }
    let first = index;
    while (first > 0 && found[first - 1].gate) {
      first -= 1;
    }
    let last = index;
    while (last + 1 < found.length && found[last + 1].gate) {
      last += 1;
    }
    const position = index - first + 1;
    const count = last - first + 1;
    steps.push({
      key: `gate-${item.gate?.toLowerCase()}`,
      label: item.label,
      gate: true,
      after: lastPhase + Math.floor((position / (count + 1)) * 10) / 10,
    });
  }
  return steps;
}

/** Where a phase line that names a gate ("Gate A — waiting…") sits on the pipeline. */
export function gatePosition(
  steps: readonly PhaseStep[],
  letters: string,
): number | undefined {
  return steps.find((step) => step.key === `gate-${letters.toLowerCase()}`)
    ?.after;
}

/** The last phase: an initiative that reached it is finished. */
export function closePhase(steps: readonly PhaseStep[]): number {
  return Math.max(...steps.map((step) => step.after));
}
