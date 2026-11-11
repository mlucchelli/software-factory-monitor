import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agents Mission Control",
  description:
    "Live view of local Claude Code sessions, sub-agents and initiatives",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-page text-ink">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
