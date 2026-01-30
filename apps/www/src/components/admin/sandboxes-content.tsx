"use client";

import { Card, CardContent } from "@/components/ui/card";
import { usePageBreadcrumbs } from "@/hooks/usePageBreadcrumbs";
import { ThreadWithUser, AdminThreadsTable } from "./threads-list";

export function SandboxesContent({
  count,
  activeThreads,
}: {
  count: number;
  activeThreads: ThreadWithUser[];
}) {
  usePageBreadcrumbs([
    { label: "Admin", href: "/internal/admin" },
    { label: "Active Sandboxes" },
  ]);
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-6xl font-bold">{count}/100</p>
            <p className="text-sm text-muted-foreground mt-2">
              Active sandboxes
            </p>
          </div>
        </CardContent>
      </Card>
      <AdminThreadsTable threads={activeThreads} />
    </div>
  );
}
