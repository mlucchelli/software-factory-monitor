import {
  captureTerminal,
  type KeyAction,
  parseScreenPrompt,
  sendAction,
} from "@/lib/claude/tmux";
import { getSessionState } from "@/lib/claude/transcripts";
import { rejectForeignRequest } from "@/lib/server/same-origin";

export const dynamic = "force-dynamic";

const SETTLE_MS = 900;

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

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
    question?: string | null;
    action?: KeyAction;
  } | null;
  if (!body?.action) {
    return fail("Expected { question, action }", 400);
  }

  const state = await getSessionState(id);
  const pane = state?.live?.terminal;
  if (!pane) {
    return fail("The session is not in a terminal the monitor can reach", 409);
  }

  try {
    const prompt = parseScreenPrompt(await captureTerminal(pane));
    if (!prompt) {
      return fail("No question is on the terminal screen anymore", 409);
    }
    if ((prompt.question ?? null) !== (body.question ?? null)) {
      return fail(
        "The terminal moved on to a different question — review it and try again",
        409,
      );
    }
    await sendAction(pane, prompt, body.action);
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
    const screen = await captureTerminal(pane);
    return Response.json({ screen, prompt: parseScreenPrompt(screen) ?? null });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 400);
  }
}
