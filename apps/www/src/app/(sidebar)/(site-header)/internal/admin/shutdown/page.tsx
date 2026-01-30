import { getAdminUserOrThrow } from "@/lib/auth-server";
import { ShutdownControls } from "@/components/admin/shutdown-controls";
import { getActiveSubscriptionCount } from "@/server-actions/admin/subscriptions";

export default async function ShutdownAdminPage() {
  await getAdminUserOrThrow();
  const subscriptionCount = await getActiveSubscriptionCount();

  return <ShutdownControls initialSubscriptionCount={subscriptionCount} />;
}
