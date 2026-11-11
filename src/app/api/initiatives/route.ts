import { listInitiatives } from "@/lib/initiatives";

export async function GET() {
  return Response.json(await listInitiatives());
}
