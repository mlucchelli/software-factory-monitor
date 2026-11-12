import {
  busyReason,
  launchStatus,
  listLaunchTargets,
  planLaunch,
  reposRoot,
  runLaunch,
} from "@/lib/claude/launch";
import { parseLaunchRequest } from "@/lib/claude/launch-command";
import { demoMode } from "@/lib/config";
import { rejectForeignRequest } from "@/lib/server/same-origin";

export const dynamic = "force-dynamic";

let launching = false;

/** The launch must run the very command its preview showed, so it echoes the preview's name suffix. */
const SUFFIX = /^[0-9a-f]{4}$/;

/** Where a session may be started, and the launch in flight. Read-only. */
export async function GET() {
  return Response.json({
    root: reposRoot,
    targets: await listLaunchTargets(),
    launch: await launchStatus(),
  });
}

/**
 * The third write path: starts `claude` in a new tmux session. `preview: true`
 * returns the exact command without running anything, for the confirmation.
 */
export async function POST(request: Request) {
  const rejected = rejectForeignRequest(request);
  if (rejected) {
    return rejected;
  }
  if (demoMode) {
    return Response.json(
      { error: "Starting sessions is turned off in demo mode" },
      { status: 403 },
    );
  }
  const body = (await request.json().catch(() => null)) as {
    preview?: unknown;
    suffix?: unknown;
  } | null;
  const parsed = parseLaunchRequest(body);
  if (typeof parsed === "string") {
    return Response.json({ error: parsed }, { status: 400 });
  }
  const preview = body?.preview === true;
  const suffix = body?.suffix;
  if (!preview && (typeof suffix !== "string" || !SUFFIX.test(suffix))) {
    return Response.json(
      { error: "Confirm the command from its preview first" },
      { status: 400 },
    );
  }
  const plan = await planLaunch(
    parsed,
    preview ? undefined : (suffix as string),
  );
  if (typeof plan === "string") {
    return Response.json({ error: plan }, { status: 400 });
  }
  const shown = {
    cwd: plan.cwd,
    command: plan.command,
    tmuxName: plan.tmuxName,
    suffix: plan.suffix,
  };
  if (preview) {
    return Response.json(shown);
  }

  const busy = await busyReason();
  if (busy || launching) {
    return Response.json(
      { error: busy ?? "Another launch is starting" },
      { status: 409 },
    );
  }
  launching = true;
  try {
    await runLaunch(plan);
    return Response.json(shown, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  } finally {
    launching = false;
  }
}
