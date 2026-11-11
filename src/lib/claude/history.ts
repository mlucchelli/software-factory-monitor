import { type PlacedRecord, readWindow } from "./jsonl";
import { asRecord } from "./parse";
import { streamItems } from "./stream";
import type { StreamItem } from "./types";

export interface HistoryPage {
  items: StreamItem[];
  /** Offset of the oldest record returned: pass it as `before` for the page before this one. */
  cursor: number;
}

/**
 * The last `limit` stream items that end before `before`, read from a window
 * of at most `maxBytes`. Records are kept whole, so pages never overlap or gap.
 */
export async function historyBefore(
  file: string,
  before: number,
  maxBytes: number,
  limit: number,
): Promise<HistoryPage> {
  const start = Math.max(0, before - maxBytes);
  const placed: PlacedRecord[] = await readWindow(file, start, before);
  const kept: StreamItem[][] = [];
  let count = 0;
  let cursor = before;
  for (let index = placed.length - 1; index >= 0; index -= 1) {
    const record = asRecord(placed[index].record);
    const items = record ? streamItems(record) : [];
    if (count + items.length > limit && count > 0) {
      break;
    }
    kept.unshift(items);
    count += items.length;
    cursor = placed[index].offset;
  }
  if (kept.length === placed.length && start === 0) {
    cursor = 0;
  }
  return { items: kept.flat(), cursor };
}
