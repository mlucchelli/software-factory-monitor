import { historyBefore } from "@/lib/claude/history";
import { findTranscript } from "@/lib/claude/transcripts";

export const dynamic = "force-dynamic";

const WINDOW_BYTES = 2 * 1024 * 1024;
const PAGE_ITEMS = 200;

/** Older stream items for one transcript, read backwards from a byte cursor. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params;
  const file = await findTranscript(decodeURIComponent(source));
  if (!file) {
    return Response.json({ error: `${source} not found` }, { status: 404 });
  }
  const before = Number(new URL(request.url).searchParams.get("before"));
  if (!Number.isFinite(before) || before < 0) {
    return Response.json(
      { error: "Expected ?before=<offset>" },
      { status: 400 },
    );
  }
  return Response.json(
    await historyBefore(
      file.path,
      Math.min(before, file.size),
      WINDOW_BYTES,
      PAGE_ITEMS,
    ),
  );
}
