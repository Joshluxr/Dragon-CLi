import { getUserIdOrRedirect } from "@/lib/auth-server";
import { BillingSettings } from "@/components/settings/tab/billing";
import type { Metadata } from "next";
import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { billingInfoQueryOptions } from "@/queries/billing-queries";
import { userCreditBalanceQueryOptions } from "@/queries/user-credit-balance-queries";
import { getUserInfoServerSide } from "@terragon/shared/model/user";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Billing | Terragon",
};

export default async function BillingSettingsPage() {
  const userId = await getUserIdOrRedirect();
  // Prefetch billing status so the page has data on first render
  const queryClient = new QueryClient();
  const [userInfoServerSide] = await Promise.all([
    getUserInfoServerSide({ db, userId }),
    queryClient.prefetchQuery(billingInfoQueryOptions()),
    queryClient.prefetchQuery(userCreditBalanceQueryOptions()),
  ]);
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <BillingSettings
        hasPaymentMethod={!!userInfoServerSide.stripeCreditPaymentMethodId}
      />
    </HydrationBoundary>
  );
}
