import { listRoles } from "@/lib/claude/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await listRoles());
}
