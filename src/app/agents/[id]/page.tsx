import { AgentDetailView } from "@/components/agent/agent-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
      <AgentDetailView id={id} />
    </div>
  );
}
