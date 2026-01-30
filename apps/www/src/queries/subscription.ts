import { useQuery } from "@tanstack/react-query";
import { getAccessStatus } from "@/server-actions/subscription";
import { getServerActionQueryOptions } from "./server-action-helpers";

export const ACCESS_QUERY_KEY = ["access", "hasActiveAccess"] as const;

export function accessQueryOptions() {
  return getServerActionQueryOptions({
    queryKey: ACCESS_QUERY_KEY,
    queryFn: getAccessStatus,
    // Keep data stale and refetch every 10 minutes
    staleTime: 10 * 60 * 1000, // 10 minutes
    refetchInterval: 10 * 60 * 1000, // 10 minutes
    refetchIntervalInBackground: true,
    // Revalidate when window refocuses
    refetchOnWindowFocus: true,
  });
}

export function useAccessInfo() {
  const { data } = useQuery(accessQueryOptions());
  const tier = data?.tier ?? "none";
  return {
    isActive: tier !== "none",
    tier,
  };
}
