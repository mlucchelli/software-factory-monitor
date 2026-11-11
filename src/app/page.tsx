import { Suspense } from "react";
import { MissionControl } from "@/components/mission/mission-control";

export default function Page() {
  return (
    <Suspense>
      <MissionControl />
    </Suspense>
  );
}
