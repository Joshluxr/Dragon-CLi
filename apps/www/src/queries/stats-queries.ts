import { getUsageStats } from "@/server-actions/stats";
import { getServerActionQueryOptions } from "./server-action-helpers";

export function statsQueryOptions({
  numDays,
  timezone,
}: {
  numDays: number;
  timezone: string;
}) {
  return getServerActionQueryOptions({
    queryKey: ["usage-stats", numDays, timezone],
    queryFn: () => getUsageStats({ numDays, timezone }),
  });
}
