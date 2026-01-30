import { getUserCreditBalanceAction } from "@/server-actions/user-credit-balance";
import { useQuery } from "@tanstack/react-query";
import { getServerActionQueryOptions } from "./server-action-helpers";

export const USER_CREDIT_BALANCE_QUERY_KEY = [
  "user",
  "credit-balance",
] as const;

export function userCreditBalanceQueryOptions() {
  return getServerActionQueryOptions({
    queryKey: USER_CREDIT_BALANCE_QUERY_KEY,
    queryFn: getUserCreditBalanceAction,
  });
}

export function useUserCreditBalanceQuery(options?: { enabled?: boolean }) {
  return useQuery({
    ...userCreditBalanceQueryOptions(),
    enabled: options?.enabled,
  });
}
