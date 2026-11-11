import { stat } from "node:fs/promises";
import { historyBefore } from "@/lib/claude/history";
import { readAppended } from "@/lib/claude/jsonl";
import { asRecord } from "@/lib/claude/parse";
import { streamItems } from "@/lib/claude/stream";
import { findTranscript } from "@/lib/claude/transcripts";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 1000;
const BACKFILL_BYTES = 3 * 1024 * 1024;
const BACKFILL_ITEMS = 300;
const MAX_DELTA_BYTES = 2 * 1024 * 1024;
const HEARTBEAT_EVERY_TICKS = 15;

function itemsOf(values: unknown[]) {
  return values.flatMap((value) => {
    const record = asRecord(value);
    return record ? streamItems(record) : [];
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params;
  const file = await findTranscript(decodeURIComponent(source));
  if (!file) {
    return Response.json({ error: `${source} not found` }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );

      let offset = file.size;
      const backfill = await historyBefore(
        file.path,
        file.size,
        BACKFILL_BYTES,
        BACKFILL_ITEMS,
      );
      send("items", backfill.items);
      send("cursor", { before: backfill.cursor });

      let ticks = 0;
      let busy = false;
      timer = setInterval(async () => {
        if (busy) {
          return;
        }
        busy = true;
        ticks += 1;
        try {
          const { size } = await stat(file.path);
          if (size > offset) {
            const { records, nextOffset } = await readAppended(
              file.path,
              offset,
              size,
              MAX_DELTA_BYTES,
            );
            offset = nextOffset;
            const items = itemsOf(records);
            if (items.length > 0) {
              send("items", items);
            }
          }
          if (ticks % HEARTBEAT_EVERY_TICKS === 0) {
            controller.enqueue(encoder.encode(": heartbeat\n\n"));
          }
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          busy = false;
        }
      }, POLL_INTERVAL_MS);

      request.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // The client already went away.
        }
      });
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
