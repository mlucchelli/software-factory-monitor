import { loadPipeline } from "@/lib/claude/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await loadPipeline());
}
