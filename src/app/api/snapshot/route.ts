import { buildSnapshot } from "@/lib/claude/transcripts";

const DEFAULT_WINDOW_HOURS = 48;
const MAX_WINDOW_HOURS = 24 * 30;

export async function GET(request: Request) {
  const requested = Number(
    new URL(request.url).searchParams.get("hours") ?? DEFAULT_WINDOW_HOURS,
  );
  const windowHours = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), MAX_WINDOW_HOURS)
    : DEFAULT_WINDOW_HOURS;
  return Response.json(await buildSnapshot(windowHours));
}
