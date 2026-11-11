const ANY_PREFIX = "[A-Z][A-Z0-9]{1,9}";

/** Matches the first ticket id in a text: one of the given prefixes, or any `ABC-123` shape when none is given. */
export function ticketPattern(prefixes: readonly string[]): RegExp {
  const escaped = prefixes
    .filter((prefix) => /^[A-Z][A-Z0-9]*$/.test(prefix))
    .join("|");
  return new RegExp(`\\b(?:${escaped || ANY_PREFIX})-\\d+\\b`);
}
