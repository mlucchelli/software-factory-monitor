import { readAppended } from "@/lib/claude/jsonl";
import { asRecord, extractEvents } from "@/lib/claude/parse";
import { listTranscripts } from "@/lib/claude/transcripts";

const POLL_INTERVAL_MS = 1500;
const HEARTBEAT_EVERY_TICKS = 10;
const MAX_DELTA_BYTES = 512 * 1024;
const WATCH_WINDOW_MS = 48 * 3_600_000;

export async function GET(request: Request) {
  const encoder = new TextEncoder();
  const offsets = new Map<string, number>();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );

      for (const file of await listTranscripts()) {
        offsets.set(file.path, file.size);
      }
      send("ready", { files: offsets.size });

      let ticks = 0;
      let busy = false;
      timer = setInterval(async () => {
        if (busy) {
          return;
        }
        busy = true;
        ticks += 1;
        try {
          const since = Date.now() - WATCH_WINDOW_MS;
          const files = await listTranscripts();
          for (const file of files) {
            const known = offsets.get(file.path);
            if (known === undefined && file.mtimeMs < since) {
              offsets.set(file.path, file.size);
              continue;
            }
            const offset = known ?? 0;
            if (file.size <= offset) {
              continue;
            }
            const { records, nextOffset } = await readAppended(
              file.path,
              offset,
              file.size,
              MAX_DELTA_BYTES,
            );
            offsets.set(file.path, nextOffset);
            const sourceId = file.agentId ?? `session:${file.sessionId}`;
            const events = records.flatMap((value) => {
              const record = asRecord(value);
              return record
                ? extractEvents(record, sourceId, file.sessionId)
                : [];
            });
            if (events.length > 0) {
              send("activity", events);
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
