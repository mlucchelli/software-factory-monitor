import { capturePane, sendMessage } from "@/lib/claude/tmux";
import { getSessionState } from "@/lib/claude/transcripts";
import { rejectForeignRequest } from "@/lib/server/same-origin";

export const dynamic = "force-dynamic";

const SETTLE_MS = 1200;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rejected = rejectForeignRequest(request);
  if (rejected) {
    return rejected;
  }
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    text?: string;
  } | null;
  if (typeof body?.text !== "string") {
    return Response.json({ error: "Expected { text }" }, { status: 400 });
  }

  const state = await getSessionState(id);
  const pane = state?.live?.tmuxPane;
  if (!pane) {
    return Response.json(
      { error: "The session is not running in a tmux pane" },
      { status: 409 },
    );
  }
  if (state?.live?.prompt) {
    return Response.json(
      { error: "The session is showing a question — answer it instead" },
      { status: 409 },
    );
  }
  if (state?.live?.status !== "idle") {
    return Response.json(
      {
        error: `The session is ${state?.live?.status ?? "busy"}; send when it is idle`,
      },
      { status: 409 },
    );
  }

  try {
    await sendMessage(pane, body.text);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    return Response.json({ screen: await capturePane(pane) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
