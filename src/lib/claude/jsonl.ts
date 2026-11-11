import { open } from "node:fs/promises";

const NEWLINE = 0x0a;

async function readBuffer(
  file: string,
  start: number,
  end: number,
): Promise<Buffer> {
  const length = Math.max(0, end - start);
  if (length === 0) {
    return Buffer.alloc(0);
  }
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function parseRecords(buffer: Buffer, dropFirstLine: boolean): unknown[] {
  const lines = buffer.toString("utf8").split("\n");
  if (dropFirstLine) {
    lines.shift();
  }
  const records: unknown[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    try {
      records.push(JSON.parse(line));
    } catch {
      // A line cut by the read window is skipped; it is re-read whole on the next pass.
    }
  }
  return records;
}

export async function readTail(
  file: string,
  size: number,
  maxBytes: number,
): Promise<unknown[]> {
  const start = Math.max(0, size - maxBytes);
  return parseRecords(await readBuffer(file, start, size), start > 0);
}

export async function readFirstRecord(
  file: string,
  size: number,
  maxBytes: number,
): Promise<unknown | null> {
  const buffer = await readBuffer(file, 0, Math.min(size, maxBytes));
  const end = buffer.indexOf(NEWLINE);
  const firstLine = buffer.subarray(0, end === -1 ? buffer.length : end);
  try {
    return JSON.parse(firstLine.toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * Reads complete lines appended after `offset`. Returns the offset right after the last
 * complete line, so a line still being written is picked up whole on the next call.
 */
export async function readAppended(
  file: string,
  offset: number,
  size: number,
  maxBytes: number,
): Promise<{ records: unknown[]; nextOffset: number }> {
  const start = Math.max(offset, size - maxBytes);
  const buffer = await readBuffer(file, start, size);
  const lastNewline = buffer.lastIndexOf(NEWLINE);
  if (lastNewline === -1) {
    return { records: [], nextOffset: start };
  }
  const complete = buffer.subarray(0, lastNewline + 1);
  return {
    records: parseRecords(complete, start > offset),
    nextOffset: start + complete.length,
  };
}

export interface PlacedRecord {
  /** Byte offset where the record's line starts. */
  offset: number;
  record: unknown;
}

/**
 * Reads the complete lines inside [start, end) with the offset each one starts
 * at, so a reader can page backwards from the oldest line it has shown. A line
 * cut by `start` is dropped; the caller asks for it again from an earlier start.
 */
export async function readWindow(
  file: string,
  start: number,
  end: number,
): Promise<PlacedRecord[]> {
  const buffer = await readBuffer(file, start, end);
  const placed: PlacedRecord[] = [];
  let lineStart = 0;
  if (start > 0) {
    const first = buffer.indexOf(NEWLINE);
    if (first === -1) {
      return [];
    }
    lineStart = first + 1;
  }
  while (lineStart < buffer.length) {
    const newline = buffer.indexOf(NEWLINE, lineStart);
    const lineEnd = newline === -1 ? buffer.length : newline;
    const line = buffer.subarray(lineStart, lineEnd).toString("utf8");
    if (line.trim()) {
      try {
        placed.push({ offset: start + lineStart, record: JSON.parse(line) });
      } catch {
        // A partial last line is skipped; it is read whole later.
      }
    }
    lineStart = lineEnd + 1;
  }
  return placed;
}
