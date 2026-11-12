/**
 * The hand-back block every agent ends with: `FIELD: value` lines, where a
 * value runs until the next known field. Pure, so the server parser and the
 * chat view read a report the same way.
 */
export const REPORT_FIELDS = [
  "AGENT",
  "MODE",
  "STATUS",
  "TICKET",
  "PR",
  "WORKTREE",
  "PREVIEW",
  "CHECKS",
  "DEVIATIONS",
  "SUMMARY",
  "QUESTIONS",
  "NEXT",
] as const;

export type ReportField = (typeof REPORT_FIELDS)[number];

const KNOWN = new Set<string>(REPORT_FIELDS);

/** Field values as written, with an empty or "-" value left out. */
export function reportFields(
  raw: string,
): Partial<Record<ReportField, string>> {
  const fields: Record<string, string> = {};
  let current: string | null = null;
  for (const line of raw.split("\n")) {
    const match = /^([A-Z]+):\s?(.*)$/.exec(line);
    if (match && KNOWN.has(match[1])) {
      current = match[1];
      fields[current] = match[2];
    } else if (current) {
      fields[current] += `\n${line}`;
    }
  }
  const out: Partial<Record<ReportField, string>> = {};
  for (const key of REPORT_FIELDS) {
    const trimmed = fields[key]?.trim();
    if (trimmed && trimmed !== "-") {
      out[key] = trimmed;
    }
  }
  return out;
}

/** A message is a report when it carries a status and at least two more fields. */
export function looksLikeReport(raw: string): boolean {
  const fields = reportFields(raw);
  return fields.STATUS !== undefined && Object.keys(fields).length >= 3;
}
