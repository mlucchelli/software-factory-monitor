"use client";

import { type ReactNode, Suspense } from "react";
import { CrewRail, useRailCollapsed } from "./crew-rail";
import { MonitorDataProvider } from "./monitor-data";

export function AppShell({ children }: { children: ReactNode }) {
  const { collapsed, toggle } = useRailCollapsed();
  return (
    <MonitorDataProvider>
      <div className="flex min-h-dvh">
        <Suspense>
          <CrewRail collapsed={collapsed} onToggle={toggle} />
        </Suspense>
        <main className="@container min-w-0 flex-1">{children}</main>
      </div>
    </MonitorDataProvider>
  );
}
