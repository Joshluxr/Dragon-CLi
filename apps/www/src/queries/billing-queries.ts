import { getBillingInfoAction } from "@/server-actions/billing";
import { useQuery } from "@tanstack/react-query";
import { getServerActionQueryOptions } from "./server-action-helpers";

const BILLING_INFO_QUERY_KEY = ["billing-info"] as const;

export function billingInfoQueryOptions() {
  return getServerActionQueryOptions({
    queryKey: BILLING_INFO_QUERY_KEY,
    queryFn: getBillingInfoAction,
    // Keep fresh briefly; UI already exposes manual refresh
    staleTime: 60_000,
  });
}

export function useBillingInfoQuery() {
  return useQuery(billingInfoQueryOptions());
}
