import { capturePane, parseScreenPrompt } from "@/lib/claude/tmux";
import { getSessionState } from "@/lib/claude/transcripts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const state = await getSessionState(id);
  const pane = state?.live?.tmuxPane;
  if (!state?.live) {
    return Response.json(
      { error: "This session's Claude Code process is not running" },
      { status: 404 },
    );
  }
  if (!pane) {
    return Response.json(
      {
        error: "This session is not running inside tmux",
        live: state.live,
      },
      { status: 409 },
    );
  }
  try {
    const screen = await capturePane(pane);
    return Response.json({
      live: state.live,
      screen,
      prompt: parseScreenPrompt(screen) ?? null,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
