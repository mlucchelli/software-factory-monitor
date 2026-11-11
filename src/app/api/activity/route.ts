import { recentActivity } from "@/lib/claude/transcripts";

const DEFAULT_MINUTES = 15;
const MAX_MINUTES = 120;

export async function GET(request: Request) {
  const requested = Number(
    new URL(request.url).searchParams.get("minutes") ?? DEFAULT_MINUTES,
  );
  const minutes = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), MAX_MINUTES)
    : DEFAULT_MINUTES;
  return Response.json(await recentActivity(minutes));
}
