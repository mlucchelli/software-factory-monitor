import { getAgentDetail } from "@/lib/claude/transcripts";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const detail = await getAgentDetail(id);
  if (!detail) {
    return Response.json({ error: `Agent ${id} not found` }, { status: 404 });
  }
  return Response.json(detail);
}
