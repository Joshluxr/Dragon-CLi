import { getUserCreditBreakdownAction } from "@/server-actions/credit-breakdown";
import { getServerActionQueryOptions } from "./server-action-helpers";

export const USER_CREDIT_BREAKDOWN_QUERY_KEY = [
  "user",
  "credit-breakdown",
] as const;

export function userCreditBreakdownQueryOptions() {
  return getServerActionQueryOptions({
    queryKey: USER_CREDIT_BREAKDOWN_QUERY_KEY,
    queryFn: getUserCreditBreakdownAction,
  });
}
