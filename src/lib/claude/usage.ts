import { open } from "node:fs/promises";
import type { UsageStats } from "./types";

interface Price {
  input: number;
  output: number;
  cacheRead: number;
}

/** USD per million tokens, Anthropic first-party rates. Cache writes are priced off `input`. */
const PRICES: [prefix: string, price: Price][] = [
  ["claude-fable-5", { input: 10, output: 50, cacheRead: 0.25 }],
  ["claude-mythos-5", { input: 10, output: 50, cacheRead: 1 }],
  ["claude-opus-5", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-8", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-7", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4-6", { input: 5, output: 25, cacheRead: 0.5 }],
  ["claude-opus-4", { input: 15, output: 75, cacheRead: 1.5 }],
  ["claude-sonnet-5", { input: 2, output: 10, cacheRead: 0.2 }],
  ["claude-sonnet-4", { input: 3, output: 15, cacheRead: 0.3 }],
  ["claude-haiku-4", { input: 1, output: 5, cacheRead: 0.1 }],
];

const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const LARGE_WINDOW = 1_000_000;
const SMALL_WINDOW = 200_000;
const CHUNK_BYTES = 8 * 1024 * 1024;

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
}

interface ScanState {
  offset: number;
  lastMessageId?: string;
  lastMessageCost: number;
  lastMessageOutput: number;
  costUSD: number;
  outputTokens: number;
  contextTokens: number;
  peakContext: number;
  model?: string;
  toolCalls: number;
  startedAt?: number;
}

const states = new Map<string, ScanState>();

function priceOf(model: string): Price | undefined {
  return PRICES.find(([prefix]) => model.startsWith(prefix))?.[1];
}

function costOf(model: string, usage: RawUsage): number {
  const price = priceOf(model);
  if (!price) {
    return 0;
  }
  const split = usage.cache_creation;
  const write5m =
    split?.ephemeral_5m_input_tokens ?? usage.cache_creation_input_tokens ?? 0;
  const write1h = split?.ephemeral_1h_input_tokens ?? 0;
  const dollars =
    (usage.input_tokens ?? 0) * price.input +
    (usage.output_tokens ?? 0) * price.output +
    (usage.cache_read_input_tokens ?? 0) * price.cacheRead +
    write5m * price.input * CACHE_WRITE_5M +
    write1h * price.input * CACHE_WRITE_1H;
  return dollars / 1_000_000;
}

function contextOf(usage: RawUsage): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  );
}

function windowOf(model: string | undefined, peak: number): number {
  if (model?.startsWith("claude-haiku")) {
    return SMALL_WINDOW;
  }
  return peak > SMALL_WINDOW ? LARGE_WINDOW : SMALL_WINDOW;
}

function apply(state: ScanState, line: string) {
  if (!line.includes('"type":"assistant"')) {
    if (state.startedAt === undefined) {
      const timestamp = /"timestamp":"([^"]+)"/.exec(line)?.[1];
      state.startedAt = timestamp ? Date.parse(timestamp) : undefined;
    }
    return;
  }
  let record: {
    timestamp?: string;
    message?: {
      id?: string;
      model?: string;
      usage?: RawUsage;
      content?: { type?: string }[];
    };
  };
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }
  if (state.startedAt === undefined && record.timestamp) {
    state.startedAt = Date.parse(record.timestamp);
  }
  const message = record.message;
  if (Array.isArray(message?.content)) {
    state.toolCalls += message.content.filter(
      (block) => block?.type === "tool_use",
    ).length;
  }
  const usage = message?.usage;
  const model = message?.model;
  if (!usage || !model || model === "<synthetic>") {
    return;
  }
  const cost = costOf(model, usage);
  const output = usage.output_tokens ?? 0;
  // Claude Code writes one record per content block, each repeating the message's usage.
  if (message.id && message.id === state.lastMessageId) {
    state.costUSD -= state.lastMessageCost;
    state.outputTokens -= state.lastMessageOutput;
  }
  state.lastMessageId = message.id;
  state.lastMessageCost = cost;
  state.lastMessageOutput = output;
  state.costUSD += cost;
  state.outputTokens += output;
  state.model = model;
  state.contextTokens = contextOf(usage);
  state.peakContext = Math.max(state.peakContext, state.contextTokens);
}

/** Folds a transcript's appended bytes into running totals, so each byte is parsed once. */
export async function scanUsage(
  file: string,
  size: number,
): Promise<UsageStats> {
  let state = states.get(file);
  if (!state || size < state.offset) {
    state = {
      offset: 0,
      lastMessageCost: 0,
      lastMessageOutput: 0,
      costUSD: 0,
      outputTokens: 0,
      contextTokens: 0,
      peakContext: 0,
      toolCalls: 0,
    };
    states.set(file, state);
  }
  if (size > state.offset) {
    const handle = await open(file, "r");
    try {
      let chunk = CHUNK_BYTES;
      while (state.offset < size) {
        const length = Math.min(chunk, size - state.offset);
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(
          buffer,
          0,
          length,
          state.offset,
        );
        const lastNewline = buffer.subarray(0, bytesRead).lastIndexOf(0x0a);
        if (lastNewline === -1) {
          if (state.offset + bytesRead >= size) {
            break;
          }
          chunk *= 2;
          continue;
        }
        const complete = buffer.subarray(0, lastNewline);
        for (const line of complete.toString("utf8").split("\n")) {
          apply(state, line);
        }
        state.offset += lastNewline + 1;
        chunk = CHUNK_BYTES;
      }
    } finally {
      await handle.close();
    }
  }
  return {
    costUSD: state.costUSD,
    outputTokens: state.outputTokens,
    contextTokens: state.contextTokens,
    contextWindow: windowOf(state.model, state.peakContext),
    toolCalls: state.toolCalls,
    startedAt: state.startedAt,
  };
}
